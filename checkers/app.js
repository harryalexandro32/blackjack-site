// Checkers screens: pick a mode (bot / two on this device / online), then the board.
// Tap a glowing piece, then a glowing square. Your pieces are at the bottom.
import { REACTIONS } from "../supabase/functions/_shared/poker-room.js";
import { avatarSvg, DEFAULT_AVATAR } from "../poker/avatars.js";
import { openLook } from "../poker/look.js";
import { play as sound, soundOn, setSound } from "../poker/sound.js";
import { LocalCheckers } from "./local.js";

const $ = id => document.getElementById(id);
const CONFIG = window.POKER_CONFIG || {};
const onlineEnabled = !!(CONFIG.supabaseUrl && CONFIG.anonKey);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const online = () => import("./online.js");
const RULE_NAME = { dam: "Dam", english: "English" };
const COLOUR = ["Light", "Dark"];

// ---------- setup ----------
const myAvatar = () => store.get("pk-avatar", DEFAULT_AVATAR);
function drawLookButtons() { document.querySelectorAll("[data-look]").forEach(b => b.innerHTML = `<span class="av">${avatarSvg(myAvatar())}</span>`); }
document.querySelectorAll("[data-look]").forEach(b => b.addEventListener("click", async () => { const code = await openLook(myAvatar()); if (code) { store.set("pk-avatar", code); drawLookButtons(); } }));
function seg(id, key, def) {
  const el = $(id), saved = store.get(key, def);
  const set = v => el.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
  set(saved);
  el.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { set(b.dataset.v); store.set(key, b.dataset.v); }));
  return () => el.querySelector('[aria-pressed="true"]').dataset.v;
}
const aiSkill = seg("aiSkill", "ck-skill", "normal"), aiRules = seg("aiRules", "ck-rules", "dam"), lcRules = seg("lcRules", "ck-rules", "dam"), crRules = seg("crRules", "ck-rules", "dam");
const nameOf = id => $(id).value.trim().replace(/\s+/g, " ").slice(0, 16);

function route() {
  const mode = location.hash === "#online" ? "online" : location.hash === "#local" ? "local" : "ai";
  [["tabAi", "ai"], ["tabLocal", "local"], ["tabOnline", "online"]].forEach(([id, m]) => $(id).setAttribute("aria-current", mode === m ? "page" : "false"));
  $("formAi").hidden = mode !== "ai";
  $("formLocal").hidden = mode !== "local";
  $("formCreate").hidden = $("formJoin").hidden = mode !== "online" || !onlineEnabled;
  $("onlineOff").hidden = !(mode === "online" && !onlineEnabled);
}
window.addEventListener("hashchange", () => { if (!ctrl) route(); });

$("formAi").addEventListener("submit", e => {
  e.preventDefault();
  const name = nameOf("aiName") || "Player";
  store.set("pk-name", name);
  attach(new LocalCheckers({ mode: "ai", rules: aiRules(), skill: aiSkill(), names: [name], avatar: myAvatar() }));
});
$("formLocal").addEventListener("submit", e => {
  e.preventDefault();
  const a = nameOf("lcA") || "Player 1", b = nameOf("lcB") || "Player 2";
  store.set("ck-local-names", [a, b]);
  attach(new LocalCheckers({ mode: "local", rules: lcRules(), names: [a, b] }));
});
$("formCreate").addEventListener("submit", async e => {
  e.preventDefault();
  const name = nameOf("crName");
  if (!name) return $("crErr").textContent = "Enter your name.";
  $("crErr").textContent = ""; $("btnCreate").disabled = true;
  try { store.set("pk-name", name); const { OnlineCheckers } = await online(); attach(await OnlineCheckers.create({ name, avatar: myAvatar(), settings: { rules: crRules(), moveSeconds: +$("crTime").value } })); }
  catch (err) { $("crErr").textContent = err.message; }
  finally { $("btnCreate").disabled = false; }
});
$("formJoin").addEventListener("submit", async e => {
  e.preventDefault();
  const code = $("jnCode").value.trim().toUpperCase(), name = nameOf("jnName");
  if (code.length !== 6) return $("jnErr").textContent = "Room codes are 6 letters and numbers.";
  if (!name) return $("jnErr").textContent = "Enter your name.";
  $("jnErr").textContent = ""; $("btnJoin").disabled = true;
  try { store.set("pk-name", name); const { OnlineCheckers } = await online(); attach(await OnlineCheckers.join({ code, name, avatar: myAvatar() })); }
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
    $("jnRules").textContent = !r ? "No open room with that code." : r.game !== "checkers" ? "That code is a different game. Join it from its own page." : `${RULE_NAME[r.settings.rules]} rules · ${r.humans} in the room${r.humans >= 2 ? " (you'll watch until a seat frees up)" : ""}`;
  } catch {}
});
$("btnRejoin").addEventListener("click", async () => {
  try { const { OnlineCheckers } = await online(); attach(await OnlineCheckers.resume()); }
  catch (err) { $("jnErr").textContent = err.message; $("btnRejoin").hidden = true; }
});

const params = new URLSearchParams(location.search);
function initSetup() {
  const name = store.get("pk-name", "");
  if (name) { $("aiName").value = name; $("crName").value = name; $("jnName").value = name; }
  const ln = store.get("ck-local-names", null);
  if (ln) { $("lcA").value = ln[0]; $("lcB").value = ln[1]; }
  drawLookButtons();
  $("scrSetup").hidden = false; $("scrTable").hidden = true; $("meters").hidden = true;
  route();
  if (!onlineEnabled) return;
  if (params.get("code") && params.get("host")) {
    const code = params.get("code").toUpperCase().slice(0, 6), key = params.get("host");
    window.history.replaceState(null, "", location.pathname + "#online");
    online().then(m => m.OnlineCheckers.claim({ code, hostKey: key })).then(attach).catch(err => { $("jnCode").value = code; $("jnErr").textContent = err.message; });
    return;
  }
  if (params.get("code")) { location.hash = "#online"; $("jnCode").value = params.get("code").toUpperCase().slice(0, 6); $("jnCode").dispatchEvent(new Event("change")); }
  online().then(m => { $("btnRejoin").hidden = !m.hasSavedSeat(); }).catch(() => {});
}

// ---------- the table ----------
let ctrl = null, unsub = null, view = null, picked = null, lastKey = null, prevBoard = null, bannerFor = null;
function attach(c) {
  if (unsub) unsub();
  if (ctrl && ctrl !== c) ctrl.destroy();
  ctrl = c; picked = null; lastKey = null; prevBoard = null; bannerFor = null; lastChatN = null;
  $("scrSetup").hidden = true; $("scrTable").hidden = false; $("meters").hidden = false;
  buildCells();
  unsub = ctrl.subscribe(v => { view = v; render(); });
}
function backToSetup() {
  if (ctrl) ctrl.destroy();
  if (unsub) unsub();
  ctrl = null; view = null; unsub = null;
  initSetup();
}
function guard(fn) { return async (...a) => { try { await fn(...a); } catch (err) { $("status").textContent = err.message; } }; }

// squares on screen: the bottom player's pieces at the bottom
const flip = () => view && view.bottom === 1;
const screenRC = sq => { const r = sq >> 3, c = sq & 7; return flip() ? [7 - r, 7 - c] : [r, c]; };
const sqAt = (sr, sc) => flip() ? (7 - sr) * 8 + (7 - sc) : sr * 8 + sc;
const pos = sq => { const [r, c] = screenRC(sq); return { left: c * 12.5 + "%", top: r * 12.5 + "%" }; };
const owner = p => p === "a" || p === "A" ? 0 : p === "b" || p === "B" ? 1 : -1;
const name = sq => { const r = sq >> 3, c = sq & 7; return "abcdefgh"[c] + (8 - r); };

function buildCells() {
  const box = $("cells"); box.innerHTML = "";
  for (let sr = 0; sr < 8; sr++) for (let sc = 0; sc < 8; sc++) {
    const d = document.createElement("div");
    d.className = "ck-cell" + ((sr + sc) % 2 ? " dark" : "");
    d.dataset.sr = sr; d.dataset.sc = sc;
    box.appendChild(d);
  }
}

const myTurn = () => { const g = view && view.view; return !!(g && !g.finished && view.me >= 0 && g.turn === view.me && !(view.players[g.turn] && view.players[g.turn].bot)); };

function render() {
  if (!view) return;
  if (view.ended) { backToSetup(); return; }
  const g = view.view;
  $("mGame").textContent = view.gameNo || "–";
  $("mRules").textContent = RULE_NAME[(g && g.rules) || view.settings.rules];
  $("mPieces").textContent = g ? `${g.counts[view.bottom]} – ${g.counts[1 - view.bottom]}` : "–";
  $("mCodeWrap").hidden = view.mode !== "online"; $("mCode").textContent = view.code || "";
  renderPlayers(g);
  if (g) {
    const key = `${g.no}:${g.logCount}`;
    if (key !== lastKey) { if (lastKey && lastKey.split(":")[0] === String(g.no)) animateLast(g); picked = null; lastKey = key; }
    if (myTurn()) { const froms = [...new Set(g.legal.map(m => m.from))]; if (froms.length === 1) picked = froms[0]; }
    renderBoard(g);
    prevBoard = g.board;
  } else { $("pieces").innerHTML = ""; [...$("cells").children].forEach(c => c.className = "ck-cell" + ((+c.dataset.sr + +c.dataset.sc) % 2 ? " dark" : "")); }
  $("status").textContent = statusText(g);
  renderButtons(g);
  renderBanner(g);
  renderLobby(g);
  renderLog(g);
  renderChat();
}

function renderPlayers(g) {
  const top = 1 - view.bottom, bottom = view.bottom;
  [[$("pTop"), top], [$("pBottom"), bottom]].forEach(([el, seat]) => {
    const p = view.players[seat];
    if (!p) { el.innerHTML = `<span class="chip s${seat}"></span><span></span><span class="who">Waiting for a player…</span><span></span>`; el.classList.remove("turn"); return; }
    el.innerHTML = `<span class="chip s${seat}"></span><span class="pic"></span><span class="who"><span></span><small></small></span><span class="count"></span><span class="timer"></span>`;
    const pic = el.querySelector(".pic");
    if (p.avatar || view.mode !== "local") pic.innerHTML = avatarSvg(p.avatar || DEFAULT_AVATAR); else { pic.classList.add("initial"); pic.textContent = p.name.slice(0, 1).toUpperCase(); }
    el.querySelector(".who span").textContent = (view.mode !== "local" && seat === view.me ? "You" : p.name) + (p.bot ? " · bot" : "") + (p.here === false ? " · left" : "");
    el.querySelector(".who small").textContent = `${COLOUR[seat]} pieces${g && g.turn === seat && !g.finished ? " · to move" : ""}`;
    el.querySelector(".count").textContent = g ? `${g.counts[seat]} left` : "";
    el.classList.toggle("turn", !!(g && !g.finished && g.turn === seat));
  });
}

function renderBoard(g) {
  const mine = myTurn();
  const dests = picked !== null ? g.legal.filter(m => m.from === picked) : [];
  const froms = mine ? new Set(g.legal.map(m => m.from)) : new Set();
  [...$("cells").children].forEach(cell => {
    const sq = sqAt(+cell.dataset.sr, +cell.dataset.sc);
    const d = dests.find(m => m.to === sq);
    cell.className = "ck-cell" + ((+cell.dataset.sr + +cell.dataset.sc) % 2 ? " dark" : "")
      + (g.last && (g.last.from === sq || g.last.to === sq) ? " last" : "") + (picked === sq ? " from" : "") + (d ? " dest" + (d.caps.length ? " cap" : "") : "");
    cell.onclick = d ? guard(async () => { const m = dests.filter(x => x.to === sq).sort((a, b) => b.caps.length - a.caps.length)[0]; picked = null; await ctrl.move({ from: m.from, to: m.to, path: m.path }); }) : null;
  });
  const box = $("pieces"); box.innerHTML = "";
  for (let sq = 0; sq < 64; sq++) {
    const p = g.board[sq]; if (p === ".") continue;
    const can = froms.has(sq);
    const el = document.createElement(can ? "button" : "div");
    if (can) { el.type = "button"; el.setAttribute("aria-label", `${COLOUR[owner(p)]} ${p === p.toUpperCase() ? "king" : "piece"} on ${name(sq)}`); }
    el.className = `ck-piece s${owner(p)}` + (can ? " can" : "") + (picked === sq ? " picked" : "");
    el.dataset.sq = sq;
    Object.assign(el.style, pos(sq));
    el.innerHTML = `<i>${p === p.toUpperCase() ? "♛" : ""}</i>`;
    if (can) el.onclick = () => { picked = picked === sq ? null : sq; sound("flip", 0); renderBoard(g); };
    box.appendChild(el);
  }
}

// the last move slides along its path; captured pieces fade away
function animateLast(g) {
  const L = g.last; if (!L) return;
  requestAnimationFrame(() => {
    const el = $("pieces").querySelector(`[data-sq="${L.to}"]`);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (el && !reduce) {
      const frames = [L.from, ...L.path].map(sq => pos(sq));
      el.animate(frames, { duration: Math.min(1200, 220 * L.path.length + 120), easing: "ease-in-out" });
    }
    if (prevBoard && !reduce) L.caps.forEach((sq, i) => {
      const ghost = document.createElement("div");
      const p = prevBoard[sq];
      ghost.className = `ck-piece s${owner(p)}`; Object.assign(ghost.style, pos(sq));
      ghost.innerHTML = `<i>${p === p.toUpperCase() ? "♛" : ""}</i>`;
      $("pieces").appendChild(ghost);
      ghost.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.4)" }], { duration: 400, delay: 220 * (i + 1), fill: "forwards" });
      setTimeout(() => ghost.remove(), 220 * (i + 1) + 450);
    });
  });
  sound(L.caps.length ? "allin" : "check", 0);
  if (L.crowned) sound("pot", 0.25);
}

function statusText(g) {
  if (!g) return view.isHost ? "Share the code with a friend, then start the game." : "Waiting for the host to start the game.";
  if (g.finished) {
    const f = g.finished;
    if (f.winner === -1) return "A draw: 25 moves each with only kings and no captures.";
    const w = view.players[f.winner];
    const how = f.how === "resign" ? "by resignation" : f.how === "blocked" ? "(no moves left)" : "";
    return `${view.mode !== "local" && f.winner === view.me ? "You win" : (w ? w.name : "?") + " wins"} ${how}`.trim() + ".";
  }
  const who = view.players[g.turn];
  const mustCap = g.legal.length && g.legal[0].caps.length;
  if (myTurn()) return (view.mode === "local" ? `${who.name}, your move` : "Your move") + (mustCap ? ": you must capture." : picked !== null ? ": tap a glowing square." : ": tap a piece.");
  if (view.me < 0 && view.mode === "online") return `Watching: ${who ? who.name : "?"} to move.`;
  return `${who ? who.name : "?"} is thinking…`;
}

function renderButtons(g) {
  const fin = !!(g && g.finished);
  const playing = view.mode !== "online" || view.me >= 0 || (g && g.finished && view.players.some(p => p.name === view.myName));
  $("btnRematch").hidden = !(fin && (view.mode !== "online" || playing)) && !(!g && view.isHost);
  $("btnRematch").textContent = !g ? "Start the game" : "Play again";
  $("btnResign").hidden = !(g && !g.finished && (view.mode === "local" || view.me >= 0));
  $("btnUndoPick").hidden = true;
}

function renderBanner(g) {
  const b = $("winBanner");
  if (!g || !g.finished) { b.hidden = true; return; }
  if (bannerFor === g.no) return;
  bannerFor = g.no;
  const f = g.finished, w = view.players[f.winner];
  b.innerHTML = `<div class="wb-title"></div>`;
  b.querySelector(".wb-title").textContent = f.winner === -1 ? "Draw" : view.mode !== "local" && f.winner === view.me ? "You win!" : `${w ? w.name : "?"} wins!`;
  b.hidden = false;
  sound(f.winner === view.me || view.mode === "local" ? "win" : "fold", 0.2);
}
$("winBanner").addEventListener("click", () => $("winBanner").hidden = true);

function renderLobby(g) {
  const list = $("lobbyList"); list.innerHTML = "";
  const rows = view.mode === "online" ? view.lobby : view.players.map(p => ({ name: p.name, bot: p.bot, playing: true }));
  rows.forEach(p => {
    const row = document.createElement("div"); row.className = "pl";
    row.innerHTML = "<span></span><span class='pts'></span>";
    row.firstChild.textContent = p.name + (p.name === view.myName ? " (you)" : "") + (p.bot ? " · bot" : "");
    row.lastChild.textContent = [p.host && "host", view.mode === "online" && (p.playing ? "playing" : "watching")].filter(Boolean).join(" · ");
    list.appendChild(row);
  });
  const sb = $("settingsBox");
  sb.hidden = !(view.mode === "online" && view.isHost && !view.running);
  if (!sb.hidden) {
    $("sRules").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === view.settings.rules)));
    if (document.activeElement !== $("sTime")) $("sTime").value = String(view.settings.moveSeconds);
  }
  const wins = $("winsList"); wins.innerHTML = "";
  if (!view.wins.length || !view.wins.some(w => w.games)) wins.innerHTML = '<div class="note">No games finished yet.</div>';
  else view.wins.forEach(w => { const r = document.createElement("div"); r.className = "pl"; r.innerHTML = "<span></span><b></b>"; r.firstChild.textContent = w.name + (w.bot ? " · bot" : ""); r.lastChild.textContent = `${w.wins} won${w.draws ? `, ${w.draws} drawn` : ""} of ${w.games}`; wins.appendChild(r); });
  const on = view.mode === "online";
  $("btnLook").hidden = !on; $("btnCopyLink").hidden = !on; $("chatPanel").hidden = !on;
  $("btnHostLink").hidden = !(on && view.isHost && view.hostKey);
  $("btnClose").hidden = !(on && view.isHost);
}
$("sRules").querySelectorAll("button").forEach(b => b.addEventListener("click", guard(() => ctrl.settings({ rules: b.dataset.v }))));
$("sTime").addEventListener("change", guard(() => ctrl.settings({ moveSeconds: +$("sTime").value })));

function renderLog(g) {
  const box = $("log");
  if (!g) { box.innerHTML = '<div class="note">The game hasn\'t started.</div>'; return; }
  // the engine's log in the view is just a count; rebuild a readable list from the moves we've seen
  if (!view.view.logCount) return;
  const hist = logHist(g);
  box.innerHTML = "";
  hist.forEach(t => { const d = document.createElement("div"); d.textContent = t; box.appendChild(d); });
  box.scrollTop = box.scrollHeight;
}
let hist = { no: null, lines: [], seen: null };
function logHist(g) {
  if (hist.no !== g.no) hist = { no: g.no, lines: [`Game ${g.no} · ${RULE_NAME[g.rules]} rules`], seen: null };
  if (g.last && hist.seen !== g.moves) {
    hist.seen = g.moves;
    const L = g.last, who = view.players[L.seat];
    hist.lines.push(`${g.moves}. ${who ? who.name : COLOUR[L.seat]}: ${name(L.from)}${L.caps.length ? "×" + L.path.map(name).join("×") : "–" + name(L.to)}${L.crowned ? " ♛" : ""}`);
  }
  if (g.finished && !hist.done) { hist.done = true; hist.lines.push(statusText(g)); }
  return hist.lines;
}

// ---------- buttons ----------
$("btnRematch").onclick = guard(() => view.view ? ctrl.rematch() : ctrl.start());
let resignArmed = 0;
$("btnResign").onclick = guard(async () => {
  if (!resignArmed) { resignArmed = setTimeout(() => { resignArmed = 0; $("btnResign").textContent = "Resign"; }, 3500); $("btnResign").textContent = "Tap again to resign"; return; }
  clearTimeout(resignArmed); resignArmed = 0; $("btnResign").textContent = "Resign";
  await ctrl.resign();
});
let leaveArmed = 0, closeArmed = 0;
$("btnLeave").onclick = guard(async () => {
  const inGame = view.view && !view.view.finished && (view.mode !== "online" || view.me >= 0);
  if (inGame && !leaveArmed) { leaveArmed = setTimeout(() => { leaveArmed = 0; $("btnLeave").textContent = "Leave"; }, 4000); $("btnLeave").textContent = "Tap again: you'll resign this game"; return; }
  clearTimeout(leaveArmed); leaveArmed = 0;
  await ctrl.leave().catch(() => {});
  backToSetup();
});
$("btnClose").onclick = guard(async () => {
  if (!closeArmed) { closeArmed = setTimeout(() => { closeArmed = 0; $("btnClose").textContent = "Close room for good"; }, 4000); $("btnClose").textContent = "Tap again to close the room"; return; }
  clearTimeout(closeArmed); closeArmed = 0;
  await ctrl.close();
});
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

// ---------- chat (online) ----------
let lastChatN = null;
function renderChat() {
  if (view.mode !== "online") return;
  const box = $("chatLog"); box.innerHTML = "";
  if (!view.chat.length) box.innerHTML = '<div class="note">No messages yet.</div>';
  view.chat.forEach(c => { const d = document.createElement("div"); d.className = "chat-line" + (c.kind === "react" ? " react" : ""); d.innerHTML = "<b></b> <span></span>"; d.firstChild.textContent = c.name; d.lastChild.textContent = c.kind === "react" ? c.emoji : c.text; box.appendChild(d); });
  box.scrollTop = box.scrollHeight;
  const newest = view.chat.length ? view.chat[view.chat.length - 1].n : 0;
  if (lastChatN !== null && newest > lastChatN) sound("chat", 0);
  lastChatN = newest;
}
REACTIONS.forEach(e => { const b = document.createElement("button"); b.type = "button"; b.className = "react-btn"; b.textContent = e; b.setAttribute("aria-label", "Send " + e); b.onclick = guard(() => ctrl.react(e)); $("chatReacts").appendChild(b); });
$("chatForm").addEventListener("submit", guard(async e => { e.preventDefault(); const t = $("chatInput").value.trim(); if (!t) return; await ctrl.chat(t); $("chatInput").value = ""; }));

// ---------- the move clock (online) ----------
setInterval(() => {
  if (!view || !view.deadline || !view.moveMs || !view.view) return;
  const g = view.view, el = (g.turn === view.bottom ? $("pBottom") : $("pTop")).querySelector(".timer");
  if (el) el.style.width = Math.max(0, Math.min(100, (view.deadline - Date.now()) / view.moveMs * 100)) + "%";
}, 250);

void soundOn; void setSound;
initSetup();
