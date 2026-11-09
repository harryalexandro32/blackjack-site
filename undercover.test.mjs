// Run with: node --test
import test from "node:test";
import assert from "node:assert";
import * as U from "./supabase/functions/_shared/undercover-engine.js";
import { PAIRS } from "./supabase/functions/_shared/undercover-words.js";

const words = { civ: { id: "Kopi", en: "Coffee" }, und: { id: "Teh", en: "Tea" } };
// seats 0 undercover, 1 white, 2-5 civilians (6 players), seat 2 speaks first
const fixed = () => U.startGame(1, 6, { words, roles: ["undercover", "white", "civilian", "civilian", "civilian", "civilian"], first: 2 });
const clueRound = g => { while (g.phase === "clue") U.clue(g, g.speaker, "", { spoken: true }); };

test("the word list: every pair has two different words in both languages", () => {
  assert.ok(PAIRS.length >= 150);
  for (const p of PAIRS) {
    assert.strictEqual(p.length, 4, p.join());
    assert.ok(p.every(w => typeof w === "string" && w.trim()), p.join());
    assert.notStrictEqual(U.norm(p[0]), U.norm(p[1]), p.join());
    assert.notStrictEqual(U.norm(p[2]), U.norm(p[3]), p.join());
  }
});

test("roles scale with the table; Mr. White only from 5 and never speaks first", () => {
  for (const [n, und] of [[4, 1], [6, 1], [7, 2], [9, 2], [10, 3], [12, 3]]) {
    const g = U.startGame(1, n, { words, mrWhite: true });
    assert.strictEqual(g.roles.filter(r => r === "undercover").length, und);
    assert.strictEqual(g.roles.filter(r => r === "white").length, n >= 5 ? 1 : 0);
    assert.notStrictEqual(g.roles[g.speaker], "white");
  }
  assert.strictEqual(U.startGame(1, 8, { words, mrWhite: false }).roles.filter(r => r === "white").length, 0);
  assert.throws(() => U.startGame(1, 3, { words }));
});

test("clues go round the table in turn; your word can't be in your clue, in either language", () => {
  const g = fixed();
  assert.throws(() => U.clue(g, 3, "hot"), /turn/);
  assert.throws(() => U.clue(g, 2, "iced coffee"), /word/);
  assert.throws(() => U.clue(g, 2, "kopi susu"), /word/);
  U.clue(g, 2, "morning drink");
  assert.strictEqual(g.speaker, 3);
  U.clue(g, 3, "", { spoken: true });
  U.skipClue(g);                                            // seat 4 ran out of time
  assert.ok(g.clues.find(c => c.seat === 4).missed);
  U.clue(g, 5, "black"); U.clue(g, 0, "with sugar"); U.clue(g, 1, "hot");
  assert.strictEqual(g.phase, "talk");
});

test("nobody is told whether they're the undercover; Mr. White knows; the out see everything", () => {
  const g = fixed();
  const v0 = U.viewFor(g, 0, "en"), v2 = U.viewFor(g, 2, "id"), v1 = U.viewFor(g, 1, "en");
  assert.strictEqual(v0.myWord, "Tea"); assert.strictEqual(v0.roles[0], null);
  assert.strictEqual(v2.myWord, "Kopi"); assert.strictEqual(v2.words, null);
  assert.strictEqual(v1.myWord, null); assert.ok(v1.iAmWhite);
  assert.ok(U.viewFor(g, -1).roles.every(r => r === null));
  clueRound(g); U.startVote(g);
  [1, 2, 3, 4, 5].forEach(s => U.vote(g, s, 0)); U.vote(g, 0, 2);
  U.resolveVote(g);
  assert.strictEqual(g.alive[0], false);
  const out = U.viewFor(g, 0, "en");
  assert.strictEqual(out.roles[2], "civilian"); assert.deepStrictEqual(out.words, { civ: "Coffee", und: "Tea" });
  assert.strictEqual(U.viewFor(g, 3).roles[0], "undercover");
});

test("a tie goes to a runoff between the tied; a second tie means nobody is out", () => {
  const g = fixed();
  clueRound(g); U.startVote(g);
  U.vote(g, 0, 2); U.vote(g, 1, 2); U.vote(g, 2, 3); U.vote(g, 3, 2); U.vote(g, 4, 3); U.vote(g, 5, 3);
  U.resolveVote(g);
  assert.deepStrictEqual(g.runoff.sort(), [2, 3]);
  assert.throws(() => U.vote(g, 0, 4), /runoff/);
  U.vote(g, 0, 2); U.vote(g, 1, 3); U.vote(g, 4, 2); U.vote(g, 5, 3);
  U.resolveVote(g);
  assert.strictEqual(g.phase, "clue"); assert.strictEqual(g.round, 2);
  assert.ok(g.alive.every(Boolean));
  assert.strictEqual(g.speaker, 3);                         // the next round starts one seat on
});

test("Mr. White voted out guesses: right wins alone, wrong plays on", () => {
  const g = fixed();
  clueRound(g); U.startVote(g);
  [0, 2, 3, 4, 5].forEach(s => U.vote(g, s, 1)); U.vote(g, 1, 0);
  U.resolveVote(g);
  assert.strictEqual(g.phase, "guess");
  U.guess(g, 1, "coffee");                                  // English counts too
  assert.deepStrictEqual(g.finished, { winner: "white", winners: [1] });
  const h = fixed();
  clueRound(h); U.startVote(h);
  [0, 2, 3, 4, 5].forEach(s => U.vote(h, s, 1)); U.resolveVote(h);
  U.guess(h, 1, "teh");
  assert.ok(!h.finished); assert.strictEqual(h.phase, "clue");
});

test("civilians win once the undercover and Mr. White are out; the infiltrators win at parity", () => {
  const g = fixed();
  clueRound(g); U.startVote(g); [0, 2, 3, 4, 5].forEach(s => U.vote(g, s, 1)); U.resolveVote(g); U.guess(g, 1, "susu");
  clueRound(g); U.startVote(g); [2, 3, 4, 5].forEach(s => U.vote(g, s, 0)); U.resolveVote(g);
  assert.strictEqual(g.finished.winner, "civilians");
  assert.deepStrictEqual(g.finished.winners, [2, 3, 4, 5]);
  // 4 players: one undercover; two civilians voted out leaves 1 v 1
  const h = U.startGame(1, 4, { words, roles: ["undercover", "civilian", "civilian", "civilian"], first: 1 });
  clueRound(h); U.startVote(h); [0, 2, 3].forEach(s => U.vote(h, s, 1)); U.resolveVote(h);
  clueRound(h); U.startVote(h); U.vote(h, 0, 2); U.vote(h, 3, 2); U.resolveVote(h);
  assert.deepStrictEqual(h.finished, { winner: "infiltrators", winners: [0] });
});

test("leaving: the speaker who leaves passes the turn; Mr. White who leaves mid-guess forfeits", () => {
  const g = fixed();
  U.leave(g, 2);
  assert.strictEqual(g.speaker, 3);
  const h = fixed();
  clueRound(h); U.startVote(h); [0, 2, 3, 4, 5].forEach(s => U.vote(h, s, 1)); U.resolveVote(h);
  U.leave(h, 1);
  assert.strictEqual(h.phase, "guess");                    // already out: leaving changes nothing here…
  U.guessTimeout(h);                                         // …the clock ends the guess
  assert.strictEqual(h.phase, "clue");
});

// ---------- rooms ----------
const R = await import("./supabase/functions/_shared/undercover-room.js");
let clock = 1_000_000;
const ctx = (playerId, extra = {}) => ({ now: clock, playerId, ...extra });

test("undercover rooms: custom pairs, per-player language, whole games on the clock, points", () => {
  const s = R.newRoom({ code: "SPYSPY", settings: {}, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  ["a", "b"].forEach(id => R.applyAction(s, { type: "join", name: id.toUpperCase() }, ctx(id, { tokenHash: "t" + id })));
  assert.throws(() => R.applyAction(s, { type: "start" }, ctx("h")), /at least 4/);
  R.applyAction(s, { type: "join", name: "C" }, ctx("c", { tokenHash: "tc" }));
  R.applyAction(s, { type: "join", name: "D" }, ctx("d", { tokenHash: "td" }));
  assert.throws(() => R.applyAction(s, { type: "pairs", text: "just one" }, ctx("h")), /pair/);
  assert.throws(() => R.applyAction(s, { type: "pairs", text: "Kopi / Teh" }, ctx("a")), /host/);
  R.applyAction(s, { type: "pairs", text: "Nasi padang / Nasi kapau\nKopi, Teh\n\nkopi | teh" }, ctx("h"));
  assert.strictEqual(R.personalState(s, "h").customPairs.length, 2);
  assert.strictEqual(R.personalState(s, "a").customPairs, null);
  R.applyAction(s, { type: "settings", settings: { words: "custom", talkSeconds: 0 } }, ctx("h"));
  R.applyAction(s, { type: "prefs", lang: "en" }, ctx("a"));
  R.applyAction(s, { type: "start" }, ctx("h"));
  const g = s.g;
  assert.ok(["Nasi padang", "Nasi kapau", "Kopi", "Teh"].includes(g.words.civ.id));
  // the public copy has no words and no roles of players still in
  const pub = R.publicState(s);
  assert.strictEqual(JSON.stringify(pub).includes(g.words.civ.id), false);
  assert.ok(pub.view.roles.every(r => r === null));
  // built-in words show in each player's language
  R.applyAction(s, { type: "close" }, ctx("h"));
  const t = R.newRoom({ code: "SPYTWO", settings: { mrWhite: true, clueSeconds: 20 }, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  const people = ["h", "a", "b", "c", "d", "e"];
  people.slice(1).forEach(id => R.applyAction(t, { type: "join", name: id.toUpperCase() }, ctx(id, { tokenHash: "t" + id })));
  R.applyAction(t, { type: "prefs", lang: "en" }, ctx("a"));
  R.applyAction(t, { type: "start" }, ctx("h"));
  const civ = t.inGame.findIndex((id, x) => t.g.roles[x] === "civilian" && id !== "a");
  const aSeat = t.inGame.indexOf("a");
  if (t.g.roles[aSeat] === "civilian") assert.strictEqual(R.personalState(t, "a").view.myWord, t.g.words.civ.en);
  assert.strictEqual(R.personalState(t, t.inGame[civ]).view.myWord, t.g.words.civ.id);
  let games = 0;
  for (let i = 0; i < 600 && games < 3; i++) {
    const gg = t.g;
    if (!gg || gg.finished) { games++; if (games < 3) R.applyAction(t, { type: "start" }, ctx("h")); continue; }
    if (gg.phase === "clue" && i % 2) { const id = t.inGame[gg.speaker]; R.applyAction(t, { type: "clue", text: "", spoken: true }, ctx(id)); continue; }
    if (gg.phase === "talk") people.forEach(id => { const x = t.inGame.indexOf(id); if (gg.alive[x] && !t.ready[id]) R.applyAction(t, { type: "ready" }, ctx(id)); });
    if (gg.phase === "vote") people.forEach(id => { const x = t.inGame.indexOf(id); const tg = U.voteTargets(gg, x); if (tg.length && gg.votes[x] === undefined) R.applyAction(t, { type: "vote", target: tg[Math.floor(Math.random() * tg.length)] }, ctx(id)); });
    if (gg.phase === "guess") { R.applyAction(t, { type: "guess", text: "nope" }, ctx(t.inGame[gg.guesser])); continue; }
    clock += 25000; R.applyAction(t, { type: "tick" }, ctx("h"));
  }
  assert.ok(games >= 3, "three games finished");
  const sc = R.personalState(t, "h").scores;
  assert.strictEqual(sc.length, 6);
  assert.ok(sc.every(x => x.games === 3) && sc.some(x => x.points > 0));
  // the out chat stays with the out
  R.applyAction(t, { type: "start" }, ctx("h"));
  assert.throws(() => R.applyAction(t, { type: "chat", text: "boo", channel: "grave" }, ctx("h")), /can't post/);
});
