# SKILLS.md

## Purpose

This file defines the practical skills, conventions, and workflows needed to work effectively on Ark.

Ark combines Rust systems programming, brokerless messaging, graph modeling, and agent observability.

## Skill 1: Rust Workspace Development

Use Cargo workspaces to keep the project modular.

Expected workspace layout:

```text
ark/
  Cargo.toml
  crates/
    ark-core/
    ark-transport/
    ark-ingest/
    ark-neo4j/
    ark-cli/
```

Common commands:

```bash
cargo check --workspace
cargo test --workspace
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
```

When adding a new crate:

```bash
cargo new crates/ark-core --lib
cargo new crates/ark-cli --bin
```

Then register it in the root `Cargo.toml`.

## Skill 2: Event Modeling

Model agent behavior as structured events.

Do not start with ad hoc logs.

Good event types:

```rust
pub enum EventType {
    Message,
    ToolCall,
    ToolResult,
    Thought,
    Handoff,
    Retry,
    Error,
    Evaluation,
}
```

Every event should support trace reconstruction.

Required fields:

```text
event_id
session_id
source_agent_id
event_type
timestamp_ms
```

Recommended fields:

```text
target_agent_id
trace_id
correlation_id
parent_event_id
content
metadata
```

Rules:

- `event_id` uniquely identifies one event.
- `session_id` groups a workflow or conversation.
- `trace_id` groups a causal execution path.
- `parent_event_id` creates a causal edge.
- `correlation_id` links request/response pairs.

## Skill 3: Brokerless Messaging

Ark should use brokerless communication patterns.

Initial patterns:

```text
REQ -> REP       # bounded two-agent dialogue
PUSH -> PULL     # one-way events sent to trace collector
```

Useful for:

- Two agents exchanging request/reply messages directly.
- Agents emitting events to one local collector.
- Simple ingestion demos.
- Low-friction local development.

Future patterns:

```text
PUB -> SUB
REQ -> REP
DEALER -> ROUTER
```

Transport rules:

- Transport code should not depend on Neo4j.
- Transport code should transmit typed `AgentMessage` or `AgentEvent` values.
- Keep dialogue traffic separate from trace traffic.
- Failed sends should be explicit.
- The ingest path should validate received events before persistence.

## Skill 4: Neo4j Graph Persistence

Neo4j should store agents, sessions, events, and relationships.

Recommended node labels:

```cypher
:Agent
:Session
:Event
:Message
:ToolCall
:Error
:Evaluation
```

Recommended relationships:

```cypher
(:Agent)-[:SENT]->(:Event)
(:Event)-[:TO]->(:Agent)
(:Event)-[:IN_SESSION]->(:Session)
(:Event)-[:CAUSED]->(:Event)
(:Agent)-[:CALLED]->(:ToolCall)
(:ToolCall)-[:RESULTED_IN]->(:Event)
```

Use constraints:

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

Persistence rules:

- Use `MERGE` for agents and sessions.
- Use unique IDs to prevent duplicate events.
- Do not infer causality from timestamps.
- Create `CAUSED` only when `parent_event_id` is present.
- Keep raw event metadata when useful for debugging.

## Skill 5: Cypher Querying

Use Cypher to validate the graph model before building a custom frontend.

Find all messages in a session:

```cypher
MATCH (s:Session {id: $session_id})<-[:IN_SESSION]-(e:Event)
RETURN e
ORDER BY e.timestamp_ms;
```

Find communication between agents:

```cypher
MATCH (a1:Agent)-[:SENT]->(e:Event)-[:TO]->(a2:Agent)
RETURN a1, e, a2
ORDER BY e.timestamp_ms;
```

Find causal trace from a root event:

```cypher
MATCH path = (root:Event {id: $event_id})-[:CAUSED*0..]->(next:Event)
RETURN path;
```

Find most active agents:

```cypher
MATCH (a:Agent)-[:SENT]->(e:Event)
RETURN a.id AS agent_id, count(e) AS events_sent
ORDER BY events_sent DESC;
```

Find errors and their causes:

```cypher
MATCH path = (cause:Event)-[:CAUSED*0..]->(err:Error)
RETURN path;
```

## Skill 6: Local Development with Docker

Use Docker Compose for Neo4j.

Minimal `docker-compose.yml`:

```yaml
services:
  neo4j:
    image: neo4j:5
    container_name: ark-neo4j
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      NEO4J_AUTH: neo4j/password
    volumes:
      - neo4j_data:/data

volumes:
  neo4j_data:
```

Run:

```bash
docker compose up -d
```

Open Neo4j Browser:

```text
http://localhost:7474
```

Default local credentials:

```text
username: neo4j
password: password
```

## Skill 7: CLI Design

The CLI should support local development and demos.

Suggested commands:

```bash
ark init-db
ark ingest --bind tcp://127.0.0.1:5555
ark emit-demo
ark query session <session-id>
ark query trace <event-id>
```

CLI principles:

- Commands should be scriptable.
- Errors should be readable.
- Defaults should work locally.
- Output should support both human-readable and JSON modes eventually.

## Skill 8: Testing Strategy

Test the system in layers.

Unit tests:

- Event serialization
- Event validation
- ID handling
- Cypher query construction
- Transport encoding/decoding

Integration tests:

- Neo4j connection
- Constraint creation
- Event upsert
- Relationship creation
- Causal chain reconstruction

Manual smoke test:

```bash
docker compose up -d
cargo run -p ark-cli -- init-db
cargo run -p ark-cli -- ingest --bind tcp://127.0.0.1:5555
cargo run -p ark-cli -- emit-demo
```

Then verify in Neo4j Browser:

```cypher
MATCH p = (:Agent)-[:SENT]->(:Event)-[:TO]->(:Agent)
RETURN p;
```

## Skill 9: Documentation

Document graph behavior with examples.

Each feature should include:

- Purpose
- Example event payload
- Resulting graph shape
- Example Cypher query
- Known limitations

Prefer concise Markdown files in `docs/`.

Suggested docs:

```text
docs/
  protocol.md
  graph-model.md
  local-development.md
  examples.md
  roadmap.md
```

## Skill 10: MVP Discipline

Build in this order:

1. Event model.
2. Local demo event emitter.
3. Brokerless ingest socket.
4. Neo4j writer.
5. Cypher validation queries.
6. CLI polish.
7. Custom visualization later.

Do not build a frontend before the graph model is useful.

Do not support every transport pattern at once.

Do not make the project an agent framework.

## Skill 11: Useful First Issues

Good initial GitHub issues:

```text
Define AgentEvent schema
Create Cargo workspace
Add Neo4j Docker Compose setup
Implement init-db command
Implement PUSH/PULL event transport
Write two-agent ping/pong example
Persist events to Neo4j
Add causal chain query
Document graph model
```

## Skill 12: Quality Checklist

Before merging a change, verify:

```text
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Also check:

- Does this preserve traceability?
- Does this keep the graph model clear?
- Does this avoid coupling transport to persistence?
- Does this improve the local developer experience?
- Does documentation need to be updated?
