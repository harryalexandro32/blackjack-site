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
  assert.deepStrictEqual(P.legalActions(t, 0).raise, { min: 20, max: 1000, isBet: false, step: 1 });
  P.act(t, 0, { type: "raise", to: 35 });                  // raise of 25
  assert.strictEqual(P.legalActions(t, 1).raise.min, 60);  // 35 + 25
  assert.throws(() => P.act(t, 1, { type: "raise", to: 59 }));
  P.act(t, 1, { type: "call" }); P.act(t, 2, { type: "call" });
  assert.strictEqual(t.hand.street, "flop");
  assert.deepStrictEqual(P.legalActions(t, 1).raise, { min: 10, max: 965, isBet: true, step: 1 });
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

test("show or muck: winners show at showdown, losers follow their setting, all-in hands are tabled", () => {
  // heads-up, seat 0 has aces, seat 1 has seven-deuce; board Kh 9s 4c 3d Jh
  const deck = () => stacked(["7c", "As", "2d", "Ad", "5s", "Kh", "9s", "4c", "6s", "3d", "8s", "Jh"]);
  const checkDown = t => {
    P.startHand(t, deck());
    P.act(t, 0, { type: "call" }); P.act(t, 1, { type: "check" });
    for (let s = 0; s < 3; s++) { P.act(t, 1, { type: "check" }); P.act(t, 0, { type: "check" }); }
    return P.publicView(t, -1).hand;
  };
  let t = table([1000, 1000]);
  let h = checkDown(t);
  assert.deepStrictEqual(h.players[0].hole, ["As", "Ad"]);          // the winner must show
  assert.strictEqual(h.players[1].hole, null);                       // the loser mucks by default
  assert.deepStrictEqual(h.mucked, [1]);
  assert.strictEqual(h.handNames[1], undefined);                     // a mucked hand isn't named either

  t = table([1000, 1000]); t.seats[1].show = true;
  h = checkDown(t);
  assert.deepStrictEqual(h.players[1].hole, ["7c", "2d"]);           // shows because they chose to
  assert.deepStrictEqual(h.mucked, []);

  t = table([1000, 1000]);                                           // all in before the flop: both hands tabled
  P.startHand(t, deck());
  P.act(t, 0, { type: "raise", to: 1000 }); P.act(t, 1, { type: "call" });
  h = P.publicView(t, -1).hand;
  assert.ok(h.players[0].hole && h.players[1].hole);

  t = table([1000, 1000, 1000]); t.seats[0].show = true;             // uncontested: show only if you want to
  P.startHand(t, P.newDeck());
  P.act(t, 0, { type: "raise", to: 100 }); P.act(t, 1, { type: "fold" }); P.act(t, 2, { type: "fold" });
  assert.ok(P.publicView(t).hand.players[0].hole);
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

test("raise steps: only multiples of the step, plus the exact minimum and all-in", () => {
  const t = P.createTable({ smallBlind: 100, bigBlind: 200, maxSeats: 3, step: 1000 });
  [50000, 50000, 3333].forEach((s, i) => t.seats[i] = { id: "p" + i, name: "P" + i, stack: s });
  P.startHand(t, P.newDeck());                                   // seat 0 is under the gun
  assert.strictEqual(P.legalActions(t, 0).raise.step, 1000);
  assert.throws(() => P.act(t, 0, { type: "raise", to: 20100 }), /steps of 1000/);
  P.act(t, 0, { type: "raise", to: 400 });                      // the minimum raise is always allowed
  assert.throws(() => P.act(t, 1, { type: "raise", to: 1500 }), /steps/);
  P.act(t, 1, { type: "raise", to: 2000 });                     // a multiple of the step
  P.act(t, 2, { type: "raise", to: 3333 });                     // all in, even though it isn't round
  assert.strictEqual(t.hand.currentBet, 3333);
  assert.throws(() => P.createTable({ smallBlind: 1, bigBlind: 2, step: 0 }), /raise step/);
});

test("antes go in before the blinds as dead money", () => {
  const t = P.createTable({ smallBlind: 5, bigBlind: 10, maxSeats: 3, ante: 2 });
  [1000, 1000, 1000].forEach((s, i) => t.seats[i] = { id: "p" + i, name: "P" + i, stack: s });
  P.startHand(t, P.newDeck());
  assert.deepStrictEqual(t.seats.map(s => s.stack), [998, 993, 988]);
  assert.strictEqual(P.potTotal(t.hand), 21);
  assert.strictEqual(P.legalActions(t, 0).call, 10);                 // the ante isn't part of the bet to call
  P.act(t, 0, { type: "fold" }); P.act(t, 1, { type: "fold" });
  assert.strictEqual(t.seats[2].stack, 1009);                       // +4 in antes and +5 small blind
  assert.strictEqual(chips(t), 3000);
});

test("straddle: the player after the big blind posts double and acts last before the flop", () => {
  const t = P.createTable({ smallBlind: 5, bigBlind: 10, maxSeats: 4, straddle: true });
  [1000, 1000, 1000, 1000].forEach((s, i) => t.seats[i] = { id: "p" + i, name: "P" + i, stack: s });
  P.startHand(t, P.newDeck());                                        // button 0, blinds 1 and 2, straddle 3
  assert.strictEqual(t.hand.straddleSeat, 3);
  assert.strictEqual(t.seats[3].stack, 980);
  assert.strictEqual(t.hand.toAct, 0);
  assert.strictEqual(P.legalActions(t, 0).call, 20);
  assert.strictEqual(P.legalActions(t, 0).raise.min, 40);             // min raise is another straddle
  P.act(t, 0, { type: "call" }); P.act(t, 1, { type: "call" }); P.act(t, 2, { type: "call" });
  assert.strictEqual(t.hand.toAct, 3);                                // the straddler gets the option
  assert.ok(P.legalActions(t, 3).check);
  const heads = P.createTable({ smallBlind: 5, bigBlind: 10, maxSeats: 2, straddle: true });
  [1000, 1000].forEach((s, i) => heads.seats[i] = { id: "h" + i, name: "H" + i, stack: s });
  P.startHand(heads, P.newDeck());
  assert.strictEqual(heads.hand.straddleSeat, undefined);             // no straddle heads-up
});

test("run it twice: all in players vote; twice splits each pot across two boards", () => {
  // seat 0: As Ad, seat 1: Kc Kd. Deals pop from the end of the deck.
  const make = () => {
    const t = P.createTable({ smallBlind: 5, bigBlind: 10, maxSeats: 2, runTwice: true });
    [1000, 1000].forEach((s, i) => t.seats[i] = { id: "p" + i, name: "P" + i, stack: s });
    P.startHand(t, stacked(["Kc", "As", "Kd", "Ad"]));
    P.act(t, 0, { type: "raise", to: 1000 }); P.act(t, 1, { type: "call" });
    return t;
  };
  let t = make();
  assert.strictEqual(t.hand.ritPending, true);
  assert.ok(P.publicView(t).hand.players[0].hole && P.publicView(t).hand.players[1].hole); // tabled while voting
  assert.strictEqual(P.legalActions(t, 0), null);
  P.voteRunTwice(t, 0, true);
  assert.strictEqual(t.hand.ritPending, true);                        // still waiting for the other player
  assert.throws(() => P.voteRunTwice(t, 0, true), /already voted/);
  P.voteRunTwice(t, 1, true);
  assert.strictEqual(t.hand.street, "done");
  assert.strictEqual(t.hand.runs.length, 2);
  assert.notDeepStrictEqual(t.hand.runs[0].board, t.hand.runs[1].board);
  assert.strictEqual(t.hand.runs.reduce((a, r) => a + r.results.reduce((b, x) => b + x.amount, 0), 0), 2000);
  assert.strictEqual(chips(t), 2000);

  t = make();
  P.voteRunTwice(t, 1, false);                                        // one "no" means once
  assert.strictEqual(t.hand.street, "done");
  assert.strictEqual(t.hand.runs, undefined);
  assert.strictEqual(t.hand.board.length, 5);

  t = make();
  P.voteRunTwice(t, 0, true);
  P.resolveRunTwice(t);                                               // time's up: no vote counts as no
  assert.strictEqual(t.hand.ritTwice, false);
  assert.strictEqual(chips(t), 2000);
});
