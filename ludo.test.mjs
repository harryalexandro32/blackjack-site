// Run with: node --test
import test from "node:test";
import assert from "node:assert";
import * as L from "./supabase/functions/_shared/ludo-engine.js";
import { ludoMove } from "./supabase/functions/_shared/ludo-bot.js";

const roll = (g, seat, die) => L.act(g, seat, { type: "roll", die });
const move = (g, seat, token) => L.act(g, seat, { type: "move", token });

test("the board: 52 track squares, no repeats, every square next to the one before", () => {
  assert.strictEqual(L.TRACK.length, 52);
  assert.strictEqual(new Set(L.TRACK.map(String)).size, 52);
  L.TRACK.forEach(([c, r], i) => { const [c2, r2] = L.TRACK[(i + 1) % 52]; assert.ok(Math.abs(c - c2) + Math.abs(r - r2) <= 2, `square ${i}`); });
  // each colour's last track square sits right next to its home column
  for (let s = 0; s < 4; s++) {
    const [c, r] = L.TRACK[L.squareOf(s, 50)], [hc, hr] = L.HOME_COLUMN[s][0];
    assert.strictEqual(Math.abs(c - hc) + Math.abs(r - hr), 1, `colour ${s}`);
  }
});

test("a 6 brings a token out and rolls again; anything else with everyone at base passes the turn", () => {
  const g = L.startGame(1);
  roll(g, 0, 4);
  assert.strictEqual(g.turn, 1);                         // nothing could move
  roll(g, 1, 6);
  assert.strictEqual(g.phase, "move");
  move(g, 1, 0);
  assert.strictEqual(g.tokens[1][0], 0);
  assert.strictEqual(g.turn, 1); assert.strictEqual(g.phase, "roll");   // a 6 rolls again
  roll(g, 1, 3); move(g, 1, 0);
  assert.strictEqual(g.tokens[1][0], 3);
  assert.strictEqual(g.turn, 2);
});

test("three 6s in a row lose the turn", () => {
  const g = L.startGame(1);
  g.tokens[0] = [5, -1, -1, -1];
  roll(g, 0, 6); move(g, 0, 0);
  roll(g, 0, 6); move(g, 0, 0);
  roll(g, 0, 6);
  assert.strictEqual(g.turn, 1);
  assert.strictEqual(g.tokens[0][0], 17);
});

test("landing on another colour sends it home, except on safe squares", () => {
  const g = L.startGame(1);
  // red token at red p=10 (square 10); green token on square 14 = green p=1
  g.tokens[0] = [10, -1, -1, -1]; g.tokens[1] = [1, -1, -1, -1];
  roll(g, 0, 4); move(g, 0, 0);
  assert.strictEqual(g.tokens[1][0], -1);
  // a token on a star square is safe
  const h = L.startGame(1);
  h.tokens[0] = [5, -1, -1, -1]; h.tokens[1] = [(8 - 13 + 52) % 52, -1, -1, -1];   // green on square 8 (a star)
  roll(h, 0, 3); move(h, 0, 0);
  assert.strictEqual(L.squareOf(1, h.tokens[1][0]), 8);
});

test("you need the exact roll to finish; bringing all four home wins and the others pay per token left", () => {
  const g = L.startGame(1);
  g.tokens[0] = [56, 56, 56, 53];
  roll(g, 0, 5);
  assert.strictEqual(g.turn, 1);                          // 53 + 5 is past the finish
  g.turn = 0; g.phase = "roll";
  g.tokens[1] = [56, 10, -1, -1]; g.tokens[2] = [-1, -1, -1, -1];
  roll(g, 0, 3); move(g, 0, 3);
  assert.deepStrictEqual(g.finished.points, [3 + 4 + 4, -3, -4, -4]);
});

test("house rules: leave on a 1, capture bonus, blocks, must capture", () => {
  const g = L.startGame(1, { rules: { leave16: true } });
  roll(g, 0, 1); assert.strictEqual(g.phase, "move");
  const c = L.startGame(1, { rules: { captureBonus: true } });
  c.tokens[0] = [10, -1, -1, -1]; c.tokens[1] = [1, -1, -1, -1];
  roll(c, 0, 4); move(c, 0, 0);
  assert.strictEqual(c.turn, 0);                          // a capture rolls again
  const b = L.startGame(1, { rules: { blocks: true } });
  b.tokens[0] = [10, 56, 56, 56]; b.tokens[1] = [1, 1, -1, -1];    // two greens on square 14
  roll(b, 0, 6);                                          // 16 would pass the block
  assert.strictEqual(b.phase, "roll");                    // nothing could move (a 6, so roll again)
  const m = L.startGame(1, { rules: { mustCapture: true } });
  m.tokens[0] = [10, 2, -1, -1]; m.tokens[1] = [1, -1, -1, -1];
  roll(m, 0, 4);
  assert.deepStrictEqual(m.legal.map(x => x.token), [0]);
});

test("bots: whole games finish, points add to zero, hard bots beat easy ones", () => {
  let hardWins = 0;
  for (let k = 0; k < 120; k++) {
    const g = L.startGame(1, { first: k % 4 });
    for (let i = 0; i < 6000 && !g.finished; i++) L.act(g, g.turn, ludoMove(g, g.turn, g.turn % 2 ? "easy" : "hard"));
    assert.ok(g.finished);
    assert.strictEqual(g.finished.points.reduce((a, b) => a + b, 0), 0);
    if (g.finished.winner % 2 === 0) hardWins++;
  }
  assert.ok(hardWins > 60, `hard bots won ${hardWins} of 120`);
});

// ---------- rooms ----------
const R = await import("./supabase/functions/_shared/ludo-room.js");
const E = await import("./supabase/functions/_shared/poker-engine.js");
let clock = 1_000_000;
const ctx = (playerId, extra = {}) => ({ now: clock, playerId, shuffledDeck: () => E.newDeck(), ...extra });
const settingsL = { pointValue: 100, actSeconds: 20, skill: "normal", rules: { captureBonus: true } };

test("ludo rooms: bots fill seats, people get a clock, games play out, money only between people", () => {
  const s = R.newRoom({ code: "LUD234", settings: settingsL, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
  R.applyAction(s, { type: "start" }, ctx("h"));
  assert.strictEqual(s.seats.filter(x => x.bot).length, 2);
  assert.strictEqual(s.g.rules.captureBonus, true);
  let games = 0;
  for (let i = 0; i < 20000 && games < 2; i++) {
    const g = s.g;
    if (g.finished) { games++; clock += 10000; R.applyAction(s, { type: "tick" }, ctx("h")); continue; }
    const id = g.turn === s.players.h.seat ? "h" : g.turn === s.players.a.seat ? "a" : null;
    if (id && i % 5) R.applyAction(s, { type: "move", move: ludoMove(g, g.turn, "normal") }, ctx(id));
    else { clock += 25000; R.applyAction(s, { type: "tick" }, ctx("h")); }
  }
  assert.ok(games >= 2);
  assert.strictEqual(s.points.reduce((a, b) => a + b, 0), 0);
  assert.strictEqual(s.money[s.players.h.seat] + s.money[s.players.a.seat], 0);
  assert.ok(s.seats.every((x, i) => !x.bot || s.money[i] === 0));
});
