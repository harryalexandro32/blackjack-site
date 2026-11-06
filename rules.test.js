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

test("bets settle in cents: stake back plus winnings", () => {
  const b = (hand, dealer) => R.settleBet({ cards: cards(...hand.c), bet: 2500, ...hand }, cards(...dealer));
  assert.deepStrictEqual(b({ c: ["A", "K"] }, ["10", "8"]), { stake: 2500, profit: 3750, returned: 6250, outcome: "blackjack" });
  assert.deepStrictEqual(b({ c: ["10", "9"] }, ["10", "8"]), { stake: 2500, profit: 2500, returned: 5000, outcome: "win" });
  assert.deepStrictEqual(b({ c: ["6", "5", "10"], doubled: true }, ["10", "8"]), { stake: 5000, profit: 5000, returned: 10000, outcome: "win" });
  assert.deepStrictEqual(b({ c: ["6", "5", "2"], doubled: true }, ["10", "8"]), { stake: 5000, profit: -5000, returned: 0, outcome: "lose" });
  assert.deepStrictEqual(b({ c: ["10", "6"], surrendered: true }, ["10", "8"]), { stake: 2500, profit: -1250, returned: 1250, outcome: "surrender" });
  assert.deepStrictEqual(b({ c: ["10", "8"] }, ["9", "9"]), { stake: 2500, profit: 0, returned: 2500, outcome: "push" });
  // $1 blackjack pays $1.50
  assert.strictEqual(R.settleBet({ cards: cards("A", "Q"), bet: 100 }, cards("9", "9")).profit, 150);
  // insurance on a $25 bet costs $12.50, pays $25 when the dealer has blackjack
  assert.deepStrictEqual(R.settleInsuranceBet(2500, cards("A", "K")), { stake: 1250, profit: 2500, returned: 3750 });
  assert.deepStrictEqual(R.settleInsuranceBet(2500, cards("A", "6")), { stake: 1250, profit: -1250, returned: 0 });
  // even money: blackjack + insurance always nets exactly 1x the bet
  for (const d of [cards("A", "K"), cards("A", "6")]) {
    const net = R.settleBet({ cards: cards("A", "J"), bet: 2500 }, d).profit + R.settleInsuranceBet(2500, d).profit;
    assert.strictEqual(net, 2500);
  }
});

test("shuffle keeps every card and spreads them evenly", () => {
  const nodeRandom = require("node:crypto").getRandomValues;
  const deck = Array.from({ length: 52 }, (_, i) => i);
  assert.deepStrictEqual([...R.shuffle(deck.slice(), nodeRandom)].sort((a, b) => a - b), deck);
  // where card 0 lands over many shuffles should be close to uniform across 52 positions
  const N = 52000, counts = new Array(52).fill(0);
  for (let i = 0; i < N; i++) counts[R.shuffle(deck.slice(), nodeRandom).indexOf(0)]++;
  const exp = N / 52, chi2 = counts.reduce((s, c) => s + (c - exp) ** 2 / exp, 0);
  assert.ok(chi2 < 90, `chi-square ${chi2.toFixed(1)} too high for 51 degrees of freedom`);
  // randomInt rejects the uneven tail: a generator stuck at the top of the range must be retried
  let calls = 0;
  const fake = buf => { buf[0] = calls++ === 0 ? 0xFFFFFFFF : 7; };
  assert.strictEqual(R.randomInt(6, fake), 1);
  assert.strictEqual(calls, 2);
});
