//! Validation boundary between event transport and durable storage.

use anyhow::{Context, Result};
use ark_core::AgentEvent;
use async_trait::async_trait;

/// Storage boundary kept independent from any transport implementation.
#[async_trait]
pub trait EventStore: Send + Sync {
    async fn persist_event(&self, event: &AgentEvent) -> Result<()>;
}

/// Validates every event before handing it to storage.
pub struct EventIngestor<S> {
    store: S,
}

impl<S> EventIngestor<S>
where
    S: EventStore,
{
    #[must_use]
    pub const fn new(store: S) -> Self {
        Self { store }
    }

    /// Validate and persist one event.
    ///
    /// # Errors
    ///
    /// Returns an error when validation or storage fails.
    pub async fn ingest(&self, event: AgentEvent) -> Result<()> {
        event.validate().context("event validation failed")?;
        self.store
            .persist_event(&event)
            .await
            .with_context(|| format!("failed to persist event {}", event.event_id))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use anyhow::Result;
    use ark_core::EventType;

    use super::*;

    #[derive(Default)]
    struct MemoryStore {
        event_ids: Mutex<Vec<String>>,
    }

    #[async_trait]
    impl EventStore for MemoryStore {
        async fn persist_event(&self, event: &AgentEvent) -> Result<()> {
            self.event_ids.lock().unwrap().push(event.event_id.clone());
            Ok(())
        }
    }

    #[tokio::test]
    async fn valid_event_reaches_store() {
        let ingestor = EventIngestor::new(MemoryStore::default());
        let event = AgentEvent::new("session", "agent", EventType::Message, "hello");

        ingestor.ingest(event).await.unwrap();

        assert_eq!(ingestor.store.event_ids.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn invalid_event_is_not_stored() {
        let ingestor = EventIngestor::new(MemoryStore::default());
        let event = AgentEvent::new("", "agent", EventType::Message, "hello");

        assert!(ingestor.ingest(event).await.is_err());
        assert!(ingestor.store.event_ids.lock().unwrap().is_empty());
    }
}
