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

test("home bonus: bringing a token home earns another roll only with the rule on", () => {
  for (const on of [false, true]) {
    const g = L.startGame(1, { rules: { homeBonus: on } });
    g.tokens[0] = [53, -1, -1, -1];
    L.act(g, 0, { type: "roll", die: 3 });
    L.act(g, 0, { type: "move", token: 0 });
    assert.strictEqual(g.tokens[0][0], L.FINISH);
    assert.strictEqual(g.turn, on ? 0 : 1);
    assert.strictEqual(g.phase, "roll");
  }
});

test("pairs are safe: two tokens of one colour on a square can't be captured, a lone one can", () => {
  const sq = L.squareOf(0, 5);
  const greenAt = p => { for (let q = 0; q <= 50; q++) if (L.squareOf(1, q) === p) return q; throw new Error("no square"); };
  for (const on of [false, true]) {
    const g = L.startGame(1, { rules: { pairSafe: on } });
    g.tokens[0] = [3, -1, -1, -1];
    g.tokens[1] = [greenAt(sq), greenAt(sq), -1, -1];
    const m = L.moveOf(g, 0, 0, 2);
    assert.strictEqual(m.captures.length, on ? 0 : 2);
  }
  const g = L.startGame(1, { rules: { pairSafe: true } });
  g.tokens[0] = [3, -1, -1, -1];
  g.tokens[1] = [greenAt(sq), -1, -1, -1];
  g.tokens[2] = [-1, -1, -1, -1];
  assert.strictEqual(L.moveOf(g, 0, 0, 2).captures.length, 1);
});

test("the room keeps the new house rules", () => {
  const s = R.validateSettings({ pointValue: 100, actSeconds: 20, skill: "normal", rules: { homeBonus: true, pairSafe: 1 } });
  assert.strictEqual(s.rules.homeBonus, true);
  assert.strictEqual(s.rules.pairSafe, true);
  assert.strictEqual(s.rules.blocks, false);
});

test("fewer players: empty colours are skipped and don't pay", () => {
  const g = L.startGame(1, { seats: [1, 3], first: 0 });
  assert.deepStrictEqual(g.active, [1, 3]);
  assert.strictEqual(g.turn, 1);                         // red isn't playing, so green starts
  L.act(g, 1, { type: "roll", die: 3 });                 // nothing to move: on to blue, skipping yellow
  assert.strictEqual(g.turn, 3);
  L.act(g, 3, { type: "roll", die: 2 });
  assert.strictEqual(g.turn, 1);                         // and back, skipping red
  g.tokens[1] = [56, 56, 56, 53];
  L.act(g, 1, { type: "roll", die: 3 });
  L.act(g, 1, { type: "move", token: 3 });
  assert.deepStrictEqual(g.finished.points, [0, 4, 0, -4]);
  assert.throws(() => L.startGame(1, { seats: [2] }));
});

test("fewer players: bots finish whole games with two and three colours", () => {
  for (const seats of [[0, 2], [1, 3], [0, 1, 3], [1, 2, 3]]) for (let n = 0; n < 20; n++) {
    const g = L.startGame(n, { seats, rules: { homeBonus: n % 2 === 0, pairSafe: n % 3 === 0 } });
    for (let step = 0; step < 20000 && !g.finished; step++) {
      assert.ok(seats.includes(g.turn));
      L.act(g, g.turn, ludoMove(g, g.turn, "hard"));
    }
    assert.ok(g.finished && seats.includes(g.finished.winner));
    for (const s of [0, 1, 2, 3]) if (!seats.includes(s)) assert.strictEqual(g.finished.points[s], 0);
  }
});

test("online rooms for 2 and 3 players: seats, bots, turns and a full room", () => {
  for (const players of [2, 3]) {
    const settings = R.validateSettings({ pointValue: 100, actSeconds: 20, skill: "hard", rules: {}, players });
    assert.strictEqual(settings.players, players);
    const s = R.newRoom({ code: "ABCDEF", settings, host: { id: "h", name: "Host", tokenHash: "th", hostKeyHash: "k" }, now: 0 });
    const ctx = id => ({ now: 1000, playerId: id, tokenHash: "t" + id, shuffledDeck: () => [] });
    R.applyAction(s, { type: "join", name: "Guest" }, ctx("g"));
    const table = L.TABLES[players];
    assert.deepStrictEqual([s.players.h.seat, s.players.g.seat], [table[0], table[1]]);
    R.applyAction(s, { type: "start" }, ctx("h"));
    R.applyAction(s, { type: "tick" }, ctx("h"));
    assert.deepStrictEqual(s.seats.map((x, i) => (x ? i : -1)).filter(i => i >= 0), table);   // bots only in this table's seats
    assert.deepStrictEqual(s.g.active, table);
    assert.strictEqual(R.personalState(s, "h").table.length, players);
    if (players === 2) assert.throws(() => R.applyAction(s, { type: "join", name: "Third" }, ctx("x")), /full: 2 people/);
    else { R.applyAction(s, { type: "join", name: "Third" }, ctx("x")); assert.strictEqual(s.players.x.seat, table[2]); }   // takes the bot's seat
  }
  assert.strictEqual(R.validateSettings({ pointValue: 100, actSeconds: 20, players: 7 }).players, 4);
});

test("online rooms: picking a colour before the start; two players always sit across the board", () => {
  const ctx = (id, extra = {}) => ({ now: 1000, playerId: id, tokenHash: "t" + id, shuffledDeck: () => [], ...extra });
  const two = R.newRoom({ code: "ABCDEF", settings: { pointValue: 100, actSeconds: 20, skill: "normal", rules: {}, players: 2 }, host: { id: "h", name: "Host", tokenHash: "th" }, now: 0 });
  R.applyAction(two, { type: "join", name: "Ana" }, ctx("a"));
  const seatOf = (s, id) => R.personalState(s, id).me;
  assert.deepStrictEqual([seatOf(two, "h"), seatOf(two, "a")], [0, 2]);
  // the host picks green: Ana is moved across to blue
  R.applyAction(two, { type: "color", seat: 1 }, ctx("h"));
  assert.deepStrictEqual([seatOf(two, "h"), seatOf(two, "a")], [1, 3]);
  assert.deepStrictEqual(R.personalState(two, "h").table, [1, 3]);
  // Ana can't pick now: the host chose first
  assert.throws(() => R.applyAction(two, { type: "color", seat: 0 }, ctx("a")), /picked Green first/);
  // the host may change their mind, and Ana follows
  R.applyAction(two, { type: "color", seat: 2 }, ctx("h"));
  assert.deepStrictEqual([seatOf(two, "h"), seatOf(two, "a")], [2, 0]);
  // the game uses exactly those two colours
  R.applyAction(two, { type: "start" }, ctx("h"));
  assert.deepStrictEqual(R.personalState(two, "h").view.active, [0, 2]);
  assert.throws(() => R.applyAction(two, { type: "color", seat: 1 }, ctx("h")), /before the game starts/);

  // a 2-player room where the guest picks first, before anyone else joins
  const solo = R.newRoom({ code: "BCDEFG", settings: { pointValue: 100, actSeconds: 20, skill: "normal", rules: {}, players: 2 }, host: { id: "h", name: "Host", tokenHash: "th" }, now: 0 });
  R.applyAction(solo, { type: "color", seat: 3 }, ctx("h"));
  R.applyAction(solo, { type: "join", name: "Ana" }, ctx("a"));
  assert.deepStrictEqual([seatOf(solo, "h"), seatOf(solo, "a")], [3, 1]);

  // 4 players: any free colour; a colour someone has is taken
  const four = R.newRoom({ code: "CDEFGH", settings: { pointValue: 100, actSeconds: 20, skill: "normal", rules: {}, players: 4 }, host: { id: "h", name: "Host", tokenHash: "th" }, now: 0 });
  R.applyAction(four, { type: "join", name: "Ana" }, ctx("a"));
  assert.throws(() => R.applyAction(four, { type: "color", seat: 1 }, ctx("h")), /Ana is already playing Green/);
  R.applyAction(four, { type: "color", seat: 3 }, ctx("h"));
  assert.strictEqual(seatOf(four, "h"), 3);

  // 3 players: picking the colour that's out of play swaps it in for the one you leave
  const three = R.newRoom({ code: "DEFGHJ", settings: { pointValue: 100, actSeconds: 20, skill: "normal", rules: {}, players: 3 }, host: { id: "h", name: "Host", tokenHash: "th" }, now: 0 });
  R.applyAction(three, { type: "color", seat: 3 }, ctx("h"));
  assert.deepStrictEqual(R.personalState(three, "h").table, [1, 2, 3]);
  R.applyAction(three, { type: "start" }, ctx("h"));
  assert.deepStrictEqual(R.personalState(three, "h").view.active, [1, 2, 3]);
});

test("board: base circles are centred in their corners; finished pieces stand inside their own triangle", () => {
  L.BASE_SPOTS.forEach((spots, s) => {
    const cx = spots.reduce((a, [c]) => a + c, 0) / 4, cy = spots.reduce((a, [, r]) => a + r, 0) / 4;
    assert.deepStrictEqual([cx, cy], [[3, 3], [12, 3], [12, 12], [3, 12]][s]);
  });
  // the triangles: red from the left side, green from the top, yellow from the right, blue from the bottom
  const inside = (s, [x, y]) => [x - 6 < y - 6 && y - 6 < 9 - x, y - 6 < x - 6 && x - 6 < 9 - y, 9 - x < y - 6 && y - 6 < x - 6, 9 - y < x - 6 && x - 6 < y - 6][s];
  L.FINISH_SPOTS.forEach((p, s) => { assert.ok(inside(s, p), `colour ${s}`); [0, 1, 2, 3].forEach(t => assert.ok(!(t !== s && inside(t, p)), `colour ${s} not in ${t}`)); });
});
