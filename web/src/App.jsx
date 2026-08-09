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

const avatarLooks = [
  { skin: "#f3c7a5", skinShadow: "#dfa47c", hair: "#2d4052", shirt: "#4c9bd3", shirtShadow: "#2479b7" },
  { skin: "#9d684c", skinShadow: "#754a36", hair: "#1c2935", shirt: "#8e8bd1", shirtShadow: "#6965ae" },
  { skin: "#e6ad7e", skinShadow: "#c9855f", hair: "#6b4633", shirt: "#47a7a0", shirtShadow: "#2b7d78" },
  { skin: "#f0d0bd", skinShadow: "#d8a98d", hair: "#a85f45", shirt: "#ee8f70", shirtShadow: "#c9674c" },
  { skin: "#75472f", skinShadow: "#56311f", hair: "#29211f", shirt: "#6f94c7", shirtShadow: "#4f70a0" },
  { skin: "#d99572", skinShadow: "#b87355", hair: "#442b58", shirt: "#d477a8", shirtShadow: "#a84f7d" },
  { skin: "#f2c2b5", skinShadow: "#d69789", hair: "#174d5f", shirt: "#e2ad4f", shirtShadow: "#b77b24" },
];
const skinChoices = [avatarLooks[0]];
const hairColors = ["#1c2935", "#6b4633", "#a85f45", "#e6b84f", "#174d5f", "#442b58", "#8a294f", "#d8d4c8"];
const eyeColors = ["#1c2730", "#3a3027", "#203f52", "#294634", "#49324f"];
const hairStyleNames = ["Spikes", "Sweep", "Crop"];
const accessoryNames = ["None", "Hat"];
const expressionNames = ["Neutral", "Smirk"];

const avatarSeed = (id) => [...id].reduce((total, character) => ((total * 31) + character.codePointAt(0)) >>> 0, 7);
const defaultAvatar = (id) => {
  const hash = avatarSeed(id);
  return {
    skinTone: 0,
    hairStyle: hash % hairStyleNames.length,
    hairColor: Math.floor(hash / 3) % hairColors.length,
    eyeColor: Math.floor(hash / 5) % eyeColors.length,
    outfitColor: Math.floor(hash / 11) % avatarLooks.length,
    accessory: Math.floor(hash / 17) % accessoryNames.length,
    expression: Math.floor(hash / 7) % expressionNames.length,
  };
};

const normalizeAvatar = (avatar) => ({
  skinTone: 0,
  hairStyle: avatar.hairStyle % hairStyleNames.length,
  hairColor: avatar.hairColor % hairColors.length,
  eyeColor: avatar.eyeColor % eyeColors.length,
  outfitColor: avatar.outfitColor % avatarLooks.length,
  accessory: avatar.accessory === 2 ? 1 : avatar.accessory % accessoryNames.length,
  expression: avatar.expression % expressionNames.length,
});

const avatarLook = (id, savedAvatar) => {
  const avatar = normalizeAvatar(savedAvatar || defaultAvatar(id));
  const skin = skinChoices[0];
  const outfit = avatarLooks[avatar.outfitColor % avatarLooks.length];
  return {
    skin: skin.skin,
    skinShadow: skin.skinShadow,
    hair: hairColors[avatar.hairColor % hairColors.length],
    shirt: outfit.shirt,
    shirtShadow: outfit.shirtShadow,
    variant: avatar.hairStyle % hairStyleNames.length,
    expression: avatar.expression % expressionNames.length,
    accessory: avatar.accessory % accessoryNames.length,
    eye: eyeColors[avatar.eyeColor % eyeColors.length],
  };
};

function AvatarPortrait({ participant, mapRadius }) {
  const look = avatarLook(participant.id, participant.avatar);
  const portrait = (
    <>
      <ellipse className="avatar-depth" cx="24" cy="44" rx="15" ry="3.5" />
      <path className="avatar-shirt-shadow" d="M7 48c.8-9.6 6.8-15 17-15s16.2 5.4 17 15Z" />
      <path className="avatar-shirt" d="M10 48c.9-7.5 5.9-11.5 14-11.5S37.1 40.5 38 48Z" />
      <path className="avatar-neck-shadow" d="M19 29h10v9.5c-2.9 2.3-7.1 2.3-10 0Z" />
      <path className="avatar-neck" d="M20.5 29h7v8.4c-2 1.5-5 1.5-7 0Z" />
      <circle className="avatar-ear" cx="12.8" cy="22.5" r="3.1" />
      <circle className="avatar-ear" cx="35.2" cy="22.5" r="3.1" />
      <path className="avatar-face-shadow" d="M24 6.5c7.4 0 12.1 5.5 11.7 14.3-.4 8.8-5.4 14.3-11.7 14.3-6.4 0-11.4-5.5-11.7-14.3C11.9 12 16.6 6.5 24 6.5Z" />
      <path className="avatar-face" d="M23.2 6.3c7 0 11.3 5.3 10.9 13.7-.3 8.3-4.9 13.4-10.9 13.4-6 0-10.6-5.1-10.9-13.4-.4-8.4 3.9-13.7 10.9-13.7Z" />
      {look.variant === 0 && <path className="avatar-hair" d="M12.4 18.1C11.9 9.8 16.4 5.6 24 5.6c8.1 0 12 5.2 11.3 13.1-2-1.5-3.4-4-3.8-6.4-3.8 3.1-10.4 4.2-16.5 2.8-.3 1.2-1.2 2.3-2.6 3Z" />}
      {look.variant === 1 && <path className="avatar-hair" d="M12.2 19.4C10.6 11.5 15.5 4.9 24 5.1c8.8.2 12.9 6.7 11.3 15.1l-2.4-5.8-2.3-3.1-2.1 2-2.6-2.5-2.7 2.5-2.6-2.2-3 3.6Z" />}
      {look.variant === 2 && <path className="avatar-hair" d="M12.5 20C10.8 10.5 16.1 5 24 5c6.8 0 10.4 3.6 11.4 10.6-4.1-3.5-8.5-4.4-13.2-2.8-3 1-5.4 3.4-6.7 7.2Z" />}
      <ellipse className="avatar-highlight" cx="18.2" cy="17.4" rx="2.7" ry="6.6" />
      <path className="avatar-brow" d={look.expression === 0 ? "m16.7 17.3 5.1-1.4m4.2 0 5.2 1.4" : "m16.8 16.6 5.1.4m4.2 0 5.1-.4"} />
      <path className="avatar-eye-white" d="M17 21c.7-2.5 4.5-2.5 5.2 0-.7 2.6-4.5 2.6-5.2 0Zm8.8 0c.7-2.5 4.5-2.5 5.2 0-.7 2.6-4.5 2.6-5.2 0Z" />
      <circle className="avatar-iris" cx="19.6" cy="21" r="1.45" />
      <circle className="avatar-iris" cx="28.4" cy="21" r="1.45" />
      <circle className="avatar-pupil" cx="19.6" cy="21" r=".7" />
      <circle className="avatar-pupil" cx="28.4" cy="21" r=".7" />
      <circle className="avatar-eye-shine" cx="19.1" cy="20.5" r=".35" />
      <circle className="avatar-eye-shine" cx="27.9" cy="20.5" r=".35" />
      <path className="avatar-nose" d="m24 20-2.2 5.4c.6 1.8 3.5 2.1 5 .6" />
      <path className="avatar-smile" d={look.expression === 0 ? "M20.5 29h7" : "M21 28.5q3 1.4 6 0"} />
      {look.accessory === 1 && <><ellipse className="avatar-hat-brim" cx="24" cy="9" rx="13" ry="3"/><path className="avatar-hat" d="M17 9c0-6 2-8 7-8s7 2 7 8Z"/><path className="avatar-hat-band" d="M17 7h14v3H17Z"/></>}
      {participant.kind === "agent" && <><path className="avatar-headset" d="M13.2 22v-2.7C13.2 11.9 17.5 8 24 8s10.8 3.9 10.8 11.3V22" /><rect className="avatar-headset-pad" x="10.7" y="20" width="4.4" height="7" rx="2" /><rect className="avatar-headset-pad" x="32.9" y="20" width="4.4" height="7" rx="2" /><path className="avatar-headset" d="M35 26.5c0 3.1-2.1 4.5-5.2 4.5h-2" /><circle className="avatar-mic" cx="27.4" cy="31" r="1.3" /></>}
    </>
  );
  const style = {
    "--portrait-skin": look.skin,
    "--portrait-skin-shadow": look.skinShadow,
    "--portrait-hair": look.hair,
    "--portrait-shirt": look.shirt,
    "--portrait-shirt-shadow": look.shirtShadow,
    "--portrait-eye": look.eye,
  };

  if (mapRadius) {
    const scale = (mapRadius * 2) / 48;
    return <g className="avatar-portrait map-portrait" style={style} transform={`translate(${-mapRadius} ${-mapRadius}) scale(${scale})`}>{portrait}</g>;
  }

  return <svg className="avatar-portrait" style={style} viewBox="0 0 48 48" focusable="false" aria-hidden="true">{portrait}</svg>;
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
    edit: <><path d="m4 20 4.2-1 10.7-10.7a2.2 2.2 0 0 0-3.1-3.1L5.1 15.9 4 20Z"/><path d="m14.5 6.5 3 3"/></>,
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

function MapAvatar({ participant, current = false, scale = 1, animated = true }) {
  const look = avatarLook(participant.id, participant.avatar);
  const style = {
    "--portrait-skin": look.skin,
    "--portrait-skin-shadow": look.skinShadow,
    "--portrait-hair": look.hair,
    "--portrait-shirt": look.shirt,
    "--portrait-shirt-shadow": look.shirtShadow,
    "--portrait-eye": look.eye,
  };

  return (
    <g className={`map-character ${current ? "map-character-current" : ""}`} style={style} transform={`scale(${current ? 1.26 : scale})`}>
      <ellipse className="map-character-shadow" cx="0" cy="22" rx="17" ry="6" />
      <ellipse className="map-presence-ring" cx="0" cy="20" rx="23" ry="10" />
      <g className="walker-leg walker-leg-left">
        {animated && <animateTransform attributeName="transform" type="rotate" values="-8 -5 5;8 -5 5;-8 -5 5" dur=".8s" repeatCount="indefinite" />}
        <path className="walker-trouser" d="M-8 4h7l-1.5 15h-6Z" />
        <path className="walker-cuff" d="M-8.4 14h6.3l-.4 5h-6Z" />
        <ellipse className="walker-shoe" cx="-6" cy="19" rx="5.5" ry="2.5" />
      </g>
      <g className="walker-leg walker-leg-right">
        {animated && <animateTransform attributeName="transform" type="rotate" values="8 5 5;-8 5 5;8 5 5" dur=".8s" repeatCount="indefinite" />}
        <path className="walker-trouser" d="M1 4h7l.5 15h-6Z" />
        <path className="walker-cuff" d="M1.8 14h6.6l.1 5h-6Z" />
        <ellipse className="walker-shoe" cx="6" cy="19" rx="5.5" ry="2.5" />
      </g>
      <path className="walker-arm-shadow" d="M-10-7c-5 5-6 12-4 17M10-7c5 5 6 12 4 17" />
      <path className="walker-torso-shadow" d="M-12-9Q0-15 12-9l-2 17H-10Z" />
      <path className="walker-torso" d="M-10-10Q0-14 10-10L8 6H-8Z" />
      <path className="walker-vest" d="M-10-9h6L0-3-4 6h-4Zm20 0H4L0-3l4 9h4Z" />
      <path className="walker-chest" d="M-4-6q4 3 8 0M0-3v5" />
      <path className="walker-sash" d="M-9 1Q0 4 9 1v4Q0 8-9 5Z" />
      <path className="walker-collar" d="m-4-11 4 5 4-5" />
      <rect className="walker-neck-shadow" x="-4.5" y="-18" width="9" height="9" rx="3" />
      <rect className="walker-neck" x="-3.5" y="-18" width="7" height="8" rx="3" />
      <circle className="walker-ear" cx="-12" cy="-28" r="3" />
      <circle className="walker-ear" cx="12" cy="-28" r="3" />
      <path className="walker-face-shadow" d="M0-44c9 0 14 7 13 16 0 11-6 17-13 18-8-1-13-8-13-18-1-9 4-16 13-16Z" />
      <path className="walker-face" d="M-1-44c9 0 13 7 12 16 0 10-5 16-12 17-7-1-12-8-12-17-1-9 4-16 12-16Z" />
      {look.variant === 0 && <path className="walker-hair" d="M-12-30c0-9 5-14 12-14 8 0 13 6 12 15-3-2-4-5-4-8-5 4-12 5-19 3l-1 4Z" />}
      {look.variant === 1 && <path className="walker-hair" d="M-12-29c-2-9 3-16 12-16s14 7 12 16l-3-7-3 3-3-4-3 4-4-4-4 8Z" />}
      {look.variant === 2 && <path className="walker-hair" d="M-12-28c-2-10 3-16 12-16 8 0 12 5 12 13-5-4-10-5-15-2-4 2-7 4-9 5Z" />}
      <ellipse className="walker-face-highlight" cx="-5" cy="-31" rx="2.5" ry="5" />
      <path className="walker-brow" d={look.expression === 0 ? "m-8-34 6-2m4 0 6 2" : "m-8-35 6 1m4 0 6-1"} />
      <path className="walker-eye-white" d="M-8-29c1-3 6-3 7 0-1 3-6 3-7 0Zm9 0c1-3 6-3 7 0-1 3-6 3-7 0Z" />
      <circle className="walker-iris" cx="-4.5" cy="-29" r="1.9" />
      <circle className="walker-iris" cx="4.5" cy="-29" r="1.9" />
      <circle className="walker-pupil" cx="-4.5" cy="-29" r=".9" />
      <circle className="walker-pupil" cx="4.5" cy="-29" r=".9" />
      <circle className="walker-eye-shine" cx="-5.1" cy="-29.7" r=".45" />
      <circle className="walker-eye-shine" cx="3.9" cy="-29.7" r=".45" />
      <path className="walker-nose" d="M0-29c-1 2-3 5-3 7 2 2 5 2 7 0" />
      <path className="walker-mii-mouth" d={look.expression === 0 ? "M-5-17h10" : "M-5-18q5 2 10 0"} />
      {look.accessory === 1 && <><ellipse className="walker-hat-brim" cx="0" cy="-41" rx="15" ry="3.2"/><path className="walker-hat" d="M-8-41c0-7 3-10 8-10s8 3 8 10Z"/><path className="walker-hat-band" d="M-8-44H8v4H-8Z"/></>}
      {participant.kind === "agent" && <><path className="walker-headset" d="M-11-30v-2c0-8 5-13 11-13s11 5 11 13v2" /><rect className="walker-headset-pad" x="-14" y="-32" width="4" height="8" rx="2" /><rect className="walker-headset-pad" x="10" y="-32" width="4" height="8" rx="2" /><path className="walker-headset" d="M12-25c0 4-3 6-7 6" /><circle className="walker-mic" cx="4" cy="-19" r="1.4" /></>}
    </g>
  );
}

function AvatarCustomizer({ editor, saving, onChange, onCancel, onSave }) {
  const participant = { id: editor.id, kind: "user", avatar: editor.avatar };
  const setChoice = (field, value) => onChange({ ...editor, avatar: { ...editor.avatar, [field]: value } });
  const colorRows = [
    ["Skin", "skinTone", skinChoices.map((look) => look.skin)],
    ["Hair", "hairColor", hairColors],
    ["Eyes", "eyeColor", eyeColors],
    ["Outfit", "outfitColor", avatarLooks.map((look) => look.shirt)],
  ];
  const styleRows = [
    ["Hair style", "hairStyle", hairStyleNames],
    ["Accessory", "accessory", accessoryNames],
    ["Expression", "expression", expressionNames],
  ];

  return (
    <div className="avatar-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="avatar-editor" role="dialog" aria-modal="true" aria-labelledby="avatar-editor-title">
        <header><div><span className="eyebrow">IDENTITY STUDIO</span><h2 id="avatar-editor-title">Build {editor.id}</h2></div><button type="button" onClick={onCancel} aria-label="Close avatar editor"><Icon name="close" size={18}/></button></header>
        <div className="avatar-editor-body">
          <div className="avatar-preview-stage">
            <span className="preview-orbit orbit-one"/><span className="preview-orbit orbit-two"/>
            <svg viewBox="-52 -68 104 116" role="img" aria-label={`Avatar preview for ${editor.id}`}><g transform="translate(0 8) scale(1.45)"><MapAvatar participant={participant} animated={false}/></g></svg>
            <strong>{editor.id}</strong><small>LIVE PREVIEW</small>
          </div>
          <div className="avatar-controls">
            {colorRows.map(([label, field, colors]) => <fieldset key={field}><legend>{label}</legend><div className="swatch-options">{colors.map((color, index) => <button key={color} type="button" className={editor.avatar[field] === index ? "avatar-swatch selected" : "avatar-swatch"} style={{ "--swatch": color }} onClick={() => setChoice(field, index)} aria-label={`${label} ${index + 1}`} aria-pressed={editor.avatar[field] === index}/>)}</div></fieldset>)}
            {styleRows.map(([label, field, choices]) => <fieldset key={field}><legend>{label}</legend><div className="choice-options">{choices.map((choice, index) => <button key={choice} type="button" className={editor.avatar[field] === index ? "selected" : ""} onClick={() => setChoice(field, index)} aria-pressed={editor.avatar[field] === index}>{choice}</button>)}</div></fieldset>)}
          </div>
        </div>
        <footer><button type="button" className="editor-cancel" onClick={onCancel}>Cancel</button><button type="button" className="editor-save" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save look"}</button></footer>
      </section>
    </div>
  );
}

function InteractionMap({ current, contacts, selectedId, sending, messages, sessionId, onSelect }) {
  const shown = contacts.slice(0, 6);
  const points = shown.map((contact, index) => {
    const angle = shown.length === 1 ? 0 : (index * 2 * Math.PI) / shown.length;
    return {
      ...contact,
      x: 260 + 132 * Math.cos(angle),
      y: 390 + 158 * Math.sin(angle),
      roamX: 22 + (index % 3) * 7,
      roamY: 12 + ((index + 1) % 3) * 5,
      duration: 9 + (index % 4) * 1.4,
      scale: .96 + (390 + 158 * Math.sin(angle)) / 2500,
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
      <svg className="interaction-map" viewBox="0 0 520 800" role="img" aria-label="Live participant nature map">
        <defs>
          <filter id="glow" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="node-shadow" x="-70%" y="-70%" width="240%" height="240%"><feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#315d78" floodOpacity=".25"/></filter>
          <linearGradient id="town-wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f7fcff" stopOpacity=".06"/><stop offset=".7" stopColor="#e8f5ff" stopOpacity=".12"/><stop offset="1" stopColor="#244b63" stopOpacity=".24"/></linearGradient>
        </defs>
        <image className="town-map-background" href="/port-town-map.webp" x="0" y="0" width="520" height="800" preserveAspectRatio="xMidYMid slice" />
        <rect className="town-map-wash" width="520" height="800" fill="url(#town-wash)" />
        <ellipse className="town-plaza-focus" cx="260" cy="390" rx="190" ry="235" />
        {points.map((point) => <g key={`pad-${point.id}`} className="world-node-pad" transform={`translate(${point.x} ${point.y + 22})`}><ellipse className="world-pad-side" cy="4" rx="27" ry="10"/><ellipse className="world-pad" rx="27" ry="10"/></g>)}
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
            <text className="map-label current-label" x="0" y="43" textAnchor="middle">{current.id}</text>
          </g>
        </g>
        {points.map((point, index) => (
          <g key={point.id} onClick={() => onSelect(point.id)} className={`map-node map-contact ${point.kind} ${point.id === selectedId ? "selected" : ""}`} transform={`translate(${point.x} ${point.y})`}>
            <g className="map-walker">
              <animateTransform attributeName="transform" type="translate" values={`${-point.roamX} 0;${point.roamX / 2} ${-point.roamY};${point.roamX} 1;${-point.roamX / 3} ${point.roamY};${-point.roamX} 0`} dur={`${point.duration}s`} begin={`${index * -.8}s`} repeatCount="indefinite" />
              <MapAvatar participant={point} scale={point.scale} />
              <text className="map-label" x="0" y="43" textAnchor="middle">{point.id}</text>
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
  const [avatarEditor, setAvatarEditor] = useState(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
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
      const created = await api("/api/participants", { method: "POST", body: JSON.stringify({ id, kind: "user", avatar: defaultAvatar(id) }) });
      setParticipants((existing) => [...existing.filter((item) => item.id !== created.id), created]);
      setNewUser("");
      switchUser(created.id);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setCreatingUser(false);
    }
  };

  const editCurrentAvatar = () => {
    if (current.kind !== "user") return;
    setAvatarEditor({ id: current.id, avatar: normalizeAvatar(current.avatar || defaultAvatar(current.id)) });
  };

  const saveAvatar = async () => {
    if (!avatarEditor || savingAvatar) return;
    setSavingAvatar(true);
    setError("");
    try {
      const updated = await api(`/api/participants/${encodeURIComponent(avatarEditor.id)}/avatar`, { method: "PUT", body: JSON.stringify(avatarEditor.avatar) });
      setParticipants((existing) => existing.map((item) => item.id === updated.id ? updated : item));
      setAvatarEditor(null);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSavingAvatar(false);
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
        <div className={identityDeleteArmed ? "identity-select delete-armed" : "identity-select"}><Avatar participant={current} small/><select id="identity" value={currentId} onChange={(event) => switchUser(event.target.value)}>{participants.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.kind}</option>)}</select><button type="button" className="identity-customize" disabled={current.kind !== "user"} onClick={editCurrentAvatar} aria-label={`Customize ${current.id}`} title={current.kind === "user" ? "Customize avatar" : "Only user avatars can be customized"}><Icon name="edit" size={15}/></button><button type="button" className="identity-delete" disabled={participants.length <= 1 || deletingIdentity} onClick={deleteIdentity} onBlur={() => window.setTimeout(() => setIdentityDeleteArmed(false), 140)} aria-label={identityDeleteArmed ? `Confirm permanent deletion of ${current.id}` : `Delete active identity ${current.id}`} title={participants.length <= 1 ? "Create another identity before deleting this one" : identityDeleteArmed ? "Click again to permanently delete identity and graph paths" : "Delete active identity"}><Icon name={deletingIdentity ? "sync" : identityDeleteArmed ? "check" : "trash"} size={15}/></button></div>
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
      {avatarEditor && <AvatarCustomizer editor={avatarEditor} saving={savingAvatar} onChange={setAvatarEditor} onCancel={() => setAvatarEditor(null)} onSave={saveAvatar}/>}
      {error && <button className="error-toast" onClick={() => setError("")}>{error}<span><Icon name="close" size={15}/></span></button>}
    </main>
  );
}
