//! Neo4j persistence through its transactional HTTP endpoint.

use std::{
    io::{Read, Write},
    net::TcpStream,
    time::Duration,
};

use anyhow::Result;
use ark_core::{AgentEvent, EventType, ParticipantKind};
use ark_ingest::EventStore;
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use thiserror::Error;

const CONSTRAINTS: [&str; 6] = [
    "CREATE CONSTRAINT participant_id IF NOT EXISTS FOR (p:Participant) REQUIRE p.id IS UNIQUE",
    "CREATE CONSTRAINT agent_id IF NOT EXISTS FOR (a:Agent) REQUIRE a.id IS UNIQUE",
    "CREATE CONSTRAINT session_id IF NOT EXISTS FOR (s:Session) REQUIRE s.id IS UNIQUE",
    "CREATE CONSTRAINT event_id IF NOT EXISTS FOR (e:Event) REQUIRE e.id IS UNIQUE",
    "CREATE CONSTRAINT trace_id IF NOT EXISTS FOR (t:Trace) REQUIRE t.id IS UNIQUE",
    "CREATE CONSTRAINT transaction_id IF NOT EXISTS FOR (t:Transaction) REQUIRE t.id IS UNIQUE",
];

const MIGRATIONS: [&str; 9] = [
    "MATCH (participant:Agent) SET participant:Participant, participant.kind = coalesce(participant.kind, 'agent')",
    "MATCH (participant:User) SET participant:Participant, participant.kind = coalesce(participant.kind, 'user')",
    "MATCH (source:Participant)-[:SENT]->(event:Event) SET event.source_participant_kind = coalesce(event.source_participant_kind, source.kind, 'agent') MERGE (source)-[:EMITTED]->(event)",
    "MATCH (event:Event)-[:TO]->(target:Participant) SET event.target_participant_kind = coalesce(event.target_participant_kind, target.kind, 'agent')",
    "MATCH (event:Event) WHERE event.trace_id IS NOT NULL MATCH (event)-[:IN_SESSION]->(session:Session) MERGE (trace:Trace {id: event.trace_id}) MERGE (trace)-[:IN_SESSION]->(session) MERGE (event)-[:IN_TRACE]->(trace)",
    "MATCH (event:Event) WHERE event.correlation_id IS NOT NULL MATCH (event)-[:IN_SESSION]->(session:Session) MERGE (transaction:Transaction {id: event.correlation_id}) MERGE (transaction)-[:IN_SESSION]->(session) MERGE (event)-[:IN_TRANSACTION]->(transaction)",
    "MATCH (source:Participant)-[:EMITTED]->(event:Event)-[:IN_TRANSACTION]->(transaction:Transaction) MERGE (source)-[:PARTICIPATED_IN]->(transaction)",
    "MATCH (event:Event)-[:TO]->(target:Participant), (event)-[:IN_TRANSACTION]->(transaction:Transaction) MERGE (target)-[:PARTICIPATED_IN]->(transaction)",
    "MATCH (:Participant)-[sent:SENT]->(event:Event) WHERE event.event_type <> 'message' DELETE sent",
];

/// Minimal Neo4j client focused on Ark trace operations.
#[derive(Clone)]
pub struct Neo4jStore {
    commit_url: String,
    username: String,
    password: String,
}

/// Participant summary used by application-facing interfaces.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GraphParticipant {
    pub id: String,
    pub kind: ParticipantKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<AvatarConfig>,
}

/// Persisted, bounded choices used to render a participant avatar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvatarConfig {
    pub skin_tone: u8,
    pub hair_style: u8,
    pub hair_color: u8,
    pub eye_color: u8,
    pub outfit_color: u8,
    pub accessory: u8,
    pub expression: u8,
}

/// Message projection returned without exposing Neo4j's HTTP row envelope.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GraphMessage {
    pub event_id: String,
    pub session_id: String,
    pub trace_id: Option<String>,
    pub transaction_id: Option<String>,
    pub parent_event_id: Option<String>,
    pub source_id: String,
    pub source_kind: ParticipantKind,
    pub target_id: Option<String>,
    pub target_kind: Option<ParticipantKind>,
    pub content: String,
    pub timestamp_ms: i64,
}

/// Summary returned after permanently deleting one participant trace footprint.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeletedParticipant {
    pub participant_id: String,
    pub deleted_events: i64,
}

impl Neo4jStore {
    #[must_use]
    pub fn new(base_url: &str, username: impl Into<String>, password: impl Into<String>) -> Self {
        Self {
            commit_url: format!("{}/db/neo4j/tx/commit", base_url.trim_end_matches('/')),
            username: username.into(),
            password: password.into(),
        }
    }

    /// Install uniqueness constraints required for idempotent graph writes.
    ///
    /// # Errors
    ///
    /// Returns an error when Neo4j is unavailable or rejects a constraint.
    pub async fn init_schema(&self) -> Result<(), Neo4jError> {
        for cypher in MIGRATIONS {
            self.execute(cypher, json!({})).await?;
        }
        for cypher in CONSTRAINTS {
            self.execute(cypher, json!({})).await?;
        }
        Ok(())
    }

    /// Create a participant identity or verify its existing kind.
    ///
    /// # Errors
    ///
    /// Returns an error for a conflicting kind or rejected Neo4j query.
    pub async fn upsert_participant(
        &self,
        participant_id: &str,
        kind: ParticipantKind,
    ) -> Result<GraphParticipant, Neo4jError> {
        let body = self
            .execute(
                "MERGE (participant:Participant {id: $participant_id}) \
                 ON CREATE SET participant.kind = $kind \
                 SET participant.kind = coalesce(participant.kind, $kind) \
                 FOREACH (_ IN CASE WHEN participant.kind = 'agent' THEN [1] ELSE [] END | SET participant:Agent) \
                 FOREACH (_ IN CASE WHEN participant.kind = 'user' THEN [1] ELSE [] END | SET participant:User) \
                 RETURN participant.id, participant.kind, participant.avatar_json",
                json!({
                    "participant_id": participant_id,
                    "kind": serde_json::to_value(kind)?,
                }),
            )
            .await?;
        let row = first_row(&body)?;
        let stored_kind = participant_kind(row.get(1))?;
        if stored_kind != kind {
            return Err(Neo4jError::ParticipantKindConflict {
                participant_id: participant_id.to_owned(),
                existing: stored_kind,
                requested: kind,
            });
        }
        Ok(GraphParticipant {
            id: string_column(row, 0, "participant.id")?.to_owned(),
            kind: stored_kind,
            avatar: avatar_column(row.get(2))?,
        })
    }

    /// List every known agent or user.
    ///
    /// # Errors
    ///
    /// Returns an error when Neo4j rejects the query or returns malformed rows.
    pub async fn list_participants(&self) -> Result<Vec<GraphParticipant>, Neo4jError> {
        let body = self
            .execute(
                "MATCH (participant:Participant) \
                 RETURN participant.id, participant.kind, participant.avatar_json \
                 ORDER BY participant.kind, participant.id",
                json!({}),
            )
            .await?;
        response_rows(&body)?
            .iter()
            .map(|data| {
                let row = row_values(data)?;
                Ok(GraphParticipant {
                    id: string_column(row, 0, "participant.id")?.to_owned(),
                    kind: participant_kind(row.get(1))?,
                    avatar: avatar_column(row.get(2))?,
                })
            })
            .collect()
    }

    /// Persist one participant's visual identity without changing graph events.
    ///
    /// # Errors
    ///
    /// Returns an error when Neo4j rejects the update or returns malformed rows.
    pub async fn set_participant_avatar(
        &self,
        participant_id: &str,
        avatar: AvatarConfig,
    ) -> Result<Option<GraphParticipant>, Neo4jError> {
        let avatar_json = serde_json::to_string(&avatar)?;
        let body = self
            .execute(
                "MATCH (participant:Participant {id: $participant_id}) \
                 SET participant.avatar_json = $avatar_json \
                 RETURN participant.id, participant.kind, participant.avatar_json",
                json!({
                    "participant_id": participant_id,
                    "avatar_json": avatar_json,
                }),
            )
            .await?;
        let Some(data) = response_rows(&body)?.first() else {
            return Ok(None);
        };
        let row = row_values(data)?;
        Ok(Some(GraphParticipant {
            id: string_column(row, 0, "participant.id")?.to_owned(),
            kind: participant_kind(row.get(1))?,
            avatar: avatar_column(row.get(2))?,
        }))
    }

    /// Permanently delete a participant, events they sent or received, and all
    /// relationships attached to those nodes.
    ///
    /// # Errors
    ///
    /// Returns an error when Neo4j rejects the query or returns malformed rows.
    pub async fn delete_participant(
        &self,
        participant_id: &str,
    ) -> Result<Option<DeletedParticipant>, Neo4jError> {
        let body = self
            .execute(
                participant_delete_cypher(),
                json!({ "participant_id": participant_id }),
            )
            .await?;
        let Some(data) = response_rows(&body)?.first() else {
            return Ok(None);
        };
        let row = row_values(data)?;
        Ok(Some(DeletedParticipant {
            participant_id: string_column(row, 0, "participant.id")?.to_owned(),
            deleted_events: row.get(1).and_then(Value::as_i64).ok_or_else(|| {
                Neo4jError::InvalidResponse("deleted event count is not an integer".into())
            })?,
        }))
    }

    /// Return normalized message history for one participant.
    ///
    /// # Errors
    ///
    /// Returns an error when Neo4j rejects the query or returns malformed rows.
    pub async fn message_history(
        &self,
        participant_id: &str,
        other_participant_id: Option<&str>,
        session_id: Option<&str>,
    ) -> Result<Vec<GraphMessage>, Neo4jError> {
        let body = self
            .execute(
                "MATCH (source:Participant)-[:SENT]->(message:Event:Message) \
                 OPTIONAL MATCH (message)-[:TO]->(target:Participant) \
                 WITH source, message, target \
                 WHERE (source.id = $participant_id OR target.id = $participant_id) \
                   AND ($other_participant_id IS NULL OR \
                        (source.id = $other_participant_id OR target.id = $other_participant_id)) \
                   AND ($session_id IS NULL OR message.session_id = $session_id) \
                 RETURN message.id, message.session_id, message.trace_id, \
                        message.correlation_id, message.parent_event_id, \
                        source.id, source.kind, target.id, target.kind, \
                        message.content, message.timestamp_ms \
                 ORDER BY message.timestamp_ms, message.id",
                json!({
                    "participant_id": participant_id,
                    "other_participant_id": other_participant_id,
                    "session_id": session_id,
                }),
            )
            .await?;
        response_rows(&body)?
            .iter()
            .map(|data| {
                let row = row_values(data)?;
                Ok(GraphMessage {
                    event_id: string_column(row, 0, "message.id")?.to_owned(),
                    session_id: string_column(row, 1, "message.session_id")?.to_owned(),
                    trace_id: optional_string_column(row, 2, "message.trace_id")?,
                    transaction_id: optional_string_column(row, 3, "message.correlation_id")?,
                    parent_event_id: optional_string_column(row, 4, "message.parent_event_id")?,
                    source_id: string_column(row, 5, "source.id")?.to_owned(),
                    source_kind: participant_kind(row.get(6))?,
                    target_id: optional_string_column(row, 7, "target.id")?,
                    target_kind: optional_participant_kind(row.get(8))?,
                    content: string_column(row, 9, "message.content")?.to_owned(),
                    timestamp_ms: row.get(10).and_then(Value::as_i64).ok_or_else(|| {
                        Neo4jError::InvalidResponse("message.timestamp_ms is not an integer".into())
                    })?,
                })
            })
            .collect()
    }

    async fn write_event(&self, event: &AgentEvent) -> Result<(), Neo4jError> {
        let metadata_json = serde_json::to_string(&event.metadata)?;
        let parameters = json!({
            "event_id": event.event_id,
            "session_id": event.session_id,
            "trace_id": event.trace_id,
            "correlation_id": event.correlation_id,
            "parent_event_id": event.parent_event_id,
            "source_agent_id": event.source_agent_id,
            "source_participant_kind": serde_json::to_value(event.source_participant_kind)?,
            "target_agent_id": event.target_agent_id,
            "target_participant_kind": serde_json::to_value(
                event.target_participant_kind.unwrap_or(ParticipantKind::Agent)
            )?,
            "event_type": serde_json::to_value(event.event_type)?,
            "content": event.content,
            "timestamp_ms": event.timestamp_ms,
            "metadata_json": metadata_json,
        });
        self.execute(&event_upsert_cypher(event.event_type), parameters)
            .await?;
        Ok(())
    }

    async fn execute(&self, cypher: &str, parameters: Value) -> Result<Value, Neo4jError> {
        let request = TransactionRequest {
            statements: vec![Statement {
                query: cypher,
                parameters,
                result_data_contents: ["row"],
            }],
        };
        let request_body = serde_json::to_vec(&request)?;
        let commit_url = self.commit_url.clone();
        let username = self.username.clone();
        let password = self.password.clone();
        let (status, response_body) = tokio::task::spawn_blocking(move || {
            post_json(&commit_url, &username, &password, &request_body)
        })
        .await??;
        let body: Value = serde_json::from_slice(&response_body)?;

        if !(200..300).contains(&status) {
            return Err(Neo4jError::HttpStatus { status, body });
        }

        let errors = body
            .get("errors")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if !errors.is_empty() {
            return Err(Neo4jError::Query(errors));
        }

        Ok(body)
    }
}

#[async_trait]
impl EventStore for Neo4jStore {
    async fn persist_event(&self, event: &AgentEvent) -> Result<()> {
        self.write_event(event).await.map_err(Into::into)
    }
}

#[derive(Serialize)]
struct TransactionRequest<'a> {
    statements: Vec<Statement<'a>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Statement<'a> {
    #[serde(rename = "statement")]
    query: &'a str,
    parameters: Value,
    result_data_contents: [&'static str; 1],
}

#[derive(Debug, Error)]
pub enum Neo4jError {
    #[error("Neo4j request failed: {0}")]
    Request(#[from] std::io::Error),
    #[error("could not serialize event metadata: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Neo4j returned HTTP {status}: {body}")]
    HttpStatus { status: u16, body: Value },
    #[error("Neo4j query failed: {0:?}")]
    Query(Vec<Value>),
    #[error("invalid Neo4j URL: {0}")]
    InvalidUrl(String),
    #[error("invalid HTTP response: {0}")]
    InvalidResponse(String),
    #[error("Neo4j request worker failed: {0}")]
    Worker(#[from] tokio::task::JoinError),
    #[error("participant `{participant_id}` already exists as {existing:?}, not {requested:?}")]
    ParticipantKindConflict {
        participant_id: String,
        existing: ParticipantKind,
        requested: ParticipantKind,
    },
}

fn response_rows(body: &Value) -> Result<&[Value], Neo4jError> {
    body.pointer("/results/0/data")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .ok_or_else(|| Neo4jError::InvalidResponse("Neo4j response has no result rows".into()))
}

fn row_values(data: &Value) -> Result<&[Value], Neo4jError> {
    data.get("row")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .ok_or_else(|| Neo4jError::InvalidResponse("Neo4j result has no row values".into()))
}

fn first_row(body: &Value) -> Result<&[Value], Neo4jError> {
    response_rows(body)?
        .first()
        .ok_or_else(|| Neo4jError::InvalidResponse("Neo4j query returned no rows".into()))
        .and_then(row_values)
}

fn string_column<'a>(row: &'a [Value], index: usize, name: &str) -> Result<&'a str, Neo4jError> {
    row.get(index)
        .and_then(Value::as_str)
        .ok_or_else(|| Neo4jError::InvalidResponse(format!("{name} is not a string")))
}

fn optional_string_column(
    row: &[Value],
    index: usize,
    name: &str,
) -> Result<Option<String>, Neo4jError> {
    match row.get(index) {
        Some(Value::Null) | None => Ok(None),
        Some(value) => value
            .as_str()
            .map(|value| Some(value.to_owned()))
            .ok_or_else(|| Neo4jError::InvalidResponse(format!("{name} is not a string"))),
    }
}

fn participant_kind(value: Option<&Value>) -> Result<ParticipantKind, Neo4jError> {
    let value = value
        .cloned()
        .ok_or_else(|| Neo4jError::InvalidResponse("participant kind is missing".into()))?;
    serde_json::from_value(value).map_err(Into::into)
}

fn optional_participant_kind(value: Option<&Value>) -> Result<Option<ParticipantKind>, Neo4jError> {
    match value {
        Some(Value::Null) | None => Ok(None),
        Some(value) => serde_json::from_value(value.clone())
            .map(Some)
            .map_err(Into::into),
    }
}

fn avatar_column(value: Option<&Value>) -> Result<Option<AvatarConfig>, Neo4jError> {
    match value {
        Some(Value::Null) | None => Ok(None),
        Some(Value::String(value)) => serde_json::from_str(value).map(Some).map_err(Into::into),
        Some(_) => Err(Neo4jError::InvalidResponse(
            "participant.avatar_json is not a string".into(),
        )),
    }
}

fn post_json(
    url: &str,
    username: &str,
    password: &str,
    body: &[u8],
) -> Result<(u16, Vec<u8>), Neo4jError> {
    let endpoint = HttpEndpoint::parse(url)?;
    let mut stream = TcpStream::connect((endpoint.host.as_str(), endpoint.port))?;
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;
    stream.set_write_timeout(Some(Duration::from_secs(10)))?;
    let credentials = BASE64.encode(format!("{username}:{password}"));
    write!(
        stream,
        "POST {} HTTP/1.1\r\nHost: {}:{}\r\nAuthorization: Basic {}\r\nContent-Type: application/json\r\nAccept: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        endpoint.path,
        endpoint.host,
        endpoint.port,
        credentials,
        body.len()
    )?;
    stream.write_all(body)?;
    stream.flush()?;

    let mut response = Vec::new();
    stream.read_to_end(&mut response)?;
    parse_http_response(&response)
}

struct HttpEndpoint {
    host: String,
    port: u16,
    path: String,
}

impl HttpEndpoint {
    fn parse(url: &str) -> Result<Self, Neo4jError> {
        let remainder = url
            .strip_prefix("http://")
            .ok_or_else(|| Neo4jError::InvalidUrl("only http:// URLs are supported".into()))?;
        let (authority, path) = remainder
            .split_once('/')
            .map_or((remainder, ""), |(authority, path)| (authority, path));
        let path = if path.is_empty() {
            "/".to_owned()
        } else {
            format!("/{path}")
        };
        let (host, port) = authority.rsplit_once(':').map_or_else(
            || Ok((authority.to_owned(), 80)),
            |(host, port)| {
                port.parse::<u16>()
                    .map(|port| (host.to_owned(), port))
                    .map_err(|_| Neo4jError::InvalidUrl(format!("invalid port in {url}")))
            },
        )?;
        if host.is_empty() {
            return Err(Neo4jError::InvalidUrl("host is empty".into()));
        }
        Ok(Self { host, port, path })
    }
}

fn parse_http_response(response: &[u8]) -> Result<(u16, Vec<u8>), Neo4jError> {
    let header_end = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| Neo4jError::InvalidResponse("missing header terminator".into()))?;
    let headers = std::str::from_utf8(&response[..header_end])
        .map_err(|error| Neo4jError::InvalidResponse(error.to_string()))?;
    let status = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or_else(|| Neo4jError::InvalidResponse("missing HTTP status".into()))?;
    let body = &response[header_end + 4..];
    let is_chunked = headers.lines().any(|line| {
        line.eq_ignore_ascii_case("transfer-encoding: chunked")
            || line
                .to_ascii_lowercase()
                .starts_with("transfer-encoding: chunked")
    });
    let body = if is_chunked {
        decode_chunked(body)?
    } else {
        body.to_vec()
    };
    Ok((status, body))
}

fn decode_chunked(mut input: &[u8]) -> Result<Vec<u8>, Neo4jError> {
    let mut output = Vec::new();
    loop {
        let line_end = input
            .windows(2)
            .position(|window| window == b"\r\n")
            .ok_or_else(|| Neo4jError::InvalidResponse("invalid chunk size line".into()))?;
        let size_text = std::str::from_utf8(&input[..line_end])
            .map_err(|error| Neo4jError::InvalidResponse(error.to_string()))?;
        let size = usize::from_str_radix(size_text.split(';').next().unwrap_or_default(), 16)
            .map_err(|error| Neo4jError::InvalidResponse(error.to_string()))?;
        input = &input[line_end + 2..];
        if size == 0 {
            return Ok(output);
        }
        if input.len() < size + 2 || &input[size..size + 2] != b"\r\n" {
            return Err(Neo4jError::InvalidResponse("truncated chunked body".into()));
        }
        output.extend_from_slice(&input[..size]);
        input = &input[size + 2..];
    }
}

/// Build a static-label Cypher statement from a typed event variant.
#[must_use]
pub fn event_upsert_cypher(event_type: EventType) -> String {
    let label = event_type.graph_label();
    let typed_relationship = match event_type {
        EventType::Message => "MERGE (source)-[:SENT]->(event)",
        EventType::ToolCall => "MERGE (source)-[:CALLED]->(event)",
        _ => "",
    };

    format!(
        "MERGE (event:Event {{id: $event_id}}) \
         ON CREATE SET event.session_id = $session_id, \
                       event.trace_id = $trace_id, \
                       event.correlation_id = $correlation_id, \
                       event.parent_event_id = $parent_event_id, \
                       event.source_agent_id = $source_agent_id, \
                       event.source_participant_kind = $source_participant_kind, \
                       event.target_agent_id = $target_agent_id, \
                       event.target_participant_kind = CASE WHEN $target_agent_id IS NULL THEN NULL ELSE $target_participant_kind END, \
                       event.event_type = $event_type, \
                       event.content = $content, \
                       event.timestamp_ms = $timestamp_ms, \
                       event.metadata_json = $metadata_json \
         FOREACH (_ IN CASE WHEN event.event_type = $event_type THEN [1] ELSE [] END | SET event:{label}) \
         MERGE (source:Participant {{id: event.source_agent_id}}) \
         ON CREATE SET source.kind = event.source_participant_kind \
         FOREACH (_ IN CASE WHEN source.kind = 'agent' THEN [1] ELSE [] END | SET source:Agent) \
         FOREACH (_ IN CASE WHEN source.kind = 'user' THEN [1] ELSE [] END | SET source:User) \
         MERGE (session:Session {{id: event.session_id}}) \
         MERGE (source)-[:PARTICIPATED_IN]->(session) \
         MERGE (source)-[:EMITTED]->(event) \
         MERGE (event)-[:IN_SESSION]->(session) \
         FOREACH (target_id IN CASE WHEN event.target_agent_id IS NULL THEN [] ELSE [event.target_agent_id] END | \
             MERGE (target:Participant {{id: target_id}}) \
             ON CREATE SET target.kind = event.target_participant_kind \
             FOREACH (_ IN CASE WHEN target.kind = 'agent' THEN [1] ELSE [] END | SET target:Agent) \
             FOREACH (_ IN CASE WHEN target.kind = 'user' THEN [1] ELSE [] END | SET target:User) \
             MERGE (target)-[:PARTICIPATED_IN]->(session) \
             FOREACH (transaction_id IN CASE WHEN event.correlation_id IS NULL THEN [] ELSE [event.correlation_id] END | \
                 MERGE (target_transaction:Transaction {{id: transaction_id}}) \
                 MERGE (target)-[:PARTICIPATED_IN]->(target_transaction)) \
             MERGE (event)-[:TO]->(target)) \
         WITH event, source, session \
         FOREACH (trace_id IN CASE WHEN event.trace_id IS NULL THEN [] ELSE [event.trace_id] END | \
             MERGE (trace:Trace {{id: trace_id}}) \
             MERGE (trace)-[:IN_SESSION]->(session) \
             MERGE (event)-[:IN_TRACE]->(trace)) \
         FOREACH (transaction_id IN CASE WHEN event.correlation_id IS NULL THEN [] ELSE [event.correlation_id] END | \
             MERGE (transaction:Transaction {{id: transaction_id}}) \
             MERGE (transaction)-[:IN_SESSION]->(session) \
             MERGE (event)-[:IN_TRANSACTION]->(transaction) \
             MERGE (source)-[:PARTICIPATED_IN]->(transaction)) \
         WITH event, source \
         OPTIONAL MATCH (parent:Event {{id: event.parent_event_id}}) \
         FOREACH (_ IN CASE WHEN parent IS NULL THEN [] ELSE [1] END | MERGE (parent)-[:CAUSED]->(event)) \
         FOREACH (_ IN CASE WHEN parent.event_type = 'tool_call' AND event.event_type IN ['tool_result', 'message'] THEN [1] ELSE [] END | MERGE (parent)-[:RESULTED_IN]->(event)) \
         {typed_relationship} \
         WITH event \
         OPTIONAL MATCH (child:Event {{parent_event_id: event.id}}) \
         FOREACH (_ IN CASE WHEN child IS NULL THEN [] ELSE [1] END | MERGE (event)-[:CAUSED]->(child)) \
         FOREACH (_ IN CASE WHEN event.event_type = 'tool_call' AND child.event_type IN ['tool_result', 'message'] THEN [1] ELSE [] END | MERGE (event)-[:RESULTED_IN]->(child)) \
         RETURN event.id AS event_id"
    )
}

/// Build participant deletion query without interpolating user-controlled IDs.
#[must_use]
pub const fn participant_delete_cypher() -> &'static str {
    "MATCH (participant:Participant {id: $participant_id}) \
     OPTIONAL MATCH (participant)-[:EMITTED|SENT]->(outgoing:Event) \
     WITH participant, collect(DISTINCT outgoing) AS outgoing_events \
     OPTIONAL MATCH (incoming:Event)-[:TO]->(participant) \
     WITH participant, outgoing_events, collect(DISTINCT incoming) AS incoming_events \
     WITH participant, reduce(events = [], event IN outgoing_events + incoming_events | \
         CASE WHEN event IN events THEN events ELSE events + event END) AS related_events \
     WITH participant, related_events, size(related_events) AS deleted_events, participant.id AS participant_id \
     FOREACH (event IN related_events | DETACH DELETE event) \
     DETACH DELETE participant \
     RETURN participant_id, deleted_events"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_uses_typed_label_and_causal_edges() {
        let cypher = event_upsert_cypher(EventType::Error);

        assert!(cypher.contains("SET event:Error"));
        assert!(cypher.contains("MERGE (source:Participant"));
        assert!(cypher.contains("SET source:Agent"));
        assert!(cypher.contains("SET source:User"));
        assert!(cypher.contains("MERGE (source)-[:EMITTED]->(event)"));
        assert!(cypher.contains("MERGE (event)-[:IN_TRACE]->(trace)"));
        assert!(cypher.contains("MERGE (event)-[:IN_TRANSACTION]->(transaction)"));
        assert!(cypher.contains("MERGE (parent)-[:CAUSED]->(event)"));
        assert!(cypher.contains("MERGE (event)-[:CAUSED]->(child)"));
        assert!(!cypher.contains("MERGE (source)-[:SENT]->(event)"));
    }

    #[test]
    fn message_query_adds_sent_relationship() {
        let cypher = event_upsert_cypher(EventType::Message);

        assert!(cypher.contains("MERGE (source)-[:SENT]->(event)"));
    }

    #[test]
    fn tool_call_query_adds_called_relationship() {
        let cypher = event_upsert_cypher(EventType::ToolCall);

        assert!(cypher.contains("MERGE (source)-[:CALLED]->(event)"));
        assert!(cypher.contains("MERGE (event)-[:RESULTED_IN]->(child)"));
    }

    #[test]
    fn result_query_links_existing_tool_call() {
        let cypher = event_upsert_cypher(EventType::ToolResult);

        assert!(cypher.contains("MERGE (parent)-[:RESULTED_IN]->(event)"));
    }

    #[test]
    fn constraints_cover_stable_ids() {
        for label in [
            "Participant",
            "Agent",
            "Session",
            "Event",
            "Trace",
            "Transaction",
        ] {
            assert!(CONSTRAINTS.iter().any(|query| query.contains(label)));
        }
    }

    #[test]
    fn parses_chunked_http_response() {
        let response =
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\ntest\r\n0\r\n\r\n";

        let (status, body) = parse_http_response(response).unwrap();

        assert_eq!(status, 200);
        assert_eq!(body, b"test");
    }

    #[test]
    fn participant_delete_query_removes_related_events_and_paths() {
        let cypher = participant_delete_cypher();

        assert!(cypher.contains("$participant_id"));
        assert!(cypher.contains("[:EMITTED|SENT]"));
        assert!(cypher.contains("[:TO]"));
        assert!(cypher.contains("collect(DISTINCT incoming) AS incoming_events WITH"));
        assert!(cypher.contains("outgoing_events + incoming_events"));
        assert!(cypher.contains("DETACH DELETE event"));
        assert!(cypher.contains("DETACH DELETE participant"));
    }

    #[test]
    fn avatar_config_uses_stable_camel_case_fields() {
        let avatar = AvatarConfig {
            skin_tone: 1,
            hair_style: 2,
            hair_color: 3,
            eye_color: 4,
            outfit_color: 5,
            accessory: 1,
            expression: 2,
        };

        let value = serde_json::to_value(avatar).unwrap();

        assert_eq!(value["skinTone"], 1);
        assert_eq!(value["hairStyle"], 2);
        assert_eq!(value["outfitColor"], 5);
    }
}
