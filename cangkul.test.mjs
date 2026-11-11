// Run with: node --test  (or: node cangkul.test.mjs)
import test from "node:test";
import assert from "node:assert";
import { webcrypto } from "node:crypto";
import * as C from "./supabase/functions/_shared/cangkul-engine.js";
import { cangkulMove, remember } from "./supabase/functions/_shared/cangkul-bot.js";
import * as E from "./supabase/functions/_shared/poker-engine.js";

// the same deck the table server hands to a room: poker-engine's, shuffled
const rng = a => webcrypto.getRandomValues(a);
const shuffled = () => E.shuffle(E.newDeck(), rng);
const sum = a => a.reduce((x, y) => x + y, 0);

// a game with exactly these hands; stock: top card LAST (it's drawn with pop)
function game(hands, { stock = [], turn = 0, mode = "winner", emptyStock = "take" } = {}) {
  return {
    no: 1, seats: hands.length, in: hands.map((h, i) => i).filter(i => hands[i].length), mode, emptyStock, handSize: 7,
    hands: hands.map(h => h.slice().sort(C.bySuit)), stock: stock.slice(), discard: [], turn, trick: null, last: null, out: [], log: [], step: 0, finished: null
  };
}
// every card is somewhere, exactly once
function allCards(g) {
  return [...g.hands.flat(), ...g.stock, ...g.discard, ...(g.trick ? g.trick.plays.map(p => p.card) : [])];
}

test("dealing: 7 (or 5) cards each, the rest is the stock, for 2 to 4 players", () => {
  for (const n of [2, 3, 4]) for (const handSize of [7, 5]) {
    const g = C.startGame(1, shuffled(), { seats: n, handSize });
    assert.ok(g.hands.every(h => h.length === handSize));
    assert.strictEqual(g.stock.length, 52 - n * handSize);
    assert.strictEqual(new Set(allCards(g)).size, 52);
    assert.ok(g.in.includes(g.turn));
    assert.strictEqual(g.trick, null);
  }
  assert.strictEqual(C.startGame(1, shuffled(), { seats: 3 }).handSize, 7);              // 7 is the default
  assert.strictEqual(C.startGame(2, shuffled(), { seats: 4, leader: 2 }).turn, 2);        // the last winner leads
  // an empty seat at the table isn't dealt in, and can't be given the lead
  const g = C.startGame(1, shuffled(), { seats: 4, players: [0, 2], leader: 1 });
  assert.deepStrictEqual(g.hands.map(h => h.length), [7, 0, 7, 0]);
  assert.ok([0, 2].includes(g.turn));
  assert.strictEqual(g.stock.length, 38);
  assert.throws(() => C.startGame(1, shuffled(), { seats: 4, players: [3] }), /at least 2/);
  // the first leader is spread over everyone
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(C.startGame(1, shuffled(), { seats: 3 }).turn);
  assert.strictEqual(seen.size, 3);
});

test("aces are high, 2s are low", () => {
  assert.ok(C.rankOf("As") > C.rankOf("Ks") && C.rankOf("Ks") > C.rankOf("Ts") && C.rankOf("3s") > C.rankOf("2s"));
});

test("the leader plays anything; everyone else must follow suit", () => {
  const g = game([["Kh", "2s"], ["3h", "As"], ["9h", "4c"]], { stock: ["2d", "3d"] });
  assert.throws(() => C.play(g, 1, "3h"), /not your turn/);
  assert.throws(() => C.draw(g, 0), /leading/);
  assert.throws(() => C.play(g, 0, "Ad"), /hold/);
  C.play(g, 0, "Kh");
  assert.strictEqual(g.turn, 1);                                    // clockwise
  assert.deepStrictEqual(C.legal(g, 1).cards, ["3h"]);
  assert.throws(() => C.play(g, 1, "As"), /follow suit/);
  assert.throws(() => C.draw(g, 1), /can't draw/);                  // no drawing when you can follow
  assert.throws(() => C.giveUp(g, 1), /follow suit/);
  C.play(g, 1, "3h");
  assert.strictEqual(g.turn, 2);
  assert.strictEqual(g.stock.length, 2);
});

test("cangkul: no card of the suit means drawing one at a time, keeping them, until the suit turns up and is played", () => {
  const g = game([["Kh", "2s"], ["As", "4c"]], { stock: ["8d", "5h", "3c", "2d"] });   // 2d is on top
  C.play(g, 0, "Kh");
  const L = C.legal(g, 1);
  assert.ok(L.canDraw && !L.cards.length && L.giveUp === null);
  assert.throws(() => C.play(g, 1, "As"), /cangkul/);
  assert.deepStrictEqual(C.draw(g, 1), { card: "2d", played: false });
  assert.strictEqual(g.turn, 1);                                    // still their turn
  assert.deepStrictEqual(C.draw(g, 1), { card: "3c", played: false });
  assert.deepStrictEqual(C.draw(g, 1), { card: "5h", played: true });   // the heart is played at once
  assert.deepStrictEqual(g.hands[1].slice().sort(), ["2d", "3c", "4c", "As"]);
  assert.deepStrictEqual(g.stock, ["8d"]);
  assert.deepStrictEqual(g.log.find(e => e.type === "draw"), { seat: 1, type: "draw", n: 3, suit: "h" });
  // the trick is over: the king beats the 5, the leader leads again
  assert.strictEqual(g.trick, null);
  assert.strictEqual(g.last.winner, 0);
  assert.ok(g.last.plays[1].drawn);
  assert.strictEqual(g.turn, 0);
  assert.deepStrictEqual(g.discard, ["Kh", "5h"]);
});

test("empty stock, 'take': you pick up the trick so far and your turn is skipped", () => {
  // three players: C picks up both cards; nothing is left on the table, so the leader leads again
  let g = game([["5h", "2s"], ["9h", "3s"], ["As", "4c"]], { emptyStock: "take" });
  C.play(g, 0, "5h"); C.play(g, 1, "9h");
  const L = C.legal(g, 2);
  assert.ok(!L.canDraw && L.giveUp === "take");
  assert.throws(() => C.draw(g, 2), /stock is empty/);
  assert.throws(() => C.play(g, 2, "As"), /pick up/);
  C.giveUp(g, 2);
  assert.deepStrictEqual(g.hands[2].slice().sort(), ["4c", "5h", "9h", "As"]);
  assert.strictEqual(g.trick, null);
  assert.deepStrictEqual(g.last.plays, []);
  assert.strictEqual(g.turn, 0);
  assert.deepStrictEqual(g.discard, []);
  assert.strictEqual(allCards(g).length, 6);
  // four players: B picks up the lead, C's card is then alone on the table and wins when D can't follow either
  g = game([["5h", "2s"], ["3s", "4s"], ["2h", "5s"], ["6s", "7s"]], { emptyStock: "take" });
  C.play(g, 0, "5h"); C.giveUp(g, 1);
  assert.deepStrictEqual(g.hands[1].slice().sort(), ["3s", "4s", "5h"]);
  assert.strictEqual(g.turn, 2);                                    // the trick goes on, hearts still led
  assert.throws(() => C.play(g, 2, "5s"), /follow suit/);
  C.play(g, 2, "2h");
  C.giveUp(g, 3);                                                   // D picks up the 2
  assert.deepStrictEqual(g.hands[3].slice().sort(), ["2h", "6s", "7s"]);
  assert.strictEqual(g.turn, 0);                                    // nothing left on the table: the leader again
  // two players: the leader's card is picked up, the leader leads again
  g = game([["5h", "2s", "3s"], ["4s", "6s"]], { emptyStock: "take" });
  C.play(g, 0, "5h"); C.giveUp(g, 1);
  assert.strictEqual(g.turn, 0);
  assert.strictEqual(g.hands[1].length, 3);
});

test("empty stock, 'pass': you just skip; a lead left alone wins the trick", () => {
  let g = game([["5h", "2s"], ["3s", "4s"], ["6s", "7s"]], { emptyStock: "pass" });
  C.play(g, 0, "5h");
  assert.strictEqual(C.legal(g, 1).giveUp, "pass");
  assert.throws(() => C.play(g, 1, "3s"), /skip/);
  C.giveUp(g, 1); C.giveUp(g, 2);
  assert.strictEqual(g.hands[1].length, 2);
  assert.strictEqual(g.last.winner, 0);
  assert.deepStrictEqual(g.discard, ["5h"]);
  assert.strictEqual(g.turn, 0);
  // someone who can follow still plays, and the highest card wins
  g = game([["5h", "2s"], ["3s", "4s"], ["6h", "7s"]], { emptyStock: "pass" });
  C.play(g, 0, "5h"); C.giveUp(g, 1); C.play(g, 2, "6h");
  assert.strictEqual(g.last.winner, 2);
  assert.strictEqual(g.turn, 2);
});

test("the stock running dry mid-dig: what was drawn is kept, then pick up or skip", () => {
  const g = game([["5h", "2s"], ["3s", "4s"]], { stock: ["8d", "9d"], emptyStock: "take" });
  C.play(g, 0, "5h");
  C.draw(g, 1); C.draw(g, 1);
  assert.strictEqual(g.stock.length, 0);
  assert.strictEqual(g.turn, 1);
  assert.strictEqual(C.legal(g, 1).giveUp, "take");
  C.giveUp(g, 1);
  assert.deepStrictEqual(g.hands[1].slice().sort(), ["3s", "4s", "5h", "8d", "9d"]);
});

test("the highest card of the suit wins the trick, the cards go to the discard pile, the winner leads", () => {
  const g = game([["5h", "2s"], ["Ah", "3s"], ["Kh", "4s"], ["2h", "6s"]]);
  C.play(g, 0, "5h"); C.play(g, 1, "Ah"); C.play(g, 2, "Kh");
  assert.strictEqual(g.trick.plays.length, 3);
  C.play(g, 3, "2h");
  assert.strictEqual(g.last.winner, 1);
  assert.strictEqual(g.turn, 1);
  assert.deepStrictEqual(g.discard.slice().sort(), ["2h", "5h", "Ah", "Kh"]);
  assert.strictEqual(g.trick, null);
  assert.deepStrictEqual(g.log[g.log.length - 1], { seat: 1, type: "trick", n: 4 });
  C.play(g, 1, "3s");                                               // a new suit
  assert.strictEqual(g.trick.suit, "s");
  assert.strictEqual(g.last, null);
});

test("winner mode: the game ends at the end of the trick somebody went out in; the others pay 1 point per card", () => {
  const g = game([["Ah"], ["2h", "3s", "4s"], ["3h", "5s"], ["4h", "6s", "7s", "8s"]]);
  C.play(g, 0, "Ah");
  assert.deepStrictEqual(g.out, [0]);
  assert.strictEqual(g.finished, null);                             // the trick is played out first
  C.play(g, 1, "2h"); C.play(g, 2, "3h");
  assert.strictEqual(g.finished, null);
  C.play(g, 3, "4h");
  assert.strictEqual(g.finished.winner, 0);
  assert.deepStrictEqual(g.finished.points, [6, -2, -1, -3]);
  assert.deepStrictEqual(g.finished.left[3], ["6s", "7s", "8s"]);
  assert.strictEqual(g.turn, -1);
  assert.throws(() => C.play(g, 1, "3s"), /not your turn/);
  // two players out in the same trick: the first one out wins, the other pays nothing
  const h = game([["2h"], ["Ah"], ["3h", "5s"]]);
  C.play(h, 0, "2h"); C.play(h, 1, "Ah"); C.play(h, 2, "3h");
  assert.strictEqual(h.finished.winner, 0);
  assert.deepStrictEqual(h.finished.points, [1, 0, -1]);
  // going out by having your last card picked up still counts
  const k = game([["2h"], ["3s", "4s"]], { emptyStock: "take" });
  C.play(k, 0, "2h"); C.giveUp(k, 1);
  assert.strictEqual(k.finished.winner, 0);
  assert.deepStrictEqual(k.finished.points, [3, -3]);
});

test("loser mode: a player who goes out is safe; if they won the trick the lead passes clockwise", () => {
  const g = game([["Ah"], ["2h", "3s"], ["3h", "5s"]], { mode: "loser" });
  C.play(g, 0, "Ah");
  assert.deepStrictEqual(g.out, [0]);
  assert.strictEqual(g.finished, null);
  C.play(g, 1, "2h"); C.play(g, 2, "3h");
  assert.strictEqual(g.last.winner, 0);                             // the ace won, but its player is out
  assert.strictEqual(g.turn, 1);                                    // so the next player holding cards leads
  assert.strictEqual(g.finished, null);
  // a player who is out is skipped in later tricks
  C.play(g, 1, "3s");
  assert.deepStrictEqual(g.out, [0, 1]);
  assert.strictEqual(g.finished.loser, 2);                          // only one player still holds cards
});

test("loser mode: places score +1 against everyone you finish above, for 4, 3 and 2 players", () => {
  const g = game([["Ah"], ["2h"], ["3h", "4h"], ["5h", "6h", "7h"]], { mode: "loser" });
  C.play(g, 0, "Ah"); C.play(g, 1, "2h");
  assert.deepStrictEqual(g.out, [0, 1]);
  assert.strictEqual(g.finished, null);                             // two players still hold cards
  C.play(g, 2, "3h"); C.play(g, 3, "5h");
  assert.strictEqual(g.turn, 2);                                    // the ace's player and the next are out: C leads
  C.play(g, 2, "4h");
  const f = g.finished;
  assert.strictEqual(f.mode, "loser");
  assert.deepStrictEqual(f.place, [0, 1, 2, 3]);
  assert.deepStrictEqual(f.points, [3, 1, -1, -3]);
  assert.strictEqual(f.winner, 0);
  assert.strictEqual(f.loser, 3);
  assert.deepStrictEqual(f.left[3], ["6h", "7h"]);
  const g3 = game([["Ah"], ["2h", "3h"], ["4h"]], { mode: "loser" });
  C.play(g3, 0, "Ah"); C.play(g3, 1, "2h"); C.play(g3, 2, "4h");
  assert.deepStrictEqual(g3.finished.place, [0, 2, 1]);
  assert.deepStrictEqual(g3.finished.points, [2, -2, 0]);
  const g2 = game([["Ah", "Kh"], ["2h"]], { mode: "loser", turn: 1 });
  C.play(g2, 1, "2h");
  assert.deepStrictEqual(g2.finished.points, [-1, 1]);
  // an empty seat takes no place and no points
  const e = game([["Ah"], [], ["2h", "3h"]], { mode: "loser" });
  C.play(e, 0, "Ah");
  assert.deepStrictEqual(e.finished.place, [0, -1, 1]);
  assert.deepStrictEqual(e.finished.points, [1, 0, -1]);
});

test("out of time: play the lowest card, or dig for one; pick up or skip when the stock is dry", () => {
  let g = game([["Kh", "2s", "9d"], ["3h", "Ah", "As"]], { stock: ["2c"] });
  assert.deepStrictEqual(C.autoMove(g), { seat: 0, type: "play", card: "2s" });
  g = game([["Kh", "2s"], ["3h", "Ah", "As"]], { stock: ["2c"] });
  C.play(g, 0, "Kh");
  assert.deepStrictEqual(C.autoMove(g), { seat: 1, type: "play", card: "3h" });
  g = game([["Kh", "2s"], ["3s", "As"]], { stock: ["9d", "5h", "2c", "3c"] });
  C.play(g, 0, "Kh");
  assert.deepStrictEqual(C.autoMove(g), { seat: 1, type: "draw", n: 3 });
  assert.strictEqual(g.hands[1].length, 4);
  assert.strictEqual(g.turn, 0);
  g = game([["Kh", "2s"], ["3s", "As"]], { stock: ["9d"], emptyStock: "take" });
  C.play(g, 0, "Kh");
  C.autoMove(g);
  assert.deepStrictEqual(g.hands[1].slice().sort(), ["3s", "9d", "As", "Kh"]);
  assert.strictEqual(g.turn, 0);
});

test("a view shows your own cards and only counts for the rest", () => {
  const g = C.startGame(1, shuffled(), { seats: 3 });
  const v = C.viewFor(g, 1);
  assert.deepStrictEqual(v.hand, g.hands[1]);
  assert.deepStrictEqual(v.counts, [7, 7, 7]);
  assert.strictEqual(v.stock, 31);
  assert.ok(!("hands" in v));
  const text = JSON.stringify(v);
  for (const c of [...g.hands[0], ...g.hands[2], ...g.stock]) assert.ok(!text.includes(`"${c}"`), "leaked " + c);
  assert.strictEqual(C.viewFor(g, -1).hand, null);
  assert.strictEqual(C.viewFor(null, 0), null);
});

// ---------- bots ----------
function botGame(n, opts, skills) {
  const g = C.startGame(1, shuffled(), { seats: n, ...opts });
  let steps = 0;
  while (!g.finished) {
    assert.ok(++steps < 5000, "a game that never ends");
    const seat = g.turn, m = cangkulMove(g, seat, skills[seat % skills.length]);
    if (m.type === "play") C.play(g, seat, m.card); else if (m.type === "draw") C.draw(g, seat); else C.giveUp(g, seat);
    if (steps % 7 === 0) assert.strictEqual(new Set(allCards(g)).size, 52);
  }
  return { g, steps };
}

test("bots: hundreds of whole games for 2, 3 and 4 players under every setting, all legal, all finishing", () => {
  let most = 0, longestLog = 0;
  for (const n of [2, 3, 4]) for (const mode of ["winner", "loser"]) for (const emptyStock of ["take", "pass"]) for (const handSize of [7, 5]) {
    for (let k = 0; k < 120; k++) {
      const skills = [["easy"], ["normal"], ["hard"], ["hard", "normal", "easy"]][k % 4];
      const { g, steps } = botGame(n, { mode, emptyStock, handSize }, skills);
      const f = g.finished;
      most = Math.max(most, steps); longestLog = Math.max(longestLog, g.log.length);
      assert.strictEqual(sum(f.points), 0);
      assert.strictEqual(new Set([...g.hands.flat(), ...g.stock, ...g.discard, ...(g.trick ? g.trick.plays.map(p => p.card) : [])]).size, 52);
      if (mode === "winner") {
        assert.strictEqual(g.hands[f.winner].length, 0);
        g.hands.forEach((h, i) => { if (i !== f.winner) assert.strictEqual(f.points[i], 0 - h.length); });
      } else {
        assert.ok(g.hands.filter(h => h.length).length <= 1);
        assert.deepStrictEqual(f.place.slice().sort(), Array.from({ length: n }, (_, i) => i));
        assert.strictEqual(f.points[f.winner], n - 1);
        assert.strictEqual(f.points[f.loser], -(n - 1));
        if (g.hands.some(h => h.length)) assert.ok(g.hands[f.loser].length > 0);
      }
    }
  }
  assert.ok(most < 2000, `longest game took ${most} moves`);
  assert.ok(longestLog < 1500, `longest log had ${longestLog} lines`);
});

test("bots: hard remembers who is out of a suit and leads it while the stock is deep", () => {
  // B had to dig for a heart, so B holds none: with a deep stock, hearts make B dig again
  const g = game([["Kh", "3h", "4h", "9s", "8s", "7s", "6s"], ["As", "2s", "3s"]], { stock: ["2c", "3c", "4c", "5c", "6c", "7c", "8c", "9c", "2d", "3d", "5h", "4d", "5d"] });
  C.play(g, 0, "Kh");
  C.draw(g, 1); C.draw(g, 1); C.draw(g, 1);
  assert.strictEqual(g.turn, 0);
  const mem = remember(g);
  assert.ok(mem.out[1].h);
  assert.ok(mem.gone.has("Kh") && mem.gone.has("5h"));
  for (let i = 0; i < 20; i++) assert.strictEqual(cangkulMove(g, 0, "hard").card[1], "h");
  // picked-up cards are remembered too
  const t = game([["5h", "2s", "3s"], ["4s", "6s"]], { emptyStock: "take" });
  C.play(t, 0, "5h"); C.giveUp(t, 1);
  assert.ok(remember(t).known[1].has("5h"));
  assert.ok(!remember(t).out[1].h);
});

test("bots: forced moves are forced, and the last player wins with the cheapest card that does", () => {
  let g = game([["Kh", "2s"], ["3s", "As"]], { stock: ["9d"] });
  C.play(g, 0, "Kh");
  for (const skill of ["easy", "normal", "hard"]) assert.deepStrictEqual(cangkulMove(g, 1, skill), { type: "draw" });
  C.draw(g, 1);
  for (const skill of ["easy", "normal", "hard"]) assert.deepStrictEqual(cangkulMove(g, 1, skill), { type: "giveup" });
  assert.strictEqual(cangkulMove(g, 0, "hard"), null);                  // not their turn
  g = game([["9h", "2s"], ["3h", "Jh", "Ah", "As"]], { stock: ["9d"] });
  C.play(g, 0, "9h");
  assert.deepStrictEqual(cangkulMove(g, 1, "hard"), { type: "play", card: "Jh" });
  // a hint works from a player's own view: other hands are only counts
  const v = C.viewFor(g, 1);
  const pseudo = { ...v, hands: v.counts.map((c, i) => i === 1 ? v.hand : Array(c).fill("x")), stock: Array(v.stock).fill("x"), finished: null };
  assert.deepStrictEqual(cangkulMove(pseudo, 1, "hard"), { type: "play", card: "Jh" });
});

// ---------- rooms ----------
const R = await import("./supabase/functions/_shared/cangkul-room.js");
let clock = 1_000_000;
const ctx = (playerId, extra = {}) => ({ now: clock, playerId, shuffledDeck: shuffled, ...extra });
const settingsC = { pointValue: 100, actSeconds: 30, skill: "normal", seats: 3 };
const idAt = (s, seat) => Object.keys(s.players).find(id => !s.players[id].left && s.players[id].seat === seat);
// keep ticking (moving the clock) until it's a person's turn or the game ends
function runBots(s) {
  for (let i = 0; i < 400 && s.g && !s.g.finished && s.seats[s.g.turn].bot; i++) { clock += 2000; R.applyAction(s, { type: "tick" }, ctx("h")); }
}
// one move for the person whose turn it is, sent the way a browser would
function personMove(s) {
  const seat = s.g.turn, m = cangkulMove(s.g, seat, "normal");
  R.applyAction(s, m.type === "play" ? { type: "play", card: m.card } : { type: m.type }, ctx(idAt(s, seat)));
}
function playGame(s) {
  for (let i = 0; i < 3000 && s.g && !s.g.finished; i++) { runBots(s); if (!s.g || s.g.finished) break; personMove(s); }
}

test("cangkul rooms: settings are checked and defaulted", () => {
  assert.deepStrictEqual(R.validateSettings({ pointValue: 100, actSeconds: 30 }), { pointValue: 100, actSeconds: 30, seats: 4, bots: false, skill: "normal", mode: "winner", handSize: 7, emptyStock: "take" });
  assert.deepStrictEqual(R.validateSettings({ pointValue: 50, actSeconds: 60, seats: 2, bots: true, skill: "hard", mode: "loser", handSize: 5, emptyStock: "pass" }), { pointValue: 50, actSeconds: 60, seats: 2, bots: true, skill: "hard", mode: "loser", handSize: 5, emptyStock: "pass" });
  assert.throws(() => R.validateSettings({ pointValue: 0, actSeconds: 30 }), R.RoomError === undefined ? Error : /dollars/);
  assert.throws(() => R.validateSettings({ pointValue: 100, actSeconds: 45 }), /time/);
  assert.throws(() => R.validateSettings({ pointValue: 100, actSeconds: 30, seats: 5 }), /seats/);
  assert.throws(() => R.validateSettings({ pointValue: 100, actSeconds: 30, seats: 1 }), /seats/);
});

test("cangkul rooms: create, join, start with at least 2 people, play to the end, the winner leads the next game", () => {
  const s = R.newRoom({ code: "CKL234", settings: settingsC, host: { id: "h", name: "Host", tokenHash: "th", hostKeyHash: "key" }, now: clock });
  assert.strictEqual(s.game, "cangkul");
  assert.strictEqual(R.roomStatus(s), "waiting");
  assert.strictEqual(s.seats.length, 3);
  assert.throws(() => R.applyAction(s, { type: "start" }, ctx("h")), /at least 2/);   // no bots in this room
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
  assert.throws(() => R.applyAction(s, { type: "start" }, ctx("a")), /host/);
  R.applyAction(s, { type: "start" }, ctx("h"));
  assert.strictEqual(R.roomStatus(s), "playing");
  assert.strictEqual(s.seats.filter(Boolean).length, 2);            // the third seat stays empty
  assert.deepStrictEqual(s.g.in, [0, 1]);
  assert.strictEqual(s.g.stock.length, 38);
  // wrong moves are turned away with a friendly message
  const turn = s.g.turn, other = idAt(s, 1 - turn);
  assert.throws(() => R.applyAction(s, { type: "play", card: s.g.hands[1 - turn][0] }, ctx(other)), /not your turn/);
  assert.throws(() => R.applyAction(s, { type: "draw" }, ctx(idAt(s, turn))), /leading/);
  assert.throws(() => R.applyAction(s, { type: "play", card: "nope" }, ctx(idAt(s, turn))), /hold/);
  playGame(s);
  const f = s.g.finished;
  assert.ok(f);
  assert.strictEqual(sum(s.points), 0);
  assert.strictEqual(sum(s.money), 0);
  assert.deepStrictEqual(s.money, s.points);                        // no bots: every point is money
  assert.ok(s.nextGameAt > clock);
  clock += 10000; R.applyAction(s, { type: "tick" }, ctx("h"));     // the next game is dealt
  assert.strictEqual(s.g.no, 2);
  assert.strictEqual(s.g.turn, f.winner);
  // someone who sits down mid-game is dealt in from the next game
  R.applyAction(s, { type: "join", name: "Budi" }, ctx("b", { tokenHash: "tb" }));
  assert.deepStrictEqual(s.g.in, [0, 1]);
  assert.deepStrictEqual(R.personalState(s, "b").view.hand, []);
  assert.throws(() => R.applyAction(s, { type: "join", name: "Cici" }, ctx("c", { tokenHash: "tc" })), /full/);
  playGame(s);
  clock += 10000; R.applyAction(s, { type: "tick" }, ctx("h"));
  assert.deepStrictEqual(s.g.in, [0, 1, 2]);
  assert.strictEqual(s.g.stock.length, 31);
});

test("cangkul rooms: the clock plays for a person who runs out of time", () => {
  const s = R.newRoom({ code: "CKL234", settings: { ...settingsC, seats: 2 }, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
  R.applyAction(s, { type: "start" }, ctx("h"));
  assert.strictEqual(s.deadline, clock + 30000);
  const step = s.g.step;
  clock += 5000; R.applyAction(s, { type: "tick" }, ctx("h"));
  assert.strictEqual(s.g.step, step);                               // not yet
  clock += 26000; R.applyAction(s, { type: "tick" }, ctx("h"));
  assert.ok(s.g.step > step);
  assert.strictEqual(s.deadline, clock + 30000);                    // the next player's clock starts
});

test("cangkul rooms: the ledger after a session, and the room stays for the next one", () => {
  const s = R.newRoom({ code: "CKL234", settings: settingsC, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
  R.applyAction(s, { type: "join", name: "Budi" }, ctx("b", { tokenHash: "tb" }));
  R.applyAction(s, { type: "start" }, ctx("h"));
  for (let games = 0; games < 3; games++) {
    playGame(s);
    assert.ok(s.g.finished);
    clock += 10000; R.applyAction(s, { type: "tick" }, ctx("h"));
  }
  assert.strictEqual(s.games, 3);
  const pts = s.points.slice();
  assert.strictEqual(sum(pts), 0);
  R.applyAction(s, { type: "endSession" }, ctx("h"));               // takes effect after the game in play
  assert.ok(s.ending && s.started);
  playGame(s);
  R.applyAction(s, { type: "tick" }, ctx("h"));
  assert.ok(!s.started && !s.closed);
  assert.strictEqual(s.sessions.length, 1);
  assert.strictEqual(s.sessions[0].games, 4);
  assert.deepStrictEqual(s.sessions[0].rows.map(r => r.name).sort(), ["Ana", "Budi", "Host"]);
  const pub = R.publicState(s);
  assert.strictEqual(pub.ledger.length, 3);
  assert.strictEqual(sum(pub.ledger.map(r => r.net)), 0);
  assert.ok(pub.ledger.some(r => r.net !== 0));
  assert.ok(pub.ledger.every(r => r.net % 100 === 0));              // whole points at $1 a point
  assert.ok(pub.lastSummary.payments.length > 0);
  assert.deepStrictEqual(s.points, [0, 0, 0]);
  R.applyAction(s, { type: "start" }, ctx("h"));                    // the next session in the same room
  assert.strictEqual(s.sessionNo, 2);
  assert.ok(s.g && !s.g.finished);
  R.applyAction(s, { type: "markPaid" }, ctx("h"));
  assert.strictEqual(R.publicState(s).ledger.length, 0);
  R.applyAction(s, { type: "close" }, ctx("h"));
  playGame(s);
  R.applyAction(s, { type: "tick" }, ctx("h"));
  assert.ok(s.closed);
  assert.strictEqual(R.roomStatus(s), "closed");
  assert.ok(R.personalState(s, "h").summary.rows.some(r => r.me));
  assert.throws(() => R.applyAction(s, { type: "chat", text: "hi" }, ctx("h")), /closed/);
});

test("cangkul rooms: bots fill the empty seats when the host asks, and their points aren't money", () => {
  for (const mode of ["winner", "loser"]) {
    const s = R.newRoom({ code: "CKL234", settings: { ...settingsC, seats: 4, bots: true, skill: "hard", mode }, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
    R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
    R.applyAction(s, { type: "start" }, ctx("h"));
    assert.strictEqual(s.seats.filter(x => x.bot).length, 2);
    assert.strictEqual(new Set(s.seats.map(x => x.name)).size, 4);  // every bot gets its own name
    for (let games = 0; games < 4; games++) {
      playGame(s);
      assert.ok(s.g.finished);
      clock += 10000; R.applyAction(s, { type: "tick" }, ctx("h"));
    }
    assert.strictEqual(sum(s.points), 0);
    const people = [s.players.h.seat, s.players.a.seat];
    assert.strictEqual(sum(people.map(i => s.money[i])), 0);        // people's money balances by itself
    s.seats.forEach((x, i) => { if (x.bot) assert.strictEqual(s.money[i], 0); });
    // a late friend takes over a bot's seat and its cards
    R.applyAction(s, { type: "join", name: "Budi" }, ctx("b", { tokenHash: "tb" }));
    assert.strictEqual(s.seats.filter(x => x.bot).length, 1);
    assert.strictEqual(R.personalState(s, "b").view.hand.length, s.g.hands[s.players.b.seat].length);
    assert.strictEqual(s.points[s.players.b.seat], 0);
  }
});

test("cangkul rooms: leaving mid-game hands your cards to a bot until the game ends; the host link reconnects the host", () => {
  const s = R.newRoom({ code: "CKL234", settings: settingsC, host: { id: "h", name: "Host", tokenHash: "th", hostKeyHash: "key" }, now: clock });
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
  R.applyAction(s, { type: "join", name: "Budi" }, ctx("b", { tokenHash: "tb" }));
  R.applyAction(s, { type: "start" }, ctx("h"));
  const seatA = s.players.a.seat;
  R.applyAction(s, { type: "leave" }, ctx("a"));
  assert.ok(s.seats[seatA].bot);                                    // a bot plays the game out
  assert.strictEqual(s.departed[0].name, "Ana");
  assert.ok(R.personalState(s, "a").left);
  playGame(s);
  assert.ok(s.g.finished);
  clock += 10000; R.applyAction(s, { type: "tick" }, ctx("h"));
  assert.strictEqual(s.seats[seatA], null);                         // no bots in this room: the seat is free again
  assert.deepStrictEqual(s.g.in.length, 2);
  // down to one person: the session ends by itself and the room waits
  R.applyAction(s, { type: "leave" }, ctx("b"));
  playGame(s);
  clock += 10000; R.applyAction(s, { type: "tick" }, ctx("h"));
  assert.ok(!s.started);
  assert.strictEqual(s.seats.filter(Boolean).length, 1);
  assert.strictEqual(s.sessions.length, 1);
  assert.throws(() => R.claimHost(s, { hostKeyHash: "nope", id: "x", tokenHash: "tx" }), /host link/);
  assert.strictEqual(R.claimHost(s, { hostKeyHash: "key", id: "x", tokenHash: "t2" }), "h");
  assert.strictEqual(R.findPlayerByTokenHash(s, "t2"), "h");
  assert.strictEqual(R.findPlayerByTokenHash(s, "nobody"), null);
  R.applyAction(s, { type: "chat", text: "gg" }, ctx("h"));
  assert.strictEqual(R.publicState(s).chat[0].text, "gg");
});

test("cangkul rooms: nobody is sent another player's cards or the order of the stock", () => {
  const s = R.newRoom({ code: "CKL234", settings: { ...settingsC, seats: 4, bots: true }, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
  R.applyAction(s, { type: "start" }, ctx("h"));
  const check = () => {
    const g = s.g;
    // cards everyone has seen: played, or picked up off the table
    const seen = new Set(g.log.flatMap(e => e.type === "play" ? [e.card] : e.type === "take" ? e.cards : []));
    for (const id of ["h", "a", null]) {
      const st = id ? R.personalState(s, id) : R.publicState(s), seat = id ? s.players[id].seat : -1;
      assert.strictEqual(typeof st.view.stock, "number");
      assert.ok(!("hands" in st.view) && !("g" in st) && !("players" in st));
      if (id) assert.deepStrictEqual(st.view.hand, g.hands[seat]); else assert.strictEqual(st.view.hand, null);
      const text = JSON.stringify(st);
      assert.ok(!text.includes("tokenHash") && !text.includes('"th"') && !text.includes('"ta"'));
      const secret = [...g.stock, ...g.hands.flatMap((h, i) => i === seat ? [] : h)].filter(c => !seen.has(c));
      for (const c of secret) assert.ok(!text.includes(`"${c}"`), `${id || "public"} was sent ${c}`);
    }
  };
  check();
  for (let i = 0; i < 400 && !s.g.finished; i++) {
    runBots(s);
    if (s.g.finished) break;
    personMove(s);
    if (!s.g.finished) check();
  }
  assert.ok(s.g.finished);
  assert.ok(R.personalState(s, "a").view.finished.left.length === 4);   // hands are shown once the game is over
});
