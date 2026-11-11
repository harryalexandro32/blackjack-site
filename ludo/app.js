// Ludo screens. Works with LocalLudo (bots) or OnlineLudo (friends).
import * as L from "../supabase/functions/_shared/ludo-engine.js";
import { settle } from "../supabase/functions/_shared/poker-engine.js";
import { REACTIONS } from "../supabase/functions/_shared/poker-room.js";
import { LocalLudo, savedLudoGame } from "./local.js";
import { avatarSvg, PRESETS, DEFAULT_AVATAR } from "../poker/avatars.js";
import { openLook } from "../poker/look.js";
import { play as sound, soundOn, setSound } from "../poker/sound.js";
// the music follows the game (theme.js; does nothing while the music is off)
const cue = { level: i => window.CR_CUE && window.CR_CUE.level(i), sting: k => window.CR_CUE && window.CR_CUE.sting(k) };

const $ = id => document.getElementById(id);
const CONFIG = window.POKER_CONFIG || {};
const onlineEnabled = !!(CONFIG.supabaseUrl && CONFIG.anonKey);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const toCents = v => Math.round(Number(v) * 100);
function fmt(cents, signed) {
  const abs = Math.abs(cents) / 100;
  const s = abs.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
  return signed ? (cents > 0 ? "+" : cents < 0 ? "−" : "") + s : (cents < 0 ? "−" : "") + s;
}
const signed = n => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n);
const ordinal = n => n + (["st", "nd", "rd"][n - 1] || "th");
const placeOf = (g, seat) => g.finished && g.finished.place ? g.finished.place[seat] + 1 : (g.out || []).indexOf(seat) + 1;
const loserGame = g => !!g && (g.mode === "loser" || (g.finished && g.finished.mode === "loser"));
// Money in points. Against bots (bots mode) every point counts; in rooms with friends, points won from or
// lost to a bot don't turn into money, so friends only owe each other.
const isBot = seat => !!(view.seats[seat] && view.seats[seat].bot);
const moneyPts = seat => view.mode === "online" ? (view.seats[seat]?.money || 0) : (view.seats[seat]?.points || 0);
function gameMoney(f, seat) {
  if (view.mode !== "online") return f.points[seat];
  if (isBot(f.winner) || isBot(seat)) return 0;
  if (seat === f.winner) return [0, 1, 2, 3].filter(i => i !== seat && !isBot(i)).reduce((a, i) => a - f.points[i], 0);
  return f.points[seat];
}
const netClass = n => n > 0 ? "pos" : n < 0 ? "neg" : "";

// ---------- your look ----------
const myAvatar = () => store.get("pk-avatar", DEFAULT_AVATAR);
function drawLookButtons() { document.querySelectorAll("[data-look]").forEach(b => b.innerHTML = `<span class="av">${avatarSvg(myAvatar())}</span>`); }
document.querySelectorAll("[data-look]").forEach(b => b.addEventListener("click", async () => {
  const code = await openLook(myAvatar());
  if (code) { store.set("pk-avatar", code); drawLookButtons(); }
}));
function avatarOf(p) {
  if (p && p.avatar) return p.avatar;
  let h = 0; for (const ch of (p && p.name) || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PRESETS[h % PRESETS.length].code;
}
const miniAv = code => `<span class="mini-av">${avatarSvg(code)}</span>`;

// ---------- screens ----------
const compact = matchMedia("(max-width: 720px)");
function showScreen(id) {
  ["scrSetup", "scrTable", "scrSummary"].forEach(s => $(s).hidden = s !== id);
  $("meters").hidden = id !== "scrTable";
  document.body.classList.toggle("at-ludo", id === "scrTable");
}
const sizeVar = (el, name) => new ResizeObserver(() => document.documentElement.style.setProperty(name, el.offsetHeight + "px")).observe(el);
sizeVar(document.querySelector(".bar"), "--bar-h");
(window.CR_STEADY || sizeVar)($("crail"), "--rail-h"); // keeps its tallest height, so the table stops resizing each turn

let ctrl = null, unsub = null, view = null;
function attach(controller) {
  if (unsub) unsub();
  if (ctrl && ctrl !== controller && ctrl.destroy) ctrl.destroy();
  ctrl = controller; lastLog = null; lastGame = null; lastChatN = null; lastTurn = null; bannerFor = null; rolling = false;
  buildSeats();
  showScreen("scrTable");
  unsub = ctrl.subscribe(v => { view = v; render(); });
}
function backToLobby() {
  if (ctrl && ctrl.destroy) ctrl.destroy();
  if (unsub) unsub();
  ctrl = null; view = null; unsub = null;
  initSetup();
}

// ---------- setup ----------
document.querySelectorAll(".seg").forEach(seg => seg.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
}));
const segValue = id => $(id).querySelector('[aria-pressed="true"]').dataset.v;
// house rules: tick boxes, remembered on this device
// how many bots and which colour: remembered on this device
{
  const last = store.get("ld-table", {});
  for (const [id, v] of [["aiBots", last.bots], ["aiColor", last.color]]) {
    const b = v != null && $(id).querySelector(`[data-v="${String(v).replace(/\D/g, "")}"]`);
    if (b) $(id).querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
  }
}
// a colour that is sitting this table out (fewer than three bots)
const inPlay = seat => !(view && view.game && view.game.active) || view.game.active.includes(seat);
const RULE_KEYS = ["leave16", "captureBonus", "blocks", "mustCapture", "homeBonus", "pairSafe"];
const savedRules = store.get("ld-rules", {});
for (const id of ["aiRules", "crRules"]) $(id).querySelectorAll("input").forEach(box => {
  box.checked = !!savedRules[box.dataset.r];
  box.addEventListener("change", () => store.set("ld-rules", rulesOf(id)));
});
const rulesOf = id => Object.fromEntries([...$(id).querySelectorAll("input")].map(b => [b.dataset.r, b.checked]));

const nameOf = id => $(id).value.trim().replace(/\s+/g, " ").slice(0, 16);

$("formAi").addEventListener("submit", e => {
  e.preventDefault();
  const name = nameOf("aiName") || "Player", pointValue = toCents($("aiValue").value);
  if (!(pointValue >= 1)) return $("aiErr").textContent = "Enter how many dollars a point is worth.";
  $("aiErr").textContent = "";
  store.set("pk-name", name);
  store.set("ld-table", { bots: segValue("aiBots"), color: segValue("aiColor") });
  attach(LocalLudo.create({ name, avatar: myAvatar(), skill: segValue("aiSkill"), rules: rulesOf("aiRules"), pointValue, bots: +segValue("aiBots"), color: +segValue("aiColor") }));
});
$("aiResume").addEventListener("click", () => { const s = savedLudoGame(); if (s) attach(new LocalLudo(s)); });

const params = new URLSearchParams(location.search);
const online = () => import("./online.js");
$("formCreate").addEventListener("submit", async e => {
  e.preventDefault();
  const name = nameOf("crName"), pointValue = toCents($("crValue").value);
  if (!name) return $("crErr").textContent = "Enter your name.";
  if (!(pointValue >= 1)) return $("crErr").textContent = "Enter how many dollars a point is worth.";
  $("crErr").textContent = ""; $("btnCreate").disabled = true;
  try {
    store.set("pk-name", name);
    const { OnlineLudo } = await online();
    attach(await OnlineLudo.create({ name, avatar: myAvatar(), pointValue, actSeconds: +$("crTime").value, skill: segValue("crSkill"), rules: rulesOf("crRules") }));
  } catch (err) { $("crErr").textContent = err.message; }
  finally { $("btnCreate").disabled = false; }
});
$("formJoin").addEventListener("submit", async e => {
  e.preventDefault();
  const code = $("jnCode").value.trim().toUpperCase(), name = nameOf("jnName");
  if (code.length !== 6) return $("jnErr").textContent = "Room codes are 6 letters and numbers.";
  if (!name) return $("jnErr").textContent = "Enter your name.";
  $("jnErr").textContent = ""; $("btnJoin").disabled = true;
  try {
    store.set("pk-name", name);
    const { OnlineLudo } = await online();
    attach(await OnlineLudo.join({ code, name, avatar: myAvatar() }));
  } catch (err) { $("jnErr").textContent = err.message; }
  finally { $("btnJoin").disabled = false; }
});
$("jnCode").addEventListener("change", async () => {
  const code = $("jnCode").value.trim().toUpperCase();
  $("jnRules").textContent = "";
  if (code.length !== 6 || !onlineEnabled) return;
  try {
    const { peekRoom } = await online();
    const r = await peekRoom(code);
    $("jnRules").textContent = !r ? "No open room with that code." : r.game !== "ludo" ? "That code is a different game. Join it from its own page." : `${fmt(r.settings.pointValue)} a point · ${r.humans} of 4 seats taken by people`;
  } catch {}
});
$("btnRejoin").addEventListener("click", async () => {
  try { const { OnlineLudo } = await online(); attach(await OnlineLudo.resume()); }
  catch (err) { $("jnErr").textContent = err.message; $("btnRejoin").hidden = true; }
});
async function openAsHost(code, hostKey) {
  window.history.replaceState(null, "", location.pathname + "#online");
  route(); showScreen("scrSetup");
  try { const { OnlineLudo } = await online(); attach(await OnlineLudo.claim({ code, hostKey })); }
  catch (err) { $("jnCode").value = code; $("jnErr").textContent = err.message; }
}

function route() {
  const mode = location.hash === "#online" ? "online" : "ai";
  $("setupAi").hidden = mode !== "ai";
  $("setupOnline").hidden = mode !== "online";
  $("tabAi").setAttribute("aria-current", mode === "ai" ? "page" : "false");
  $("tabOnline").setAttribute("aria-current", mode === "online" ? "page" : "false");
  $("formCreate").hidden = $("formJoin").hidden = !onlineEnabled;
  $("onlineOff").hidden = onlineEnabled;
}
window.addEventListener("hashchange", () => { if (!ctrl) route(); });
function initSetup() {
  const name = store.get("pk-name", "");
  if (name) { $("aiName").value = name; $("crName").value = name; $("jnName").value = name; }
  $("aiResume").hidden = !savedLudoGame();
  drawLookButtons();
  if (params.get("code") && params.get("host") && onlineEnabled) return openAsHost(params.get("code").toUpperCase().slice(0, 6), params.get("host"));
  if (params.get("code")) { location.hash = "#online"; $("jnCode").value = params.get("code").toUpperCase().slice(0, 6); $("jnCode").dispatchEvent(new Event("change")); }
  route();
  if (onlineEnabled) online().then(m => { $("btnRejoin").hidden = !m.hasSavedLudoSeat(); }).catch(() => {});
  showScreen("scrSetup");
}

// ---------- the board ----------
const TC = ["var(--ld-red)", "var(--ld-green)", "var(--ld-yellow)", "var(--ld-blue)"];
const HEX = ["#e53935", "#2e9e4f", "#f2bd0d", "#1e6fd9"];
const COLOR_NAMES = ["Red", "Green", "Yellow", "Blue"];
const STARS = [8, 21, 34, 47];
function drawBoard() {
  const svg = $("boardSvg");
  if (svg.dataset.drawn) return;
  svg.dataset.drawn = "1";
  const out = [`<rect width="15" height="15" fill="#fbf6ea"/>`];
  const cell = (c, r, fill, extra = "") => out.push(`<rect x="${c}" y="${r}" width="1" height="1" fill="${fill}" stroke="#2b2420" stroke-width=".035" ${extra}/>`);
  // bases: red top-left, green top-right, yellow bottom-right, blue bottom-left
  [[0, 0], [9, 0], [9, 9], [0, 9]].forEach(([x, y], s) => {
    out.push(`<rect x="${x}" y="${y}" width="6" height="6" fill="${HEX[s]}" stroke="#2b2420" stroke-width=".05"/><rect x="${x + 0.8}" y="${y + 0.8}" width="4.4" height="4.4" rx=".5" fill="#fbf6ea"/>`);
    L.BASE_SPOTS[s].forEach(([c, r]) => out.push(`<circle cx="${c}" cy="${r}" r=".62" fill="${HEX[s]}" opacity=".85"/><circle cx="${c}" cy="${r}" r=".62" fill="none" stroke="#2b2420" stroke-width=".04"/>`));
  });
  // the track, the start squares and the stars
  L.TRACK.forEach(([c, r], i) => {
    const startOwner = [0, 13, 26, 39].indexOf(i);
    cell(c, r, startOwner >= 0 ? HEX[startOwner] : "#fffdf8");
    if (STARS.includes(i)) out.push(`<text x="${c + 0.5}" y="${r + 0.78}" text-anchor="middle" font-size=".78" fill="#8a7a5c">★</text>`);
    if (startOwner >= 0) out.push(`<path d="M${c + 0.3} ${r + 0.5} L${c + 0.72} ${r + 0.5} M${c + 0.56} ${r + 0.32} L${c + 0.74} ${r + 0.5} L${c + 0.56} ${r + 0.68}" stroke="#fff" stroke-width=".09" fill="none" stroke-linecap="round" transform="rotate(${[0, 90, 180, 270][startOwner]} ${c + 0.5} ${r + 0.5})"/>`);
  });
  // home columns
  L.HOME_COLUMN.forEach((col, s) => col.forEach(([c, r]) => cell(c, r, HEX[s])));
  // the finish: four triangles meeting in the middle
  out.push(`<polygon points="6,6 6,9 7.5,7.5" fill="${HEX[0]}"/><polygon points="6,6 9,6 7.5,7.5" fill="${HEX[1]}"/><polygon points="9,6 9,9 7.5,7.5" fill="${HEX[2]}"/><polygon points="6,9 9,9 7.5,7.5" fill="${HEX[3]}"/>`);
  out.push(`<rect x="6" y="6" width="3" height="3" fill="none" stroke="#2b2420" stroke-width=".05"/>`);
  svg.innerHTML = out.join("");
}

const PAWN = `<svg viewBox="0 0 34 46" aria-hidden="true">
  <ellipse cx="17" cy="42" rx="14" ry="4" fill="currentColor"/><ellipse cx="17" cy="42" rx="14" ry="4" fill="#000" opacity=".25"/>
  <path d="M5 41 C6 33 11 30 12 22 L22 22 C23 30 28 33 29 41 Z" fill="currentColor" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M9 23 Q17 19 25 23 Q17 26 9 23Z" fill="currentColor" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="17" cy="13" r="8.5" fill="currentColor" stroke="#fff" stroke-width="1.6"/>
  <circle cx="14" cy="10" r="2.6" fill="#fff" opacity=".7"/><path d="M9 36 Q11 31 13 28" stroke="#fff" stroke-width="1.4" fill="none" opacity=".45" stroke-linecap="round"/>
</svg>`;
let seatEls = [], tokenEls = [], rowEls = [];
function buildSeats() {
  drawBoard();
  const box = $("lplayers"); box.innerHTML = "";
  rowEls = [0, 1, 2, 3].map(s => {
    const el = document.createElement("div"); el.className = "lp"; el.style.setProperty("--tc", TC[s]);
    el.innerHTML = `<span class="chip"></span><div class="pic"></div><div class="who"></div><div class="home"></div><div class="timer"></div><div class="bubble" hidden></div>`;
    box.appendChild(el);
    return el;
  });
  const layer = $("tokens"); layer.innerHTML = "";
  tokenEls = [0, 1, 2, 3].map(s => [0, 1, 2, 3].map(i => {
    const t = document.createElement("button"); t.type = "button"; t.className = "token"; t.style.setProperty("--tc", TC[s]); t.innerHTML = PAWN;
    t.dataset.seat = s; t.dataset.i = i; t.setAttribute("aria-label", `${COLOR_NAMES[s]} token ${i + 1}`); t.tabIndex = -1;
    layer.appendChild(t);
    return t;
  }));
}
// the chat code finds a player's row by position from you
const seatAt = pos => (view.me + pos) % 4;
const posOf = seat => (seat - view.me + 4) % 4;
const nameAt = seat => seat === view.me ? "You" : view.seats[seat]?.name || COLOR_NAMES[seat];
const verb = (seat, base, third = base + "s") => seat === view.me ? base : third;

let lastLog = null, lastGame = null, lastTurn = null, bannerFor = null, rolling = false, autoTimer = 0;

// How a crowd of n pieces sits in one square: how many across, and how small they are drawn so they all fit.
const crowd = n => n <= 1 ? { cols: 1, size: 1 } : n === 2 ? { cols: 2, size: 0.78 } : n <= 4 ? { cols: 2, size: 0.62 } : n <= 6 ? { cols: 3, size: 0.52 } : n <= 9 ? { cols: 3, size: 0.46 } : { cols: 4, size: 0.38 };

// where each token sits: tokens sharing a square are drawn smaller, in rows, so they stay inside it;
// pieces also shrink a little when the squares around them are busy, so pawns don't cover each other
function placeTokens(g, skipAnim) {
  const groups = {};
  g.tokens.forEach((ts, s) => ts.forEach((p, i) => {
    const [c, r] = L.cellOf(s, p, i);
    const key = p < 0 ? `b${s}${i}` : `${c},${r}`;
    (groups[key] = groups[key] || []).push([s, i, c, r, p]);
  }));
  const legal = new Set((g.legal || []).map(m => m.token));
  // how many pieces stand on the squares touching this one
  const around = (c, r) => Object.values(groups).reduce((sum, l) => { const dc = Math.abs(l[0][2] - c), dr = Math.abs(l[0][3] - r); return sum + (l[0][4] >= 0 && (dc || dr) && dc <= 1.01 && dr <= 1.01 ? l.length : 0); }, 0);
  for (const list of Object.values(groups)) list.forEach(([s, i, c, r, p], k) => {
    const n = list.length, { cols, size } = crowd(n), rows = Math.ceil(n / cols);
    const near = p >= 0 ? around(c, r) : 0;
    const scale = Math.max(0.36, size * (near >= 4 ? 0.8 : near >= 2 ? 0.88 : near === 1 && n === 1 ? 0.94 : 1));
    const col = k % cols, row = Math.floor(k / cols), inRow = row === rows - 1 ? n - row * cols : cols;
    const dx = (col - (inRow - 1) / 2) * Math.min(0.34, 0.84 / cols), dy = rows > 1 ? (row - (rows - 1) / 2) * Math.min(0.34, 0.8 / rows) : 0;
    const el = tokenEls[s][i];
    el.hidden = !inPlay(s);
    el.style.setProperty("--ts", scale.toFixed(3));
    el.style.zIndex = n > 1 ? String(2 + row) : "";              // nearer rows are drawn over the ones behind
    el.style.left = ((c + dx) / 15 * 100) + "%";
    el.style.top = ((r + 0.12 * scale + dy + (rows > 1 ? 0.12 : 0)) / 15 * 100) + "%";
    el.classList.toggle("home", p >= L.FINISH);
    const can = s === view.me && g.phase === "move" && legal.has(i) && !g.finished;
    el.classList.toggle("can", can);
    el.tabIndex = can ? 0 : -1;
  });
}
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function drawDie(n, cls = "") {
  const d = $("die");
  d.className = "ldie" + (n === 1 || n === 4 ? " red" : "") + (cls ? " " + cls : "") + (n ? "" : " blank");
  d.innerHTML = "";
  for (let i = 0; i < 9; i++) { const p = document.createElement("i"); if (n && PIPS[n].includes(i)) p.className = "on"; d.appendChild(p); }
  d.setAttribute("aria-label", n ? `Die: ${n}` : "Die");
}

function render() {
  if (!view) return;
  if (view.ended && !view.summary) return backToLobby();
  if (view.ended) return renderSummary();
  const g = view.game, me = view.me;
  $("mGame").textContent = view.gameNo || "–";
  $("mColor").textContent = COLOR_NAMES[me] || "–";
  $("mColor").style.color = HEX[me] || "";
  $("mPoints").textContent = signed(view.seats[me] ? view.seats[me].points : 0);
  const myMoney = moneyPts(me) * view.pointValue;
  $("mMoney").textContent = fmt(myMoney, true); $("mMoney").className = netClass(myMoney);
  $("mCodeWrap").hidden = !view.code; $("mCode").textContent = view.code || "";

  // the players
  rowEls.forEach((el, s) => {
    el.hidden = !inPlay(s);
    const p = view.seats[s] || {};
    const pic = el.querySelector(".pic"), av = avatarOf(p);
    if (pic.dataset.av !== av) { pic.dataset.av = av; pic.innerHTML = avatarSvg(av, p.name || ""); }
    const who = el.querySelector(".who"); who.innerHTML = "<span></span><small></small>";
    who.firstChild.textContent = (p.name || "Empty seat") + (s === me ? " (you)" : "") + (p.bot && view.mode === "online" ? " · bot" : "");
    who.lastChild.textContent = COLOR_NAMES[s] + (view.hostSeat === s ? " · host" : "");
    const home = g ? g.tokens[s].filter(x => x >= L.FINISH).length : 0;
    el.querySelector(".home").textContent = g ? `${home}/4 home` : "";
    el.classList.toggle("turn", !!(g && !g.finished && g.turn === s));
  });
  seatEls = [1, 2, 3].map(pos => rowEls[seatAt(pos)]);

  if (g) placeTokens(g);
  const myTurn = !!(g && !g.finished && g.turn === me);
  if (!rolling) drawDie(shownDie(g), g && g.dice == null && lastRoll(g) ? "spent" : "");
  $("die").style.setProperty("--tc", g && !g.finished && g.turn >= 0 ? TC[g.turn] : "transparent");
  $("actRow").hidden = !g || !!g.finished;
  $("btnRoll").disabled = !(myTurn && g.phase === "roll") || rolling;
  $("btnRoll").textContent = myTurn && g.phase === "roll" ? (g.dice === 6 ? "Roll again" : "Roll") : myTurn ? "Move a token" : "Roll";
  const fin = g && g.finished;
  $("betweenRow").hidden = !(fin || (view.mode === "online" && !view.started));
  $("btnNext").hidden = !(fin && view.mode === "ai");
  $("btnStart").hidden = !(view.mode === "online" && view.isHost && !view.started);
  $("btnStart").textContent = view.sessions && view.sessions.length ? `Start session ${view.sessionNo}` : "Start the game";

  $("status").textContent = statusText(g);
  renderLog(g);
  renderScores();
  renderTools();
  renderBanner(g);
  renderChat();
  const lastNo = view.sessions && view.sessions.length ? view.sessions[view.sessions.length - 1].no : 0;
  if (lastSessionNo !== undefined && lastNo > lastSessionNo) openLedger();
  lastSessionNo = lastNo;
  motion(g);
  tickClock();
  // only one token can move: move it for you
  clearTimeout(autoTimer);
  if (myTurn && g.phase === "move" && g.legal.length === 1) autoTimer = setTimeout(guard(() => sendMove({ type: "move", token: g.legal[0].token })), 550);
}

function statusText(g) {
  if (view.mode === "online" && !view.started) {
    const humans = view.seats.filter(s => s && !s.bot).length;
    return view.closing ? "The host is closing the room." : view.isHost ? `${humans} of 4 seats taken by people. Start whenever you're ready: bots fill the empty seats.` : "Waiting for the host to start. Bots fill any empty seats.";
  }
  if (view.ending) return "The host is ending the session after this game.";
  if (!g) return "Setting up the board…";
  if (g.finished) {
    const left = view.nextGameAt ? ` Next game in ${Math.max(0, Math.ceil((view.nextGameAt - Date.now()) / 1000))}s.` : "";
    return `${nameAt(g.finished.winner)} ${verb(g.finished.winner, "bring")} all four tokens home and ${verb(g.finished.winner, "win")}!` + left;
  }
  if (g.turn === view.me) {
    if (g.phase === "roll") return g.dice === 6 ? "You rolled a 6: roll again." : noMoveNote(g) + "Your turn: roll the die.";
    return g.legal.length === 1 ? `You rolled ${g.dice}.` : `You rolled ${g.dice}: tap a glowing token to move it.`;
  }
  return (g.phase === "roll" ? noMoveNote(g) : "") + `${nameAt(g.turn)} (${COLOR_NAMES[g.turn]}) ${g.phase === "roll" ? "is rolling…" : `rolled ${g.dice}…`}`;
}

// The die keeps showing the last roll after a turn passes (a roll that couldn't move a token passes at once).
function lastRoll(g) {
  if (!g) return null;
  for (let i = g.log.length - 1; i >= 0; i--) { const e = g.log[i]; if (e.type === "roll") return e; if (e.type === "start") return null; }
  return null;
}
const shownDie = g => !g ? null : g.dice != null ? g.dice : (lastRoll(g) ? lastRoll(g).dice : null);
// "Ayu rolled 3: no token can move." when the last thing that happened was a roll with nothing to move.
function noMoveNote(g) {
  const last = g.log[g.log.length - 1], roll = g.log[g.log.length - 2];
  if (!last || !roll || roll.type !== "roll") return "";
  if (last.type === "no move" && roll.dice !== 6) return `${nameAt(roll.seat)} rolled ${roll.dice}: no token can move. `;
  if (last.type === "three sixes") return `${nameAt(roll.seat)} rolled three 6s: turn over. `;
  return "";
}

function renderLog(g) {
  const box = $("log");
  if (!g) { box.innerHTML = ""; return; }
  const lines = [`Game ${g.no}`];
  for (const e of g.log) {
    const who = e.seat >= 0 ? nameAt(e.seat) : "";
    if (e.type === "roll") lines.push(`${who} ${verb(e.seat, "roll")} ${e.dice}`);
    else if (e.type === "no move") lines.push(`${who} can't move`);
    else if (e.type === "three sixes") lines.push(`${who} ${verb(e.seat, "roll")} three 6s in a row: turn over`);
    else if (e.type === "move") {
      const what = e.from < 0 ? "brings a token out" : e.to >= L.FINISH ? "brings a token home" : `moves a token ${e.to - e.from}`;
      lines.push(`${who} ${e.seat === view.me ? what.replace("brings", "bring").replace("moves", "move") : what}` + (e.captures.length ? `, sending ${e.captures.map(([s]) => nameAt(s) === "You" ? "yours" : nameAt(s) + "'s").join(" and ")} back to base` : ""));
    } else if (e.type === "win") lines.push(`${who} ${verb(e.seat, "win")}!`);
  }
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  box.innerHTML = "";
  lines.forEach((t, i) => { const d = document.createElement("div"); d.textContent = t; if (i === 0) d.className = "hand-sep"; box.appendChild(d); });
  if (atBottom) box.scrollTop = box.scrollHeight;
}

function renderScores() {
  const box = $("scoreList"); box.innerHTML = "";
  view.seats.forEach((s, i) => {
    if (!s) return;
    const row = document.createElement("div"); row.className = "pl";
    row.innerHTML = `<span>${miniAv(avatarOf(s))}<span></span></span><span class="pts"></span><b></b>`;
    row.children[0].lastChild.textContent = `${s.name}${i === view.me ? " (you)" : ""} · ${COLOR_NAMES[i]}${s.bot ? " · bot" : ""}`;
    row.children[1].textContent = `${signed(s.points)} pts`;
    const m = moneyPts(i) * view.pointValue;
    row.children[2].textContent = s.bot && view.mode === "online" ? "–" : fmt(m, true);
    row.children[2].className = netClass(m);
    box.appendChild(row);
  });
  const r = view.rules || {}, on = [r.leave16 && "1 brings a token out", r.captureBonus && "capture rolls again", r.blocks && "blocks", r.mustCapture && "must capture", r.homeBonus && "home rolls again", r.pairSafe && "pairs are safe"].filter(Boolean);
  const note = document.createElement("div"); note.className = "pl watchers";
  note.textContent = (on.length ? on.join(" · ") + " · " : "Classic rules · ") + `${fmt(view.pointValue)} a point · ${view.games ? view.games.length : 0} games played` + (view.mode === "online" && view.seats.some(x => x && x.bot) ? " · points won or lost against bots don't count as money" : "");
  box.appendChild(note);
}

function renderTools() {
  const online = view.mode === "online";
  $("btnCopyLink").hidden = !online;
  $("btnLedger").hidden = !(online && (view.sessions.length || view.ledger.length));
  $("btnHostLink").hidden = !(online && view.isHost && view.hostKey);
  $("btnEndSession").hidden = !(online && view.isHost && view.started && !view.ending);
  $("btnClose").hidden = !(online && view.isHost);
  if (!leaveArmed) $("btnLeave").textContent = online ? "Leave the room" : "Leave and settle up";
  $("toolsNote").textContent = online
    ? (view.isHost ? "You're the host. Ending the session settles up and keeps the room, so the same code works next time." : "If you leave mid-game, a bot takes your seat.")
    : "Leaving ends the session: points turn into pretend dollars and everyone settles up.";
}

function renderBanner(g) {
  const box = $("winBanner");
  if (!g || !g.finished) { box.hidden = true; return; }
  if (bannerFor === `${g.no}`) return;
  if (bannerFor === `${g.no}-hidden`) { box.hidden = true; return; }
  bannerFor = `${g.no}`;
  const f = g.finished;
  box.innerHTML = "";
  const head = document.createElement("div"); head.className = "wb-row";
  head.innerHTML = `<div class="pic">${avatarSvg(avatarOf(view.seats[f.winner]))}</div><div class="wb-text"><div class="wb-title"></div><div class="wb-hand"></div></div>`;
  head.querySelector(".wb-title").textContent = `${nameAt(f.winner)} ${verb(f.winner, "win")}!`;
  head.querySelector(".wb-hand").textContent = `${COLOR_NAMES[f.winner]} brought all four tokens home`;
  box.appendChild(head);
  const res = document.createElement("div"); res.className = "ld-result";
  const table = document.createElement("table");
  f.points.forEach((pts, seat) => {
    if (!inPlay(seat)) return;
    const tr = document.createElement("tr"); tr.innerHTML = "<td></td><td></td><td></td><td></td>";
    tr.children[0].textContent = `${nameAt(seat)} · ${COLOR_NAMES[seat]}`;
    tr.children[1].textContent = `${g.tokens[seat].filter(p => p >= L.FINISH).length}/4 home`;
    tr.children[2].textContent = `${signed(pts)} pts`; tr.children[2].className = netClass(pts);
    const gm = gameMoney(f, seat) * view.pointValue;
    tr.children[3].textContent = view.mode === "online" && isBot(seat) ? "–" : fmt(gm, true); tr.children[3].className = netClass(gm);
    table.appendChild(tr);
  });
  res.appendChild(table); box.appendChild(res);
  box.hidden = false;
  if (animOk()) sound(f.winner === view.me ? "win" : "pot", 0.2);
  if (renderedOnce && view.me >= 0) cue.sting(f.winner === view.me ? "win" : "lose");
}
$("winBanner").addEventListener("click", () => { if (bannerFor && !bannerFor.endsWith("hidden")) bannerFor += "-hidden"; $("winBanner").hidden = true; });

// ---------- motion and sound ----------
const calm = matchMedia("(prefers-reduced-motion: reduce)");
let renderedOnce = false;
const animOk = () => renderedOnce && !calm.matches && !document.hidden;
const pct = ([c, r]) => [c / 15 * 100 + "%", (r + 0.12) / 15 * 100 + "%"];
// the squares a token passes through going from one progress to another
function pathCells(seat, from, to, i) {
  const cells = [];
  if (from < 0) cells.push(L.cellOf(seat, -1, i), L.cellOf(seat, 0));
  else for (let p = from; p <= to; p++) cells.push(L.cellOf(seat, p));
  return straighten(cells);
}
function straighten(cells) {
  const out = [cells[0]];
  for (let k = 1; k < cells.length; k++) {
    const [ax, ay] = out[out.length - 1], [bx, by] = cells[k];
    if (Math.abs(ax - bx) > 0.01 && Math.abs(ay - by) > 0.01) {
      const c1 = [bx, ay], c2 = [ax, by], d = ([x, y]) => (x - 7.5) ** 2 + (y - 7.5) ** 2;
      out.push(d(c1) <= d(c2) ? c1 : c2);
    }
    out.push(cells[k]);
  }
  return out;
}
function motion(g) {
  if (!g) return;
  const key = `${g.no}:${g.logCount}`;
  if (lastLog !== null && renderedOnce && key !== lastLog) {
    const [no, count] = lastLog.split(":").map(Number);
    const fresh = no === g.no ? Math.min(6, g.logCount - count) : 0;
    g.log.slice(g.log.length - Math.max(0, fresh)).forEach((e, k) => {
      if (e.type === "roll") { if (e.seat !== view.me || !rolling) rollDie(e.dice, e.seat === view.me ? 0 : 420); sound("deal", k * 0.05); }
      else if (e.type === "move" && animOk()) {
        const el = tokenEls[e.seat][e.token], cells = pathCells(e.seat, e.from, e.to, e.token);
        // walking: between squares the pawn lifts and leans, landing upright on each one (left foot, right foot…)
        const pts = cells.map(c => pct(c)).concat([[el.style.left, el.style.top]]);
        const rest = "translate(-50%, -78%)";
        const frames = [{ left: pts[0][0], top: pts[0][1], transform: rest }];
        for (let k = 1; k < pts.length; k++) {
          const [l0, t0] = pts[k - 1], [l1, t1] = pts[k];
          if (l0 === l1 && t0 === t1) continue;
          const mid = (x, y) => `calc((${x} + ${y}) / 2)`;
          frames.push({ left: mid(l0, l1), top: mid(t0, t1), transform: `translate(-50%, -100%) rotate(${k % 2 ? -9 : 9}deg)` });
          frames.push({ left: l1, top: t1, transform: rest });
        }
        const walkMs = Math.min(2400, 170 * ((frames.length - 1) / 2) + 60);
        el.animate(frames, { duration: walkMs, easing: "linear" });
        sound(e.captures.length ? "allin" : "flip", 0);
        if (e.captures.length && (e.seat === view.me || e.captures.some(([cs]) => cs === view.me))) cue.sting("big");
        e.captures.forEach(([s, i]) => {
          const t = tokenEls[s][i], [cl, ct] = pct(cells[cells.length - 1]);
          t.animate([{ left: cl, top: ct, opacity: 1 }, { left: cl, top: ct, opacity: .4, transform: "translate(-50%, -78%) scale(1.4)" }, { left: t.style.left, top: t.style.top, opacity: 1 }], { duration: 700, delay: walkMs - 120, easing: "ease-in-out" });
        });
      }
    });
  }
  if (lastGame !== null && g.no !== lastGame && renderedOnce) sound("deal", 0);
  const myTurnNow = !!(!g.finished && g.turn === view.me);
  if (myTurnNow && lastTurn === false && renderedOnce) { sound("turn"); cue.sting("turn"); }
  // the music: calm between games, intense once anyone has three tokens home
  cue.level(g.finished ? 0 : Math.max(...g.tokens.map(ts => ts.filter(p => p >= L.FINISH).length)) >= 3 ? 2 : 1);
  lastLog = key; lastGame = g.no; lastTurn = myTurnNow;
  renderedOnce = true;
}
// the die tumbles, then lands on the number
let dieTimer = 0;
function rollDie(n, ms = 450) {
  clearInterval(dieTimer);
  if (!animOk() || ms === 0) { rolling = false; drawDie(n, "land"); return; }
  rolling = true;
  dieTimer = setInterval(() => drawDie(1 + Math.floor(Math.random() * 6), "rolling"), 70);
  setTimeout(() => { clearInterval(dieTimer); rolling = false; drawDie(n, "land"); render(); }, ms);
}
function drawSoundBtn() { $("btnSound").textContent = soundOn() ? "🔊" : "🔇"; }
$("btnSound").onclick = () => { setSound(!soundOn()); drawSoundBtn(); sound("flip"); };
addEventListener("cr-fx", () => queueMicrotask(drawSoundBtn));
drawSoundBtn();

function tickClock() {
  if (!view || view.ended) return;
  const g = view.game;
  rowEls.forEach((el, s) => {
    const on = view.deadline && g && !g.finished && g.turn === s;
    el.querySelector(".timer").style.width = on ? Math.max(0, Math.min(100, (view.deadline - Date.now()) / (view.actMs || 30000) * 100)) + "%" : "0";
  });
  if (g && g.finished && view.nextGameAt) $("status").textContent = statusText(g);
}
setInterval(tickClock, 250);

// ---------- input ----------
function guard(fn) { return async (...a) => { try { await fn(...a); } catch (err) { $("status").textContent = err.message; } }; }
async function sendMove(m) { clearTimeout(autoTimer); await ctrl.move(m); }
$("btnRoll").onclick = guard(async () => {
  if (animOk()) { rolling = true; clearInterval(dieTimer); dieTimer = setInterval(() => drawDie(1 + Math.floor(Math.random() * 6), "rolling"), 70); $("btnRoll").disabled = true; }
  const started = Date.now();
  try { await sendMove({ type: "roll" }); } finally {
    const g = view && view.game, wait = Math.max(0, 450 - (Date.now() - started));
    setTimeout(() => { clearInterval(dieTimer); rolling = false; drawDie(shownDie(g), "land"); render(); }, wait);
  }
});
$("tokens").addEventListener("click", guard(async e => {
  const t = e.target.closest(".token.can"); if (!t) return;
  await sendMove({ type: "move", token: +t.dataset.i });
}));
$("btnNext").onclick = guard(() => ctrl.nextGame());
$("btnStart").onclick = guard(() => ctrl.start());
$("btnLook").onclick = guard(async () => {
  const code = await openLook(myAvatar()); if (!code) return;
  store.set("pk-avatar", code); drawLookButtons();
  if (ctrl.setPrefs) await ctrl.setPrefs({ avatar: code });
});
$("btnCopyLink").onclick = async () => {
  const url = `${location.origin}${location.pathname}?code=${view.code}#online`;
  try { await navigator.clipboard.writeText(url); $("btnCopyLink").textContent = "Link copied"; } catch { $("btnCopyLink").textContent = url; }
  setTimeout(() => $("btnCopyLink").textContent = "Copy invite link", 2500);
};
$("btnHostLink").onclick = async () => {
  const url = `${location.origin}${location.pathname}?code=${view.code}&host=${view.hostKey}#online`;
  try { await navigator.clipboard.writeText(url); $("btnHostLink").textContent = "Host link copied. Keep it private"; } catch { $("btnHostLink").textContent = url; }
  setTimeout(() => $("btnHostLink").textContent = "Copy host link", 3500);
};
let leaveArmed = 0, closeArmed = 0, endArmed = 0, paidArmed = 0;
const twoTap = (id, label, armedText, getT, setT, fn) => guard(async () => {
  if (!getT()) { setT(setTimeout(() => { setT(0); $(id).textContent = label; render(); }, 4000)); $(id).textContent = armedText; return; }
  clearTimeout(getT()); setT(0);
  await fn();
});
$("btnLeave").onclick = twoTap("btnLeave", "Leave", "Tap again to leave", () => leaveArmed, v => leaveArmed = v, async () => {
  if (view.mode === "online") { await ctrl.leave().catch(() => {}); backToLobby(); } else await ctrl.leave();
});
$("btnClose").onclick = twoTap("btnClose", "Close room for good", "Tap again to close the room", () => closeArmed, v => closeArmed = v, () => ctrl.close());
$("btnEndSession").onclick = twoTap("btnEndSession", "End session & settle up", "Tap again to end the session", () => endArmed, v => endArmed = v, () => ctrl.endSession());
document.addEventListener("keydown", e => {
  if (!view || !view.game || e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
  if ((e.key === " " || e.key === "Enter") && !$("btnRoll").disabled) { e.preventDefault(); $("btnRoll").click(); }
  const n = +e.key;
  if (n >= 1 && n <= 4) { const t = tokenEls[view.me] && tokenEls[view.me][n - 1]; if (t && t.classList.contains("can")) t.click(); }
});

// ---------- chat (rooms with friends) ----------
let lastChatN = null;
function renderChat() {
  const online = view.mode === "online";
  $("chatPanel").hidden = !online; $("reactWrap").hidden = !online;
  if (!online) return;
  const chat = view.chat || [], newest = chat.length ? chat[chat.length - 1].n : 0;
  if (lastChatN === null) lastChatN = newest;
  const fresh = chat.filter(c => c.n > lastChatN);
  lastChatN = Math.max(lastChatN, newest);
  const box = $("chatLog"); box.innerHTML = "";
  if (!chat.length) box.innerHTML = '<div class="note">No messages yet.</div>';
  chat.forEach(c => {
    const d = document.createElement("div"); d.className = "chat-line" + (c.kind === "react" ? " react" : "");
    d.innerHTML = "<b></b> <span></span>"; d.firstChild.textContent = c.name; d.lastChild.textContent = c.kind === "react" ? c.emoji : c.text;
    box.appendChild(d);
  });
  box.scrollTop = box.scrollHeight;
  fresh.forEach((c, k) => {
    sound(c.kind === "react" ? "react" : "chat", k * 0.1);
    if (c.seat < 0 || c.seat === view.me) return;
    const el = seatEls[posOf(c.seat) - 1]; if (!el) return;
    if (c.kind === "react") { const fl = document.createElement("div"); fl.className = "react-float"; fl.textContent = c.emoji; el.appendChild(fl); setTimeout(() => fl.remove(), 2200); }
    else { const b = el.querySelector(".bubble"); b.textContent = c.text; b.hidden = false; clearTimeout(b._t); b._t = setTimeout(() => b.hidden = true, 4500); }
  });
}
for (const box of [$("chatReacts"), $("reactPop")]) REACTIONS.forEach(e => {
  const b = document.createElement("button"); b.type = "button"; b.className = "react-btn"; b.textContent = e; b.setAttribute("aria-label", "Send " + e);
  b.onclick = guard(async () => { $("reactPop").hidden = true; await ctrl.react(e); });
  box.appendChild(b);
});
$("btnReact").onclick = () => { $("reactPop").hidden = !$("reactPop").hidden; };
$("chatForm").addEventListener("submit", guard(async e => { e.preventDefault(); const t = $("chatInput").value.trim(); if (!t) return; await ctrl.chat(t); $("chatInput").value = ""; }));

// ---------- room ledger ----------
$("btnLedger").onclick = () => openLedger();
function openLedger() {
  const sessions = view.sessions || [], led = view.ledger || [];
  $("ldIntro").textContent = `Room ${view.code}. Pretend dollars only: settle up between yourselves.`;
  const all = settle(led.map(r => ({ name: r.name, buyIn: 0, cashOut: r.net })));
  const body = $("ldBody");
  body.innerHTML = `<h3>All sessions so far</h3><div class="scroll-x"><table class="summary-table"><thead><tr><th>Player</th><th>Sessions</th><th>Up / down</th></tr></thead><tbody></tbody></table></div><h3>Settle everything</h3><ul class="payments"></ul><h3>Past sessions</h3><div class="ld-history"></div>`;
  const tb = body.querySelector("tbody");
  if (!led.length) tb.innerHTML = '<tr><td colspan="3">Nothing owed right now.</td></tr>';
  led.forEach(r => { const tr = document.createElement("tr"); tr.innerHTML = "<td></td><td></td><td></td>"; tr.children[0].textContent = r.name; tr.children[1].textContent = r.sessions; tr.children[2].textContent = fmt(r.net, true); tr.children[2].className = netClass(r.net); tb.appendChild(tr); });
  const ul = body.querySelector(".payments");
  if (!all.payments.length) ul.innerHTML = "<li>Everyone is square.</li>";
  all.payments.forEach(p => { const li = document.createElement("li"); li.textContent = `${p.from} pays ${p.to} ${fmt(p.amount)}`; ul.appendChild(li); });
  const hist = body.querySelector(".ld-history");
  if (!sessions.length) hist.innerHTML = '<p class="note">No sessions finished yet.</p>';
  sessions.slice().reverse().forEach(x => {
    const d = document.createElement("div"); d.className = "ld-session"; d.innerHTML = "<b></b><span></span>";
    d.firstChild.textContent = `Session ${x.no} · ${new Date(x.endedAt).toLocaleDateString()} · ${x.games} games`;
    d.lastChild.textContent = x.rows.map(r => `${r.name} ${fmt(r.net, true)}`).join(" · ");
    hist.appendChild(d);
  });
  $("ldMarkPaid").hidden = !(view.isHost && led.some(r => r.net !== 0));
  if (!$("ledgerDlg").open) $("ledgerDlg").showModal();
}
$("ldMarkPaid").onclick = guard(async () => {
  if (!paidArmed) { paidArmed = setTimeout(() => { paidArmed = 0; $("ldMarkPaid").textContent = "Everyone's paid: start totals again"; }, 4000); $("ldMarkPaid").textContent = "Tap again: totals go back to zero"; return; }
  clearTimeout(paidArmed); paidArmed = 0;
  await ctrl.markPaid(); openLedger();
});
$("ldCopy").onclick = async () => {
  const led = view.ledger || [], all = settle(led.map(r => ({ name: r.name, buyIn: 0, cashOut: r.net })));
  const text = [`Ludo, room ${view.code}`, ...led.map(r => `${r.name}: ${fmt(r.net, true)}`), "To settle:", ...all.payments.map(p => `${p.from} pays ${p.to} ${fmt(p.amount)}`)].join("\n");
  try { await navigator.clipboard.writeText(text); $("ldCopy").textContent = "Copied"; } catch {}
  setTimeout(() => $("ldCopy").textContent = "Copy results", 2000);
};
// a session just ended in an online room: show the ledger
let lastSessionNo;

// ---------- summary ----------
function renderSummary() {
  showScreen("scrSummary");
  const s = view.summary; if (!s) return;
  $("sumTitle").textContent = view.mode === "ai" ? "Session over" : "Room closed";
  $("sumIntro").textContent = `${s.games} game${s.games === 1 ? "" : "s"} at ${fmt(s.pointValue)} a point. Pretend dollars only: settle up between yourselves.`;
  const body = $("sumRows"); body.innerHTML = "";
  s.rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${miniAv(avatarOf(r))}<span></span></td><td></td><td></td>`;
    tr.children[0].lastChild.textContent = r.name + (r.me ? " (you)" : "") + (r.isBot ? " · bot" : "");
    tr.children[1].textContent = signed(r.points ?? Math.round(r.net / s.pointValue));
    tr.children[2].textContent = fmt(r.net, true); tr.children[2].className = netClass(r.net);
    body.appendChild(tr);
  });
  const pay = $("sumPay"); pay.innerHTML = "";
  if (!s.payments.length) pay.innerHTML = "<li>Nobody owes anybody.</li>";
  s.payments.forEach(p => { const li = document.createElement("li"); li.textContent = `${p.from} pays ${p.to} ${fmt(p.amount)}`; pay.appendChild(li); });
}
$("btnSumDone").onclick = () => backToLobby();
$("btnSumCopy").onclick = async () => {
  const s = view.summary;
  const text = ["Ludo results", ...s.rows.map(r => `${r.name}: ${fmt(r.net, true)}`), "", ...s.payments.map(p => `${p.from} pays ${p.to} ${fmt(p.amount)}`)].join("\n");
  try { await navigator.clipboard.writeText(text); $("btnSumCopy").textContent = "Copied"; } catch {}
  setTimeout(() => $("btnSumCopy").textContent = "Copy results", 2000);
};

compact.addEventListener("change", () => view && render());
window.addEventListener("resize", () => view && !view.ended && render());
initSetup();
