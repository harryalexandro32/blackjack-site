// Gaple (Indonesian dominoes), as a pure JSON-friendly engine shared by the browser and the server.
//
// A double-six set: 28 tiles. 4 players, 7 tiles each, nothing left to draw from.
// The first game starts with whoever holds the opening tile (double six, or double blank: a table option),
// and they have to play it. Later games start with the last winner, who leads any tile.
// On your turn you play a tile that matches either open end of the line. If nothing fits you have to pass;
// you can't pass while you hold a tile that fits.
// The game ends when someone plays their last tile, or when it's blocked (nobody can play). Blocked: the
// fewest pips left wins; a tie goes to fewer tiles, then to the tied player nearest after the last one to play.
// Scoring: every loser pays the winner 1 point per pip left. A lone double blank left counts 25 (an option).
// Gaple (an option): going out with a tile that fits both open ends doubles what everyone pays.
//
// A tile is a two-digit string, low pip first: "00", "36", "66".

export const SEATS = 4;
export const HAND = 7;
export const OPENERS = ["66", "00"];

export const lo = t => +t[0];
export const hi = t => +t[1];
export const isDouble = t => t[0] === t[1];
export const pipsOf = t => lo(t) + hi(t);
export const has = (t, n) => lo(t) === n || hi(t) === n;
export const other = (t, n) => (lo(t) === n ? hi(t) : lo(t));     // the pip at the far side of n
export const byWeight = (a, b) => pipsOf(a) - pipsOf(b) || hi(a) - hi(b);
export const tileName = t => `${t[0]}-${t[1]}`;

export function newSet() {
  const d = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) d.push(`${a}${b}`);
  return d;
}

// A shuffled set from any shuffled list of at least 28 different things (the table server hands every game
// a shuffled deck of cards): the order in which 28 fixed cards turn up is the order of the tiles.
export function shuffleFrom(deck) {
  const ranks = deck.slice().sort().slice(0, 28), set = newSet();
  const out = deck.filter(c => ranks.includes(c)).map(c => set[ranks.indexOf(c)]);
  if (out.length !== 28 || new Set(out).size !== 28) throw new Error("Can't shuffle the tiles from that deck.");
  return out;
}

// What a hand costs its holder: its pips, or 25 for a lone double blank (if the table plays that).
export function handValue(hand, blank25 = true) {
  if (blank25 && hand.length === 1 && hand[0] === "00") return 25;
  return hand.reduce((a, t) => a + pipsOf(t), 0);
}

// ---------- a game ----------
// game = { no, hands: [[tiles]...], turn, line: [{ t, a, b }] (left to right; a faces left, b faces right),
//          origin (where the first tile sits in the line), opener: the tile the first play must be, or null,
//          lastBy, passed: [bool] (their last turn was a pass), voids: [[pips]] (ends each player passed on),
//          blank25, gapleBonus, log: [], finished: null | { winner, reason, gaple, mult, values, points, left } }

// Deals a new game. shuffled() must return a freshly shuffled set of 28 tiles.
// leader: the last winner, or -1 for the first game (the opening tile starts).
export function startGame(no, shuffled, leader = -1, opts = {}) {
  const set = shuffled();
  const hands = [0, 1, 2, 3].map(i => set.slice(i * HAND, i * HAND + HAND).sort(byWeight));
  const first = !(leader >= 0 && leader < SEATS);
  const opener = first ? (OPENERS.includes(opts.opener) ? opts.opener : "66") : null;
  const turn = first ? hands.findIndex(h => h.includes(opener)) : leader;
  return {
    no, hands, turn, line: [], origin: 0, opener, lastBy: -1,
    passed: [false, false, false, false], voids: [[], [], [], []],
    blank25: opts.blank25 !== false, gapleBonus: opts.gapleBonus !== false, log: [], finished: null
  };
}

// The two open ends: [left, right], or null before the first tile.
export const endsOf = g => (g.line.length ? [g.line[0].a, g.line[g.line.length - 1].b] : null);

// Every play a hand has on a line: [{ tile, ends: ["L", "R"] (where it fits) }].
// mustPlay: the opening tile, on the first play of the first game.
export function movesFor(hand, ends, mustPlay = null) {
  if (!ends) return hand.filter(t => !mustPlay || t === mustPlay).map(t => ({ tile: t, ends: ["R"] }));
  const out = [];
  for (const t of hand) {
    const fit = [];
    if (has(t, ends[0])) fit.push("L");
    if (has(t, ends[1])) fit.push("R");
    if (fit.length) out.push({ tile: t, ends: fit });
  }
  return out;
}
export const legalMoves = (g, seat) => movesFor(g.hands[seat], endsOf(g), g.line.length ? null : g.opener);

// What the player whose turn it is may do.
export function legal(g, seat) {
  if (g.finished || g.turn !== seat) return null;
  const moves = legalMoves(g, seat);
  return { moves, canPass: !moves.length, mustPlay: g.line.length ? null : g.opener, ends: endsOf(g) };
}

// Why a play isn't allowed, or "" if it is. end: "L" or "R" (needed only when the tile fits both and it matters).
export function whyNot(g, seat, tile, end) {
  if (g.finished || g.turn !== seat) return "It's not your turn.";
  if (!g.hands[seat].includes(tile)) return "You can only play a tile you hold.";
  if (!g.line.length) return g.opener && tile !== g.opener ? `The first game starts with the double ${g.opener === "66" ? "six" : "blank"}.` : "";
  const ends = endsOf(g);
  if (!has(tile, ends[0]) && !has(tile, ends[1])) return "That tile doesn't match either end of the line.";
  if (end === "L" && !has(tile, ends[0])) return "That tile doesn't match that end.";
  if (end === "R" && !has(tile, ends[1])) return "That tile doesn't match that end.";
  return "";
}

const nextSeat = seat => (seat + 1) % SEATS;

export function play(g, seat, tile, end) {
  const err = whyNot(g, seat, tile, end);
  if (err) throw new Error(err);
  const ends = endsOf(g);
  let side = "R", both = false;
  if (ends) {
    const fitL = has(tile, ends[0]), fitR = has(tile, ends[1]);
    both = fitL && fitR;
    side = end === "L" || end === "R" ? end : fitR ? "R" : "L";
  }
  g.hands[seat] = g.hands[seat].filter(t => t !== tile);
  if (!ends) g.line.push({ t: tile, a: lo(tile), b: hi(tile) });
  else if (side === "R") g.line.push({ t: tile, a: ends[1], b: other(tile, ends[1]) });
  else { g.line.unshift({ t: tile, a: other(tile, ends[0]), b: ends[0] }); g.origin += 1; }
  g.opener = null;
  g.passed[seat] = false;
  g.lastBy = seat;
  g.log.push({ seat, type: "play", tile, end: side, both });
  if (!g.hands[seat].length) return finish(g, seat, "out", both);
  // blocked: nobody holds a tile that fits either end
  const now = endsOf(g);
  if (!g.hands.some(h => movesFor(h, now).length)) return finish(g, blockedWinner(g), "blocked", false);
  g.turn = nextSeat(seat);
  return g;
}

export function pass(g, seat) {
  const L = legal(g, seat);
  if (!L) throw new Error("It's not your turn.");
  if (!L.canPass) throw new Error(L.mustPlay ? "You hold the opening tile: play it." : "You have a tile that fits, so you can't pass.");
  g.passed[seat] = true;
  for (const n of L.ends) if (!g.voids[seat].includes(n)) g.voids[seat].push(n);
  g.log.push({ seat, type: "pass", ends: L.ends.slice() });
  g.turn = nextSeat(seat);
  return g;
}

// A blocked game: fewest pips, then fewest tiles, then the nearest player after the last one to play.
export function blockedWinner(g) {
  const after = i => (i - g.lastBy - 1 + 2 * SEATS) % SEATS;
  return [0, 1, 2, 3].sort((a, b) =>
    handValue(g.hands[a], g.blank25) - handValue(g.hands[b], g.blank25) || g.hands[a].length - g.hands[b].length || after(a) - after(b))[0];
}

function finish(g, winner, reason, both) {
  const gaple = reason === "out" && both && !!g.gapleBonus;
  const mult = gaple ? 2 : 1;
  const values = g.hands.map(h => handValue(h, g.blank25));
  const points = [0, 0, 0, 0];
  for (let i = 0; i < SEATS; i++) if (i !== winner) { points[i] -= values[i] * mult; points[winner] += values[i] * mult; }
  g.finished = { winner, reason, gaple, mult, values, points, left: g.hands.map(h => h.slice()) };
  g.turn = -1;
  g.log.push({ seat: winner, type: reason === "out" ? (gaple ? "gaple" : "win") : "blocked" });
  return g;
}

// A timed-out player: pass if nothing fits, otherwise play the heaviest tile that does.
export function autoMove(g) {
  const seat = g.turn, L = legal(g, seat);
  if (!L) return null;
  if (L.canPass) { pass(g, seat); return { seat, type: "pass" }; }
  const m = L.moves.slice().sort((a, b) => byWeight(b.tile, a.tile))[0];
  play(g, seat, m.tile, m.ends[0]);
  return { seat, type: "play", tile: m.tile, end: m.ends[0] };
}

// What one viewer may see: their own tiles, everyone's tile counts, the line and the log.
export function viewFor(g, seat) {
  if (!g) return null;
  return {
    no: g.no, turn: g.turn, line: g.line, origin: g.origin, ends: endsOf(g), opener: g.opener, lastBy: g.lastBy,
    passed: g.passed, voids: g.voids, blank25: g.blank25, gapleBonus: g.gapleBonus, log: g.log,
    counts: g.hands.map(h => h.length),
    hand: seat >= 0 ? g.hands[seat] : null,
    legal: seat >= 0 ? legal(g, seat) : null,
    finished: g.finished
  };
}
