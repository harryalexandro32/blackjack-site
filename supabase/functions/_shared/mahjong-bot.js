// Mahjong bots, shared by the browser (bots mode) and the server (empty seats online).
// They see only their own tiles and what's on the table (discards, melds, flowers).
// Each turn they pick the discard that leaves the hand closest to ready (shanten) with the most useful tiles still
// unseen (ukeire). When the table needs 3 faan they also steer towards a hand that can reach it: one suit,
// all pungs, or dragon and wind pungs, and only claim discards that fit that plan.
import { counts, shanten, indexOf, tileAt, isHonor, isDragon, options, act, seatWindOf } from "./mahjong-engine.js";

const rnd = Math.random;

// Tiles nobody can see yet, from this seat's point of view.
function unseen(g, seat) {
  const seen = new Array(34).fill(0);
  const add = t => { if (t[1] !== "f") seen[indexOf(t)]++; };
  g.hands[seat].forEach(add);
  g.discards.forEach(d => d.forEach(x => { if (!x.claimed) add(x.t); }));
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
  const hand = g.hands[seat], p = plan(g, seat), left = unseen(g, seat);
  const kinds = [...new Set(hand)];
  const scored = kinds.map(t => {
    const rest = hand.slice(); rest.splice(rest.indexOf(t), 1);
    let s = rate(g, seat, rest, p, left);
    // small preferences between equal choices: lonely honours and terminals go first, valuable honours stay
    const i = indexOf(t);
    if (isHonor(t) && hand.filter(x => x === t).length === 1) s -= p.valueHonor(i) ? 1 : 3;
    else if (!isHonor(t) && (t[0] === "1" || t[0] === "9")) s -= 1;
    // late in the hand, careful players avoid tiles nobody has thrown (hard bots only)
    if (skill === "hard" && g.wall.length < 30 && !g.discards.some(d => d.some(x => x.t === t))) s += 4;
    return { t, s };
  }).sort((a, b) => a.s - b.s);
  if (skill === "easy" && rnd() < 0.35) return scored[Math.min(scored.length - 1, Math.floor(rnd() * 3))].t;
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
    for (const pair of o.chows) if (after(pair) < before && rnd() < (skill === "hard" ? 0.9 : 0.75)) return { claim: "chow", tiles: pair };
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
