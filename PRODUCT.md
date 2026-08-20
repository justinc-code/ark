# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Ark is for developers who need to communicate with one another around multi-agent systems and visualize the agentic calls those systems produce. They use it while building, debugging, and reasoning about distributed agent behavior.

## Product Purpose

Ark tracks the layers of multi-agent communication and turns agent activity into a queryable causal graph. It exists to make messages, tool calls, results, failures, retries, decisions, and interventions easier to inspect and explain. Success means a developer can reconstruct what happened, which participants were involved, and what caused each event without inferring causality from timestamps or loose logs.

The web chat is an operating and demonstration surface for the tracing system, not Ark's defining product boundary.

## Positioning

Ark is a Rust-first, brokerless observability and graph-tracing layer rather than an agent framework. Its central abstraction is a typed, immutable `AgentEvent`, not a message. Stable event IDs and explicit parent links preserve causality, while Neo4j makes participants, sessions, traces, transactions, and event relationships directly queryable.

## Operating Context

Ark is local-first. Developers run a Rust API and CLI, a React web surface, and Neo4j. The current web experience supports conversations between user and agent participants, persists their activity, and visualizes live routes and graph synchronization. Neo4j Browser remains an acceptable graph-inspection surface while Ark's data model matures.

Dialogue and tracing are separate transport planes: bounded agent conversation uses request/reply semantics, while one-way trace emission uses push/pull semantics.

## Capabilities and Constraints

- The shared event model represents messages, tool calls, tool results, planner decisions, memory reads, handoffs, retries, errors, evaluations, and human interventions.
- Every traceable event carries a stable event ID, session ID, source participant, event type, content, timestamp, and optional trace, correlation, parent, and target identifiers.
- Neo4j is the canonical trace store. Writes must be idempotent, event nodes immutable, and causal relationships explicit.
- Transport remains brokerless and must move typed payloads without knowing about Neo4j, invoking an LLM, or persisting graph data.
- The Rust workspace keeps the event model, ingestion, Neo4j persistence, HTTP/web behavior, and CLI responsibilities modular.
- The current implemented web path primarily persists message events; broader event transport and inspection remain product direction rather than completed UI behavior.
- The current server is local-only: it has no authentication or authorization, uses polling rather than WebSockets, and its Neo4j HTTP adapter does not support HTTPS.
- A custom graph-visualization frontend must not block the MVP; clear graph semantics take priority over premature UI breadth.

## Brand Commitments

The product name is **Ark**. Product language should be precise, systems-oriented, and useful to developers without assuming deep Neo4j knowledge. The current Japanese forest, onsen, and storybook-creature interface is replaceable styling, not a durable part of Ark's identity.

## Evidence on Hand

- `AGENTS.md` defines the event-first product thesis, graph semantics, architecture, MVP, and engineering constraints.
- `crates/ark-core/src/lib.rs` implements the typed `AgentEvent` model and event taxonomy.
- `crates/ark-ingest` and `crates/ark-neo4j` provide ingestion and canonical graph persistence.
- `crates/ark-web/src/lib.rs` and `web/src/App.jsx` provide the current local API, chat, participant management, and signal-map surface.
- `README.md` documents the runnable local workflow, graph shape, API, and current limitations.
- No customer testimonials, adoption figures, performance benchmarks, or public-deployment claims are established; future product surfaces must not fabricate them.

## Product Principles

1. Preserve explicit causality through stable IDs and parent relationships.
2. Model the full agent event stream, not messages alone.
3. Keep tracing brokerless, local-first, and independent of any agent framework.
4. Favor typed schemas and transparent graph writes over implicit behavior.
5. Stabilize graph semantics before expanding custom visualization work.
