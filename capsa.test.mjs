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
