//! Typed event model shared by every Ark component.

use std::collections::BTreeMap;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

/// Behaviors emitted by an agent system and preserved in its trace graph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    Message,
    ToolCall,
    ToolResult,
    PlannerDecision,
    MemoryRead,
    Handoff,
    Retry,
    Error,
    Evaluation,
    HumanIntervention,
}

/// The kind of participant at one end of an event.
///
/// `Agent` is the default so events produced before participant kinds were
/// introduced remain wire-compatible.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParticipantKind {
    #[default]
    Agent,
    User,
}

impl EventType {
    /// Neo4j label used in addition to the common `Event` label.
    #[must_use]
    pub const fn graph_label(self) -> &'static str {
        match self {
            Self::Message => "Message",
            Self::ToolCall => "ToolCall",
            Self::ToolResult => "ToolResult",
            Self::PlannerDecision => "PlannerDecision",
            Self::MemoryRead => "MemoryRead",
            Self::Handoff => "Handoff",
            Self::Retry => "Retry",
            Self::Error => "Error",
            Self::Evaluation => "Evaluation",
            Self::HumanIntervention => "HumanIntervention",
        }
    }
}

/// One immutable, causally addressable event in an agent execution.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentEvent {
    pub event_id: String,
    pub session_id: String,
    pub trace_id: Option<String>,
    pub correlation_id: Option<String>,
    pub parent_event_id: Option<String>,
    pub source_agent_id: String,
    #[serde(default)]
    pub source_participant_kind: ParticipantKind,
    pub target_agent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_participant_kind: Option<ParticipantKind>,
    pub event_type: EventType,
    pub content: String,
    pub timestamp_ms: i64,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub metadata: BTreeMap<String, Value>,
}

impl AgentEvent {
    /// Create an event with a UUID and current UTC timestamp.
    #[must_use]
    pub fn new(
        session_id: impl Into<String>,
        source_agent_id: impl Into<String>,
        event_type: EventType,
        content: impl Into<String>,
    ) -> Self {
        Self {
            event_id: Uuid::new_v4().to_string(),
            session_id: session_id.into(),
            trace_id: None,
            correlation_id: None,
            parent_event_id: None,
            source_agent_id: source_agent_id.into(),
            source_participant_kind: ParticipantKind::Agent,
            target_agent_id: None,
            target_participant_kind: None,
            event_type,
            content: content.into(),
            timestamp_ms: Utc::now().timestamp_millis(),
            metadata: BTreeMap::new(),
        }
    }

    /// Mark the source as a user rather than an autonomous agent.
    #[must_use]
    pub const fn from_user(mut self) -> Self {
        self.source_participant_kind = ParticipantKind::User;
        self
    }

    /// Set a typed destination participant.
    #[must_use]
    pub fn to_participant(
        mut self,
        participant_id: impl Into<String>,
        kind: ParticipantKind,
    ) -> Self {
        self.target_agent_id = Some(participant_id.into());
        self.target_participant_kind = Some(kind);
        self
    }

    /// Validate required identity and content fields before transport or storage.
    ///
    /// # Errors
    ///
    /// Returns [`ValidationError`] when a required field is blank or the event
    /// points to itself as its causal parent.
    pub fn validate(&self) -> Result<(), ValidationError> {
        for (field, value) in [
            ("event_id", self.event_id.as_str()),
            ("session_id", self.session_id.as_str()),
            ("source_agent_id", self.source_agent_id.as_str()),
            ("content", self.content.as_str()),
        ] {
            if value.trim().is_empty() {
                return Err(ValidationError::EmptyField(field));
            }
        }

        for (field, value) in [
            ("trace_id", self.trace_id.as_deref()),
            ("correlation_id", self.correlation_id.as_deref()),
            ("parent_event_id", self.parent_event_id.as_deref()),
            ("target_agent_id", self.target_agent_id.as_deref()),
        ] {
            if value.is_some_and(|value| value.trim().is_empty()) {
                return Err(ValidationError::EmptyField(field));
            }
        }

        if self.parent_event_id.as_deref() == Some(self.event_id.as_str()) {
            return Err(ValidationError::SelfParent);
        }

        if self.target_agent_id.is_none() && self.target_participant_kind.is_some() {
            return Err(ValidationError::TargetKindWithoutTarget);
        }

        if self.target_agent_id.as_deref() == Some(self.source_agent_id.as_str())
            && self
                .target_participant_kind
                .unwrap_or(ParticipantKind::Agent)
                != self.source_participant_kind
        {
            return Err(ValidationError::ConflictingParticipantKinds);
        }

        Ok(())
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ValidationError {
    #[error("required field `{0}` is empty")]
    EmptyField(&'static str),
    #[error("event cannot be its own parent")]
    SelfParent,
    #[error("target participant kind requires a target participant ID")]
    TargetKindWithoutTarget,
    #[error("one participant ID cannot be both an agent and a user")]
    ConflictingParticipantKinds,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_type_serializes_stably() {
        assert_eq!(
            serde_json::to_string(&EventType::ToolCall).unwrap(),
            r#""tool_call""#
        );
    }

    #[test]
    fn validation_rejects_self_parent() {
        let mut event = AgentEvent::new("session", "agent", EventType::Retry, "retry");
        event.parent_event_id = Some(event.event_id.clone());

        assert_eq!(event.validate(), Err(ValidationError::SelfParent));
    }

    #[test]
    fn validation_rejects_blank_optional_ids() {
        let mut event = AgentEvent::new("session", "agent", EventType::Message, "hello");
        event.correlation_id = Some("  ".into());

        assert_eq!(
            event.validate(),
            Err(ValidationError::EmptyField("correlation_id"))
        );
    }

    #[test]
    fn validation_rejects_kind_without_target() {
        let mut event = AgentEvent::new("session", "agent", EventType::Message, "hello");
        event.target_participant_kind = Some(ParticipantKind::User);

        assert_eq!(
            event.validate(),
            Err(ValidationError::TargetKindWithoutTarget)
        );
    }

    #[test]
    fn participant_kinds_are_backward_compatible() {
        let event: AgentEvent = serde_json::from_value(serde_json::json!({
            "event_id": "event-1",
            "session_id": "session-1",
            "source_agent_id": "agent-a",
            "target_agent_id": "agent-b",
            "event_type": "message",
            "content": "hello",
            "timestamp_ms": 1
        }))
        .unwrap();

        assert_eq!(event.source_participant_kind, ParticipantKind::Agent);
        assert_eq!(event.target_participant_kind, None);
    }

    #[test]
    fn user_participants_serialize_explicitly() {
        let event = AgentEvent::new("session", "user-1", EventType::Message, "hello")
            .from_user()
            .to_participant("agent-1", ParticipantKind::Agent);
        let value = serde_json::to_value(event).unwrap();

        assert_eq!(value["source_participant_kind"], "user");
        assert_eq!(value["target_participant_kind"], "agent");
    }
}
