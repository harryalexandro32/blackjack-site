// Gaple bots: shared by the browser (bots mode) and the server (empty seats online).
// They only look at their own tiles, the line, how many tiles everyone has left, and who passed on what.
import { newSet, legalMoves, endsOf, has, other, isDouble, pipsOf, SEATS } from "./gaple-engine.js";

// The open ends after a play.
function endsAfter(ends, tile, end) {
  if (!ends) return [+tile[0], +tile[1]];
  return end === "L" ? [other(tile, ends[0]), ends[1]] : [ends[0], other(tile, ends[1])];
}

// How good a play looks to the strong bot.
function rate(g, seat, m, end, unseen) {
  const hand = g.hands[seat], ends = endsOf(g);
  const left = hand.filter(t => t !== m.tile);
  if (!left.length) return 1e6 + (m.ends.length === 2 ? 1 : 0);          // going out wins
  const after = endsAfter(ends, m.tile, end);
  const open = [...new Set(after)];
  const counts = g.hands.map(h => h.length);
  const danger = Math.min(...counts.filter((n, i) => i !== seat));       // an opponent close to going out
  let s = 0;

  // keep my own suits open: tiles I could still play on these ends, and how many I'd be stuck with
  const mine = left.filter(t => open.some(n => has(t, n))).length;
  s += mine * 7;
  if (!mine) s -= 16;
  // variety: the more different numbers I still hold, the harder I am to block
  s += new Set(left.flatMap(t => [+t[0], +t[1]])).size * 1.2;

  // get rid of weight early; doubles fit only one number, so they go first
  s += pipsOf(m.tile) * (danger <= 2 ? 1.6 : 0.9);
  if (isDouble(m.tile)) s += 7;
  // a double I couldn't play any more would be dead weight
  for (const t of left) if (isDouble(t) && !open.includes(+t[0]) && !unseen.some(u => has(u, +t[0])) && !left.some(x => x !== t && has(x, +t[0]))) s -= 6;

  // block: ends the others passed on, and ends with few tiles left out there
  for (let k = 1; k < SEATS; k++) {
    const opp = (seat + k) % SEATS, weight = (k === 1 ? 5 : 3) * (counts[opp] <= 2 ? 2 : 1);
    const dead = open.every(n => g.voids[opp].includes(n));
    if (dead) s += weight * 2;
    else s += open.filter(n => g.voids[opp].includes(n)).length * weight * 0.5;
  }
  const out = unseen.filter(t => open.some(n => has(t, n))).length;       // tiles the others might answer with
  s -= out * (danger <= 2 ? 2.2 : 1.1);

  // closing the game: only when my pips beat what the others are likely holding
  if (!out && !mine) {
    const myPips = left.reduce((a, t) => a + pipsOf(t), 0);
    const theirs = unseen.reduce((a, t) => a + pipsOf(t), 0);
    const least = theirs / Math.max(1, unseen.length) * Math.min(...counts.filter((n, i) => i !== seat));
    s += myPips < least * 0.8 ? 60 : -60;
  }
  return s;
}

// Returns { type: "play", tile, end } or { type: "pass" } for the player whose turn it is.
export function gapleMove(g, seat, skill = "normal") {
  if (g.finished || g.turn !== seat) return null;
  const moves = legalMoves(g, seat);
  if (!moves.length) return { type: "pass" };
  const rnd = Math.random;
  const options = moves.flatMap(m => (g.line.length && m.ends.length === 2 && endsOf(g)[0] !== endsOf(g)[1] ? ["L", "R"] : [m.ends[0]]).map(end => ({ m, end })));
  const go = o => ({ type: "play", tile: o.m.tile, end: o.end });

  // can go out right now?
  if (g.hands[seat].length === 1) return go(options[0]);

  if (skill === "easy") {
    if (rnd() < 0.7) return go(options[Math.floor(rnd() * options.length)]);
    return go(options.slice().sort((a, b) => pipsOf(b.m.tile) - pipsOf(a.m.tile))[0]);
  }
  if (skill !== "hard") {
    // normal: heavy tiles and doubles first, with a little care to keep something playable
    const hand = g.hands[seat];
    const score = o => {
      const after = endsAfter(endsOf(g), o.m.tile, o.end), left = hand.filter(t => t !== o.m.tile);
      return pipsOf(o.m.tile) + (isDouble(o.m.tile) ? 5 : 0) + left.filter(t => after.some(n => has(t, n))).length * 2 + rnd() * 3;
    };
    return go(options.slice().sort((a, b) => score(b) - score(a))[0]);
  }
  // hard: count what's been played and who passed on what
  const seen = new Set([...g.line.map(x => x.t), ...g.hands[seat]]);
  const unseen = newSet().filter(t => !seen.has(t));
  let best = null, bestScore = -Infinity;
  for (const o of options) {
    const s = rate(g, seat, o.m, o.end, unseen) + rnd() * 0.5;
    if (s > bestScore) { bestScore = s; best = o; }
  }
  return go(best);
}
