// Run with: node --test
import test from "node:test";
import assert from "node:assert";
import { webcrypto } from "node:crypto";
import * as C from "./supabase/functions/_shared/capsa-engine.js";

const rng = webcrypto.getRandomValues.bind(webcrypto);
const shuffled = () => { const d = C.newDeck(); for (let i = d.length - 1; i > 0; i--) { const j = rng(new Uint32Array(1))[0] % (i + 1); [d[i], d[j]] = [d[j], d[i]]; } return d; };
const cls = s => C.classify(s.split(" "));
const beats = (a, b) => C.beats(cls(a), cls(b));
// a game with chosen hands; the rest of the deck is spread so each player has 13
function game(hands, turn = 0, lead3d = false) {
  const used = new Set(hands.flat());
  const rest = C.newDeck().filter(c => !used.has(c));
  const full = hands.map(h => h.slice());
  for (const h of full) while (h.length < 13) h.push(rest.shift());
  return { no: 1, hands: full.map(h => h.sort(C.byValue)), turn, trick: null, passed: [false, false, false, false], lead3d, log: [], finished: null };
}

test("card order: 2 is highest, suits spade > heart > club > diamond", () => {
  assert.ok(C.valueOf("2d") > C.valueOf("As"));
  assert.ok(C.valueOf("3s") > C.valueOf("3h") && C.valueOf("3h") > C.valueOf("3c") && C.valueOf("3c") > C.valueOf("3d"));
  assert.ok(beats("2d", "As"));
  assert.ok(beats("Ks Kd", "Kh Kc"));          // pairs: the higher suit decides
  assert.ok(!beats("Kh Kc", "Ks Kd"));
});

test("combinations: what's legal and how packages rank", () => {
  assert.strictEqual(cls("3d 4c 5h 6s 7d").type, "straight");
  assert.strictEqual(cls("2d 3c 4h 5s 6d").type, "straight");      // 2-3-4-5-6 is allowed
  assert.strictEqual(cls("Jd Qc Kh As 2d").type, "straight");      // J-Q-K-A-2 is allowed
  assert.strictEqual(cls("Ad 2c 3h 4s 5d"), null);                 // A-2-3-4-5 isn't
  assert.strictEqual(cls("Kd Ac 2h 3s 4d"), null);                 // no wrapping round
  assert.ok(beats("3d 4c 5h 6s 7d", "2d 3c 4h 5s 6s"));            // 2-6 is the lowest straight
  assert.ok(beats("Jd Qc Kh As 2d", "Td Jc Qh Ks As"));            // J-2 is the highest
  assert.ok(beats("3s 4s 5s 6s 7h", "3h 4d 5c 6d 7s") === false);  // same straight: the top card's suit decides (7s > 7h)
  assert.ok(beats("4d 7d 9d Jd Kd", "Td Jc Qh Ks 2d"));            // flush beats any straight
  assert.ok(beats("3c 3d 3h 4s 4d", "4c 8c 9c Jc 2c"));            // full house beats flush
  assert.ok(beats("5c 5d 5h 5s", "2c 2d 2h 3s 3d"));               // four of a kind (4 cards) beats a full house
  assert.ok(beats("3d 4d 5d 6d 7d", "As Ah Ac Ad"));               // straight flush beats four of a kind
  assert.ok(beats("Ks Kh Kc Kd", "3s 3h 3c 3d"));                  // higher bomb beats lower bomb
  assert.ok(beats("3s 3h 3c 3d", "2s"));                           // a bomb beats a single 2
  assert.ok(!beats("3s 3h 3c 3d", "Ks"));                          // but not any other single
  assert.ok(!beats("3s 3h 3c 3d", "2s 2h"));                       // nor a pair of 2s
  assert.ok(!beats("3d 4c 5h 6s 7d", "2s"));                       // a plain package can't beat a single
  assert.ok(!beats("Ks Kh", "4d"));                                // pairs only beat pairs
  assert.strictEqual(cls("Ks Kh Kc Kd 3d"), null);                 // four of a kind is played as 4 cards
});

test("the first game starts with the 3 of diamonds, and the first play must include it", () => {
  const g = C.startGame(1, shuffled, -1);
  assert.ok(g.hands[g.turn].includes("3d"));
  assert.ok(g.hands.every(h => h.length === 13));
  const other = g.hands[g.turn].find(c => c !== "3d");
  assert.throws(() => C.play(g, g.turn, [other]), /3♦/);
  C.play(g, g.turn, ["3d"]);
  const later = C.startGame(2, shuffled, 2);
  assert.strictEqual(later.turn, 2);                               // later games: the last winner starts
  assert.strictEqual(later.lead3d, false);
});

test("nobody is dealt all four 2s", () => {
  let calls = 0;
  const rigged = () => { calls++; const d = C.newDeck(); return calls === 1 ? ["2d", "2c", "2h", "2s", ...d.filter(c => c[0] !== "2")] : shuffled(); };
  const g = C.startGame(1, rigged, -1);
  assert.ok(calls >= 2);
  assert.ok(!g.hands.some(h => h.filter(c => c[0] === "2").length === 4));
});

test("following: same type, pass and you're out until the round ends", () => {
  const g = game([["4d", "9c"], ["5d", "5c"], ["6d", "Jc"], ["7d", "Qc"]], 0);
  C.play(g, 0, ["4d"]);
  assert.throws(() => C.play(g, 1, ["5d", "5c"]), /single/);
  C.play(g, 1, ["5d"]);
  C.pass(g, 2);
  C.play(g, 3, ["7d"]);
  assert.strictEqual(g.turn, 0);                                   // seat 2 passed, so it's skipped
  C.pass(g, 0); C.pass(g, 1);
  assert.strictEqual(g.trick, null);                               // everyone else passed: new round
  assert.strictEqual(g.turn, 3);
  assert.throws(() => C.pass(g, 3), /leading/);
});

test("a bomb on a single 2 ends the game: the bombed player pays the bomber double", () => {
  const g = game([["2s", "4d"], ["9c", "9d", "9h", "9s"], [], []], 0);
  C.play(g, 0, ["2s"]);
  C.play(g, 1, ["9c", "9d", "9h", "9s"]);
  assert.ok(g.finished);
  assert.strictEqual(g.finished.winner, 1);
  assert.strictEqual(g.finished.bombed, 0);
  const owe = C.penalty(g.hands[0]) * 2;
  assert.deepStrictEqual(g.finished.points, [-owe, owe, 0, 0]);
});

test("you can't finish with a single 2, but a pair of 2s is fine", () => {
  const g = game([["2s"], [], [], []], 0);
  g.hands[0] = ["2s"];
  assert.throws(() => C.play(g, 0, ["2s"]), /single 2/);
  C.pass(g, 0);                                                    // leading with only a 2: the lead moves on
  assert.strictEqual(g.turn, 1);
  const g2 = game([["2s", "2h"], [], [], []], 0);
  g2.hands[0] = ["2s", "2h"];
  C.play(g2, 0, ["2s", "2h"]);
  assert.strictEqual(g2.finished.winner, 0);
});

test("scoring: 1 per card, 2s count double, x2 at 10+ cards, x3 at 13", () => {
  assert.strictEqual(C.penalty(["3d", "4d", "5d"]), 3);
  assert.strictEqual(C.penalty(["3d", "2d", "5d"]), 4);
  assert.strictEqual(C.penalty(Array(10).fill("4d")), 20);
  assert.strictEqual(C.penalty(["2d", "2c", ...Array(11).fill("4d")]), 45);  // (13 + 2) x 3
  const g = game([["3d"], [], [], []], 0);
  g.hands[0] = ["3d"];
  C.play(g, 0, ["3d"]);
  assert.strictEqual(g.finished.winner, 0);
  assert.strictEqual(g.finished.points.reduce((a, b) => a + b, 0), 0);
  assert.ok(g.finished.points[0] > 0);
});

test("random games always finish and points always add up to zero", () => {
  for (let n = 0; n < 200; n++) {
    const g = C.startGame(n, shuffled, n % 2 ? -1 : n % 4);
    for (let steps = 0; !g.finished && steps < 500; steps++) C.autoMove(g);
    assert.ok(g.finished, "game didn't finish");
    if (g.finished.reason === "stuck") continue;
    assert.strictEqual(g.finished.points.reduce((a, b) => a + b, 0), 0);
  }
});

test("bots only make legal moves and games end; bots bomb a single 2 when they can", async () => {
  const { capsaMove } = await import("./supabase/functions/_shared/capsa-bot.js");
  let bombs = 0, stuck = 0;
  for (let n = 0; n < 60; n++) {
    const g = C.startGame(n, shuffled, -1);
    for (let steps = 0; !g.finished && steps < 800; steps++) {
      const m = capsaMove(g, g.turn, ["easy", "normal", "hard"][n % 3]);
      if (m.type === "pass") C.pass(g, g.turn); else C.play(g, g.turn, m.cards);
    }
    assert.ok(g.finished, "bot game didn't finish");
    if (g.finished.reason === "bomb") bombs++;
    if (g.finished.reason === "stuck") stuck++;
    assert.strictEqual(g.finished.points.reduce((a, b) => a + b, 0), 0);
  }
  const g = game([["2s", "4d", "5d"], ["9c", "9d", "9h", "9s", "Kd"], [], []], 0);
  C.play(g, 0, ["2s"]);
  const m = capsaMove(g, 1);
  assert.ok(C.isBomb(C.classify(m.cards)), "should bomb the 2");
});

// ---------- rooms ----------
const R = await import("./supabase/functions/_shared/capsa-room.js");
const awaitBot = await import("./supabase/functions/_shared/capsa-bot.js");
let clock = 1_000_000;
const ctx = (playerId, extra = {}) => ({ now: clock, playerId, shuffledDeck: shuffled, ...extra });
const settingsC = { pointValue: 100, actSeconds: 30, skill: "normal" };
// keep ticking (moving the clock) until it's a person's turn or the game ends
function runBots(s) {
  for (let i = 0; i < 200 && s.g && !s.g.finished && s.seats[s.g.turn].bot; i++) { clock += 2000; R.applyAction(s, { type: "tick" }, ctx("h")); }
}

test("capsa rooms: bots fill empty seats, play their turns, and the clock covers people", () => {
  const s = R.newRoom({ code: "CAP234", settings: settingsC, host: { id: "h", name: "Host", tokenHash: "th", hostKeyHash: "key" }, now: clock });
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
  assert.throws(() => R.applyAction(s, { type: "start" }, ctx("a")), /host/);
  R.applyAction(s, { type: "start" }, ctx("h"));
  assert.strictEqual(s.seats.filter(x => x.bot).length, 2);
  assert.ok(s.g && s.g.hands.every(h => h.length === 13));
  const pub = R.publicState(s);
  assert.strictEqual(pub.view.hand, null);                       // nobody's cards in the public copy
  assert.strictEqual(R.personalState(s, "a").view.hand.length, 13);
  runBots(s);
  const who = s.g.turn === s.players.h.seat ? "h" : "a";
  const before = s.g.log.length;
  clock += 31000; R.applyAction(s, { type: "tick" }, ctx("h"));  // out of time: auto move
  assert.ok(s.g.log.length > before);
  assert.ok(R.personalState(s, who).view);
});

test("capsa rooms: whole games run, money only moves between people, sessions end and the room stays", () => {
  const s = R.newRoom({ code: "CAP234", settings: settingsC, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
  R.applyAction(s, { type: "start" }, ctx("h"));
  for (let games = 0; games < 3; games++) {
    for (let i = 0; i < 400 && !s.g.finished; i++) {
      runBots(s);
      if (s.g.finished) break;
      const id = s.g.turn === s.players.h.seat ? "h" : "a";
      const m = awaitBot.capsaMove(s.g, s.g.turn, "normal");
      R.applyAction(s, m.type === "pass" ? { type: "pass" } : { type: "play", cards: m.cards }, ctx(id));
    }
    assert.ok(s.g.finished);
    clock += 10000; R.applyAction(s, { type: "tick" }, ctx("h"));  // next game is dealt
  }
  assert.strictEqual(s.points.reduce((a, b) => a + b, 0), 0);
  const people = [s.players.h.seat, s.players.a.seat];
  assert.strictEqual(people.reduce((a, i) => a + s.money[i], 0), 0);       // people's money balances by itself
  s.seats.forEach((x, i) => { if (x.bot) assert.strictEqual(s.money[i], 0); });
  R.applyAction(s, { type: "endSession" }, ctx("h"));
  for (let i = 0; i < 400 && s.started; i++) { runBots(s); if (!s.started) break; const id = s.g.turn === s.players.h.seat ? "h" : "a"; const m = awaitBot.capsaMove(s.g, s.g.turn); R.applyAction(s, m.type === "pass" ? { type: "pass" } : { type: "play", cards: m.cards }, ctx(id)); }
  assert.ok(!s.started && !s.closed);
  assert.strictEqual(s.sessions.length, 1);
  assert.deepStrictEqual(s.sessions[0].rows.map(r => r.name).sort(), ["Ana", "Host"]);
  assert.strictEqual(R.publicState(s).ledger.reduce((a, r) => a + r.net, 0), 0);
  assert.strictEqual(s.seats.filter(Boolean).length, 2);           // the bots go; the people stay
  R.applyAction(s, { type: "start" }, ctx("h"));                     // next session in the same room
  assert.ok(s.g.lead3d);                                            // a new session starts from the 3♦
});

test("capsa rooms: leaving hands your seat to a bot; the host link reconnects the host", () => {
  const s = R.newRoom({ code: "CAP234", settings: settingsC, host: { id: "h", name: "Host", tokenHash: "th", hostKeyHash: "key" }, now: clock });
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
  R.applyAction(s, { type: "start" }, ctx("h"));
  const seatA = s.players.a.seat;
  R.applyAction(s, { type: "leave" }, ctx("a"));
  assert.ok(s.seats[seatA].bot);
  assert.strictEqual(s.departed[0].name, "Ana");
  assert.throws(() => R.claimHost(s, { hostKeyHash: "nope", id: "x", tokenHash: "tx" }), /host link/);
  assert.strictEqual(R.claimHost(s, { hostKeyHash: "key", id: "x", tokenHash: "t2" }), "h");
  assert.strictEqual(R.findPlayerByTokenHash(s, "t2"), "h");
  R.applyAction(s, { type: "chat", text: "gg" }, ctx("h"));
  assert.strictEqual(R.publicState(s).chat[0].text, "gg");
});

test("capsa rooms: every bot gets its own name", () => {
  const s = R.newRoom({ code: "CAP234", settings: settingsC, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  R.applyAction(s, { type: "start" }, ctx("h"));
  const names = s.seats.map(x => x.name);
  assert.strictEqual(new Set(names).size, 4);
});

// ---------- loser mode ----------
// a loser-mode game with exactly these hands (no padding)
const loserGame = (hands, turn = 0) => ({ no: 2, mode: "loser", out: [], hands: hands.map(h => h.split(" ").filter(Boolean).sort(C.byValue)), turn, trick: null, passed: [false, false, false, false], lead3d: false, log: [], finished: null });

test("loser mode: going out doesn't end the game; places score +3 +1 -1 -3", () => {
  const g = loserGame(["3d", "4d 9c", "5d 9d", "6d 9h Kc"]);
  C.play(g, 0, ["3d"]);                                  // seat 0 is out in 1st
  assert.strictEqual(g.finished, null);
  assert.deepStrictEqual(g.out, [0]);
  assert.strictEqual(g.turn, 1);
  C.play(g, 1, ["4d"]); C.play(g, 2, ["5d"]); C.play(g, 3, ["6d"]);
  assert.strictEqual(g.turn, 1);                          // seat 0 is skipped
  C.pass(g, 1); C.pass(g, 2);                             // seat 3 takes the round
  assert.strictEqual(g.turn, 3); assert.strictEqual(g.trick, null);
  C.play(g, 3, ["9h"]); C.pass(g, 1); C.pass(g, 2);
  C.play(g, 3, ["Kc"]);                                   // seat 3 out in 2nd
  assert.deepStrictEqual(g.out, [0, 3]);
  C.pass(g, 1); C.pass(g, 2);                             // nobody beats it: the next player holding cards leads
  assert.strictEqual(g.trick, null);
  assert.strictEqual(g.turn, 1);
  C.play(g, 1, ["9c"]);                                   // seat 1 out in 3rd: seat 2 is left holding
  assert.ok(g.finished);
  assert.deepStrictEqual(g.finished.place, [0, 2, 3, 1]);
  assert.deepStrictEqual(g.finished.points, [3, -1, -3, 1]);
  assert.strictEqual(g.finished.winner, 0);
  assert.strictEqual(g.finished.loser, 2);
});

test("loser mode: a bomb on a single 2 ends it: out players keep places, bomber next, rest by fewest cards, bombed last", () => {
  const g = loserGame(["3d", "2s 4c", "5c 5d 5h 5s 9d", "6d 7d 8d"]);
  C.play(g, 0, ["3d"]);                                   // seat 0 out in 1st
  C.play(g, 1, ["2s"]);                                   // seat 1 plays a single 2
  C.play(g, 2, ["5c", "5d", "5h", "5s"]);                 // seat 2 bombs it
  const f = g.finished;
  assert.strictEqual(f.reason, "bomb");
  assert.deepStrictEqual(f.place, [0, 3, 1, 2]);          // 1st kept, bomber 2nd, seat 3 (3 cards) 3rd, bombed last
  assert.deepStrictEqual(f.points, [3, -3, 1, -1]);
  assert.strictEqual(f.bombed, 1);
});

test("loser mode: players stuck on single 2s share the last places", () => {
  const g = loserGame(["3d", "2c", "2d", "2h"]);
  C.play(g, 0, ["3d"]);
  C.pass(g, 1); C.pass(g, 2); C.pass(g, 3);               // nobody beats it; seat 1 leads but holds only a 2
  assert.strictEqual(g.turn, 1);
  C.pass(g, 1);                                           // everyone left holds a single 2: stuck
  assert.strictEqual(g.finished.reason, "stuck");
  assert.deepStrictEqual(g.finished.points, [3, -1, -1, -1]);
});

test("loser mode: whole games end with one player holding cards and points adding to zero", () => {
  for (let k = 0; k < 150; k++) {
    const g = C.startGame(1, shuffled, -1, "loser");
    for (let i = 0; i < 600 && !g.finished; i++) {
      const m = awaitBot.capsaMove(g, g.turn, "normal");
      if (m.type === "pass") C.pass(g, g.turn); else C.play(g, g.turn, m.cards);
    }
    assert.ok(g.finished, "game ended");
    assert.strictEqual(g.finished.points.reduce((a, b) => a + b, 0), 0);
    if (g.finished.reason === "out") {
      assert.deepStrictEqual(g.finished.place.slice().sort(), [0, 1, 2, 3]);
      assert.strictEqual(g.hands.filter(h => h.length).length, 1);
    }
  }
});

test("loser mode rooms: money only between people, the winner starts the next game", () => {
  const s = R.newRoom({ code: "CAP234", settings: { ...settingsC, mode: "loser" }, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
  R.applyAction(s, { type: "start" }, ctx("h"));
  assert.strictEqual(s.g.mode, "loser");
  for (let i = 0; i < 800 && !s.g.finished; i++) {
    runBots(s);
    if (s.g.finished) break;
    const id = s.g.turn === s.players.h.seat ? "h" : "a";
    const m = awaitBot.capsaMove(s.g, s.g.turn, "normal");
    R.applyAction(s, m.type === "pass" ? { type: "pass" } : { type: "play", cards: m.cards }, ctx(id));
  }
  const f = s.g.finished;
  assert.ok(f && f.mode === "loser");
  const [h, a] = [s.players.h.seat, s.players.a.seat];
  const expect = Math.sign(f.place[a] - f.place[h]);
  assert.strictEqual(s.money[h], expect); assert.strictEqual(s.money[a], -expect);
  assert.ok(s.seats.every((x, i) => !x.bot || s.money[i] === 0));
  clock += 10000; R.applyAction(s, { type: "tick" }, ctx("h"));
  if (f.winner >= 0) assert.strictEqual(s.g.turn, f.winner);
});
