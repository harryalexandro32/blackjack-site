// Checkers, as a pure JSON-friendly engine shared by the browser and the server.
//
// 8×8 board, the dark squares only, 12 pieces each. Seat 0 starts at the bottom (rows 5-7) and moves first;
// seat 1 starts at the top. The board is a 64-character string: "." empty, "a"/"A" seat 0 man/king,
// "b"/"B" seat 1 man/king. Squares are numbered 0..63, row by row from the top.
//
// Two rule sets (the host picks):
//   "dam"     (the usual Indonesian way): kings fly any distance along a diagonal and capture from a distance,
//             landing on any empty square past the piece; men move forward but capture forwards and backwards.
//             A man that passes the far row in the middle of a capture stays a man and carries on.
//   "english" kings move and capture one square at a time; men move and capture forwards only. A man that
//             reaches the far row is crowned and the move ends there.
// Both: capturing is compulsory and a capture must be followed through (keep jumping while you can); you may
// pick any of the capture routes. A piece can't be jumped twice in one move; captured pieces come off at the end.
// You lose when you have no legal move (no pieces, or all blocked). Draw after 50 moves in a row (25 each)
// with no capture and no man moved.

export const RULES = ["dam", "english"];
export const DRAW_PLIES = 50;
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const rc = sq => [sq >> 3, sq & 7];
const at = (r, c) => r * 8 + c;
const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const owner = p => p === "a" || p === "A" ? 0 : p === "b" || p === "B" ? 1 : -1;
export const isKing = p => p === "A" || p === "B";
const forward = seat => seat === 0 ? -1 : 1;
const lastRow = seat => seat === 0 ? 0 : 7;

export function startBoard() {
  let b = "";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) b += (r + c) % 2 === 1 ? (r < 3 ? "b" : r > 4 ? "a" : ".") : ".";
  return b;
}

export function startGame(no, { rules = "dam", board = null, turn = 0 } = {}) {
  if (!RULES.includes(rules)) throw new Error("Unknown rules.");
  const g = { no, rules, board: board || startBoard(), turn, quiet: 0, moves: 0, last: null, log: [{ type: "start" }], finished: null };
  g.legal = legalMoves(g.board, g.turn, g.rules);
  if (!g.legal.length) finish(g, 1 - g.turn, "blocked");
  return g;
}

// Every capture route from one square: [{ path: [squares landed on], caps: [squares jumped] }]
function captures(board, sq, piece, rules) {
  const seat = owner(piece), out = [];
  const flying = rules === "dam" && isKing(piece);
  const walk = (from, king, path, caps) => {
    let found = false;
    const [r, c] = rc(from);
    for (const [dr, dc] of DIRS) {
      if (!king && rules === "english" && dr !== forward(seat)) continue;
      if (flying || (king && rules === "dam")) {
        // fly over empties to the first piece; it must be an enemy not already taken, then land past it
        let k = 1;
        while (onBoard(r + dr * k, c + dc * k) && board[at(r + dr * k, c + dc * k)] === "." ) k++;
        const or = r + dr * k, oc = c + dc * k;
        if (!onBoard(or, oc)) continue;
        const over = at(or, oc);
        if (owner(board[over]) !== 1 - seat || caps.includes(over)) continue;
        for (let j = 1; onBoard(or + dr * j, oc + dc * j); j++) {
          const land = at(or + dr * j, oc + dc * j);
          if (board[land] !== ".") break;
          found = true;
          walk(land, king, [...path, land], [...caps, over]);
        }
      } else {
        const or = r + dr, oc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
        if (!onBoard(lr, lc)) continue;
        const over = at(or, oc), land = at(lr, lc);
        if (owner(board[over]) !== 1 - seat || caps.includes(over) || board[land] !== ".") continue;
        found = true;
        const crowned = !king && lr === lastRow(seat);
        if (crowned && rules === "english") out.push({ path: [...path, land], caps: [...caps, over] });   // crowned: the move ends
        else walk(land, king, [...path, land], [...caps, over]);
      }
    }
    if (!found && caps.length) out.push({ path, caps });
  };
  // the moving piece's own square counts as empty while it travels
  const lifted = board.slice(0, sq) + "." + board.slice(sq + 1);
  board = lifted;
  walk(sq, isKing(piece), [], []);
  return out;
}

function steps(board, sq, piece, rules) {
  const seat = owner(piece), out = [];
  const [r, c] = rc(sq);
  for (const [dr, dc] of DIRS) {
    if (!isKing(piece) && dr !== forward(seat)) continue;
    const max = isKing(piece) && rules === "dam" ? 7 : 1;
    for (let k = 1; k <= max; k++) {
      const nr = r + dr * k, nc = c + dc * k;
      if (!onBoard(nr, nc) || board[at(nr, nc)] !== ".") break;
      out.push({ path: [at(nr, nc)], caps: [] });
    }
  }
  return out;
}

// All legal moves for a seat: { from, to, path, caps }. Captures are compulsory.
export function legalMoves(board, seat, rules) {
  const caps = [], quiet = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (owner(p) !== seat) continue;
    for (const m of captures(board, sq, p, rules)) caps.push({ from: sq, to: m.path[m.path.length - 1], path: m.path, caps: m.caps });
    for (const m of steps(board, sq, p, rules)) quiet.push({ from: sq, to: m.path[0], path: m.path, caps: [] });
  }
  return caps.length ? caps : quiet;
}

export function applyMove(board, m) {
  const piece = board[m.from], seat = owner(piece);
  const arr = board.split("");
  arr[m.from] = ".";
  m.caps.forEach(c => arr[c] = ".");
  const crown = !isKing(piece) && rc(m.to)[0] === lastRow(seat);
  arr[m.to] = crown ? piece.toUpperCase() : piece;
  return arr.join("");
}

const sameMove = (a, b) => a.from === b.from && a.to === b.to && (!b.path || a.path.join() === b.path.join());

// move: { from, to, path? } — path picks one route when two captures end on the same square.
export function play(g, seat, move) {
  if (g.finished) throw new Error("This game is over.");
  if (g.turn !== seat) throw new Error("It's not your turn.");
  const options = g.legal.filter(m => sameMove(m, move));
  if (!options.length) throw new Error(g.legal.some(m => m.caps.length) ? "You must capture." : "That piece can't go there.");
  const m = options.sort((a, b) => b.caps.length - a.caps.length)[0];
  const piece = g.board[m.from];
  const crowned = !isKing(piece) && rc(m.to)[0] === lastRow(seat);
  g.board = applyMove(g.board, m);
  g.quiet = m.caps.length || !isKing(piece) ? 0 : g.quiet + 1;
  g.moves += 1;
  g.last = { seat, from: m.from, to: m.to, path: m.path, caps: m.caps, crowned };
  g.log.push({ type: "move", seat, from: m.from, to: m.to, caps: m.caps.length, crowned });
  g.turn = 1 - seat;
  g.legal = legalMoves(g.board, g.turn, g.rules);
  if (!g.legal.length) finish(g, seat, countOf(g.board, g.turn) ? "blocked" : "captured");
  else if (g.quiet >= DRAW_PLIES) finish(g, -1, "fifty");
  return g;
}

export function resign(g, seat) {
  if (g.finished) return g;
  g.log.push({ type: "resign", seat });
  finish(g, 1 - seat, "resign");
  return g;
}

export const countOf = (board, seat) => [...board].filter(p => owner(p) === seat).length;
function finish(g, winner, how) {
  g.finished = { winner, how };
  g.legal = [];
  g.log.push({ type: "end", winner, how });
}

export function viewFor(g) {
  if (!g) return null;
  return { no: g.no, rules: g.rules, board: g.board, turn: g.turn, quiet: g.quiet, moves: g.moves, last: g.last, legal: g.legal, finished: g.finished,
    counts: [countOf(g.board, 0), countOf(g.board, 1)], logCount: g.log.length };
}
