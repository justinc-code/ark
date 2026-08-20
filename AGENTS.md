# AGENTS.md

## Project: Ark

Ark is a Rust-first, brokerless agent communication tracing system that captures agent-to-agent events and visualizes them as a Neo4j graph.

The project goal is to make multi-agent systems easier to debug, inspect, and reason about by turning messages, tool calls, replies, failures, retries, and causal chains into a queryable graph.

## Agent Operating Principles

When working in this repository, act as a precise systems-oriented engineering agent.

Prioritize:

1. Correctness over cleverness.
2. Small, testable changes over large rewrites.
3. Clear graph semantics over premature UI work.
4. Explicit event schemas over loosely structured logs.
5. Local-first developer experience.

Avoid:

1. Adding unnecessary framework abstractions.
2. Building a custom visualization UI before the data model is stable.
3. Treating messages as the only event type.
4. Introducing a central broker dependency.
5. Hiding graph writes behind unclear magic.

## Core Product Thesis

Ark is not an agent framework.

Ark is an observability and graph-tracing layer for distributed agent systems.

The central abstraction is:

```text
AgentEvent
```

Not:

```text
Message
```

This matters because agent systems generate many event types:

- Messages
- Tool calls
- Tool results
- Planner decisions
- Memory reads
- Handoffs
- Retries
- Errors
- Evaluations
- Human interventions

All of these should be representable as graph events.

## Architectural Boundaries

The repository should remain modular.

Expected crate boundaries:

```text
crates/
  ark-core/        # Shared event model, IDs, serialization
  ark-transport/   # Brokerless transport adapters
  ark-ingest/      # Event collection and validation
  ark-neo4j/       # Neo4j persistence and Cypher queries
  ark-cli/         # Local developer commands and demos
```

Do not mix transport logic, graph persistence, and CLI behavior into a single crate unless the project is still in an early prototype branch.

## Graph Model Priorities

The graph model should make these questions easy to answer:

- Which agent sent this event?
- Which agent received it?
- Which session did it belong to?
- What caused this event?
- What was the full causal chain?
- Which agents are most active?
- Where did an error originate?
- Which tool call produced this response?
- Which message triggered this retry?

Minimum graph entities:

```cypher
(:Agent)
(:Session)
(:Message)
(:ToolCall)
(:Error)
(:Evaluation)
```

Minimum relationships:

```cypher
(:Agent)-[:PARTICIPATED_IN]->(:Session)
(:Agent)-[:SENT]->(:Message)
(:Message)-[:TO]->(:Agent)
(:Message)-[:IN_SESSION]->(:Session)
(:Message)-[:CAUSED]->(:Message)
(:Agent)-[:CALLED]->(:ToolCall)
(:ToolCall)-[:RESULTED_IN]->(:Message)
```

Prefer graph semantics that preserve causality.

## Rust Engineering Standards

Use idiomatic Rust.

Required practices:

- Prefer typed structs over unstructured JSON maps.
- Use `serde` for serialization.
- Use `anyhow` for application-level errors.
- Use `thiserror` for library-level error types when helpful.
- Use `tokio` for async runtime code.
- Keep public APIs small and documented.
- Add unit tests for event normalization and graph query builders.
- Add integration tests for Neo4j writes when feasible.

Avoid:

- Global mutable state.
- Panics in library code.
- Stringly typed event handling.
- Silent event drops.
- Blocking I/O inside async paths unless isolated.

## Event Schema Guidelines

Every event should have enough metadata to reconstruct a trace.

Recommended base fields:

```rust
pub struct AgentEvent {
    pub event_id: String,
    pub session_id: String,
    pub trace_id: Option<String>,
    pub correlation_id: Option<String>,
    pub parent_event_id: Option<String>,
    pub source_agent_id: String,
    pub target_agent_id: Option<String>,
    pub event_type: EventType,
    pub content: String,
    pub timestamp_ms: i64,
}
```

Use stable IDs.

Do not rely on timestamps alone to infer ordering or causality.

## Transport Guidelines

The default transport should be brokerless and local-first.

Initial transport patterns:

```text
Agent A -> REQ socket -> Agent B REP socket
Agent process -> PUSH socket -> Ark ingest PULL socket
```

Use `REQ/REP` for the first bounded, two-agent conversation demo. Use
`PUSH/PULL` only for one-way event emission to the trace collector. Dialogue
and tracing are separate transport planes.

Future transport patterns may include:

- PUB/SUB
- REQ/REP
- DEALER/ROUTER
- In-process test transport
- File replay transport

Transport code should not know about Neo4j.

Transport code should only move typed `AgentMessage` and `AgentEvent`
payloads. It should not call an LLM or persist graph data.

## Neo4j Guidelines

Use Neo4j as the canonical trace store.

Persistence code should:

- Upsert agents.
- Upsert sessions.
- Create immutable event nodes.
- Create causal relationships when `parent_event_id` is present.
- Avoid duplicate event nodes.
- Use indexes and constraints for IDs.

Suggested constraints:

```cypher
CREATE CONSTRAINT agent_id IF NOT EXISTS
FOR (a:Agent)
REQUIRE a.id IS UNIQUE;

CREATE CONSTRAINT session_id IF NOT EXISTS
FOR (s:Session)
REQUIRE s.id IS UNIQUE;

CREATE CONSTRAINT event_id IF NOT EXISTS
FOR (e:Event)
REQUIRE e.id IS UNIQUE;
```

## CLI Guidelines

The CLI should optimize for quick local demos.

Useful commands:

```bash
ark init-db
ark ingest --bind tcp://127.0.0.1:5555
ark emit-demo
ark query session <session-id>
ark query trace <event-id>
```

The CLI should be boring, predictable, and scriptable.

## Documentation Standards

Every major feature should include:

- What problem it solves.
- How to run it locally.
- What graph shape it creates.
- Example Cypher query.
- Failure modes or limitations.

Documentation should assume the reader knows Rust basics but may not know Neo4j deeply.

## MVP Definition

The first successful version should demonstrate:

1. Two local demo agents.
2. Brokerless event emission.
3. Event ingestion in Rust.
4. Neo4j persistence.
5. Queryable agent communication graph.
6. At least one causal chain.

Do not block the MVP on a custom frontend.

Neo4j Browser is sufficient for the first visualization milestone.

## Definition of Done

A change is done when:

1. `cargo fmt --all --check` passes.
2. `cargo clippy --workspace --all-targets -- -D warnings` passes.
3. `cargo test --workspace` passes.
4. New behavior has a focused test or a documented reason why it cannot.
5. User-facing commands and limitations are documented.

A change is done when:

- It compiles.
- It has a focused test or documented manual validation path.
- It does not break the event schema.
- It preserves causal traceability.
- It updates docs when behavior changes.
