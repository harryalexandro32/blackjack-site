// Run with: node --test
const test = require("node:test");
const assert = require("node:assert");
const R = require("./rules.js");

const C = r => ({ r, s: "♠" });
const cards = (...rs) => rs.map(C);

test("hand totals handle soft and hard aces", () => {
  assert.deepStrictEqual(R.total(cards("A", "6")), { t: 17, soft: true });
  assert.deepStrictEqual(R.total(cards("A", "6", "10")), { t: 17, soft: false });
  assert.deepStrictEqual(R.total(cards("A", "A", "9")), { t: 21, soft: true });
  assert.deepStrictEqual(R.total(cards("K", "Q", "5")), { t: 25, soft: false });
});

test("blackjack needs two cards and no split", () => {
  assert.ok(R.isBlackjack(cards("A", "K")));
  assert.ok(!R.isBlackjack(cards("A", "K"), true));
  assert.ok(!R.isBlackjack(cards("7", "7", "7")));
});

test("dealer hits soft 17 only under H17", () => {
  assert.ok(R.dealerHits(cards("A", "6"), true));
  assert.ok(!R.dealerHits(cards("A", "6"), false));
  assert.ok(!R.dealerHits(cards("10", "7"), true));
  assert.ok(R.dealerHits(cards("10", "6"), false));
});

test("settlement pays the right units", () => {
  const s = (hand, dealer) => R.settleHand({ cards: cards(...hand.c), ...hand }, cards(...dealer));
  assert.deepStrictEqual(s({ c: ["A", "K"] }, ["10", "8"]), { units: 1.5, outcome: "blackjack" });
  assert.deepStrictEqual(s({ c: ["A", "K"] }, ["A", "Q"]), { units: 0, outcome: "push" });
  assert.deepStrictEqual(s({ c: ["A", "K"], fromSplit: true }, ["10", "8"]), { units: 1, outcome: "win" });
  assert.deepStrictEqual(s({ c: ["10", "9", "2"] }, ["A", "Q"]), { units: -1, outcome: "lose" });
  assert.deepStrictEqual(s({ c: ["6", "5", "9"], doubled: true }, ["10", "6", "8"]), { units: 2, outcome: "win" });
  assert.deepStrictEqual(s({ c: ["6", "5", "4"], doubled: true }, ["10", "8"]), { units: -2, outcome: "lose" });
  assert.deepStrictEqual(s({ c: ["10", "6", "9"] }, ["10", "6", "9"]), { units: -1, outcome: "bust" });
  assert.deepStrictEqual(s({ c: ["10", "8"] }, ["9", "9"]), { units: 0, outcome: "push" });
  assert.deepStrictEqual(s({ c: ["10", "6"], surrendered: true }, ["10", "9"]), { units: -0.5, outcome: "surrender" });
  assert.strictEqual(R.settleInsurance(cards("A", "K")), 1);
  assert.strictEqual(R.settleInsurance(cards("A", "7")), -0.5);
});

test("basic strategy spot checks (6 decks, H17, DAS, late surrender)", () => {
  const all = { double: true, split: true, surrender: true, h17: true, das: true };
  const play = (hand, up, over = {}) => {
    const c = cards(...hand);
    const pair = c.length === 2 && R.value(c[0]) === R.value(c[1]);
    return R.strategy(c, C(up), { ...all, split: pair, ...over });
  };
  const cases = [
    [["10", "6"], "10", "R"], [["10", "6"], "10", "H", { surrender: false }],
    [["10", "5"], "A", "R"], [["10", "5"], "A", "H", { h17: false }],
    [["8", "8"], "A", "R"], [["8", "8"], "A", "P", { h17: false }], [["8", "8"], "10", "P"],
    [["A", "A"], "6", "P"], [["K", "Q"], "6", "S"], [["9", "9"], "7", "S"], [["9", "9"], "8", "P"],
    [["5", "5"], "9", "D"], [["4", "4"], "5", "P"], [["4", "4"], "5", "H", { das: false }],
    [["A", "7"], "2", "D"], [["A", "7"], "2", "S", { h17: false }], [["A", "7"], "9", "H"],
    [["A", "7"], "4", "S", { double: false }], [["A", "8"], "6", "D"], [["A", "6"], "2", "H"],
    [["5", "6"], "A", "D"], [["5", "6"], "A", "H", { h17: false }], [["10", "2"], "3", "H"],
    [["10", "2"], "4", "S"], [["5", "4"], "3", "D"], [["5", "4"], "2", "H"], [["10", "7"], "A", "R"],
    [["5", "4", "2"], "6", "H", { double: false }], [["10", "3", "3"], "10", "H", { surrender: false, double: false }]
  ];
  for (const [hand, up, want, over] of cases) {
    assert.strictEqual(play(hand, up, over), want, `${hand.join(",")} vs ${up} ${JSON.stringify(over || {})}`);
  }
});
