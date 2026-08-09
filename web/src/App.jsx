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

const sessionFor = (left, right) => `chat:${[left, right].sort().join(":")}`;
const routeKey = (source, target) => `${encodeURIComponent(source)}→${encodeURIComponent(target)}`;
const time = (timestamp) => new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(timestamp);

const creatureTypes = [
  { name: "capybara", body: "#9b704e", shadow: "#5f4433", belly: "#c99c70" },
  { name: "forest guardian", body: "#687973", shadow: "#3d4b47", belly: "#d8d1b5" },
  { name: "fuzzy star sprite", body: "#323b3a", shadow: "#161c1b", belly: "#65706b" },
];

const creatureSeed = (id) => [...id].reduce((total, character) => ((total * 31) + character.codePointAt(0)) >>> 0, 7);
const creatureLook = (participant) => {
  const hash = creatureSeed(participant.id);
  const variant = hash % creatureTypes.length;
  return { ...creatureTypes[variant], variant, pupilShift: (Math.floor(hash / 13) % 3) - 1 };
};

function AvatarPortrait({ participant }) {
  const look = creatureLook(participant);
  const eyeY = look.variant === 1 ? 20.5 : 23;
  const eyeRadiusX = look.variant === 1 ? 2.3 : 3.5;
  const eyeRadiusY = look.variant === 1 ? 2.5 : 4.1;
  const pupilRadius = look.variant === 1 ? .85 : 1.2;
  const style = { "--creature-body": look.body, "--creature-shadow": look.shadow, "--creature-belly": look.belly };
  return (
    <svg className="avatar-portrait" style={style} viewBox="0 0 48 48" focusable="false" aria-hidden="true">
      <ellipse className="creature-depth" cx="24" cy="43.5" rx="14" ry="3.2" />
      {look.variant === 0 && <><path className="creature-body" d="M6 31c0-10 6-16 16-17h6c2-5 6-8 10-6 4 2 5 6 5 10 4 1 6 4 5 8-1 4-5 6-10 7l-3 5c-1 3-5 4-7 1-3 3-7 2-8-1h-7c-2 3-6 2-7 0-3-1-4-4-4-7Z"/><circle className="creature-ear" cx="36" cy="11" r="4"/><circle className="creature-fruit" cx="31" cy="7" r="4"/><path className="creature-fruit-leaf" d="M31 3c0-3 2-4 5-3-1 3-3 4-5 3Z"/><circle className="creature-profile-eye" cx="37" cy="18" r="1.5"/><path className="creature-profile-face" d="m44 21 1 5m-3-5 2 2-2 2M34 29q3 2 6 0"/><path className="creature-fur-mark" d="m11 23 2-1m-3 4 2-1m15 9 1-2m2 3 1-2"/></>}
      {look.variant === 1 && <><path className="creature-ear" d="M16 14C8 11 7 5 8 2c5 1 9 5 11 11Zm16 0c8-3 9-9 8-12-5 1-9 5-11 11Z"/><path className="creature-body" d="M24 8c8 0 11 5 12 11 4 4 4 9 1 12 1 8-5 12-13 12S10 39 11 31c-3-3-3-8 1-12 1-6 4-11 12-11Z"/><ellipse className="creature-belly" cx="24" cy="34" rx="9" ry="8"/><path className="creature-pattern" d="m18 33 3-2 3 2 3-2 3 2m-9 4 3-2 3 2"/></>}
      {look.variant === 2 && <path className="creature-body" d="m24 5 3.2 3 4.4-1 1.1 4.4 4.2 1.7-1.3 4.3 3.2 3-2.8 3.5 1.5 4.2-4 1.9-.3 4.5-4.5.3-2.4 3.8-3.8-2.4-4.3 1.3-1.6-4.2-4.5-.6.5-4.5-3.6-2.6 2.5-3.7-2-4 4.2-1.8.2-4.5 4.5.1Z"/>}
      {look.variant === 1 && <path className="creature-top-leaf" d="M24 9C18 7 16 3 17 0c5 1 8 4 8 8 3-4 6-5 9-4-2 4-5 6-10 5Z"/>}
      {look.variant === 2 && <path className="creature-top-star" d="m24 0 1.7 3.4 3.8.6-2.8 2.6.7 3.8L24 8.6l-3.4 1.8.7-3.8L18.5 4l3.8-.6Z"/>}
      {look.variant !== 0 && <path className="creature-arm" d="M13 28 7 34m28-6 6 6" />}
      {look.variant !== 0 && <><ellipse className="creature-eye" cx="19" cy={eyeY} rx={eyeRadiusX} ry={eyeRadiusY}/><ellipse className="creature-eye" cx="29" cy={eyeY} rx={eyeRadiusX} ry={eyeRadiusY}/><circle className="creature-pupil" cx={19 + look.pupilShift * .45} cy={eyeY + .35} r={pupilRadius}/><circle className="creature-pupil" cx={29 + look.pupilShift * .45} cy={eyeY + .35} r={pupilRadius}/></>}
      {(look.variant === 1 || look.variant === 2) && <path className="creature-mouth" d={look.variant === 1 ? "M22 30q2 2 4 0" : "M22 31h4"}/>}
    </svg>
  );
}

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
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></>,
    close: <path d="m7 7 10 10M17 7 7 17"/>,
  };
  return <svg className={`icon icon-${name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Avatar({ participant, small = false }) {
  return (
    <span className={`avatar ${participant.kind} ${small ? "small" : ""}`} aria-hidden="true">
      <AvatarPortrait participant={participant} />
    </span>
  );
}

function MapAvatar({ participant, current = false, scale = 1 }) {
  const look = creatureLook(participant);
  const eyeY = look.variant === 1 ? -21 : -18;
  const eyeRadiusX = look.variant === 1 ? 2.7 : 4.2;
  const eyeRadiusY = look.variant === 1 ? 2.9 : 5;
  const pupilRadius = look.variant === 1 ? 1 : 1.4;
  const style = { "--creature-body": look.body, "--creature-shadow": look.shadow, "--creature-belly": look.belly };
  return (
    <g className={`map-character ${current ? "map-character-current" : ""}`} style={style} transform={`scale(${current ? 1.26 : scale})`}>
      <ellipse className="map-character-shadow" cx="0" cy="11" rx="17" ry="5" />
      <ellipse className="map-presence-ring" cx="0" cy="10" rx="23" ry="9" />
      {look.variant === 0 && <><path className="map-creature-body" d="M-24-9c0-13 8-22 22-23h8c3-7 9-11 15-8 5 3 7 9 6 15 6 2 9 6 7 11-2 6-7 8-14 9l-4 7c-2 4-7 5-10 1-4 4-10 3-11-1h-10c-3 4-8 3-10 0-3-2-4-6-3-11Z"/><circle className="map-creature-ear" cx="18" cy="-36" r="5"/><circle className="map-creature-fruit" cx="10" cy="-42" r="5"/><path className="map-creature-fruit-leaf" d="M10-47c0-4 3-5 7-4-1 4-4 5-7 4Z"/><circle className="map-creature-profile-eye" cx="20" cy="-27" r="1.8"/><path className="map-creature-profile-face" d="m29-23 1 7m-4-7 3 3-3 3M16-12q4 3 8 0"/><path className="map-creature-fur-mark" d="m-17-20 3-1m-4 5 3-1M4-3l2-3m3 4 1-3"/></>}
      {look.variant === 1 && <><path className="map-creature-ear" d="M-8-32c-10-4-11-12-9-17 7 2 11 7 13 14m12 3c10-4 11-12 9-17-7 2-11 7-13 14"/><path className="map-creature-body" d="M0-42c10 0 15 6 16 15 5 5 5 12 1 16C19 0 11 7 0 7s-19-7-17-18c-4-4-4-11 1-16 1-9 6-15 16-15Z"/><ellipse className="map-creature-belly" cx="0" cy="-3" rx="11" ry="10"/><path className="map-creature-pattern" d="m-7-4 3-2 4 2 4-2 3 2m-10 5 3-2 3 2"/></>}
      {look.variant === 2 && <path className="map-creature-body" d="m0-44 4 4 6-2 1 6 6 2-2 6 5 4-4 5 2 6-6 2-1 6-6-2-5 5-5-5-6 2-1-6-6-2 2-6-5-4 4-5-2-6 6-2 1-6 6 2Z"/>}
      {look.variant === 1 && <path className="map-creature-top-leaf" d="M0-43c-8-3-11-9-9-13 7 1 11 6 11 12 4-6 9-7 13-5-3 6-8 8-15 6Z"/>}
      {look.variant === 2 && <path className="map-creature-top-star" d="m0-54 2.3 4.7 5.2.8-3.8 3.6.9 5.2L0-42.2l-4.6 2.5.9-5.2-3.8-3.6 5.2-.8Z"/>}
      {look.variant !== 0 && <path className="map-creature-arm" d="M-13-12-22-4m35-8 9 8"/>}
      {look.variant !== 0 && <><ellipse className="map-creature-eye" cx="-5.5" cy={eyeY} rx={eyeRadiusX} ry={eyeRadiusY}/><ellipse className="map-creature-eye" cx="5.5" cy={eyeY} rx={eyeRadiusX} ry={eyeRadiusY}/><circle className="map-creature-pupil" cx={-5.5 + look.pupilShift * .55} cy={eyeY + .4} r={pupilRadius}/><circle className="map-creature-pupil" cx={5.5 + look.pupilShift * .55} cy={eyeY + .4} r={pupilRadius}/></>}
      {(look.variant === 1 || look.variant === 2) && <path className="map-creature-mouth" d={look.variant === 1 ? "M-3-9q3 2.5 6 0" : "M-2-9h4"}/>}
    </g>
  );
}

function InteractionMap({ current, contacts, selectedId, sending, messages, sessionId, onSelect }) {
  const points = contacts.map((contact, index) => {
    let ring = 0;
    let ringStart = 0;
    let ringCapacity = 6;
    while (index >= ringStart + ringCapacity) {
      ringStart += ringCapacity;
      ring += 1;
      ringCapacity += 4;
    }
    const ringIndex = index - ringStart;
    const ringCount = Math.min(ringCapacity, contacts.length - ringStart);
    const angle = ringCount === 1 ? -Math.PI / 2 : -Math.PI / 2 + (ringIndex * 2 * Math.PI) / ringCount + (ring % 2 ? Math.PI / ringCount : 0);
    const radiusX = Math.min(218, 120 + ring * 44);
    const radiusY = Math.min(310, 148 + ring * 72);
    const densityScale = Math.max(.72, 1 - Math.max(0, contacts.length - 6) * .012);
    return {
      ...contact,
      x: 260 + radiusX * Math.cos(angle),
      y: 390 + radiusY * Math.sin(angle),
      roamX: 22 + (index % 3) * 7,
      roamY: 12 + ((index + 1) % 3) * 5,
      duration: 9 + (index % 4) * 1.4,
      scale: densityScale * (.96 + (390 + radiusY * Math.sin(angle)) / 2500),
    };
  });
  const active = points.find((point) => point.id === selectedId);
  const connectedIds = new Set(messages.flatMap((message) => [message.source_id, message.target_id]));

  return (
    <div className="map-card">
      <div className="panel-heading">
        <div><span className="eyebrow">ROUTE / LIVE</span><h2>Signal map</h2></div>
        <div className="map-heading-status"><span className="live-dot">SYNC</span><small>{messages.length} events</small></div>
      </div>
      <svg className="interaction-map" viewBox="0 0 520 800" role="img" aria-label="Live woodland spirit map in a Japanese forest onsen">
        <defs>
          <filter id="glow" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="node-shadow" x="-70%" y="-70%" width="240%" height="240%"><feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#315d78" floodOpacity=".25"/></filter>
          <linearGradient id="forest-wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff8d8" stopOpacity=".04"/><stop offset=".7" stopColor="#dcebd8" stopOpacity=".08"/><stop offset="1" stopColor="#17392d" stopOpacity=".2"/></linearGradient>
        </defs>
        <image className="forest-map-background" href="/onsen-forest-map.webp" x="0" y="0" width="520" height="800" preserveAspectRatio="xMidYMid slice" />
        <rect className="forest-map-wash" width="520" height="800" fill="url(#forest-wash)" />
        <ellipse className="forest-clearing-focus" cx="260" cy="390" rx="190" ry="235" />
        {points.map((point) => <g key={`pad-${point.id}`} className="world-node-pad" transform={`translate(${point.x} ${point.y + 11})`}><ellipse className="world-pad-side" cy="4" rx="27" ry="10"/><ellipse className="world-pad" rx="27" ry="10"/></g>)}
        {points.filter((point) => connectedIds.has(point.id) || point.id === selectedId).map((point) => (
          <g key={point.id} className={point.id === selectedId ? "map-edge active" : "map-edge"}>
            <path d={`M260 390 Q${(260 + point.x) / 2 + 18} ${(390 + point.y) / 2 - 20} ${point.x} ${point.y}`} />
          </g>
        ))}
        {sending && active && (
          <circle key={sending} r="6" className="packet" filter="url(#glow)">
            <animate attributeName="cx" from="260" to={active.x} dur="0.7s" repeatCount="indefinite" />
            <animate attributeName="cy" from="390" to={active.y} dur="0.7s" repeatCount="indefinite" />
          </circle>
        )}
        <g className="map-node current" transform="translate(260 390)">
          <g className="map-walker current-walker">
            <animateTransform attributeName="transform" type="translate" values="-12 0;8 -8;14 2;-6 7;-12 0" dur="11s" repeatCount="indefinite" />
            <MapAvatar participant={current} current />
            <text className="map-label current-label" x="0" y="31" textAnchor="middle">{current.id}</text>
          </g>
        </g>
        {points.map((point, index) => (
          <g key={point.id} onClick={() => onSelect(point.id)} className={`map-node map-contact ${point.kind} ${point.id === selectedId ? "selected" : ""}`} transform={`translate(${point.x} ${point.y})`}>
            <g className="map-walker">
              <animateTransform attributeName="transform" type="translate" values={`${-point.roamX} 0;${point.roamX / 2} ${-point.roamY};${point.roamX} 1;${-point.roamX / 3} ${point.roamY};${-point.roamX} 0`} dur={`${point.duration}s`} begin={`${index * -.8}s`} repeatCount="indefinite" />
              <MapAvatar participant={point} scale={point.scale} />
              <text className="map-label" x="0" y="31" textAnchor="middle">{point.id}</text>
            </g>
          </g>
        ))}
      </svg>
      <div className="delivery-status">
        <span className={sending ? "status-icon sending" : "status-icon"}><Icon name={sending ? "sync" : "check"} size={17}/></span>
        <div><strong>{sending ? "Sending event" : "Graph synchronized"}</strong><small>{sending ? `Routing to ${selectedId}` : "Neo4j trace current"}</small></div>
        <code>{sessionId || "no active route"}</code>
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
  const [routeToDelete, setRouteToDelete] = useState("");
  const [identityDeleteArmed, setIdentityDeleteArmed] = useState(false);
  const [deletingIdentity, setDeletingIdentity] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [hiddenRoutes, setHiddenRoutes] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("ark-hidden-routes") || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  });
  const endRef = useRef(null);

  const current = participants.find((item) => item.id === currentId);
  const contacts = participants.filter((item) => item.id !== currentId && !hiddenRoutes.includes(routeKey(currentId, item.id)));
  const hiddenContactCount = participants.filter((item) => item.id !== currentId && hiddenRoutes.includes(routeKey(currentId, item.id))).length;
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
    setRouteToDelete("");
    setIdentityDeleteArmed(false);
    setMessages([]);
    setSignalMessages([]);
    localStorage.setItem("ark-user", id);
    const url = new URL(window.location);
    url.searchParams.set("user", id);
    window.history.replaceState({}, "", url);
  };

  const deleteIdentity = async () => {
    if (participants.length <= 1 || deletingIdentity) return;
    if (!identityDeleteArmed) {
      setIdentityDeleteArmed(true);
      return;
    }
    setDeletingIdentity(true);
    setError("");
    try {
      await api(`/api/participants/${encodeURIComponent(current.id)}`, { method: "DELETE" });
      const encodedId = encodeURIComponent(current.id);
      saveHiddenRoutes(hiddenRoutes.filter((key) => !key.startsWith(`${encodedId}→`) && !key.endsWith(`→${encodedId}`)));
      const found = await api("/api/participants");
      setParticipants(found);
      const next = found.find((item) => item.kind === "user") || found[0];
      if (next) switchUser(next.id);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setDeletingIdentity(false);
      setIdentityDeleteArmed(false);
    }
  };

  const saveHiddenRoutes = (next) => {
    setHiddenRoutes(next);
    localStorage.setItem("ark-hidden-routes", JSON.stringify(next));
  };

  const deleteRoute = (id) => {
    if (routeToDelete !== id) {
      setRouteToDelete(id);
      return;
    }
    saveHiddenRoutes([...new Set([...hiddenRoutes, routeKey(currentId, id)])]);
    if (selectedId === id) {
      setSelectedId("");
      setMessages([]);
    }
    setRouteToDelete("");
  };

  const restoreRoutes = () => {
    const prefix = `${encodeURIComponent(currentId)}→`;
    saveHiddenRoutes(hiddenRoutes.filter((key) => !key.startsWith(prefix)));
  };

  const addUser = async (event) => {
    event.preventDefault();
    const id = newUser.trim();
    if (!id || creatingUser) return;
    setCreatingUser(true);
    setError("");
    try {
      const created = await api("/api/participants", { method: "POST", body: JSON.stringify({ id, kind: "user" }) });
      setParticipants((existing) => [...existing.filter((item) => item.id !== created.id), created]);
      setNewUser("");
      switchUser(created.id);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setCreatingUser(false);
    }
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
        <div className={identityDeleteArmed ? "identity-select delete-armed" : "identity-select"}><Avatar participant={current} small/><select id="identity" value={currentId} onChange={(event) => switchUser(event.target.value)}>{participants.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.kind}</option>)}</select><button type="button" className="identity-delete" disabled={participants.length <= 1 || deletingIdentity} onClick={deleteIdentity} onBlur={() => window.setTimeout(() => setIdentityDeleteArmed(false), 140)} aria-label={identityDeleteArmed ? `Confirm permanent deletion of ${current.id}` : `Delete active identity ${current.id}`} title={participants.length <= 1 ? "Create another identity before deleting this one" : identityDeleteArmed ? "Click again to permanently delete identity and graph paths" : "Delete active identity"}><Icon name={deletingIdentity ? "sync" : identityDeleteArmed ? "check" : "trash"} size={15}/></button></div>
        {identityDeleteArmed && <p className="identity-delete-warning">Deletes {current.id}, messages, events, and graph paths. Click again.</p>}
        <div className="section-title"><span>Routes</span><b>{String(contacts.length).padStart(2, "0")}</b></div>
        <nav className="contact-list">
          {contacts.map((contact, index) => <div key={contact.id} className="contact-row"><button className={activeSelectedId === contact.id ? "contact active" : "contact"} onClick={() => { setSelectedId(contact.id); setRouteToDelete(""); }}><span className="contact-index">{String(index + 1).padStart(2, "0")}</span><Avatar participant={contact}/><span><strong>{contact.id}</strong><small>{contact.kind}{counts[contact.id] ? ` · ${counts[contact.id]} events` : ""}</small></span><i/></button><button type="button" className={routeToDelete === contact.id ? "route-delete confirming" : "route-delete"} onClick={() => deleteRoute(contact.id)} onBlur={() => window.setTimeout(() => setRouteToDelete((id) => id === contact.id ? "" : id), 120)} aria-label={routeToDelete === contact.id ? `Confirm remove route to ${contact.id}` : `Remove route to ${contact.id}`} title={routeToDelete === contact.id ? "Click again to remove · trace stays" : "Remove route"}><Icon name={routeToDelete === contact.id ? "check" : "trash"} size={15}/></button></div>)}
        </nav>
        {hiddenContactCount > 0 && <button type="button" className="restore-routes" onClick={restoreRoutes}><Icon name="sync" size={13}/> Restore {hiddenContactCount} hidden {hiddenContactCount === 1 ? "route" : "routes"}</button>}
        <form className="add-user" onSubmit={addUser}><input aria-label="New user ID" value={newUser} onChange={(event) => setNewUser(event.target.value)} placeholder="new-user-id" disabled={creatingUser}/><button title="Create user" aria-label="Create user" disabled={!newUser.trim() || creatingUser}><Icon name={creatingUser ? "sync" : "addUser"} size={17}/></button></form>
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

      <aside className="graph-panel"><InteractionMap current={current} contacts={contacts} selectedId={activeSelectedId} sending={sending} messages={signalMessages} sessionId={selected ? sessionId : ""} onSelect={setSelectedId}/></aside>
      {error && <button className="error-toast" onClick={() => setError("")}>{error}<span><Icon name="close" size={15}/></span></button>}
    </main>
  );
}
