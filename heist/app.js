// Heist screens: open or join a room, the lobby, then five heists: the leader picks a team, everyone votes,
// the team plays its cards in secret, with big announcements for each result.
import { REACTIONS } from "../supabase/functions/_shared/poker-room.js";
import { avatarSvg, PRESETS, DEFAULT_AVATAR } from "../poker/avatars.js";
import { openLook } from "../poker/look.js";
import { play as sound } from "../poker/sound.js";
// the music follows the game (theme.js; does nothing while the music is off)
const cue = { level: i => window.CR_CUE && window.CR_CUE.level(i), sting: k => window.CR_CUE && window.CR_CUE.sting(k) };

const $ = id => document.getElementById(id);
const CONFIG = window.POKER_CONFIG || {};
const onlineEnabled = !!(CONFIG.supabaseUrl && CONFIG.anonKey);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const online = () => import("./online.js");
const isCop = r => r === "cop" || r === "sniper";

// ---------- pictures ----------
const ICONS = {
  lobby: `<svg viewBox="0 0 100 100"><rect x="14" y="22" width="72" height="62" rx="8" fill="#455a64" stroke="#90a4ae" stroke-width="3"/><circle cx="50" cy="53" r="20" fill="#263238" stroke="#cfd8dc" stroke-width="3"/><circle cx="50" cy="53" r="5" fill="#f2c14e"/>${Array.from({ length: 8 }, (_, i) => `<path d="M50 36 V40" stroke="#cfd8dc" stroke-width="3" transform="rotate(${i * 45} 50 53)"/>`).join("")}<rect x="78" y="40" width="6" height="26" rx="2" fill="#cfd8dc"/></svg>`,
  crew: `<svg viewBox="0 0 100 100"><path d="M18 90 C18 66 34 58 50 58 C66 58 82 66 82 90Z" fill="#263238"/><circle cx="50" cy="38" r="18" fill="#ffcc80"/><path d="M31 34 H69 V42 H31Z" fill="#111"/><circle cx="41" cy="38" r="3.5" fill="#fff"/><circle cx="59" cy="38" r="3.5" fill="#fff"/><path d="M32 24 C36 14 64 14 68 24 L68 30 H32Z" fill="#37474f"/><path d="M60 70 L74 62 L80 74 L66 82Z" fill="#f2c14e" stroke="#8d6e1a" stroke-width="2"/><text x="72" y="76" font-size="10" text-anchor="middle" fill="#5d4210" font-weight="700">$</text></svg>`,
  cop: `<svg viewBox="0 0 100 100"><path d="M18 90 C18 66 34 58 50 58 C66 58 82 66 82 90Z" fill="#1e3a8a"/><circle cx="50" cy="40" r="17" fill="#ffcc80"/><path d="M28 30 C30 14 70 14 72 30 L76 34 H24Z" fill="#1e3a8a"/><path d="M28 31 H72 V36 H28Z" fill="#111"/><path d="M50 18 L54 25 L50 28 L46 25Z" fill="#f2c14e"/><path d="M44 66 L50 62 L56 66 L54 76 L50 79 L46 76Z" fill="#f2c14e"/><circle cx="44" cy="41" r="2.4" fill="#3e2723"/><circle cx="56" cy="41" r="2.4" fill="#3e2723"/></svg>`,
  mastermind: `<svg viewBox="0 0 100 100"><path d="M18 90 C18 66 34 58 50 58 C66 58 82 66 82 90Z" fill="#4527a0"/><circle cx="50" cy="38" r="17" fill="#ffcc80"/><path d="M30 26 C34 6 66 6 70 26Z" fill="#311b92"/><circle cx="58" cy="38" r="7" fill="none" stroke="#f2c14e" stroke-width="2.5"/><path d="M64 43 L68 54" stroke="#f2c14e" stroke-width="2"/><circle cx="42" cy="38" r="2.4" fill="#3e2723"/><circle cx="58" cy="38" r="2.4" fill="#3e2723"/><path d="M44 47 C48 50 52 50 56 47" stroke="#3e2723" stroke-width="2" fill="none"/></svg>`,
  sniper: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" fill="none" stroke="#ff8a80" stroke-width="4"/><circle cx="50" cy="50" r="18" fill="none" stroke="#ff8a80" stroke-width="3"/><path d="M50 8 V30 M50 70 V92 M8 50 H30 M70 50 H92" stroke="#ff8a80" stroke-width="4"/><circle cx="50" cy="50" r="4" fill="#ff5252"/></svg>`,
  pick: `<svg viewBox="0 0 100 100"><circle cx="30" cy="40" r="11" fill="#ffcc80"/><circle cx="70" cy="40" r="11" fill="#ffcc80"/><circle cx="50" cy="32" r="13" fill="#ffe0b2"/><path d="M12 82 C12 62 48 62 48 82Z M52 82 C52 62 88 62 88 82Z" fill="#455a64"/><path d="M28 88 C28 58 72 58 72 88Z" fill="#607d8b"/><path d="M40 14 L50 6 L60 14 L56 22 H44Z" fill="#f2c14e"/></svg>`,
  vote: `<svg viewBox="0 0 100 100"><path d="M18 52 H34 V86 H18Z" fill="#81c784"/><path d="M34 54 L48 30 C50 24 58 26 56 34 L54 46 H72 C78 46 80 52 78 56 L72 80 C70 84 66 86 62 86 H34Z" fill="#c8e6c9" stroke="#2e7d32" stroke-width="3"/></svg>`,
  heist: `<svg viewBox="0 0 100 100"><rect x="12" y="20" width="76" height="64" rx="6" fill="#37474f" stroke="#90a4ae" stroke-width="3"/><circle cx="50" cy="52" r="20" fill="#263238" stroke="#f2c14e" stroke-width="3"/><path d="M50 52 L62 44" stroke="#f2c14e" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="52" r="4" fill="#f2c14e"/></svg>`,
  ok: `<svg viewBox="0 0 100 100"><path d="M20 40 H80 L74 86 H26Z" fill="#e0a526" stroke="#8d6e1a" stroke-width="3"/><path d="M34 40 C34 24 66 24 66 40" stroke="#8d6e1a" stroke-width="5" fill="none"/><text x="50" y="72" font-size="28" text-anchor="middle" fill="#3a2a06" font-weight="800">$</text></svg>`,
  fail: `<svg viewBox="0 0 100 100"><rect x="22" y="34" width="56" height="34" rx="6" fill="#1d4fb8"/><rect x="30" y="22" width="18" height="14" rx="3" fill="#ff5252"/><rect x="52" y="22" width="18" height="14" rx="3" fill="#448aff"/><circle cx="34" cy="74" r="9" fill="#263238"/><circle cx="66" cy="74" r="9" fill="#263238"/><path d="M28 48 H72" stroke="#fff" stroke-width="4"/></svg>`,
  reject: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" fill="#eceff1" stroke="#c62828" stroke-width="6"/><path d="M28 28 L72 72" stroke="#c62828" stroke-width="7"/></svg>`
};
const ROLE_NAME = { crew: "Crew", cop: "Undercover cop", mastermind: "Mastermind", sniper: "Sniper" };
const ROLE_COLOR = { crew: "#c48b0c", cop: "#1e3a8a", mastermind: "#4527a0", sniper: "#b71c1c" };
const ROLE_HELP = {
  crew: "Pull off 3 heists. Pick teams you trust, and vote down teams that smell like cops.",
  cop: "Sabotage 3 heists without getting caught. You know the other cops.",
  mastermind: "You're crew, and you know who the cops are. Steer the crew, but quietly: the Sniper is watching.",
  sniper: "You're a cop. If the crew wins 3 heists, you get one shot: name the Mastermind and the cops win."
};

// ---------- your look ----------
const myAvatar = () => store.get("pk-avatar", DEFAULT_AVATAR);
function drawLookButtons() { document.querySelectorAll("[data-look]").forEach(b => b.innerHTML = `<span class="av">${avatarSvg(myAvatar())}</span>`); }
document.querySelectorAll("[data-look]").forEach(b => b.addEventListener("click", async () => { const code = await openLook(myAvatar()); if (code) { store.set("pk-avatar", code); drawLookButtons(); } }));
function avatarOf(p) {
  if (p && p.avatar) return p.avatar;
  let h = 0; for (const ch of (p && p.name) || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PRESETS[h % PRESETS.length].code;
}
const miniAv = code => `<span class="mini-av">${avatarSvg(code)}</span>`;

// ---------- screens ----------
function showScreen(id) {
  ["scrSetup", "scrRoom"].forEach(s => $(s).hidden = s !== id);
  $("meters").hidden = id !== "scrRoom";
  if (id !== "scrRoom") document.body.className = "";
}
let ctrl = null, unsub = null, view = null;
function attach(c) {
  if (unsub) unsub();
  if (ctrl && ctrl !== c) ctrl.destroy();
  ctrl = c; lastSeen = null; revealQueue = []; chatTab = "all"; lastChatN = null; roleOpen = false; choosing = [];
  showScreen("scrRoom");
  unsub = ctrl.subscribe(v => { view = v; render(); });
}
function backToLobby() {
  if (ctrl) ctrl.destroy();
  if (unsub) unsub();
  ctrl = null; view = null; unsub = null;
  initSetup();
}
const nameOf = id => $(id).value.trim().replace(/\s+/g, " ").slice(0, 16);
function guard(fn) { return async (...a) => { try { await fn(...a); } catch (err) { flash(err.message); } }; }
function flash(text) { const h = document.querySelector(".ww-actions .hint") || $("phaseText"); if (h) h.textContent = text; }

$("formCreate").addEventListener("submit", guard(async e => {
  e.preventDefault();
  const name = nameOf("crName");
  if (!name) return $("crErr").textContent = "Enter your name.";
  $("crErr").textContent = ""; $("btnCreate").disabled = true;
  try { store.set("pk-name", name); const { OnlineHeist } = await online(); attach(await OnlineHeist.create({ name, avatar: myAvatar() })); }
  catch (err) { $("crErr").textContent = err.message; }
  finally { $("btnCreate").disabled = false; }
}));
$("formJoin").addEventListener("submit", async e => {
  e.preventDefault();
  const code = $("jnCode").value.trim().toUpperCase(), name = nameOf("jnName");
  if (code.length !== 6) return $("jnErr").textContent = "Room codes are 6 letters and numbers.";
  if (!name) return $("jnErr").textContent = "Enter your name.";
  $("jnErr").textContent = ""; $("btnJoin").disabled = true;
  try { store.set("pk-name", name); const { OnlineHeist } = await online(); attach(await OnlineHeist.join({ code, name, avatar: myAvatar() })); }
  catch (err) { $("jnErr").textContent = err.message; }
  finally { $("btnJoin").disabled = false; }
});
$("jnCode").addEventListener("change", async () => {
  const code = $("jnCode").value.trim().toUpperCase();
  $("jnRules").textContent = "";
  if (code.length !== 6 || !onlineEnabled) return;
  try {
    const { peekRoom } = await online();
    const r = await peekRoom(code);
    $("jnRules").textContent = !r ? "No open room with that code." : r.game !== "heist" ? "That code is a different game. Join it from its own page." : `${r.humans} ${r.humans === 1 ? "person" : "people"} in the room${r.settings.special ? " · special roles on" : ""}`;
  } catch {}
});
$("btnRejoin").addEventListener("click", async () => {
  try { const { OnlineHeist } = await online(); attach(await OnlineHeist.resume()); }
  catch (err) { $("jnErr").textContent = err.message; $("btnRejoin").hidden = true; }
});
const params = new URLSearchParams(location.search);
function initSetup() {
  const name = store.get("pk-name", "");
  if (name) { $("crName").value = name; $("jnName").value = name; }
  drawLookButtons();
  $("formCreate").hidden = $("formJoin").hidden = !onlineEnabled;
  $("onlineOff").hidden = onlineEnabled;
  showScreen("scrSetup");
  if (!onlineEnabled) return;
  if (params.get("code") && params.get("host")) {
    const code = params.get("code").toUpperCase().slice(0, 6), key = params.get("host");
    window.history.replaceState(null, "", location.pathname);
    online().then(m => m.OnlineHeist.claim({ code, hostKey: key })).then(attach).catch(err => { $("jnCode").value = code; $("jnErr").textContent = err.message; });
    return;
  }
  if (params.get("code")) { $("jnCode").value = params.get("code").toUpperCase().slice(0, 6); $("jnCode").dispatchEvent(new Event("change")); }
  online().then(m => { $("btnRejoin").hidden = !m.hasSavedSeat(); }).catch(() => {});
}

// ---------- the room ----------
let lastTurnCue = null;
let roleOpen = false, chatTab = "all", lastChatN = null, choosing = [], chooseKey = null;
const nameAt = s => s === view.me ? "You" : (view.players[s] && view.players[s].name) || "Someone";
const g = () => view && view.view;
const score = v => { const ok = v.results.filter(r => r.ok).length; return [ok, v.results.length - ok]; };

function render() {
  if (!view) return;
  if (view.ended) { backToLobby(); return; }
  const v = g(), me = view.me;
  const phase = !v ? "lobby" : v.finished ? "done" : v.phase;
  const inGame = !!v && me >= 0;
  document.body.className = "hs-" + (phase === "done" ? "lobby" : phase);
  cue.level(phase === "lobby" || phase === "done" ? 0 : phase === "heist" || phase === "snipe" || (v && v.rejects >= 3) ? 2 : 1);
  if (v && view.me >= 0 && !v.finished) {
    const mine = (phase === "pick" && v.leader === view.me) || (phase === "vote" && v.myVote === null) || (phase === "heist" && v.team.includes(view.me) && !v.myPlay) || (phase === "snipe" && v.sniper === view.me);
    const k = mine ? `${v.no}:${v.heist}:${v.rejects}:${phase}` : null;
    if (k && k !== lastTurnCue) cue.sting("turn");
    lastTurnCue = k;
  }
  $("mGame").textContent = view.gameNo || "–";
  $("mPhase").textContent = v ? (v.finished ? "Over" : `${v.heist + 1} of 5`) : "–";
  $("mAlive").textContent = v ? `${score(v)[0]} – ${score(v)[1]}` : "–";
  $("mCode").textContent = view.code;
  // a fresh pick resets the leader's selection
  const key = v ? `${v.no}:${v.heist}:${v.rejects}:${v.phase}` : null;
  if (key !== chooseKey) { chooseKey = key; choosing = []; }

  $("phaseIcon").innerHTML = ICONS[phase === "done" ? (v.finished.winner === "cops" ? "cop" : "crew") : phase === "snipe" ? "sniper" : phase];
  $("phaseTitle").textContent = phase === "lobby" ? "Planning the job" : phase === "done" ? (v.finished.winner === "cops" ? "The cops win" : "The crew wins") : phase === "pick" ? `Heist ${v.heist + 1}: picking a team` : phase === "vote" ? `Heist ${v.heist + 1}: vote on the team` : phase === "heist" ? `Heist ${v.heist + 1}: the job` : "The Sniper's shot";
  $("phaseText").textContent = bannerText(v, phase, inGame);

  renderTrack(v);
  renderRole(v, inGame);
  renderPlayers(v, phase, inGame);
  renderActions(v, phase, inGame);
  renderLobby(v);
  renderLog(v);
  renderChat(v, inGame);
  announce(v);
  tickClock();
}

function bannerText(v, phase, inGame) {
  if (phase === "lobby") {
    const people = view.lobby.filter(p => !p.bot).length;
    return view.isHost ? `${people} ${people === 1 ? "person" : "people"} here. Share the code ${view.code}; start when everyone's in (5 to 10 players${view.settings.bots ? ", bots fill in" : ""}).` : "Waiting for the host to start the game.";
  }
  if (phase === "done") {
    const f = v.finished;
    return f.how === "rejects" ? "Five teams in a row were turned down: the crew fell apart." : f.how === "sniped" ? "The crew pulled it off, but the Sniper found the Mastermind." : f.winner === "cops" ? "Three heists failed." : "Three heists came off.";
  }
  const size = v.teamSize, needs2 = v.needs[v.heist] === 2;
  if (phase === "pick") return v.leader === view.me ? `You're the leader: tap ${size} players for this heist (you can include yourself)${needs2 ? ". This one needs 2 sabotages to fail" : ""}.` : `${nameAt(v.leader)} ${v.leader === view.me ? "are" : "is"} picking ${size} players. Talk them into picking you, or out of picking someone else.`;
  if (phase === "vote") return !inGame ? "Everyone's voting on the team." : v.myVote === null ? "Approve this team, or turn it down?" : `You voted ${v.myVote ? "to approve" : "to turn it down"}. Waiting for the others…`;
  if (phase === "heist") return !inGame || !v.team.includes(view.me) ? "The team is on the job. Waiting for their cards…" : v.myPlay ? "Card played. Waiting for the rest of the team…" : isCop(v.myRole) ? "Play your card: Success, or Sabotage." : "Play your card. (The crew can only play Success.)";
  if (phase === "snipe") return v.sniper === view.me ? "The crew won 3 heists. One shot: tap who you think is the Mastermind." : "The crew won 3 heists… but the Sniper gets one shot at the Mastermind.";
  return "";
}

function renderTrack(v) {
  $("track").hidden = !v;
  if (!v) return;
  const box = $("heists"); box.innerHTML = "";
  v.sizes.forEach((size, i) => {
    const r = v.results[i];
    const d = document.createElement("div");
    d.className = "hs-heist" + (r ? (r.ok ? " ok" : " fail") : i === v.heist && !v.finished ? " now" : "");
    d.innerHTML = r ? `<b>${r.ok ? "$" : "✕"}</b><small>${r.fails ? r.fails + " sab." : "clean"}</small>` : `<b>${size}</b><small>team</small>`;
    if (v.needs[i] === 2) d.insertAdjacentHTML("beforeend", `<span class="two" title="Needs 2 sabotages to fail">2×</span>`);
    d.setAttribute("aria-label", `Heist ${i + 1}: ${r ? (r.ok ? "success" : "failed") : `team of ${size}`}`);
    box.appendChild(d);
  });
  $("rejects").innerHTML = `Turned down: ${Array.from({ length: 5 }, (_, i) => `<i class="${i < v.rejects ? "on" : i === 4 ? "last" : ""}"></i>`).join("")}`;
}

function renderRole(v, inGame) {
  const rc = $("roleCard");
  rc.hidden = !inGame;
  document.querySelector(".ww-main").classList.toggle("no-role", !inGame);
  if (!inGame) return;
  const r = v.myRole;
  rc.style.setProperty("--rc", ROLE_COLOR[r]);
  const key = `${view.gameNo}:${r}`;
  if ($("roleFront").dataset.key !== key) {
    $("roleFront").dataset.key = key;
    $("roleFront").innerHTML = `${ICONS[r]}<b>${ROLE_NAME[r]}</b><p></p>`;
    const mates = v.roles.map((x, t) => t !== view.me && x && isCop(x) ? nameAt(t) : null).filter(Boolean);
    $("roleFront").querySelector("p").textContent = ROLE_HELP[r] + (mates.length ? ` ${r === "mastermind" ? "The cops" : "Your fellow cops"}: ${mates.join(", ")}.` : "");
  }
  rc.classList.toggle("open", roleOpen);
}
$("roleCard").addEventListener("click", () => { roleOpen = !roleOpen; $("roleCard").classList.toggle("open", roleOpen); });
$("roleCard").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("roleCard").click(); } });

function lastVote(v) { for (let i = v.log.length - 1; i >= 0; i--) { const e = v.log[i]; if (e.type === "vote") return e; if (e.type === "heist") return null; } return null; }

function renderPlayers(v, phase, inGame) {
  const box = $("players"); box.innerHTML = "";
  if (!v) {
    view.lobby.forEach(p => {
      const el = document.createElement("div"); el.className = "wp";
      el.innerHTML = `<div class="pic">${avatarSvg(avatarOf(p))}</div><div class="nm"></div><div class="tag"></div>`;
      el.querySelector(".nm").textContent = p.name;
      el.querySelector(".tag").textContent = p.host ? "Host" : p.bot ? "Bot" : "";
      box.appendChild(el);
    });
    return;
  }
  const me = view.me;
  const leading = phase === "pick" && v.leader === me;
  const sniping = phase === "snipe" && v.sniper === me;
  const shown = phase === "pick" || phase === "done" ? lastVote(v) : null;     // how people voted on the last team
  view.players.forEach((p, s) => {
    const clickable = leading || (sniping && !isCop(v.roles[s]));
    const el = document.createElement(clickable ? "button" : "div");
    if (clickable) el.type = "button";
    const onTeam = phase === "pick" ? choosing.includes(s) : v.team.includes(s);
    el.className = "wp" + (s === me ? " me" : "") + (v.leader === s && !v.finished ? " leader" : "") + (onTeam ? " onteam" : "") + (leading ? " choosing" : "")
      + (v.finished && v.finished.winners.includes(s) ? " won" : "");
    el.innerHTML = `<div class="pic">${avatarSvg(avatarOf(p))}</div><div class="nm"></div><div class="tag"></div>`;
    el.querySelector(".nm").textContent = (s === me ? "You" : p.name) + (p.bot ? " · bot" : p.auto ? " · left" : "");
    const role = v.roles[s], tag = el.querySelector(".tag");
    if (role && (s !== me || v.finished)) { tag.textContent = ROLE_NAME[role]; tag.classList.add(role); }
    else if (phase === "vote" && v.voted.includes(s)) tag.textContent = "voted";
    else if (phase === "heist" && v.team.includes(s)) tag.textContent = v.played.includes(s) ? "card in" : "on the job";
    if (v.leader === s && !v.finished) { const c = document.createElement("div"); c.className = "crown"; c.textContent = "👑"; c.title = "Leader"; el.appendChild(c); }
    if (shown) { const m = document.createElement("div"); m.className = "vote-mark" + (shown.votes[s] ? "" : " no"); m.textContent = shown.votes[s] ? "👍" : "👎"; m.title = "Last vote"; el.appendChild(m); }
    if (clickable) el.onclick = guard(async () => {
      if (sniping) { await ctrl.snipe(s); return; }
      choosing = choosing.includes(s) ? choosing.filter(x => x !== s) : choosing.length < v.teamSize ? [...choosing, s] : choosing;
      sound("chips", 0); render();
    });
    el.setAttribute("aria-label", `${p.name}${role ? ", " + ROLE_NAME[role] : ""}${onTeam ? ", on the team" : ""}${v.leader === s ? ", leader" : ""}`);
    box.appendChild(el);
  });
}

function renderActions(v, phase, inGame) {
  const box = $("actions"); box.innerHTML = "";
  const hint = document.createElement("div"); hint.className = "hint"; box.appendChild(hint);
  const btn = (label, cls, fn) => { const b = document.createElement("button"); b.className = cls; b.textContent = label; b.onclick = guard(fn); box.appendChild(b); return b; };
  if (phase === "lobby" || phase === "done") {
    const people = view.lobby.filter(p => !p.bot).length, total = view.settings.bots ? Math.max(people, view.settings.bots, 5) : people;
    if (view.isHost) {
      const b = btn(phase === "done" ? "New game" : "Start the game", "primary", () => ctrl.start());
      b.disabled = total < 5;
      hint.textContent = total < 5 ? `Need at least 5 players: ${people} here. Invite more, or let bots fill in (room settings below).` : `${Math.min(total, 10)} players${total > people ? ` (${total - people} bots)` : ""}.`;
    } else hint.textContent = "Waiting for the host to start.";
    return;
  }
  if (!inGame) { hint.textContent = "Watching this game."; return; }
  if (phase === "pick" && v.leader === view.me) {
    const b = btn(`Send this team (${choosing.length}/${v.teamSize})`, "primary", async () => { await ctrl.pick(choosing); sound("deal", 0); });
    b.disabled = choosing.length !== v.teamSize;
    hint.textContent = "Tap players to put them on the team.";
  } else if (phase === "vote") {
    btn(v.myVote === true ? "Approved ✓" : "Approve 👍", v.myVote === true ? "primary" : "ghost", () => ctrl.vote(true));
    btn(v.myVote === false ? "Turned down ✓" : "Turn it down 👎", v.myVote === false ? "danger" : "ghost", () => ctrl.vote(false));
    hint.textContent = `${v.voted.length} of ${v.n} have voted. Votes are shown once everyone's in.${v.rejects === 4 ? " Careful: one more turn-down and the cops win." : ""}`;
  } else if (phase === "heist" && v.team.includes(view.me)) {
    if (!v.myPlay) {
      btn("Success", "hs-card success", () => ctrl.play("success"));
      const sab = btn("Sabotage", "hs-card sabotage", () => ctrl.play("sabotage"));
      sab.disabled = !isCop(v.myRole);
      hint.textContent = "Nobody sees which card you play, only how many sabotages there were.";
    } else hint.textContent = `You played ${v.myPlay === "success" ? "Success" : "Sabotage"}.`;
  } else if (phase === "heist") hint.textContent = `${v.played.length} of ${v.team.length} cards in.`;
  else if (phase === "pick") hint.textContent = "Make your case in the chat or out loud.";
  else if (phase === "snipe") hint.textContent = v.sniper === view.me ? "Tap a crew member." : "Waiting for the shot…";
}

function renderLobby(v) {
  const list = $("lobbyList"); list.innerHTML = "";
  view.lobby.forEach(p => {
    const row = document.createElement("div"); row.className = "pl";
    row.innerHTML = `<span>${miniAv(avatarOf(p))}<span></span></span><span class="pts"></span>`;
    row.children[0].lastChild.textContent = p.name + (p.name === view.myName ? " (you)" : "");
    row.children[1].textContent = [p.host && "host", p.bot && "bot", p.playing === false && v && !v.finished && "next game"].filter(Boolean).join(" · ");
    list.appendChild(row);
  });
  const sb = $("settingsBox");
  sb.hidden = !(view.isHost && !view.running);
  if (!sb.hidden) {
    [["sPick", "pickSeconds"], ["sVote", "voteSeconds"], ["sHeist", "heistSeconds"], ["sBots", "bots"]].forEach(([id, k]) => { if (document.activeElement !== $(id)) $(id).value = String(view.settings[k]); });
    $("sSpecial").checked = !!view.settings.special;
  }
  $("btnHostLink").hidden = !(view.isHost && view.hostKey);
  $("btnClose").hidden = !view.isHost;
  const wins = $("winsList"); wins.innerHTML = "";
  if (!view.wins.length) wins.innerHTML = '<div class="note">No games finished yet.</div>';
  view.wins.forEach(w => { const r = document.createElement("div"); r.className = "pl"; r.innerHTML = "<span></span><b></b>"; r.firstChild.textContent = w.name + (w.bot ? " · bot" : ""); r.lastChild.textContent = `${w.wins} of ${w.games}`; wins.appendChild(r); });
}
for (const [id, k] of [["sPick", "pickSeconds"], ["sVote", "voteSeconds"], ["sHeist", "heistSeconds"], ["sBots", "bots"]]) $(id).addEventListener("change", guard(() => ctrl.settings({ [k]: +$(id).value })));
$("sSpecial").addEventListener("change", guard(() => ctrl.settings({ special: $("sSpecial").checked })));

// the story so far
function storyLine(e) {
  const names = list => list.map(nameAt).join(", ");
  if (e.type === "heist") return `Heist ${e.heist + 1}.`;
  if (e.type === "team") return `${nameAt(e.leader)} picked ${names(e.team)}.`;
  if (e.type === "vote") { const yes = e.votes.map((y, s) => y ? s : -1).filter(s => s >= 0); return `${e.ok ? "Approved" : "Turned down"} (${yes.length} of ${e.votes.length}). For: ${yes.length ? names(yes) : "nobody"}.`; }
  if (e.type === "result") return e.ok ? `Success${e.fails ? ` (despite ${e.fails} sabotage)` : ""}.` : `Failed: ${e.fails} sabotage${e.fails > 1 ? "s" : ""}.`;
  if (e.type === "snipe open") return "The Sniper takes aim…";
  if (e.type === "snipe") return `The Sniper shot ${nameAt(e.target)}: ${e.hit ? "the Mastermind!" : "not the Mastermind."}`;
  if (e.type === "win") return e.side === "cops" ? "The cops win." : "The crew wins.";
  return "";
}
function renderLog(v) {
  const box = $("log");
  if (!v) { box.innerHTML = '<div class="note">The game hasn\'t started.</div>'; return; }
  box.innerHTML = "";
  v.log.forEach(e => { const t = storyLine(e); if (!t) return; const d = document.createElement("div"); d.textContent = t; if (e.type === "heist") d.className = "hand-sep"; box.appendChild(d); });
  box.scrollTop = box.scrollHeight;
}

// ---------- the big announcements ----------
let lastSeen = null, revealQueue = [], revealTimer = 0;
function announce(v) {
  if (!v) return;
  const key = view.gameNo;
  if (!lastSeen || lastSeen.game !== key) {
    const fresh = v.log.length <= 1;
    lastSeen = { game: key, n: fresh ? 0 : v.log.length };
    if (fresh && view.me >= 0) queueReveal(v.myRole, `You're ${v.myRole === "crew" ? "crew" : v.myRole === "cop" ? "an undercover cop" : "the " + ROLE_NAME[v.myRole]}`, ROLE_HELP[v.myRole]);
  }
  for (const e of v.log.slice(lastSeen.n)) {
    if (e.type === "result" || e.type === "snipe") cue.sting("big");
    else if (e.type === "win" && view.me >= 0) cue.sting(v.finished && v.finished.winners.includes(view.me) ? "win" : "lose");
    if (e.type === "vote") queueReveal(e.ok ? "vote" : "reject", e.ok ? "Team approved" : "Team turned down", `${e.votes.filter(Boolean).length} of ${e.votes.length} for it.${e.ok ? "" : ` ${5 - Math.min(5, countRejects(v, e))} more and the cops win.`}`);
    else if (e.type === "result") queueReveal(e.ok ? "ok" : "fail", e.ok ? "The heist came off!" : "The heist failed!", e.fails ? `${e.fails} sabotage card${e.fails > 1 ? "s" : ""} in the pile.` : "Every card was a Success.");
    else if (e.type === "snipe") queueReveal("sniper", e.hit ? "Got the Mastermind" : "Missed!", `${nameAt(e.target)} was ${e.hit ? "the Mastermind" : "not the Mastermind"}.`);
    else if (e.type === "win") queueReveal(e.side === "cops" ? "cop" : "crew", e.side === "cops" ? "The cops win!" : "The crew wins!", v.finished && v.finished.winners.includes(view.me) ? "You're on the winning side." : view.me >= 0 ? "Better luck next job." : "");
  }
  lastSeen.n = v.log.length;
}
function countRejects(v, e) {
  // rejections in a row up to and including this vote
  let n = 0;
  for (const x of v.log) { if (x.type === "vote") n = x.ok ? 0 : n + 1; if (x === e) break; }
  return n;
}
function queueReveal(icon, title, text) {
  revealQueue.push({ icon, title, text });
  if (revealQueue.length === 1) showReveal();
}
function showReveal() {
  const r = revealQueue[0]; if (!r) return;
  $("revealIcon").innerHTML = ICONS[r.icon] || "";
  $("revealTitle").textContent = r.title; $("revealText").textContent = r.text;
  $("reveal").hidden = false;
  sound(r.icon === "fail" || r.icon === "cop" || r.icon === "reject" ? "allin" : r.icon === "ok" || r.icon === "crew" ? "win" : "pot", 0);
  clearTimeout(revealTimer);
  revealTimer = setTimeout(nextReveal, 3200);
}
function nextReveal() { clearTimeout(revealTimer); revealQueue.shift(); $("reveal").hidden = true; if (revealQueue.length) setTimeout(showReveal, 200); }
$("reveal").addEventListener("click", nextReveal);

// ---------- the clock ----------
function tickClock() {
  if (!view) return;
  const left = view.deadline && view.phaseMs ? Math.max(0, Math.min(100, (view.deadline - Date.now()) / view.phaseMs * 100)) : 0;
  $("phaseBar").style.width = left + "%";
}
setInterval(tickClock, 250);

// ---------- chat: everyone, and the cops ----------
const CHANNELS = { all: "Everyone", cops: "Cops only" };
function readable(v, inGame) {
  const out = ["all"];
  if ((inGame && v && isCop(v.myRole)) || (v && v.finished)) out.push("cops");
  return out;
}
function renderChat(v, inGame) {
  const chans = readable(v, inGame);
  if (!chans.includes(chatTab)) chatTab = "all";
  const tabs = $("chatTabs");
  const key = chans.join() + chatTab;
  if (tabs.dataset.key !== key) {
    tabs.dataset.key = key; tabs.innerHTML = "";
    chans.forEach(c => { const b = document.createElement("button"); b.type = "button"; b.className = "ghost"; b.textContent = CHANNELS[c]; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", c === chatTab); b.onclick = () => { chatTab = c; tabs.dataset.key = ""; render(); }; tabs.appendChild(b); });
  }
  tabs.hidden = chans.length < 2;
  const box = $("chatLog"); box.innerHTML = "";
  const msgs = view.chat.filter(c => c.channel === chatTab);
  if (!msgs.length) box.innerHTML = `<div class="note">${chatTab === "cops" ? "Only the cops read this (everyone can, once the game is over)." : "No messages yet."}</div>`;
  msgs.forEach(c => {
    const d = document.createElement("div"); d.className = "chat-line " + c.channel + (c.kind === "react" ? " react" : "");
    d.innerHTML = "<b></b> <span></span>"; d.firstChild.textContent = c.name; d.lastChild.textContent = c.kind === "react" ? c.emoji : c.text;
    box.appendChild(d);
  });
  box.scrollTop = box.scrollHeight;
  const can = view.canPost[chatTab];
  $("chatInput").disabled = !can;
  $("chatInput").placeholder = can ? (chatTab === "cops" ? "Whisper to the other cops…" : "Say something…") : "You can't post here";
  $("chatReacts").hidden = chatTab !== "all";
  const newest = view.chat.length ? view.chat[view.chat.length - 1].n : 0;
  if (lastChatN !== null && newest > lastChatN) sound("chat", 0);
  lastChatN = newest;
}
REACTIONS.forEach(e => {
  const b = document.createElement("button"); b.type = "button"; b.className = "react-btn"; b.textContent = e; b.setAttribute("aria-label", "Send " + e);
  b.onclick = guard(() => ctrl.react(e));
  $("chatReacts").appendChild(b);
});
$("chatForm").addEventListener("submit", guard(async e => { e.preventDefault(); const t = $("chatInput").value.trim(); if (!t) return; await ctrl.chat(t, chatTab); $("chatInput").value = ""; }));

// ---------- room tools ----------
$("btnLook").onclick = guard(async () => { const code = await openLook(myAvatar()); if (!code) return; store.set("pk-avatar", code); drawLookButtons(); await ctrl.setPrefs({ avatar: code }); });
$("btnCopyLink").onclick = async () => {
  const url = `${location.origin}${location.pathname}?code=${view.code}`;
  try { await navigator.clipboard.writeText(url); $("btnCopyLink").textContent = "Link copied"; } catch { $("btnCopyLink").textContent = url; }
  setTimeout(() => $("btnCopyLink").textContent = "Copy invite link", 2500);
};
$("btnHostLink").onclick = async () => {
  const url = `${location.origin}${location.pathname}?code=${view.code}&host=${view.hostKey}`;
  try { await navigator.clipboard.writeText(url); $("btnHostLink").textContent = "Host link copied. Keep it private"; } catch { $("btnHostLink").textContent = url; }
  setTimeout(() => $("btnHostLink").textContent = "Copy host link", 3500);
};
let leaveArmed = 0, closeArmed = 0;
$("btnLeave").onclick = guard(async () => {
  if (!leaveArmed) { leaveArmed = setTimeout(() => { leaveArmed = 0; $("btnLeave").textContent = "Leave the room"; }, 4000); $("btnLeave").textContent = view.running && view.me >= 0 ? "Tap again: a bot takes your seat" : "Tap again to leave"; return; }
  clearTimeout(leaveArmed); leaveArmed = 0;
  await ctrl.leave().catch(() => {});
  backToLobby();
});
$("btnClose").onclick = guard(async () => {
  if (!closeArmed) { closeArmed = setTimeout(() => { closeArmed = 0; $("btnClose").textContent = "Close room for good"; }, 4000); $("btnClose").textContent = "Tap again to close the room"; return; }
  clearTimeout(closeArmed); closeArmed = 0;
  await ctrl.close();
});

initSetup();
