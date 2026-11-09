// Run with: node --test
import test from "node:test";
import assert from "node:assert";
import * as K from "./supabase/functions/_shared/checkers-engine.js";
import { checkersMove } from "./supabase/functions/_shared/checkers-bot.js";

const sq = (r, c) => r * 8 + c;
// build a board from a list of [r, c, piece]
const board = list => { const a = Array(64).fill("."); list.forEach(([r, c, p]) => a[sq(r, c)] = p); return a.join(""); };

test("the start: 12 pieces each, seat 0 moves first with 7 moves", () => {
  const g = K.startGame(1);
  assert.deepStrictEqual(K.viewFor(g).counts, [12, 12]);
  assert.strictEqual(g.turn, 0);
  assert.strictEqual(g.legal.length, 7);
});

test("capturing is compulsory and chains must be followed through", () => {
  const b = board([[5, 0, "a"], [4, 1, "b"], [2, 3, "b"], [7, 7, "a"], [0, 7, "b"]]);
  const g = K.startGame(1, { rules: "english", board: b });
  assert.ok(g.legal.every(m => m.caps.length));
  assert.throws(() => K.play(g, 0, { from: sq(7, 7), to: sq(6, 6) }), /must capture/);
  const m = g.legal.find(x => x.from === sq(5, 0));
  assert.deepStrictEqual(m.path, [sq(3, 2), sq(1, 4)]);           // two jumps in one move
  K.play(g, 0, { from: sq(5, 0), to: sq(1, 4) });
  assert.strictEqual(K.countOf(g.board, 1), 1);
});

test("English: men capture forwards only; a man crowned mid-capture stops", () => {
  const back = board([[3, 3, "a"], [4, 4, "b"], [0, 0, "b"]]);
  assert.ok(!K.startGame(1, { rules: "english", board: back }).legal.some(m => m.caps.length));
  const crown = board([[2, 1, "a"], [1, 2, "b"], [1, 4, "b"], [7, 0, "b"]]);
  const g = K.startGame(1, { rules: "english", board: crown });
  const m = g.legal[0];
  assert.deepStrictEqual(m.path, [sq(0, 3)]);                         // could jump on as a king, but the move ends
  K.play(g, 0, m);
  assert.strictEqual(g.board[sq(0, 3)], "A");
});

test("Dam: men capture backwards, kings fly and capture from a distance", () => {
  const back = board([[3, 3, "a"], [4, 4, "b"], [0, 0, "b"]]);
  const g = K.startGame(1, { rules: "dam", board: back });
  assert.ok(g.legal.some(m => m.caps.length && m.to === sq(5, 5)));
  const fly = board([[7, 0, "A"], [3, 4, "b"], [0, 1, "b"]]);
  const h = K.startGame(1, { rules: "dam", board: fly });
  const lands = h.legal.filter(m => m.caps.length).map(m => m.to).sort((a, b) => a - b);
  assert.deepStrictEqual(lands, [sq(0, 7), sq(1, 6), sq(2, 5)]);               // anywhere past the captured piece
  const quiet = K.startGame(1, { rules: "dam", board: board([[7, 0, "A"], [0, 1, "b"]]) });
  assert.strictEqual(quiet.legal.length, 7);                          // flies the whole diagonal
});

test("no pieces or no moves loses; resigning ends it; kings-only shuffling draws", () => {
  const g = K.startGame(1, { board: board([[5, 0, "a"], [4, 1, "b"]]), rules: "english" });
  K.play(g, 0, g.legal[0]);
  assert.deepStrictEqual(g.finished, { winner: 0, how: "captured" });
  const r = K.startGame(1); K.resign(r, 0);
  assert.strictEqual(r.finished.winner, 1);
  const d = K.startGame(1, { rules: "english", board: board([[7, 0, "A"], [0, 7, "B"]]) });
  d.quiet = K.DRAW_PLIES - 1;
  K.play(d, 0, d.legal.find(m => m.to === sq(6, 1)));
  assert.strictEqual(d.finished.how, "fifty");
});

test("bots: take a free piece, play whole games quickly, and hard beats easy", () => {
  const g = K.startGame(1, { rules: "english", board: board([[5, 2, "a"], [6, 1, "a"], [3, 4, "b"], [2, 5, "b"], [0, 1, "b"]]) });
  const free = K.startGame(1, { rules: "dam", board: board([[5, 2, "a"], [4, 3, "b"], [0, 7, "b"]]) });
  assert.ok(checkersMove(free, 0, "hard").caps.length);
  let hardWins = 0, games = 0;
  const t0 = Date.now();
  for (const rules of ["dam", "english"]) for (let i = 0; i < 3; i++) {
    const x = K.startGame(i, { rules });
    const hardSeat = i % 2;
    for (let ply = 0; ply < 300 && !x.finished; ply++) K.play(x, x.turn, checkersMove(x, x.turn, x.turn === hardSeat ? "hard" : "easy"));
    games++;
    if (x.finished && x.finished.winner === hardSeat) hardWins++;
  }
  assert.ok(hardWins >= 4, `hard won ${hardWins} of ${games}`);
  assert.ok(Date.now() - t0 < 60000);
  assert.ok(g.legal.length);
});

// ---------- rooms ----------
const R = await import("./supabase/functions/_shared/checkers-room.js");
test("checkers rooms: two play, others watch, the clock moves for you, colours swap, wins are tallied", () => {
  let clock = 1_000_000;
  const ctx = (playerId, extra = {}) => ({ now: clock, playerId, ...extra });
  const s = R.newRoom({ code: "DAMDAM", settings: { rules: "english", moveSeconds: 30 }, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  assert.throws(() => R.applyAction(s, { type: "start" }, ctx("h")), /two players/);
  R.applyAction(s, { type: "join", name: "Ayu" }, ctx("a", { tokenHash: "ta" }));
  R.applyAction(s, { type: "join", name: "Budi" }, ctx("b", { tokenHash: "tb" }));
  assert.throws(() => R.applyAction(s, { type: "start" }, ctx("a")), /host/);
  R.applyAction(s, { type: "start" }, ctx("h"));
  assert.deepStrictEqual(s.inGame, ["h", "a"]);
  assert.throws(() => R.applyAction(s, { type: "move", from: 40, to: 33 }, ctx("b")), /watching/);
  assert.throws(() => R.applyAction(s, { type: "move", ...s.g.legal[0] }, ctx("a")), /turn/);
  const m = s.g.legal[0];
  R.applyAction(s, { type: "move", from: m.from, to: m.to }, ctx("h"));
  assert.strictEqual(s.g.turn, 1);
  clock += 31000; R.applyAction(s, { type: "tick" }, ctx("b"));      // Ayu ran out of time: a move was made
  assert.strictEqual(s.g.turn, 0);
  R.applyAction(s, { type: "resign" }, ctx("h"));
  assert.strictEqual(s.g.finished.winner, 1);
  assert.strictEqual(s.wins.ayu.wins, 1);
  R.applyAction(s, { type: "start" }, ctx("a"));                      // a rematch, colours swapped
  assert.deepStrictEqual(s.inGame, ["a", "h"]);
  R.applyAction(s, { type: "leave" }, ctx("a"));                      // leaving mid-game resigns it
  assert.strictEqual(s.g.finished.winner, 1);
  R.applyAction(s, { type: "start" }, ctx("h"));
  assert.deepStrictEqual(s.inGame.slice().sort(), ["b", "h"]);
  assert.strictEqual(R.publicState(s).view.counts[0], 12);
});
