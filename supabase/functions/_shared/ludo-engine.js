// Ludo, as a pure JSON-friendly engine shared by the browser and the server.
//
// Four colours (seats 0-3: red, green, yellow, blue), four tokens each, a 52-square track round a 15x15 board.
// A token's progress p: -1 = at home base, 0..50 = on the track (0 = its own start square), 51..55 = its home
// column, 56 = finished. Classic rules: roll a 6 to bring a token out; a 6 gives another roll, but three 6s in a
// row lose the turn; landing on another colour's token sends it back to base, except on the start and star squares;
// you need the exact roll to finish. First to bring all four tokens home wins.
// House options (rules): leave16 (a 1 or a 6 brings a token out), captureBonus (a capture earns another roll),
// blocks (two tokens of one colour on a square can't be passed or landed on), mustCapture (capture when you can),
// homeBonus (bringing a token home earns another roll), pairSafe (two tokens of one colour on a square can't be captured).
// Scoring: every other player pays the winner 1 point per token they haven't brought home.

export const SEATS = 4;
export const COLORS = ["red", "green", "yellow", "blue"];
export const FINISH = 56;
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);       // start squares and stars (track squares)
// Which colours play at a table of 2, 3 or 4: two players face each other across the board.
export const TABLES = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };
export const DEFAULT_RULES = { leave16: false, captureBonus: false, blocks: false, mustCapture: false, homeBonus: false, pairSafe: false };

// ---------- the board ----------
// Track squares as [col, row] on the 15x15 grid, starting at red's start square and going clockwise.
const seg = (a, b, fixed, axis) => { const out = []; const step = a <= b ? 1 : -1; for (let v = a; v !== b + step; v += step) out.push(axis === "x" ? [v, fixed] : [fixed, v]); return out; };
export const TRACK = [
  ...seg(1, 5, 6, "x"), ...seg(5, 0, 6, "y"), [7, 0], [8, 0], ...seg(1, 5, 8, "y"), ...seg(9, 14, 6, "x"), [14, 7], [14, 8],
  ...seg(13, 9, 8, "x"), ...seg(9, 14, 8, "y"), [7, 14], [6, 14], ...seg(13, 9, 6, "y"), ...seg(5, 0, 8, "x"), [0, 7], [0, 6]
];
// each colour's home column (p = 51..55) and the finish in the middle
export const HOME_COLUMN = [
  seg(1, 5, 7, "x"), seg(1, 5, 7, "y"), seg(13, 9, 7, "x"), seg(13, 9, 7, "y")
];
// the four circles in each base, centred in its 6x6 corner (the corner's middle is 3 squares in)
export const BASE_SPOTS = [
  [[2, 2], [4, 2], [2, 4], [4, 4]], [[11, 2], [13, 2], [11, 4], [13, 4]],
  [[11, 11], [13, 11], [11, 13], [13, 13]], [[2, 11], [4, 11], [2, 13], [4, 13]]
];
// where finished pieces stand: inside each colour's triangle in the middle, near its outer edge
// (red's triangle points right from the left side, green's down from the top, and so on)
export const FINISH_SPOTS = [[6.5, 7.5], [7.5, 6.55], [8.5, 7.5], [7.5, 8.62]];
export const startOf = seat => seat * 13;
// the track square a token stands on, or -1 off the track
export const squareOf = (seat, p) => p >= 0 && p <= 50 ? (startOf(seat) + p) % 52 : -1;
// where a token is drawn: [col, row] (centre of the cell)
export function cellOf(seat, p, i = 0) {
  if (p < 0) return BASE_SPOTS[seat][i];
  if (p >= FINISH) return FINISH_SPOTS[seat];
  if (p > 50) { const [c, r] = HOME_COLUMN[seat][p - 51]; return [c + 0.5, r + 0.5]; }
  const [c, r] = TRACK[squareOf(seat, p)];
  return [c + 0.5, r + 0.5];
}

function rollDie() {
  const r = new Uint32Array(1);
  globalThis.crypto.getRandomValues(r);
  return r[0] % 6 + 1;
}

// ---------- a game ----------
// g = { no, rules, active, tokens: [[p x4] x4], turn, phase: "roll" | "move", dice, sixes, legal, log, finished }
// active lists the colours in play (all four unless told otherwise); the others sit out and are skipped.
export function startGame(no, { rules = {}, first = 0, seats = null } = {}) {
  const active = [0, 1, 2, 3].filter(s => !Array.isArray(seats) || seats.includes(s));
  if (active.length < 2) throw new Error("Ludo needs at least two players.");
  if (!active.includes(first)) first = active[0];
  return {
    no, rules: { ...DEFAULT_RULES, ...rules }, active, tokens: [0, 1, 2, 3].map(() => [-1, -1, -1, -1]),
    turn: first, phase: "roll", dice: null, sixes: 0, legal: [], log: [{ type: "start", seat: first }], finished: null, rolls: 0
  };
}
const inPlay = (g, s) => !g.active || g.active.includes(s);

// Tokens of other colours on a track square: { seat: count }
function occupants(g, sq) {
  const out = {};
  g.tokens.forEach((ts, s) => ts.forEach(p => { if (squareOf(s, p) === sq) out[s] = (out[s] || 0) + 1; }));
  return out;
}
const blockAt = (g, sq, me) => g.rules.blocks && Object.entries(occupants(g, sq)).some(([s, n]) => +s !== me && n >= 2);

// What one token would do with this roll: null if it can't move.
export function moveOf(g, seat, i, roll) {
  const p = g.tokens[seat][i];
  if (p >= FINISH) return null;
  if (p < 0) {
    if (!(roll === 6 || (g.rules.leave16 && roll === 1))) return null;
    const sq = squareOf(seat, 0);
    if (blockAt(g, sq, seat)) return null;
    return { token: i, from: -1, to: 0, captures: captured(g, seat, sq) };
  }
  const to = p + roll;
  if (to > FINISH) return null;                               // exact roll to finish
  if (g.rules.blocks) for (let q = p + 1; q <= Math.min(to, 50); q++) if (blockAt(g, squareOf(seat, q), seat)) return null;
  const sq = squareOf(seat, to);
  return { token: i, from: p, to, captures: sq >= 0 ? captured(g, seat, sq) : [] };
}
function captured(g, seat, sq) {
  if (SAFE.has(sq)) return [];
  const out = [];
  g.tokens.forEach((ts, s) => {
    if (s === seat) return;
    const here = ts.map((p, i) => (squareOf(s, p) === sq ? i : -1)).filter(i => i >= 0);
    if (g.rules.pairSafe && here.length >= 2) return;           // a pair of one colour protects itself
    for (const i of here) out.push([s, i]);
  });
  return out;
}
export function legalMoves(g, seat, roll) {
  const moves = [0, 1, 2, 3].map(i => moveOf(g, seat, i, roll)).filter(Boolean);
  if (g.rules.mustCapture && moves.some(m => m.captures.length)) return moves.filter(m => m.captures.length);
  return moves;
}

// the next colour in play, clockwise
function next(g, s) { for (let k = 1; k <= SEATS; k++) { const t = (s + k) % SEATS; if (inPlay(g, t)) return t; } return s; }
function passTurn(g, seat) { g.turn = next(g, seat); g.phase = "roll"; g.dice = null; g.sixes = 0; g.legal = []; }

// action: { type: "roll" } | { type: "move", token }
export function act(g, seat, a) {
  if (g.finished) throw new Error("This game is over.");
  if (g.turn !== seat) throw new Error("It's not your turn.");
  if (a.type === "roll") {
    if (g.phase !== "roll") throw new Error("Move a token first.");
    const d = typeof a.die === "number" ? a.die : rollDie();     // tests can choose the roll
    g.dice = d; g.rolls += 1;
    g.sixes = d === 6 ? g.sixes + 1 : 0;
    g.log.push({ type: "roll", seat, dice: d });
    if (g.sixes === 3) { g.log.push({ type: "three sixes", seat }); passTurn(g, seat); return g; }
    const moves = legalMoves(g, seat, d);
    if (!moves.length) {
      g.log.push({ type: "no move", seat });
      if (d === 6) { g.phase = "roll"; g.legal = []; } else passTurn(g, seat);
      return g;
    }
    g.phase = "move"; g.legal = moves;
    return g;
  }
  if (a.type === "move") {
    if (g.phase !== "move") throw new Error("Roll the die first.");
    const m = g.legal.find(x => x.token === +a.token);
    if (!m) throw new Error("That token can't move.");
    g.tokens[seat][m.token] = m.to;
    for (const [s, i] of m.captures) g.tokens[s][i] = -1;
    g.log.push({ type: "move", seat, token: m.token, from: m.from, to: m.to, captures: m.captures });
    if (g.tokens[seat].every(p => p >= FINISH)) return finish(g, seat);
    const again = g.dice === 6 || (m.captures.length && g.rules.captureBonus) || (m.to === FINISH && g.rules.homeBonus);
    if (again) { g.phase = "roll"; g.legal = []; } else passTurn(g, seat);
    return g;
  }
  throw new Error("Unknown move.");
}

function finish(g, winner) {
  const points = [0, 0, 0, 0];
  for (let s = 0; s < SEATS; s++) if (s !== winner && inPlay(g, s)) { const owe = g.tokens[s].filter(p => p < FINISH).length; points[s] -= owe; points[winner] += owe; }
  g.finished = { winner, points };
  g.phase = "done"; g.turn = -1; g.legal = [];
  g.log.push({ type: "win", seat: winner });
  return g;
}

// A player who ran out of time: roll, or move the token furthest along.
export function autoMove(g) {
  const seat = g.turn;
  if (g.finished || seat < 0) return null;
  if (g.phase === "roll") { act(g, seat, { type: "roll" }); return { type: "roll" }; }
  const m = g.legal.slice().sort((a, b) => b.to - a.to)[0];
  act(g, seat, { type: "move", token: m.token });
  return { type: "move", token: m.token };
}

export function viewFor(g, seat) {
  if (!g) return null;
  return {
    no: g.no, rules: g.rules, active: g.active || [0, 1, 2, 3], tokens: g.tokens, turn: g.turn, phase: g.phase, dice: g.dice, sixes: g.sixes,
    legal: seat >= 0 && g.turn === seat ? g.legal : [], log: g.log.slice(-40), logCount: g.log.length, finished: g.finished, rolls: g.rolls
  };
}
