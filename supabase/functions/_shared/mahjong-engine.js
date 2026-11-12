// Hong Kong Mahjong (house rules), as a pure JSON-friendly engine shared by the browser and the server.
//
// 144 tiles: three suits (m characters, p dots, s bamboo) 1-9 x4, winds 1z-4z (E S W N) x4, dragons 5z-7z
// (white, green, red) x4, flowers 1f-4f and seasons 5f-8f x1. Flowers are set aside when drawn and replaced from
// the back of the wall. Dealer starts with 14 tiles, the others 13.
// On your turn you draw, then discard, declare a kong, or win. After a discard, others may claim it:
// a win beats a pung or kong, which beats a chow; only the next player may chow. Two wins on one discard: the
// first player after the discarder takes it. Adding a tile to an exposed pung can be robbed by a win on that tile.
// Faan (capped at 10): see FAAN below. The table may require 3 faan to win (minFaan), or nothing.
// Payment from faan (PAY): self-drawn, the three others each pay; won off a discard, the discarder pays double.
// The game is drawn when the wall runs out.

export const SEATS = 4;
export const PAY = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128];
export const LIMIT = 10;
export const WIND_NAMES = ["East", "South", "West", "North"];

// ---------- tiles ----------
export const isBonus = t => t[1] === "f";
export const isHonor = t => t[1] === "z";
export const isDragon = t => t[1] === "z" && +t[0] >= 5;
export const isWind = t => t[1] === "z" && +t[0] <= 4;
export const isTerminal = t => !isHonor(t) && !isBonus(t) && (t[0] === "1" || t[0] === "9");
export const indexOf = t => t[1] === "z" ? 26 + +t[0] : "mps".indexOf(t[1]) * 9 + +t[0] - 1;   // 0..33
export const tileAt = i => i >= 27 ? `${i - 26}z` : `${i % 9 + 1}${"mps"[Math.floor(i / 9)]}`;
const order = t => isBonus(t) ? 40 + +t[0] : indexOf(t);
export const byTile = (a, b) => order(a) - order(b);
export const TILE_NAMES = { m: "Characters", p: "Dots", s: "Bamboo" };
const HONOR_NAMES = ["", "East wind", "South wind", "West wind", "North wind", "White dragon", "Green dragon", "Red dragon"];
const BONUS_NAMES = ["", "Plum", "Orchid", "Chrysanthemum", "Bamboo flower", "Spring", "Summer", "Autumn", "Winter"];
export const tileName = t => isBonus(t) ? BONUS_NAMES[+t[0]] : isHonor(t) ? HONOR_NAMES[+t[0]] : `${t[0]} ${TILE_NAMES[t[1]]}`;

export function newWall() {
  const w = [];
  for (let i = 0; i < 34; i++) for (let k = 0; k < 4; k++) w.push(tileAt(i));
  for (let f = 1; f <= 8; f++) w.push(`${f}f`);
  return w;
}
export function counts(tiles) {
  const c = new Array(34).fill(0);
  for (const t of tiles) if (!isBonus(t)) c[indexOf(t)]++;
  return c;
}

// ---------- hand shapes ----------
// Every way to split concealed tile counts into `need` sets plus a pair: [{ sets: [{ type, i }], pair }]
export function decompositions(c, need) {
  const out = [];
  const sets = [];
  const go = (start, left) => {
    let i = start;
    while (i < 34 && !c[i]) i++;
    if (i === 34) { if (left === 0) out.push({ sets: sets.slice() }); return; }
    if (left === 0) return;
    if (c[i] >= 3) { c[i] -= 3; sets.push({ type: "pung", i }); go(i, left - 1); sets.pop(); c[i] += 3; }
    if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--; sets.push({ type: "chow", i }); go(i, left - 1); sets.pop(); c[i]++; c[i + 1]++; c[i + 2]++;
    }
  };
  for (let p = 0; p < 34; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const before = out.length;
    go(0, need);
    for (let k = before; k < out.length; k++) out[k].pair = p;
    c[p] += 2;
  }
  return out;
}
const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
const isSevenPairs = c => c.filter(n => n === 2).length === 7;
const isThirteen = c => ORPHANS.every(i => c[i] >= 1) && ORPHANS.some(i => c[i] === 2) && c.reduce((a, n) => a + n, 0) === 14;

// Shanten: how many tiles away from ready (0 = one tile from winning, -1 = complete). melds = exposed sets.
const shantenCache = new Map();
export function shanten(c, melds = 0) {
  const key = c.join("") + melds;
  const hit = shantenCache.get(key);
  if (hit !== undefined) return hit;
  const r = shantenRaw(c, melds);
  if (shantenCache.size > 50000) shantenCache.clear();
  shantenCache.set(key, r);
  return r;
}
function shantenRaw(c, melds) {
  const need = 4 - melds;
  let best = 2 * need;
  const go = (i, sets, part, pair) => {
    while (i < 34 && !c[i]) i++;
    if (i === 34) {
      const p = Math.min(part, need - sets);
      best = Math.min(best, 2 * (need - sets) - p - pair);
      return;
    }
    if (best <= -1) return;
    if (c[i] >= 3) { c[i] -= 3; go(i, sets + 1, part, pair); c[i] += 3; }
    if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) { c[i]--; c[i + 1]--; c[i + 2]--; go(i, sets + 1, part, pair); c[i]++; c[i + 1]++; c[i + 2]++; }
    if (c[i] >= 2) {
      if (!pair) { c[i] -= 2; go(i, sets, part, 1); c[i] += 2; }
      c[i] -= 2; go(i, sets, part + 1, pair); c[i] += 2;
    }
    if (i < 27 && i % 9 <= 7 && c[i + 1]) { c[i]--; c[i + 1]--; go(i, sets, part + 1, pair); c[i]++; c[i + 1]++; }
    if (i < 27 && i % 9 <= 6 && c[i + 2]) { c[i]--; c[i + 2]--; go(i, sets, part + 1, pair); c[i]++; c[i + 2]++; }
    c[i]--; go(i, sets, part, pair); c[i]++;
  };
  go(0, 0, 0, 0);
  if (melds === 0) {
    const pairs = c.filter(n => n >= 2).length, kinds = c.filter(n => n >= 1).length;
    best = Math.min(best, 6 - pairs + Math.max(0, 7 - kinds));
    const orph = ORPHANS.filter(i => c[i]).length, orphPair = ORPHANS.some(i => c[i] >= 2) ? 1 : 0;
    best = Math.min(best, 13 - orph - orphPair);
  }
  return best;
}

// ---------- scoring ----------
export const FAAN = {
  self: ["Self-drawn", 1], concealed: ["Concealed hand", 1], noFlowers: ["No flowers", 1], ownFlower: ["Own flower", 1], ownSeason: ["Own season", 1],
  allFlowers: ["All four flowers", 2], allSeasons: ["All four seasons", 2], dragon: ["Dragon pung", 1], seatWind: ["Seat wind pung", 1], roundWind: ["Round wind pung", 1],
  allChows: ["All chows", 1], allPungs: ["All pungs", 3], mixed: ["Mixed one suit", 3], pure: ["Pure one suit", 7], small3: ["Small three dragons", 5], big3: ["Big three dragons", 8],
  sevenPairs: ["Seven pairs", 4], lastWall: ["Last tile from the wall", 1], lastDiscard: ["Won on the last discard", 1], kongWin: ["Won on a kong replacement", 1], robbing: ["Robbing a kong", 1]
};
export const LIMITS = { thirteen: "Thirteen orphans", honors: "All honours", bigWinds: "Big four winds", smallWinds: "Small four winds", gates: "Nine gates",
  fourConcealed: "Four concealed pungs", terminals: "All terminals", allKongs: "All kongs", heavenly: "Heavenly hand", earthly: "Earthly hand" };

export const seatWindOf = (g, seat) => (seat - g.dealer + SEATS) % SEATS;

// The best way to score this hand, or null if it isn't a winning hand.
// how: { self, winTile, robbing, afterKong, lastTile, heavenly, earthly }
export function evaluate(g, seat, how) {
  const hand = how.self ? g.hands[seat] : [...g.hands[seat], how.winTile];
  const c = counts(hand), melds = g.melds[seat];
  const need = 4 - melds.length;
  const exposed = melds.some(m => !m.concealed);
  const sw = seatWindOf(g, seat), seatWindIdx = 27 + sw, roundWindIdx = 27 + g.round;
  const flowers = g.flowers[seat];
  const meldSets = melds.map(m => ({ type: m.type, i: indexOf(m.tiles[0]), concealed: !!m.concealed }));
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  const winIdx = indexOf(how.winTile);

  const common = () => {
    const items = [];
    if (how.self) items.push(FAAN.self);
    if (!exposed) items.push(FAAN.concealed);
    if (!flowers.length) items.push(FAAN.noFlowers);
    if (flowers.includes(`${sw + 1}f`)) items.push(FAAN.ownFlower);
    if (flowers.includes(`${sw + 5}f`)) items.push(FAAN.ownSeason);
    if ([1, 2, 3, 4].every(n => flowers.includes(`${n}f`))) items.push(FAAN.allFlowers);
    if ([5, 6, 7, 8].every(n => flowers.includes(`${n}f`))) items.push(FAAN.allSeasons);
    if (how.lastTile) items.push(how.self ? FAAN.lastWall : FAAN.lastDiscard);
    if (how.afterKong && how.self) items.push(FAAN.kongWin);
    if (how.robbing) items.push(FAAN.robbing);
    const suits = new Set(allTiles.filter(t => !isHonor(t)).map(t => t[1]));
    const honors = allTiles.some(isHonor);
    if (suits.size === 1) items.push(honors ? FAAN.mixed : FAAN.pure);
    return items;
  };
  const limit = name => ({ faan: LIMIT, items: [[name, LIMIT]], limit: true });
  const total = items => Math.min(LIMIT, items.reduce((a, [, f]) => a + f, 0));

  let best = null;
  const consider = r => { if (r && (!best || r.faan > best.faan)) best = r; };

  if (need === 4 && isThirteen(c)) consider(limit(LIMITS.thirteen));
  if (need === 4 && isSevenPairs(c)) {
    if (allTiles.every(isHonor)) consider(limit(LIMITS.honors));
    else { const items = [FAAN.sevenPairs, ...common()]; consider({ faan: total(items), items }); }
  }
  // nine gates: one suit, concealed, 1112345678999 plus any tile of that suit
  if (need === 4) for (let s = 0; s < 3; s++) {
    const part = c.slice(s * 9, s * 9 + 9), sum = part.reduce((a, n) => a + n, 0);
    if (sum === 14 && part[0] >= 3 && part[8] >= 3 && part.slice(1, 8).every(n => n >= 1)) consider(limit(LIMITS.gates));
  }
  for (const d of decompositions(c, need)) {
    const sets = [...meldSets, ...d.sets.map(x => ({ ...x, concealed: true }))];
    const pungs = sets.filter(x => x.type !== "chow");
    const pair = d.pair;
    if (best && best.limit) break;
    // limit hands
    if (allTiles.every(isHonor)) { consider(limit(LIMITS.honors)); continue; }
    const windSets = pungs.filter(x => x.i >= 27 && x.i <= 30).length;
    if (windSets === 4) { consider(limit(LIMITS.bigWinds)); continue; }
    if (windSets === 3 && pair >= 27 && pair <= 30) { consider(limit(LIMITS.smallWinds)); continue; }
    if (sets.filter(x => x.type === "kong").length === 4) { consider(limit(LIMITS.allKongs)); continue; }
    if (pungs.length === 4 && allTiles.every(isTerminal)) { consider(limit(LIMITS.terminals)); continue; }
    if (pungs.length === 4 && pungs.every(x => x.concealed) && (how.self || pair === winIdx)) { consider(limit(LIMITS.fourConcealed)); continue; }
    // ordinary faan
    const items = common();
    const dragons = pungs.filter(x => x.i >= 31).length;
    if (dragons === 3) items.push(FAAN.big3);
    else if (dragons === 2 && pair >= 31) items.push(FAAN.small3);
    else for (let k = 0; k < dragons; k++) items.push(FAAN.dragon);
    if (pungs.some(x => x.i === seatWindIdx)) items.push(FAAN.seatWind);
    if (pungs.some(x => x.i === roundWindIdx)) items.push(FAAN.roundWind);
    if (sets.every(x => x.type === "chow")) items.push(FAAN.allChows);
    if (pungs.length === 4) items.push(FAAN.allPungs);
    consider({ faan: total(items), items, sets, pair });
  }
  // a complete hand on the very first draw
  if (best && how.heavenly) best = limit(LIMITS.heavenly);
  else if (best && how.earthly) best = limit(LIMITS.earthly);
  return best;
}

// ---------- a game ----------
// g = { no, dealer, round, minFaan, wall, hands, melds, flowers, discards, turn, phase: "discard" | "claim" | "rob",
//       drawn, last: { tile, by }, claims: { seat: { opts, decision } }, kong: { seat, tile } (being added), log, finished }
export function startGame(no, shuffled, { dealer = 0, round = 0, minFaan = 0 } = {}) {
  const g = {
    no, dealer, round, minFaan, wall: shuffled(), hands: [[], [], [], []], melds: [[], [], [], []], flowers: [[], [], [], []], discards: [[], [], [], []],
    turn: dealer, phase: "discard", drawn: null, last: null, claims: null, kong: null, log: [], finished: null,
    fresh: [true, true, true, true], anyClaim: false, afterKong: false, lastTile: false,
    dice: rollDice(), front: 0, back: 0     // the dealer's roll (it picks where the wall is broken) and tiles taken from each end
  };
  for (let r = 0; r < 13; r++) for (let k = 0; k < 4; k++) g.hands[(dealer + k) % 4].push(takeFront(g));
  g.hands[dealer].push(takeFront(g));
  for (let k = 0; k < 4; k++) replaceFlowers(g, (dealer + k) % 4);
  g.hands.forEach(h => h.sort(byTile));
  g.drawn = g.hands[dealer][g.hands[dealer].length - 1];
  g.log.push({ type: "deal", dealer });
  return g;
}

// Three dice for the dealer, and taking tiles from either end of the wall (counted, so the table can show it).
function rollDice() {
  const r = new Uint32Array(3);
  globalThis.crypto.getRandomValues(r);
  return [...r].map(x => x % 6 + 1);
}
const takeFront = g => { g.front = (g.front || 0) + 1; return g.wall.shift(); };
const takeBack = g => { g.back = (g.back || 0) + 1; return g.wall.pop(); };

function replaceFlowers(g, seat) {
  let i;
  while ((i = g.hands[seat].findIndex(isBonus)) >= 0) {
    const f = g.hands[seat].splice(i, 1)[0];
    g.flowers[seat].push(f);
    g.log.push({ type: "flower", seat, tile: f });
    if (!g.wall.length) return false;
    g.hands[seat].push(takeBack(g));
  }
  return true;
}

// The player draws (from the back after a kong). Returns false if the wall ran out (a drawn game).
function draw(g, seat, fromBack = false) {
  if (!g.wall.length) { finishDraw(g); return false; }
  let t = fromBack ? takeBack(g) : takeFront(g);
  while (isBonus(t)) {
    g.flowers[seat].push(t);
    g.log.push({ type: "flower", seat, tile: t });
    if (!g.wall.length) { finishDraw(g); return false; }
    t = takeBack(g);
  }
  g.hands[seat].push(t);
  g.hands[seat].sort(byTile);
  g.drawn = t;
  g.turn = seat;
  g.phase = "discard";
  g.lastTile = g.wall.length === 0;
  g.afterKong = fromBack;
  g.log.push({ type: "draw", seat });
  return true;
}

const next = s => (s + 1) % SEATS;

// What a seat may do right now (null if nothing).
export function options(g, seat) {
  if (g.finished) return null;
  if (g.phase === "discard") {
    if (g.turn !== seat) return null;
    const hand = g.hands[seat], c = counts(hand);
    const win = g.drawn ? selfWin(g, seat) : null;          // after claiming a discard you must discard first
    const kongs = [];
    if (g.wall.length) {
      c.forEach((n, i) => { if (n === 4) kongs.push(tileAt(i)); });
      for (const m of g.melds[seat]) if (m.type === "pung" && hand.includes(m.tiles[0])) kongs.push(m.tiles[0]);
    }
    return { kind: "turn", discard: true, win: win ? { faan: win.faan } : null, kongs };
  }
  const cl = g.claims && g.claims[seat];
  if (!cl || cl.decision) return null;
  return { kind: g.phase, tile: g.phase === "rob" ? g.kong.tile : g.last.tile, ...cl.opts };
}

function selfWin(g, seat) {
  const r = evaluate(g, seat, {
    self: true, winTile: g.drawn || g.hands[seat][g.hands[seat].length - 1], afterKong: g.afterKong, lastTile: g.lastTile,
    heavenly: seat === g.dealer && g.fresh[seat] && !g.anyClaim,
    earthly: seat !== g.dealer && g.fresh[seat] && !g.anyClaim
  });
  return r && r.faan >= g.minFaan ? r : null;
}
function ronWin(g, seat, tile, robbing) {
  const r = evaluate(g, seat, { self: false, winTile: tile, robbing, lastTile: g.wall.length === 0 });
  return r && r.faan >= g.minFaan ? r : null;
}

function openClaims(g, tile, by, robbing) {
  g.claims = {};
  for (let k = 1; k < SEATS; k++) {
    const s = (by + k) % SEATS, opts = {}, hand = g.hands[s];
    const n = hand.filter(t => t === tile).length;
    const win = ronWin(g, s, tile, robbing);
    if (win) opts.win = { faan: win.faan };
    if (!robbing && g.wall.length) {
      if (n >= 2) opts.pung = true;
      if (n >= 3) opts.kong = true;
      if (s === next(by) && !isHonor(tile)) {
        const r = +tile[0], su = tile[1], has = x => x >= 1 && x <= 9 && hand.includes(`${x}${su}`);
        const chows = [[r - 2, r - 1], [r - 1, r + 1], [r + 1, r + 2]].filter(([a, b]) => has(a) && has(b)).map(([a, b]) => [`${a}${su}`, `${b}${su}`]);
        if (chows.length) opts.chows = chows;
      }
    }
    if (Object.keys(opts).length) g.claims[s] = { opts, decision: null };
  }
  return Object.keys(g.claims).length > 0;
}

// action: { type: "discard", tile } | { type: "kong", tile } | { type: "win" }   (on your turn)
//         { type: "claim", claim: "pass" | "win" | "pung" | "kong" | "chow", tiles? }   (after someone's discard)
export function act(g, seat, a) {
  if (g.finished) throw new Error("This game is over.");
  if (a.type === "claim") return claim(g, seat, a);
  if (g.phase !== "discard" || g.turn !== seat) throw new Error("It's not your turn.");
  const hand = g.hands[seat];
  if (a.type === "win") {
    const r = g.drawn ? selfWin(g, seat) : null;
    if (!r) throw new Error(g.minFaan ? `That hand isn't complete, or it's under ${g.minFaan} faan.` : "That hand isn't complete.");
    return finishWin(g, seat, -1, g.drawn, r);
  }
  if (a.type === "kong") {
    const t = String(a.tile);
    const opts = options(g, seat);
    if (!opts.kongs.includes(t)) throw new Error("You can't declare a kong with that tile.");
    const pung = g.melds[seat].find(m => m.type === "pung" && m.tiles[0] === t);
    g.fresh[seat] = false;
    if (pung) {                                       // adding to an exposed pung: someone may rob it
      hand.splice(hand.indexOf(t), 1);
      g.kong = { seat, tile: t };
      g.log.push({ type: "add kong", seat, tile: t });
      if (openClaims(g, t, seat, true)) { g.phase = "rob"; return g; }
      return completeAddedKong(g);
    }
    for (let k = 0; k < 4; k++) hand.splice(hand.indexOf(t), 1);
    g.melds[seat].push({ type: "kong", tiles: [t, t, t, t], concealed: true });
    g.log.push({ type: "concealed kong", seat });
    draw(g, seat, true);
    return g;
  }
  if (a.type === "discard") {
    const t = String(a.tile), i = hand.indexOf(t);
    if (i < 0) throw new Error("You don't hold that tile.");
    hand.splice(i, 1);
    g.discards[seat].push({ t });
    g.last = { tile: t, by: seat };
    g.drawn = null; g.afterKong = false; g.fresh[seat] = false;
    g.log.push({ type: "discard", seat, tile: t });
    if (openClaims(g, t, seat, false)) { g.phase = "claim"; return g; }
    return afterDiscard(g);
  }
  throw new Error("Unknown move.");
}

function claim(g, seat, a) {
  if (!(g.phase === "claim" || g.phase === "rob")) throw new Error("There's nothing to claim.");
  const cl = g.claims[seat];
  if (!cl || cl.decision) throw new Error("You can't claim this tile.");
  const o = cl.opts, k = a.claim;
  if (k === "win" && !o.win) throw new Error("That tile doesn't win you the hand.");
  if (k === "pung" && !o.pung) throw new Error("You can't pung that tile.");
  if (k === "kong" && !o.kong) throw new Error("You can't kong that tile.");
  let tiles = null;
  if (k === "chow") {
    tiles = (a.tiles || []).map(String);
    if (!o.chows || !o.chows.some(([x, y]) => (x === tiles[0] && y === tiles[1]) || (x === tiles[1] && y === tiles[0]))) throw new Error("You can't chow with those tiles.");
  }
  if (!["pass", "win", "pung", "kong", "chow"].includes(k)) throw new Error("Unknown claim.");
  cl.decision = { claim: k, tiles };
  if (Object.values(g.claims).every(x => x.decision)) resolve(g);
  return g;
}

// Everyone with an option has answered: the strongest claim takes the tile.
function resolve(g) {
  const robbing = g.phase === "rob";
  const tile = robbing ? g.kong.tile : g.last.tile, by = robbing ? g.kong.seat : g.last.by;
  const claims = g.claims;
  g.claims = null;
  const order = [1, 2, 3].map(k => (by + k) % SEATS).filter(s => claims[s]);
  const pick = kinds => order.find(s => kinds.includes(claims[s].decision.claim));
  const winner = pick(["win"]);
  if (winner !== undefined) {
    const r = ronWin(g, winner, tile, robbing);
    if (robbing) g.kong = null;
    else g.discards[by][g.discards[by].length - 1].claimed = true;
    return finishWin(g, winner, by, tile, r);
  }
  if (robbing) return completeAddedKong(g);
  const taker = pick(["pung", "kong"]) ?? pick(["chow"]);
  if (taker === undefined) return afterDiscard(g);
  const d = claims[taker].decision, hand = g.hands[taker];
  const take = (t, n) => { for (let i = 0; i < n; i++) hand.splice(hand.indexOf(t), 1); };
  g.discards[by][g.discards[by].length - 1].claimed = true;
  g.anyClaim = true;
  g.fresh[taker] = false;
  g.turn = taker; g.phase = "discard"; g.drawn = null;
  if (d.claim === "chow") {
    d.tiles.forEach(t => take(t, 1));
    g.melds[taker].push({ type: "chow", tiles: [...d.tiles, tile].sort(byTile), from: by, claimed: tile });
  } else {
    take(tile, d.claim === "kong" ? 3 : 2);
    g.melds[taker].push({ type: d.claim, tiles: new Array(d.claim === "kong" ? 4 : 3).fill(tile), from: by, claimed: tile });
  }
  g.log.push({ type: d.claim, seat: taker, tile, from: by });
  if (d.claim === "kong") draw(g, taker, true);
  return g;
}

function completeAddedKong(g) {
  const { seat, tile } = g.kong;
  g.kong = null; g.claims = null;
  const m = g.melds[seat].find(x => x.type === "pung" && x.tiles[0] === tile);
  m.type = "kong"; m.tiles.push(tile);
  draw(g, seat, true);
  return g;
}

function afterDiscard(g) {
  g.claims = null;
  if (!g.wall.length) { finishDraw(g); return g; }
  draw(g, next(g.last.by));
  return g;
}

function finishWin(g, winner, from, tile, r) {
  const base = PAY[Math.min(LIMIT, r.faan)], points = [0, 0, 0, 0];
  if (from < 0) for (let s = 0; s < SEATS; s++) { if (s !== winner) { points[s] -= base; points[winner] += base; } }
  else { points[from] -= base * 2; points[winner] += base * 2; }
  g.finished = { reason: "win", winner, from, tile, faan: r.faan, items: r.items, points, hands: g.hands.map(h => h.slice()), winHand: from < 0 ? g.hands[winner].slice() : [...g.hands[winner], tile].sort(byTile) };
  g.phase = "done"; g.turn = -1;
  g.log.push({ type: from < 0 ? "self win" : "win", seat: winner, from, tile, faan: r.faan });
  return g;
}
function finishDraw(g) {
  g.finished = { reason: "draw", winner: -1, from: -1, faan: 0, items: [], points: [0, 0, 0, 0], hands: g.hands.map(h => h.slice()) };
  g.phase = "done"; g.turn = -1; g.claims = null;
  g.log.push({ type: "wall empty" });
  return g;
}

// A player who ran out of time: pass on claims, or throw away the tile just drawn.
export function autoMove(g, seat) {
  const o = options(g, seat);
  if (!o) return null;
  if (o.kind !== "turn") { act(g, seat, { type: "claim", claim: "pass" }); return { type: "claim", claim: "pass" }; }
  const t = g.drawn && g.hands[seat].includes(g.drawn) ? g.drawn : g.hands[seat][g.hands[seat].length - 1];
  act(g, seat, { type: "discard", tile: t });
  return { type: "discard", tile: t };
}

// Who deals next, and the round wind: the dealer keeps the deal after winning or a drawn game.
export function nextDeal(g) {
  const f = g.finished;
  if (!f || f.reason === "draw" || f.winner === g.dealer) return { dealer: g.dealer, round: g.round };
  const dealer = next(g.dealer);
  return { dealer, round: dealer === 0 ? (g.round + 1) % 4 : g.round };
}

// What one viewer may see: their own tiles, everyone's melds, flowers and discards, tile counts.
export function viewFor(g, seat) {
  if (!g) return null;
  const done = !!g.finished;
  return {
    no: g.no, dealer: g.dealer, round: g.round, minFaan: g.minFaan, turn: g.turn, phase: g.phase, wallLeft: g.wall.length,
    counts: g.hands.map(h => h.length), hand: seat >= 0 ? g.hands[seat] : null, drawn: seat >= 0 && g.turn === seat ? g.drawn : null,
    melds: g.melds, flowers: g.flowers, discards: g.discards, last: g.last, kong: g.kong,
    waiting: g.claims ? Object.keys(g.claims).filter(s => !g.claims[s].decision).map(Number) : [],
    options: seat >= 0 ? options(g, seat) : null,
    log: g.log.slice(-60), logCount: g.log.length, finished: g.finished,
    dice: g.dice || null, front: g.front ?? (144 - g.wall.length), back: g.back || 0,
    hands: done ? g.hands : null
  };
}
