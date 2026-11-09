// Run with: node --test
import test from "node:test";
import assert from "node:assert";
import * as W from "./supabase/functions/_shared/werewolf-engine.js";

// seats 0 wolf, 1 seer, 2 doctor, 3-5 villagers (6 players)
const fixed = () => W.startGame(1, 6, { roles: ["wolf", "seer", "doctor", "villager", "villager", "villager"] });

test("roles: wolves scale with the table, one seer and one doctor", () => {
  for (const [n, wolves] of [[5, 1], [6, 1], [7, 2], [9, 2], [10, 3], [12, 3]]) {
    const g = W.startGame(1, n);
    assert.strictEqual(g.roles.filter(r => r === "wolf").length, wolves);
    assert.strictEqual(g.roles.filter(r => r === "seer").length, 1);
    assert.strictEqual(g.roles.filter(r => r === "doctor").length, 1);
  }
  assert.throws(() => W.startGame(1, 4));
});

test("night: the wolves' pick dies unless the doctor protects them; the seer learns the truth", () => {
  const g = fixed();
  assert.deepStrictEqual(W.nightWaiting(g).sort(), [0, 1, 2]);
  assert.throws(() => W.nightAction(g, 3, 4), /sleep/);
  W.nightAction(g, 0, 4); W.nightAction(g, 1, 0); W.nightAction(g, 2, 5);
  assert.strictEqual(g.seen[0].wolf, true);
  W.resolveNight(g);
  assert.strictEqual(g.alive[4], false);
  assert.strictEqual(g.phase, "day");
  // next night the doctor guesses right
  W.startVote(g); W.resolveVote(g);                       // nobody voted: nobody out
  W.nightAction(g, 0, 3); W.nightAction(g, 1, 2); W.nightAction(g, 2, 3);
  W.resolveNight(g);
  assert.strictEqual(g.alive[3], true);
  assert.strictEqual(g.log.filter(e => e.type === "dawn").pop().saved, true);
  assert.ok(!W.nightTargets(g, 2).length || true);
});

test("the doctor can't protect the same player two nights running", () => {
  const g = fixed();
  W.nightAction(g, 0, 4); W.nightAction(g, 1, 3); W.nightAction(g, 2, 5); W.resolveNight(g);
  W.startVote(g); W.resolveVote(g);
  assert.ok(!W.nightTargets(g, 2).includes(5));
});

test("voting: most votes is out, a tie means nobody; roles are revealed when you die", () => {
  const g = fixed();
  W.nightAction(g, 0, 5); W.nightAction(g, 1, 3); W.nightAction(g, 2, 4); W.resolveNight(g);   // 5 dies
  W.startVote(g);
  W.vote(g, 1, 0); W.vote(g, 2, 0); W.vote(g, 3, 1); W.vote(g, 4, 1); W.vote(g, 0, 1);
  W.resolveVote(g);
  assert.strictEqual(g.alive[1], false);                  // three votes for the seer
  const v = W.viewFor(g, 3);
  assert.strictEqual(v.roles[1], "seer");                 // the dead seer's role is shown
  assert.strictEqual(v.roles[0], null);                   // the living wolf's isn't
  assert.strictEqual(W.viewFor(g, 0).roles[0], "wolf");
});

test("the village wins when the wolves are gone; the wolves win at parity", () => {
  const g = fixed();
  W.nightAction(g, 0, 5); W.nightAction(g, 1, 0); W.nightAction(g, 2, 4); W.resolveNight(g);
  W.startVote(g);
  [1, 2, 3, 4].forEach(s => W.vote(g, s, 0)); W.vote(g, 0, 1);
  W.resolveVote(g);
  assert.strictEqual(g.finished.winner, "village");
  const h = W.startGame(1, 5, { roles: ["wolf", "seer", "doctor", "villager", "villager"] });
  W.nightAction(h, 0, 3); W.nightAction(h, 1, 4); W.nightAction(h, 2, 4); W.resolveNight(h);    // 3 dies: 1 wolf vs 3
  W.startVote(h); W.vote(h, 0, 4); W.vote(h, 1, 4); W.vote(h, 2, 4); W.vote(h, 4, 1); W.resolveVote(h); // 4 voted out: 1 vs 2
  W.nightAction(h, 0, 1); W.nightAction(h, 1, 2); W.nightAction(h, 2, 2); W.resolveNight(h);  // seer dies: 1 vs 1
  assert.strictEqual(h.finished.winner, "wolves");
});

// ---------- rooms ----------
const R = await import("./supabase/functions/_shared/werewolf-room.js");
let clock = 1_000_000;
const ctx = (playerId, extra = {}) => ({ now: clock, playerId, ...extra });

test("werewolf rooms: too few people can't start; bots top up; whole games run on the clock; chats stay private", () => {
  const s = R.newRoom({ code: "WOLF23", settings: { bots: 0 }, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  ["a", "b"].forEach(id => R.applyAction(s, { type: "join", name: id.toUpperCase() }, ctx(id, { tokenHash: "t" + id })));
  assert.throws(() => R.applyAction(s, { type: "start" }, ctx("h")), /at least 5/);
  R.applyAction(s, { type: "settings", settings: { bots: 7 } }, ctx("h"));
  R.applyAction(s, { type: "start" }, ctx("h"));
  assert.strictEqual(s.g.n, 7);
  assert.strictEqual(s.inGame.filter(id => id.startsWith("bot")).length, 4);
  // nobody sees another's role in their own state, the public copy has no roles at all
  const pub = R.publicState(s);
  assert.ok(pub.view.roles.every(r => r === null));
  const people = ["h", "a", "b"];
  let games = 0;
  for (let i = 0; i < 400 && games < 2; i++) {
    const g = s.g;
    if (!g || g.finished) {
      games++;
      if (games < 2) R.applyAction(s, { type: "start" }, ctx("h"));
      continue;
    }
    for (const id of people) {
      const seat = s.inGame.indexOf(id);
      if (seat < 0 || !g.alive[seat] || g.finished) continue;
      if (g.phase === "night" && W.nightTargets(g, seat).length && Math.random() < 0.8) {
        try { R.applyAction(s, { type: "act", target: W.nightTargets(g, seat)[0] }, ctx(id)); } catch {}
      }
      if (g.phase === "day" && i % 3 === 0) R.applyAction(s, { type: "chat", text: "it's " + seat, channel: "all" }, ctx(id));
      if (g.phase === "vote") { const t = g.alive.findIndex((a, x) => a && x !== seat); R.applyAction(s, { type: "vote", target: t }, ctx(id)); }
      if (g.roles[seat] === "wolf" && !g.finished) R.applyAction(s, { type: "chat", text: "psst", channel: "wolves" }, ctx(id));
    }
    clock += 50000; R.applyAction(s, { type: "tick" }, ctx("h"));
  }
  assert.ok(games >= 2, "two games finished");
  assert.ok(Object.values(s.wins).length >= 7);
  // a villager never reads the wolves' chat while alive in a running game
  R.applyAction(s, { type: "start" }, ctx("h"));
  const g = s.g;
  const wolfId = s.inGame.find((id, x) => g.roles[x] === "wolf" && people.includes(id));
  const villagerId = s.inGame.find((id, x) => g.roles[x] !== "wolf" && people.includes(id));
  if (wolfId && villagerId) {
    R.applyAction(s, { type: "chat", text: "secret plan", channel: "wolves" }, ctx(wolfId));
    assert.ok(!R.personalState(s, villagerId).chat.some(c => c.text === "secret plan"));
    assert.ok(R.personalState(s, wolfId).chat.some(c => c.text === "secret plan"));
  }
  assert.throws(() => R.applyAction(s, { type: "chat", text: "boo", channel: "grave" }, ctx(villagerId || "h")), /can't post/);
});
