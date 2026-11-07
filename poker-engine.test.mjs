// Run with: node --test
import test from "node:test";
import assert from "node:assert";
import { webcrypto } from "node:crypto";
import * as P from "./supabase/functions/_shared/poker-engine.js";

const ev = s => P.evaluate(s.split(" "));
const beats = (a, b) => assert.ok(ev(a).score > ev(b).score, `${a} (${ev(a).name}) should beat ${b} (${ev(b).name})`);
const ties = (a, b) => assert.strictEqual(ev(a).score, ev(b).score, `${a} should tie ${b}`);

// A deck whose pops come out in exactly this order, the rest of the cards after.
function stacked(order) {
  const rest = P.newDeck().filter(c => !order.includes(c));
  return [...rest, ...order.slice().reverse()];
}
function table(stacks, sb = 5, bb = 10) {
  const t = P.createTable({ smallBlind: sb, bigBlind: bb, maxSeats: stacks.length });
  stacks.forEach((s, i) => { if (s != null) t.seats[i] = { id: "p" + i, name: "P" + i, stack: s }; });
  return t;
}
const chips = t => t.seats.reduce((s, x) => s + (x ? x.stack : 0), 0) + P.potTotal(t.hand);

test("hand names and categories", () => {
  assert.strictEqual(ev("As Ks Qs Js Ts 2d 3c").name, "Royal flush");
  assert.strictEqual(ev("5h 4h 3h 2h Ah Kd Kc").name, "Straight flush, Five high");
  assert.strictEqual(ev("9c 9d 9h 9s 2d 3c 4h").name, "Four of a kind, Nines");
  assert.strictEqual(ev("Kc Kd Kh 7s 7d 7c 2h").name, "Full house, Kings full of Sevens");
  assert.strictEqual(ev("Ah 9h 6h 4h 2h Ks Kd").name, "Flush, Ace high");
  assert.strictEqual(ev("Ad 2c 3h 4s 5d Kc Kh").name, "Straight, Five high");
  assert.strictEqual(ev("Td Jc Qh Ks Ad 2c 2h").name, "Straight, Ace high");
  assert.strictEqual(ev("5c 5d 5h Ks 9d 3c 2h").name, "Three of a kind, Fives");
  assert.strictEqual(ev("Ac Ad 9h 9s 4d 4c 2h").name, "Two pair, Aces and Nines");
  assert.strictEqual(ev("Jc Jd 9h 7s 4d 3c 2h").name, "Pair of Jacks");
  assert.strictEqual(ev("Ac Qd 9h 7s 4d 3c 2h").name, "High card, Ace");
});

test("hand ranking and kickers", () => {
  beats("2h 3h 4h 5h 6h", "Ac Ad As Ah Kd");          // straight flush > quads
  beats("Ac Ad As Kh Kd", "Ah Kh Qh Jh 9h");          // full house > flush
  beats("Ah Kh Qh Jh 9h", "Tc Jd Qh Ks Ad");          // flush > straight
  beats("6c 2d 3h 4s 5d", "Ad 2c 3h 4s 5d");          // six-high straight > wheel
  beats("Ac Ad Kh 7s 4d", "Ac Ad Qh Js Td");          // kicker
  beats("Ac Ad 9h 9s Kd", "Ac Ad 9h 9s Qd");          // two pair kicker
  ties("Ac Kd Qh Js 9d 2c 3h", "As Kh Qd Jc 9h 2d 3s"); // same five cards, different suits
  // three pairs: best two pair plus the best kicker, which can be the third pair
  assert.strictEqual(ev("Ac Ad Kh Ks 2d 2c Qh").score, ev("Ac Ad Kh Ks Qh").score);
  // flush uses the top five suited cards
  assert.strictEqual(ev("Ah Kh 9h 6h 4h 2h 3c").score, ev("Ah Kh 9h 6h 4h").score);
});

test("blinds, button and dealing order (three-handed)", () => {
  const t = table([1000, 1000, 1000]);
  P.startHand(t, P.shuffle(P.newDeck(), webcrypto.getRandomValues.bind(webcrypto)));
  assert.strictEqual(t.button, 0);
  assert.strictEqual(t.hand.sbSeat, 1); assert.strictEqual(t.hand.bbSeat, 2);
  assert.strictEqual(t.seats[1].stack, 995); assert.strictEqual(t.seats[2].stack, 990);
  assert.strictEqual(t.hand.toAct, 0); // under the gun is the button when three-handed
  t.hand.players.forEach(p => assert.strictEqual(p.hole.length, 2));
});

test("heads-up: button posts the small blind, acts first preflop and last after the flop", () => {
  const t = table([1000, 1000]);
  P.startHand(t, P.newDeck());
  assert.strictEqual(t.button, 0); assert.strictEqual(t.hand.sbSeat, 0); assert.strictEqual(t.hand.bbSeat, 1);
  assert.strictEqual(t.hand.toAct, 0);
  P.act(t, 0, { type: "call" });
  assert.strictEqual(t.hand.toAct, 1);                     // big blind gets the option
  assert.ok(P.legalActions(t, 1).check);
  P.act(t, 1, { type: "check" });
  assert.strictEqual(t.hand.street, "flop");
  assert.strictEqual(t.hand.toAct, 1);                     // big blind acts first after the flop
  // the button moves for the next hand
  P.act(t, 1, { type: "raise", to: 10 }); P.act(t, 0, { type: "fold" });
  assert.strictEqual(t.hand.street, "done");
  P.startHand(t, P.newDeck());
  assert.strictEqual(t.button, 1); assert.strictEqual(t.hand.sbSeat, 1);
});

test("minimum raise is the size of the last raise; a bet into an empty pot is at least the big blind", () => {
  const t = table([1000, 1000, 1000]);
  P.startHand(t, P.newDeck());
  assert.deepStrictEqual(P.legalActions(t, 0).raise, { min: 20, max: 1000, isBet: false });
  P.act(t, 0, { type: "raise", to: 35 });                  // raise of 25
  assert.strictEqual(P.legalActions(t, 1).raise.min, 60);  // 35 + 25
  assert.throws(() => P.act(t, 1, { type: "raise", to: 59 }));
  P.act(t, 1, { type: "call" }); P.act(t, 2, { type: "call" });
  assert.strictEqual(t.hand.street, "flop");
  assert.deepStrictEqual(P.legalActions(t, 1).raise, { min: 10, max: 965, isBet: true });
});

test("an all-in for less than a full raise does not reopen betting", () => {
  const t = table([1000, 1000, 130]);                      // big blind (seat 2) is short
  P.startHand(t, P.newDeck());
  P.act(t, 0, { type: "raise", to: 100 });                 // full raise of 90
  P.act(t, 1, { type: "call" });
  P.act(t, 2, { type: "raise", to: 130 });                 // all-in, only 30 more: incomplete
  assert.strictEqual(t.hand.toAct, 0);
  const legal = P.legalActions(t, 0);
  assert.strictEqual(legal.call, 30);
  assert.strictEqual(legal.raise, null);                   // seat 0 already acted: call or fold only
  P.act(t, 0, { type: "call" }); P.act(t, 1, { type: "call" });
  assert.strictEqual(t.hand.street, "flop");
  assert.strictEqual(P.potTotal(t.hand), 390);
});

test("side pots: short all-in wins the main pot, the next best hand wins the side pot", () => {
  // seat 0 button (stack 300), seat 1 SB (stack 50), seat 2 BB (stack 100)
  const deck = stacked(["Ah", "Kd", "Qc", "As", "Kh", "Qd", /*burn*/ "2c", "7s", "8d", "3h", "2d", "4c", "2h", "9s"]);
  // deal starts left of the button: seat1 Ah, seat2 Kd, seat0 Qc, then seat1 As, seat2 Kh, seat0 Qd
  const t = table([300, 50, 100]);
  P.startHand(t, deck);
  P.act(t, 0, { type: "raise", to: 300 });                 // button shoves
  P.act(t, 1, { type: "call" });                           // SB calls all-in for 50
  P.act(t, 2, { type: "call" });                           // BB calls all-in for 100
  const h = t.hand;
  assert.strictEqual(h.street, "done");
  assert.deepStrictEqual(h.uncalled, { seat: 0, amount: 200 }); // nobody matched the last 200
  assert.deepStrictEqual(h.pots.map(p => [p.amount, p.winners]), [[150, [1]], [100, [2]]]);
  assert.deepStrictEqual(t.seats.map(s => s.stack), [200, 150, 100]);
  assert.strictEqual(h.handNames[1], "Pair of Aces");
});

test("split pot: royal flush on the board chops, odd chip goes clockwise from the button", () => {
  const deck = stacked(["2c", "3c", "4d", "2d", "3d", "4h", "5c", "As", "Ks", "Qs", "6c", "Js", "7c", "Ts"]);
  const t = table([1000, 1000, 1000], 5, 10);
  P.startHand(t, deck);
  P.act(t, 0, { type: "call" });                           // 10
  P.act(t, 1, { type: "fold" });                           // SB folds its 5: pot 25 between seats 0 and 2
  P.act(t, 2, { type: "check" });
  for (const street of ["flop", "turn", "river"]) { assert.strictEqual(t.hand.street, street); P.act(t, 2, { type: "check" }); P.act(t, 0, { type: "check" }); }
  assert.strictEqual(t.hand.handNames[0], "Royal flush");
  assert.deepStrictEqual(t.hand.pots[0].winners, [0, 2]);
  // 25 split two ways: 13 to seat 2 (first clockwise from button 0), 12 to seat 0
  assert.deepStrictEqual(t.seats.map(s => s.stack), [1002, 995, 1003]);
});

test("everyone folds to a bet: winner takes the pot without showing", () => {
  const t = table([1000, 1000, 1000]);
  P.startHand(t, P.newDeck());
  P.act(t, 0, { type: "raise", to: 1000 });
  P.act(t, 1, { type: "fold" }); P.act(t, 2, { type: "fold" });
  assert.strictEqual(t.hand.showdown, false);
  assert.deepStrictEqual(t.seats.map(s => s.stack), [1015, 995, 990]);
  assert.deepStrictEqual(P.publicView(t).hand.players[0].hole, null); // winner's cards stay hidden
});

test("hidden information: public view shows only your own cards until showdown", () => {
  const t = table([1000, 1000, 1000]);
  P.startHand(t, P.newDeck());
  const v = P.publicView(t, 1);
  assert.ok(v.hand.players[1].hole);
  assert.strictEqual(v.hand.players[0].hole, null);
  assert.strictEqual(JSON.stringify(P.publicView(t)).includes(t.hand.deck[0]), false);
});

test("random play keeps every chip and always finishes hands", () => {
  const rnd = webcrypto.getRandomValues.bind(webcrypto);
  const r = n => P.randomInt(n, rnd);
  for (let game = 0; game < 300; game++) {
    const seats = 2 + r(7);
    const t = table(Array.from({ length: seats }, () => 50 + r(500)), 1 + r(3), 4 + r(6));
    const start = chips(t);
    for (let hand = 0; hand < 30 && P.canStartHand(t); hand++) {
      P.startHand(t, P.shuffle(P.newDeck(), rnd));
      let steps = 0;
      while (P.handInProgress(t)) {
        assert.ok(++steps < 200, "hand did not finish");
        const seat = t.hand.toAct, legal = P.legalActions(t, seat);
        const roll = r(10);
        if (legal.raise && roll < 3) P.act(t, seat, { type: "raise", to: legal.raise.min + r(legal.raise.max - legal.raise.min + 1) });
        else if (roll < 5 && !legal.check) P.act(t, seat, { type: "fold" });
        else P.act(t, seat, legal.check ? { type: "check" } : { type: "call" });
        assert.strictEqual(chips(t), start);
      }
      assert.strictEqual(chips(t), start);
      assert.strictEqual(t.hand.board.length === 5 || !t.hand.showdown, true);
      t.seats.forEach(s => assert.ok(s.stack >= 0));
    }
  }
});

test("settling up nets everyone and lists the payments", () => {
  const { rows, payments } = P.settle([
    { name: "Ana", buyIn: 10000, cashOut: 25000 },
    { name: "Bo", buyIn: 10000, cashOut: 0 },
    { name: "Cy", buyIn: 20000, cashOut: 15000 }
  ]);
  assert.deepStrictEqual(rows.map(r => r.net), [15000, -10000, -5000]);
  assert.deepStrictEqual(payments, [{ from: "Bo", to: "Ana", amount: 10000 }, { from: "Cy", to: "Ana", amount: 5000 }]);
});
