// Mahjong screens. Works with LocalMahjong (bots) or OnlineMahjong (friends).
import * as M from "../supabase/functions/_shared/mahjong-engine.js";
import { mahjongMove } from "../supabase/functions/_shared/mahjong-bot.js";
import { tileSvg } from "./tiles.js";
import { settle } from "../supabase/functions/_shared/poker-engine.js";
import { REACTIONS } from "../supabase/functions/_shared/poker-room.js";
import { LocalMahjong, savedMahjongGame } from "./local.js";
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
  if (f.reason !== "win" || isBot(f.winner) || isBot(seat)) return 0;
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
  document.body.classList.toggle("at-mahjong", id === "scrTable");
}
const sizeVar = (el, name) => new ResizeObserver(() => document.documentElement.style.setProperty(name, el.offsetHeight + "px")).observe(el);
sizeVar(document.querySelector(".bar"), "--bar-h");
(window.CR_STEADY || sizeVar)($("crail"), "--rail-h"); // keeps its tallest height, so the table stops resizing each turn

let ctrl = null, unsub = null, view = null;
function attach(controller) {
  if (unsub) unsub();
  if (ctrl && ctrl !== controller && ctrl.destroy) ctrl.destroy();
  ctrl = controller; selected = null; hintTile = null; lastLog = null; lastGame = null; lastChatN = null; lastTurn = null; bannerFor = null;
  buildSeats();
  showScreen("scrTable");
  unsub = ctrl.subscribe(v => { view = v; render(); });
}
function backToLobbyStop() { try { stopIntro(); } catch {} }
function backToLobby() {
  backToLobbyStop();
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
  attach(LocalMahjong.create({ name, avatar: myAvatar(), skill: segValue("aiSkill"), minFaan: +segValue("aiMin"), pointValue }));
});
$("aiResume").addEventListener("click", () => { const s = savedMahjongGame(); if (s) attach(new LocalMahjong(s)); });

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
    const { OnlineMahjong } = await online();
    attach(await OnlineMahjong.create({ name, avatar: myAvatar(), pointValue, actSeconds: +$("crTime").value, skill: segValue("crSkill"), minFaan: +segValue("crMin") }));
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
    const { OnlineMahjong } = await online();
    attach(await OnlineMahjong.join({ code, name, avatar: myAvatar() }));
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
    $("jnRules").textContent = !r ? "No open room with that code." : r.game !== "mahjong" ? (r.game === "capsa" ? "That code is a Capsa room. Join it from the Capsa page." : "That code is a poker table. Join it from the poker page.") : `${r.minFaan ? "3 faan to win" : "Any hand wins"} · ${fmt(r.pointValue)} a point · ${r.humans} of 4 seats taken by people`;
  } catch {}
});
$("btnRejoin").addEventListener("click", async () => {
  try { const { OnlineMahjong } = await online(); attach(await OnlineMahjong.resume()); }
  catch (err) { $("jnErr").textContent = err.message; $("btnRejoin").hidden = true; }
});
async function openAsHost(code, hostKey) {
  window.history.replaceState(null, "", location.pathname + "#online");
  route(); showScreen("scrSetup");
  try { const { OnlineMahjong } = await online(); attach(await OnlineMahjong.claim({ code, hostKey })); }
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
  $("aiResume").hidden = !savedMahjongGame();
  drawLookButtons();
  if (params.get("code") && params.get("host") && onlineEnabled) return openAsHost(params.get("code").toUpperCase().slice(0, 6), params.get("host"));
  if (params.get("code")) { location.hash = "#online"; $("jnCode").value = params.get("code").toUpperCase().slice(0, 6); $("jnCode").dispatchEvent(new Event("change")); }
  route();
  if (onlineEnabled) online().then(m => { $("btnRejoin").hidden = !m.hasSavedMahjongSeat(); }).catch(() => {});
  showScreen("scrSetup");
}

// ---------- the table ----------
let seatEls = [], pondEls = [];
function buildSeats() {
  seatEls.forEach(e => e.remove()); pondEls.forEach(e => e.remove());
  seatEls = [1, 2, 3].map(pos => {
    const el = document.createElement("div");
    el.className = "cseat"; el.dataset.pos = pos;
    el.innerHTML = `<div class="pic"></div><div class="plate"><div class="name"></div><div class="tag"></div><div class="timer"></div></div><div class="hidden-tiles"></div><div class="melds"></div><div class="flowers tiles"></div><div class="bubble" hidden></div>`;
    $("ctable").appendChild(el);
    return el;
  });
  pondEls = [0, 1, 2, 3].map(pos => {
    const el = document.createElement("div");
    el.className = "pond"; el.dataset.pos = pos; el.setAttribute("aria-label", "Discards");
    $("ring").appendChild(el);
    return el;
  });
  // 72 stacks: ring index i is side i / 18 (0 = your wall, then clockwise: left, across, right), stack i % 18 from its owner's right
  ringStacks = [];
  $("ring").querySelectorAll(".side").forEach(side => {
    side.innerHTML = "";
    for (let j = 0; j < 18; j++) { const st = document.createElement("div"); st.className = "stack"; side.appendChild(st); ringStacks.push(st); }
  });
  introFor = null; animCount = null;
}
let ringStacks = [];

// ---------- the wall ----------
// The dice pick the break: count the players from the dealer, then that many stacks from the right of their wall.
// Tiles are drawn from the break going clockwise; kong and flower replacements come off the other end.
function breakIndex(g) {
  const t = g.dice ? g.dice.reduce((a, b) => a + b, 0) : 3;
  const owner = (g.dealer + t - 1) % 4, pos = posOf(owner), k = (4 - pos) % 4;
  return k * 18 + Math.min(17, t);
}
const frontStack = (g, d) => ringStacks[(breakIndex(g) + d) % 72];
const backStack = (g, e) => ringStacks[(breakIndex(g) - 1 - e + 72 * 2) % 72];
function renderRing(g, front = g ? g.front : 0, back = g ? g.back : 0) {
  if (!ringStacks.length) return;
  ringStacks.forEach(st => st.className = "stack");
  if (!g) return;
  for (let d = 0; d < 72; d++) {
    const st = frontStack(g, d);
    if (d < Math.floor(front / 2)) st.classList.add("gone"); else if (d === Math.floor(front / 2) && front % 2) st.classList.add("half");
  }
  for (let e = 0; e < 72; e++) {
    const st = backStack(g, e);
    if (e < Math.floor(back / 2)) st.classList.add("gone"); else if (e === Math.floor(back / 2) && back % 2) st.classList.add("half");
  }
  if (!g.finished && front + back < 144) frontStack(g, Math.floor(front / 2)).classList.add("next");
}
const seatAt = pos => (view.me + pos) % 4;              // pos 0 = you, 1 = next (right), 2 = across, 3 = left
const posOf = seat => (seat - view.me + 4) % 4;
const nameAt = seat => seat === view.me ? "You" : view.seats[seat]?.name || "Seat " + (seat + 1);
const verb = (seat, base, third = base + "s") => seat === view.me ? base : third;
const WIND_CH = ["東", "南", "西", "北"];
const windOf = (g, seat) => (seat - g.dealer + 4) % 4;

let selected = null, hintTile = null, lastLog = null, lastGame = null, lastTurn = null, bannerFor = null;

function tileEl(code, cls = "") {
  const el = document.createElement("div");
  el.className = "tile" + (code ? "" : " back") + (cls ? " " + cls : "");
  if (code) { el.innerHTML = tileSvg(code); el.dataset.t = code; el.setAttribute("aria-label", M.tileName(code)); el.title = M.tileName(code); }
  return el;
}
function meldEl(m) {
  const box = document.createElement("div"); box.className = "meld";
  box.title = m.concealed ? "Concealed kong" : `${m.type[0].toUpperCase() + m.type.slice(1)}${m.from != null && view ? " from " + nameAt(m.from) : ""}`;
  m.tiles.forEach((t, i) => box.appendChild(tileEl(m.concealed && (i === 0 || i === 3) ? null : t)));
  return box;
}
// redraw a box only when what's in it changed
function fill(el, key, build) { if (el.dataset.key === key) return; el.dataset.key = key; el.innerHTML = ""; build(el); }

function render() {
  if (!view) return;
  if (view.ended && !view.summary) return backToLobby();
  if (view.ended) return renderSummary();
  const g = view.game, me = view.me;

  // header
  const myPts = view.seats[me] ? view.seats[me].points : 0;
  $("mGame").textContent = view.gameNo || "–";
  $("mRound").textContent = g ? `${M.WIND_NAMES[g.round]}` : "–";
  $("mSeat").textContent = g ? `${M.WIND_NAMES[windOf(g, me)]}${g.dealer === me ? " · dealer" : ""}` : "–";
  $("mPoints").textContent = signed(myPts);
  const myMoney = moneyPts(me) * view.pointValue;
  $("mMoney").textContent = fmt(myMoney, true);
  $("mMoney").className = netClass(myMoney);
  $("mCodeWrap").hidden = !view.code; $("mCode").textContent = view.code || "";

  // the middle: the wall, the round wind and the tiles left
  if (!introRunning) renderRing(g);
  $("cWind").textContent = g ? WIND_CH[g.round] : "";
  $("cWind").title = g ? `${M.WIND_NAMES[g.round]} round` : "";
  $("cWall").textContent = g ? `${g.wallLeft} tiles left` : "";

  // opponents
  [1, 2, 3].forEach((pos, k) => {
    const seat = seatAt(pos), el = seatEls[k], p = view.seats[seat] || {};
    const av = avatarOf(p), pic = el.querySelector(".pic");
    if (pic.dataset.av !== av) { pic.dataset.av = av; pic.innerHTML = avatarSvg(av, p.name || ""); }
    const nm = el.querySelector(".name");
    nm.textContent = (p.name || "Empty seat") + (p.bot && view.mode === "online" ? " (bot)" : "");
    if (g) { const w = document.createElement("span"); w.className = "dealer"; w.textContent = WIND_CH[windOf(g, seat)]; w.title = `${M.WIND_NAMES[windOf(g, seat)]} seat${seat === g.dealer ? " (dealer)" : ""}`; if (seat !== g.dealer) w.style.background = "rgba(255,255,255,.18)", w.style.color = "inherit"; nm.appendChild(w); }
    const fin = g && g.finished;
    const tag = el.querySelector(".tag");
    const deciding = g && g.waiting.includes(seat);
    tag.className = "tag" + (fin && fin.winner === seat ? " win" : fin && fin.from === seat ? " lose" : "");
    tag.textContent = fin ? (fin.winner === seat ? `Wins · ${fin.faan} faan` : fin.points[seat] ? signed(fin.points[seat]) + " pts" : "")
      : deciding ? "Deciding…" : g && g.turn === seat && g.phase === "discard" ? "Thinking…" : "";
    el.classList.toggle("acting", !!(g && !fin && ((g.turn === seat && g.phase === "discard") || deciding)));
    const n = g ? g.counts[seat] : 0;
    fill(el.querySelector(".hidden-tiles"), String(n) + (fin ? "f" : ""), box => {
      const shown = fin && g.hands ? g.hands[seat] : null;
      for (let i = 0; i < n; i++) box.appendChild(tileEl(shown ? shown[i] : null));
    });
    fill(el.querySelector(".melds"), g ? JSON.stringify(g.melds[seat]) : "", box => { if (g) g.melds[seat].forEach(m => box.appendChild(meldEl(m))); });
    fill(el.querySelector(".flowers"), g ? g.flowers[seat].join() : "", box => { if (g) g.flowers[seat].forEach(f => box.appendChild(tileEl(f))); });
  });

  // discards
  pondEls.forEach((el, pos) => {
    const seat = seatAt(pos);
    const d = g ? g.discards[seat] : [];
    const lastHere = g && g.last && g.last.by === seat && !g.finished;
    fill(el, JSON.stringify(d) + (lastHere ? "L" : ""), box => d.forEach((x, i) => box.appendChild(tileEl(x.t, (x.claimed ? "taken" : "") + (lastHere && i === d.length - 1 && !x.claimed ? " last" : "")))));
  });

  // your melds and flowers
  fill($("myMelds"), g ? JSON.stringify([g.melds[me], g.flowers[me]]) : "", box => {
    if (!g) return;
    g.melds[me].forEach(m => box.appendChild(meldEl(m)));
    if (g.flowers[me].length) { const f = document.createElement("div"); f.className = "flowers meld"; g.flowers[me].forEach(t => f.appendChild(tileEl(t))); box.appendChild(f); }
  });

  // your hand: sorted, the tile you just drew set apart on the right
  const hand = g && g.hand ? g.hand.slice() : [];
  const o = g ? g.options : null;
  const myTurn = !!(o && o.kind === "turn");
  let drawnAt = -1;
  if (myTurn && g.drawn && hand.includes(g.drawn)) { hand.splice(hand.lastIndexOf(g.drawn), 1); hand.push(g.drawn); drawnAt = hand.length - 1; }
  if (selected !== null && (selected >= hand.length || !myTurn)) selected = null;
  const hb = $("myHand");
  fill(hb, hand.join() + ":" + drawnAt, box => hand.forEach((t, i) => box.appendChild(tileEl(t, i === drawnAt ? "drawn" : ""))));
  [...hb.children].forEach((el, i) => { el.classList.toggle("sel", i === selected); el.classList.toggle("hint", !!hintTile && el.dataset.t === hintTile && myTurn); });
  hb.classList.toggle("off", !myTurn);

  // buttons on your turn
  $("actRow").hidden = !g || !!g.finished || !myTurn;
  if (myTurn) {
    $("btnDiscard").disabled = selected === null;
    $("btnDiscard").textContent = selected === null ? "Pick a tile to discard" : `Discard ${M.tileName(hand[selected])}`;
    $("btnWin").hidden = !o.win;
    $("btnWin").textContent = o.win ? `Mahjong! · ${o.win.faan} faan` : "Mahjong!";
    fill($("kongBtns"), o.kongs.join(), box => o.kongs.forEach(t => {
      const b = document.createElement("button"); b.className = "ghost"; b.dataset.kong = t;
      b.append("Kong "); b.appendChild(tileEl(t));
      box.appendChild(b);
    }));
  } else $("kongBtns").innerHTML = "", $("kongBtns").dataset.key = "";

  // claiming a discard (or robbing a kong)
  const claiming = !!(o && (o.kind === "claim" || o.kind === "rob"));
  $("claimRow").hidden = !claiming;
  fill($("claimRow"), claiming ? JSON.stringify(o) : "", box => {
    if (!claiming) return;
    const what = document.createElement("div"); what.className = "what";
    const from = o.kind === "rob" ? g.kong.seat : g.last.by;
    what.append(`${nameAt(from)} ${o.kind === "rob" ? "is adding" : "threw"}`); what.appendChild(tileEl(o.tile));
    box.appendChild(what);
    const btn = (label, cls, move, tiles = []) => {
      const b = document.createElement("button"); b.className = cls; b.append(label);
      tiles.forEach(t => b.appendChild(tileEl(t)));
      b.onclick = guard(() => sendMove(move));
      box.appendChild(b);
    };
    if (o.win) btn(`Mahjong! · ${o.win.faan} faan`, "win-btn", { type: "claim", claim: "win" });
    if (o.kong) btn("Kong", "primary", { type: "claim", claim: "kong" });
    if (o.pung) btn("Pung", "primary", { type: "claim", claim: "pung" });
    (o.chows || []).forEach(pair => btn("Chow", "primary", { type: "claim", claim: "chow", tiles: pair }, [...pair, o.tile].sort(M.byTile)));
    btn("Pass", "ghost", { type: "claim", claim: "pass" });
  });

  const fin = g && g.finished;
  $("betweenRow").hidden = !(fin || (view.mode === "online" && !view.started));
  $("btnNext").hidden = !(fin && view.mode === "ai");
  $("btnStart").hidden = !(view.mode === "online" && view.isHost && !view.started);
  $("btnStart").textContent = view.sessions && view.sessions.length ? `Start session ${view.sessionNo}` : "Start the game";
  $("btnHint").disabled = !myTurn;

  $("status").textContent = statusText(g);
  renderLog(g);
  renderScores();
  renderTools();
  renderBanner(g);
  renderChat();
  const lastNo = view.sessions && view.sessions.length ? view.sessions[view.sessions.length - 1].no : 0;
  if (lastSessionNo !== undefined && lastNo > lastSessionNo) openLedger();
  lastSessionNo = lastNo;
  sounds(g);
  animate(g);
  tickClock();
}

function statusText(g) {
  const me = view.me;
  if (view.mode === "online" && !view.started) {
    const humans = view.seats.filter(s => s && !s.bot).length;
    return view.closing ? "The host is closing the room." : view.isHost ? `${humans} of 4 seats taken by people. Start whenever you're ready: bots fill the empty seats.` : "Waiting for the host to start. Bots fill any empty seats.";
  }
  if (view.ending) return "The host is ending the session after this hand.";
  if (!g) return "Shuffling the tiles…";
  if (g.finished) {
    const f = g.finished;
    const left = view.nextGameAt ? ` Next hand in ${Math.max(0, Math.ceil((view.nextGameAt - Date.now()) / 1000))}s.` : "";
    if (f.reason === "draw") return "The wall ran out: a drawn hand. The dealer deals again." + left;
    return `${nameAt(f.winner)} ${verb(f.winner, "win")} with ${f.faan} faan${f.from < 0 ? ", self-drawn" : `, off ${f.from === me ? "your" : nameAt(f.from) + "'s"} discard`}.` + left;
  }
  const o = g.options;
  if (o && o.kind === "turn") {
    if (o.win) return `You can declare Mahjong (${o.win.faan} faan), or keep going and discard.`;
    return g.drawn ? "Your turn: pick a tile to throw away. Tap it twice to discard." : "You claimed the tile: now discard one.";
  }
  if (o && (o.kind === "claim" || o.kind === "rob")) return o.win ? "That tile completes your hand!" : "Claim the tile, or pass.";
  if (g.waiting.length) return g.waiting.length === 1 ? `${nameAt(g.waiting[0])} ${verb(g.waiting[0], "are", "is")} deciding whether to claim it…` : "Players are deciding whether to claim it…";
  return `${nameAt(g.turn)} ${g.turn === me ? "" : "is"} thinking…`;
}

function renderLog(g) {
  const box = $("log");
  if (!g) { box.innerHTML = ""; return; }
  const lines = [`Hand ${g.no} · ${M.WIND_NAMES[g.round]} round · ${nameAt(g.dealer)} ${verb(g.dealer, "deal")}`];
  for (const e of g.log) {
    if (e.type === "discard") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "throw")} ${M.tileName(e.tile)}`);
    else if (["pung", "kong", "chow"].includes(e.type)) lines.push(`${nameAt(e.seat)} ${verb(e.seat, e.type)} ${M.tileName(e.tile)} from ${nameAt(e.from)}`);
    else if (e.type === "concealed kong") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "declare")} a concealed kong`);
    else if (e.type === "add kong") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "add")} ${M.tileName(e.tile)} to a pung`);
    else if (e.type === "flower") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "draw")} ${M.tileName(e.tile)} and ${verb(e.seat, "replace")} it`);
    else if (e.type === "win") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "win")} on ${M.tileName(e.tile)} from ${nameAt(e.from)} · ${e.faan} faan`);
    else if (e.type === "self win") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "draw")} the winning tile · ${e.faan} faan`);
    else if (e.type === "wall empty") lines.push("The wall ran out: a drawn hand");
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
  note.textContent = (view.minFaan ? "3 faan to win · " : "Any hand wins · ") + `${fmt(view.pointValue)} a point · ${view.games ? view.games.length : 0} hands played` + (view.mode === "online" && view.seats.some(x => x && x.bot) ? " · points won or lost against bots don't count as money" : "");
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
    ? (view.isHost ? "You're the host. Ending the session settles up and keeps the room, so the same code works next time." : "If you leave mid-hand, a bot takes your seat.")
    : "Leaving ends the session: points turn into pretend dollars and everyone settles up.";
}

// ---------- end of a hand ----------
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
  head.querySelector(".wb-title").textContent = f.reason === "draw" ? "Drawn hand" : `${nameAt(f.winner)} ${verb(f.winner, "win")}!`;
  head.querySelector(".wb-hand").textContent = f.reason === "draw" ? "The wall ran out" : `${f.faan} faan · ${f.from < 0 ? "self-drawn" : "off " + (f.from === view.me ? "your" : nameAt(f.from) + "'s") + " discard"}`;
  box.appendChild(head);
  const res = document.createElement("div"); res.className = "mj-result";
  if (f.reason === "win") {
    const show = document.createElement("div"); show.className = "hand-show";
    g.melds[f.winner].forEach(m => show.appendChild(meldEl(m)));
    const h = document.createElement("div"); h.className = "meld"; const at = f.winHand.lastIndexOf(f.tile); f.winHand.forEach((t, i) => h.appendChild(tileEl(t, i === at ? "last" : ""))); show.appendChild(h);
    show.querySelectorAll(".tile").forEach((el, i) => el.style.setProperty("--i", i));
    res.appendChild(show);
    const fa = document.createElement("div"); fa.className = "faan";
    f.items.forEach(([name, n]) => { const s = document.createElement("span"); s.innerHTML = "<b></b> "; s.firstChild.textContent = n; s.append(name); fa.appendChild(s); });
    if (!f.items.length) fa.textContent = "A plain hand: no faan";
    res.appendChild(fa);
  }
  const table = document.createElement("table");
  f.points.forEach((pts, seat) => {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td></td><td></td><td></td>";
    tr.children[0].textContent = nameAt(seat);
    tr.children[1].textContent = `${signed(pts)} pts`; tr.children[1].className = netClass(pts);
    const gm = gameMoney(f, seat) * view.pointValue;
    tr.children[2].textContent = view.mode === "online" && isBot(seat) ? "–" : fmt(gm, true); tr.children[2].className = netClass(gm);
    table.appendChild(tr);
  });
  res.appendChild(table);
  box.appendChild(res);
  box.hidden = false;
  if (animOk()) sound(f.winner === view.me ? "win" : f.reason === "draw" ? "fold" : "pot", 0.2);
  if (renderedOnce && f.reason !== "draw") cue.sting(f.winner === view.me ? "win" : "lose");
}
$("winBanner").addEventListener("click", () => { if (bannerFor && !bannerFor.endsWith("hidden")) bannerFor += "-hidden"; $("winBanner").hidden = true; });

// ---------- motion and sound ----------
const calm = matchMedia("(prefers-reduced-motion: reduce)");
let renderedOnce = false;
const animOk = () => renderedOnce && !calm.matches && !document.hidden;
let introFor = null, introRunning = false, introTimers = [], animCount = null, animNo = null, prevFront = 0, prevBack = 0, lastDiscardRect = null;
const sleep = ms => new Promise(r => { introTimers.push(setTimeout(r, ms)); });

// Something moves from one place on screen to where it now sits.
function flyFrom(el, from, ms = 420) {
  if (!el || !from) return;
  const r = el.getBoundingClientRect();
  if (!r.width) return;
  const dx = from.left + from.width / 2 - (r.left + r.width / 2), dy = from.top + from.height / 2 - (r.top + r.height / 2);
  const sc = from.width ? Math.max(.35, Math.min(2.2, from.width / r.width)) : 1;
  el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: .5 }, { transform: "none", opacity: 1 }], { duration: ms, easing: "cubic-bezier(.2,.8,.3,1)" });
}
// A face-down tile travelling between two places (an opponent drawing from the wall).
function ghost(from, to, ms = 380) {
  if (!from || !to) return;
  const el = tileEl(null, "fly-tile");
  el.style.setProperty("--tw", "14px");
  el.style.left = from.left + "px"; el.style.top = from.top + "px";
  document.body.appendChild(el);
  const dx = to.left + to.width / 2 - (from.left + 7), dy = to.top + to.height / 2 - (from.top + 9);
  el.animate([{ transform: "none", opacity: .9 }, { transform: `translate(${dx}px, ${dy}px) scale(.8)`, opacity: 0 }], { duration: ms, easing: "ease-in" }).onfinish = () => el.remove();
  setTimeout(() => el.remove(), ms + 400);               // in case the animation never finishes (a hidden tab)
}
const seatBox = seat => seat === view.me ? $("myHand").getBoundingClientRect() : seatEls[posOf(seat) - 1].querySelector(".pic").getBoundingClientRect();
const pondOf = seat => pondEls[posOf(seat)];

// New moves since the last picture: discards fly to the pile, draws come off the wall, claims jump into melds.
function animate(g) {
  if (!g) { animCount = null; return; }
  const fresh = animNo === g.no && animCount !== null ? g.logCount - animCount : 0;
  const pf = prevFront, pb = prevBack;
  animNo = g.no; animCount = g.logCount; prevFront = g.front; prevBack = g.back;
  maybeIntro(g);
  if (!animOk() || introRunning || fresh <= 0 || fresh > 8) { lastDiscardRect = null; return; }
  let front = pf, back = pb;
  for (const e of g.log.slice(g.log.length - fresh)) {
    if (e.type === "discard") {
      const tile = pondOf(e.seat).lastElementChild;
      flyFrom(tile, e.seat === view.me && lastDiscardRect ? lastDiscardRect : seatBox(e.seat), 380);
    } else if (e.type === "draw") {
      const fromBack = g.back > back && g.front === front;
      const st = fromBack ? backStack(g, Math.floor(back / 2)) : frontStack(g, Math.floor(front / 2));
      if (fromBack) back++; else front++;
      const from = st ? st.getBoundingClientRect() : null;
      if (e.seat === view.me) flyFrom($("myHand").querySelector(".tile.drawn") || $("myHand").lastElementChild, from, 360);
      else ghost(from, seatBox(e.seat));
    } else if (["pung", "kong", "chow"].includes(e.type)) {
      const src = pondOf(e.from).querySelector(".tile.taken:last-of-type") || pondOf(e.from).lastElementChild;
      const box = e.seat === view.me ? $("myMelds") : seatEls[posOf(e.seat) - 1].querySelector(".melds");
      const melds = box.querySelectorAll(".meld:not(.flowers)");
      const meld = melds[melds.length - 1];
      if (meld && src) [...meld.children].forEach((t, i) => flyFrom(t, src.getBoundingClientRect(), 420 + i * 40));
    } else if (e.type === "flower") back++;
  }
  lastDiscardRect = null;
}

// ---------- a new hand: the dealer rolls the dice, the wall is broken, the tiles are dealt ----------
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function dieEl(n) {
  const d = document.createElement("div"); d.className = "die" + (n === 1 || n === 4 ? " red" : "");
  for (let i = 0; i < 9; i++) { const p = document.createElement("i"); if (PIPS[n].includes(i)) p.className = "on"; d.appendChild(p); }
  return d;
}
function maybeIntro(g) {
  if (introFor === g.no) return;
  const untouched = g.discards.every(d => !d.length) && g.melds.every(m => !m.length) && !g.finished;
  introFor = g.no;
  if (!untouched || calm.matches || document.hidden || !g.dice) return;
  runIntro(g).catch(() => {});
}
function stopIntro() {
  introTimers.forEach(clearTimeout); introTimers = [];
  introRunning = false;
  document.querySelectorAll(".tile.undealt").forEach(t => t.classList.remove("undealt"));
  const box = $("dice"); box.hidden = true; box.classList.remove("out");
}
async function runIntro(g) {
  introRunning = true;
  const no = g.no;
  renderRing(g, 0, 0);                                         // the full wall
  const hidden = seat => seat === view.me ? [...$("myHand").children] : [...seatEls[posOf(seat) - 1].querySelectorAll(".hidden-tiles .tile")];
  for (let s = 0; s < 4; s++) hidden(s).forEach(t => t.classList.add("undealt"));
  document.querySelectorAll(".mtable .flowers .tile, #myMelds .flowers .tile").forEach(t => t.classList.add("undealt"));
  // the dice tumble, then land
  const box = $("dice"), dice = box.querySelector(".dice"), say = box.querySelector(".dice-say");
  box.hidden = false; box.classList.remove("out");
  say.innerHTML = ""; say.append(`${nameAt(g.dealer)} ${verb(g.dealer, "roll")} the dice…`);
  const spin = setInterval(() => { dice.innerHTML = ""; for (let i = 0; i < 3; i++) { const d = dieEl(1 + Math.floor(Math.random() * 6)); d.classList.add("rolling"); dice.appendChild(d); } }, 90);
  if (animOk() || !renderedOnce) sound("chips", 0);
  await sleep(1100);
  clearInterval(spin);
  dice.innerHTML = ""; g.dice.forEach(n => { const d = dieEl(n); d.classList.add("land"); dice.appendChild(d); });
  const total = g.dice.reduce((a, b) => a + b, 0);
  say.innerHTML = `<b>${total}</b> · `; say.append(`the wall breaks at ${nameAt((g.dealer + total - 1) % 4) === "You" ? "your" : nameAt((g.dealer + total - 1) % 4) + "'s"} wall`);
  sound("check", 0);
  await sleep(900);
  box.classList.add("out");
  // the deal: four tiles at a time to each player, three times round, then one each and the dealer's extra
  let front = 0;
  const shown = [0, 0, 0, 0];
  const give = async (seat, n) => {
    front += n; shown[seat] += n;
    renderRing(g, front, 0);
    hidden(seat).slice(0, shown[seat]).forEach(t => t.classList.remove("undealt"));
    if (seat === view.me || shown[seat] <= 4) sound("deal", 0);
    await sleep(95);
  };
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) await give((g.dealer + k) % 4, 4);
  for (let k = 0; k < 4; k++) await give((g.dealer + k) % 4, 1);
  await give(g.dealer, 1);
  if (view && view.game && view.game.no === no) renderRing(view.game);   // flowers swapped from the far end
  await sleep(200);
  stopIntro();
  if (view) render();
}
function sounds(g) {
  if (!g) return;
  const key = `${g.no}:${g.logCount}`;
  if (lastLog !== null && renderedOnce && key !== lastLog) {
    const [no, count] = lastLog.split(":").map(Number);
    const fresh = no === g.no ? Math.min(6, g.logCount - count) : 0;
    g.log.slice(g.log.length - Math.max(0, fresh)).forEach((e, k) => {
      if (e.type === "discard") sound("flip", k * 0.08);
      else if (["pung", "kong", "chow", "concealed kong", "add kong"].includes(e.type)) { sound("chips", k * 0.08); if (e.type.includes("kong")) cue.sting("big"); }
    });
  }
  if (lastGame !== null && g.no !== lastGame && renderedOnce) for (let i = 0; i < 6; i++) sound("deal", i * 0.07);
  const myTurnNow = !!(g.options && !g.finished);
  if (myTurnNow && lastTurn === false && renderedOnce) { sound("turn"); cue.sting("turn"); }
  // the music: calm between hands, intense once the wall runs low
  cue.level(g.finished ? 0 : g.wallLeft <= 30 ? 2 : 1);
  lastLog = key; lastGame = g.no; lastTurn = myTurnNow;
  renderedOnce = true;
}
function drawSoundBtn() { $("btnSound").textContent = soundOn() ? "🔊" : "🔇"; }
$("btnSound").onclick = () => { setSound(!soundOn()); drawSoundBtn(); sound("flip"); };
addEventListener("cr-fx", () => queueMicrotask(drawSoundBtn));
drawSoundBtn();

function tickClock() {
  if (!view || view.ended) return;
  const g = view.game;
  const left = view.deadline ? Math.max(0, Math.min(100, (view.deadline - Date.now()) / (view.actMs || 30000) * 100)) : 0;
  seatEls.forEach((el, k) => {
    const seat = seatAt(k + 1), bar = el.querySelector(".timer");
    const on = view.deadline && g && !g.finished && ((g.turn === seat && g.phase === "discard") || g.waiting.includes(seat));
    bar.style.width = on ? left + "%" : "0";
  });
  $("myTimer").style.width = view.deadline && g && g.options ? left + "%" : "0";
  if (g && g.finished && view.nextGameAt) $("status").textContent = statusText(g);
}
setInterval(tickClock, 250);

// ---------- input ----------
function guard(fn) { return async (...a) => { try { await fn(...a); } catch (err) { $("status").textContent = err.message; } }; }
async function sendMove(m) { selected = null; hintTile = null; await ctrl.move(m); }
$("myHand").addEventListener("click", guard(async e => {
  const el = e.target.closest(".tile"); if (!el || !view || !view.game || !view.game.options || view.game.options.kind !== "turn") return;
  const i = [...$("myHand").children].indexOf(el);
  if (selected === i) { lastDiscardRect = el.getBoundingClientRect(); return sendMove({ type: "discard", tile: el.dataset.t }); }   // a second tap throws it
  selected = i; render();
}));
$("btnDiscard").onclick = guard(async () => { const el = $("myHand").children[selected]; if (el) { lastDiscardRect = el.getBoundingClientRect(); await sendMove({ type: "discard", tile: el.dataset.t }); } });
$("btnWin").onclick = guard(() => sendMove({ type: "win" }));
$("kongBtns").addEventListener("click", guard(async e => { const b = e.target.closest("[data-kong]"); if (b) await sendMove({ type: "kong", tile: b.dataset.kong }); }));
$("btnHint").onclick = () => {
  const g = view.game; if (!g || !g.options) return;
  // the bots' own judgement, from what you can see
  const pseudo = {
    hands: g.counts.map((n, i) => i === view.me ? g.hand.slice() : []), melds: g.melds, flowers: g.flowers, discards: g.discards, wall: { length: g.wallLeft },
    turn: g.turn, phase: g.phase, drawn: g.drawn, dealer: g.dealer, round: g.round, minFaan: g.minFaan, last: g.last, kong: g.kong, claims: null,
    fresh: [false, false, false, false], anyClaim: true, afterKong: false, lastTile: g.wallLeft === 0, finished: null
  };
  const m = mahjongMove(pseudo, view.me, "expert");
  if (!m) return;
  if (m.type === "discard") { hintTile = m.tile; selected = null; render(); $("status").textContent = `Hint: throw ${M.tileName(m.tile)}.`; }
  else if (m.type === "win") $("status").textContent = "Hint: declare Mahjong!";
  else if (m.type === "kong") $("status").textContent = `Hint: declare a kong of ${M.tileName(m.tile)}.`;
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
  if (k === "enter" && !$("btnDiscard").disabled && !$("actRow").hidden) $("btnDiscard").click();
  else if (k === "p" && !$("claimRow").hidden) [...$("claimRow").querySelectorAll("button")].pop().click();
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
  const text = [`Mahjong, room ${view.code}`, ...led.map(r => `${r.name}: ${fmt(r.net, true)}`), "To settle:", ...all.payments.map(p => `${p.from} pays ${p.to} ${fmt(p.amount)}`)].join("\n");
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
  $("sumIntro").textContent = `${s.games} hand${s.games === 1 ? "" : "s"} at ${fmt(s.pointValue)} a point. Pretend dollars only: settle up between yourselves.`;
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
  const text = ["Mahjong results", ...s.rows.map(r => `${r.name}: ${fmt(r.net, true)}`), "", ...s.payments.map(p => `${p.from} pays ${p.to} ${fmt(p.amount)}`)].join("\n");
  try { await navigator.clipboard.writeText(text); $("btnSumCopy").textContent = "Copied"; } catch {}
  setTimeout(() => $("btnSumCopy").textContent = "Copy results", 2000);
};

compact.addEventListener("change", () => view && render());
window.addEventListener("resize", () => view && !view.ended && render());
initSetup();
