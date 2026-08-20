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
const shortId = (value, length = 16) => value && value.length > length ? `${value.slice(0, length - 1)}…` : value || "—";
const eventTime = (timestamp) => new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(timestamp);
const sessionTime = (timestamp) => timestamp ? new Intl.DateTimeFormat([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(timestamp) : "No events";

const capybaraType = { name: "capybara", body: "#9b704e", shadow: "#5f4433", belly: "#c99c70" };

const avatarSeed = (id) => [...id].reduce((total, character) => ((total * 31) + character.codePointAt(0)) >>> 0, 7);
const capybaraAvatarFor = (id) => {
  const hash = avatarSeed(id);
  return {
    skinTone: 0,
    hairStyle: hash % 3,
    hairColor: Math.floor(hash / 3) % 8,
    eyeColor: Math.floor(hash / 17) % 5,
    outfitColor: Math.floor(hash / 29) % 7,
    accessory: Math.floor(hash / 43) % 2,
    expression: Math.floor(hash / 71) % 2,
  };
};
const avatarLook = (participant) => {
  const config = participant.avatar || capybaraAvatarFor(participant.id);
  return {
    ...capybaraType,
    apparel: config.hairStyle % 3,
  };
};

function AvatarGlyph({ participant }) {
  const look = avatarLook(participant);
  const style = { "--avatar-body": look.body, "--avatar-shadow": look.shadow, "--avatar-belly": look.belly };
  return (
    <g className="avatar-glyph avatar-glyph-capybara" style={style}>
      <ellipse className="avatar-ground" cx="24" cy="43" rx="14" ry="3" />
      <>
        <path className="avatar-body" d="M5 31c0-10 7-16 17-17h6c2-5 6-8 10-6 4 2 5 7 4 10 5 1 7 4 6 8-1 5-6 7-10 7l-3 5c-2 3-5 4-8 1-3 3-7 2-8-1h-7c-2 3-6 2-7 0-3-1-4-4-4-7Z" />
        <circle className="avatar-detail" cx="36" cy="11" r="4" />
        {look.apparel === 0 && <>
          <circle className="avatar-orange" cx="32" cy="5.5" r="4.5" />
          <path className="avatar-orange-leaf" d="M32 1.5c.5-3 3-3.5 5-2-1 2.5-3 3.2-5 2Z" />
        </>}
        {look.apparel === 1 && <>
          <path className="avatar-onsen-towel" d="M29 10c1-3 2-6 2-9h12c0 3 1 6 2 9-5-2-11-2-16 0Z" />
          <path className="avatar-towel-fold" d="M32 1v7m4-7v6m4-6v7" />
        </>}
        {look.apparel === 2 && <>
          <path className="avatar-egg" d="M30 7c0-4 2-7 5-7s6 3 6 7c0 3-2 5-6 5s-5-2-5-5Z" />
          <circle className="avatar-yolk" cx="35.5" cy="6.5" r="2.2" />
        </>}
        <circle className="avatar-eye-dot" cx="37" cy="18" r="1.5" />
        <path className="avatar-face-line" d="m44 21 1 5m-3-5 2 2-2 2M34 29q3 2 6 0" />
      </>
    </g>
  );
}

function Avatar({ participant, size = "medium" }) {
  return (
    <span className={`avatar avatar-${size} avatar-${participant.kind}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false"><AvatarGlyph participant={participant} /></svg>
    </span>
  );
}

function Icon({ name, size = 18 }) {
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
    search: <><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 4.5 4.5"/></>,
    chevron: <path d="m8 10 4 4 4-4"/>,
    panel: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M8 9h13"/></>,
    chat: <path d="M5 5h14v10H9l-4 4Z"/>,
    link: <><circle cx="8" cy="12" r="3"/><circle cx="16" cy="12" r="3"/><path d="M11 12h2"/></>,
    clock: <><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>,
    focus: <><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="3"/></>,
  };
  return <svg className={`icon icon-${name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Field({ label, value, mono = true }) {
  return <div className="inspector-field"><dt>{label}</dt><dd className={mono ? "mono" : ""} title={value || "Not present"}>{value || "Not present"}</dd></div>;
}

function buildSessions(messages) {
  const grouped = new Map();
  for (const message of messages) {
    const existing = grouped.get(message.session_id) || { id: message.session_id, messages: [], participants: new Set(), lastTimestamp: 0 };
    existing.messages.push(message);
    existing.participants.add(message.source_id);
    if (message.target_id) existing.participants.add(message.target_id);
    existing.lastTimestamp = Math.max(existing.lastTimestamp, message.timestamp_ms);
    grouped.set(message.session_id, existing);
  }
  return [...grouped.values()]
    .map((session) => ({ ...session, participants: [...session.participants], messages: session.messages.sort((left, right) => left.timestamp_ms - right.timestamp_ms) }))
    .sort((left, right) => right.lastTimestamp - left.lastTimestamp);
}

function sessionName(session, currentId) {
  const peers = session.participants.filter((id) => id !== currentId);
  return peers.length ? peers.join(" + ") : shortId(session.id, 22);
}

function causalIds(messages, selectedEvent) {
  if (!selectedEvent) return new Set();
  const byId = new Map(messages.map((message) => [message.event_id, message]));
  const ids = new Set();
  let cursor = selectedEvent;
  while (cursor && !ids.has(cursor.event_id)) {
    ids.add(cursor.event_id);
    cursor = cursor.parent_event_id ? byId.get(cursor.parent_event_id) : null;
  }
  return ids;
}

function TraceAvatar({ participant, x, y, selected, current, density, index, onSelect }) {
  const scale = density === "compact" ? .68 : .78;
  const travel = 7 + (index % 4) * 2;
  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(participant.id);
    }
  };
  return (
    <g className={`trace-avatar ${selected ? "selected" : ""} ${current ? "current" : ""}`} transform={`translate(${x} ${y})`} role="button" tabIndex="0" aria-label={`Focus ${participant.id}`} onClick={() => onSelect(participant.id)} onKeyDown={handleKeyDown}>
      <g className="trace-avatar-walker">
        <animateTransform className="walking-motion" attributeName="transform" type="translate" values={`${-travel} 0;${travel} -2;${travel / 2} 2;${-travel} 0`} dur={`${8 + (index % 5)}s`} begin={`${index * -.7}s`} repeatCount="indefinite" />
        <ellipse className="trace-avatar-ring" cx="0" cy="1" rx="25" ry="10" />
        <g transform={`translate(-22 -43) scale(${scale})`}><AvatarGlyph participant={participant} /></g>
        <text x="0" y="18" textAnchor="middle">{shortId(participant.id, 13)}</text>
      </g>
    </g>
  );
}

function TracePlane({ current, participants, messages, selectedParticipantId, selectedEvent, density, sending, onSelectParticipant, onSelectEvent }) {
  const orderedParticipants = useMemo(() => {
    const referenced = new Set(messages.flatMap((message) => [message.source_id, message.target_id].filter(Boolean)));
    const visible = participants.filter((participant) => participant.id === current.id || referenced.has(participant.id));
    const remainder = participants.filter((participant) => !visible.some((item) => item.id === participant.id));
    return [...visible, ...remainder];
  }, [current.id, messages, participants]);
  const laneGap = density === "compact" ? 58 : 72;
  const eventGap = density === "compact" ? 54 : 66;
  const avatarHomeX = 88;
  const plotStart = 146;
  const firstEventX = 200;
  const laneY = (index) => 86 + index * laneGap;
  const planeHeight = Math.max(620, 100 + orderedParticipants.length * laneGap);
  const planeWidth = Math.max(1040, firstEventX + Math.max(messages.length, 10) * eventGap + 100);
  const laneIndex = new Map(orderedParticipants.map((participant, index) => [participant.id, index]));
  const positions = new Map(messages.map((message, index) => [message.event_id, {
    x: firstEventX + index * eventGap,
    sourceY: laneY(laneIndex.get(message.source_id) ?? 0),
    targetY: laneY(laneIndex.get(message.target_id) ?? laneIndex.get(message.source_id) ?? 0),
  }]));
  const chain = causalIds(messages, selectedEvent);

  const routedPath = (startX, startY, endX, endY, channelX, radius = 9) => {
    if (startY === endY) return `M${startX} ${startY} H${endX}`;
    const direction = endY > startY ? 1 : -1;
    const incoming = channelX > startX ? 1 : -1;
    const outgoing = endX > channelX ? 1 : -1;
    return `M${startX} ${startY} H${channelX - incoming * radius} Q${channelX} ${startY} ${channelX} ${startY + direction * radius} V${endY - direction * radius} Q${channelX} ${endY} ${channelX + outgoing * radius} ${endY} H${endX}`;
  };
  const deliveryPath = (position, index) => {
    const channelX = position.x + (index % 2 ? -26 : 26);
    return routedPath(position.x, position.sourceY, position.x, position.targetY, channelX);
  };
  const receivingParticipant = orderedParticipants.find((participant) => participant.id === selectedParticipantId);
  const senderY = laneY(laneIndex.get(current.id) ?? 0) - 11;
  const receiverY = receivingParticipant ? laneY(laneIndex.get(receivingParticipant.id) ?? 0) - 11 : senderY;
  const senderX = avatarHomeX + 21;
  const receiverX = receivingParticipant ? avatarHomeX + 21 : senderX;
  const packetReach = plotStart + 68;
  const sendingRoute = routedPath(senderX, senderY, receiverX, receiverY, packetReach, 12);

  return (
    <div className="trace-scroll" tabIndex="0" aria-label="Scrollable causal trace plane">
      <svg className="trace-plane" style={{ width: planeWidth, height: planeHeight }} viewBox={`0 0 ${planeWidth} ${planeHeight}`} role="img" aria-label={`${messages.length} events across ${orderedParticipants.length} participants`}>
        <defs>
          <pattern id="trace-grid" width={eventGap} height={laneGap} patternUnits="userSpaceOnUse">
            <path d={`M ${eventGap} 0 L 0 0 0 ${laneGap}`} fill="none" className="trace-grid-line" />
          </pattern>
          <marker id="trace-arrow" markerWidth="6" markerHeight="6" refX="5.5" refY="3" orient="auto"><path d="M1 .8 5 3 1 5.2" className="trace-arrow" /></marker>
          <marker id="trace-arrow-active" markerWidth="6" markerHeight="6" refX="5.5" refY="3" orient="auto"><path d="M1 .8 5 3 1 5.2" className="trace-arrow-active" /></marker>
        </defs>
        <rect className="trace-plane-paper" width={planeWidth} height={planeHeight} />
        <rect className="trace-plane-grid" x={plotStart} y="54" width={planeWidth - plotStart - 20} height={planeHeight - 78} fill="url(#trace-grid)" />
        <g className="trace-axis">
          <line x1={plotStart - 1} y1="54" x2={plotStart - 1} y2={planeHeight - 24} />
          {messages.map((message, index) => index % Math.max(1, Math.ceil(messages.length / 12)) === 0 && <g key={`tick-${message.event_id}`} transform={`translate(${firstEventX + index * eventGap} 42)`}><line y1="0" y2="12"/><text y="-7" textAnchor="middle">{eventTime(message.timestamp_ms)}</text></g>)}
        </g>
        <g className="trace-lanes">
          {orderedParticipants.map((participant, index) => {
            const y = laneY(index);
            return <line key={participant.id} x1={plotStart} y1={y} x2={planeWidth - 20} y2={y}/>;
          })}
        </g>
        <g className="trace-relations">
          {messages.map((message, index) => {
            const position = positions.get(message.event_id);
            const parent = message.parent_event_id ? positions.get(message.parent_event_id) : null;
            const selected = chain.has(message.event_id);
            return <g key={`relation-${message.event_id}`} className={selected ? "relation selected" : "relation"}>
              {parent && <path className="parent-link" d={routedPath(parent.x, parent.sourceY, position.x, position.sourceY, parent.x + (position.x - parent.x) / 2, 7)} />}
              {position.targetY !== position.sourceY && <path className="delivery-link" markerEnd={selected ? "url(#trace-arrow-active)" : "url(#trace-arrow)"} d={deliveryPath(position, index)} />}
            </g>;
          })}
        </g>
        <g className="trace-message-motion" aria-hidden="true">
          {messages.map((message, index) => {
            const position = positions.get(message.event_id);
            if (message.event_id !== selectedEvent?.event_id || position.targetY === position.sourceY) return null;
            return <g key={`moving-${message.event_id}`} className="history-packet">
              <animateMotion path={deliveryPath(position, index)} dur="1.65s" repeatCount="indefinite"/>
              <rect x="-4.5" y="-3.5" width="9" height="7" rx="1.5"/>
              <path d="m-3.5-1.5 3.5 2.5 3.5-2.5"/>
              <circle cx="0" cy="1" r=".9"/>
            </g>;
          })}
        </g>
        <g className="trace-events">
          {messages.map((message) => {
            const position = positions.get(message.event_id);
            const isSelected = selectedEvent?.event_id === message.event_id;
            const inChain = chain.has(message.event_id);
            const handleKeyDown = (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectEvent(message.event_id);
              }
            };
            return <g key={message.event_id} className={`trace-event ${isSelected ? "selected" : ""} ${inChain ? "in-chain" : ""}`} transform={`translate(${position.x} ${position.sourceY})`} role="button" tabIndex="0" aria-label={`Message from ${message.source_id} to ${message.target_id || "no target"} at ${eventTime(message.timestamp_ms)}`} onClick={() => onSelectEvent(message.event_id)} onKeyDown={handleKeyDown}>
              <circle className="event-hit" r="14"/>
              <rect className="event-envelope" x={isSelected ? -8 : -7} y={isSelected ? -6 : -5} width={isSelected ? 16 : 14} height={isSelected ? 12 : 10} rx="2.5"/>
              <path className="event-flap" d={isSelected ? "m-6-3 6 4.5L6-3" : "m-5-2.5 5 3.7 5-3.7"}/>
              <circle className="event-seal" cy="1" r="1.2"/>
              <title>{message.content}</title>
            </g>;
          })}
        </g>
        <g className="trace-avatars">
          {orderedParticipants.map((participant, index) => {
            const y = laneY(index);
            return <TraceAvatar key={participant.id} participant={participant} x={avatarHomeX} y={y - 12} selected={participant.id === selectedParticipantId} current={participant.id === current.id} density={density} index={index} onSelect={onSelectParticipant} />;
          })}
        </g>
        {sending && receivingParticipant && <>
          <path className="sending-route" d={sendingRoute}/>
          <g key={sending} className="trace-packet">
            <animateMotion path={sendingRoute} dur="1.25s" repeatCount="indefinite"/>
            <rect x="-5" y="-4" width="10" height="8" rx="2"/>
            <path d="m-4-2 4 3 4-3"/>
            <circle cx="0" cy="1" r="1"/>
          </g>
        </>}
        {!messages.length && <g className="trace-empty" transform={`translate(${planeWidth / 2} ${planeHeight / 2})`}><circle r="34"/><path d="M-12 5h8l7-15 9 24 7-13h10"/><text y="66" textAnchor="middle">No events in this session</text></g>}
      </svg>
      <ol className="sr-only">
        {messages.map((message) => <li key={`accessible-${message.event_id}`}>{eventTime(message.timestamp_ms)}: {message.source_id} sent a message to {message.target_id || "no target"}. {message.content}</li>)}
      </ol>
    </div>
  );
}

export default function App() {
  const requestedUser = new URLSearchParams(window.location.search).get("user");
  const [participants, setParticipants] = useState([]);
  const [currentId, setCurrentId] = useState(requestedUser || localStorage.getItem("ark-user") || "");
  const [selectedId, setSelectedId] = useState("");
  const [activeSessionId, setActiveSessionId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [messages, setMessages] = useState([]);
  const [signalMessages, setSignalMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState("");
  const [error, setError] = useState("");
  const [newUser, setNewUser] = useState("");
  const [search, setSearch] = useState("");
  const [railTab, setRailTab] = useState("sessions");
  const [density, setDensity] = useState("comfortable");
  const [eventPage, setEventPage] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileView, setMobileView] = useState("trace");
  const [chatOpen, setChatOpen] = useState(() => {
    const stored = localStorage.getItem("ark-chat-open");
    return stored === null ? window.matchMedia("(min-width: 761px)").matches : stored === "true";
  });
  const [routeToDelete, setRouteToDelete] = useState("");
  const [identityMenuOpen, setIdentityMenuOpen] = useState(false);
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
  const identityPickerRef = useRef(null);

  const current = participants.find((item) => item.id === currentId);
  const trimmedNewUser = newUser.trim();
  const newUserExists = participants.some((participant) => participant.id === trimmedNewUser);
  const newUserPreviewId = trimmedNewUser || "new-user";
  const newUserPreview = { id: newUserPreviewId, kind: "user", avatar: capybaraAvatarFor(newUserPreviewId) };
  const contacts = participants.filter((item) => item.id !== currentId && !hiddenRoutes.includes(routeKey(currentId, item.id)));
  const hiddenContactCount = participants.filter((item) => item.id !== currentId && hiddenRoutes.includes(routeKey(currentId, item.id))).length;
  const sessions = useMemo(() => buildSessions(signalMessages), [signalMessages]);
  const identityStats = useMemo(() => new Map(participants.map((participant) => [participant.id, {
    events: signalMessages.filter((message) => message.source_id === participant.id || message.target_id === participant.id).length,
    sessions: sessions.filter((session) => session.participants.includes(participant.id)).length,
  }])), [participants, sessions, signalMessages]);
  const resolvedSessionId = sessions.some((session) => session.id === activeSessionId) ? activeSessionId : sessions[0]?.id || "";
  const activeSession = sessions.find((session) => session.id === resolvedSessionId);
  const sessionPeerId = activeSession?.participants.find((id) => id !== currentId);
  const selected = contacts.find((item) => item.id === selectedId) || contacts.find((item) => item.id === sessionPeerId) || contacts[0];
  const activeSelectedId = selected?.id || "";
  const conversationSessionId = current && selected ? (resolvedSessionId && activeSession?.participants.includes(selected.id) ? resolvedSessionId : sessionFor(current.id, selected.id)) : "";
  const activeMessages = activeSession?.messages || messages;
  const selectedEvent = activeMessages.find((message) => message.event_id === selectedEventId) || activeMessages.at(-1) || null;
  const selectedEventSource = participants.find((participant) => participant.id === selectedEvent?.source_id);
  const selectedEventTarget = participants.find((participant) => participant.id === selectedEvent?.target_id);
  const chainIds = causalIds(activeMessages, selectedEvent);
  const chain = activeMessages.filter((message) => chainIds.has(message.event_id));
  const eventWindowSize = density === "compact" ? 60 : 40;
  const eventPageCount = Math.max(1, Math.ceil(activeMessages.length / eventWindowSize));
  const boundedEventPage = Math.min(eventPage, eventPageCount - 1);
  const eventWindowEnd = Math.max(0, activeMessages.length - boundedEventPage * eventWindowSize);
  const eventWindowStart = Math.max(0, eventWindowEnd - eventWindowSize);
  const visibleMessages = activeMessages.slice(eventWindowStart, eventWindowEnd);
  const referencedParticipantIds = new Set(visibleMessages.flatMap((message) => [message.source_id, message.target_id].filter(Boolean)));
  if (current) referencedParticipantIds.add(current.id);
  if (activeSelectedId) referencedParticipantIds.add(activeSelectedId);
  const allTraceParticipants = current ? [current, ...contacts] : contacts;
  const traceParticipants = visibleMessages.length
    ? allTraceParticipants.filter((participant) => referencedParticipantIds.has(participant.id))
    : allTraceParticipants.filter((participant, index) => index < 24 || participant.id === activeSelectedId);

  const filteredSessions = sessions.filter((session) => `${session.id} ${session.participants.join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  const filteredContacts = contacts.filter((participant) => participant.id.toLowerCase().includes(search.toLowerCase()));

  const loadParticipants = useCallback(async () => {
    try {
      let found = await api("/api/participants");
      if (requestedUser && !found.some((item) => item.id === requestedUser)) {
        await api("/api/participants", { method: "POST", body: JSON.stringify({ id: requestedUser, kind: "user", avatar: capybaraAvatarFor(requestedUser) }) });
        found = await api("/api/participants");
      }
      setParticipants(found);
      setCurrentId((existing) => existing && found.some((item) => item.id === existing) ? existing : (found.find((item) => item.kind === "user") || found[0])?.id || "");
    } catch (cause) { setError(`Could not load participants. ${cause.message}`); }
  }, [requestedUser]);

  const refreshConversation = async () => {
    if (!currentId || !activeSelectedId || !conversationSessionId) return;
    try {
      const params = new URLSearchParams({ participant_id: currentId, with: activeSelectedId, session_id: conversationSessionId });
      setMessages(await api(`/api/messages?${params}`));
    } catch (cause) { setError(`Could not refresh this conversation. ${cause.message}`); }
  };

  const refreshTrace = async () => {
    if (!currentId) return;
    try {
      const params = new URLSearchParams({ participant_id: currentId });
      setSignalMessages(await api(`/api/messages?${params}`));
    } catch (cause) { setError(`Could not refresh the trace. ${cause.message}`); }
  };

  useEffect(() => {
    const initial = window.setTimeout(loadParticipants, 0);
    return () => window.clearTimeout(initial);
  }, [loadParticipants]);
  useEffect(() => {
    const refresh = async () => {
      if (!currentId || !activeSelectedId || !conversationSessionId) return;
      try {
        const params = new URLSearchParams({ participant_id: currentId, with: activeSelectedId, session_id: conversationSessionId });
        setMessages(await api(`/api/messages?${params}`));
      } catch (cause) { setError(`Could not refresh this conversation. ${cause.message}`); }
    };
    const initial = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 2000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [currentId, activeSelectedId, conversationSessionId]);
  useEffect(() => {
    const refresh = async () => {
      if (!currentId) return;
      try {
        const params = new URLSearchParams({ participant_id: currentId });
        setSignalMessages(await api(`/api/messages?${params}`));
      } catch (cause) { setError(`Could not refresh the trace. ${cause.message}`); }
    };
    const initial = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 2000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [currentId]);
  useEffect(() => {
    if (chatOpen) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, chatOpen]);
  useEffect(() => {
    if (!identityMenuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!identityPickerRef.current?.contains(event.target)) setIdentityMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIdentityMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [identityMenuOpen]);

  const chooseSession = (session) => {
    const peer = session.participants.find((id) => id !== currentId);
    setActiveSessionId(session.id);
    setSelectedEventId(session.messages.at(-1)?.event_id || "");
    setEventPage(0);
    setMobileNavOpen(false);
    setMobileView("trace");
    if (peer) setSelectedId(peer);
  };

  const chooseParticipant = (id) => {
    if (id === currentId) return;
    setSelectedId(id);
    const idForSession = sessionFor(currentId, id);
    setActiveSessionId(idForSession);
    const related = sessions.find((session) => session.id === idForSession);
    setSelectedEventId(related?.messages.at(-1)?.event_id || "");
    setEventPage(0);
    setMobileNavOpen(false);
    setMobileView("trace");
  };

  const focusEvent = (eventId) => {
    const eventIndex = activeMessages.findIndex((message) => message.event_id === eventId);
    if (eventIndex >= 0) setEventPage(Math.floor((activeMessages.length - 1 - eventIndex) / eventWindowSize));
    setSelectedEventId(eventId);
    setMobileView("inspector");
  };

  const switchUser = (id) => {
    setIdentityMenuOpen(false);
    setCurrentId(id);
    setSelectedId("");
    setActiveSessionId("");
    setSelectedEventId("");
    setEventPage(0);
    setMobileNavOpen(false);
    setMobileView("trace");
    setRouteToDelete("");
    setIdentityDeleteArmed(false);
    setMessages([]);
    setSignalMessages([]);
    localStorage.setItem("ark-user", id);
    const url = new URL(window.location);
    url.searchParams.set("user", id);
    window.history.replaceState({}, "", url);
  };

  const saveHiddenRoutes = (next) => {
    setHiddenRoutes(next);
    localStorage.setItem("ark-hidden-routes", JSON.stringify(next));
  };

  const deleteIdentity = async () => {
    if (participants.length <= 1 || deletingIdentity) return;
    if (!identityDeleteArmed) { setIdentityDeleteArmed(true); return; }
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
      setError(`Could not delete ${current.id}. ${cause.message}`);
    } finally {
      setDeletingIdentity(false);
      setIdentityDeleteArmed(false);
    }
  };

  const deleteRoute = (id) => {
    if (routeToDelete !== id) { setRouteToDelete(id); return; }
    saveHiddenRoutes([...new Set([...hiddenRoutes, routeKey(currentId, id)])]);
    if (selectedId === id) { setSelectedId(""); setMessages([]); }
    setRouteToDelete("");
  };

  const restoreRoutes = () => {
    const prefix = `${encodeURIComponent(currentId)}→`;
    saveHiddenRoutes(hiddenRoutes.filter((key) => !key.startsWith(prefix)));
  };

  const addUser = async (event) => {
    event.preventDefault();
    const id = trimmedNewUser;
    if (!id || newUserExists || creatingUser) return;
    setCreatingUser(true);
    setError("");
    try {
      const created = await api("/api/participants", { method: "POST", body: JSON.stringify({ id, kind: "user", avatar: capybaraAvatarFor(id) }) });
      setParticipants((existing) => [...existing.filter((item) => item.id !== created.id), created]);
      setNewUser("");
      switchUser(created.id);
    } catch (cause) {
      setError(`Could not create ${id}. ${cause.message}`);
    } finally { setCreatingUser(false); }
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
          session_id: conversationSessionId,
          trace_id: `trace:${conversationSessionId}`,
          parent_event_id: messages.at(-1)?.event_id,
        }),
      });
      setActiveSessionId(conversationSessionId);
      await Promise.all([refreshConversation(), refreshTrace()]);
    } catch (cause) {
      setDraft(content);
      setError(`Message was not sent. ${cause.message}`);
    } finally { setSending(""); }
  };

  const toggleChat = () => {
    setChatOpen((open) => {
      localStorage.setItem("ark-chat-open", String(!open));
      return !open;
    });
  };

  if (!current) return <main className="loading"><span className="loading-mark"><Icon name="ark" size={28}/></span><p>{error || "Loading Ark graph…"}</p></main>;

  return (
    <main className={`app-shell mobile-view-${mobileView}`}>
      <aside className={mobileNavOpen ? "project-rail mobile-open" : "project-rail"}>
        <header className="brand-lockup"><span className="brand-mark"><Icon name="ark" size={23}/></span><div><strong>ARK</strong><small>Trace every cause.</small></div><button type="button" className="mobile-rail-toggle" aria-expanded={mobileNavOpen} aria-label={mobileNavOpen ? "Close project navigation" : "Open project navigation"} onClick={() => setMobileNavOpen((open) => !open)}><Icon name={mobileNavOpen ? "close" : "panel"} size={17}/></button></header>
        <section className="project-summary" aria-label="Current project">
          <div><span className="status-beacon"/><div><strong>Local graph</strong><small>{participants.length} participants · {sessions.length} sessions</small></div></div>
          <button type="button" className="icon-button dark" title="Neo4j synchronized" aria-label="Neo4j synchronized"><Icon name="database" size={15}/></button>
        </section>
        <section className="identity-control" aria-labelledby="active-identity-title">
          <div className="identity-heading"><span id="active-identity-title">Active identity</span><small>{participants.length} available</small></div>
          <div className="identity-current"><Avatar participant={current} size="medium"/><span><strong>{current.id}</strong><small>User identity</small></span><span className="identity-status"><i/>Active</span></div>
          <div className="identity-switch"><span>Switch identity</span><div className="identity-picker" ref={identityPickerRef}>
            <button type="button" className={identityMenuOpen ? "identity-select open" : "identity-select"} aria-haspopup="menu" aria-expanded={identityMenuOpen} onClick={() => setIdentityMenuOpen((open) => !open)}><span><strong>{current.id}</strong><small>{identityStats.get(current.id)?.events || 0} events · {identityStats.get(current.id)?.sessions || 0} sessions</small></span><Icon name="chevron" size={14}/></button>
            {identityMenuOpen && <div className="identity-options" role="menu" aria-label="Available identities">{participants.map((participant) => {
              const stats = identityStats.get(participant.id) || { events: 0, sessions: 0 };
              const active = participant.id === currentId;
              return <button type="button" role="menuitemradio" aria-checked={active} className={active ? "identity-option active" : "identity-option"} key={participant.id} onClick={() => switchUser(participant.id)}><Avatar participant={participant} size="small"/><span className="identity-option-copy"><strong>{participant.id}</strong><small>{stats.events} events · {stats.sessions} sessions</small></span><span className="identity-option-state">{active ? <><i/>Active</> : "Switch"}</span></button>;
            })}</div>}
          </div></div>
        </section>
        <div className="rail-search"><Icon name="search" size={15}/><input aria-label="Search sessions or participants" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search graph"/>{search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}><Icon name="close" size={13}/></button>}</div>
        <div className="rail-tabs" role="tablist" aria-label="Graph navigation"><button type="button" role="tab" aria-selected={railTab === "sessions"} className={railTab === "sessions" ? "active" : ""} onClick={() => setRailTab("sessions")}>Sessions <span>{sessions.length}</span></button><button type="button" role="tab" aria-selected={railTab === "participants"} className={railTab === "participants" ? "active" : ""} onClick={() => setRailTab("participants")}>Participants <span>{contacts.length}</span></button></div>
        <div className="rail-list">
          {railTab === "sessions" && <>
            {filteredSessions.map((session) => <button type="button" key={session.id} className={resolvedSessionId === session.id ? "session-row active" : "session-row"} onClick={() => chooseSession(session)}><span className="session-rail"><i/><i/><i/></span><span><strong>{sessionName(session, currentId)}</strong><small>{session.messages.length} events · {sessionTime(session.lastTimestamp)}</small></span><Icon name="chevron" size={13}/></button>)}
            {!filteredSessions.length && <div className="rail-empty"><Icon name="route" size={19}/><strong>No matching sessions</strong><small>Send a message to create a traceable session.</small></div>}
          </>}
          {railTab === "participants" && <>
            {filteredContacts.map((participant) => <div className="participant-row" key={participant.id}><button type="button" className={activeSelectedId === participant.id ? "participant-main active" : "participant-main"} onClick={() => chooseParticipant(participant.id)}><Avatar participant={participant} size="small"/><span><strong>{participant.id}</strong><small>{participant.kind}</small></span><i/></button><button type="button" className={routeToDelete === participant.id ? "route-hide confirming" : "route-hide"} onClick={() => deleteRoute(participant.id)} onBlur={() => window.setTimeout(() => setRouteToDelete((value) => value === participant.id ? "" : value), 120)} aria-label={routeToDelete === participant.id ? `Confirm hide ${participant.id}` : `Hide ${participant.id}`} title={routeToDelete === participant.id ? "Click again to hide this route" : "Hide route; trace data remains"}><Icon name={routeToDelete === participant.id ? "check" : "close"} size={13}/></button></div>)}
            {!filteredContacts.length && <div className="rail-empty"><Icon name="agent" size={19}/><strong>No matching participants</strong><small>Create one below or clear the search.</small></div>}
          </>}
        </div>
        <div className="rail-footer">
          {hiddenContactCount > 0 && <button type="button" className="restore-button" onClick={restoreRoutes}><Icon name="sync" size={13}/>Restore {hiddenContactCount} hidden</button>}
          <form className="add-participant" onSubmit={addUser}>
            <header><span><strong>Add a user</strong><small>New identities receive a capybara automatically.</small></span><Avatar participant={newUserPreview} size="medium"/></header>
            <label className="add-user-field" htmlFor="new-user-id"><span>User ID</span><input id="new-user-id" aria-describedby="new-user-help" value={newUser} onChange={(event) => setNewUser(event.target.value)} placeholder="e.g. river-guide" autoComplete="off" disabled={creatingUser}/></label>
            <small id="new-user-help" className={newUserExists ? "add-user-help error" : "add-user-help"}>{newUserExists ? "That identity already exists." : trimmedNewUser ? "Ready to join the local graph." : "Use a short, recognizable name."}</small>
            <button type="submit" disabled={!trimmedNewUser || newUserExists || creatingUser}><span>{creatingUser ? "Creating identity…" : "Create and switch"}</span><Icon name={creatingUser ? "sync" : "addUser"} size={15}/></button>
          </form>
          <button type="button" className={identityDeleteArmed ? "delete-identity armed" : "delete-identity"} disabled={participants.length <= 1 || deletingIdentity} onClick={deleteIdentity} onBlur={() => window.setTimeout(() => setIdentityDeleteArmed(false), 140)}><Icon name={deletingIdentity ? "sync" : identityDeleteArmed ? "check" : "trash"} size={14}/>{identityDeleteArmed ? `Confirm permanent deletion of ${current.id}` : "Delete active identity"}</button>
        </div>
      </aside>

      <header className="command-bar">
        <div className="trace-heading"><div><h1>Causal descent</h1><p>{activeSession ? sessionName(activeSession, currentId) : "Choose a participant to begin"}</p></div><code>{resolvedSessionId || conversationSessionId || "no session"}</code></div>
        <div className="command-actions"><span className="sync-state"><i className={error ? "error" : ""}/>{error ? "Sync issue" : "Neo4j current"}</span><div className="density-control" aria-label="Trace density"><button type="button" className={density === "comfortable" ? "active" : ""} onClick={() => { setDensity("comfortable"); setEventPage(0); }} aria-label="Comfortable trace density"><Icon name="panel" size={15}/></button><button type="button" className={density === "compact" ? "active" : ""} onClick={() => { setDensity("compact"); setEventPage(0); }} aria-label="Compact trace density"><Icon name="route" size={15}/></button></div><button type="button" className={chatOpen ? "command-button active" : "command-button"} onClick={toggleChat}><Icon name="chat" size={15}/>{chatOpen ? "Close chat" : "Open chat"}</button></div>
        <div className="mobile-view-switcher" aria-label="Workspace view"><button type="button" className={mobileView === "trace" ? "active" : ""} onClick={() => setMobileView("trace")}><Icon name="route" size={16}/>Trace</button><button type="button" className={mobileView === "inspector" ? "active" : ""} onClick={() => setMobileView("inspector")}><Icon name="focus" size={16}/>Inspector</button><button type="button" className={chatOpen ? "active" : ""} onClick={toggleChat}><Icon name="chat" size={16}/>Chat</button></div>
      </header>

      <section className={mobileView === "trace" ? "trace-workspace mobile-active" : "trace-workspace"} aria-label="Causal trace workspace">
        <div className="trace-toolbar"><div><span className="event-count">{activeMessages.length ? `${eventWindowStart + 1}–${eventWindowEnd} of ${activeMessages.length} messages` : "0 messages"}</span><span>{traceParticipants.length} of {allTraceParticipants.length} participants in this window</span></div><div className="event-window-controls"><button type="button" disabled={boundedEventPage >= eventPageCount - 1} onClick={() => setEventPage((page) => Math.min(eventPageCount - 1, page + 1))}>Older</button><span>{boundedEventPage + 1} / {eventPageCount}</span><button type="button" disabled={boundedEventPage === 0} onClick={() => setEventPage((page) => Math.max(0, page - 1))}>Newer</button></div><div className="trace-legend"><span><i className="legend-parent"/>Parent chain</span><span><i className="legend-active"/>Selected route</span></div></div>
        <TracePlane current={current} participants={traceParticipants} messages={visibleMessages} selectedParticipantId={activeSelectedId} selectedEvent={selectedEvent} density={density} sending={sending} onSelectParticipant={chooseParticipant} onSelectEvent={focusEvent} />
      </section>

      <aside className={mobileView === "inspector" ? "event-inspector mobile-active" : "event-inspector"}>
        <header className="inspector-header"><div>{selectedEventSource ? <Avatar participant={selectedEventSource}/> : selected ? <Avatar participant={selected}/> : <span className="empty-avatar"><Icon name="focus" size={18}/></span>}<div><h2>{selectedEvent ? "Message event" : "Session inspector"}</h2><p>{selectedEvent ? `${selectedEvent.source_id} → ${selectedEvent.target_id || "no target"}` : "Select an event on the trace"}</p></div></div><span className="event-state"><i/>immutable</span></header>
        {selectedEvent ? <div className="inspector-scroll">
          <section className="inspector-section"><h3>Event record</h3><dl><Field label="Event ID" value={selectedEvent.event_id}/><Field label="Timestamp" value={sessionTime(selectedEvent.timestamp_ms)} mono={false}/><Field label="Content" value={selectedEvent.content} mono={false}/></dl></section>
          <section className="inspector-section"><h3>Participants</h3><div className="participant-pair"><div>{selectedEventSource && <Avatar participant={selectedEventSource} size="small"/>}<span><small>Source</small><strong>{selectedEvent.source_id}</strong></span></div><Icon name="route" size={16}/><div>{selectedEventTarget && <Avatar participant={selectedEventTarget} size="small"/>}<span><small>Target</small><strong>{selectedEvent.target_id || "Not present"}</strong></span></div></div></section>
          <section className="inspector-section"><h3>Trace coordinates</h3><dl><Field label="Session" value={selectedEvent.session_id}/><Field label="Trace" value={selectedEvent.trace_id}/><Field label="Transaction" value={selectedEvent.transaction_id}/><Field label="Parent" value={selectedEvent.parent_event_id}/></dl>{selectedEvent.parent_event_id && activeMessages.some((message) => message.event_id === selectedEvent.parent_event_id) && <button type="button" className="focus-parent" onClick={() => focusEvent(selectedEvent.parent_event_id)}><Icon name="link" size={14}/>Focus parent event</button>}</section>
          <section className="inspector-section"><h3>Causal chain</h3><ol className="chain-list">{chain.map((message) => <li key={`chain-${message.event_id}`} className={message.event_id === selectedEvent.event_id ? "active" : ""}><button type="button" onClick={() => focusEvent(message.event_id)}><i/><span><strong>{shortId(message.event_id, 19)}</strong><small>{message.source_id} → {message.target_id || "—"}</small></span></button></li>)}</ol></section>
          <section className="inspector-section event-index"><h3>Session events</h3>{activeMessages.slice(-12).reverse().map((message) => <button type="button" key={`index-${message.event_id}`} className={message.event_id === selectedEvent.event_id ? "active" : ""} onClick={() => focusEvent(message.event_id)}><span>{eventTime(message.timestamp_ms)}</span><strong>{shortId(message.content, 34)}</strong></button>)}</section>
        </div> : <div className="inspector-empty"><Icon name="focus" size={25}/><h3>No event selected</h3><p>Choose an event node to inspect its participants, identifiers, and explicit parent chain.</p></div>}
      </aside>

      <section className={chatOpen ? "chat-dock open" : "chat-dock"} aria-label="Conversation drawer">
        <button type="button" className="chat-dock-handle" onClick={toggleChat} aria-expanded={chatOpen}><span><Icon name="chat" size={16}/><strong>{selected ? `Conversation with ${selected.id}` : "Conversation"}</strong><small>{messages.length} messages · {sending ? "sending" : "trace synchronized"}</small></span><span><code>{conversationSessionId || "no route"}</code><Icon name="chevron" size={15}/></span></button>
        {chatOpen && <div className="chat-dock-body">
          <div className="message-list" role="log" aria-live="polite" aria-label="Conversation history">
            {!messages.length && <div className="chat-empty"><Icon name="route" size={20}/><span><strong>Quiet channel</strong><small>Send the first message. Ark will preserve its session, trace, transaction, and causal parent.</small></span></div>}
            {messages.map((message) => {
              const own = message.source_id === current.id;
              return <article key={message.event_id} className={own ? "chat-message own" : "chat-message"}><Avatar participant={participants.find((item) => item.id === message.source_id) || current} size="tiny"/><div className="chat-message-card"><header><strong>{own ? "You" : message.source_id}</strong><time dateTime={new Date(message.timestamp_ms).toISOString()}>{eventTime(message.timestamp_ms)}</time></header><p>{message.content}</p><footer><span>{message.parent_event_id ? `Reply to ${shortId(message.parent_event_id, 10)}` : "Root event"}</span><code>{shortId(message.event_id, 13)}</code></footer></div></article>;
            })}
            {sending && <article className="chat-message own pending"><Avatar participant={current} size="tiny"/><div className="chat-message-card"><header><strong>You</strong><span>Routing</span></header><p>{draft || "Routing message…"}</p><footer><span>Writing immutable event</span></footer></div></article>}
            <div ref={endRef}/>
          </div>
          <form className="composer" onSubmit={send}><div className="composer-heading"><span>New message</span><strong>{selected ? `to ${selected.id}` : "No recipient"}</strong></div><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} placeholder={selected ? `Message ${selected.id}` : "Choose a participant first"} rows="2" disabled={!selected}/><button type="submit" disabled={!draft.trim() || !!sending || !selected} aria-label="Send message"><Icon name={sending ? "sync" : "send"} size={18}/></button><small>Enter to send · Shift + Enter for newline</small></form>
        </div>}
      </section>

      {error && <button type="button" className="error-toast" onClick={() => setError("")}><span><strong>Ark needs attention</strong>{error}</span><Icon name="close" size={15}/></button>}
    </main>
  );
}
