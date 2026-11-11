// Gaple screens. Works with LocalGaple (bots) or OnlineGaple (friends).
import * as G from "../supabase/functions/_shared/gaple-engine.js";
import { gapleMove } from "../supabase/functions/_shared/gaple-bot.js";
import { settle } from "../supabase/functions/_shared/poker-engine.js";
import { REACTIONS } from "../supabase/functions/_shared/poker-room.js";
import { LocalGaple, savedGapleGame } from "./local.js";
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
// Money in points. Against bots (bots mode) every point counts; in rooms with friends, points won from or
// lost to a bot don't turn into money, so friends only owe each other.
const isBot = seat => !!(view.seats[seat] && view.seats[seat].bot);
const moneyPts = seat => view.mode === "online" ? (view.seats[seat]?.money || 0) : (view.seats[seat]?.points || 0);
function gameMoney(f, seat) {
  if (view.mode !== "online") return f.points[seat];
  if (isBot(f.winner)) return 0;
  if (seat === f.winner) return [0, 1, 2, 3].filter(i => i !== seat && !isBot(i)).reduce((a, i) => a - f.points[i], 0);
  return isBot(seat) ? 0 : f.points[seat];
}
const netClass = n => n > 0 ? "pos" : n < 0 ? "neg" : "";
const escape = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

// ---------- tiles ----------
const PIP_NAMES = ["blank", "1", "2", "3", "4", "5", "6"];
const pipName = n => PIP_NAMES[n];
const tileName = t => G.isDouble(t) ? `double ${t[0] === "0" ? "blank" : t[0]}` : `${t[0]}-${t[1]}`;
const openerName = t => t === "00" ? "double blank" : "double six";
// where the pips sit in one half of an upright tile
const A = .26, B = .74;
const PIPS = [[], [[.5, .5]], [[A, A], [B, B]], [[A, A], [.5, .5], [B, B]], [[A, A], [B, A], [A, B], [B, B]], [[A, A], [B, A], [.5, .5], [A, B], [B, B]], [[A, .22], [A, .5], [A, .78], [B, .22], [B, .5], [B, .78]]];
// A tile drawn in a box (in tile units: a tile is 1 by 2). p1 is the top or left half, p2 the other.
function tileSvg(x, y, w, h, p1, p2) {
  const up = h > w, pad = .04;
  let s = `<rect class="dm-shade" x="${x + pad + .03}" y="${y + pad + .05}" width="${w - pad * 2}" height="${h - pad * 2}" rx=".13" fill="rgba(0,0,0,.35)"/>`
    + `<rect class="dm-face" x="${x + pad}" y="${y + pad}" width="${w - pad * 2}" height="${h - pad * 2}" rx=".13"/>`
    + (up ? `<line class="dm-mid" x1="${x + .2}" y1="${y + 1}" x2="${x + .8}" y2="${y + 1}"/>` : `<line class="dm-mid" x1="${x + 1}" y1="${y + .2}" x2="${x + 1}" y2="${y + .8}"/>`);
  [p1, p2].forEach((n, k) => {
    const hx = x + (up ? 0 : k), hy = y + (up ? k : 0);
    for (const [px, py] of PIPS[n]) s += `<circle class="dm-pip" cx="${(hx + (up ? px : py)).toFixed(3)}" cy="${(hy + (up ? py : px)).toFixed(3)}" r=".105"/>`;
  });
  return s;
}
const tileIcon = t => `<svg viewBox="0 0 1 2" aria-hidden="true">${tileSvg(0, 0, 1, 2, G.lo(t), G.hi(t))}</svg>`;

// ---------- the line on the table ----------
// The line snakes: the first tile sits in the middle, the right end runs right and turns down row by row,
// the left end runs left and turns up. Tiles never move once they're down; the picture just zooms out.
// Doubles lie across the line, except where there's no room before a turn.
function walker(x, dir, vdir, xmin, xmax) {
  let y = 0;
  const step = (isD, commit) => {
    const space = dir > 0 ? xmax - x : x - xmin;
    let r, nx = x, ny = y, nd = dir;
    if (isD && space >= 3) { r = { x: dir > 0 ? x : x - 1, y: y - .5, w: 1, h: 2, inner: 0 }; nx = x + dir; }
    else if (space >= 2) { r = { x: dir > 0 ? x : x - 2, y, w: 2, h: 1, inner: dir > 0 ? 0 : 1 }; nx = x + 2 * dir; }
    else {                                             // the turn: an upright tile hanging off the last one's end
      const cx = dir > 0 ? x - 1 : x;
      r = { x: cx, y: vdir > 0 ? y + 1 : y - 2, w: 1, h: 2, inner: vdir > 0 ? 0 : 1 };
      ny = y + 2 * vdir; nx = dir > 0 ? cx : cx + 1; nd = -dir;
    }
    if (commit) { x = nx; y = ny; dir = nd; }
    return r;
  };
  return { place: isD => step(isD, true), peek: isD => step(isD, false) };
}
// Returns the tiles' boxes and where the next tile would go at each end.
function layoutLine(line, origin, W) {
  const xmin = -W / 2, xmax = W / 2, tiles = [];
  if (!line.length) return { tiles, slot: isD => ({ R: isD ? { x: -.5, y: -.5, w: 1, h: 2, inner: 0 } : { x: -1, y: 0, w: 2, h: 1, inner: 0 } }) };
  const first = line[origin], d0 = G.isDouble(first.t);
  const box0 = d0 ? { x: -.5, y: -.5, w: 1, h: 2 } : { x: -1, y: 0, w: 2, h: 1 };
  tiles.push({ ...box0, p1: first.a, p2: first.b, t: first.t });
  const right = walker(box0.x + box0.w, 1, 1, xmin, xmax), left = walker(box0.x, -1, -1, xmin, xmax);
  for (let i = origin + 1; i < line.length; i++) {           // inner pip a, outer pip b
    const e = line[i], r = right.place(G.isDouble(e.t));
    tiles.push({ ...r, p1: r.inner === 0 ? e.a : e.b, p2: r.inner === 0 ? e.b : e.a, t: e.t });
  }
  for (let i = origin - 1; i >= 0; i--) {                    // inner pip b, outer pip a
    const e = line[i], r = left.place(G.isDouble(e.t));
    tiles.push({ ...r, p1: r.inner === 0 ? e.b : e.a, p2: r.inner === 0 ? e.a : e.b, t: e.t });
  }
  return { tiles, slot: isD => ({ L: left.peek(isD), R: right.peek(isD) }) };
}
// How many tile-widths fit across the table.
const boardCols = () => { const w = $("gboard").clientWidth || 340; return w < 520 ? 14 : w < 760 ? 18 : 24; };

let drawnLine = "", shownTiles = new Set();
function drawLine(g, slots) {
  const svg = $("lineSvg"), W = boardCols();
  const line = g ? g.line : [], last = g && g.log.filter(e => e.type === "play").pop();
  const key = JSON.stringify([line.map(x => x.t), g ? g.origin : 0, W, slots, g ? g.no : 0]);
  if (key === drawnLine) return;
  drawnLine = key;
  const lay = layoutLine(line, g ? g.origin : 0, W);
  const boxes = lay.tiles.slice();
  let extra = "";
  if (slots) {
    const at = lay.slot(G.isDouble(slots.tile));
    for (const end of slots.ends) {
      const r = at[end] || at.R, t = slots.tile;
      // the pip that touches the line goes on the inner half
      const touch = !line.length ? G.lo(t) : end === "L" ? g.ends[0] : g.ends[1];
      const inner = touch, outer = line.length ? G.other(t, touch) : G.hi(t);
      boxes.push(r);
      extra += `<g class="slot" data-end="${end}" role="button" aria-label="Play the ${tileName(t)} here">${tileSvg(r.x, r.y, r.w, r.h, r.inner === 0 ? inner : outer, r.inner === 0 ? outer : inner)}<rect class="hit" x="${r.x - .4}" y="${r.y - .4}" width="${r.w + .8}" height="${r.h + .8}"/></g>`;
    }
  }
  // the picture: the full width always, as many rows as there are (never fewer than a few, so tiles don't balloon)
  let y0 = Math.min(-.5, ...boxes.map(b => b.y)), y1 = Math.max(1.5, ...boxes.map(b => b.y + b.h));
  const minH = W <= 14 ? 7 : W <= 18 ? 6.5 : 6;
  if (y1 - y0 < minH) { const mid = (y0 + y1) / 2; y0 = mid - minH / 2; y1 = mid + minH / 2; }
  svg.setAttribute("viewBox", `${(-W / 2 - .4).toFixed(2)} ${(y0 - .4).toFixed(2)} ${W + .8} ${(y1 - y0 + .8).toFixed(2)}`);
  const fresh = animOk() ? lay.tiles.filter(b => !shownTiles.has(b.t)).map(b => b.t) : [];
  svg.innerHTML = lay.tiles.map(b => `<g class="tile${last && last.tile === b.t && !g.finished ? " last" : ""}${fresh.includes(b.t) ? " fresh" : ""}">${tileSvg(b.x, b.y, b.w, b.h, b.p1, b.p2)}</g>`).join("") + extra;
  shownTiles = new Set(lay.tiles.map(b => b.t));
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
  document.body.classList.toggle("at-gaple", id === "scrTable");
}
const sizeVar = (el, name) => new ResizeObserver(() => document.documentElement.style.setProperty(name, el.offsetHeight + "px")).observe(el);
sizeVar(document.querySelector(".bar"), "--bar-h");
sizeVar($("grail"), "--rail-h");
new ResizeObserver(() => { if (view && !view.ended) render(); }).observe($("gboard"));

let ctrl = null, unsub = null, view = null;
function attach(controller) {
  if (unsub) unsub();
  if (ctrl && ctrl !== controller && ctrl.destroy) ctrl.destroy();
  ctrl = controller; picked = null; hintEnd = null; lastLog = null; lastGame = null; lastChatN = null; lastTurn = null; bannerFor = null; drawnLine = ""; shownTiles = new Set();
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
const rulesLine = s => `${s.opener === "00" ? "Double blank" : "Double six"} opens${s.blank25 ? " · lone double blank counts 25" : ""}${s.gapleBonus ? " · gaple pays double" : ""}`;

$("formAi").addEventListener("submit", e => {
  e.preventDefault();
  const name = nameOf("aiName") || "Player", pointValue = toCents($("aiValue").value);
  if (!(pointValue >= 1)) return $("aiErr").textContent = "Enter how many dollars a point is worth.";
  $("aiErr").textContent = "";
  store.set("pk-name", name);
  attach(LocalGaple.create({ name, avatar: myAvatar(), skill: segValue("aiSkill"), opener: segValue("aiOpener"), blank25: $("aiBlank").checked, gapleBonus: $("aiBonus").checked, pointValue }));
});
$("aiResume").addEventListener("click", () => { const s = savedGapleGame(); if (s) attach(new LocalGaple(s)); });

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
    const { OnlineGaple } = await online();
    attach(await OnlineGaple.create({ name, avatar: myAvatar(), pointValue, actSeconds: +$("crTime").value, skill: segValue("crSkill"), opener: segValue("crOpener"), blank25: $("crBlank").checked, gapleBonus: $("crBonus").checked }));
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
    const { OnlineGaple } = await online();
    attach(await OnlineGaple.join({ code, name, avatar: myAvatar() }));
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
    $("jnRules").textContent = !r ? "No open room with that code." : r.game !== "gaple" ? "That code is for another game. Join it from that game's page." : `${rulesLine(r.settings || {})} · ${fmt((r.settings || {}).pointValue || 0)} a point · ${r.humans} of 4 seats taken by people`;
  } catch {}
});
$("btnRejoin").addEventListener("click", async () => {
  try { const { OnlineGaple } = await online(); attach(await OnlineGaple.resume()); }
  catch (err) { $("jnErr").textContent = err.message; $("btnRejoin").hidden = true; }
});
async function openAsHost(code, hostKey) {
  window.history.replaceState(null, "", location.pathname + "#online");
  route(); showScreen("scrSetup");
  try { const { OnlineGaple } = await online(); attach(await OnlineGaple.claim({ code, hostKey })); }
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
  $("aiResume").hidden = !savedGapleGame();
  drawLookButtons();
  if (params.get("code") && params.get("host") && onlineEnabled) return openAsHost(params.get("code").toUpperCase().slice(0, 6), params.get("host"));
  if (params.get("code")) { location.hash = "#online"; $("jnCode").value = params.get("code").toUpperCase().slice(0, 6); $("jnCode").dispatchEvent(new Event("change")); }
  route();
  if (onlineEnabled) online().then(m => { $("btnRejoin").hidden = !m.hasSavedGapleSeat(); }).catch(() => {});
  showScreen("scrSetup");
}

// ---------- the table ----------
let seatEls = [];
function buildSeats() {
  seatEls.forEach(e => e.remove());
  seatEls = [1, 2, 3].map(pos => {
    const el = document.createElement("div");
    el.className = "gseat"; el.dataset.pos = pos;
    el.innerHTML = `<div class="pic"></div><div class="plate"><div class="name"></div><div class="count"><span class="backs"></span><b></b></div><div class="tag"></div></div><div class="timer"></div><div class="bubble" hidden></div>`;
    $("gseats").appendChild(el);
    return el;
  });
}
const seatAt = pos => (view.me + pos) % 4;              // pos 0 = you, then the others in the order they play
const posOf = seat => (seat - view.me + 4) % 4;
const nameAt = seat => seat === view.me ? "You" : view.seats[seat]?.name || "Seat " + (seat + 1);
const verb = (seat, base, third = base + "s") => seat === view.me ? base : third;
const endsText = ends => ends[0] === ends[1] ? `a ${pipName(ends[0])}` : `a ${pipName(ends[0])} or a ${pipName(ends[1])}`;

// picked: the tile you tapped. hintEnd: the end the hint suggested for it.
let picked = null, hintEnd = null, lastLog = null, lastGame = null, lastTurn = null, bannerFor = null;

// Where the picked tile can go: { tile, ends } with the ends that matter (one when both ends show the same number).
function choiceFor(g) {
  if (!g || !g.legal || !picked) return null;
  const m = g.legal.moves.find(x => x.tile === picked);
  if (!m) return null;
  return { tile: picked, ends: m.ends, pickEnd: m.ends.length === 2 && g.ends[0] !== g.ends[1] };
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
  const fin = g && g.finished;
  [1, 2, 3].forEach((pos, k) => {
    const seat = seatAt(pos), el = seatEls[k], p = view.seats[seat] || {};
    const av = avatarOf(p), pic = el.querySelector(".pic");
    if (pic.dataset.av !== av) { pic.dataset.av = av; pic.innerHTML = avatarSvg(av, p.name || ""); }
    el.querySelector(".name").textContent = (p.name || "Empty seat") + (p.bot && view.mode === "online" ? " (bot)" : "");
    const n = g ? g.counts[seat] : 0;
    const backs = el.querySelector(".backs");
    if (backs.childElementCount !== n) backs.innerHTML = "<i></i>".repeat(n);
    el.querySelector(".count b").textContent = g ? `${n} tile${n === 1 ? "" : "s"}` : "";
    const tag = el.querySelector(".tag");
    const passed = !!(g && !fin && g.passed[seat] && g.turn !== seat);
    tag.className = "tag" + (fin ? (fin.winner === seat ? " win" : " lose") : passed ? " pass" : "");
    tag.textContent = fin ? (fin.winner === seat ? "Winner" : signed(fin.points[seat]) + " pts")
      : passed ? "Pass" : g && g.turn === seat ? "Thinking…" : g && n === 1 ? "1 left!" : "";
    el.classList.toggle("acting", !!(g && !fin && g.turn === seat));
  });

  // your tiles
  const hand = g && g.hand ? g.hand : [];
  if (picked && !hand.includes(picked)) { picked = null; hintEnd = null; }
  const myTurn = !!(g && g.legal && !fin);
  if (!myTurn) { picked = null; hintEnd = null; }
  const live = !!(g && !fin && hand.length);
  const fits = live ? new Set(G.movesFor(hand, g.ends, g.line.length ? null : g.opener).map(m => m.tile)) : new Set();
  const hb = $("myHand");
  const hkey = hand.join();
  if (hb.dataset.key !== hkey) {
    hb.dataset.key = hkey; hb.innerHTML = "";
    hand.forEach(t => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "dm"; b.dataset.tile = t; b.setAttribute("aria-label", tileName(t));
      b.innerHTML = tileIcon(t);
      hb.appendChild(b);
    });
  }
  hb.querySelectorAll(".dm").forEach(el => {
    const t = el.dataset.tile;
    el.classList.toggle("sel", picked === t);
    el.classList.toggle("can", myTurn && fits.has(t));
    el.classList.toggle("dim", live && !fits.has(t));
    el.setAttribute("aria-pressed", picked === t);
  });
  hb.classList.toggle("off", !myTurn);

  // the line, with the places the picked tile can go
  const choice = choiceFor(g);
  drawLine(g, choice ? { tile: choice.tile, ends: choice.ends } : null);
  $("lineLabel").innerHTML = !g || fin ? "" : !g.ends ? (g.opener ? `The <b>${openerName(g.opener)}</b> starts` : "Any tile starts")
    : g.ends[0] === g.ends[1] ? `Open ends: both <b>${pipName(g.ends[0])}</b>` : `Open ends: <b>${pipName(g.ends[0])}</b> and <b>${pipName(g.ends[1])}</b>`;

  // buttons
  const stuck = myTurn && !g.legal.moves.length;       // nothing you hold fits: only Pass
  $("actRow").hidden = !g || !!fin;
  $("btnPlay2").hidden = !(choice && choice.pickEnd);
  if (choice && choice.pickEnd) {
    $("btnPlay").textContent = `On the ${pipName(g.ends[0])}`; $("btnPlay").disabled = false;
    $("btnPlay2").textContent = `On the ${pipName(g.ends[1])}`;
  } else {
    $("btnPlay").textContent = choice ? `Play ${tileName(choice.tile)}` : "Play";
    $("btnPlay").disabled = !choice;
  }
  $("btnPass").disabled = !stuck;
  $("btnPass").classList.toggle("primary", !!stuck);
  $("btnPass").classList.toggle("ghost", !stuck);
  $("btnHint").disabled = !myTurn || stuck;
  $("betweenRow").hidden = !(fin || (view.mode === "online" && !view.started));
  $("btnNext").hidden = !(fin && view.mode === "ai");
  $("btnStart").hidden = !(view.mode === "online" && view.isHost && !view.started);
  $("btnStart").textContent = view.sessions && view.sessions.length ? `Start session ${view.sessionNo}` : "Start the game";

  $("status").textContent = statusText(g, choice);
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

function finishText(f) {
  const me = view.me, w = f.winner;
  if (f.reason === "blocked") return `Blocked: nobody can play. ${nameAt(w)} ${verb(w, "win")} with the fewest pips (${f.values[w]}).`;
  if (f.gaple) return `Gaple! ${nameAt(w)} ${verb(w, "go", "goes")} out on a tile that fits both ends: ${w === me ? "everyone pays you double" : "everyone pays double"}.`;
  return `${nameAt(w)} ${verb(w, "go", "goes")} out and ${verb(w, "win")}!`;
}

function statusText(g, choice) {
  const me = view.me;
  if (view.mode === "online" && !view.started) {
    const humans = view.seats.filter(s => s && !s.bot).length;
    return view.closing ? "The host is closing the room." : view.isHost ? `${humans} of 4 seats taken by people. Start whenever you're ready: bots fill the empty seats.` : "Waiting for the host to start. Bots fill any empty seats.";
  }
  if (!g) return "Mixing the tiles…";
  if (g.finished) {
    const left = view.nextGameAt ? ` Next game in ${Math.max(0, Math.ceil((view.nextGameAt - Date.now()) / 1000))}s.` : "";
    return finishText(g.finished) + (view.ending ? " The session ends here." : left);
  }
  if (g.legal) {
    if (!g.legal.moves.length) return `Nothing you hold fits ${endsText(g.ends)}: pass.`;
    if (choice && choice.pickEnd) return hintEnd ? `Hint: play the ${tileName(choice.tile)} on the ${pipName(g.ends[hintEnd === "L" ? 0 : 1])}.` : `The ${tileName(choice.tile)} fits both ends. Pick one: tap a glowing spot on the line, or use the buttons.`;
    if (choice) return hintEnd ? `Hint: play the ${tileName(choice.tile)}.` : `Play the ${tileName(choice.tile)}: tap the glowing spot, or the Play button.`;
    if (g.legal.mustPlay) return `You hold the ${openerName(g.legal.mustPlay)}: play it to start the game.`;
    if (!g.ends) return "Your lead: play any tile.";
    return `Your turn: play a tile with ${endsText(g.ends)}.`;
  }
  return (view.ending ? "Last game of the session. " : "") + `${nameAt(g.turn)} is thinking…`;
}

function renderLog(g) {
  const box = $("log");
  if (!g) { box.innerHTML = ""; return; }
  const lines = [`Game ${g.no}`];
  for (const e of g.log) {
    if (e.type === "play") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "play")} the ${tileName(e.tile)}`);
    else if (e.type === "pass") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "pass", "passes")}: no ${e.ends[0] === e.ends[1] ? pipName(e.ends[0]) : `${pipName(e.ends[0])} or ${pipName(e.ends[1])}`}`);
    else if (e.type === "win") lines.push(`${nameAt(e.seat)} ${verb(e.seat, "go", "goes")} out and ${verb(e.seat, "win")}`);
    else if (e.type === "gaple") lines.push(`Gaple! ${nameAt(e.seat)} ${verb(e.seat, "go", "goes")} out on both ends: double points`);
    else if (e.type === "blocked") lines.push(`Blocked: ${nameAt(e.seat)} ${verb(e.seat, "win")} with the fewest pips`);
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
  const played = view.games ? view.games.length : 0;
  note.textContent = `${rulesLine(view.settings || {})} · ${fmt(view.pointValue)} a point · ${played} game${played === 1 ? "" : "s"} played` + (view.mode === "online" && view.seats.some(x => x && x.bot) ? " · points won or lost against bots don't count as money" : "");
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
  head.innerHTML = `<div class="pic">${avatarSvg(avatarOf(view.seats[f.winner]))}</div><div class="wb-text"><div class="wb-title"></div><div class="wb-hand"></div></div>`;
  head.querySelector(".wb-title").textContent = `${f.gaple ? "Gaple! " : ""}${nameAt(f.winner)} ${verb(f.winner, "win")}!`;
  head.querySelector(".wb-hand").textContent = f.reason === "blocked" ? "Blocked: the fewest pips left" : f.gaple ? "Out on both ends: everyone pays double" : "Out of tiles first";
  box.appendChild(head);
  const res = document.createElement("div"); res.className = "gp-result";
  const table = document.createElement("table");
  f.points.forEach((pts, seat) => {
    const tr = document.createElement("tr");
    if (seat === f.winner) tr.className = "won";
    tr.innerHTML = `<td></td><td><span class="left"></span></td><td></td><td></td>`;
    tr.children[0].textContent = nameAt(seat);
    const left = tr.querySelector(".left"), tiles = f.left[seat] || [];
    left.innerHTML = tiles.map(tileIcon).join("") + (tiles.length ? `<small>${f.values[seat]} pip${f.values[seat] === 1 ? "" : "s"}</small>` : `<small>no tiles left</small>`);
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
  if (animOk()) sound(f.winner === view.me ? "win" : f.gaple ? "allin" : "pot", 0.2);
  if (renderedOnce) cue.sting(f.winner === view.me ? "win" : "lose");
}
$("winBanner").addEventListener("click", () => { if (bannerFor && !bannerFor.endsWith("hidden")) bannerFor += "-hidden"; $("winBanner").hidden = true; });

// ---------- motion and sound ----------
const calm = matchMedia("(prefers-reduced-motion: reduce)");
let renderedOnce = false;
const animOk = () => renderedOnce && !calm.matches && !document.hidden;
function sounds(g) {
  if (!g) return;
  const key = `${g.no}:${g.log.length}`;
  if (lastLog !== null && renderedOnce && key !== lastLog) {
    const [no] = lastLog.split(":");
    const fromIdx = +no === g.no ? +lastLog.split(":")[1] : 0;
    g.log.slice(fromIdx).forEach((e, k) => {
      if (e.type === "play") sound(G.isDouble(e.tile) ? "chips" : "flip", k * 0.1);
      else if (e.type === "pass") sound("check", k * 0.1);
      else if (e.type === "gaple") cue.sting("big");
    });
  }
  if (lastGame !== null && g.no !== lastGame && renderedOnce) for (let i = 0; i < 6; i++) sound("deal", i * 0.07);
  const myTurnNow = !!(g.legal && !g.finished);
  if (myTurnNow && lastTurn === false && renderedOnce) { sound("turn"); cue.sting("turn"); }
  // the music: calm between games, intense once anyone is down to their last 2 tiles
  cue.level(g.finished ? 0 : Math.min(...g.counts.filter(n => n > 0)) <= 2 ? 2 : 1);
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
  const share = seat => view.deadline && g && !g.finished && g.turn === seat ? Math.max(0, Math.min(100, (view.deadline - Date.now()) / (view.actMs || 30000) * 100)) + "%" : "0";
  seatEls.forEach((el, k) => { el.querySelector(".timer").style.width = share(seatAt(k + 1)); });
  $("myTimer").style.width = share(view.me);
  if (g && g.finished && view.nextGameAt) $("status").textContent = statusText(g, null);
}
setInterval(tickClock, 250);

// ---------- input ----------
function guard(fn) { return async (...a) => { try { await fn(...a); } catch (err) { $("status").textContent = err.message; } }; }
const playPicked = guard(async end => {
  const g = view.game, c = choiceFor(g);
  if (!c) return;
  const tile = c.tile, side = end && c.ends.includes(end) ? end : c.ends.includes(hintEnd) ? hintEnd : c.ends[c.ends.length - 1];
  picked = null; hintEnd = null; render();
  await ctrl.play(tile, g.line.length ? side : undefined);
});
$("myHand").addEventListener("click", e => {
  const g = view && view.game;
  if (!g || g.finished || !g.legal) return;
  const el = e.target.closest(".dm"); if (!el) return;
  const t = el.dataset.tile;
  hintEnd = null;
  if (!g.legal.moves.some(m => m.tile === t)) {
    picked = null; render();
    $("status").textContent = g.legal.mustPlay ? `The first game starts with the ${openerName(g.legal.mustPlay)}.` : g.ends ? `The ${tileName(t)} doesn't fit: you need ${endsText(g.ends)}.` : "";
    return;
  }
  picked = picked === t ? null : t;
  render();
});
$("lineSvg").addEventListener("click", e => {
  const slot = e.target.closest(".slot");
  if (slot) playPicked(slot.dataset.end);
});
$("btnPlay").onclick = () => { const c = choiceFor(view.game); if (c) playPicked(c.pickEnd ? "L" : undefined); };
$("btnPlay2").onclick = () => playPicked("R");
$("btnPass").onclick = guard(async () => { picked = null; hintEnd = null; render(); await ctrl.pass(); });
$("btnHint").onclick = () => {
  const g = view.game; if (!g || !g.legal) return;
  // the strong bot's own judgement, from what you can see
  const pseudo = { ...g, hands: g.counts.map((n, i) => i === view.me ? g.hand : Array(n).fill("x")), finished: null };
  const m = gapleMove(pseudo, view.me, "hard");
  if (!m || m.type !== "play") return;
  picked = m.tile; hintEnd = m.end;
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
  if (!view || !view.game || e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
  const k = e.key.toLowerCase();
  if (k === "enter" && !e.target.closest("button") && !$("btnPlay").disabled && !$("actRow").hidden) $("btnPlay").click();
  else if (k === "p" && !$("btnPass").disabled && !$("actRow").hidden) $("btnPass").click();
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
  const text = [`Gaple, room ${view.code}`, ...led.map(r => `${r.name}: ${fmt(r.net, true)}`), "To settle:", ...all.payments.map(p => `${p.from} pays ${p.to} ${fmt(p.amount)}`)].join("\n");
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
  const text = ["Gaple results", ...s.rows.map(r => `${r.name}: ${fmt(r.net, true)}`), "", ...s.payments.map(p => `${p.from} pays ${p.to} ${fmt(p.amount)}`)].join("\n");
  try { await navigator.clipboard.writeText(text); $("btnSumCopy").textContent = "Copied"; } catch {}
  setTimeout(() => $("btnSumCopy").textContent = "Copy results", 2000);
};

compact.addEventListener("change", () => view && render());
window.addEventListener("resize", () => view && !view.ended && render());
initSetup();
