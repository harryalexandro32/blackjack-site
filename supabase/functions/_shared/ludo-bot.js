// Ludo bots, shared by the browser (bots mode) and the server (empty seats online).
// They weigh each move: capturing, bringing a token home, getting a token out, reaching a safe square or the home
// column, and how many opponents could land on the token afterwards (or on it where it stands now).
import { squareOf, SAFE, FINISH, act } from "./ludo-engine.js";

// How many opponent tokens could hit track square sq with one roll (1-6 squares behind it).
function threats(g, seat, sq) {
  if (sq < 0 || SAFE.has(sq)) return 0;
  let n = 0;
  g.tokens.forEach((ts, s) => {
    if (s === seat) return;
    ts.forEach(p => {
      const at = squareOf(s, p);
      if (at < 0) return;
      const gap = (sq - at + 52) % 52;
      // a token can't run past its own home entry onto that square
      if (gap >= 1 && gap <= 6 && p + gap <= 50) n++;
    });
    // tokens in base can come out onto their start square
    if (ts.some(p => p < 0) && squareOf(s, 0) === sq) n += 0.5;
  });
  return n;
}

// With the "pairs are safe" rule: would this token share its square with another of its own colour?
const paired = (g, seat, token, sq) => !!g.rules.pairSafe && sq >= 0 && g.tokens[seat].some((p, i) => i !== token && squareOf(seat, p) === sq);

function score(g, seat, m, skill) {
  let s = m.to / 4;
  if (m.captures.length) s += 100 + m.captures.reduce((a, [o, i]) => a + Math.max(0, g.tokens[o][i]) / 2, 0);
  if (m.to === FINISH) s += g.rules.homeBonus ? 95 : 80;        // home, and with that rule another roll too
  if (m.from < 0) s += 60;
  if (m.to > 50 && m.from <= 50) s += 30;                       // into the home column: safe from now on
  const to = squareOf(seat, m.to), from = m.from >= 0 ? squareOf(seat, m.from) : -1;
  const pairTo = paired(g, seat, m.token, to), pairFrom = paired(g, seat, m.token, from);
  if (to >= 0 && (SAFE.has(to) || pairTo)) s += 25;
  if (skill !== "easy") {
    if (!pairTo) s -= threats(g, seat, to) * 40;
    if (!pairFrom) s += threats(g, seat, from) * 30;            // getting out of danger
    // leaving a pair leaves the token behind on its own
    if (pairFrom && g.tokens[seat].filter((p, i) => i !== m.token && squareOf(seat, p) === from).length === 1) s -= threats(g, seat, from) * 25;
  }
  return s;
}

// { type: "roll" } or { type: "move", token } for the player whose turn it is.
export function ludoMove(g, seat, skill = "normal") {
  if (g.finished || g.turn !== seat) return null;
  if (g.phase === "roll") return { type: "roll" };
  const moves = g.legal;
  if (skill === "easy" && Math.random() < 0.4) return { type: "move", token: moves[Math.floor(Math.random() * moves.length)].token };
  const best = moves.map(m => ({ m, s: score(g, seat, m, skill) + (skill === "normal" ? Math.random() * 6 : 0) })).sort((a, b) => b.s - a.s)[0];
  return { type: "move", token: best.m.token };
}

export function playBot(g, seat, skill) {
  const m = ludoMove(g, seat, skill);
  if (m) act(g, seat, m);
  return m;
}
