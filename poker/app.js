// Screens and table rendering. Works with either controller: LocalTable (bots) or OnlineTable (friends).
import { LocalTable, savedAiTable } from "./local.js";
import { avatarSvg, PRESETS, DEFAULT_AVATAR } from "./avatars.js";
import { openLook } from "./look.js";
import { handOdds, STRONG_FROM } from "./odds.js";
import { CATEGORY, evaluate } from "../supabase/functions/_shared/poker-engine.js";

const $ = id => document.getElementById(id);
const CONFIG = window.POKER_CONFIG || {};
const onlineEnabled = !!(CONFIG.supabaseUrl && CONFIG.anonKey);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

// ---------- money ----------
const toCents = v => Math.round(Number(v) * 100);
function fmt(cents, signed) {
  const abs = Math.abs(cents) / 100;
  const s = abs.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
  return signed ? (cents > 0 ? "+" : cents < 0 ? "−" : "") + s : (cents < 0 ? "−" : "") + s;
}
const netClass = n => n > 0 ? "pos" : n < 0 ? "neg" : "";

// ---------- cards ----------
const SUIT = { s: "♠", h: "♥", d: "♦", c: "♣" };
const rankText = r => r === "T" ? "10" : r;
const cardName = c => rankText(c[0]) + SUIT[c[1]];
function cardEl(code, cls = "") {
  const el = document.createElement("div");
  if (!code) { el.className = "card back " + cls; el.setAttribute("aria-label", "face-down card"); return el; }
  const red = code[1] === "h" || code[1] === "d";
  el.className = `card ${red ? "red" : ""} ${cls}`;
  el.dataset.code = code;
  el.setAttribute("aria-label", cardName(code));
  el.innerHTML = `<div class="corner">${rankText(code[0])}<span>${SUIT[code[1]]}</span></div><div class="pip">${SUIT[code[1]]}</div>`;
  return el;
}
// Keep existing card elements so animations play only for new cards. Returns the newly dealt ones.
function syncCards(box, codes, { slots = 0, highlight = null, faceDown = 0 } = {}) {
  const want = codes.length ? codes.map(c => c || null) : Array(faceDown).fill(null);
  const total = Math.max(want.length, slots), dealt = [];
  for (let i = 0; i < total; i++) {
    const code = want[i] !== undefined ? want[i] : "slot";
    const key = code === null ? "back" : code;
    let el = box.children[i];
    if (!el || el.dataset.key !== key) {
      const fresh = code === "slot" ? Object.assign(document.createElement("div"), { className: "card slot" }) : cardEl(code);
      if (code !== "slot") {
        if (el && el.dataset.key === "back" && code) fresh.classList.add("reveal"); // turned over at showdown
        else { fresh.classList.add("deal"); dealt.push(fresh); }
      }
      fresh.dataset.key = key;
      el ? box.replaceChild(fresh, el) : box.appendChild(fresh);
      el = fresh;
    }
    el.classList.toggle("win", !!(highlight && code && highlight.includes(code)));
    el.classList.toggle("dim", !!(highlight && code && code !== "slot" && !highlight.includes(code)));
  }
  while (box.children.length > total) box.lastChild.remove();
  return dealt;
}

// ---------- dealing animation ----------
const calm = matchMedia("(prefers-reduced-motion: reduce)");
const FLY_MS = 420;
function dealOrigin() {
  const db = $("dealerBtn");
  const r = (db.hidden ? $("board") : db).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
// Slides a card in from the dealer. Face-up cards arrive face down and turn over once they land.
function fly(el, delay, from, turn) {
  el.classList.remove("deal");
  const r = el.getBoundingClientRect();
  const dx = from.x - (r.left + r.width / 2), dy = from.y - (r.top + r.height / 2);
  el.animate([
    { transform: `translate(${dx}px, ${dy}px) rotate(-30deg) scale(.5)`, opacity: 0 },
    { opacity: 1, offset: .15 },
    { transform: "none", opacity: 1 }
  ], { duration: FLY_MS, delay, easing: "cubic-bezier(.2,.75,.3,1)", fill: "backwards" });
  if (turn && el.dataset.key !== "back") {
    el.style.setProperty("--flip-at", `${delay + FLY_MS + 140}ms`);
    el.classList.add("turning");
    el.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)", offset: .5 }, { transform: "scaleX(1)" }], { duration: 280, delay: delay + FLY_MS });
  }
}
// The deal goes round the table twice, one card at a time, starting left of the button.
function animateDeal(fresh) {
  const t = view.table, h = t.hand, n = t.maxSeats, from = dealOrigin();
  const order = h.players.map((p, i) => p ? i : -1).filter(i => i >= 0).sort((a, b) => (a - t.button - 1 + n) % n - (b - t.button - 1 + n) % n);
  let step = 0;
  for (let round = 0; round < 2; round++) for (const i of order) {
    const el = fresh[i] && fresh[i][round];
    if (el) fly(el, step * 95, from, i === view.me);
    step++;
  }
  return step * 95;
}

// ---------- screens ----------
function showScreen(id) {
  ["scrSetup", "scrTable", "scrSummary"].forEach(s => $(s).hidden = s !== id);
  $("meters").hidden = id !== "scrTable";
  document.body.classList.toggle("at-table", id === "scrTable");
}
// On phones the action bar is pinned to the bottom; the table sizes itself to the space that's left.
const compact = matchMedia("(max-width: 720px)");
const sizeVar = (el, name) => new ResizeObserver(() => document.documentElement.style.setProperty(name, el.offsetHeight + "px")).observe(el);
sizeVar(document.querySelector(".bar"), "--bar-h");
sizeVar(document.querySelector(".rail"), "--rail-h");

let ctrl = null, unsub = null, view = null;
function attach(controller) {
  if (unsub) unsub();
  if (ctrl && ctrl !== controller && ctrl.destroy) ctrl.destroy();
  ctrl = controller; history = []; seen = { hand: 0, log: 0, board: 0, results: false };
  animOk = false; lastHandNo = null; oddsKey = "";
  buildSeats(0);
  showScreen("scrTable");
  unsub = ctrl.subscribe(v => { view = v; render(); });
}

// ---------- setup: AI ----------
const aiBots = $("aiBots");
for (let n = 1; n <= 7; n++) aiBots.insertAdjacentHTML("beforeend", `<button type="button" data-v="${n}" aria-pressed="${n === 5}">${n}</button>`);
const crSeats = $("crSeats");
for (let n = 2; n <= 8; n++) crSeats.insertAdjacentHTML("beforeend", `<button type="button" data-v="${n}" aria-pressed="${n === 8}">${n}</button>`);
document.querySelectorAll(".seg").forEach(seg => seg.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
}));
const segValue = id => $(id).querySelector('[aria-pressed="true"]').dataset.v;

function readBlinds(sbId, bbId) {
  const sb = toCents($(sbId).value), bb = toCents($(bbId).value);
  if (!(sb > 0) || !(bb > 0)) return { err: "Enter both blinds." };
  if (sb > bb) return { err: "The small blind can't be bigger than the big blind." };
  return { sb, bb };
}
const nameOf = id => $(id).value.trim().replace(/\s+/g, " ").slice(0, 16);

// ---------- your look and table preferences (kept on this device) ----------
const myAvatar = () => store.get("pk-avatar", DEFAULT_AVATAR);
const myShow = () => store.get("pk-show", false);
function drawLookButtons() {
  document.querySelectorAll("[data-look]").forEach(b => b.innerHTML = `<span class="av">${avatarSvg(myAvatar())}</span>`);
}
document.querySelectorAll("[data-look]").forEach(b => b.addEventListener("click", async () => {
  const code = await openLook(myAvatar());
  if (code) { store.set("pk-avatar", code); drawLookButtons(); }
}));
// Players without a chosen look still get a steady one, picked from their name.
function avatarOf(seat) {
  if (seat && seat.avatar) return seat.avatar;
  const name = seat ? seat.name || "" : "";
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PRESETS[h % PRESETS.length].code;
}
const miniAv = code => `<span class="mini-av">${avatarSvg(code)}</span>`;

$("formAi").addEventListener("submit", e => {
  e.preventDefault();
  const name = nameOf("aiName") || "Player";
  const bl = readBlinds("aiSb", "aiBb");
  if (bl.err) return $("aiErr").textContent = bl.err;
  const buyIn = toCents($("aiBuy").value);
  if (!(buyIn >= bl.bb * 10)) return $("aiErr").textContent = `Buy in for at least 10 big blinds (${fmt(bl.bb * 10)}).`;
  if (buyIn > 1e11) return $("aiErr").textContent = "That's more than this table can hold. Try under $1 billion.";
  $("aiErr").textContent = "";
  store.set("pk-name", name);
  attach(LocalTable.create({ name, bots: +segValue("aiBots"), skill: segValue("aiSkill"), botShow: segValue("aiShow"), sb: bl.sb, bb: bl.bb, buyIn, avatar: myAvatar(), show: myShow() }));
});
$("aiResume").addEventListener("click", () => { const s = savedAiTable(); if (s) attach(new LocalTable(s)); });

// ---------- setup: online ----------
const params = new URLSearchParams(location.search);
async function online() { return import("./online.js"); }

$("formCreate").addEventListener("submit", async e => {
  e.preventDefault();
  const name = nameOf("crName");
  if (!name) return $("crErr").textContent = "Enter your name.";
  const bl = readBlinds("crSb", "crBb");
  if (bl.err) return $("crErr").textContent = bl.err;
  const minBuyIn = toCents($("crMin").value), buyIn = toCents($("crBuy").value);
  if (!(minBuyIn >= bl.bb)) return $("crErr").textContent = "The minimum buy-in has to be at least one big blind.";
  if (!(buyIn >= minBuyIn)) return $("crErr").textContent = `Your buy-in has to be at least the minimum, ${fmt(minBuyIn)}.`;
  const step = toCents($("crStep").value);
  if (!(step >= 1)) return $("crErr").textContent = "Enter the raise step, for example the big blind.";
  $("crErr").textContent = ""; $("btnCreate").disabled = true;
  try {
    store.set("pk-name", name);
    const { OnlineTable } = await online();
    attach(await OnlineTable.create({ name, sb: bl.sb, bb: bl.bb, minBuyIn, buyIn, step, maxSeats: +segValue("crSeats"), actSeconds: +$("crTime").value,
      odds: { win: $("crOddsWin").checked, strong: $("crOddsStrong").checked, cats: $("crOddsCats").checked }, avatar: myAvatar(), show: myShow() }));
  } catch (err) { $("crErr").textContent = err.message; }
  finally { $("btnCreate").disabled = false; }
});

// The raise step follows the big blind until the host types their own.
let stepEdited = false;
$("crStep").addEventListener("input", () => { stepEdited = true; });
$("crBb").addEventListener("input", () => { if (!stepEdited) $("crStep").value = $("crBb").value; });

$("formJoin").addEventListener("submit", async e => {
  e.preventDefault();
  const code = $("jnCode").value.trim().toUpperCase(), name = nameOf("jnName"), buyIn = toCents($("jnBuy").value);
  if (code.length !== 6) return $("jnErr").textContent = "Table codes are 6 letters and numbers.";
  if (!name) return $("jnErr").textContent = "Enter your name.";
  if (!(buyIn > 0)) return $("jnErr").textContent = "Enter your buy-in.";
  $("jnErr").textContent = ""; $("btnJoin").disabled = true;
  try {
    store.set("pk-name", name);
    const { OnlineTable } = await online();
    attach(await OnlineTable.join({ code, name, buyIn, avatar: myAvatar(), show: myShow() }));
  } catch (err) { $("jnErr").textContent = err.message; }
  finally { $("btnJoin").disabled = false; }
});
$("jnCode").addEventListener("change", lookupRules);
async function lookupRules() {
  const code = $("jnCode").value.trim().toUpperCase();
  $("jnRules").textContent = "";
  if (code.length !== 6 || !onlineEnabled) return;
  try {
    const { peekTable } = await online();
    const r = await peekTable(code);
    const NAMES = { win: "win %", strong: "strong hand", cats: "hand odds" };
    const on = r && r.odds ? ODDS_PARTS.filter(k => r.odds[k] !== false) : null;
    const odds = !on ? "" : on.length === 3 ? " · odds helper on" : !on.length ? " · odds helper off" : " · odds helper: " + on.map(k => NAMES[k]).join(", ");
    const steps = r && r.step > 1 ? ` · raises in ${fmt(r.step)} steps` : "";
    $("jnRules").textContent = r ? `Blinds ${fmt(r.sb)}/${fmt(r.bb)} · minimum buy-in ${fmt(r.minBuyIn)}${steps} · ${r.seated} of ${r.maxSeats} seats taken${odds}` : "No open table with that code.";
    if (r && toCents($("jnBuy").value) < r.minBuyIn) $("jnBuy").value = r.minBuyIn / 100;
  } catch { /* the join itself reports errors */ }
}
$("btnRejoin").addEventListener("click", async () => {
  try { const { OnlineTable } = await online(); attach(await OnlineTable.resume()); }
  catch (err) { $("jnErr").textContent = err.message; $("btnRejoin").hidden = true; }
});

function route() {
  const mode = location.hash === "#online" ? "online" : "ai";
  $("setupAi").hidden = mode !== "ai";
  $("setupOnline").hidden = mode !== "online";
  $("tabAi").setAttribute("aria-current", mode === "ai" ? "page" : "false");
  $("tabOnline").setAttribute("aria-current", mode === "online" ? "page" : "false");
  $("formCreate").hidden = $("formJoin").hidden = !onlineEnabled;
  $("onlineOff").hidden = onlineEnabled;
}
window.addEventListener("hashchange", () => { if (!ctrl || view?.ended) route(); });

function initSetup() {
  const name = store.get("pk-name", "");
  if (name) { $("aiName").value = name; $("crName").value = name; $("jnName").value = name; }
  $("aiResume").hidden = !savedAiTable();
  drawLookButtons();
  if (params.get("code")) { location.hash = "#online"; $("jnCode").value = params.get("code").toUpperCase().slice(0, 6); lookupRules(); }
  route();
  if (onlineEnabled) online().then(m => { $("btnRejoin").hidden = !m.hasSavedSeat(); }).catch(() => {});
  showScreen("scrSetup");
}

// ---------- table layout ----------
let seatEls = [], betEls = [], seatCount = 0;
function buildSeats(n) {
  const felt = $("felt");
  seatEls.forEach(e => e.remove()); betEls.forEach(e => e.remove());
  seatEls = []; betEls = []; seatCount = n;
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div");
    s.className = "seat";
    s.innerHTML = `<div class="top"><div class="pic"></div><div class="holes"></div></div><div class="plate"><div class="name"></div><div class="stack"></div><div class="tag"></div><div class="timer"></div></div><div class="hand-name"></div>`;
    felt.appendChild(s); seatEls.push(s);
    const b = document.createElement("div"); b.className = "bet"; felt.appendChild(b); betEls.push(b);
  }
}
function geometry(d, n) {
  const narrow = matchMedia("(max-width: 720px)").matches;
  const a = (90 + d * 360 / n) * Math.PI / 180;
  const rx = narrow ? 41 : 45, ry = narrow ? 44 : 43;
  const x = 50 + rx * Math.cos(a), y = 50 + ry * Math.sin(a);
  const toward = (k, spin = 0) => {
    const aa = a + spin;
    const sx = 50 + rx * Math.cos(aa), sy = 50 + ry * Math.sin(aa);
    return [sx + (50 - sx) * k, sy + (47 - sy) * k];
  };
  return { x, y, bet: toward(narrow ? .40 : .36), dealer: toward(narrow ? .30 : .26, narrow ? .32 : .22) };
}
const place = (el, [x, y]) => { el.style.left = x + "%"; el.style.top = y + "%"; };

// ---------- hand history ----------
let history = [], seen = { hand: 0, log: 0, board: 0, results: false };
function seatName(i) { return view.table.seats[i]?.name || view.players?.[i]?.name || `Seat ${i + 1}`; }
// "You fold" / "Rosa folds"
const who = i => i === view.me ? "You" : seatName(i);
const verb = (i, base, third = base + "s") => i === view.me ? base : third;
function describe(e) {
  const w = who(e.seat), s = e.seat;
  switch (e.type) {
    case "small blind": case "big blind": return `${w} ${verb(s, "post")} the ${e.type} ${fmt(e.amount)}`;
    case "fold": return `${w} ${verb(s, "fold")}`;
    case "check": return `${w} ${verb(s, "check")}`;
    case "call": return `${w} ${verb(s, "call")} ${fmt(e.amount)}`;
    case "call all-in": return `${w} ${verb(s, "call")} ${fmt(e.amount)}, all in`;
    case "bet": return `${w} ${verb(s, "bet")} ${fmt(e.to)}`;
    case "bet all-in": return `${w} ${verb(s, "bet")} ${fmt(e.to)}, all in`;
    case "raise": return `${w} ${verb(s, "raise")} to ${fmt(e.to)}`;
    case "raise all-in": return `${w} ${verb(s, "raise")} to ${fmt(e.to)}, all in`;
    default: return `${w} ${e.type}`;
  }
}
const winLine = r => `${who(r.seat)} ${verb(r.seat, "win")} ${fmt(r.amount)}${r.hand ? " with " + r.hand.toLowerCase() : ""}`;
function updateHistory() {
  const h = view.table.hand;
  if (!h) return;
  if (h.no !== seen.hand) {
    seen = { hand: h.no, log: 0, board: 0, results: false };
    history.push({ sep: true, text: `Hand ${h.no} · ${view.table.button === view.me ? "you have" : seatName(view.table.button) + " has"} the button` });
  }
  // put each board card line just before the first action on that street
  const cardsFor = { flop: 3, turn: 4, river: 5 }, label = { 3: "Flop", 4: "Turn", 5: "River" };
  const showBoardTo = n => {
    for (const k of [3, 4, 5]) if (k <= n && k <= h.board.length && seen.board < k) {
      history.push({ text: `${label[k]}: ${h.board.slice(0, k).map(cardName).join(" ")}` });
      seen.board = k;
    }
  };
  while (seen.log < h.log.length) {
    const e = h.log[seen.log++];
    if (cardsFor[e.street]) showBoardTo(cardsFor[e.street]);
    history.push({ text: describe(e) });
  }
  if (h.street !== "preflop") showBoardTo(h.street === "done" ? 5 : cardsFor[h.street]);
  if (h.results && !seen.results) {
    seen.results = true;
    if (h.uncalled) history.push({ text: `${fmt(h.uncalled.amount)} uncalled, returned to ${who(h.uncalled.seat)}` });
    if (h.showdown) Object.entries(h.handNames).forEach(([i, name]) => history.push({ text: `${who(+i)} ${verb(+i, "show")} ${(h.players[i].hole || []).map(cardName).join(" ")} (${name})` }));
    (h.mucked || []).forEach(i => history.push({ text: `${who(i)} ${verb(i, "muck")}` }));
    if (!h.showdown) (h.results || []).forEach(r => {
      const p = h.players[r.seat], showed = r.seat === view.me ? view.table.seats[r.seat]?.show : p && p.hole;
      if (showed && p.hole) history.push({ text: `${who(r.seat)} ${verb(r.seat, "show")} ${p.hole.map(cardName).join(" ")}` });
    });
    h.results.forEach(r => history.push({ text: winLine(r), win: true }));
  }
  if (history.length > 300) history = history.slice(-300);
}
function renderHistory() {
  const box = $("log"), atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  box.innerHTML = "";
  history.forEach(x => { const d = document.createElement("div"); d.textContent = x.text; if (x.sep) d.className = "hand-sep"; if (x.win) d.className = "pos"; box.appendChild(d); });
  if (atBottom) box.scrollTop = box.scrollHeight;
}

// ---------- render ----------
let raiseTo = 0, lastLegalKey = "", animOk = false, lastHandNo = null, raiseOpen = false;
function render() {
  if (!view) return;
  if (view.ended) return renderSummary();
  const t = view.table, h = t.hand, me = view.me, n = t.maxSeats;
  if (seatCount !== n) buildSeats(n);
  updateHistory();
  renderHistory();
  // A new hand: clear last hand's cards so this one can be dealt out fresh.
  const newHand = !!h && h.no !== lastHandNo;
  if (newHand) { seatEls.forEach(el => el.querySelector(".holes").innerHTML = ""); $("myCards").innerHTML = ""; }
  lastHandNo = h ? h.no : null;
  const animate = animOk && !calm.matches && !document.hidden;
  const fresh = {};

  // header
  const mine = me >= 0 ? t.seats[me] : null;
  const myCommitted = h && me >= 0 && h.players[me] && h.street !== "done" ? h.players[me].committed : 0;
  const myBuy = me >= 0 && view.players[me] ? view.players[me].buyIn : 0;
  $("mBlinds").textContent = `${fmt(t.sb)} / ${fmt(t.bb)}`;
  $("mStack").textContent = mine ? fmt(mine.stack) : "–";
  $("mBuyIn").textContent = myBuy ? fmt(myBuy) : "–";
  const net = mine ? mine.stack + myCommitted - myBuy : 0;
  $("mNet").textContent = mine ? fmt(net, true) : "–";
  $("mNet").className = netClass(net);
  $("mCodeWrap").hidden = !view.code; $("mCode").textContent = view.code || "";

  // board + pot
  const winCards = h && h.street === "done" && h.showdown ? (h.results || []).flatMap(r => r.best || []) : null;
  const boardDealt = syncCards($("board"), h ? h.board : [], { slots: 5, highlight: winCards });
  const betsOut = h ? h.players.reduce((s, p) => s + (p ? p.bet : 0), 0) : 0;
  $("pot").textContent = h && h.street !== "done" && h.pot ? `Pot ${fmt(h.pot)}` + (betsOut && h.pot !== betsOut ? ` · in the middle ${fmt(h.pot - betsOut)}` : "") : "";
  $("feltPrint").textContent = `NO LIMIT HOLD'EM · ${fmt(t.sb)}/${fmt(t.bb)}`;

  // seats
  for (let i = 0; i < n; i++) {
    const d = (i - Math.max(me, 0) + n) % n, g = geometry(d, n), el = seatEls[i], s = t.seats[i], p = h ? h.players[i] : null;
    place(el, [g.x, g.y]); place(betEls[i], g.bet);
    el.className = "seat" + (!s ? " empty" : "") + (i === me ? " me" : "") + (p && p.folded ? " folded" : "") + (h && h.street !== "done" && h.toAct === i ? " acting" : "");
    el.querySelector(".name").textContent = s ? s.name + (view.players[i]?.isBot ? "" : "") : (view.mode === "online" ? "Open seat" : "Empty");
    el.querySelector(".stack").textContent = s ? fmt(s.stack) : "";
    const won = h && h.street === "done" && (h.results || []).find(r => r.seat === i);
    const mucked = !!(h && h.street === "done" && (h.mucked || []).includes(i));
    const tag = el.querySelector(".tag");
    tag.className = "tag" + (won ? " win" : mucked ? " mucked" : p && p.allIn && h.street !== "done" ? " allin" : "");
    tag.textContent = !s ? "" : won ? `Wins ${fmt(won.amount)}` : mucked ? "Mucked" : p && p.folded ? "Folded" : p && p.allIn && h.street !== "done" ? "All in" : s.sittingOut ? "Sitting out" : s.stack === 0 && !p ? "Out of chips" : i === me ? "You" : "";
    const pic = el.querySelector(".pic"), av = s ? avatarOf(s) : "";
    if (pic.dataset.av !== av) { pic.dataset.av = av; pic.innerHTML = av ? avatarSvg(av, s.name) : ""; }
    const holes = el.querySelector(".holes");
    if (p && !p.folded && !mucked && i !== me) fresh[i] = syncCards(holes, p.hole || [], { faceDown: 2, highlight: winCards && p.hole ? winCards : null });
    else syncCards(holes, []);
    el.querySelector(".hand-name").textContent = h && h.street === "done" && h.handNames[i] ? h.handNames[i] : "";
    betEls[i].textContent = p && p.bet ? fmt(p.bet) : "";
  }
  const db = $("dealerBtn");
  db.hidden = t.button < 0 || !t.seats[t.button];
  if (!db.hidden) place(db, geometry((t.button - Math.max(me, 0) + n) % n, n).dealer);

  // my cards
  const myP = h && me >= 0 ? h.players[me] : null;
  if (me >= 0) fresh[me] = syncCards($("myCards"), myP && myP.hole ? myP.hole : [], { slots: 2, highlight: winCards });
  $("myHandName").textContent = myP && myP.hole && h.board.length >= 3 ? bestName(myP.hole, h.board) : myP && myP.hole ? startingName(myP.hole) : "";
  $("myPos").textContent = me < 0 ? "Watching" : !h ? "" : positionName(me);

  renderWinner();

  // card movement: hole cards round the table on a new hand, then each street's board cards
  let after = 0;
  if (animate && newHand) after = animateDeal(fresh);
  if (animate && boardDealt.length) {
    const from = dealOrigin();
    boardDealt.forEach((el, k) => fly(el, after + k * 150, from, true));
  }
  animOk = true;

  renderActions();
  renderPlayers();
  renderOdds();
  tickClock();
  $("tgShow").checked = me >= 0 && t.seats[me] ? !!t.seats[me].show : myShow();
}

// ---------- winner announcement ----------
// When a hand ends, a banner in the middle of the table says who won, how much, with what,
// and shows the winning five cards large, so everyone at the table can see it.
let bannerHand = null, bannerHidden = null;
function renderWinner() {
  const h = view.table.hand, box = $("winBanner");
  const done = !!(h && h.street === "done" && h.results && h.results.length);
  if (!done) { box.hidden = true; bannerHand = null; return; }
  if (bannerHidden === h.no) { box.hidden = true; return; }
  if (bannerHand === h.no) { box.hidden = false; return; }
  bannerHand = h.no;
  box.innerHTML = "";
  for (const r of h.results) {
    const seat = view.table.seats[r.seat];
    const row = document.createElement("div");
    row.className = "wb-row";
    row.innerHTML = `<div class="pic">${avatarSvg(avatarOf(seat))}</div><div class="wb-text"><div class="wb-title"></div><div class="wb-hand"></div></div>`;
    row.querySelector(".wb-title").textContent = `${who(r.seat)} ${verb(r.seat, "win")} ${fmt(r.amount)}`;
    row.querySelector(".wb-hand").textContent = r.hand || (h.showdown ? "" : "Everyone else folded");
    if (r.best && r.best.length) {
      const cards = document.createElement("div");
      cards.className = "wb-cards";
      r.best.forEach(c => cards.appendChild(cardEl(c)));
      row.appendChild(cards);
    }
    box.appendChild(row);
  }
  box.classList.toggle("multi", h.results.length > 1);
  box.hidden = false;
}
$("winBanner").addEventListener("click", () => { bannerHidden = bannerHand; $("winBanner").hidden = true; });

// ---------- odds helper ----------
let oddsKey = "", oddsResult = null, oddsTimer = 0;
const oddsPrefs = () => store.get("pk-odds", {});
// the three parts of the odds helper: chance to win, chance of a strong hand, chance of each hand
const ODDS_PARTS = ["win", "strong", "cats"];
const ALL_ODDS = { win: true, strong: true, cats: true };
const ODDS_UI = { win: { toggle: "tgWin", box: "oddsWin" }, strong: { toggle: "tgStrong", box: "oddsStrong" }, cats: { toggle: "tgCats", box: "oddsCats" } };
const pct = x => x >= .995 && x < 1 ? ">99%" : x > 0 && x < .01 ? "<1%" : Math.round(x * 100) + "%";
function renderOdds() {
  // the host decides what the table allows; each player then switches on what they want
  const rules = { ...ALL_ODDS, ...(view.oddsRules || {}) }, saved = oddsPrefs(), t = view.table, h = t.hand, me = view.me;
  const pref = {};
  for (const k of ODDS_PARTS) {
    pref[k] = rules[k] && saved[k] !== false;
    const tg = $(ODDS_UI[k].toggle), box = $(ODDS_UI[k].box);
    tg.hidden = !rules[k]; tg.setAttribute("aria-pressed", pref[k]);
    box.hidden = !pref[k];
  }
  const myP = h && me >= 0 ? h.players[me] : null;
  const live = !!(myP && myP.hole && !myP.folded && h.street !== "done");
  $("odds").hidden = me < 0 || !ODDS_PARTS.some(k => rules[k]);
  if (!ODDS_PARTS.some(k => pref[k])) return;
  if (!live) {
    oddsKey = ""; clearTimeout(oddsTimer);
    const first = ODDS_PARTS.find(k => pref[k]);
    for (const k of ODDS_PARTS) $(ODDS_UI[k].box).innerHTML = k === first ? `<span class="quiet">Your odds show here while you're in a hand.</span>` : "";
    return;
  }
  const opponents = h.players.filter((p, i) => p && !p.folded && i !== me).length;
  const key = `${h.no}|${myP.hole.join("")}|${h.board.join("")}|${opponents}`;
  if (key !== oddsKey) {
    oddsKey = key; oddsResult = null;
    clearTimeout(oddsTimer);
    // work it out just after this frame so dealing and buttons stay smooth
    oddsTimer = setTimeout(() => {
      if (oddsKey !== key) return;
      oddsResult = handOdds(myP.hole, h.board, opponents, opponents >= 4 ? 3000 : 5000);
      drawOdds(opponents, myP.hole, h.board);
    }, 60);
  }
  drawOdds(opponents, myP.hole, h.board);
}
function drawOdds(opponents, hole, board) {
  const r = oddsResult;
  if (!r) {
    const first = ODDS_PARTS.find(k => !$(ODDS_UI[k].box).hidden);
    for (const k of ODDS_PARTS) $(ODDS_UI[k].box).innerHTML = k === first ? `<span class="quiet">Working out your odds…</span>` : "";
    return;
  }
  const split = r.tie >= .005 ? ` · split ${pct(r.tie)}` : "";
  $("oddsWin").innerHTML = `<div class="big"><b>${pct(r.win)}</b><span>to win</span></div>
    <div class="meter-bar" aria-hidden="true"><i style="width:${r.win * 100}%"></i><i style="width:${r.tie * 100}%"></i></div>
    <small>against ${opponents} player${opponents === 1 ? "" : "s"} still in${split}</small>`;
  const made = board.length >= 3 ? evaluateFn([...hole, ...board]).cat : hole[0][0] === hole[1][0] ? 1 : 0;
  // strong hand: three of a kind or better
  const haveStrong = made >= STRONG_FROM;
  const nextLabel = board.length === 0 ? "on the flop" : board.length === 3 ? "on the turn" : "on the river";
  $("oddsStrong").innerHTML = haveStrong
    ? `<div class="big"><b>✓</b><span>you have a strong hand</span></div><small>three of a kind or better</small>`
    : `<div class="big"><b>${pct(r.strong)}</b><span>strong hand by the river</span></div>
       <div class="meter-bar" aria-hidden="true"><i style="width:${r.strong * 100}%"></i></div>
       <small>three of a kind or better${r.nextStrong == null ? "" : ` · ${pct(r.nextStrong)} ${nextLabel}`}</small>`;
  const rows = CATEGORY.map((name, c) => ({ name, c, p: r.cats[c] })).filter(x => x.c > 0 && (x.p >= .001 || x.c === made)).reverse();
  $("oddsCats").innerHTML = `<small>${board.length === 5 ? "Your final hand" : "Chance to end up with, by the river"}</small>` + rows.map(x =>
    `<div class="oc${x.c === made ? " made" : ""}"><span>${x.name}</span><span class="meter-bar" aria-hidden="true"><i style="width:${x.p * 100}%"></i></span><b>${pct(x.p)}</b></div>`).join("");
}
for (const k of ODDS_PARTS) $(ODDS_UI[k].toggle).onclick = () => { const p = oddsPrefs(); p[k] = p[k] === false; store.set("pk-odds", p); renderOdds(); };

const evaluateFn = evaluate;
const bestName = (hole, board) => evaluateFn([...hole, ...board]).name;
function startingName(hole) {
  const [a, b] = hole, ra = rankText(a[0]), rb = rankText(b[0]);
  if (a[0] === b[0]) return `Pocket ${ra}s`;
  return `${ra}-${rb} ${a[1] === b[1] ? "suited" : "offsuit"}`;
}
function positionName(seat) {
  const t = view.table, h = t.hand;
  if (!h || !h.players[seat]) return "Not in this hand";
  if (seat === t.button) return h.sbSeat === seat ? "Button · small blind" : "Button";
  if (seat === h.sbSeat) return "Small blind";
  if (seat === h.bbSeat) return "Big blind";
  return "";
}

function renderActions() {
  const t = view.table, h = t.hand, me = view.me, legal = h && h.legal;
  const myTurn = !!(legal && h.street !== "done");
  if (!myTurn) raiseOpen = false;
  $("actRow").hidden = !myTurn;
  // phones: the slider opens only after tapping Raise, so the buttons never move
  const sliderUp = !compact.matches || raiseOpen;
  $("raiseBox").hidden = !(myTurn && legal.raise && sliderUp);
  const between = !h || h.street === "done";
  const mine = me >= 0 ? t.seats[me] : null;
  const needRebuy = view.waitingForRebuy;
  $("rebuyRow").hidden = !needRebuy;
  if (needRebuy && !$("rebuyInput").value) $("rebuyInput").value = (view.minBuyIn / 100).toString();
  $("btnStart").hidden = !(view.mode === "online" && view.isHost && !view.started);
  $("btnDealNow").hidden = !(view.mode === "ai" && between && view.nextHandAt);
  $("betweenRow").hidden = $("btnStart").hidden && $("btnDealNow").hidden;
  $("btnSitOut").hidden = me < 0;
  $("btnSitOut").textContent = mine && mine.sittingOut ? "Deal me back in" : "Sit out next hand";
  $("btnCopyLink").hidden = view.mode !== "online";
  $("btnClose").hidden = !(view.mode === "online" && view.isHost);
  $("btnLeave").textContent = leaveArmed ? "Tap again to leave" : view.mode === "ai" ? "Leave and see results" : "Cash out and leave";
  $("toolsNote").textContent = view.mode === "online" ? (view.isHost ? "You're the host. Closing the table cashes everyone out and shows the final results." : "Cashing out records what you leave with. The host closes the table when the game is over.") : "";

  if (myTurn) {
    const toCall = legal.call;
    $("btnCall").firstChild.textContent = legal.check ? "Check" : toCall >= mine.stack ? `Call ${fmt(toCall)} all in` : `Call ${fmt(toCall)}`;
    $("btnFold").firstChild.textContent = legal.check ? "Fold" : "Fold";
    if (legal.raise) {
      const key = `${h.no}:${h.street}:${h.currentBet}:${legal.raise.min}:${legal.raise.max}`;
      if (key !== lastLegalKey) { lastLegalKey = key; raiseTo = legal.raise.min; raiseOpen = false; }
      raiseTo = snapRaise(legal.raise, raiseTo);
      const r = $("raiseRange");
      r.min = legal.raise.min; r.max = legal.raise.max; r.step = 1; // snapped to the table's step on input
      r.value = raiseTo;
      if (document.activeElement !== $("raiseInput")) $("raiseInput").value = (raiseTo / 100).toFixed(raiseTo % 100 ? 2 : 0);
      const allIn = raiseTo === legal.raise.max;
      $("btnRaise").firstChild.textContent = !sliderUp ? (legal.raise.isBet ? "Bet…" : "Raise…")
        : `${legal.raise.isBet ? "Bet" : "Raise to"} ${fmt(raiseTo)}${allIn ? " all in" : ""}`;
    }
    $("btnRaise").hidden = !legal.raise;
  }
  $("status").textContent = statusText();
}

function statusText() {
  const t = view.table, h = t.hand, me = view.me;
  if (view.mode === "online" && !view.started) {
    const seated = t.seats.filter(Boolean).length;
    return view.isHost ? `${seated} of ${t.maxSeats} seats taken. Start the game when everyone's in (at least 2 players).` : `Waiting for the host to start the game. ${seated} players seated.`;
  }
  if (view.closing) return "The host is closing the table. Final results come up when this hand ends.";
  if (view.leaving) return "You've cashed out. You'll leave the table when this hand ends.";
  if (view.waitingForRebuy) return `You're out of chips. Buy back in (at least ${fmt(view.minBuyIn)}) or leave the table.`;
  if (!h) return view.nextHandAt ? "Shuffling up…" : "Waiting for players.";
  if (h.street === "done") {
    const lines = (h.results || []).map(winLine);
    const wait = view.nextHandAt ? ` Next hand in ${Math.max(0, Math.ceil((view.nextHandAt - Date.now()) / 1000))}s.`
      : view.mode === "online" ? " Waiting for another player to sit down, sit back in or buy back in." : "";
    return lines.join(". ") + "." + wait;
  }
  if (h.legal) return h.legal.check ? "Your turn." : `Your turn. ${fmt(h.legal.call)} to call.`;
  if (h.toAct >= 0) return `Waiting for ${seatName(h.toAct)}…`;
  return "";
}

function renderPlayers() {
  const t = view.table, h = t.hand, box = $("playersList");
  box.innerHTML = "";
  t.seats.forEach((s, i) => {
    if (!s) return;
    const p = view.players[i] || { buyIn: 0 };
    const inPot = h && h.street !== "done" && h.players[i] ? h.players[i].committed : 0;
    const net = s.stack + inPot - p.buyIn;
    const row = document.createElement("div");
    row.className = "pl";
    row.innerHTML = `<span>${miniAv(avatarOf(s))}<span></span></span><span></span><b class="${netClass(net)}"></b>`;
    row.children[0].lastChild.textContent = s.name + (i === view.me ? " (you)" : "") + (view.hostSeat === i ? " · host" : "") + (p.isBot ? " · bot" : "");
    row.children[1].textContent = `in ${fmt(p.buyIn)}`;
    row.children[2].textContent = fmt(net, true);
    box.appendChild(row);
  });
  (view.departed || []).forEach(d => {
    const row = document.createElement("div");
    row.className = "pl";
    row.innerHTML = `<span>${miniAv(avatarOf(d))}<span></span></span><span></span><b class="${netClass(d.cashOut - d.buyIn)}"></b>`;
    row.children[0].lastChild.textContent = d.name + " · cashed out";
    row.children[1].textContent = `in ${fmt(d.buyIn)}`;
    row.children[2].textContent = fmt(d.cashOut - d.buyIn, true);
    box.appendChild(row);
  });
}

// countdowns and the act timer run off the clock, not off state changes
function tickClock() {
  if (!view || view.ended) return;
  const h = view.table.hand;
  seatEls.forEach((el, i) => {
    const bar = el.querySelector(".timer");
    const on = view.deadline && h && h.street !== "done" && h.toAct === i;
    bar.style.width = on ? Math.max(0, Math.min(100, (view.deadline - Date.now()) / (view.actMs || 30000) * 100)) + "%" : "0";
  });
  if (h && h.street === "done" && view.nextHandAt) $("status").textContent = statusText();
}
setInterval(tickClock, 250);

// ---------- input ----------
function guard(fn) {
  return async (...a) => {
    try { await fn(...a); }
    catch (err) { $("status").textContent = err.message; }
  };
}
$("btnFold").onclick = guard(() => ctrl.act({ type: "fold" }));
$("btnCall").onclick = guard(() => ctrl.act(view.table.hand.legal.check ? { type: "check" } : { type: "call" }));
$("btnRaise").onclick = guard(() => {
  if (compact.matches && !raiseOpen) { raiseOpen = true; renderActions(); return; }
  raiseOpen = false;
  return ctrl.act({ type: "raise", to: raiseTo });
});
compact.addEventListener("change", () => { raiseOpen = false; if (view && !view.ended) render(); });
// Raises go up in the table's step (big blind vs bots, the host's choice online).
// The exact minimum raise and all-in are always allowed even when they aren't round.
function snapRaise(raise, v) {
  const step = raise.step || 1;
  if (v >= raise.max) return raise.max;
  if (v <= raise.min) return raise.min;
  // nearest of: the minimum, all-in, and the step multiples either side of v
  const below = Math.floor(v / step) * step;
  return [raise.min, raise.max, below, below + step]
    .filter(c => c >= raise.min && c <= raise.max)
    .reduce((best, c) => Math.abs(c - v) < Math.abs(best - v) ? c : best);
}
$("raiseRange").addEventListener("input", e => {
  const legal = view.table.hand.legal; if (!legal || !legal.raise) return;
  raiseTo = snapRaise(legal.raise, +e.target.value);
  renderActions();
});
$("raiseInput").addEventListener("input", e => { const v = toCents(e.target.value); if (v > 0) { raiseTo = v; renderActions(); } });
$("raiseInput").addEventListener("blur", renderActions);
$("presets").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const h = view.table.hand, legal = h.legal; if (!legal || !legal.raise) return;
  const p = b.dataset.p;
  if (p === "min") raiseTo = legal.raise.min;
  else if (p === "all") raiseTo = legal.raise.max;
  else raiseTo = snapRaise(legal.raise, h.currentBet + Number(p) * (h.pot + legal.call));
  renderActions();
});
$("btnDealNow").onclick = guard(() => ctrl.dealNow());
$("btnStart").onclick = guard(() => ctrl.start());
$("btnRebuy").onclick = guard(async () => {
  const c = toCents($("rebuyInput").value);
  if (!(c >= view.minBuyIn)) throw new Error(`Buy back in for at least ${fmt(view.minBuyIn)}.`);
  await ctrl.rebuy(c); $("rebuyInput").value = "";
});
$("btnSitOut").onclick = guard(() => ctrl.setSitOut(!view.table.seats[view.me].sittingOut));
$("tgShow").onchange = guard(async e => {
  const on = e.target.checked;
  store.set("pk-show", on);
  if (view && view.me >= 0) await ctrl.setPrefs({ show: on });
});
$("btnLook").onclick = guard(async () => {
  const mine = view && view.me >= 0 ? view.table.seats[view.me] : null;
  const code = await openLook(mine && mine.avatar || myAvatar());
  if (!code) return;
  store.set("pk-avatar", code); drawLookButtons();
  if (view && view.me >= 0) await ctrl.setPrefs({ avatar: code });
});
$("btnCopyLink").onclick = async () => {
  const url = `${location.origin}${location.pathname}?code=${view.code}#online`;
  try { await navigator.clipboard.writeText(url); $("btnCopyLink").textContent = "Link copied"; }
  catch { $("btnCopyLink").textContent = url; }
  setTimeout(() => $("btnCopyLink").textContent = "Copy invite link", 2500);
};
let leaveArmed = 0, closeArmed = 0;
$("btnLeave").onclick = guard(async () => {
  if (!leaveArmed) { leaveArmed = setTimeout(() => { leaveArmed = 0; render(); }, 4000); render(); return; }
  clearTimeout(leaveArmed); leaveArmed = 0;
  await ctrl.leave();
});
$("btnClose").onclick = guard(async () => {
  if (!closeArmed) { closeArmed = setTimeout(() => { closeArmed = 0; $("btnClose").textContent = "Close table for everyone"; }, 4000); $("btnClose").textContent = "Tap again to close the table"; return; }
  clearTimeout(closeArmed); closeArmed = 0;
  await ctrl.close();
});
document.addEventListener("keydown", e => {
  if (!view || $("lookDlg").open || e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  const legal = view.table?.hand?.legal; if (!legal) return;
  const k = e.key.toLowerCase();
  if (k === "f") $("btnFold").click();
  else if (k === "c") $("btnCall").click();
  else if (k === "r" && legal.raise) $("btnRaise").click();
});

// ---------- summary ----------
function renderSummary() {
  showScreen("scrSummary");
  const s = view.summary;
  if (!s) return;
  $("sumTitle").textContent = view.mode === "ai" ? "Session over" : view.tableClosed ? "Table closed" : "You cashed out";
  $("sumIntro").textContent = `${s.hands} hand${s.hands === 1 ? "" : "s"} played. Pretend dollars only: settle up between yourselves.`;
  const body = $("sumRows"); body.innerHTML = "";
  s.rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${miniAv(avatarOf(r))}<span></span></td><td></td><td></td><td></td>`;
    tr.children[0].lastChild.textContent = r.name + (r.me ? " (you)" : "") + (r.isBot ? " · bot" : "");
    tr.children[1].textContent = fmt(r.buyIn);
    tr.children[2].textContent = r.cashOut == null ? "still playing" : fmt(r.cashOut);
    tr.children[3].textContent = r.cashOut == null ? "–" : fmt(r.net, true);
    tr.children[3].className = netClass(r.net);
    body.appendChild(tr);
  });
  const pay = $("sumPay"); pay.innerHTML = "";
  if (s.partial) pay.innerHTML = "<li>The table is still going. Who pays whom is worked out when the host closes it.</li>";
  else if (!s.payments.length) pay.innerHTML = "<li>Nobody owes anybody.</li>";
  s.payments.forEach(p => { const li = document.createElement("li"); li.textContent = `${p.from} pays ${p.to} ${fmt(p.amount)}`; pay.appendChild(li); });
}
$("btnSumDone").onclick = () => { if (ctrl && ctrl.destroy) ctrl.destroy(); ctrl = null; view = null; $("aiResume").hidden = !savedAiTable(); initSetup(); };
$("btnSumCopy").onclick = async () => {
  const s = view.summary;
  const text = ["Texas Hold'em results", ...s.rows.map(r => `${r.name}: in ${fmt(r.buyIn)}, out ${r.cashOut == null ? "-" : fmt(r.cashOut)}, ${r.cashOut == null ? "" : fmt(r.net, true)}`), "", ...s.payments.map(p => `${p.from} pays ${p.to} ${fmt(p.amount)}`)].join("\n");
  try { await navigator.clipboard.writeText(text); $("btnSumCopy").textContent = "Copied"; } catch { $("btnSumCopy").textContent = "Copy failed"; }
  setTimeout(() => $("btnSumCopy").textContent = "Copy results", 2000);
};

window.addEventListener("resize", () => render());
initSetup();
