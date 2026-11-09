// Checkers bots: a look-ahead search (alpha-beta) with a simple sense of a good position.
//   easy:   looks one move ahead and often picks a merely OK move
//   normal: 3 moves ahead
//   hard:   6 moves ahead (deeper when few pieces are left)
import { legalMoves, applyMove, owner, isKing } from "./checkers-engine.js";

const rand = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;

// Score for `seat`: material first (a flying king is worth much more), then advancing men, the centre, and
// keeping the back row while the opponent still has men to crown.
function evaluate(board, seat, rules) {
  const kingVal = rules === "dam" ? 4 : 2.6;
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq]; if (p === ".") continue;
    const s = owner(p), sign = s === seat ? 1 : -1, r = sq >> 3, c = sq & 7;
    let v = isKing(p) ? kingVal : 1;
    if (!isKing(p)) {
      const adv = s === 0 ? 7 - r : r;                  // rows travelled
      v += adv * 0.04;
      if ((s === 0 && r === 7) || (s === 1 && r === 0)) v += 0.12;   // guarding the back row
    }
    if (c >= 2 && c <= 5 && r >= 2 && r <= 5) v += 0.06;
    score += sign * v;
  }
  return score;
}

// A budget of positions per move keeps every move quick (it matters on the server); deeper looks stop early.
const BUDGET = 40000;
let nodes = 0;
const OUT = {};
function search(board, toMove, seat, rules, depth, alpha, beta) {
  if (++nodes > BUDGET) throw OUT;
  const moves = legalMoves(board, toMove, rules);
  if (!moves.length) return toMove === seat ? -1000 - depth : 1000 + depth;   // no move = lost (sooner is worse)
  // keep looking while captures are hanging, so the bot doesn't stop in the middle of an exchange
  if (depth <= 0 && !moves[0].caps.length) return evaluate(board, seat, rules);
  if (depth <= -4) return evaluate(board, seat, rules);
  const maxing = toMove === seat;
  let best = maxing ? -Infinity : Infinity;
  for (const m of moves) {
    const v = search(applyMove(board, m), 1 - toMove, seat, rules, depth - 1, alpha, beta);
    if (maxing) { if (v > best) best = v; if (v > alpha) alpha = v; }
    else { if (v < best) best = v; if (v < beta) beta = v; }
    if (beta <= alpha) break;
  }
  return best;
}

export function checkersMove(g, seat, skill = "normal") {
  const moves = g.legal;
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  const pieces = [...g.board].filter(p => p !== ".").length;
  const depth = skill === "easy" ? 1 : skill === "hard" ? (pieces <= 8 ? 8 : 6) : 3;
  // look 1 move ahead, then 2, … up to the skill's depth, keeping the deepest look that finished in budget
  let scored = null;
  nodes = 0;
  for (let d = 1; d <= depth; d++) {
    try {
      const now = moves.map(m => ({ m, v: search(applyMove(g.board, m), 1 - seat, seat, g.rules, d - 1, -Infinity, Infinity) + rand() * 0.02 }));
      now.sort((a, b) => b.v - a.v);
      scored = now;
    } catch (e) { if (e !== OUT) throw e; break; }
  }
  if (!scored) scored = moves.map(m => ({ m, v: rand() }));
  if (skill === "easy" && rand() < 0.35) return scored[Math.min(scored.length - 1, 1 + Math.floor(rand() * 2))].m;
  return scored[0].m;
}
