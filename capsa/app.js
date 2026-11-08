// Capsa Banting screens. Works with LocalCapsa (bots) or OnlineCapsa (friends).
import * as C from "../supabase/functions/_shared/capsa-engine.js";
import { capsaMove } from "../supabase/functions/_shared/capsa-bot.js";
import { settle } from "../supabase/functions/_shared/poker-engine.js";
import { REACTIONS } from "../supabase/functions/_shared/poker-room.js";
import { LocalCapsa, savedCapsaGame } from "./local.js";
import { avatarSvg, PRESETS, DEFAULT_AVATAR } from "../poker/avatars.js";
import { openLook } from "../poker/look.js";
import { play as sound, soundOn, setSound } from "../poker/sound.js";

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
// Money in points. Against bots (bots mode) every point counts; in rooms with friends, points won from or
// lost to a bot don't turn into money, so friends only owe each other.
const isBot = seat => !!(view.seats[seat] && view.seats[seat].bot);
const moneyPts = seat => view.mode === "online" ? (view.seats[seat]?.money || 0) : (view.seats[seat]?.points || 0);
function gameMoney(f, seat) {
  if (view.mode !== "online") return f.points[seat];
  if (f.winner < 0 || isBot(f.winner)) return 0;
  const paid = i => f.bombed !== null ? (i === f.bombed ? -f.points[i] : 0) : -f.points[i];
  if (seat === f.winner) return [0, 1, 2, 3].filter(i => i !== seat && !isBot(i)).reduce((a, i) => a + paid(i), 0);
  return isBot(seat) ? 0 : -paid(seat);
}
const netClass = n => n > 0 ? "pos" : n < 0 ? "neg" : "";

// ---------- cards ----------
const SUIT = { s: "♠", h: "♥", d: "♦", c: "♣" };
const rankText = r => r === "T" ? "10" : r;
const cardName = c => rankText(c[0]) + SUIT[c[1]];
function cardEl(code) {
  const el = document.createElement("div");
  if (!code) { el.className = "card back"; return el; }
  el.className = "card" + (code[1] === "h" || code[1] === "d" ? " red" : "");
  el.dataset.code = code;
  el.setAttribute("aria-label", cardName(code));
  el.innerHTML = `<div class="corner">${rankText(code[0])}<span>${SUIT[code[1]]}</span></div><div class="pip">${SUIT[code[1]]}</div>`;
  return el;
}

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
  document.body.classList.toggle("at-capsa", id === "scrTable");
}
const sizeVar = (el, name) => new ResizeObserver(() => document.documentElement.style.setProperty(name, el.offsetHeight + "px")).observe(el);
sizeVar(document.querySelector(".bar"), "--bar-h");
sizeVar($("crail"), "--rail-h");

let ctrl = null, unsub = null, view = null;
function attach(controller) {
  if (unsub) unsub();
  if (ctrl && ctrl !== controller && ctrl.destroy) ctrl.destroy();
  ctrl = controller; selected = new Set(); lastLog = null; lastGame = null; lastChatN = null; lastTurn = null; bannerFor = null;
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
const nameOf = id => $(id).value.trim().replace(/\s+/g, " ").slice(0, 16);

$("formAi").addEventListener("submit", e => {
  e.preventDefault();
  const name = nameOf("aiName") || "Player", pointValue = toCents($("aiValue").value);
  if (!(pointValue >= 1)) return $("aiErr").textContent = "Enter how many dollars a point is worth.";
  $("aiErr").textContent = "";
  store.set("pk-name", name);
  attach(LocalCapsa.create({ name, avatar: myAvatar(), skill: segValue("aiSkill"), pointValue }));
});
$("aiResume").addEventListener("click", () => { const s = savedCapsaGame(); if (s) attach(new LocalCapsa(s)); });

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
    const { OnlineCapsa } = await online();
    attach(await OnlineCapsa.create({ name, avatar: myAvatar(), pointValue, actSeconds: +$("crTime").value, skill: segValue("crSkill") }));
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
    const { OnlineCapsa } = await online();
    attach(await OnlineCapsa.join({ code, name, avatar: myAvatar() }));
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
    $("jnRules").textContent = !r ? "No open room with that code." : r.game !== "capsa" ? "That code is a poker table. Join it from the poker page." : `${fmt(r.pointValue)} a point · ${r.humans} of 4 seats taken by people`;
  } catch {}
});
$("btnRejoin").addEventListener("click", async () => {
  try { const { OnlineCapsa } = await online(); attach(await OnlineCapsa.resume()); }
  catch (err) { $("jnErr").textContent = err.message; $("btnRejoin").hidden = true; }
});
async function openAsHost(code, hostKey) {
  window.history.replaceState(null, "", location.pathname + "#online");
  route(); showScreen("scrSetup");
  try { const { OnlineCapsa } = await online(); attach(await OnlineCapsa.claim({ code, hostKey })); }
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
  $("aiResume").hidden = !savedCapsaGame();
  drawLookButtons();
  if (params.get("code") && params.get("host") && onlineEnabled) return openAsHost(params.get("code").toUpperCase().slice(0, 6), params.get("host"));
  if (params.get("code")) { location.hash = "#online"; $("jnCode").value = params.get("code").toUpperCase().slice(0, 6); $("jnCode").dispatchEvent(new Event("change")); }
  route();
  if (onlineEnabled) online().then(m => { $("btnRejoin").hidden = !m.hasSavedCapsaSeat(); }).catch(() => {});
  showScreen("scrSetup");
}

// ---------- the table ----------
let seatEls = [];
function buildSeats() {
  seatEls.forEach(e => e.remove());
  seatEls = [1, 2, 3].map(pos => {
    const el = document.createElement("div");
    el.className = "cseat"; el.dataset.pos = pos;
    el.innerHTML = `<div class="pic"></div><div class="plate"><div class="name"></div><div class="count"><span class="fan"></span><b></b></div><div class="tag"></div><div class="timer"></div></div><div class="bubble" hidden></div>`;
    $("ctable").appendChild(el);
    return el;
  });
}
const seatAt = pos => (view.me + pos) % 4;              // pos 0 = you, 1 = next (right), 2 = top, 3 = left
const posOf = seat => (seat - view.me + 4) % 4;
const nameAt = seat => seat === view.me ? "You" : view.seats[seat]?.name || "Seat " + (seat + 1);
const verb = (seat, base, third = base + "s") => seat === view.me ? base : third;

let selected = new Set(), sortBy = store.get("cb-sort", "rank"), lastLog = null, lastGame = null, lastTurn = null, bannerFor = null;

function sortedHand(hand) {
  const h = hand.slice();
  return sortBy === "suit" ? h.sort((a, b) => C.suitOf(a) - C.suitOf(b) || C.rankOf(a) - C.rankOf(b)) : h.sort(C.byValue);
}

// What's wrong with the cards picked (same checks as the rules engine, from what this player can see).
function pickProblem(g) {
  const cards = [...selected];
  if (!cards.length) return "";
  const combo = C.classify(cards);
  if (!combo) return "Those cards aren't a combination you can play.";
  const L = g.legal;
  if (!L) return "";
  if (L.mustInclude && !cards.includes(L.mustInclude)) return "The first play of the game has to include the 3♦.";
  if (L.table && !C.beats(combo, L.table)) {
    if (C.isBomb(combo)) return "A bomb only beats a package or a single 2.";
    return "That doesn't beat what's on the table.";
  }
  if (cards.length === g.hand.length && combo.type === "single" && C.rankOf(cards[0]) === 12) return "You can't finish the game with a single 2.";
  return "";
}

function render() {
  if (!view) return;
  if (view.ended && !view.summary) return backToLobby();
  if (view.ended) return renderSummary();
  const g = view.game, me = view.me;

  // header
  const myPts = view.seats[me] ? view.seats[me].points : 0;
  $("mGame").textContent = view.gameNo || "–";
  $("mPoints").textContent = signed(myPts);
  const myMoney = moneyPts(me) * view.pointValue;
  $("mMoney").textContent = fmt(myMoney, true);
  $("mMoney").className = netClass(myMoney);
  $("mCodeWrap").hidden = !view.code; $("mCode").textContent = view.code || "";

  // opponents
  [1, 2, 3].forEach((pos, k) => {
    const seat = seatAt(pos), el = seatEls[k], p = view.seats[seat] || {};
    const av = avatarOf(p), pic = el.querySelector(".pic");
    if (pic.dataset.av !== av) { pic.dataset.av = av; pic.innerHTML = avatarSvg(av, p.name || ""); }
    el.querySelector(".name").textContent = (p.name || "Empty seat") + (p.bot && view.mode === "online" ? " (bot)" : "");
    const n = g ? g.counts[seat] : 0;
    const fan = el.querySelector(".fan");
    if (fan.childElementCount !== Math.min(n, 5)) { fan.innerHTML = ""; for (let i = 0; i < Math.min(n, 5); i++) fan.appendChild(cardEl(null)); }
    el.querySelector(".count b").textContent = g ? `${n} card${n === 1 ? "" : "s"}` : "";
    const fin = g && g.finished;
    const tag = el.querySelector(".tag");
    tag.className = "tag" + (fin && fin.winner === seat ? " win" : fin && fin.bombed === seat ? " lose" : "");
    tag.textContent = fin ? (fin.winner === seat ? "Winner" : signed(fin.points[seat]) + " pts")
      : g && g.trick && g.passed[seat] ? "Passed" : g && g.turn === seat ? "Thinking…" : n <= 3 && n > 0 ? `${n} left!` : "";
    el.classList.toggle("acting", !!(g && !fin && g.turn === seat));
    el.classList.toggle("passed", !!(g && g.trick && g.passed[seat] && !fin));
  });

  // the table
  const box = $("trickCards");
  const tkey = g && g.trick ? g.trick.cards.join(" ") : "";
  if (box.dataset.key !== tkey) {
    box.dataset.key = tkey; box.innerHTML = "";
    if (g && g.trick) {
      g.trick.cards.slice().sort(C.byValue).forEach(c => box.appendChild(cardEl(c)));
      if (animOk() && lastLog !== null) flyIn(box, g.trick.by);
    }
  }
  $("trickLabel").innerHTML = !g ? "" : g.finished ? "" : g.trick
    ? `<b>${C.NAMES[g.trick.combo.type]}</b> · ${escape(nameAt(g.trick.by))}`
    : g.turn >= 0 ? `${escape(nameAt(g.turn))} ${g.turn === me ? "lead" : "leads"} a new round${g.lead3d ? " · must include the 3♦" : ""}` : "";

  // your hand
  const hand = g && g.hand ? sortedHand(g.hand) : [];
  selected = new Set([...selected].filter(c => hand.includes(c)));
  const hb = $("myHand");
  const hkey = hand.join(" ");
  if (hb.dataset.key !== hkey) {
    hb.dataset.key = hkey; hb.innerHTML = "";
    hand.forEach(c => hb.appendChild(cardEl(c)));
  }
  [...hb.children].forEach(el => el.classList.toggle("sel", selected.has(el.dataset.code)));
  const myTurn = !!(g && g.legal && !g.finished);
  hb.classList.toggle("off", !g || !!g.finished);

  // buttons
  const problem = g ? pickProblem(g) : "";
  const combo = selected.size ? C.classify([...selected]) : null;
  $("actRow").hidden = !g || !!g.finished;
  $("btnPlay").disabled = !myTurn || !selected.size || !!problem;
  $("btnPlay").textContent = combo && !problem ? `Play ${C.NAMES[combo.type].replace("Bomb: ", "bomb ").toLowerCase()}` : "Play";
  $("btnPass").disabled = !myTurn || !g.legal.canPass;
  $("btnHint").disabled = !myTurn;
  $("btnSort").textContent = sortBy === "rank" ? "Sort: rank" : "Sort: suit";
  const fin = g && g.finished;
  $("betweenRow").hidden = !(fin || (view.mode === "online" && !view.started));
  $("btnNext").hidden = !(fin && view.mode === "ai");
  $("btnStart").hidden = !(view.mode === "online" && view.isHost && !view.started);
  $("btnStart").textContent = view.sessions && view.sessions.length ? `Start session ${view.sessionNo}` : "Start the game";

  $("status").textContent = statusText(g, problem);
  renderLog(g);
  renderScores();
  renderTools();
  renderBanner(g);
  renderChat();
  const lastNo = view.sessions && view.sessions.length ? view.sessions[view.sessions.length - 1].no : 0;
  if (lastSessionNo !== undefined && lastNo > lastSessionNo) openLedger();
  lastSessionNo = lastNo;
  sounds(g);
  tickClock();
}

function statusText(g, problem) {
  const me = view.me;
  if (view.mode === "online" && !view.started) {
    const humans = view.seats.filter(s => s && !s.bot).length;
    return view.closing ? "The host is closing the room." : view.isHost ? `${humans} of 4 seats taken by people. Start whenever you're ready: bots fill the empty seats.` : "Waiting for the host to start. Bots fill any empty seats.";
  }
  if (view.ending) return "The host is ending the session after this game.";
  if (!g) return "Shuffling…";
  if (g.finished) {
    const f = g.finished;
    const left = view.nextGameAt ? ` Next game in ${Math.max(0, Math.ceil((view.nextGameAt - Date.now()) / 1000))}s.` : "";
    if (f.reason === "stuck") return "Everyone was left with a single 2, so nobody can finish. Nobody pays." + left;
    return `${nameAt(f.winner)} ${verb(f.winner, "win")}${f.reason === "bomb" ? ` by bombing ${f.bombed === me ? "your" : nameAt(f.bombed) + "'s"} 2` : ""}!` + left;
  }
  if (g.legal) {
    if (problem) return problem;
    if (g.legal.leading) return g.legal.mustInclude ? "Your lead. Your first play must include the 3♦." : g.hand.length === 1 && g.hand[0][0] === "2" ? "You can't finish on a single 2: pass the lead." : "Your lead: play anything.";
    return `Your turn: beat the ${C.NAMES[g.legal.table.type].toLowerCase()} or pass.`;
  }
  return `${nameAt(g.turn)} ${g.turn === me ? "" : "is"} thinking…`;
}

const escape = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

function renderLog(g) {
  const box = $("log");
  if (!g) { box.innerHTML = ""; return; }
  const lines = [`Game ${g.no}`];
  for (const e of g.log) {
    if (e.type === "play") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "play")} ${C.NAMES[e.combo].replace("Bomb: ", "a bomb, ").toLowerCase()}: ${e.cards.map(cardName).join(" ")}`);
    else if (e.type === "pass") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "pass", "passes")}`);
    else if (e.type === "round") lines.push(`New round: ${nameAt(e.seat)} ${verb(e.seat, "lead")}`);
    else if (e.type === "win") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "go", "goes")} out and ${verb(e.seat, "win")}`);
    else if (e.type === "bomb win") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "bomb")} a 2 and ${verb(e.seat, "win")}`);
    else if (e.type === "stuck") lines.push("Everyone is stuck on a single 2: nobody wins");
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
    row.children[0].lastChild.textContent = s.name + (i === view.me ? " (you)" : "") + (s.bot ? " · bot" : "") + (view.hostSeat === i ? " · host" : "");
    row.children[1].textContent = `${signed(s.points)} pts`;
    const m = moneyPts(i) * view.pointValue;
    row.children[2].textContent = s.bot && view.mode === "online" ? "–" : fmt(m, true);
    row.children[2].className = netClass(m);
    box.appendChild(row);
  });
  const note = document.createElement("div");
  note.className = "pl watchers";
  note.textContent = `${fmt(view.pointValue)} a point · ${view.games ? view.games.length : 0} games played` + (view.mode === "online" && view.seats.some(x => x && x.bot) ? " · points won or lost against bots don't count as money" : "");
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

// ---------- end of a game ----------
function renderBanner(g) {
  const box = $("winBanner");
  if (!g || !g.finished) { box.hidden = true; return; }
  if (bannerFor === `${g.no}`) return;
  if (bannerFor === `${g.no}-hidden`) { box.hidden = true; return; }
  bannerFor = `${g.no}`;
  const f = g.finished;
  box.innerHTML = "";
  const head = document.createElement("div"); head.className = "wb-row";
  head.innerHTML = `<div class="pic">${f.winner >= 0 ? avatarSvg(avatarOf(view.seats[f.winner])) : ""}</div><div class="wb-text"><div class="wb-title"></div><div class="wb-hand"></div></div>`;
  head.querySelector(".wb-title").textContent = f.winner < 0 ? "Nobody wins" : `${nameAt(f.winner)} ${verb(f.winner, "win")}!`;
  head.querySelector(".wb-hand").textContent = f.reason === "bomb" ? `Bombed ${f.bombed === view.me ? "your" : nameAt(f.bombed) + "'s"} 2` : f.reason === "stuck" ? "Everyone was stuck on a single 2" : "Out of cards first";
  box.appendChild(head);
  const res = document.createElement("div"); res.className = "cb-result";
  const table = document.createElement("table");
  f.points.forEach((pts, seat) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td></td><td><span class="left"></span></td><td></td><td></td>`;
    tr.children[0].textContent = nameAt(seat);
    const left = tr.querySelector(".left");
    (f.left[seat] || []).slice(0, 13).forEach(c => left.appendChild(cardEl(c)));
    tr.children[2].textContent = `${signed(pts)} pts`;
    tr.children[2].className = netClass(pts);
    const gm = gameMoney(f, seat) * view.pointValue;
    tr.children[3].textContent = view.mode === "online" && isBot(seat) ? "–" : fmt(gm, true);
    tr.children[3].className = netClass(gm);
    table.appendChild(tr);
  });
  res.appendChild(table);
  box.appendChild(res);
  box.hidden = false;
  if (animOk()) sound(f.winner === view.me ? "win" : f.reason === "bomb" ? "allin" : "pot", 0.2);
}
$("winBanner").addEventListener("click", () => { if (bannerFor && !bannerFor.endsWith("hidden")) bannerFor += "-hidden"; $("winBanner").hidden = true; });

// ---------- motion and sound ----------
const calm = matchMedia("(prefers-reduced-motion: reduce)");
let renderedOnce = false;
const animOk = () => renderedOnce && !calm.matches && !document.hidden;
function flyIn(box, seat) {
  const from = seat === view.me ? $("myHand") : seatEls[posOf(seat) - 1];
  if (!from) return;
  const a = from.getBoundingClientRect(), b = box.getBoundingClientRect();
  const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
  [...box.children].forEach((el, i) => el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.6)`, opacity: .2 }, { transform: "none", opacity: 1 }],
    { duration: 380, delay: i * 40, easing: "cubic-bezier(.2,.75,.3,1)", fill: "backwards" }));
}
function sounds(g) {
  if (!g) return;
  const key = `${g.no}:${g.log.length}`;
  if (lastLog !== null && renderedOnce && key !== lastLog) {
    const [no] = lastLog.split(":");
    const fromIdx = +no === g.no ? +lastLog.split(":")[1] : 0;
    g.log.slice(fromIdx).forEach((e, k) => {
      if (e.type === "play") sound(C.isBomb({ type: e.combo }) ? "allin" : e.cards.length >= 5 ? "chips" : "flip", k * 0.1);
      else if (e.type === "pass") sound("check", k * 0.1);
    });
  }
  if (lastGame !== null && g.no !== lastGame && renderedOnce) for (let i = 0; i < 6; i++) sound("deal", i * 0.07);
  const myTurnNow = !!(g.legal && !g.finished);
  if (myTurnNow && lastTurn === false && renderedOnce) sound("turn");
  lastLog = key; lastGame = g.no; lastTurn = myTurnNow;
  renderedOnce = true;
}
function drawSoundBtn() { $("btnSound").textContent = soundOn() ? "🔊" : "🔇"; }
$("btnSound").onclick = () => { setSound(!soundOn()); drawSoundBtn(); sound("flip"); };
drawSoundBtn();

function tickClock() {
  if (!view || view.ended) return;
  const g = view.game;
  seatEls.forEach((el, k) => {
    const seat = seatAt(k + 1), bar = el.querySelector(".timer");
    const on = view.deadline && g && !g.finished && g.turn === seat;
    bar.style.width = on ? Math.max(0, Math.min(100, (view.deadline - Date.now()) / (view.actMs || 30000) * 100)) + "%" : "0";
  });
  if (g && g.finished && view.nextGameAt) $("status").textContent = statusText(g, "");
}
setInterval(tickClock, 250);

// ---------- input ----------
function guard(fn) { return async (...a) => { try { await fn(...a); } catch (err) { $("status").textContent = err.message; } }; }
$("myHand").addEventListener("click", e => {
  const el = e.target.closest(".card"); if (!el || !view || !view.game || view.game.finished) return;
  const c = el.dataset.code;
  selected.has(c) ? selected.delete(c) : selected.add(c);
  render();
});
$("btnPlay").onclick = guard(async () => { const cards = [...selected]; selected = new Set(); await ctrl.play(cards); });
$("btnPass").onclick = guard(async () => { selected = new Set(); await ctrl.pass(); });
$("btnSort").onclick = () => { sortBy = sortBy === "rank" ? "suit" : "rank"; store.set("cb-sort", sortBy); $("myHand").dataset.key = ""; render(); };
$("btnHint").onclick = () => {
  const g = view.game; if (!g || !g.legal) return;
  // the bots' own judgement, from what you can see
  const pseudo = { hands: g.counts.map((n, i) => i === view.me ? g.hand : Array(n).fill("x")), turn: g.turn, trick: g.trick, passed: g.passed, lead3d: g.lead3d, finished: null };
  const m = capsaMove(pseudo, view.me, "hard");
  selected = new Set(m && m.type === "play" ? m.cards : []);
  render();
  if (m && m.type === "pass") $("status").textContent = "Hint: passing keeps your good cards for later.";
};
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
  const k = e.key.toLowerCase();
  if (k === "enter" && !$("btnPlay").disabled) $("btnPlay").click();
  else if (k === "p" && !$("btnPass").disabled) $("btnPass").click();
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
  const text = [`Capsa Banting, room ${view.code}`, ...led.map(r => `${r.name}: ${fmt(r.net, true)}`), "To settle:", ...all.payments.map(p => `${p.from} pays ${p.to} ${fmt(p.amount)}`)].join("\n");
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
  const text = ["Capsa Banting results", ...s.rows.map(r => `${r.name}: ${fmt(r.net, true)}`), "", ...s.payments.map(p => `${p.from} pays ${p.to} ${fmt(p.amount)}`)].join("\n");
  try { await navigator.clipboard.writeText(text); $("btnSumCopy").textContent = "Copied"; } catch {}
  setTimeout(() => $("btnSumCopy").textContent = "Copy results", 2000);
};

compact.addEventListener("change", () => view && render());
window.addEventListener("resize", () => view && !view.ended && render());
initSetup();
