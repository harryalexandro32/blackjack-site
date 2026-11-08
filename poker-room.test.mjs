// Run with: node --test
import test from "node:test";
import assert from "node:assert";
import { webcrypto } from "node:crypto";
import * as E from "./supabase/functions/_shared/poker-engine.js";
import * as R from "./supabase/functions/_shared/poker-room.js";

const rng = webcrypto.getRandomValues.bind(webcrypto);
let clock = 1_000_000;
const ctx = (playerId, extra = {}) => ({ now: clock, playerId, shuffledDeck: () => E.shuffle(E.newDeck(), rng), ...extra });
const settings = { sb: 100, bb: 200, minBuyIn: 10000, maxSeats: 4, actSeconds: 30 };
const chipsTotal = s => s.table.seats.reduce((a, x) => a + (x ? x.stack : 0), 0) + E.potTotal(s.table.hand)
  + Object.values(s.players).filter(p => p.left).reduce((a, p) => a + p.cashOut, 0);
const boughtTotal = s => Object.values(s.players).reduce((a, p) => a + p.buyIn, 0);

function room() {
  const s = R.newRoom({ code: "ABC234", settings, host: { id: "h", name: "Host", buyIn: 20000, tokenHash: "th" }, now: clock });
  R.applyAction(s, { type: "join", name: "Ana", buyIn: 10000 }, ctx("a", { tokenHash: "ta" }));
  R.applyAction(s, { type: "join", name: "Bo", buyIn: 15000 }, ctx("b", { tokenHash: "tb" }));
  return s;
}
const seat = (s, id) => s.players[id].seat;
const idAt = (s, i) => s.table.seats[i].id;
const toActId = s => idAt(s, s.table.hand.toAct);

test("settings and buy-ins are checked", () => {
  assert.throws(() => R.validateSettings({ ...settings, sb: 300 }), /small blind/);
  assert.throws(() => R.validateSettings({ ...settings, minBuyIn: 100 }), /minimum buy-in/);
  assert.throws(() => R.validateSettings({ ...settings, maxSeats: 9 }), /2 to 8/);
  const s = room();
  assert.throws(() => R.applyAction(s, { type: "join", name: "Cy", buyIn: 9999 }, ctx("c")), /minimum buy-in/);
  R.applyAction(s, { type: "join", name: "ana", buyIn: 10000 }, ctx("c"));
  assert.strictEqual(s.players.c.name, "ana 2");                      // names stay unique
  assert.throws(() => R.applyAction(s, { type: "join", name: "Dee", buyIn: 10000 }, ctx("d")), /full/);
});

test("only the host starts; the first hand is dealt at once", () => {
  const s = room();
  assert.throws(() => R.applyAction(s, { type: "start" }, ctx("a")), /host/);
  R.applyAction(s, { type: "start" }, ctx("h"));
  assert.ok(E.handInProgress(s.table));
  assert.strictEqual(s.deadline, clock + 30000);
  const pub = JSON.stringify(R.publicState(s));
  for (const p of s.table.hand.players) if (p) assert.ok(!pub.includes(`"hole":["${p.hole[0]}"`), "public copy leaks hole cards");
  const mine = R.personalState(s, "a");
  assert.deepStrictEqual(mine.view.hand.players[seat(s, "a")].hole, s.table.hand.players[seat(s, "a")].hole);
  assert.strictEqual(mine.view.hand.players[seat(s, "b")].hole, null);
});

test("acting out of turn is refused; the clock auto-checks or folds, then sits a player out", () => {
  const s = room();
  R.applyAction(s, { type: "start" }, ctx("h"));
  const waiting = Object.keys(s.players).find(id => id !== toActId(s));
  assert.throws(() => R.applyAction(s, { type: "act", action: "call" }, ctx(waiting)), /not your turn/);
  // tick before the deadline does nothing
  const slow = toActId(s), before = s.table.hand.log.length;
  R.applyAction(s, { type: "tick" }, ctx("a"));
  assert.strictEqual(s.table.hand.log.length, before);
  clock += 31000;
  R.applyAction(s, { type: "tick" }, ctx("a"));
  assert.strictEqual(s.players[slow].timeouts, 1);
  assert.strictEqual(s.table.hand.log.at(-1).type, "fold");       // facing the big blind: fold
});

test("leaving mid-hand folds you when your turn comes and cashes you out after the hand", () => {
  const s = room();
  R.applyAction(s, { type: "start" }, ctx("h"));
  const leaver = toActId(s);
  R.applyAction(s, { type: "leave" }, ctx(leaver));
  // they were to act, so they fold straight away
  assert.strictEqual(s.table.hand.players[seat(s, leaver)].folded, true);
  // play the hand out
  while (E.handInProgress(s.table)) {
    const id = toActId(s), legal = E.legalActions(s.table, seat(s, id));
    R.applyAction(s, { type: "act", action: legal.check ? "check" : "call" }, ctx(id));
  }
  assert.strictEqual(s.players[leaver].left, true);
  assert.ok(s.players[leaver].cashOut >= 0);
  assert.strictEqual(chipsTotal(s), boughtTotal(s));
  const seen = R.personalState(s, leaver);
  assert.strictEqual(seen.left, true);
  assert.ok(seen.summary.partial);
});

test("busted players rebuy for at least the minimum, and only between hands", () => {
  const s = room();
  const a = seat(s, "a");
  s.table.seats[a].stack = 0;
  assert.throws(() => R.applyAction(s, { type: "rebuy", amount: 5000 }, ctx("a")), /minimum/);
  R.applyAction(s, { type: "rebuy", amount: 12000 }, ctx("a"));
  assert.strictEqual(s.players.a.buyIn, 22000);
  assert.throws(() => R.applyAction(s, { type: "rebuy", amount: 12000 }, ctx("a")), /out of chips/);
});

test("next hand deals after the pause; closing waits for the hand to finish, then settles everyone", () => {
  const s = room();
  R.applyAction(s, { type: "start" }, ctx("h"));
  for (let hands = 0; hands < 25; hands++) {
    while (E.handInProgress(s.table)) {
      const id = toActId(s), legal = E.legalActions(s.table, seat(s, id));
      const r = Math.random();
      const a = legal.raise && r < 0.3 ? { action: "raise", to: legal.raise.min } : r < 0.45 && !legal.check ? { action: "fold" } : { action: legal.check ? "check" : "call" };
      R.applyAction(s, { type: "act", ...a }, ctx(id));
      assert.strictEqual(chipsTotal(s), boughtTotal(s));
    }
    // busted players buy back in so the game goes on
    for (const [id, p] of Object.entries(s.players)) if (!p.left && s.table.seats[p.seat].stack === 0) R.applyAction(s, { type: "rebuy", amount: 10000 }, ctx(id));
    assert.ok(s.nextHandAt > clock);
    R.applyAction(s, { type: "tick" }, ctx("a"));
    assert.ok(!E.handInProgress(s.table), "dealt before the pause was over");
    clock = s.nextHandAt;
    R.applyAction(s, { type: "tick" }, ctx("a"));
    assert.ok(E.handInProgress(s.table), "next hand was not dealt");
  }
  R.applyAction(s, { type: "close" }, ctx("h"));
  assert.ok(!s.closed && s.closing);                                  // hand still running
  while (E.handInProgress(s.table)) {
    const id = toActId(s), legal = E.legalActions(s.table, seat(s, id));
    R.applyAction(s, { type: "act", action: legal.check ? "check" : "fold" }, ctx(id));
  }
  assert.ok(s.closed);
  const sum = s.summary;
  assert.strictEqual(sum.rows.reduce((a, r) => a + r.net, 0), 0);
  assert.strictEqual(sum.rows.reduce((a, r) => a + r.cashOut, 0), boughtTotal(s));
  const paid = {};
  for (const p of sum.payments) { paid[p.from] = (paid[p.from] || 0) - p.amount; paid[p.to] = (paid[p.to] || 0) + p.amount; }
  for (const r of sum.rows) assert.strictEqual(paid[r.name] || 0, r.net);
  assert.throws(() => R.applyAction(s, { type: "act", action: "fold" }, ctx("a")), /closed/);
});

test("players set their own avatar and show/muck choice; junk avatars are dropped", () => {
  const s = R.newRoom({ code: "ABC234", settings, host: { id: "h", name: "Host", buyIn: 20000, tokenHash: "th", avatar: "1.0.3", show: true }, now: clock });
  assert.strictEqual(s.table.seats[0].avatar, "1.0.3");
  assert.strictEqual(s.table.seats[0].show, true);
  R.applyAction(s, { type: "join", name: "Ana", buyIn: 10000, avatar: "<script>" }, ctx("a", { tokenHash: "ta" }));
  assert.strictEqual(s.table.seats[1].avatar, "");
  R.applyAction(s, { type: "prefs", avatar: "4.1", show: true }, ctx("a"));
  assert.strictEqual(R.publicState(s).view.seats[1].avatar, "4.1");
  assert.strictEqual(R.publicState(s).view.seats[1].show, true);
  assert.throws(() => R.applyAction(s, { type: "prefs", show: true }, ctx("nobody")), /not seated/);
});

test("the host decides which odds helpers the table allows", () => {
  assert.deepStrictEqual(R.validateSettings(settings).odds, { win: true, strong: true, cats: true });   // on unless turned off
  assert.deepStrictEqual(R.validateSettings({ ...settings, odds: { win: false, strong: false } }).odds, { win: false, strong: false, cats: true });
  const s = R.newRoom({ code: "ABC234", settings: { ...settings, odds: { win: true, cats: false } }, host: { id: "h", name: "Host", buyIn: 20000, tokenHash: "th" }, now: clock });
  assert.deepStrictEqual(R.publicState(s).settings.odds, { win: true, strong: true, cats: false });
});

test("the host sets the raise step; it defaults to the big blind and the server enforces it", () => {
  assert.strictEqual(R.validateSettings(settings).step, 200);
  assert.throws(() => R.validateSettings({ ...settings, step: 0 }), /raise step/);
  const s = R.newRoom({ code: "ABC234", settings: { ...settings, step: 1000 }, host: { id: "h", name: "Host", buyIn: 20000, tokenHash: "th" }, now: clock });
  R.applyAction(s, { type: "join", name: "Ana", buyIn: 20000 }, ctx("a", { tokenHash: "ta" }));
  R.applyAction(s, { type: "start" }, ctx("h"));
  const id = toActId(s);
  assert.throws(() => R.applyAction(s, { type: "act", action: "raise", to: 2100 }, ctx(id)), /steps of \$10/);
  R.applyAction(s, { type: "act", action: "raise", to: 2000 }, ctx(id));
  assert.strictEqual(s.table.hand.currentBet, 2000);
});

test("chat and reactions: anyone at the table, cleaned, limited, and kept short", () => {
  const s = room();
  R.applyAction(s, { type: "chat", text: "  nice   hand\u0007 " }, ctx("a"));
  R.applyAction(s, { type: "react", emoji: "🔥" }, ctx("b"));
  const chat = R.publicState(s).chat;
  assert.deepStrictEqual(chat.map(c => [c.name, c.kind, c.text || c.emoji]), [["Ana", "msg", "nice hand"], ["Bo", "react", "🔥"]]);
  assert.strictEqual(chat[0].seat, seat(s, "a"));
  assert.throws(() => R.applyAction(s, { type: "react", emoji: "💩" }, ctx("a")), /reactions/);
  assert.throws(() => R.applyAction(s, { type: "chat", text: "   " }, ctx("a")), /Type a message/);
  for (let i = 0; i < R.LIMITS.chatBurst; i++) R.applyAction(s, { type: "chat", text: "spam " + i }, ctx("h"));
  assert.throws(() => R.applyAction(s, { type: "chat", text: "one more" }, ctx("h")), /Slow down/);
  assert.throws(() => R.applyAction(s, { type: "chat", text: "hi" }, ctx("stranger")), /not at this table/);
});

test("pause: only the host; no new hands and no turn clock until resumed", () => {
  const s = room();
  R.applyAction(s, { type: "start" }, ctx("h"));
  assert.throws(() => R.applyAction(s, { type: "pause", on: true }, ctx("a")), /host/);
  R.applyAction(s, { type: "pause", on: true }, ctx("h"));
  assert.strictEqual(s.deadline, null);
  const no = s.table.hand.no;
  // the hand in progress can still be played out, but no new one is dealt
  while (E.handInProgress(s.table)) R.applyAction(s, { type: "act", action: "fold" }, ctx(toActId(s)));
  clock += 60000; R.applyAction(s, { type: "tick" }, ctx("a"));
  assert.strictEqual(s.table.hand.no, no);
  assert.strictEqual(s.nextHandAt, null);
  R.applyAction(s, { type: "pause", on: false }, ctx("h"));
  clock += LIMITS_resume(); R.applyAction(s, { type: "tick" }, ctx("a"));
  assert.strictEqual(s.table.hand.no, no + 1);
});
const LIMITS_resume = () => R.LIMITS.resumeMs + 1;

test("watchers see the table without cards, chat, sit down later, and stay out of the settle-up", () => {
  const s = room();
  R.applyAction(s, { type: "start" }, ctx("h"));
  R.applyAction(s, { type: "watch", name: "Cy" }, ctx("w", { tokenHash: "tw" }));
  const v = R.personalState(s, "w");
  assert.strictEqual(v.watching, true);
  assert.strictEqual(v.me, -1);
  assert.ok(v.view.hand.players.every(p => !p || p.hole === null));
  assert.deepStrictEqual(v.watchers, ["Cy"]);
  R.applyAction(s, { type: "chat", text: "go Ana" }, ctx("w"));
  assert.throws(() => R.applyAction(s, { type: "act", action: "fold" }, ctx("w")), /not seated/);
  assert.throws(() => R.applyAction(s, { type: "sit", buyIn: 100 }, ctx("w")), /minimum buy-in/);
  R.applyAction(s, { type: "sit", buyIn: 10000 }, ctx("w"));
  assert.strictEqual(s.players.w.name, "Cy");                          // keeps their name
  assert.ok(seat(s, "w") >= 0);
  R.applyAction(s, { type: "watch", name: "Dee" }, ctx("d", { tokenHash: "td" }));
  R.applyAction(s, { type: "close" }, ctx("h"));
  while (E.handInProgress(s.table)) R.applyAction(s, { type: "act", action: "fold" }, ctx(toActId(s)));
  assert.ok(s.closed);
  assert.deepStrictEqual(s.summary.rows.map(r => r.name).sort(), ["Ana", "Bo", "Cy", "Host"]);  // Dee only watched
});

test("run it twice over the network: vote, and no answer in time means once", () => {
  const settings2 = { ...settings, maxSeats: 2 };
  const mk = () => {
    const s = R.newRoom({ code: "ABC234", settings: settings2, host: { id: "h", name: "Host", buyIn: 20000, tokenHash: "th" }, now: clock });
    R.applyAction(s, { type: "join", name: "Ana", buyIn: 20000 }, ctx("a", { tokenHash: "ta" }));
    R.applyAction(s, { type: "start" }, ctx("h"));
    R.applyAction(s, { type: "act", action: "raise", to: 20000 }, ctx(toActId(s)));
    R.applyAction(s, { type: "act", action: "call" }, ctx(toActId(s)));
    return s;
  };
  assert.strictEqual(R.validateSettings(settings).runTwice, true);      // on unless the host turns it off
  let s = mk();
  assert.strictEqual(s.table.hand.ritPending, true);
  assert.strictEqual(s.deadline, clock + R.LIMITS.ritMs);
  R.applyAction(s, { type: "rit", yes: true }, ctx("h"));
  R.applyAction(s, { type: "rit", yes: true }, ctx("a"));
  assert.strictEqual(s.table.hand.runs.length, 2);
  assert.strictEqual(chipsTotal(s), boughtTotal(s));

  s = mk();
  R.applyAction(s, { type: "rit", yes: true }, ctx("h"));
  clock += R.LIMITS.ritMs; R.applyAction(s, { type: "tick" }, ctx("h"));
  assert.strictEqual(s.table.hand.ritTwice, false);
  assert.strictEqual(chipsTotal(s), boughtTotal(s));
});

test("ante and straddle settings reach the table", () => {
  assert.throws(() => R.validateSettings({ ...settings, ante: 500 }), /ante/);
  const s = R.newRoom({ code: "ABC234", settings: { ...settings, ante: 50, straddle: true }, host: { id: "h", name: "Host", buyIn: 20000, tokenHash: "th" }, now: clock });
  assert.strictEqual(s.table.ante, 50);
  assert.strictEqual(s.table.straddle, true);
  assert.strictEqual(R.publicState(s).view.ante, 50);
});
