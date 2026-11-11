// Cangkul screens. Works with LocalCangkul (bots) or OnlineCangkul (friends).
import * as C from "../supabase/functions/_shared/cangkul-engine.js";
import { cangkulMove } from "../supabase/functions/_shared/cangkul-bot.js";
import { settle } from "../supabase/functions/_shared/poker-engine.js";
import { REACTIONS } from "../supabase/functions/_shared/poker-room.js";
import { LocalCangkul, savedCangkulGame } from "./local.js";
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
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const placeOf = (g, seat) => g.finished && g.finished.place ? g.finished.place[seat] + 1 : (g.out || []).indexOf(seat) + 1;
const loserGame = g => !!g && g.mode === "loser";
// Money in points. Against bots (bots mode) every point counts; in rooms with friends, points won from or
// lost to a bot don't turn into money, so friends only owe each other.
const isBot = seat => !!(view.seats[seat] && view.seats[seat].bot);
const moneyPts = seat => view.mode === "online" ? (view.seats[seat]?.money || 0) : (view.seats[seat]?.points || 0);
function gameMoney(g, seat) {
  const f = g.finished;
  if (view.mode !== "online") return f.points[seat];
  if (isBot(seat) || !g.in.includes(seat)) return 0;
  const people = g.in.filter(i => i !== seat && !isBot(i));
  if (f.mode === "loser") return people.reduce((a, i) => a + Math.sign(f.place[i] - f.place[seat]), 0);   // a point from every person you finish above
  if (isBot(f.winner)) return 0;
  return seat === f.winner ? people.reduce((a, i) => a - f.points[i], 0) : f.points[seat];
}
const netClass = n => n > 0 ? "pos" : n < 0 ? "neg" : "";

// ---------- cards ----------
const SUIT = { s: "♠", h: "♥", d: "♦", c: "♣" };
const rankText = r => r === "T" ? "10" : r;
const cardName = c => rankText(c[0]) + SUIT[c[1]];
const suitHtml = s => `<span class="${s === "h" || s === "d" ? "red" : "blk"}">${SUIT[s]}</span>`;
const cap = s => s[0].toUpperCase() + s.slice(1);
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
  document.body.classList.toggle("at-cangkul", id === "scrTable");
}
const sizeVar = (el, name) => new ResizeObserver(() => document.documentElement.style.setProperty(name, el.offsetHeight + "px")).observe(el);
sizeVar(document.querySelector(".bar"), "--bar-h");
sizeVar($("crail"), "--rail-h");

let ctrl = null, unsub = null, view = null;
function attach(controller) {
  if (unsub) unsub();
  if (ctrl && ctrl !== controller && ctrl.destroy) ctrl.destroy();
  ctrl = controller; selected = null; lastStep = null; lastLogLen = 0; lastGame = null; lastChatN = null; lastTurn = null; bannerFor = null; lastHand = null; note = "";
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
// every choice is remembered on this device
document.querySelectorAll(".seg").forEach(seg => {
  const saved = store.get("cg-" + seg.id, null);
  if (saved !== null && seg.querySelector(`[data-v="${saved}"]`)) seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === String(saved)));
  seg.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    store.set("cg-" + seg.id, b.dataset.v);
  });
});
const segValue = id => $(id).querySelector('[aria-pressed="true"]').dataset.v;
const nameOf = id => $(id).value.trim().replace(/\s+/g, " ").slice(0, 16);
$("crBots").checked = store.get("cg-crBots", false);
const drawBots = () => { $("crSkill").hidden = !$("crBots").checked; store.set("cg-crBots", $("crBots").checked); };
$("crBots").addEventListener("change", drawBots);
drawBots();

$("formAi").addEventListener("submit", e => {
  e.preventDefault();
  const name = nameOf("aiName") || "Player", pointValue = toCents($("aiValue").value);
  if (!(pointValue >= 1)) return $("aiErr").textContent = "Enter how many dollars a point is worth.";
  $("aiErr").textContent = "";
  store.set("pk-name", name);
  attach(LocalCangkul.create({ name, avatar: myAvatar(), bots: +segValue("aiBots"), skill: segValue("aiSkill"), mode: segValue("aiMode"), handSize: +segValue("aiHand"), emptyStock: segValue("aiEmpty"), pointValue }));
});
$("aiResume").addEventListener("click", () => { const s = savedCangkulGame(); if (s) attach(new LocalCangkul(s)); });

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
    const { OnlineCangkul } = await online();
    attach(await OnlineCangkul.create({
      name, avatar: myAvatar(), pointValue, actSeconds: +$("crTime").value, seats: +segValue("crSeats"), bots: $("crBots").checked,
      skill: segValue("crSkill"), mode: segValue("crMode"), handSize: +segValue("crHand"), emptyStock: segValue("crEmpty")
    }));
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
    const { OnlineCangkul } = await online();
    attach(await OnlineCangkul.join({ code, name, avatar: myAvatar() }));
  } catch (err) { $("jnErr").textContent = err.message; }
  finally { $("btnJoin").disabled = false; }
});
const endText = mode => mode === "loser" ? "Last one holding loses" : "First one out wins";
$("jnCode").addEventListener("change", async () => {
  const code = $("jnCode").value.trim().toUpperCase();
  $("jnRules").textContent = "";
  if (code.length !== 6 || !onlineEnabled) return;
  try {
    const { peekRoom } = await online();
    const r = await peekRoom(code), s = r && r.settings;
    $("jnRules").textContent = !r ? "No open room with that code." : r.game !== "cangkul" || !s ? "That code is for a different game. Join it from that game's page."
      : `${endText(s.mode)} · ${s.handSize} cards each · stock empty: ${s.emptyStock === "pass" ? "skip" : "pick up the trick"} · ${fmt(s.pointValue)} a point · ${r.humans} of ${s.seats} seats taken by people${s.bots ? " · bots fill the rest" : ""}`;
  } catch {}
});
$("btnRejoin").addEventListener("click", async () => {
  try { const { OnlineCangkul } = await online(); attach(await OnlineCangkul.resume()); }
  catch (err) { $("jnErr").textContent = err.message; $("btnRejoin").hidden = true; }
});
async function openAsHost(code, hostKey) {
  window.history.replaceState(null, "", location.pathname + "#online");
  route(); showScreen("scrSetup");
  try { const { OnlineCangkul } = await online(); attach(await OnlineCangkul.claim({ code, hostKey })); }
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
  $("aiResume").hidden = !savedCangkulGame();
  drawLookButtons();
  if (params.get("code") && params.get("host") && onlineEnabled) return openAsHost(params.get("code").toUpperCase().slice(0, 6), params.get("host"));
  if (params.get("code")) { location.hash = "#online"; $("jnCode").value = params.get("code").toUpperCase().slice(0, 6); $("jnCode").dispatchEvent(new Event("change")); }
  route();
  if (onlineEnabled) online().then(m => { $("btnRejoin").hidden = !m.hasSavedCangkulSeat(); }).catch(() => {});
  showScreen("scrSetup");
}

// ---------- the table ----------
// Opponents sit clockwise from you: with 4 seats right, top, left; with 3 right and left; with 2 across the table.
const PLACES = { 2: ["top"], 3: ["right", "left"], 4: ["right", "top", "left"] };
let seatEls = [];
function buildSeats(n) {
  seatEls.forEach(e => e.remove());
  seatEls = PLACES[n].map(at => {
    const el = document.createElement("div");
    el.className = "cseat"; el.dataset.at = at;
    el.innerHTML = `<div class="pic"></div><div class="plate"><div class="name"></div><div class="count"><span class="fan"></span><b></b></div><div class="tag"></div><div class="timer"></div></div><div class="bubble" hidden></div>`;
    $("ctable").appendChild(el);
    return el;
  });
}
const seatCount = () => view.seats.length;
const seatAt = pos => (view.me + pos) % seatCount();     // pos 0 = you, 1 = plays after you, …
const posOf = seat => (seat - view.me + seatCount()) % seatCount();
const nameAt = seat => seat === view.me ? "You" : view.seats[seat]?.name || "Seat " + (seat + 1);
const verb = (seat, base, third = base + "s") => seat === view.me ? base : third;

let selected = null, note = "", noteAt = "", busy = false, showPlayable = store.get("cg-playable", true);
let lastStep = null, lastLogLen = 0, lastGame = null, lastTurn = null, bannerFor = null, lastHand = null;

// Why a card can't be played right now (the same answers as the rules engine).
function cardProblem(g, card) {
  const L = g.legal;
  if (!L) return "It's not your turn yet.";
  if (L.leading || card[1] === L.suit) return "";
  if (L.cards.length) return `You have to follow suit: play a ${C.SUIT_ONE[L.suit]} ${SUIT[L.suit]}.`;
  if (L.canDraw) return `You have no ${C.SUIT_NAMES[L.suit]} ${SUIT[L.suit]}: cangkul from the stock.`;
  return `You have no ${C.SUIT_NAMES[L.suit]} ${SUIT[L.suit]} and the stock is empty.`;
}
const digging = (g, seat) => { const e = g.log[g.log.length - 1]; return !!(e && e.type === "draw" && e.seat === seat && g.turn === seat); };

function render() {
  if (!view) return;
  if (view.ended && !view.summary) return backToLobby();
  if (view.ended) return renderSummary();
  const g = view.game, me = view.me, n = seatCount();
  if (seatEls.length !== n - 1) buildSeats(n);
  const at = g ? `${g.no}:${g.step}` : "";
  if (at !== noteAt) { note = ""; noteAt = at; }      // a note about your last tap goes once the game moves on
  const fin = g && g.finished;

  // header
  const myPts = view.seats[me] ? view.seats[me].points : 0;
  $("mGame").textContent = view.gameNo || "–";
  $("mPoints").textContent = signed(myPts);
  const myMoney = moneyPts(me) * view.pointValue;
  $("mMoney").textContent = fmt(myMoney, true);
  $("mMoney").className = netClass(myMoney);
  $("mCodeWrap").hidden = !view.code; $("mCode").textContent = view.code || "";

  // opponents
  seatEls.forEach((el, k) => {
    const seat = seatAt(k + 1), p = view.seats[seat] || {};
    const av = p.name ? avatarOf(p) : "", pic = el.querySelector(".pic");
    if (pic.dataset.av !== av) { pic.dataset.av = av; pic.innerHTML = av ? avatarSvg(av, p.name || "") : ""; }
    el.querySelector(".name").textContent = (p.name || "Empty seat") + (p.bot && view.mode === "online" ? " (bot)" : "");
    const inG = !!(g && g.in.includes(seat)), cards = inG ? g.counts[seat] : 0;
    const fan = el.querySelector(".fan"), show = Math.min(cards, 5);
    if (fan.childElementCount !== show) { fan.innerHTML = ""; for (let i = 0; i < show; i++) fan.appendChild(cardEl(null)); }
    el.querySelector(".count b").textContent = inG ? plural(cards, "card") : "";
    const tag = el.querySelector(".tag"), place = inG ? placeOf(g, seat) : 0;
    const lost = fin && fin.mode === "loser" && fin.loser === seat;
    tag.className = "tag" + (fin && fin.winner === seat ? " win" : lost ? " lose" : !fin && place ? " win" : "");
    tag.textContent = !p.name ? "" : !g ? "" : !inG ? "Next game"
      : fin ? (fin.mode === "loser" ? `${ordinal(place)} · ${signed(fin.points[seat])} pts` : fin.winner === seat ? "Winner" : signed(fin.points[seat]) + " pts")
      : place ? (loserGame(g) ? `Out · ${ordinal(place)}` : "Out of cards!")
      : g.turn === seat ? (digging(g, seat) ? "Digging…" : "Thinking…") : cards <= 2 ? `${cards} left!` : "";
    el.classList.toggle("acting", !!(g && !fin && g.turn === seat));
    el.classList.toggle("away", !p.name || (!!g && !fin && (!inG || !!place)));
  });

  // the stock
  const stockN = g ? g.stock : 0, pile = $("stockPile"), layers = Math.min(3, Math.ceil(stockN / 8));
  if (pile.childElementCount !== layers) { pile.innerHTML = ""; for (let i = 0; i < layers; i++) pile.appendChild(cardEl(null)); }
  pile.classList.toggle("empty", !layers);
  $("stockN").textContent = stockN;
  $("stock").hidden = !g;
  const L = g && !fin ? g.legal : null;
  $("stock").classList.toggle("need", !!(L && L.canDraw));

  // the trick (or the one that just ended, until the next lead)
  const t = g && (g.trick || g.last), box = $("trickCards");
  const tkey = t ? (g.trick ? "t" : "l") + g.no + ":" + t.plays.map(p => p.card).join(" ") : "";
  if (box.dataset.key !== tkey) {
    const had = new Set([...box.querySelectorAll(".card")].map(el => el.dataset.code));
    box.dataset.key = tkey; box.innerHTML = "";
    if (t) t.plays.forEach(p => {
      const w = document.createElement("div"); w.className = "tc" + (!g.trick && p.seat === t.winner ? " best" : "");
      const c = cardEl(p.card); if (!g.trick && p.seat === t.winner) c.classList.add("win");
      const who = document.createElement("small"); who.textContent = nameAt(p.seat);
      w.append(c, who); box.appendChild(w);
      if (animOk() && !had.has(p.card)) flyFrom(w, p.drawn ? $("stockPile") : p.seat === me ? $("myHand") : seatEls[posOf(p.seat) - 1]);
    });
  }
  box.classList.toggle("done", !!(t && !g.trick));
  $("trickLabel").innerHTML = !g || fin ? "" : g.trick
    ? `${suitHtml(g.trick.suit)} <b>${cap(C.SUIT_NAMES[g.trick.suit])}</b> led by ${escape(nameAt(g.trick.lead)).replace(/^You$/, "you")}`
    : g.last ? (g.last.plays.length ? `<b>${escape(nameAt(g.last.winner))}</b> ${verb(g.last.winner, "win")} the trick` : "Nothing left on the table") + (g.turn !== g.last.winner || !g.last.plays.length ? ` · ${escape(nameAt(g.turn))} ${verb(g.turn, "lead")}` : "")
    : g.turn >= 0 ? `${escape(nameAt(g.turn))} ${verb(g.turn, "lead")} the first trick` : "";

  // your hand, sorted by suit
  const hand = g && g.hand ? g.hand : [];
  if (selected && !hand.includes(selected)) selected = null;
  const hb = $("myHand"), hkey = `${g ? g.no : 0}:${fin ? "f" : ""}:${hand.join(" ")}`;
  if (hb.dataset.key !== hkey) {
    const fresh = lastHand && lastHand.no === (g && g.no) ? hand.filter(c => !lastHand.cards.includes(c)) : [];
    hb.dataset.key = hkey; hb.innerHTML = "";
    hand.forEach(c => hb.appendChild(cardEl(c)));
    if (!hand.length && g && !fin) { const d = document.createElement("div"); d.className = "empty-note"; d.textContent = g.in.includes(me) ? "No cards left: you're out." : "You'll be dealt in from the next game."; hb.appendChild(d); }
    fitHand();
    // cards you just dug up (or picked up) slide in from the table
    if (animOk() && fresh.length && fresh.length <= 8) fresh.forEach((c, i) => { const el = hb.querySelector(`[data-code="${c}"]`); if (el) flyFrom(el, g.stock || fresh.length === 1 ? $("stockPile") : $("trickCards"), i * 50); });
    lastHand = g ? { no: g.no, cards: hand.slice() } : null;
  }
  const myTurn = !!L;
  const can = new Set(L ? L.cards : []);
  hb.querySelectorAll(".card").forEach(el => {
    const c = el.dataset.code;
    el.classList.toggle("sel", selected === c);
    // following suit: the cards you may play stand out and the rest are dimmed (leading, every card is fine)
    el.classList.toggle("can", myTurn && !L.leading && can.has(c));
    el.classList.toggle("dim", showPlayable && !!g && !fin && (myTurn ? !can.has(c) : false));
  });
  hb.classList.toggle("off", !myTurn);

  // buttons
  $("actRow").hidden = !g || !!fin;
  const pickUp = !!(L && L.giveUp === "take" && g.trick.plays.length);
  $("btnDraw").textContent = L && L.giveUp ? (pickUp ? "Pick up the cards" : "Skip") : `Cangkul (${stockN})`;
  $("btnDraw").disabled = busy || !(L && (L.canDraw || L.giveUp));
  $("btnDraw").classList.toggle("primary", !$("btnDraw").disabled);
  $("btnDraw").classList.toggle("ghost", !!$("btnDraw").disabled);
  $("btnPlay").disabled = busy || !myTurn || !selected || !can.has(selected);
  $("btnPlay").textContent = selected && can.has(selected) ? `Play ${cardName(selected)}` : "Play";
  $("btnPlay").classList.toggle("primary", !(L && !L.cards.length));
  $("btnPlay").classList.toggle("ghost", !!(L && !L.cards.length));
  $("btnHint").disabled = !myTurn;
  $("btnPlayable").textContent = `Playable cards: ${showPlayable ? "shown" : "not shown"}`;
  $("betweenRow").hidden = !(fin || (view.mode === "online" && !view.started));
  $("btnNext").hidden = !(fin && view.mode === "ai");
  $("btnStart").hidden = !(view.mode === "online" && view.isHost && !view.started);
  $("btnStart").textContent = view.sessions && view.sessions.length ? `Start session ${view.sessionNo}` : "Start the game";

  $("status").textContent = statusText(g);
  $("ruleEmpty").innerHTML = view.emptyStock === "pass" ? "<b>Stock empty</b> and you can't follow: you just skip the trick." : "<b>Stock empty</b> and you can't follow: you pick up the cards played in the trick so far and miss your turn.";
  $("ruleEnd").innerHTML = view.gameMode === "loser" ? "<b>Last one holding loses</b>: going out makes you safe; play goes on until one player is left with cards." : "<b>First one out wins</b>: everyone else pays 1 point per card still in hand.";
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

// The hand never scrolls sideways: cards overlap and wrap into rows. Up to two rows keep the roomy overlap;
// a bigger hand is squeezed so it still fits in two, and only a huge one spills into a third.
function fitHand() {
  const hb = $("myHand"), cards = hb.querySelectorAll(".card"), n = cards.length;
  hb.style.removeProperty("--hand-ov");
  if (n < 2) return;
  const cw = cards[0].offsetWidth, width = hb.clientWidth - 1;
  if (!cw || width <= cw) return;
  const base = parseFloat(getComputedStyle(hb).getPropertyValue("--hand-ov")) || 0.42;
  const roomy = cw * (1 - base), perRow = step => Math.floor((width - cw) / step) + 1;
  const squeeze = step => hb.style.setProperty("--hand-ov", (1 - Math.min(roomy, Math.floor(step * 10) / 10) / cw).toFixed(4));
  if (n <= perRow(roomy)) return;
  // on a wide screen one tighter row beats two, as long as every rank stays readable
  const oneRow = (width - cw) / (n - 1);
  if (!compact.matches && oneRow >= cw * 0.36) return squeeze(oneRow);
  if (n <= perRow(roomy) * 2) return;
  squeeze(Math.max(Math.min(15, cw * 0.36), (width - cw) / (Math.ceil(n / 2) - 1)));
}

function statusText(g) {
  const me = view.me;
  if (view.mode === "online" && !view.started) {
    const humans = view.seats.filter(s => s && !s.bot).length, n = seatCount();
    if (view.closing) return "The host is closing the room.";
    if (!view.isHost) return "Waiting for the host to start." + (view.botsFill ? " Bots fill any empty seats." : "");
    return `${humans} of ${n} seats taken. ` + (view.botsFill ? "Start whenever you're ready: bots fill the empty seats." : humans < 2 ? "You need at least 2 players: share the room code." : "Start whenever you're ready.");
  }
  if (view.ending) return "The host is ending the session after this game.";
  if (!g) return "Shuffling…";
  if (g.finished) {
    const f = g.finished;
    const left = view.nextGameAt ? ` Next game in ${Math.max(0, Math.ceil((view.nextGameAt - Date.now()) / 1000))}s.` : "";
    if (f.mode === "loser") return `${f.loser === me ? "You're" : nameAt(f.loser) + " is"} the last one holding cards and ${f.loser === me ? "lose" : "loses"}.` + left;
    return `${nameAt(f.winner)} ${verb(f.winner, "run")} out of cards and ${verb(f.winner, "win")}!` + left;
  }
  if (note) return note;
  if (!g.in.includes(me)) return "You'll be dealt in from the next game.";
  if (placeOf(g, me)) return loserGame(g) ? `You're out in ${ordinal(placeOf(g, me))} place, and safe. The others play on until one is left holding cards.` : "You're out of cards! The trick is played out, then you win.";
  const L = g.legal;
  if (L) {
    if (L.leading) return "Your lead: play any card. Everyone else has to follow its suit.";
    const suit = `${C.SUIT_NAMES[L.suit]} ${SUIT[L.suit]}`;
    if (L.cards.length) return `Your turn: play a ${C.SUIT_ONE[L.suit]} ${SUIT[L.suit]}.`;
    if (L.canDraw) return digging(g, me) ? `Still no ${suit}: keep digging.` : `No ${suit} in your hand: cangkul! Draw until one turns up.`;
    if (L.giveUp === "take" && g.trick.plays.length) return `No ${suit} and the stock is empty: pick up the cards on the table.`;
    return `No ${suit} and the stock is empty: you skip this trick.`;
  }
  return `${nameAt(g.turn)} is ${digging(g, g.turn) ? "digging in the stock" : "thinking"}…`;
}

const escape = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

function renderLog(g) {
  const box = $("log");
  if (!g) { box.innerHTML = ""; return; }
  const lines = [`Game ${g.no}`];
  for (const e of g.log) {
    if (e.type === "play") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "play")} ${cardName(e.card)}${e.drawn ? ", fresh from the stock" : ""}`);
    else if (e.type === "draw") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "have", "has")} no ${C.SUIT_NAMES[e.suit]} and ${verb(e.seat, "dig")}: ${plural(e.n, "card")} from the stock`);
    else if (e.type === "take") lines.push(`${nameAt(e.seat)} can't follow and ${verb(e.seat, "pick")} up ${e.cards.map(cardName).join(" ")}`);
    else if (e.type === "skip") lines.push(`${nameAt(e.seat)} can't follow and ${verb(e.seat, "skip")}`);
    else if (e.type === "trick") lines.push(e.n ? `${nameAt(e.seat)} ${verb(e.seat, "win")} the trick` : `Nothing left on the table: ${nameAt(e.seat)} ${verb(e.seat, "keep")} the lead`);
    else if (e.type === "out") lines.push(loserGame(g) ? `${nameAt(e.seat)} ${verb(e.seat, "go", "goes")} out in ${ordinal(e.place)} place` : `${nameAt(e.seat)} ${verb(e.seat, "are", "is")} out of cards`);
    else if (e.type === "win") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "win")} the game`);
    else if (e.type === "lose") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "are", "is")} left holding cards and ${verb(e.seat, "lose")}`);
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
  const line = document.createElement("div");
  line.className = "pl watchers";
  line.textContent = `${endText(view.gameMode)} · ${view.handSize} cards each · ${fmt(view.pointValue)} a point · ${plural(view.games ? view.games.length : 0, "game")} played` + (view.mode === "online" && view.seats.some(x => x && x.bot) ? " · points won or lost against bots don't count as money" : "");
  box.appendChild(line);
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
    ? (view.isHost ? "You're the host. Ending the session settles up and keeps the room, so the same code works next time." : "If you leave mid-game, a bot plays your cards until the game ends.")
    : "Leaving ends the session: points turn into pretend dollars and everyone settles up.";
}

// ---------- end of a game ----------
function renderBanner(g) {
  const box = $("winBanner");
  if (!g || !g.finished) { box.hidden = true; return; }
  if (bannerFor === `${g.no}`) return;
  if (bannerFor === `${g.no}-hidden`) { box.hidden = true; return; }
  bannerFor = `${g.no}`;
  const f = g.finished, loser = f.mode === "loser";
  const star = loser ? f.loser : f.winner;
  box.innerHTML = "";
  const head = document.createElement("div"); head.className = "wb-row";
  head.innerHTML = `<div class="pic">${avatarSvg(avatarOf(view.seats[star]))}</div><div class="wb-text"><div class="wb-title"></div><div class="wb-hand"></div></div>`;
  head.querySelector(".wb-title").textContent = loser ? (star === view.me ? "You lose!" : `${nameAt(star)} loses!`) : `${nameAt(star)} ${verb(star, "win")}!`;
  head.querySelector(".wb-hand").textContent = loser ? "Last one holding cards" : "Out of cards first";
  box.appendChild(head);
  const res = document.createElement("div"); res.className = "cb-result";
  const table = document.createElement("table");
  g.in.forEach(seat => {
    const pts = f.points[seat], tr = document.createElement("tr");
    tr.innerHTML = `<td></td><td><span class="left"></span></td><td></td><td></td>`;
    tr.dataset.place = f.place ? f.place[seat] : seat === f.winner ? -1 : seat;
    tr.children[0].textContent = (loser ? ordinal(f.place[seat] + 1) + " " : "") + nameAt(seat);
    const left = tr.querySelector(".left"), cards = f.left[seat] || [];
    cards.slice(0, 10).forEach(c => left.appendChild(cardEl(c)));
    if (cards.length > 4) { const more = document.createElement("span"); more.className = "more"; more.textContent = `${cards.length} cards`; left.appendChild(more); }
    tr.children[2].textContent = `${signed(pts)} pts`;
    tr.children[2].className = netClass(pts);
    const gm = gameMoney(g, seat) * view.pointValue;
    tr.children[3].textContent = view.mode === "online" && isBot(seat) ? "–" : fmt(gm, true);
    tr.children[3].className = netClass(gm);
    table.appendChild(tr);
  });
  table.append(...[...table.children].sort((a, b) => a.dataset.place - b.dataset.place));
  res.appendChild(table);
  box.appendChild(res);
  box.hidden = false;
  const good = loser ? f.loser !== view.me : f.winner === view.me;
  if (animOk()) sound(good ? "win" : "pot", 0.2);
  if (renderedOnce) cue.sting(good ? "win" : "lose");
}
$("winBanner").addEventListener("click", () => { if (bannerFor && !bannerFor.endsWith("hidden")) bannerFor += "-hidden"; $("winBanner").hidden = true; });

// ---------- motion and sound ----------
const calm = matchMedia("(prefers-reduced-motion: reduce)");
let renderedOnce = false;
const animOk = () => renderedOnce && !calm.matches && !document.hidden;
// a card arriving from somewhere else on the table (the stock, a player, the trick)
function flyFrom(el, from, delay = 0) {
  if (!from || !el.animate) return;
  const a = from.getBoundingClientRect(), b = el.getBoundingClientRect();
  if (!a.width || !b.width) return;
  const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
  el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.7)`, opacity: .3 }, { transform: "none", opacity: 1 }],
    { duration: 360, delay, easing: "cubic-bezier(.2,.75,.3,1)", fill: "backwards" });
}
function sounds(g) {
  if (!g) return;
  const key = `${g.no}:${g.step}`;
  if (lastStep !== null && renderedOnce && key !== lastStep && lastGame === g.no) {
    const fresh = g.log.slice(lastLogLen);
    if (!fresh.length) sound("deal");                         // one more card dug up
    fresh.forEach((e, k) => {
      if (e.type === "play") sound("flip", k * 0.1);
      else if (e.type === "draw") sound("deal", k * 0.1);
      else if (e.type === "take") sound("chips", k * 0.1);
      else if (e.type === "skip") sound("check", k * 0.1);
    });
  }
  if (lastGame !== null && g.no !== lastGame && renderedOnce) for (let i = 0; i < 6; i++) sound("deal", i * 0.07);
  const myTurnNow = !!(g.legal && !g.finished);
  if (myTurnNow && lastTurn === false && renderedOnce) { sound("turn"); cue.sting("turn"); }
  // the music: calm between games, intense once anyone is down to their last 2 cards
  const holding = g.counts.filter(c => c > 0);
  cue.level(g.finished ? 0 : holding.length && Math.min(...holding) <= 2 ? 2 : 1);
  lastStep = key; lastLogLen = g.log.length; lastGame = g.no; lastTurn = myTurnNow;
  renderedOnce = true;
}
function drawSoundBtn() { $("btnSound").textContent = soundOn() ? "🔊" : "🔇"; }
$("btnSound").onclick = () => { setSound(!soundOn()); drawSoundBtn(); sound("flip"); };
addEventListener("cr-fx", () => queueMicrotask(drawSoundBtn));
drawSoundBtn();

function tickClock() {
  if (!view || view.ended) return;
  const g = view.game;
  const left = seat => view.deadline && g && !g.finished && g.turn === seat ? Math.max(0, Math.min(100, (view.deadline - Date.now()) / (view.actMs || 30000) * 100)) + "%" : "0";
  seatEls.forEach((el, k) => { el.querySelector(".timer").style.width = left(seatAt(k + 1)); });
  $("myTimer").style.width = left(view.me);
  if (g && g.finished && view.nextGameAt) $("status").textContent = statusText(g);
}
setInterval(tickClock, 250);

// ---------- input ----------
function guard(fn) { return async (...a) => { try { await fn(...a); } catch (err) { $("status").textContent = err.message; } }; }
// one move at a time: a second tap while the first is on its way does nothing
const move = fn => guard(async () => {
  if (busy) return;
  busy = true; note = "";
  try { await fn(); } finally { busy = false; if (view && !view.ended) render(); }
});
const playCard = card => move(async () => { selected = null; await ctrl.play(card); })();
const dig = move(async () => {
  const g = view.game, L = g && g.legal;
  if (!L) return;
  if (L.canDraw) await ctrl.draw(); else if (L.giveUp) await ctrl.giveUp();
});
$("myHand").addEventListener("click", e => {
  const g = view && view.game;
  if (!g || g.finished) return;
  const el = e.target.closest(".card"); if (!el) return;
  const c = el.dataset.code, problem = cardProblem(g, c);
  if (problem) { note = g.legal ? problem : ""; selected = null; return render(); }
  note = "";
  if (selected === c) return playCard(c);         // a second tap on the picked card plays it
  selected = c;
  render();
});
$("btnPlay").onclick = () => { if (selected) playCard(selected); };
$("btnDraw").onclick = dig;
$("stock").addEventListener("click", () => { const g = view && view.game; if (g && g.legal && g.legal.canDraw) dig(); });
$("btnPlayable").onclick = () => { showPlayable = !showPlayable; store.set("cg-playable", showPlayable); render(); };
$("btnHint").onclick = () => {
  const g = view.game; if (!g || !g.legal) return;
  // the hard bot's own judgement, from what you can see
  const pseudo = { ...g, hands: g.counts.map((c, i) => i === view.me ? g.hand : Array(c).fill("x")), stock: Array(g.stock).fill("x"), finished: null };
  const m = cangkulMove(pseudo, view.me, "hard");
  selected = m && m.type === "play" ? m.card : null;
  note = !m ? "" : m.type === "draw" ? "Hint: nothing to play, so cangkul: draw from the stock." : m.type === "giveup" ? "Hint: nothing to play and nothing to draw." : `Hint: ${cardName(m.card)}. Tap Play, or tap the card again.`;
  render();
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
  if (!view || !view.game || e.target.closest("input, select, textarea, button") || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
  const k = e.key.toLowerCase();
  if (k === "enter" && !$("btnPlay").disabled) $("btnPlay").click();
  else if ((k === "c" || k === "d") && !$("btnDraw").disabled) $("btnDraw").click();
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
    d.firstChild.textContent = `Session ${x.no} · ${new Date(x.endedAt).toLocaleDateString()} · ${plural(x.games, "game")}`;
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
  const text = [`Cangkul, room ${view.code}`, ...led.map(r => `${r.name}: ${fmt(r.net, true)}`), "To settle:", ...all.payments.map(p => `${p.from} pays ${p.to} ${fmt(p.amount)}`)].join("\n");
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
  $("sumIntro").textContent = `${plural(s.games, "game")} at ${fmt(s.pointValue)} a point. Pretend dollars only: settle up between yourselves.`;
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
  const text = ["Cangkul results", ...s.rows.map(r => `${r.name}: ${fmt(r.net, true)}`), "", ...s.payments.map(p => `${p.from} pays ${p.to} ${fmt(p.amount)}`)].join("\n");
  try { await navigator.clipboard.writeText(text); $("btnSumCopy").textContent = "Copied"; } catch {}
  setTimeout(() => $("btnSumCopy").textContent = "Copy results", 2000);
};

const refit = () => { if (view && !view.ended) { fitHand(); render(); } };
compact.addEventListener("change", refit);
window.addEventListener("resize", refit);
initSetup();
