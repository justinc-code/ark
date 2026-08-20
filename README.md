# Ark

Ark is a local React chat for agents and users. A Rust API persists every
message, participant, session, trace, transaction, and causal link in Neo4j.
Neo4j remains storage; Ark's web interface is the product surface.

## Run

Prerequisites: Rust, Node.js, npm, Docker.

```bash
docker compose up -d
npm install --prefix web
npm run build --prefix web
cargo install --path crates/ark-cli
ark web
```

Open <http://127.0.0.1:8080>.

Open a specific identity directly:

```text
http://127.0.0.1:8080/?user=<user-id>
```

Unknown IDs from this URL are created as user participants. Choose another
participant under Participants, then send messages. The project/session rail
groups real Neo4j conversations while the Causal descent workspace lays their
events across participant lanes. Selecting an event exposes its immutable IDs,
participants, trace coordinates, and explicit parent chain in the inspector.
The conversation remains available in a collapsible lower drawer.

Participants appear as deterministic walking avatars directly on the trace
plane. Every participant identity is a capybara with a stable orange, folded
onsen towel, or egg on its head. Each look derives from the stable participant
ID, and new user apparel is persisted when the identity is created.
Large traces use a scrollable event plane and comfortable or compact density
controls rather than shrinking every event into a single viewport. A searchable
participant list remains available as the accessible navigation path.
The timeline reserves fixed identity slots so capybaras and other avatars stay
visible without covering lane labels. Events use envelope markers; the selected
message travels its actual curved sender-to-recipient path, while a live packet
shows an in-flight request.

Route removal is identity-specific and local to the browser. It hides the
route without deleting participants, events, or causal history from Neo4j.
Use **Restore hidden routes** in the sidebar to bring hidden routes back.

Active identity deletion is permanent. Its two-step sidebar control deletes
the participant, events they sent or received, and every relationship attached
to those nodes. Ark requires one other identity to remain so the interface can
switch to a valid identity after deletion.

Creating a user saves it and its capybara apparel immediately. Avatar editing
remains intentionally unavailable in the UI.

Neo4j settings:

```bash
ARK_NEO4J_URL=http://127.0.0.1:7474
ARK_NEO4J_USER=neo4j
ARK_NEO4J_PASSWORD=password
```

Matching `--neo4j-url`, `--neo4j-user`, and `--neo4j-password` flags are also
available. `ark web` initializes and upgrades the Neo4j schema automatically.

## Graph shape

Each web message creates:

```text
(source:Participant:Agent|User)-[:EMITTED]->(event:Event:Message)
              └───────────────[:SENT]───────┘       │        │
                                                    │        └─[:TO]->(target:Participant:Agent|User)
                                                    ├─[:IN_SESSION]->(session:Session)
                                                    ├─[:IN_TRACE]->(trace:Trace)
                                                    └─[:IN_TRANSACTION]->(transaction:Transaction)
(parent:Event)-[:CAUSED]->(event)
```

Stable event IDs make writes idempotent. `parent_event_id` preserves causal
order. Both endpoints link to their session and transaction with
`PARTICIPATED_IN`.

## Web API

```text
GET  /api/health
GET  /api/participants
POST /api/participants
DELETE /api/participants/<id>
PUT /api/participants/<id>/avatar
GET  /api/messages?participant_id=<id>&with=<id>&session_id=<id>
POST /api/messages
```

The React application and API share one origin. Neo4j credentials never reach
the browser.

## Development

Run frontend separately with hot reload:

```bash
npm install --prefix web
npm run dev --prefix web
```

Run the Rust API on port 8080; Vite proxies `/api` to it:

```bash
cargo run -- web
```

Production checks:

```bash
npm run lint --prefix web
npm run build --prefix web
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

## Limits

- Web server binds to `127.0.0.1:8080` by default.
- Authentication and authorization are not implemented. Do not expose it on a
  public interface.
- Neo4j HTTP adapter currently supports `http://`, not HTTPS.
- Message updates use two-second polling rather than WebSockets.
- Participant IDs are globally unique across agents and users.
