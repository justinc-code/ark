import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const api = async (path, options) => {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
};

const initials = (id) => id.split(/[-_\s]/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const sessionFor = (left, right) => `chat:${[left, right].sort().join(":")}`;
const time = (timestamp) => new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(timestamp);

function Icon({ name, size = 20 }) {
  const paths = {
    ark: <><circle cx="6" cy="17" r="2.4"/><circle cx="18" cy="17" r="2.4"/><circle cx="12" cy="6" r="2.4"/><path d="M7.2 14.9 10.8 8.1M13.2 8.1l3.6 6.8M8.5 17h7"/></>,
    send: <><path d="M5 12h13"/><path d="m13 6 6 6-6 6"/></>,
    addUser: <><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.7-3.1 2.5-4.7 5.5-4.7s4.8 1.6 5.5 4.7M18 8v6M15 11h6"/></>,
    route: <><circle cx="5" cy="17" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 17h3.5a3 3 0 0 0 3-3v-5a3 3 0 0 1 3-3H17M14 15l-3.5 2L14 19"/></>,
    check: <path d="m5 12.5 4.3 4.2L19 7"/>,
    sync: <><path d="M19 7v4h-4M5 17v-4h4"/><path d="M17.5 11A6 6 0 0 0 7 7.5L5 10M6.5 13A6 6 0 0 0 17 16.5l2-2.5"/></>,
    agent: <><rect x="4" y="7" width="16" height="12" rx="4"/><path d="M12 3v4M9 13h.01M15 13h.01M8 16h8"/></>,
    user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3.1-6 7-6s6.2 2 7 6"/></>,
    database: <><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></>,
    close: <path d="m7 7 10 10M17 7 7 17"/>,
  };
  return <svg className={`icon icon-${name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Avatar({ participant, small = false }) {
  return (
    <span className={`avatar ${participant.kind} ${small ? "small" : ""}`} aria-hidden="true">
      {initials(participant.id)}
    </span>
  );
}

function InteractionMap({ current, contacts, selectedId, sending, messages, onSelect }) {
  const shown = contacts.slice(0, 6);
  const points = shown.map((contact, index) => {
    const angle = shown.length === 1 ? 0 : (index * 2 * Math.PI) / shown.length;
    return {
      ...contact,
      x: 215 + 145 * Math.cos(angle),
      y: 160 + 100 * Math.sin(angle),
    };
  });
  const active = points.find((point) => point.id === selectedId);
  const connectedIds = new Set(messages.flatMap((message) => [message.source_id, message.target_id]));

  return (
    <div className="map-card">
      <div className="panel-heading">
        <div><span className="eyebrow">ROUTE / LIVE</span><h2>Signal map</h2></div>
        <span className="live-dot">SYNC</span>
      </div>
      <svg className="interaction-map" viewBox="0 0 430 320" role="img" aria-label="Participant interaction graph">
        <defs>
          <filter id="glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        {points.filter((point) => connectedIds.has(point.id)).map((point) => (
          <g key={point.id} className={point.id === selectedId ? "map-edge active" : "map-edge"}>
            <line x1="215" y1="160" x2={point.x} y2={point.y} />
          </g>
        ))}
        {sending && active && (
          <circle key={sending} r="6" className="packet" filter="url(#glow)">
            <animate attributeName="cx" from="215" to={active.x} dur="0.7s" repeatCount="indefinite" />
            <animate attributeName="cy" from="160" to={active.y} dur="0.7s" repeatCount="indefinite" />
          </circle>
        )}
        <g className="map-node current" transform="translate(215 160)">
          <circle r="34" /><text textAnchor="middle" dy="5">{initials(current.id)}</text>
        </g>
        <text className="map-label current-label" x="215" y="211" textAnchor="middle">{current.id}</text>
        {points.map((point) => (
          <g key={point.id} onClick={() => onSelect(point.id)} className={`map-node map-contact ${point.kind} ${point.id === selectedId ? "selected" : ""}`} transform={`translate(${point.x} ${point.y})`}>
            <circle r="27" /><text textAnchor="middle" dy="5">{initials(point.id)}</text>
            <text className="map-label" x="0" y="43" textAnchor="middle">{point.id}</text>
          </g>
        ))}
      </svg>
      <div className="delivery-status">
        <span className={sending ? "status-icon sending" : "status-icon"}><Icon name={sending ? "sync" : "check"} size={17}/></span>
        <div><strong>{sending ? "Sending event" : "Graph synchronized"}</strong><small>{sending ? `Routing to ${selectedId}` : "Neo4j trace current"}</small></div>
      </div>
    </div>
  );
}

export default function App() {
  const requestedUser = new URLSearchParams(window.location.search).get("user");
  const [participants, setParticipants] = useState([]);
  const [currentId, setCurrentId] = useState(requestedUser || localStorage.getItem("ark-user") || "");
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState([]);
  const [signalMessages, setSignalMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState("");
  const [error, setError] = useState("");
  const [newUser, setNewUser] = useState("");
  const endRef = useRef(null);

  const current = participants.find((item) => item.id === currentId);
  const contacts = participants.filter((item) => item.id !== currentId);
  const selected = contacts.find((item) => item.id === selectedId) || contacts[0];
  const activeSelectedId = selected?.id || "";
  const sessionId = current && selected ? sessionFor(current.id, selected.id) : "";

  const loadParticipants = useCallback(async () => {
    try {
      let found = await api("/api/participants");
      if (requestedUser && !found.some((item) => item.id === requestedUser)) {
        await api("/api/participants", { method: "POST", body: JSON.stringify({ id: requestedUser, kind: "user" }) });
        found = await api("/api/participants");
      }
      setParticipants(found);
      setCurrentId((existing) => existing && found.some((item) => item.id === existing) ? existing : (found.find((item) => item.kind === "user") || found[0])?.id || "");
    } catch (cause) { setError(cause.message); }
  }, [requestedUser]);

  const loadMessages = useCallback(async () => {
    if (!currentId || !activeSelectedId || !sessionId) return;
    try {
      const params = new URLSearchParams({ participant_id: currentId, with: activeSelectedId, session_id: sessionId });
      setMessages(await api(`/api/messages?${params}`));
    } catch (cause) { setError(cause.message); }
  }, [currentId, activeSelectedId, sessionId]);

  const loadSignalMessages = useCallback(async () => {
    if (!currentId) return;
    try {
      const params = new URLSearchParams({ participant_id: currentId });
      setSignalMessages(await api(`/api/messages?${params}`));
    } catch (cause) { setError(cause.message); }
  }, [currentId]);

  useEffect(() => {
    const initial = window.setTimeout(loadParticipants, 0);
    return () => window.clearTimeout(initial);
  }, [loadParticipants]);
  useEffect(() => {
    const initial = window.setTimeout(loadMessages, 0);
    const timer = window.setInterval(loadMessages, 2000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [loadMessages]);
  useEffect(() => {
    const initial = window.setTimeout(loadSignalMessages, 0);
    const timer = window.setInterval(loadSignalMessages, 2000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [loadSignalMessages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  const counts = useMemo(() => Object.fromEntries(contacts.map((contact) => [
    contact.id,
    signalMessages.filter((message) => message.source_id === contact.id || message.target_id === contact.id).length,
  ])), [contacts, signalMessages]);

  const switchUser = (id) => {
    setCurrentId(id);
    setSelectedId("");
    setMessages([]);
    setSignalMessages([]);
    localStorage.setItem("ark-user", id);
    const url = new URL(window.location);
    url.searchParams.set("user", id);
    window.history.replaceState({}, "", url);
  };

  const addUser = async (event) => {
    event.preventDefault();
    try {
      const id = newUser.trim();
      if (!id) return;
      await api("/api/participants", { method: "POST", body: JSON.stringify({ id, kind: "user" }) });
      setNewUser("");
      await loadParticipants();
      switchUser(id);
    } catch (cause) { setError(cause.message); }
  };

  const send = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !current || !selected || sending) return;
    const token = crypto.randomUUID();
    setSending(token);
    setDraft("");
    setError("");
    try {
      await api("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          source_id: current.id,
          source_kind: current.kind,
          target_id: selected.id,
          target_kind: selected.kind,
          content,
          session_id: sessionId,
          trace_id: `trace:${sessionId}`,
          parent_event_id: messages.at(-1)?.event_id,
        }),
      });
      await Promise.all([loadMessages(), loadSignalMessages()]);
    } catch (cause) {
      setDraft(content);
      setError(cause.message);
    } finally { setSending(""); }
  };

  if (!current) return <main className="loading"><div className="ark-mark">A</div><p>{error || "Loading Ark graph…"}</p></main>;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="ark-mark"><Icon name="ark" size={25}/></span><div><strong>ARK <em>/ RELAY</em></strong><small>Communication trace</small></div></div>
        <label className="identity-label" htmlFor="identity">ACTIVE IDENTITY</label>
        <div className="identity-select"><Avatar participant={current} small/><select id="identity" value={currentId} onChange={(event) => switchUser(event.target.value)}>{participants.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.kind}</option>)}</select></div>
        <div className="section-title"><span>Routes</span><b>{String(contacts.length).padStart(2, "0")}</b></div>
        <nav className="contact-list">
          {contacts.map((contact, index) => <button key={contact.id} className={activeSelectedId === contact.id ? "contact active" : "contact"} onClick={() => setSelectedId(contact.id)}><span className="contact-index">{String(index + 1).padStart(2, "0")}</span><Avatar participant={contact}/><span><strong>{contact.id}</strong><small>{contact.kind}{counts[contact.id] ? ` · ${counts[contact.id]} events` : ""}</small></span><i/></button>)}
        </nav>
        <form className="add-user" onSubmit={addUser}><input aria-label="New user ID" value={newUser} onChange={(event) => setNewUser(event.target.value)} placeholder="new-user-id"/><button title="Create user" aria-label="Create user"><Icon name="addUser" size={17}/></button></form>
        <div className="neo-status"><span><Icon name="database" size={15}/></span><div><strong>Neo4j connected</strong><small>Graph persistence active</small></div></div>
      </aside>

      <section className="chat-panel">
        {selected ? <>
          <header className="chat-header"><div><Avatar participant={selected}/><span><span className="eyebrow">DIRECT CHANNEL</span><h1>{selected.id}</h1><small><Icon name={selected.kind} size={12}/> {selected.kind} endpoint online</small></span></div><code>{sessionId}</code></header>
          <div className="message-stream">
            <div className="date-rule"><span>Persistent conversation</span></div>
            {!messages.length && <div className="empty-chat"><b>01</b><span><Icon name="route" size={24}/></span><h3>Quiet channel</h3><p>Send first signal. Ark maps session, trace, transaction, causality.</p></div>}
            {messages.map((message) => {
              const own = message.source_id === current.id;
              return <article key={message.event_id} className={own ? "message own" : "message incoming"}><div className="bubble"><p>{message.content}</p><footer><span>{time(message.timestamp_ms)}</span><span title={message.event_id}>{own ? "delivered ✓" : message.source_id}</span></footer></div></article>;
            })}
            {sending && <article className="message own pending"><div className="bubble"><span className="typing"><i/><i/><i/></span><footer>sending event…</footer></div></article>}
            <div ref={endRef}/>
          </div>
          <form className="composer" onSubmit={send}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} placeholder={`Message ${selected.id}`} rows="1"/><button disabled={!draft.trim() || !!sending} aria-label="Send message"><Icon name="send" size={21}/></button><small>Enter to send · Shift + Enter for newline</small></form>
        </> : <div className="empty-chat"><h3>Add another user</h3><p>Conversation needs sender and recipient.</p></div>}
      </section>

      <aside className="graph-panel"><InteractionMap current={current} contacts={contacts} selectedId={activeSelectedId} sending={sending} messages={signalMessages} onSelect={setSelectedId}/><div className="trace-card"><span className="eyebrow">CURRENT TRACE</span><dl><div><dt>Session</dt><dd>{selected ? sessionId : "—"}</dd></div><div><dt>Events</dt><dd>{messages.length}</dd></div><div><dt>Last transaction</dt><dd>{messages.at(-1)?.transaction_id || "—"}</dd></div></dl></div></aside>
      {error && <button className="error-toast" onClick={() => setError("")}>{error}<span><Icon name="close" size={15}/></span></button>}
    </main>
  );
}
