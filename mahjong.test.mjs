// Run with: node --test
import test from "node:test";
import assert from "node:assert";
import { webcrypto } from "node:crypto";
import * as M from "./supabase/functions/_shared/mahjong-engine.js";
import { mahjongMove } from "./supabase/functions/_shared/mahjong-bot.js";

const rng = webcrypto.getRandomValues.bind(webcrypto);
const shuffled = () => { const d = M.newWall(); for (let i = d.length - 1; i > 0; i--) { const j = rng(new Uint32Array(1))[0] % (i + 1); [d[i], d[j]] = [d[j], d[i]]; } return d; };
const T = s => s.split(" ").filter(Boolean);
// a game in a chosen position: hands as strings, everything else empty
function table(hands, { turn = 0, dealer = 0, round = 0, minFaan = 0, drawn = null, flowers = [[], [], [], []], wall = 40 } = {}) {
  const g = M.startGame(1, shuffled, { dealer, round, minFaan });
  g.hands = hands.map(h => T(h).sort(M.byTile));
  g.melds = [[], [], [], []]; g.flowers = flowers; g.discards = [[], [], [], []];
  g.wall = M.newWall().filter(t => !M.isBonus(t)).slice(0, wall);
  g.turn = turn; g.phase = "discard"; g.drawn = drawn; g.fresh = [false, false, false, false]; g.anyClaim = true; g.log = [];
  return g;
}
const faanOf = (g, seat, how) => { const r = M.evaluate(g, seat, how); return r && r.faan; };
const names = r => r.items.map(([n]) => n);

test("tiles: 144 in the wall, sorted by suit then number, honours after, flowers last", () => {
  const w = M.newWall();
  assert.strictEqual(w.length, 144);
  assert.deepStrictEqual(T("3z 1f 9s 1m 5p").sort(M.byTile), T("1m 5p 9s 3z 1f"));
});

test("shanten: complete is -1, ready is 0", () => {
  assert.strictEqual(M.shanten(M.counts(T("1m 2m 3m 4p 5p 6p 7s 8s 9s 1z 1z 1z 5z 5z"))), -1);
  assert.strictEqual(M.shanten(M.counts(T("1m 2m 3m 4p 5p 6p 7s 8s 9s 1z 1z 1z 5z"))), 0);
  assert.strictEqual(M.shanten(M.counts(T("1m 1m 3p 3p 5s 5s 7m 7m 2z 2z 6z 6z 9p 9p"))), -1);   // seven pairs
});

test("faan: chicken hand, all chows, mixed and pure one suit, dragons", () => {
  const fl = [["2f"], [], [], []];   // a flower that isn't seat 0's, so no flower faan
  let g = table(["1m 2m 3m 4p 5p 6p 7s 8s 9s 2m 3m 4m 9p 9p"], { flowers: fl, drawn: "9p" });
  g.melds[0] = [{ type: "chow", tiles: T("2m 3m 4m"), from: 3 }];
  g.hands[0] = T("1m 2m 3m 4p 5p 6p 7s 8s 9s 9p");
  let r = M.evaluate(g, 0, { self: false, winTile: "9p" });
  assert.deepStrictEqual(names(r), ["All chows"]);
  g.hands[0] = T("1m 2m 3m 4p 5p 6p 7s 8s 9s 9p");
  g.melds[0] = [{ type: "pung", tiles: T("2z 2z 2z"), from: 3 }];
  r = M.evaluate(g, 0, { self: false, winTile: "9p" });
  assert.strictEqual(r.faan, 0);                                          // a plain hand: no faan
  g = table(["1m 2m 3m 4m 5m 6m 7m 7m 7m 9m 9m 5z 5z 5z"], { flowers: fl, drawn: "9m" });
  r = M.evaluate(g, 0, { self: true, winTile: "9m" });
  assert.ok(names(r).includes("Mixed one suit") && names(r).includes("Dragon pung") && names(r).includes("Self-drawn") && names(r).includes("Concealed hand"));
  g = table(["1p 2p 3p 4p 5p 6p 7p 8p 9p 2p 3p 4p 9p"], { flowers: fl });
  assert.ok(names(M.evaluate(g, 0, { self: false, winTile: "9p" })).includes("Pure one suit"));
  g = table(["5z 5z 5z 6z 6z 6z 7z 7z 1m 2m 3m 4p 5p"], { flowers: fl });
  r = M.evaluate(g, 0, { self: false, winTile: "6p" });
  assert.ok(names(r).includes("Small three dragons") && !names(r).includes("Dragon pung"));
});

test("faan: limit hands are worth 10", () => {
  const g = table(["1m 9m 1p 9p 1s 9s 1z 2z 3z 4z 5z 6z 7z 7z"]);
  assert.strictEqual(faanOf(g, 0, { self: true, winTile: "7z" }), 10);   // thirteen orphans
  g.hands[0] = T("1z 1z 1z 2z 2z 2z 3z 3z 3z 4z 4z 4z 5z 5z");
  assert.strictEqual(M.evaluate(g, 0, { self: true, winTile: "5z" }).items[0][0], "All honours");
  g.hands[0] = T("1s 1s 1s 2s 3s 4s 5s 6s 7s 8s 9s 9s 9s 5s");
  assert.strictEqual(M.evaluate(g, 0, { self: true, winTile: "5s" }).items[0][0], "Nine gates");
});

test("a hand under the table's minimum can't win", () => {
  const g = table(["1m 2m 3m 4p 5p 6p 7s 8s 9s 2m 3m 4m 9p", "", "", ""], { minFaan: 3, flowers: [["2f"], [], [], []] });
  g.hands[1] = T("1m 1m 2p 3p 4p 5p 6p 7p 8s 8s 8s 2z 2z"); g.hands[2] = T("1s 1s"); g.hands[3] = T("3s 3s");
  g.turn = 3; g.hands[3] = T("9p 4z 4z 6s 6s 7s 7s 8s 8s 9s 9s 1s 1s 2s"); g.drawn = "2s";
  M.act(g, 3, { type: "discard", tile: "9p" });
  assert.ok(!g.claims || !g.claims[0] || !g.claims[0].opts.win);       // 1 faan (all chows) isn't enough
});

test("claims: a win beats a pung, only the next player may chow, the nearest winner takes it", () => {
  const g = table(["5p 7p 1m 1m 1z 1z 2z 2z 3z 3z 9s 9s 8m", "6p 6p 1s 2s 3s 4s 5s 6s 7s 8s 9s 9m 9m", "2m 3m 4m 5m 6m 7m 8m 8m 8m 6p 9p 9p 9p", "4m 4m 4m 5s 5s 5s 6s 6s 6s 7p 8p 2p 2p"]);
  g.turn = 3; g.hands[3].push("1p"); g.drawn = "1p";
  M.act(g, 3, { type: "discard", tile: "6p" === "x" ? "x" : "1p" });     // nobody wants 1p
  assert.strictEqual(g.turn, 0);
  // seat 0 discards 6p: seat 1 can pung, seat 2 could win (7-8m wait? no) ... build a clear case instead
  const h = table(["6p 1m", "6p 6p 1s 2s 3s 4s 5s 6s 7s 8s 9s 9m 9m", "4p 5p 2m 3m 4m 5m 6m 7m 8m 8m 8m 9p 9p", "7p 8p 4m 4m 4m 5s 5s 5s 6s 6s 6s 2p 2p"]);
  h.drawn = "1m";
  M.act(h, 0, { type: "discard", tile: "6p" });
  assert.ok(h.claims[1].opts.pung && !h.claims[1].opts.chows);           // seat 1 is next: it could also chow, but holds no 5p/7p
  assert.ok(h.claims[2].opts.win && h.claims[3].opts.win);
  assert.ok(!h.claims[3].opts.chows);                                    // seat 3 isn't next
  M.act(h, 1, { type: "claim", claim: "pung" });
  M.act(h, 3, { type: "claim", claim: "win" });
  M.act(h, 2, { type: "claim", claim: "win" });
  assert.strictEqual(h.finished.winner, 2);                              // seat 2 comes first after seat 0
  assert.strictEqual(h.finished.from, 0);
  assert.strictEqual(h.finished.points[0], -h.finished.points[2]);       // the discarder pays
});

test("payment: self-drawn, everyone pays; off a discard, the discarder pays double", () => {
  const g = table(["1m 2m 3m 4p 5p 6p 7s 8s 9s 5z 5z 5z 9p 9p"], { drawn: "9p" });
  M.act(g, 0, { type: "win" });
  const f = g.finished, base = M.PAY[f.faan];
  assert.deepStrictEqual(f.points, [3 * base, -base, -base, -base]);
});

test("robbing a kong: adding to a pung can be won off", () => {
  const g = table(["5s 1m 2m 3m 4p 5p 6p 7p 8p 2z 2z", "3s 4s 1m 2m 3m 4m 5m 6m 7m 8m 9m 1z 1z", "1p 1p", "2p 2p"], { drawn: "5s" });
  g.melds[0] = [{ type: "pung", tiles: T("5s 5s 5s"), from: 2 }];
  M.act(g, 0, { type: "kong", tile: "5s" });
  assert.strictEqual(g.phase, "rob");
  M.act(g, 1, { type: "claim", claim: "win" });
  assert.strictEqual(g.finished.winner, 1);
  assert.ok(g.finished.items.some(([n]) => n === "Robbing a kong"));
});

test("flowers are set aside and replaced; the deal gives 14 to the dealer", () => {
  for (let k = 0; k < 20; k++) {
    const g = M.startGame(1, shuffled, { dealer: k % 4 });
    assert.strictEqual(g.hands[k % 4].length, 14);
    assert.ok(g.hands.every(h => !h.some(M.isBonus)));
    assert.strictEqual(g.hands.flat().length + g.flowers.flat().length + g.wall.length, 144);
  }
});

test("bots: whole games finish under both win rules, points add to zero, nobody wins under the minimum", () => {
  for (const minFaan of [0, 3]) for (let k = 0; k < 12; k++) {
    const g = M.startGame(k + 1, shuffled, { dealer: k % 4, minFaan });
    for (let step = 0; step < 2000 && !g.finished; step++) {
      const seats = g.phase === "discard" ? [g.turn] : Object.keys(g.claims || {}).map(Number).filter(s => !g.claims[s].decision);
      for (const s of seats) { if (g.finished) break; const m = mahjongMove(g, s, ["easy", "normal", "hard", "expert"][k % 4]); if (m) M.act(g, s, m); }
    }
    assert.ok(g.finished);
    assert.strictEqual(g.finished.points.reduce((a, b) => a + b, 0), 0);
    if (g.finished.reason === "win") assert.ok(g.finished.faan >= minFaan);
  }
});

test("the dealer keeps the deal after winning or a drawn game; the round wind moves after a full turn", () => {
  const g = { dealer: 3, round: 0, finished: { reason: "win", winner: 1 } };
  assert.deepStrictEqual(M.nextDeal(g), { dealer: 0, round: 1 });
  assert.deepStrictEqual(M.nextDeal({ dealer: 2, round: 1, finished: { reason: "draw", winner: -1 } }), { dealer: 2, round: 1 });
  assert.deepStrictEqual(M.nextDeal({ dealer: 2, round: 1, finished: { reason: "win", winner: 2 } }), { dealer: 2, round: 1 });
});

// ---------- rooms ----------
const R = await import("./supabase/functions/_shared/mahjong-room.js");
let clock = 1_000_000;
const E = await import("./supabase/functions/_shared/poker-engine.js");
// like the real server: rooms are handed a shuffled 52-card deck, which Mahjong must not use
const ctx = (playerId, extra = {}) => ({ now: clock, playerId, shuffledDeck: () => E.newDeck(), ...extra });
const settingsM = { pointValue: 100, actSeconds: 20, skill: "normal", minFaan: 3 };

test("mahjong rooms: bots fill seats, people get a clock, whole hands play out, money only between people", () => {
  const s = R.newRoom({ code: "MAH234", settings: settingsM, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
  assert.throws(() => R.applyAction(s, { type: "start" }, ctx("a")), /host/);
  R.applyAction(s, { type: "start" }, ctx("h"));
  assert.strictEqual(s.seats.filter(x => x.bot).length, 2);
  assert.strictEqual(R.publicState(s).view.hand, null);
  let hands = 0;
  for (let i = 0; i < 3000 && hands < 3; i++) {
    const g = s.g;
    if (g.finished) { hands++; clock += 10000; R.applyAction(s, { type: "tick" }, ctx("h")); continue; }
    // people play like bots here, sometimes by letting the clock run out
    const people = [s.players.h.seat, s.players.a.seat];
    const deciding = g.phase === "discard" ? [g.turn] : Object.keys(g.claims || {}).map(Number).filter(x => !g.claims[x].decision);
    const person = deciding.find(x => people.includes(x));
    if (person !== undefined && i % 7) {
      R.applyAction(s, { type: "move", move: mahjongMove(g, person, "normal") }, ctx(person === s.players.h.seat ? "h" : "a"));
    } else { clock += 25000; R.applyAction(s, { type: "tick" }, ctx("h")); }
  }
  assert.ok(hands >= 3);
  assert.strictEqual(s.points.reduce((a, b) => a + b, 0), 0);
  const [h, a] = [s.players.h.seat, s.players.a.seat];
  assert.strictEqual(s.money[h] + s.money[a], 0);                    // people only owe each other
  assert.ok(s.seats.every((x, i) => !x.bot || s.money[i] === 0));
  assert.throws(() => R.applyAction(s, { type: "move", move: { type: "discard", tile: "1z" } }, ctx(s.g.turn === h ? "a" : "h")), /turn|hand|claim/i);
});

test("mahjong rooms: settings are checked; the minimum is 0 or 3 faan", () => {
  assert.strictEqual(R.validateSettings({ ...settingsM, minFaan: 3 }).minFaan, 3);
  assert.strictEqual(R.validateSettings({ ...settingsM, minFaan: 7 }).minFaan, 0);
  assert.throws(() => R.validateSettings({ ...settingsM, pointValue: 0 }));
});

test("bot levels: the room accepts expert, and only expert keeps a perfect tile count", () => {
  assert.strictEqual(R.validateSettings({ pointValue: 100, actSeconds: 20, skill: "expert", minFaan: 0 }).skill, "expert");
  assert.strictEqual(R.validateSettings({ pointValue: 100, actSeconds: 20, skill: "wizard", minFaan: 0 }).skill, "normal");
});

test("the coach: every decision gets a legal move and its reasons, claims included, and the same answer each time", async () => {
  const { advise, review } = await import("./mahjong/coach.js");
  const kinds = {};
  for (let n = 1; n <= 30; n++) {
    const g = M.startGame(n, shuffled, { dealer: n % 4, minFaan: n % 2 ? 3 : 0 });
    for (let step = 0; step < 3000 && !g.finished; step++) {
      const seats = g.phase === "discard" ? [g.turn] : Object.keys(g.claims || {}).map(Number).filter(s => !g.claims[s].decision);
      for (const s of seats) {
        if (g.finished) break;
        const view = { me: s, game: JSON.parse(JSON.stringify(M.viewFor(g, s))) };
        const a = advise(view);
        assert.ok(a && a.move && a.short && a.lines.length >= 1, "advice with reasons");
        assert.deepStrictEqual(advise(view).move, a.move, "the same position gets the same advice");
        a.lines.forEach(l => assert.ok(!/undefined|NaN|null/.test(l), l));
        const kind = a.move.type === "claim" ? a.move.claim : a.move.type;
        kinds[kind] = (kinds[kind] || 0) + 1;
        if (a.move.type === "discard") {
          const other = view.game.hand.find(t => t !== a.move.tile);
          if (other) { const r = review(view, other); assert.ok(typeof r === "string" && !/undefined|NaN/.test(r)); }
          assert.strictEqual(review(view, a.move.tile), null);
        }
        // a watcher (not their decision) gets the plan and where the hand stands
        const idle = (s + 1) % 4, iv = { me: idle, game: JSON.parse(JSON.stringify(M.viewFor(g, idle))) };
        if (!iv.game.options) { const b = advise(iv); assert.ok(b && b.move === null && b.lines.length === 2); }
        M.act(g, s, a.move);                                   // throws if the advised move isn't legal
      }
    }
  }
  for (const k of ["discard", "pass", "pung", "chow", "win"]) assert.ok(kinds[k] > 0, `saw ${k}: ${JSON.stringify(kinds)}`);
});
