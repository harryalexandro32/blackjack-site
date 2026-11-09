// Werewolf screens: open or join a room, the lobby, then the night / day / vote cycle with big announcements.
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

// ---------- pictures ----------
const ICONS = {
  wolf: `<svg viewBox="0 0 100 100"><path d="M18 14 L34 36 L50 30 L66 36 L82 14 L80 48 C80 70 66 86 50 90 C34 86 20 70 20 48Z" fill="#5d6168"/><path d="M30 46 L44 52 L40 56Z M70 46 L56 52 L60 56Z" fill="#ffd54f"/><path d="M42 72 L50 78 L58 72 L50 68Z" fill="#2b2420"/><path d="M44 80 L47 86 M56 80 L53 86" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><path d="M26 22 L34 36 M74 22 L66 36" stroke="#3d4046" stroke-width="3"/></svg>`,
  seer: `<svg viewBox="0 0 100 100"><path d="M8 50 C26 24 74 24 92 50 C74 76 26 76 8 50Z" fill="#ede7f6" stroke="#5e35b1" stroke-width="4"/><circle cx="50" cy="50" r="16" fill="#7e57c2"/><circle cx="50" cy="50" r="7" fill="#1a1033"/><circle cx="45" cy="45" r="3" fill="#fff"/><path d="M50 12 L52 20 L60 22 L52 24 L50 32 L48 24 L40 22 L48 20Z" fill="#b39ddb"/></svg>`,
  doctor: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="#e0f2f1" stroke="#00897b" stroke-width="4"/><path d="M42 26 H58 V42 H74 V58 H58 V74 H42 V58 H26 V42 H42Z" fill="#00897b"/></svg>`,
  villager: `<svg viewBox="0 0 100 100"><path d="M16 50 L50 20 L84 50 Z" fill="#a1584a"/><rect x="24" y="48" width="52" height="38" fill="#f3e3c3" stroke="#7a5a3a" stroke-width="3"/><rect x="44" y="62" width="14" height="24" fill="#7a5a3a"/><rect x="30" y="56" width="10" height="10" fill="#ffd54f" stroke="#7a5a3a" stroke-width="2"/><rect x="62" y="56" width="10" height="10" fill="#ffd54f" stroke="#7a5a3a" stroke-width="2"/></svg>`,
  night: `<svg viewBox="0 0 100 100"><path d="M64 14 A38 38 0 1 0 86 64 A30 30 0 1 1 64 14Z" fill="#fdf3c7"/><circle cx="24" cy="24" r="2" fill="#fff"/><circle cx="80" cy="30" r="1.6" fill="#fff"/><circle cx="18" cy="70" r="1.4" fill="#fff"/></svg>`,
  day: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="20" fill="#ffd54f"/>${Array.from({ length: 10 }, (_, i) => `<path d="M48 18 L50 8 L52 18Z" fill="#ffb300" transform="rotate(${i * 36} 50 50)"/>`).join("")}</svg>`,
  vote: `<svg viewBox="0 0 100 100"><rect x="20" y="44" width="60" height="42" rx="4" fill="#8d6e63"/><rect x="34" y="40" width="32" height="6" fill="#3e2723"/><path d="M40 12 H62 V42 H40Z" fill="#fff" stroke="#5d4037" stroke-width="3"/><path d="M45 26 L50 32 L58 20" stroke="#c62828" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`,
  lobby: `<svg viewBox="0 0 100 100"><path d="M30 84 L70 84 M36 78 L64 90 M64 78 L36 90" stroke="#795548" stroke-width="5" stroke-linecap="round"/><path d="M50 18 C60 36 72 46 66 64 C62 76 38 76 34 64 C28 46 44 40 50 18Z" fill="#ff7043"/><path d="M50 40 C56 50 60 56 56 66 C52 72 46 72 44 66 C40 56 48 52 50 40Z" fill="#ffd54f"/></svg>`,
  dead: `<svg viewBox="0 0 100 100"><path d="M24 50 C24 26 76 26 76 50 C76 62 70 66 68 72 L68 82 H32 L32 72 C30 66 24 62 24 50Z" fill="#eceff1"/><circle cx="40" cy="52" r="8" fill="#263238"/><circle cx="60" cy="52" r="8" fill="#263238"/><path d="M47 66 L50 60 L53 66Z" fill="#263238"/><path d="M40 82 V74 M50 82 V74 M60 82 V74" stroke="#263238" stroke-width="3"/></svg>`,
  saved: `<svg viewBox="0 0 100 100"><path d="M50 12 L82 24 V48 C82 70 66 84 50 90 C34 84 18 70 18 48 V24Z" fill="#26a69a"/><path d="M36 50 L46 60 L66 38" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};
const ROLE_NAME = { wolf: "Werewolf", seer: "Seer", doctor: "Doctor", villager: "Villager" };
const ROLE_COLOR = { wolf: "#c62828", seer: "#5e35b1", doctor: "#00897b", villager: "#8d6e63" };
const ROLE_HELP = {
  wolf: "Each night, pick someone with your pack. By day, blend in.",
  seer: "Each night, look at one player and learn if they're a wolf.",
  doctor: "Each night, protect one player from the wolves (not the same one twice in a row).",
  villager: "Find the wolves by talking and voting. Trust carefully."
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
  ctrl = c; lastSeen = null; revealQueue = []; chatTab = "all"; lastChatN = null; roleOpen = false;
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
  try { store.set("pk-name", name); const { OnlineWerewolf } = await online(); attach(await OnlineWerewolf.create({ name, avatar: myAvatar() })); }
  catch (err) { $("crErr").textContent = err.message; }
  finally { $("btnCreate").disabled = false; }
}));
$("formJoin").addEventListener("submit", async e => {
  e.preventDefault();
  const code = $("jnCode").value.trim().toUpperCase(), name = nameOf("jnName");
  if (code.length !== 6) return $("jnErr").textContent = "Room codes are 6 letters and numbers.";
  if (!name) return $("jnErr").textContent = "Enter your name.";
  $("jnErr").textContent = ""; $("btnJoin").disabled = true;
  try { store.set("pk-name", name); const { OnlineWerewolf } = await online(); attach(await OnlineWerewolf.join({ code, name, avatar: myAvatar() })); }
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
    $("jnRules").textContent = !r ? "No open room with that code." : r.game !== "werewolf" ? "That code is a different game. Join it from its own page." : `${r.humans} ${r.humans === 1 ? "person" : "people"} in the room`;
  } catch {}
});
$("btnRejoin").addEventListener("click", async () => {
  try { const { OnlineWerewolf } = await online(); attach(await OnlineWerewolf.resume()); }
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
    online().then(m => m.OnlineWerewolf.claim({ code, hostKey: key })).then(attach).catch(err => { $("jnCode").value = code; $("jnErr").textContent = err.message; });
    return;
  }
  if (params.get("code")) { $("jnCode").value = params.get("code").toUpperCase().slice(0, 6); $("jnCode").dispatchEvent(new Event("change")); }
  online().then(m => { $("btnRejoin").hidden = !m.hasSavedSeat(); }).catch(() => {});
}

// ---------- the room ----------
let roleOpen = false, chatTab = "all", lastChatN = null;
const nameAt = s => s === view.me ? "You" : (view.players[s] && view.players[s].name) || "Someone";
const g = () => view && view.view;

function render() {
  if (!view) return;
  if (view.ended) { backToLobby(); return; }
  const v = g(), me = view.me;
  const phase = !v ? "lobby" : v.finished ? "done" : v.phase;
  const inGame = !!v && me >= 0;
  const alive = inGame && v.alive[me];
  document.body.className = "ww-" + (phase === "done" ? "lobby" : phase);
  cue.level(phase === "lobby" || phase === "done" ? 0 : phase === "vote" ? 2 : 1);
  $("mGame").textContent = view.gameNo || "–";
  $("mPhase").textContent = phase === "lobby" ? "Lobby" : phase === "done" ? "Game over" : `${phase === "night" ? "Night" : phase === "day" ? "Day" : "Vote"} ${v.round}`;
  $("mAlive").textContent = v ? `${v.alive.filter(Boolean).length} of ${v.n}` : "–";
  $("mCode").textContent = view.code;

  // the banner
  $("phaseIcon").innerHTML = ICONS[phase === "done" ? (v.finished.winner === "wolves" ? "wolf" : "villager") : phase];
  $("phaseTitle").textContent = phase === "lobby" ? "Gathering in the square" : phase === "done" ? (v.finished.winner === "wolves" ? "The werewolves win" : "The village wins") : phase === "night" ? `Night ${v.round}` : phase === "day" ? `Day ${v.round}` : `Day ${v.round}: the vote`;
  $("phaseText").textContent = bannerText(v, phase, inGame, alive);

  // your role
  const rc = $("roleCard");
  rc.hidden = !inGame;
  document.querySelector(".ww-main").classList.toggle("no-role", !inGame);
  if (inGame) {
    const r = v.myRole;
    rc.style.setProperty("--rc", ROLE_COLOR[r]);
    const key = `${view.gameNo}:${r}:${alive}`;
    if ($("roleFront").dataset.key !== key) {
      $("roleFront").dataset.key = key;
      $("roleFront").innerHTML = `${ICONS[r]}<b>${ROLE_NAME[r]}</b><p></p>`;
      $("roleFront").querySelector("p").textContent = alive ? ROLE_HELP[r] : "You're dead. Chat in the graveyard and watch.";
    }
    rc.classList.toggle("open", roleOpen);
  }

  renderPlayers(v, phase, inGame, alive);
  renderActions(v, phase, inGame, alive);
  renderLobby(v);
  renderLog(v);
  renderChat(v, inGame, alive);
  announce(v);
  tickClock();
}

function bannerText(v, phase, inGame, alive) {
  if (phase === "lobby") {
    const people = view.lobby.filter(p => !p.bot).length;
    return view.isHost ? `${people} ${people === 1 ? "person" : "people"} here. Share the code ${view.code}; start when everyone's in (5 to 12 players${view.settings.bots ? ", bots fill in" : ""}).` : "Waiting for the host to start the game.";
  }
  if (phase === "done") return "Every role is shown below. The host can start a new game.";
  if (!inGame) return "You're sitting this game out: watch and chat in the graveyard.";
  if (!alive) return "You're dead: you can see every role and chat in the graveyard.";
  const r = v.myRole;
  if (phase === "night") {
    if (r === "villager") return "Close your eyes… you sleep through the night.";
    if (v.myNight !== null) return `Done. ${v.nightWaiting ? "Waiting for the others…" : ""}`;
    return r === "wolf" ? "Pick someone to kill. Your pack sees your choice." : r === "seer" ? "Pick someone to look at." : "Pick someone to protect tonight.";
  }
  if (phase === "day") return "Talk it over: who's the wolf? Press Ready when you're done talking.";
  return v.votes[view.me] !== undefined ? "Vote cast. You can change it until time runs out." : "Tap the player you want to vote out, or skip.";
}

function renderPlayers(v, phase, inGame, alive) {
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
  const wolfPicks = {};
  if (v.wolfVotes) Object.values(v.wolfVotes).forEach(t => wolfPicks[t] = (wolfPicks[t] || 0) + 1);
  const tally = {};
  Object.values(v.votes || {}).forEach(t => { if (t >= 0) tally[t] = (tally[t] || 0) + 1; });
  const canPickNight = phase === "night" && alive && v.targets.length;
  const canVote = phase === "vote" && alive;
  view.players.forEach((p, s) => {
    const clickable = (canPickNight && v.targets.includes(s)) || (canVote && v.alive[s] && s !== me);
    const el = document.createElement(clickable ? "button" : "div");
    if (clickable) el.type = "button";
    el.className = "wp" + (v.alive[s] ? "" : " dead") + (s === me ? " me" : "")
      + ((phase === "night" && v.myNight === s && v.myRole !== "doctor") || (phase === "vote" && v.votes[me] === s) ? " picked" : "")
      + (phase === "night" && v.myNight === s && v.myRole === "doctor" ? " saved" : "");
    el.innerHTML = `<div class="pic">${avatarSvg(avatarOf(p))}</div><div class="nm"></div><div class="tag"></div><div class="marks"></div>`;
    el.querySelector(".nm").textContent = (s === me ? "You" : p.name) + (p.bot ? " · bot" : "") + (!p.here && !p.bot ? " · left" : "");
    const role = v.roles[s], tag = el.querySelector(".tag");
    if (role && (s !== me || !v.alive[s] || v.finished)) { tag.textContent = ROLE_NAME[role]; tag.classList.add(role); }
    else if (role && s === me) { tag.textContent = ""; }
    if (!v.alive[s]) { const k = document.createElement("div"); k.className = "skull"; k.textContent = "✝"; el.appendChild(k); }
    const seen = (v.seen || []).find(x => x.target === s);
    if (seen && v.alive[s]) { tag.textContent = seen.wolf ? "Wolf!" : "Not a wolf"; tag.className = "tag seen " + (seen.wolf ? "wolf" : "ok"); }
    if (wolfPicks[s]) { const m = document.createElement("span"); m.textContent = "🐺".repeat(wolfPicks[s]); el.querySelector(".marks").appendChild(m); }
    if (phase === "vote" && tally[s]) { const b = document.createElement("div"); b.className = "votes"; b.textContent = tally[s]; el.appendChild(b); }
    if (phase === "day" && view.ready[s]) { const r = document.createElement("div"); r.className = "ready"; r.textContent = "✓"; r.title = "Ready to vote"; el.appendChild(r); }
    if (clickable) el.onclick = guard(async () => { if (phase === "night") await ctrl.act(s); else await ctrl.vote(s); sound("chips"); });
    el.setAttribute("aria-label", `${p.name}${v.alive[s] ? "" : ", dead"}${role ? ", " + ROLE_NAME[role] : ""}`);
    box.appendChild(el);
  });
}

function renderActions(v, phase, inGame, alive) {
  const box = $("actions"); box.innerHTML = "";
  const hint = document.createElement("div"); hint.className = "hint"; box.appendChild(hint);
  const btn = (label, cls, fn) => { const b = document.createElement("button"); b.className = cls; b.textContent = label; b.onclick = guard(fn); box.appendChild(b); return b; };
  if (phase === "lobby" || phase === "done") {
    const people = view.lobby.filter(p => !p.bot).length, total = view.settings.bots ? Math.max(people, view.settings.bots, 5) : people;
    if (view.isHost) {
      const b = btn(phase === "done" ? "New game" : "Start the game", "primary", () => ctrl.start());
      b.disabled = total < 5;
      hint.textContent = total < 5 ? `Need at least 5 players: ${people} here. Invite more, or let bots fill in (room settings below).` : `${total} players${total > people ? ` (${total - people} bots)` : ""}.`;
    } else hint.textContent = "Waiting for the host to start.";
    return;
  }
  if (!inGame || !alive) { hint.textContent = !inGame ? "Sitting this one out." : "Watching from the graveyard."; return; }
  if (phase === "day") {
    btn(view.myReady ? "Not ready yet" : "Ready to vote", view.myReady ? "ghost" : "primary", () => ctrl.ready());
    if (view.isHost) btn("Start the vote now", "ghost", () => ctrl.toVote());
    hint.textContent = `${view.ready.filter(Boolean).length} ready. The vote starts when everyone's ready or time runs out.`;
  } else if (phase === "vote") {
    btn(v.votes[view.me] === -1 ? "Skipped" : "Skip (vote for nobody)", "ghost", () => ctrl.vote(-1));
    hint.textContent = `${Object.keys(v.votes).length} of ${v.alive.filter(Boolean).length} have voted.`;
  } else hint.textContent = v.myRole === "villager" ? "Sleeping…" : v.myNight !== null ? "Your choice is in." : "Tap a player.";
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
    [["sNight", "nightSeconds"], ["sDay", "daySeconds"], ["sVote", "voteSeconds"], ["sBots", "bots"]].forEach(([id, k]) => { if (document.activeElement !== $(id)) $(id).value = String(view.settings[k]); });
  }
  $("btnHostLink").hidden = !(view.isHost && view.hostKey);
  $("btnClose").hidden = !view.isHost;
  const wins = $("winsList"); wins.innerHTML = "";
  if (!view.wins.length) wins.innerHTML = '<div class="note">No games finished yet.</div>';
  view.wins.forEach(w => { const r = document.createElement("div"); r.className = "pl"; r.innerHTML = "<span></span><b></b>"; r.firstChild.textContent = w.name + (w.bot ? " · bot" : ""); r.lastChild.textContent = `${w.wins} of ${w.games}`; wins.appendChild(r); });
}
for (const [id, k] of [["sNight", "nightSeconds"], ["sDay", "daySeconds"], ["sVote", "voteSeconds"], ["sBots", "bots"]]) $(id).addEventListener("change", guard(() => ctrl.settings({ [k]: +$(id).value })));

// the story so far
function storyLine(e) {
  const who = s => nameAt(s), role = r => ROLE_NAME[r] ? `${r === "wolf" ? "a" : "the"} ${ROLE_NAME[r]}`.replace("the Villager", "a Villager") : "";
  if (e.type === "night") return `Night ${e.round} falls.`;
  if (e.type === "dawn") return e.killed !== null ? `Dawn: ${who(e.killed)} ${e.killed === view.me ? "were" : "was"} killed in the night. ${e.killed === view.me ? "You were" : "They were"} ${role(e.role)}.` : e.saved ? "Dawn: the wolves struck, but the Doctor saved their victim." : "Dawn: nobody died.";
  if (e.type === "vote open") return "The village votes.";
  if (e.type === "voted") return e.out !== null ? `The village voted out ${who(e.out)}: ${role(e.role)}.` : "The vote was split: nobody was voted out.";
  if (e.type === "left") return `${who(e.seat)} left the village: ${role(e.role)}.`;
  if (e.type === "win") return e.side === "wolves" ? "The werewolves win." : "The village wins.";
  return "";
}
function renderLog(v) {
  const box = $("log");
  if (!v) { box.innerHTML = '<div class="note">The game hasn\'t started.</div>'; return; }
  box.innerHTML = "";
  v.log.forEach(e => { const t = storyLine(e); if (!t) return; const d = document.createElement("div"); d.textContent = t; if (e.type === "night") d.className = "hand-sep"; box.appendChild(d); });
  box.scrollTop = box.scrollHeight;
}

// ---------- the big announcements ----------
let lastSeen = null, revealQueue = [], revealTimer = 0;
function announce(v) {
  if (!v) return;
  const key = view.gameNo;
  if (!lastSeen || lastSeen.game !== key) {
    const fresh = !lastSeen && v.log.length <= 1;
    lastSeen = { game: key, n: fresh ? 0 : v.log.length };
    if (fresh || (lastSeen && v.log.length <= 1)) queueReveal("night", `Night ${v.round}`, view.me >= 0 ? `You are ${v.myRole === "wolf" ? "a Werewolf" : v.myRole === "villager" ? "a Villager" : "the " + ROLE_NAME[v.myRole]}. Tap your card to check it later.` : "The game has begun.");
  }
  for (const e of v.log.slice(lastSeen.n)) {
    const meAlive = view.me >= 0 && v.alive[view.me];
    if ((e.type === "dawn" && e.killed !== null) || (e.type === "voted" && e.out !== null)) cue.sting("big");
    else if (e.type === "win" && view.me >= 0) cue.sting(v.finished && v.finished.winners.includes(view.me) ? "win" : "lose");
    else if (meAlive && (e.type === "vote open" || (e.type === "night" && v.myRole && v.myRole !== "villager"))) cue.sting("turn");
    if (e.type === "dawn") queueReveal(e.killed !== null ? "dead" : e.saved ? "saved" : "day", e.killed !== null ? `${nameAt(e.killed)} ${e.killed === view.me ? "were" : "was"} killed` : e.saved ? "Saved!" : "Nobody died", e.killed !== null ? `${e.killed === view.me ? "You were" : "They were"} ${ROLE_NAME[e.role] === "Werewolf" ? "a Werewolf" : ROLE_NAME[e.role] === "Villager" ? "a Villager" : "the " + ROLE_NAME[e.role]}.` : e.saved ? "The Doctor stopped the wolves tonight." : "The village wakes up, all present.");
    else if (e.type === "voted") queueReveal(e.out !== null ? (e.role === "wolf" ? "wolf" : "dead") : "vote", e.out !== null ? `${nameAt(e.out)} ${e.out === view.me ? "are" : "is"} voted out` : "No one is voted out", e.out !== null ? (e.role === "wolf" ? "…and was a Werewolf!" : `…and was ${e.role === "villager" ? "a Villager" : "the " + ROLE_NAME[e.role]}.`) : "The vote was split.");
    else if (e.type === "night" && e.round > 1) queueReveal("night", `Night ${e.round}`, "Close your eyes…");
    else if (e.type === "win") queueReveal(e.side === "wolves" ? "wolf" : "villager", e.side === "wolves" ? "The werewolves win!" : "The village wins!", v.finished && v.finished.winners.includes(view.me) ? "You're on the winning side." : view.me >= 0 ? "Better luck next game." : "");
  }
  lastSeen.n = v.log.length;
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
  sound(r.icon === "dead" || r.icon === "wolf" ? "allin" : r.icon === "night" ? "fold" : "pot", 0);
  clearTimeout(revealTimer);
  revealTimer = setTimeout(nextReveal, 3600);
}
function nextReveal() { clearTimeout(revealTimer); revealQueue.shift(); $("reveal").hidden = true; if (revealQueue.length) setTimeout(showReveal, 200); }
$("reveal").addEventListener("click", nextReveal);

// ---------- your role card ----------
$("roleCard").addEventListener("click", () => { roleOpen = !roleOpen; $("roleCard").classList.toggle("open", roleOpen); });
$("roleCard").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("roleCard").click(); } });

// ---------- the clock ----------
function tickClock() {
  if (!view) return;
  const left = view.deadline && view.phaseMs ? Math.max(0, Math.min(100, (view.deadline - Date.now()) / view.phaseMs * 100)) : 0;
  $("phaseBar").style.width = left + "%";
}
setInterval(tickClock, 250);

// ---------- chat: the village, the wolves, the graveyard ----------
const CHANNELS = { all: "Village", wolves: "Wolves", grave: "Graveyard" };
function readable(v, inGame, alive) {
  const out = ["all"];
  const dead = inGame && !alive, spectator = !inGame && view.running;
  if ((inGame && v && v.myRole === "wolf") || dead || (v && v.finished)) out.push("wolves");
  if (dead || spectator || (v && v.finished)) out.push("grave");
  return out;
}
function renderChat(v, inGame, alive) {
  const chans = readable(v, inGame, alive);
  if (!chans.includes(chatTab)) chatTab = view.canPost.grave ? "grave" : "all";
  const tabs = $("chatTabs");
  const key = chans.join() + chatTab;
  if (tabs.dataset.key !== key) {
    tabs.dataset.key = key; tabs.innerHTML = "";
    chans.forEach(c => { const b = document.createElement("button"); b.type = "button"; b.className = "ghost"; b.textContent = CHANNELS[c]; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", c === chatTab); b.onclick = () => { chatTab = c; tabs.dataset.key = ""; render(); }; tabs.appendChild(b); });
  }
  const box = $("chatLog"); box.innerHTML = "";
  const msgs = view.chat.filter(c => c.channel === chatTab);
  if (!msgs.length) box.innerHTML = `<div class="note">${chatTab === "wolves" ? "Only the wolves read this." : chatTab === "grave" ? "Only the dead read this." : "No messages yet."}</div>`;
  msgs.forEach(c => {
    const d = document.createElement("div"); d.className = "chat-line " + c.channel + (c.kind === "react" ? " react" : "");
    d.innerHTML = "<b></b> <span></span>"; d.firstChild.textContent = c.name; d.lastChild.textContent = c.kind === "react" ? c.emoji : c.text;
    box.appendChild(d);
  });
  box.scrollTop = box.scrollHeight;
  const can = view.canPost[chatTab];
  $("chatInput").disabled = !can;
  $("chatInput").placeholder = can ? (chatTab === "wolves" ? "Whisper to the pack…" : chatTab === "grave" ? "Talk to the dead…" : "Say something…") : chatTab === "all" ? "Only the living can talk to the village" : "You can't post here";
  $("chatReacts").hidden = !view.canPost.all || chatTab !== "all";
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
  if (!leaveArmed) { leaveArmed = setTimeout(() => { leaveArmed = 0; $("btnLeave").textContent = "Leave the room"; }, 4000); $("btnLeave").textContent = view.running && view.me >= 0 && view.view.alive[view.me] ? "Tap again: you'll die in this game" : "Tap again to leave"; return; }
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
