//! Local HTTP API and embedded React interface for Ark conversations.

use std::net::SocketAddr;

use anyhow::{Context, Result};
use ark_core::{AgentEvent, EventType, ParticipantKind};
use ark_ingest::EventIngestor;
use ark_neo4j::{AvatarConfig, DeletedParticipant, GraphMessage, GraphParticipant, Neo4jStore};
use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(RustEmbed)]
#[folder = "../../web/dist"]
struct WebAssets;

#[derive(Clone)]
struct AppState {
    store: Neo4jStore,
}

/// Serve Ark's API and embedded React application.
///
/// # Errors
///
/// Returns an error when the bind address is invalid, Neo4j schema setup fails,
/// or the HTTP listener cannot start.
pub async fn serve(bind: &str, store: Neo4jStore) -> Result<()> {
    store
        .init_schema()
        .await
        .context("could not initialize Neo4j schema")?;
    let address: SocketAddr = bind
        .parse()
        .with_context(|| format!("invalid web bind address `{bind}`"))?;
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .with_context(|| format!("could not bind Ark web server at {bind}"))?;
    let app = Router::new()
        .route("/api/health", get(health))
        .route(
            "/api/participants",
            get(list_participants).post(create_participant),
        )
        .route(
            "/api/participants/{id}",
            axum::routing::delete(delete_participant),
        )
        .route(
            "/api/participants/{id}/avatar",
            axum::routing::put(update_participant_avatar),
        )
        .route("/api/messages", get(list_messages).post(send_message))
        .fallback(static_asset)
        .with_state(AppState { store });

    println!("Ark web listening on http://{bind}");
    axum::serve(listener, app)
        .await
        .context("Ark web server stopped unexpectedly")
}

async fn health() -> Json<Health> {
    Json(Health { status: "ok" })
}

async fn list_participants(
    State(state): State<AppState>,
) -> Result<Json<Vec<GraphParticipant>>, ApiError> {
    state
        .store
        .list_participants()
        .await
        .map(Json)
        .map_err(ApiError::store)
}

async fn create_participant(
    State(state): State<AppState>,
    Json(request): Json<CreateParticipant>,
) -> Result<(StatusCode, Json<GraphParticipant>), ApiError> {
    let participant_id = required(&request.id, "participant id")?;
    if let Some(avatar) = request.avatar {
        validate_avatar(avatar)?;
    }
    let participant = state
        .store
        .upsert_participant(participant_id, request.kind)
        .await
        .map_err(ApiError::store)?;
    let participant = if let Some(avatar) = request.avatar {
        state
            .store
            .set_participant_avatar(participant_id, avatar)
            .await
            .map_err(ApiError::store)?
            .ok_or_else(|| {
                ApiError::not_found(format!("participant `{participant_id}` was not found"))
            })?
    } else {
        participant
    };
    Ok((StatusCode::CREATED, Json(participant)))
}

async fn update_participant_avatar(
    State(state): State<AppState>,
    Path(participant_id): Path<String>,
    Json(avatar): Json<AvatarConfig>,
) -> Result<Json<GraphParticipant>, ApiError> {
    let participant_id = required(&participant_id, "participant id")?;
    validate_avatar(avatar)?;
    state
        .store
        .set_participant_avatar(participant_id, avatar)
        .await
        .map_err(ApiError::store)?
        .map(Json)
        .ok_or_else(|| ApiError::not_found(format!("participant `{participant_id}` was not found")))
}

async fn delete_participant(
    State(state): State<AppState>,
    Path(participant_id): Path<String>,
) -> Result<Json<DeletedParticipant>, ApiError> {
    let participant_id = required(&participant_id, "participant id")?;
    state
        .store
        .delete_participant(participant_id)
        .await
        .map_err(ApiError::store)?
        .map(Json)
        .ok_or_else(|| ApiError::not_found(format!("participant `{participant_id}` was not found")))
}

async fn list_messages(
    State(state): State<AppState>,
    Query(query): Query<MessageQuery>,
) -> Result<Json<Vec<GraphMessage>>, ApiError> {
    let participant_id = required(&query.participant_id, "participant_id")?;
    state
        .store
        .message_history(
            participant_id,
            non_empty(query.counterpart.as_deref()),
            non_empty(query.session_id.as_deref()),
        )
        .await
        .map(Json)
        .map_err(ApiError::store)
}

async fn send_message(
    State(state): State<AppState>,
    Json(request): Json<SendMessage>,
) -> Result<(StatusCode, Json<AgentEvent>), ApiError> {
    let source_id = required(&request.source_id, "source_id")?;
    let target_id = required(&request.target_id, "target_id")?;
    let content = required(&request.content, "content")?;
    let session_id = non_empty(request.session_id.as_deref())
        .map_or_else(|| Uuid::new_v4().to_string(), ToOwned::to_owned);
    let trace_id = non_empty(request.trace_id.as_deref())
        .map_or_else(|| Uuid::new_v4().to_string(), ToOwned::to_owned);
    let transaction_id = non_empty(request.transaction_id.as_deref())
        .map_or_else(|| Uuid::new_v4().to_string(), ToOwned::to_owned);

    state
        .store
        .upsert_participant(source_id, request.source_kind)
        .await
        .map_err(ApiError::store)?;
    state
        .store
        .upsert_participant(target_id, request.target_kind)
        .await
        .map_err(ApiError::store)?;

    let mut event = AgentEvent::new(session_id, source_id, EventType::Message, content)
        .to_participant(target_id, request.target_kind);
    event.source_participant_kind = request.source_kind;
    event.trace_id = Some(trace_id);
    event.correlation_id = Some(transaction_id);
    event.parent_event_id = request.parent_event_id.filter(|id| !id.trim().is_empty());
    EventIngestor::new(state.store)
        .ingest(event.clone())
        .await
        .map_err(ApiError::store)?;

    Ok((StatusCode::CREATED, Json(event)))
}

async fn static_asset(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let asset_path = if path.is_empty() { "index.html" } else { path };
    let asset = WebAssets::get(asset_path).or_else(|| WebAssets::get("index.html"));
    match asset {
        Some(asset) => {
            let mime = mime_guess::from_path(asset_path).first_or_octet_stream();
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime.as_ref())
                .body(Body::from(asset.data.into_owned()))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

fn required<'a>(value: &'a str, name: &str) -> Result<&'a str, ApiError> {
    non_empty(Some(value)).ok_or_else(|| ApiError::bad_request(format!("{name} is required")))
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
}

#[derive(Deserialize)]
struct CreateParticipant {
    id: String,
    #[serde(default)]
    kind: ParticipantKind,
    #[serde(default)]
    avatar: Option<AvatarConfig>,
}

#[derive(Deserialize)]
struct MessageQuery {
    participant_id: String,
    #[serde(default, rename = "with")]
    counterpart: Option<String>,
    #[serde(default)]
    session_id: Option<String>,
}

#[derive(Deserialize)]
struct SendMessage {
    source_id: String,
    #[serde(default)]
    source_kind: ParticipantKind,
    target_id: String,
    #[serde(default)]
    target_kind: ParticipantKind,
    content: String,
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    trace_id: Option<String>,
    #[serde(default)]
    transaction_id: Option<String>,
    #[serde(default)]
    parent_event_id: Option<String>,
}

struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn bad_request(message: String) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message,
        }
    }

    fn store(error: impl std::fmt::Display) -> Self {
        Self {
            status: StatusCode::BAD_GATEWAY,
            message: error.to_string(),
        }
    }

    fn not_found(message: String) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            message,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorBody {
                error: self.message,
            }),
        )
            .into_response()
    }
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

fn validate_avatar(avatar: AvatarConfig) -> Result<(), ApiError> {
    for (name, value, limit) in [
        ("skinTone", avatar.skin_tone, 1),
        ("hairStyle", avatar.hair_style, 3),
        ("hairColor", avatar.hair_color, 8),
        ("eyeColor", avatar.eye_color, 5),
        ("outfitColor", avatar.outfit_color, 7),
        ("accessory", avatar.accessory, 2),
        ("expression", avatar.expression, 2),
    ] {
        if value >= limit {
            return Err(ApiError::bad_request(format!(
                "avatar {name} must be below {limit}"
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_app_contains_index() {
        assert!(WebAssets::get("index.html").is_some());
    }

    #[test]
    fn blank_values_are_rejected() {
        assert!(required("  ", "id").is_err());
        assert_eq!(non_empty(Some(" value ")), Some("value"));
    }

    #[test]
    fn avatar_choices_are_bounded() {
        let valid = AvatarConfig {
            skin_tone: 0,
            hair_style: 2,
            hair_color: 7,
            eye_color: 4,
            outfit_color: 6,
            accessory: 1,
            expression: 1,
        };
        assert!(validate_avatar(valid).is_ok());

        assert!(validate_avatar(AvatarConfig {
            hair_style: 3,
            ..valid
        })
        .is_err());
    }
}
