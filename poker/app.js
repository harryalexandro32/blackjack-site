// Screens and table rendering. Works with either controller: LocalTable (bots) or OnlineTable (friends).
import { LocalTable, savedAiTable } from "./local.js";
import { avatarSvg, PRESETS, DEFAULT_AVATAR } from "./avatars.js";
import { openLook } from "./look.js";
import { handOdds, STRONG_FROM, drawChoice } from "./odds.js";
import { CATEGORY, evaluate, settle, GAMES, evaluateFor, drawAllowed } from "../supabase/functions/_shared/poker-engine.js";
import { REACTIONS } from "../supabase/functions/_shared/poker-room.js";
import { play, soundOn, setSound } from "./sound.js";
import { useTable, saveHand, hasReplay, openReplay, setupReplay } from "./replay.js";

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
  for (let round = 0; round < GAMES[t.game || "holdem"].hole; round++) for (const i of order) {
    const el = fresh[i] && fresh[i][round];
    if (el) { fly(el, step * 95, from, i === view.me); play("deal", step * 0.095); }
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
  animOk = false; lastHandNo = null; oddsKey = ""; lastChatN = null; lastTurnKey = ""; lastSessionNo = undefined;
  useTable(controller.seat ? "online:" + controller.seat.code : "ai");
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

// ---------- the game picker: Hold'em, Omaha, Five Card Draw ----------
const GAME_NOTES = {
  holdem: "Two cards each, five shared on the board. No-limit.",
  omaha: "Four cards each. Your hand must use exactly two of them and three from the board. Pot-limit: the biggest raise is the size of the pot.",
  draw: "Five cards each, no board. Bet, swap up to 3 cards (4 if you keep an ace), bet again, show down. Up to 6 players."
};
function gamePicked(segId, noteId, countSeg, offset) {
  const g = segValue(segId), max = GAMES[g].maxSeats - offset;
  $(noteId).textContent = GAME_NOTES[g];
  // Five Card Draw seats at most 6: grey out bigger tables and step down if needed
  const btns = [...$(countSeg).querySelectorAll("button")];
  btns.forEach(b => { b.disabled = +b.dataset.v > max; });
  const on = btns.find(b => b.getAttribute("aria-pressed") === "true");
  if (on && on.disabled) { on.setAttribute("aria-pressed", "false"); btns.filter(b => !b.disabled).pop().setAttribute("aria-pressed", "true"); }
}
$("aiGame").addEventListener("click", () => gamePicked("aiGame", "aiGameNote", "aiBots", 1));
$("crGame").addEventListener("click", () => gamePicked("crGame", "crGameNote", "crSeats", 0));
queueMicrotask(() => { gamePicked("aiGame", "aiGameNote", "aiBots", 1); gamePicked("crGame", "crGameNote", "crSeats", 0); });

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
  store.set("pk-coach", $("aiCoach").checked);
  attach(LocalTable.create({ name, game: segValue("aiGame"), bots: +segValue("aiBots"), skill: segValue("aiSkill"), botStyle: segValue("aiStyle"), coach: $("aiCoach").checked, botShow: segValue("aiShow"), sb: bl.sb, bb: bl.bb, buyIn, avatar: myAvatar(), show: myShow() }));
});
$("aiResume").addEventListener("click", () => { const s = savedAiTable(); if (s) attach(new LocalTable(s)); });
// what each bot style means, under the picker
const STYLE_NOTES = {
  mixed: "One of each kind: a rock, a maniac, a calling station and a shark.",
  rock: "Rocks play few hands and only bet with good ones. Steal their blinds; believe their raises.",
  maniac: "Maniacs raise and bluff all the time. Wait for a good hand and let them bet into you.",
  station: "Calling stations call almost anything. Don't bluff them; bet your good hands for value.",
  shark: "Sharks play solid, balanced poker. The toughest table."
};
$("aiStyle").addEventListener("click", () => { $("aiStyleNote").textContent = STYLE_NOTES[segValue("aiStyle")]; });
$("aiCoach").checked = store.get("pk-coach", true);
$("tgCoach").onchange = e => ctrl && ctrl.setCoach && ctrl.setCoach(e.target.checked);

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
  const ante = toCents($("crAnte").value || 0);
  if (!(ante >= 0 && ante <= bl.bb)) return $("crErr").textContent = "The ante can be anything from nothing up to the big blind.";
  $("crErr").textContent = ""; $("btnCreate").disabled = true;
  try {
    store.set("pk-name", name);
    const { OnlineTable } = await online();
    attach(await OnlineTable.create({ name, game: segValue("crGame"), sb: bl.sb, bb: bl.bb, minBuyIn, buyIn, step, maxSeats: +segValue("crSeats"), actSeconds: +$("crTime").value,
      odds: { win: $("crOddsWin").checked, strong: $("crOddsStrong").checked, cats: $("crOddsCats").checked },
      ante, straddle: $("crStraddle").checked, runTwice: $("crRit").checked, avatar: myAvatar(), show: myShow() }));
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
$("btnWatch").addEventListener("click", async () => {
  const code = $("jnCode").value.trim().toUpperCase(), name = nameOf("jnName");
  if (code.length !== 6) return $("jnErr").textContent = "Table codes are 6 letters and numbers.";
  if (!name) return $("jnErr").textContent = "Enter your name.";
  $("jnErr").textContent = ""; $("btnWatch").disabled = true;
  try {
    store.set("pk-name", name);
    const { OnlineTable } = await online();
    attach(await OnlineTable.watch({ code, name }));
  } catch (err) { $("jnErr").textContent = err.message; }
  finally { $("btnWatch").disabled = false; }
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
    const steps = (r && r.step > 1 ? ` · raises in ${fmt(r.step)} steps` : "")
      + (r && r.ante ? ` · ${fmt(r.ante)} ante` : "") + (r && r.straddle ? " · straddle" : "") + (r && r.runTwice ? " · run it twice allowed" : "");
    $("jnRules").textContent = r ? `${GAMES[r.game || "holdem"].name} · blinds ${fmt(r.sb)}/${fmt(r.bb)} · minimum buy-in ${fmt(r.minBuyIn)}${steps} · ${r.seated} of ${r.maxSeats} seats taken${odds}` : "No open table with that code.";
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
  if (params.get("code") && params.get("host") && onlineEnabled) return openAsHost(params.get("code").toUpperCase().slice(0, 6), params.get("host"));
  if (params.get("code")) { location.hash = "#online"; $("jnCode").value = params.get("code").toUpperCase().slice(0, 6); lookupRules(); }
  route();
  if (onlineEnabled) online().then(m => { $("btnRejoin").hidden = !m.hasSavedSeat(); }).catch(() => {});
  showScreen("scrSetup");
}

// The host's private link opens the room as host on any device. The key is taken out of the address
// bar straight away so it isn't shared by accident.
async function openAsHost(code, hostKey) {
  window.history.replaceState(null, "", location.pathname + "#online"); // (plain `history` here is the hand history list)
  route(); showScreen("scrSetup");
  try { const { OnlineTable } = await online(); attach(await OnlineTable.claim({ code, hostKey })); }
  catch (err) { $("jnCode").value = code; $("jnErr").textContent = err.message; }
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
    s.innerHTML = `<div class="top"><div class="pic"></div><div class="holes"></div></div><div class="plate"><div class="name"></div><div class="stack"></div><div class="tag"></div><div class="timer"></div></div><div class="hand-name"></div><div class="bubble" hidden></div>`;
    felt.appendChild(s); seatEls.push(s);
    const b = document.createElement("div"); b.className = "bet"; felt.appendChild(b); betEls.push(b);
  }
}
function geometry(d, n) {
  const narrow = matchMedia("(max-width: 720px)").matches;
  const a = (90 + d * 360 / n) * Math.PI / 180;
  const rx = narrow ? 41 : 45, ry = narrow ? 40 : 43;
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
function describe(e) { return describeEntry(e, who, verb); }
// Shared wording for the history and the replay. whoFn/verbFn decide "You fold" vs "Rosa folds".
function describeEntry(e, whoFn, verbFn) {
  const w = whoFn(e.seat), s = e.seat;
  const verb = verbFn;
  switch (e.type) {
    case "ante": return `${w} ${verb(s, "post")} an ante ${fmt(e.amount)}`;
    case "straddle": return `${w} ${verb(s, "straddle")} ${fmt(e.amount)}`;
    case "run twice": return "Everyone agreed to run it twice";
    case "run once": return "Running it once";
    case "draw": return e.count ? `${w} ${verb(s, "draw")} ${e.count} card${e.count === 1 ? "" : "s"}` : `${w} ${verb(s, "stand", "stands")} pat`;
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
    history.push({ sep: true, no: h.no, text: `Hand ${h.no} · ${view.table.button === view.me ? "you have" : seatName(view.table.button) + " has"} the button` });
  }
  // put each board card line just before the first action on that street
  const cardsFor = { flop: 3, turn: 4, river: 5 }, label = { 3: "Flop", 4: "Turn", 5: "River" };
  const showBoardTo = n => {
    for (const k of [3, 4, 5]) if (k <= n && k <= h.board.length && seen.board < k) {
      history.push({ text: `${label[k]}: ${h.board.slice(0, k).map(cardName).join(" ")}` });
      seen.board = k;
    }
  };
  let k = 0;
  while (seen.log < h.log.length) {
    const e = h.log[seen.log++];
    if (cardsFor[e.street]) showBoardTo(cardsFor[e.street]);
    history.push({ text: describe(e) });
    if (animOk) play(actionSound(e.type), 0.12 * k++);
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
    if (h.runs) h.runs.forEach((run, i) => {
      history.push({ text: `Run ${i + 1}: ${run.board.map(cardName).join(" ")}` });
      run.results.forEach(r => history.push({ text: `Run ${i + 1}: ` + winLine(r), win: true }));
    });
    else h.results.forEach(r => history.push({ text: winLine(r), win: true }));
    if (view.coach && view.coach.no === h.no) history.push({ text: "Coach: " + view.coach.text, coach: true });
  }
  if (history.length > 300) history = history.slice(-300);
}
function renderHistory() {
  const box = $("log"), atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  box.innerHTML = "";
  history.forEach(x => {
    const d = document.createElement("div"); d.textContent = x.text;
    if (x.sep) {
      d.className = "hand-sep";
      if (hasReplay(x.no)) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "replay-btn"; b.textContent = "▶ Replay"; b.dataset.no = x.no;
        b.setAttribute("aria-label", `Replay hand ${x.no}`);
        d.appendChild(b);
      }
    }
    if (x.win) d.className = "pos";
    if (x.coach) d.className = "coach-line";
    box.appendChild(d);
  });
  if (atBottom) box.scrollTop = box.scrollHeight;
}

// ---------- render ----------
let raiseTo = 0, lastLegalKey = "", animOk = false, lastHandNo = null, raiseOpen = false;
function render() {
  if (!view) return;
  if (view.ended && !view.summary) return backToLobby(); // a watcher who left
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
  // run it twice: two boards, each with its own winners
  const runs = h && h.runs;
  const boardWin = runs ? runs[0].results.flatMap(r => r.best || []) : winCards;
  const game = t.game || "holdem", holeN = GAMES[game].hole;
  $("board").hidden = game === "draw";
  const boardDealt = syncCards($("board"), h ? h.board : [], { slots: game === "draw" ? 0 : 5, highlight: boardWin });
  $("board2").hidden = !runs;
  const board2Dealt = runs ? syncCards($("board2"), runs[1].board, { slots: 5, highlight: runs[1].results.flatMap(r => r.best || []) }) : [];
  if (!runs) $("board2").innerHTML = "";
  const betsOut = h ? h.players.reduce((s, p) => s + (p ? p.bet : 0), 0) : 0;
  $("pot").textContent = h && h.street !== "done" && h.pot ? `Pot ${fmt(h.pot)}` + (betsOut && h.pot !== betsOut ? ` · in the middle ${fmt(h.pot - betsOut)}` : "") : "";
  $("feltPrint").textContent = `${game === "omaha" ? "POT LIMIT OMAHA" : game === "draw" ? "FIVE CARD DRAW" : "NO LIMIT HOLD'EM"} · ${fmt(t.sb)}/${fmt(t.bb)}`;
  $("felt").dataset.game = game;
  const sub = document.querySelector(".brand-sub");
  if (sub && sub.textContent !== GAMES[game].name) { sub.textContent = GAMES[game].name; document.title = GAMES[game].name + " Table"; }

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
    const vote = h && h.ritPending && h.ritVotes && String(i) in h.ritVotes ? h.ritVotes[i] : undefined;
    tag.className = "tag" + (won ? " win" : mucked ? " mucked" : vote !== undefined ? " vote" : p && p.allIn && h.street !== "done" ? " allin" : "");
    tag.textContent = !s ? "" : won ? `Wins ${fmt(won.amount)}` : mucked ? "Mucked"
      : vote === null ? "Deciding…" : vote === true ? "Twice ✓" : vote === false ? "Once" : p && p.folded ? "Folded" : p && p.allIn && h.street !== "done" ? "All in" : s.sittingOut ? "Sitting out" : s.stack === 0 && !p ? "Out of chips" : i === me ? "You" : view.players[i]?.styleLabel || "";
    const pic = el.querySelector(".pic"), av = s ? avatarOf(s) : "";
    if (pic.dataset.av !== av) { pic.dataset.av = av; pic.innerHTML = av ? avatarSvg(av, s.name) : ""; }
    const holes = el.querySelector(".holes");
    if (p && !p.folded && !mucked && i !== me) fresh[i] = syncCards(holes, p.hole || [], { faceDown: holeN, highlight: winCards && p.hole ? winCards : null });
    else syncCards(holes, []);
    el.querySelector(".hand-name").textContent = h && h.street === "done" && h.handNames[i] ? h.handNames[i] : "";
    betEls[i].textContent = p && p.bet ? fmt(p.bet) : "";
  }
  const db = $("dealerBtn");
  db.hidden = t.button < 0 || !t.seats[t.button];
  if (!db.hidden) place(db, geometry((t.button - Math.max(me, 0) + n) % n, n).dealer);

  // my cards
  const myP = h && me >= 0 ? h.players[me] : null;
  if (me >= 0) fresh[me] = syncCards($("myCards"), myP && myP.hole ? myP.hole : [], { slots: holeN, highlight: winCards });
  $("myCards").dataset.n = holeN;
  markDrawPicks();
  $("myHandName").textContent = myP && myP.hole ? handLabel(game, myP.hole, h.board) : "";
  $("myPos").textContent = me < 0 ? "Watching" : !h ? "" : positionName(me);

  renderWinner();

  // card movement: hole cards round the table on a new hand, then each street's board cards
  let after = 0;
  if (animate && newHand) after = animateDeal(fresh);
  const boardCards = [...boardDealt, ...board2Dealt];
  if (animate && boardCards.length) {
    const from = dealOrigin();
    boardCards.forEach((el, k) => { fly(el, after + k * 150, from, true); play("flip", (after + k * 150 + FLY_MS) / 1000); });
  }
  if (h && h.street === "done") saveHand(view);
  const lastNo = view.sessions && view.sessions.length ? view.sessions[view.sessions.length - 1].no : 0;
  if (lastSessionNo !== undefined && lastNo > lastSessionNo) openLedger(true);
  lastSessionNo = lastNo;
  renderChat(animate);
  animOk = true;

  renderActions();
  renderPlayers();
  renderOdds();
  tickClock();
  $("tgShow").checked = me >= 0 && t.seats[me] ? !!t.seats[me].show : myShow();
  $("coachSwitch").hidden = view.mode !== "ai";
  $("tgCoach").checked = !!view.coachOn;
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
  if (animOk) play(h.results.some(r => r.seat === view.me) ? "win" : "pot", 0.6);
  const groups = h.runs ? h.runs.map((run, i) => ({ label: `Run ${i + 1}`, results: run.results })) : [{ label: "", results: h.results }];
  let rows = 0;
  for (const g of groups) {
  if (g.label) box.insertAdjacentHTML("beforeend", `<div class="wb-run">${g.label}</div>`);
  for (const r of g.results) {
    rows++;
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
  }
  box.classList.toggle("multi", rows > 1);
  if (view.coach && view.coach.no === h.no) {
    const c = document.createElement("div");
    c.className = "wb-coach"; c.textContent = view.coach.text;
    box.appendChild(c);
  }
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
  const game = t.game || "holdem";
  // Five Card Draw: the odds follow the cards you've picked to swap (or a sensible swap until you pick)
  const preDraw = game === "draw" && (h.street === "first" || (h.street === "draw" && myP.drawn == null));
  const discard = preDraw ? (h.street === "draw" && h.toAct === me ? [...drawPicks] : drawChoice(myP.hole)) : null;
  const key = `${h.no}|${myP.hole.join("")}|${h.board.join("")}|${opponents}|${discard ? discard.join("") : "-"}`;
  if (key !== oddsKey) {
    oddsKey = key; oddsResult = null;
    clearTimeout(oddsTimer);
    // work it out just after this frame so dealing and buttons stay smooth
    oddsTimer = setTimeout(() => {
      if (oddsKey !== key) return;
      const runs = game === "omaha" ? (opponents >= 4 ? 500 : 900) : game === "draw" ? 1500 : opponents >= 4 ? 3000 : 5000;
      oddsResult = handOdds(myP.hole, h.board, opponents, runs, game, { discard, oppDraw: preDraw || (game === "draw" && h.street === "draw") });
      oddsResult.game = game; oddsResult.drawing = !!discard;
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
  const g = r.game || "holdem";
  const made = g === "draw" ? evaluate(hole).cat : g === "omaha" ? (board.length >= 3 ? evaluateFor("omaha", hole, board).cat : 0)
    : board.length >= 3 ? evaluateFn([...hole, ...board]).cat : hole[0][0] === hole[1][0] ? 1 : 0;
  const by = g === "draw" ? (r.drawing ? "after the draw" : "now") : "by the river";
  // strong hand: three of a kind or better
  const haveStrong = made >= STRONG_FROM && !(g === "draw" && r.drawing && r.strong < 0.999);
  const nextLabel = board.length === 0 ? "on the flop" : board.length === 3 ? "on the turn" : "on the river";
  $("oddsStrong").innerHTML = haveStrong
    ? `<div class="big"><b>✓</b><span>you have a strong hand</span></div><small>three of a kind or better</small>`
    : `<div class="big"><b>${pct(r.strong)}</b><span>strong hand ${by}</span></div>
       <div class="meter-bar" aria-hidden="true"><i style="width:${r.strong * 100}%"></i></div>
       <small>three of a kind or better${r.nextStrong == null ? "" : ` · ${pct(r.nextStrong)} ${nextLabel}`}</small>`;
  const rows = CATEGORY.map((name, c) => ({ name, c, p: r.cats[c] })).filter(x => x.c > 0 && (x.p >= .001 || x.c === made)).reverse();
  $("oddsCats").innerHTML = `<small>${(g !== "draw" && board.length === 5) || (g === "draw" && !r.drawing) ? "Your final hand" : `Chance to end up with, ${by}`}</small>` + rows.map(x =>
    `<div class="oc${x.c === made ? " made" : ""}"><span>${x.name}</span><span class="meter-bar" aria-hidden="true"><i style="width:${x.p * 100}%"></i></span><b>${pct(x.p)}</b></div>`).join("");
}
for (const k of ODDS_PARTS) $(ODDS_UI[k].toggle).onclick = () => { const p = oddsPrefs(); p[k] = p[k] === false; store.set("pk-odds", p); renderOdds(); };

const evaluateFn = evaluate;
const bestName = (hole, board) => evaluateFn([...hole, ...board]).name;
function handLabel(game, hole, board) {
  if (game === "draw") return evaluate(hole).name;
  if (game === "omaha") {
    if (board.length >= 3) return evaluateFor("omaha", hole, board).name;
    const suits = {};
    hole.forEach(c => suits[c[1]] = (suits[c[1]] || 0) + 1);
    const pairsSuited = Object.values(suits).filter(n => n >= 2).length;
    const ranks = hole.map(c => rankText(c[0])).join(" ");
    return ranks + (pairsSuited >= 2 ? ", double-suited" : pairsSuited === 1 ? ", suited" : "");
  }
  return board.length >= 3 ? bestName(hole, board) : startingName(hole);
}
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

// ---------- five card draw: picking cards to swap ----------
let drawPicks = new Set(), drawPickHand = null;
function myDrawTurn() { const h = view && view.table.hand; return !!(h && h.legal && h.legal.draw); }
function markDrawPicks() {
  const h = view.table.hand;
  if (!h || h.no !== drawPickHand) { drawPicks = new Set(); drawPickHand = h ? h.no : null; }
  const on = myDrawTurn();
  $("myCards").classList.toggle("picking", on);
  [...$("myCards").children].forEach(el => el.classList.toggle("picked", on && drawPicks.has(el.dataset.code)));
}
$("myCards").addEventListener("click", e => {
  const el = e.target.closest(".card"); if (!el || !myDrawTurn() || !el.dataset.code) return;
  const c = el.dataset.code;
  drawPicks.has(c) ? drawPicks.delete(c) : drawPicks.add(c);
  markDrawPicks(); renderActions(); renderOdds();
});
$("btnDrawHint").onclick = () => {
  const me = view.table.hand.players[view.me];
  drawPicks = new Set(drawChoice(me.hole)); markDrawPicks(); renderActions(); renderOdds();
};
$("btnDraw").onclick = guard(async () => {
  const discard = [...drawPicks];
  drawPicks = new Set();
  await ctrl.act({ type: "draw", discard });
});

function renderActions() {
  const t = view.table, h = t.hand, me = view.me, legal = h && h.legal;
  const drawing = !!(legal && legal.draw);
  $("drawRow").hidden = !drawing;
  if (drawing) {
    const hole = h.players[me].hole, picks = [...drawPicks], ok = drawAllowed(hole, picks);
    $("btnDraw").textContent = !picks.length ? "Keep all (stand pat)" : ok ? `Swap ${picks.length} card${picks.length === 1 ? "" : "s"}` : "Too many cards";
    $("btnDraw").disabled = !ok;
  }
  const myTurn = !!(legal && h.street !== "done" && !drawing);
  if (!myTurn) raiseOpen = false;
  $("actRow").hidden = !myTurn;
  // phones: the slider opens only after tapping Raise, so the buttons never move
  const sliderUp = !compact.matches || raiseOpen;
  $("raiseBox").hidden = !(myTurn && legal.raise && sliderUp);
  const between = !h || h.street === "done";
  const mine = me >= 0 ? t.seats[me] : null;
  // run it twice: players still in the pot vote
  const myVote = h && h.ritPending && me >= 0 && h.ritVotes && String(me) in h.ritVotes ? h.ritVotes[me] : undefined;
  $("ritRow").hidden = myVote !== null;
  // watchers can take a free seat
  const freeSeat = t.seats.some(x => !x);
  $("sitRow").hidden = !(view.watching && freeSeat);
  if (view.watching && !$("sitInput").value) $("sitInput").value = (view.minBuyIn / 100).toString();
  $("btnPause").hidden = !(view.mode === "online" && view.isHost && view.started);
  const online = view.mode === "online";
  $("btnEndSession").hidden = !(online && view.isHost && view.started && !view.ending);
  if (!endArmed) $("btnEndSession").textContent = "End session & settle up";
  $("btnLedger").hidden = !(online && (view.sessions.length || view.ledger.length));
  $("btnHostLink").hidden = !(online && view.isHost && view.hostKey);
  if (!closeArmed) $("btnClose").textContent = "Close room for good";
  $("btnStart").textContent = online && view.sessions && view.sessions.length ? `Start session ${view.sessionNo}` : "Start the game";
  $("btnRebuy").textContent = online && !view.started ? "Buy in" : "Buy back in";
  $("btnPause").textContent = view.paused ? "Resume table" : "Pause table";
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
  $("btnLeave").textContent = leaveArmed ? "Tap again to leave" : view.watching ? "Stop watching" : view.mode === "ai" ? "Leave and see results" : "Cash out and leave";
  $("toolsNote").textContent = view.mode === "online" ? (view.isHost
    ? "You're the host. Ending the session settles up and keeps the room, so the same code works next time. Keep your host link to run the room from another device."
    : "Cashing out records what you leave with. When the host ends the session, everyone settles up and the room stays open for next time.") : "";

  if (myTurn) {
    const turnKey = `${h.no}:${h.log.length}`;
    if (turnKey !== lastTurnKey) { lastTurnKey = turnKey; if (animOk) play("turn"); }
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
    const allBtn = $("presets").querySelector('[data-p="all"]');
    if (allBtn) allBtn.textContent = (t.game === "omaha") ? "Max (pot)" : "All in";
  }
  $("status").textContent = statusText();
}

function statusText() {
  const t = view.table, h = t.hand, me = view.me;
  if (view.mode === "online" && !view.started && view.sessions && view.sessions.length) {
    const ready = t.seats.filter(x => x && x.stack > 0).length, n = view.sessionNo;
    const mine = me >= 0 && t.seats[me] && t.seats[me].stack === 0 ? `Buy in for session ${n} (at least ${fmt(view.minBuyIn)}). ` : "";
    return `Session ${n - 1} is settled.${" "}${mine}${view.isHost ? `Start session ${n} when at least two players have bought in (${ready} so far).` : `Waiting for the host to start session ${n}. ${ready} bought in.`}`;
  }
  if (view.mode === "online" && !view.started) {
    const seated = t.seats.filter(Boolean).length;
    return view.isHost ? `${seated} of ${t.maxSeats} seats taken. Start the game when everyone's in (at least 2 players).` : `Waiting for the host to start the game. ${seated} players seated.`;
  }
  if (view.closing) return "The host is closing the room. Final results come up when this hand ends.";
  if (view.ending) return "The host is ending the session. Everyone settles up when this hand ends.";
  if (view.paused) return h && h.street !== "done" ? "The host paused the table. Finish this hand at your own pace; the clock is stopped." : "The host paused the table. No new hands until it's resumed.";
  if (h && h.ritPending) {
    const left = Object.entries(h.ritVotes).filter(([, v]) => v === null).map(([i]) => who(+i));
    const secs = view.deadline ? ` (${Math.max(0, Math.ceil((view.deadline - Date.now()) / 1000))}s)` : "";
    const mine = h.ritVotes[me] === null;
    return `All in! Run it twice?${secs} ${mine ? "Everyone in the pot has to agree." : "Waiting for " + left.join(", ") + "."}`;
  }
  if (view.watching && (!h || h.street === "done")) return "You're watching. " + (view.table.seats.some(x => !x) ? "Take a seat whenever you like." : "The table is full.");
  if (view.leaving) return "You've cashed out. You'll leave the table when this hand ends.";
  if (view.waitingForRebuy) return `You're out of chips. Buy back in (at least ${fmt(view.minBuyIn)}) or leave the table.`;
  if (!h) return view.nextHandAt ? "Shuffling up…" : "Waiting for players.";
  if (h.street === "done") {
    const lines = (h.results || []).map(winLine);
    const wait = view.nextHandAt ? ` Next hand in ${Math.max(0, Math.ceil((view.nextHandAt - Date.now()) / 1000))}s.`
      : view.mode === "online" ? " Waiting for another player to sit down, sit back in or buy back in." : "";
    return lines.join(". ") + "." + wait;
  }
  if (h.legal && h.legal.draw) return "Your draw: tap the cards you want to swap (up to 3, or 4 if you keep an ace).";
  if (h.street === "draw" && h.toAct >= 0) return `${seatName(h.toAct)} is choosing cards to swap…`;
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
    row.children[0].lastChild.textContent = s.name + (i === view.me ? " (you)" : "") + (view.hostSeat === i ? " · host" : "") + (p.isBot ? ` · ${(p.styleLabel || "bot").toLowerCase()}` : "");
    row.children[1].textContent = `in ${fmt(p.buyIn)}`;
    row.children[2].textContent = fmt(net, true);
    box.appendChild(row);
  });
  if (view.watchers && view.watchers.length) {
    const w = document.createElement("div");
    w.className = "pl watchers";
    w.textContent = `Watching: ${view.watchers.join(", ")}`;
    box.appendChild(w);
  }
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
  if ((h && h.street === "done" && view.nextHandAt) || (h && h.ritPending)) $("status").textContent = statusText();
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
$("btnRitYes").onclick = guard(() => ctrl.voteRunTwice(true));
$("btnRitNo").onclick = guard(() => ctrl.voteRunTwice(false));
$("btnPause").onclick = guard(() => ctrl.setPause(!view.paused));
$("btnSit").onclick = guard(async () => {
  const c = toCents($("sitInput").value);
  if (!(c >= view.minBuyIn)) throw new Error(`The minimum buy-in is ${fmt(view.minBuyIn)}.`);
  await ctrl.sit({ buyIn: c, avatar: myAvatar(), show: myShow() });
  $("sitInput").value = "";
});
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
let leaveArmed = 0, closeArmed = 0, endArmed = 0;
$("btnEndSession").onclick = guard(async () => {
  if (!endArmed) { endArmed = setTimeout(() => { endArmed = 0; render(); }, 4000); $("btnEndSession").textContent = "Tap again to end the session"; return; }
  clearTimeout(endArmed); endArmed = 0;
  await ctrl.endSession();
});
$("btnLedger").onclick = () => openLedger(false);
$("btnHostLink").onclick = async () => {
  const url = `${location.origin}${location.pathname}?code=${view.code}&host=${view.hostKey}#online`;
  try { await navigator.clipboard.writeText(url); $("btnHostLink").textContent = "Host link copied. Keep it private"; }
  catch { $("btnHostLink").textContent = url; }
  setTimeout(() => $("btnHostLink").textContent = "Copy host link", 3500);
};
$("btnLeave").onclick = guard(async () => {
  if (!leaveArmed) { leaveArmed = setTimeout(() => { leaveArmed = 0; render(); }, 4000); render(); return; }
  clearTimeout(leaveArmed); leaveArmed = 0;
  if (view.watching) { await ctrl.leave().catch(() => {}); return backToLobby(); }
  await ctrl.leave();
});
$("btnClose").onclick = guard(async () => {
  if (!closeArmed) { closeArmed = setTimeout(() => { closeArmed = 0; $("btnClose").textContent = "Close table for everyone"; }, 4000); $("btnClose").textContent = "Tap again to close the table"; return; }
  clearTimeout(closeArmed); closeArmed = 0;
  await ctrl.close();
});
document.addEventListener("keydown", e => {
  if (!view || $("lookDlg").open || $("replayDlg").open || $("ledgerDlg").open || e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  const legal = view.table?.hand?.legal; if (!legal) return;
  const k = e.key.toLowerCase();
  if (k === "f") $("btnFold").click();
  else if (k === "c") $("btnCall").click();
  else if (k === "r" && legal.raise) $("btnRaise").click();
});

// ---------- sounds ----------
function actionSound(type) {
  if (type === "fold") return "fold";
  if (type === "check") return "check";
  if (type.endsWith("all-in")) return "allin";
  if (type.startsWith("call") || type.startsWith("bet") || type.startsWith("raise")) return "chips";
  return "";
}
function drawSoundBtn() {
  $("btnSound").textContent = soundOn() ? "🔊" : "🔇";
  $("btnSound").setAttribute("aria-label", soundOn() ? "Sound on. Tap to mute" : "Sound off. Tap to turn on");
}
$("btnSound").onclick = () => { setSound(!soundOn()); drawSoundBtn(); play("chips"); };
drawSoundBtn();

// ---------- chat and reactions (tables with friends) ----------
let lastChatN = null, lastTurnKey = "";
function renderChat(animate) {
  const online = view.mode === "online";
  $("chatPanel").hidden = !online;
  $("reactWrap").hidden = !online;
  if (!online) return;
  const chat = view.chat || [];
  const newest = chat.length ? chat[chat.length - 1].n : 0;
  if (lastChatN === null) lastChatN = newest;          // don't replay old messages when you open the table
  const fresh = chat.filter(c => c.n > lastChatN);
  lastChatN = Math.max(lastChatN, newest);
  // the panel
  const box = $("chatLog"), atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  box.innerHTML = "";
  if (!chat.length) box.innerHTML = '<div class="note">No messages yet. Say hi, or send a reaction.</div>';
  chat.forEach(c => {
    const d = document.createElement("div");
    d.className = "chat-line" + (c.kind === "react" ? " react" : "");
    d.innerHTML = "<b></b> <span></span>";
    d.firstChild.textContent = c.name + (c.seat < 0 ? " (watching)" : "");
    d.lastChild.textContent = c.kind === "react" ? c.emoji : c.text;
    box.appendChild(d);
  });
  if (atBottom || fresh.length) box.scrollTop = box.scrollHeight;
  // bubbles over the seats for what just came in
  if (!animate) return;
  fresh.forEach((c, k) => {
    play(c.kind === "react" ? "react" : "chat", k * 0.1);
    const seatEl = c.seat >= 0 ? seatEls[c.seat] : null;
    if (!seatEl) return;
    if (c.kind === "react") {
      const fl = document.createElement("div");
      fl.className = "react-float"; fl.textContent = c.emoji;
      seatEl.appendChild(fl);
      setTimeout(() => fl.remove(), 2200);
    } else {
      const b = seatEl.querySelector(".bubble");
      b.textContent = c.text; b.hidden = false;
      clearTimeout(b._t); b._t = setTimeout(() => { b.hidden = true; }, 4500);
    }
  });
}
// reaction buttons: one set in the chat panel, one in a pop-up on the table
for (const box of [$("chatReacts"), $("reactPop")]) {
  REACTIONS.forEach(e => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "react-btn"; b.textContent = e; b.setAttribute("aria-label", "Send " + e);
    b.onclick = guard(async () => { $("reactPop").hidden = true; $("btnReact").setAttribute("aria-expanded", "false"); await ctrl.react(e); });
    box.appendChild(b);
  });
}
$("btnReact").onclick = () => {
  const open = $("reactPop").hidden;
  $("reactPop").hidden = !open; $("btnReact").setAttribute("aria-expanded", String(open));
};
$("chatForm").addEventListener("submit", guard(async e => {
  e.preventDefault();
  const text = $("chatInput").value.trim();
  if (!text) return;
  await ctrl.chat(text);
  $("chatInput").value = "";
}));

// ---------- hand replay ----------
setupReplay();
$("log").addEventListener("click", e => {
  const b = e.target.closest(".replay-btn"); if (!b) return;
  openReplay(+b.dataset.no, {
    cardEl, fmt, avatarSvg, avatarFor: avatarOf,
    describeFor: (e, r) => describeEntry(e, i => i === r.me ? "You" : r.seats[i]?.name || "Seat " + (i + 1), (i, base, third = base + "s") => i === r.me ? base : third),
    shortAction: e => describeEntry(e, () => "", (i, base, third = base + "s") => third).trim()
  });
});

// ---------- room ledger: each session's result and the running totals ----------
let lastSessionNo;
function payList(box, payments, empty) {
  box.innerHTML = "";
  if (!payments.length) { box.innerHTML = `<li>${empty}</li>`; return; }
  payments.forEach(p => { const li = document.createElement("li"); li.textContent = `${p.from} pays ${p.to} ${fmt(p.amount)}`; box.appendChild(li); });
}
const isMe = name => !!view.myName && name === view.myName;
function openLedger(justEnded) {
  const sessions = view.sessions || [], latest = sessions[sessions.length - 1];
  $("ldTitle").textContent = justEnded && latest ? `Session ${latest.no} is over` : "Room ledger";
  $("ldIntro").textContent = `Table ${view.code}. Pretend dollars only: settle up between yourselves. The room stays open, so the same code works next time.`;
  // the latest session
  $("ldLatest").hidden = !latest;
  if (latest) {
    $("ldLatestTitle").textContent = `Session ${latest.no} · ${latest.hands} hand${latest.hands === 1 ? "" : "s"}`;
    const body = $("ldLatestRows"); body.innerHTML = "";
    latest.rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${miniAv(avatarOf(r))}<span></span></td><td></td><td></td><td></td>`;
      tr.children[0].lastChild.textContent = r.name + (isMe(r.name) ? " (you)" : "");
      tr.children[1].textContent = fmt(r.buyIn); tr.children[2].textContent = fmt(r.cashOut);
      tr.children[3].textContent = fmt(r.net, true); tr.children[3].className = netClass(r.net);
      body.appendChild(tr);
    });
    payList($("ldLatestPay"), latest.payments, "Nobody owes anybody for this session.");
  }
  // running totals and one list of payments that squares everything
  const led = view.ledger || [], tb = $("ldTotalRows"); tb.innerHTML = "";
  if (!led.length) tb.innerHTML = '<tr><td colspan="3">Nothing owed: totals start again from the next session.</td></tr>';
  led.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td></td><td></td><td></td>";
    tr.children[0].textContent = r.name + (isMe(r.name) ? " (you)" : "");
    tr.children[1].textContent = r.sessions; tr.children[2].textContent = fmt(r.net, true); tr.children[2].className = netClass(r.net);
    tb.appendChild(tr);
  });
  const all = settle(led.map(r => ({ name: r.name, buyIn: 0, cashOut: r.net })));
  payList($("ldTotalPay"), all.payments, "Everyone is square.");
  $("ldPaidNote").textContent = view.ledgerResetAt ? `Totals since ${new Date(view.ledgerResetAt).toLocaleDateString()}.` : "";
  // history
  const hist = $("ldHistory"); hist.innerHTML = "";
  if (!sessions.length) hist.innerHTML = '<p class="note">No sessions finished yet.</p>';
  sessions.slice().reverse().forEach(x => {
    const d = document.createElement("div"); d.className = "ld-session";
    d.innerHTML = "<b></b><span></span>";
    d.firstChild.textContent = `Session ${x.no} · ${new Date(x.endedAt).toLocaleDateString()} · ${x.hands} hands`;
    d.lastChild.textContent = x.rows.map(r => `${r.name} ${fmt(r.net, true)}`).join(" · ");
    hist.appendChild(d);
  });
  $("ldMarkPaid").hidden = !(view.isHost && led.some(r => r.net !== 0));
  $("ldMarkPaid").textContent = "Everyone's paid: start totals again";
  if (!$("ledgerDlg").open) $("ledgerDlg").showModal();
  if (justEnded && animOk) play("pot");
}
let paidArmed = 0;
$("ldMarkPaid").onclick = guard(async () => {
  if (!paidArmed) { paidArmed = setTimeout(() => { paidArmed = 0; $("ldMarkPaid").textContent = "Everyone's paid: start totals again"; }, 4000); $("ldMarkPaid").textContent = "Tap again: totals go back to zero"; return; }
  clearTimeout(paidArmed); paidArmed = 0;
  await ctrl.markPaid();
  openLedger(false);
});
$("ldCopy").onclick = async () => {
  const latest = (view.sessions || []).slice(-1)[0], led = view.ledger || [];
  const all = settle(led.map(r => ({ name: r.name, buyIn: 0, cashOut: r.net })));
  const lines = [`Texas Hold'em, table ${view.code}`];
  if (latest) lines.push(`Session ${latest.no}:`, ...latest.rows.map(r => `  ${r.name}: ${fmt(r.net, true)}`), ...latest.payments.map(p => `  ${p.from} pays ${p.to} ${fmt(p.amount)}`));
  if (led.length) lines.push("All sessions:", ...led.map(r => `  ${r.name}: ${fmt(r.net, true)} (${r.sessions} sessions)`), "To settle everything:", ...all.payments.map(p => `  ${p.from} pays ${p.to} ${fmt(p.amount)}`));
  try { await navigator.clipboard.writeText(lines.join("\n")); $("ldCopy").textContent = "Copied"; } catch { $("ldCopy").textContent = "Copy failed"; }
  setTimeout(() => $("ldCopy").textContent = "Copy results", 2000);
};

// ---------- summary ----------
function renderSummary() {
  showScreen("scrSummary");
  const s = view.summary;
  if (!s) return;
  $("sumTitle").textContent = view.mode === "ai" ? "Session over" : view.tableClosed ? "Room closed" : "You cashed out";
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
  // a room closed after several sessions: the running totals too
  if (s.ledger && s.ledger.some(r => r.sessions > 1)) {
    const all = settle(s.ledger.map(r => ({ name: r.name, buyIn: 0, cashOut: r.net })));
    const head = document.createElement("li"); head.className = "pay-head";
    head.textContent = "All sessions in this room: " + s.ledger.map(r => `${r.name} ${fmt(r.net, true)}`).join(" · ");
    pay.appendChild(head);
    all.payments.forEach(p => { const li = document.createElement("li"); li.textContent = `To settle everything: ${p.from} pays ${p.to} ${fmt(p.amount)}`; pay.appendChild(li); });
  }
}
$("btnSumDone").onclick = () => backToLobby();
function backToLobby() {
  if (ctrl && ctrl.destroy) ctrl.destroy();
  if (unsub) unsub();
  ctrl = null; view = null; unsub = null;
  $("aiResume").hidden = !savedAiTable();
  initSetup();
}
$("btnSumCopy").onclick = async () => {
  const s = view.summary;
  const text = ["Texas Hold'em results", ...s.rows.map(r => `${r.name}: in ${fmt(r.buyIn)}, out ${r.cashOut == null ? "-" : fmt(r.cashOut)}, ${r.cashOut == null ? "" : fmt(r.net, true)}`), "", ...s.payments.map(p => `${p.from} pays ${p.to} ${fmt(p.amount)}`)].join("\n");
  try { await navigator.clipboard.writeText(text); $("btnSumCopy").textContent = "Copied"; } catch { $("btnSumCopy").textContent = "Copy failed"; }
  setTimeout(() => $("btnSumCopy").textContent = "Copy results", 2000);
};

window.addEventListener("resize", () => render());
initSetup();
