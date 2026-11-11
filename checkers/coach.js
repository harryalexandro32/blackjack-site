// The checkers coach (games on this device only). It looks ahead a few moves, like the bot does, and then says
// in plain words what a move does: what it captures, what it leaves hanging, and whether a better move was there.
//   hintFor(board, seat, rules)          → the move it would play, with the reason
//   reviewMove(board, seat, rules, move) → a grade for a move just played, the reason, and the better move if any
//   inDanger(board, seat, rules)         → squares of `seat`'s pieces the other side could capture right now
import { legalMoves, applyMove, owner, isKing } from "../supabase/functions/_shared/checkers-engine.js";

const kingVal = rules => (rules === "dam" ? 4 : 2.6);

// How good a position is for the side to move: material first, then advanced men, the centre and the back row.
function evaluate(board, seat, rules) {
  const kv = kingVal(rules);
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq]; if (p === ".") continue;
    const s = owner(p), r = sq >> 3, c = sq & 7;
    let v = isKing(p) ? kv : 1;
    if (!isKing(p)) {
      v += (s === 0 ? 7 - r : r) * 0.04;
      if ((s === 0 && r === 7) || (s === 1 && r === 0)) v += 0.12;
    }
    if (c >= 2 && c <= 5 && r >= 2 && r <= 5) v += 0.06;
    score += s === seat ? v : -v;
  }
  return score;
}

// Look-ahead with a budget so the page never stalls. Returns the value for the side to move and the line it expects.
const BUDGET = 60000;
const OUT = {};
let nodes = 0;
function search(board, toMove, rules, depth, alpha, beta, ply) {
  if (++nodes > BUDGET) throw OUT;
  const moves = legalMoves(board, toMove, rules);
  if (!moves.length) return { v: -1000 + ply, line: [] };                     // no move: lost (later is less bad)
  if ((depth <= 0 && !moves[0].caps.length) || depth <= -6) return { v: evaluate(board, toMove, rules), line: [] };
  let best = { v: -Infinity, line: [] };
  for (const m of moves) {
    const r = search(applyMove(board, m), 1 - toMove, rules, depth - 1, -beta, -alpha, ply + 1);
    const v = -r.v;
    if (v > best.v) best = { v, line: [m, ...r.line] };
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

// Every legal move with its value for the mover, best first. Looks deeper until the budget runs out.
function rank(board, seat, rules, maxDepth = 7) {
  const moves = legalMoves(board, seat, rules);
  let ranked = null;
  nodes = 0;
  for (let d = 1; d <= maxDepth; d++) {
    try {
      const now = moves.map(m => {
        const r = search(applyMove(board, m), 1 - seat, rules, d - 1, -Infinity, Infinity, 1);
        return { m, v: -r.v, line: [m, ...r.line] };
      });
      now.sort((a, b) => b.v - a.v);
      ranked = now;
    } catch (e) { if (e !== OUT) throw e; break; }
  }
  return ranked || moves.map(m => ({ m, v: 0, line: [m] }));
}

const same = (a, b) => a.from === b.from && a.to === b.to && (!a.path || !b.path || a.path.join() === b.path.join());
const count = (board, seat) => { let men = 0, kings = 0; for (const p of board) if (owner(p) === seat) isKing(p) ? kings++ : men++; return { men, kings, all: men + kings }; };
const plural = (n, one, many = one + "s") => `${n === 1 ? "a" : n} ${n === 1 ? one : many}`;
const pieces = n => plural(n, "piece");
const crownsOn = (board, m) => !isKing(board[m.from]) && (m.to >> 3) === (owner(board[m.from]) === 0 ? 0 : 7);

export function inDanger(board, seat, rules) {
  const theirs = legalMoves(board, 1 - seat, rules);
  return new Set(theirs.flatMap(m => m.caps));
}

// What a line of play does for `seat`, in the next few moves: pieces won and lost (captures settle first).
function outcome(board, line, seat) {
  let b = board, plies = 0;
  for (const m of line) {
    if (plies >= 6 && !m.caps.length) break;
    b = applyMove(b, m); plies++;
  }
  const me0 = count(board, seat), op0 = count(board, 1 - seat), me1 = count(b, seat), op1 = count(b, 1 - seat);
  return { lost: me0.all - me1.all, won: op0.all - op1.all, kingsLost: Math.max(0, me0.kings - me1.kings), kingsWon: Math.max(0, op0.kings - op1.kings) };
}

// Why a move is good, in one sentence (or null when there is nothing special to say).
function strengths(board, seat, rules, entry) {
  const m = entry.m, bits = [];
  if (entry.v > 500) return "it wins the game: your opponent runs out of moves";
  if (m.caps.length) bits.push(`it captures ${pieces(m.caps.length)}`);
  if (crownsOn(board, m)) bits.push("it makes a king");
  const o = outcome(board, entry.line, seat), net = o.won - o.lost;
  if (net > 0 && !(m.caps.length && o.won === m.caps.length && !o.lost)) bits.push(`it comes out ${pieces(net)} ahead over the next few moves`);
  if (!bits.length) {
    const before = inDanger(board, seat, rules), after = inDanger(applyMove(board, m), seat, rules);
    if (before.has(m.from) && !after.size) bits.push("it moves a piece that could be captured out of danger");
    else if (before.size && !after.size) bits.push("it leaves none of your pieces open to a capture");
  }
  return bits.length ? bits.join(", and ") : null;
}

// Why a move is bad: what the other side gets in reply.
function weakness(board, seat, entry, names) {
  const after = applyMove(board, entry.m), reply = entry.line[1];
  const o = outcome(board, entry.line, seat), net = o.lost - o.won;
  if (entry.v < -500) return `it loses the game: ${names[1 - seat]} can force a win from here`;
  if (reply && reply.caps.length) {
    const k = reply.caps.filter(sq => isKing(after[sq])).length;
    const what = k ? `${pieces(reply.caps.length)}, including ${k === 1 ? "a king" : k + " kings"}` : pieces(reply.caps.length);
    let s = `${names[1 - seat]} can jump ${what} in reply`;
    if (net <= 0) s += ", though you can win it back";
    else if (o.won > 0) s += `, and after the trades you're ${pieces(net)} down`;
    return s;
  }
  if (net > 0) return `it lets ${names[1 - seat]} win ${pieces(net)} within a few moves`;
  return null;
}

// The grade of a move: how much worse it is than the best one, in pieces.
function gradeOf(loss) {
  if (loss < 0.12) return "good";
  if (loss < 0.45) return "inaccuracy";
  if (loss < 0.9) return "mistake";
  return "blunder";
}
export const GRADE_NAME = { best: "Best move", good: "Good move", forced: "Only move", inaccuracy: "Inaccuracy", mistake: "Mistake", blunder: "Blunder" };

// names: [name of seat 0, name of seat 1] as the coach should say them ("you", "Rosa", …)
export function reviewMove(board, seat, rules, move, names = ["Light", "Dark"]) {
  const ranked = rank(board, seat, rules);
  const mine = ranked.find(e => same(e.m, move)) || ranked.find(e => e.m.from === move.from && e.m.to === move.to);
  if (!mine) return null;
  const best = ranked[0];
  if (ranked.length === 1) {
    const why = strengths(board, seat, rules, mine);
    return { grade: "forced", text: mine.m.caps.length ? `You had to capture${why ? ": " + why : "."}${why ? "." : ""}` : "It was your only legal move." };
  }
  const loss = Math.max(0, best.v - mine.v);
  let grade = gradeOf(loss);
  if (grade === "good" && same(mine.m, best.m)) grade = "best";
  if (grade === "best" || grade === "good") {
    const why = strengths(board, seat, rules, mine);
    return { grade, text: why ? cap(why) + "." : grade === "best" ? "The move I'd have picked too." : "A sound move." };
  }
  const bad = weakness(board, seat, mine, names), good = strengths(board, seat, rules, best);
  const text = (bad ? cap(bad) + ". " : "") + (good ? `A better move was there: ${good}.` : grade === "inaccuracy" ? "A slightly better move was there." : "A safer move was there.");
  return { grade, text, better: best.m };
}

export function hintFor(board, seat, rules) {
  const ranked = rank(board, seat, rules);
  if (!ranked.length) return null;
  const best = ranked[0];
  if (ranked.length === 1) return { move: best.m, text: best.m.caps.length ? "You have to capture, and this is the only way." : "This is your only legal move." };
  let why = strengths(board, seat, rules, best);
  const losing = ranked.slice(1).filter(e => best.v - e.v >= 0.9).length;
  if (!why && losing >= Math.ceil((ranked.length - 1) / 2)) why = "most other moves give away a piece here";
  if (!why) why = "it keeps your pieces covered and makes progress";
  return { move: best.m, text: `Try the highlighted move: ${why}.` };
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
