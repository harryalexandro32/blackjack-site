// Mahjong bots, shared by the browser (bots mode) and the server (empty seats online).
// They see only their own tiles and what's on the table (discards, melds, flowers).
// Four levels. Expert counts every tile on the table exactly. The others keep track the way people do: they
// always know the melds and the latest discards, but older discards slip their mind (more of them the lower the
// level), and their judgement of close calls wobbles a little. Easy also throws a careless tile now and then.
// Each turn they pick the discard that leaves the hand closest to ready (shanten) with the most useful tiles still
// unseen (ukeire). When the table needs 3 faan they also steer towards a hand that can reach it: one suit,
// all pungs, or dragon and wind pungs, and only claim discards that fit that plan.
import { counts, shanten, indexOf, tileAt, isHonor, isDragon, options, act, seatWindOf } from "./mahjong-engine.js";

const rnd = Math.random;

// How well each level remembers the discards: the last `fresh` tiles of each player are always remembered,
// older ones with probability `keep`. `wobble` is how far its judgement of a discard can be off (in useful tiles),
// and `slip` is how often it throws one of its next-best tiles instead of the best.
const MEMORY = {
  easy: { fresh: 3, keep: 0.45, wobble: 12, slip: 0.35 },
  normal: { fresh: 4, keep: 0.6, wobble: 8, slip: 0.1 },
  hard: { fresh: 6, keep: 0.82, wobble: 3, slip: 0 },
  expert: { fresh: Infinity, keep: 1, wobble: 0, slip: 0 }
};
const memoryOf = skill => MEMORY[skill] || MEMORY.normal;
// The same discard is remembered or forgotten for the whole game (a steady 0..1 number per game, seat and tile thrown).
function recall(g, seat, player, k) {
  let h = ((g.no | 0) * 73856093) ^ ((seat + 1) * 19349663) ^ ((player + 1) * 83492791) ^ ((k + 1) * 2654435761);
  h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Tiles this seat believes nobody has shown yet.
function unseen(g, seat, skill = "expert") {
  const mem = memoryOf(skill);
  const seen = new Array(34).fill(0);
  const add = t => { if (t[1] !== "f") seen[indexOf(t)]++; };
  g.hands[seat].forEach(add);
  g.discards.forEach((d, player) => d.forEach((x, k) => {
    if (x.claimed) return;
    // your own discards and everyone's recent ones are remembered; older ones may have slipped
    if (player === seat || d.length - k <= mem.fresh || recall(g, seat, player, k) < mem.keep) add(x.t);
  }));
  g.melds.forEach(ms => ms.forEach(m => m.tiles.forEach(add)));
  return seen.map(n => Math.max(0, 4 - n));
}

// The plan: which hand to aim for.
function plan(g, seat) {
  const all = [...g.hands[seat], ...g.melds[seat].flatMap(m => m.tiles)];
  const bySuit = { m: 0, p: 0, s: 0 };
  let honors = 0;
  for (const t of all) { if (isHonor(t)) honors++; else bySuit[t[1]]++; }
  const suit = Object.keys(bySuit).sort((a, b) => bySuit[b] - bySuit[a])[0];
  const c = counts(g.hands[seat]);
  const pairs = c.filter(n => n >= 2).length + g.melds[seat].filter(m => m.type !== "chow").length;
  const sw = 27 + seatWindOf(g, seat), rw = 27 + g.round;
  const valueHonor = i => i >= 31 || i === sw || i === rw;
  const valuePairs = c.reduce((a, n, i) => a + (n >= 2 && valueHonor(i) ? 1 : 0), 0) + g.melds[seat].filter(m => m.type !== "chow" && valueHonor(indexOf(m.tiles[0]))).length;
  const need = g.minFaan || 0;
  const flushFit = bySuit[suit] + honors;
  if (need >= 3 || flushFit >= 11) {
    if (flushFit >= (need >= 3 ? 8 : 11)) return { kind: "flush", suit, valueHonor };
    if (pairs >= 4) return { kind: "pungs", valueHonor };
  }
  return { kind: need >= 3 ? "value" : "fast", suit, valueHonor, valuePairs };
}

const offPlan = (p, t) => p.kind === "flush" && !isHonor(t) && t[1] !== p.suit;

// How good a hand is after throwing tile t: lower is better.
function rate(g, seat, hand, p, left) {
  const c = counts(hand), m = g.melds[seat].length;
  const sh = shanten(c, m);
  let uke = 0;
  const near = i => c[i] || (i < 27 && [-2, -1, 1, 2].some(d => { const j = i + d; return j >= 0 && j < 27 && Math.floor(j / 9) === Math.floor(i / 9) && c[j]; }));
  const orphan = i => i >= 27 || i % 9 === 0 || i % 9 === 8;
  for (let i = 0; i < 34; i++) {
    if (!left[i] || !(near(i) || (m === 0 && orphan(i)))) continue;   // a tile far from everything can't help
    c[i]++;
    if (shanten(c, m) < sh) uke += left[i];
    c[i]--;
  }
  let s = sh * 100 - uke;
  // keep the plan's tiles
  if (p.kind === "flush") s += hand.filter(t => offPlan(p, t)).length * 40;
  if (p.kind === "pungs") s -= c.filter(n => n >= 2).length * 12;
  if (p.kind === "value") s -= c.reduce((a, n, i) => a + (n >= 2 && p.valueHonor(i) ? 25 : n === 1 && p.valueHonor(i) ? 6 : 0), 0);
  return s;
}

function chooseDiscard(g, seat, skill) {
  const hand = g.hands[seat], p = plan(g, seat), left = unseen(g, seat, skill), wobble = memoryOf(skill).wobble;
  const kinds = [...new Set(hand)];
  const scored = kinds.map(t => {
    const rest = hand.slice(); rest.splice(rest.indexOf(t), 1);
    let s = rate(g, seat, rest, p, left) + (wobble ? (rnd() - 0.5) * 2 * wobble : 0);
    // small preferences between equal choices: lonely honours and terminals go first, valuable honours stay
    const i = indexOf(t);
    if (isHonor(t) && hand.filter(x => x === t).length === 1) s -= p.valueHonor(i) ? 1 : 3;
    else if (!isHonor(t) && (t[0] === "1" || t[0] === "9")) s -= 1;
    // late in the hand, careful players avoid tiles nobody has thrown (hard bots only)
    if ((skill === "hard" || skill === "expert") && g.wall.length < 30 && !g.discards.some(d => d.some(x => x.t === t))) s += 4;
    return { t, s };
  }).sort((a, b) => a.s - b.s);
  if (rnd() < memoryOf(skill).slip) return scored[Math.min(scored.length - 1, 1 + Math.floor(rnd() * 2))].t;
  return scored[0].t;
}

// Is it worth claiming this discard into a meld?
function claimWorth(g, seat, o, skill) {
  const p = plan(g, seat), t = o.tile, i = indexOf(t);
  const c = counts(g.hands[seat]), m = g.melds[seat].length;
  const before = shanten(c, m);
  const after = (remove, extraMeld = 1) => {
    const cc = c.slice(); remove.forEach(x => cc[indexOf(x)]--);
    // the best discard after the claim
    let best = 99;
    for (let k = 0; k < 34; k++) if (cc[k]) { cc[k]--; best = Math.min(best, shanten(cc, m + extraMeld)); cc[k]++; }
    return best;
  };
  const fits = p.kind === "fast" || (p.kind === "flush" && (isHonor(t) || t[1] === p.suit)) || p.kind === "pungs" || (p.kind === "value" && p.valueHonor(i));
  if (o.kong && (fits || isDragon(t))) return { claim: "kong" };
  if (o.pung) {
    const worth = p.valueHonor(i) || (fits && after([t, t]) < before);
    if (worth && (skill !== "easy" || rnd() < 0.7)) return { claim: "pung" };
  }
  if (o.chows && (p.kind === "fast" || (p.kind === "flush" && t[1] === p.suit))) {
    for (const pair of o.chows) if (after(pair) < before && rnd() < (skill === "expert" ? 0.9 : skill === "hard" ? 0.85 : 0.75)) return { claim: "chow", tiles: pair };
  }
  return { claim: "pass" };
}

// The bot's move for this seat: { type: "discard", tile } | { type: "kong", tile } | { type: "win" } | { type: "claim", ... }, or null.
export function mahjongMove(g, seat, skill = "normal") {
  const o = options(g, seat);
  if (!o) return null;
  if (o.kind === "turn") {
    if (o.win) return { type: "win" };
    for (const t of o.kongs) {
      // a kong costs nothing if the four tiles aren't doing other work
      const c = counts(g.hands[seat]), m = g.melds[seat].length, before = shanten(c, m);
      const cc = c.slice(); cc[indexOf(t)] -= cc[indexOf(t)] >= 4 ? 4 : 1;
      if (shanten(cc, m + (c[indexOf(t)] >= 4 ? 1 : 0)) <= before) return { type: "kong", tile: t };
    }
    return { type: "discard", tile: chooseDiscard(g, seat, skill) };
  }
  if (o.win) return { type: "claim", claim: "win" };
  if (o.kind === "rob") return { type: "claim", claim: "pass" };
  return { type: "claim", ...claimWorth(g, seat, o, skill) };
}

export function playBot(g, seat, skill) {
  const m = mahjongMove(g, seat, skill);
  if (m) act(g, seat, m);
  return m;
}
export { tileAt };
