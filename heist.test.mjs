// Run with: node --test
import test from "node:test";
import assert from "node:assert";
import * as H from "./supabase/functions/_shared/heist-engine.js";

// 5 players: seats 0,1 cops; 2,3,4 crew; seat 2 leads
const fixed = (special = false) => H.startGame(1, 5, { roles: special ? ["cop", "sniper", "mastermind", "crew", "crew"] : ["cop", "cop", "crew", "crew", "crew"], leader: 2 });
const approve = g => { for (let s = 0; s < g.n; s++) H.vote(g, s, true); H.resolveVote(g); };
const run = (g, team, sabotage = []) => { H.pick(g, g.leader, team); approve(g); team.forEach(s => H.playCard(g, s, sabotage.includes(s) ? "sabotage" : "success")); H.resolveHeist(g); };

test("roles and team sizes scale with the table", () => {
  for (let n = 5; n <= 10; n++) {
    const g = H.startGame(1, n, { special: true });
    assert.strictEqual(g.roles.filter(H.isCop).length, H.COPS[n]);
    assert.strictEqual(g.roles.filter(r => r === "mastermind").length, 1);
    assert.strictEqual(g.roles.filter(r => r === "sniper").length, 1);
    assert.strictEqual(H.TEAMS[n].length, 5);
  }
  assert.strictEqual(H.startGame(1, 7).roles.filter(r => r === "mastermind").length, 0);
  assert.throws(() => H.startGame(1, 4));
});

test("the leader picks the right number; a majority approves; five rejections hand it to the cops", () => {
  const g = fixed();
  assert.throws(() => H.pick(g, 3, [2, 3]), /leader/);
  assert.throws(() => H.pick(g, 2, [2, 3, 4]), /Pick 2/);
  for (let i = 0; i < 5; i++) {
    H.pick(g, g.leader, [g.leader, (g.leader + 1) % 5]);
    [0, 1, 2].forEach(s => H.vote(g, s, false)); [3, 4].forEach(s => H.vote(g, s, true));
    H.resolveVote(g);
  }
  assert.deepStrictEqual(g.finished && [g.finished.winner, g.finished.how], ["cops", "rejects"]);
});

test("the crew can only play Success; one sabotage fails a heist; 3 fails win it for the cops", () => {
  const g = fixed();
  H.pick(g, 2, [2, 0]); approve(g);
  assert.throws(() => H.playCard(g, 2, "sabotage"), /crew/);
  assert.throws(() => H.playCard(g, 3, "success"), /not on/);
  H.playCard(g, 2, "success"); H.playCard(g, 0, "sabotage"); H.resolveHeist(g);
  assert.deepStrictEqual(g.results[0], { heist: 0, team: [0, 2], fails: 1, ok: false });
  run(g, [g.leader, 0, 1].slice(0, 3), [0]);
  run(g, [0, 1], [1]);
  assert.strictEqual(g.finished.winner, "cops");
  assert.deepStrictEqual(g.finished.winners, [0, 1]);
});

test("with 7+ players the 4th heist needs two sabotages", () => {
  const g = H.startGame(1, 7, { roles: ["cop", "cop", "cop", "crew", "crew", "crew", "crew"], leader: 3 });
  run(g, [3, 4], []); run(g, [3, 4, 5], []); run(g, [3, 4, 0], [0]);
  assert.strictEqual(g.heist, 3);
  const leader = g.leader;
  run(g, [leader, 0, 1, 3].filter((x, i, a) => a.indexOf(x) === i).slice(0, 4).concat([5, 6]).slice(0, 4), [0]);
  assert.strictEqual(g.results[3].fails, 1);
  assert.strictEqual(g.results[3].ok, true);
  assert.strictEqual(g.finished.winner, "crew");
});

test("special roles: who knows what, and the Sniper's last shot", () => {
  const g = fixed(true);
  assert.deepStrictEqual(H.viewFor(g, 2).roles, ["cop", "cop", "mastermind", null, null]);   // the Mastermind sees cops, not the Sniper
  assert.deepStrictEqual(H.viewFor(g, 0).roles, ["cop", "sniper", null, null, null]);
  assert.deepStrictEqual(H.viewFor(g, 3).roles, [null, null, null, "crew", null]);
  run(g, [2, 3]); run(g, [3, 4, 2]); run(g, [2, 4]);
  assert.strictEqual(g.phase, "snipe");
  assert.throws(() => H.snipe(g, 0, 2), /Sniper/);
  H.snipe(g, 1, 2);
  assert.deepStrictEqual([g.finished.winner, g.finished.how], ["cops", "sniped"]);
  const h = fixed(true);
  run(h, [2, 3]); run(h, [3, 4, 2]); run(h, [2, 4]);
  H.snipe(h, 1, 4);
  assert.strictEqual(h.finished.winner, "crew");
});

// ---------- rooms ----------
const R = await import("./supabase/functions/_shared/heist-room.js");
test("heist rooms: bots fill in, whole games run on the clock, cops chat in private, leavers become bots", () => {
  let clock = 1_000_000;
  const ctx = (playerId, extra = {}) => ({ now: clock, playerId, ...extra });
  const s = R.newRoom({ code: "HEIST1", settings: { special: true }, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  ["a", "b"].forEach(id => R.applyAction(s, { type: "join", name: id.toUpperCase() }, ctx(id, { tokenHash: "t" + id })));
  assert.throws(() => R.applyAction(s, { type: "start" }, ctx("h")), /at least 5/);
  R.applyAction(s, { type: "settings", settings: { bots: 7 } }, ctx("h"));
  R.applyAction(s, { type: "start" }, ctx("h"));
  assert.strictEqual(s.g.n, 7);
  assert.ok(R.publicState(s).view.roles.every(r => r === null));
  const people = ["h", "a", "b"];
  let games = 0;
  for (let i = 0; i < 2000 && games < 3; i++) {
    const g = s.g;
    if (!g || g.finished) { games++; if (games < 3) R.applyAction(s, { type: "start" }, ctx("h")); continue; }
    for (const id of people) {
      const seat = s.inGame.indexOf(id); if (seat < 0 || g.finished) continue;
      try {
        if (g.phase === "pick" && g.leader === seat && i % 3 === 0) R.applyAction(s, { type: "pick", team: [...Array(g.n).keys()].slice(0, H.teamSize(g)) }, ctx(id));
        if (g.phase === "vote" && g.votes[seat] === undefined && i % 2) R.applyAction(s, { type: "vote", yes: Math.random() < 0.6 }, ctx(id));
        if (g.phase === "heist" && g.team.includes(seat) && g.plays[seat] === undefined) R.applyAction(s, { type: "play", card: H.isCop(g.roles[seat]) && Math.random() < 0.5 ? "sabotage" : "success" }, ctx(id));
        if (g.phase === "snipe" && H.sniperSeat(g) === seat) R.applyAction(s, { type: "snipe", target: H.snipeTargets(g)[0] }, ctx(id));
      } catch (e) { if (!/turn|time|leader|on this/i.test(e.message)) throw e; }
    }
    clock += 4000; R.applyAction(s, { type: "tick" }, ctx("h"));
  }
  assert.ok(games >= 3, "three games finished");
  assert.ok(Object.values(s.wins).length >= 7);
  R.applyAction(s, { type: "start" }, ctx("h"));
  const g = s.g;
  const cop = people.find(id => H.isCop(g.roles[s.inGame.indexOf(id)]));
  const crew = people.find(id => !H.isCop(g.roles[s.inGame.indexOf(id)]));
  if (cop && crew) {
    R.applyAction(s, { type: "chat", text: "we sabotage heist 2", channel: "cops" }, ctx(cop));
    assert.ok(!R.personalState(s, crew).chat.some(c => c.text === "we sabotage heist 2"));
    assert.throws(() => R.applyAction(s, { type: "chat", text: "hi", channel: "cops" }, ctx(crew)), /can't post/);
  }
  // someone leaves: their seat is played by a bot and the game still finishes
  R.applyAction(s, { type: "leave" }, ctx("a"));
  for (let i = 0; i < 400 && !s.g.finished; i++) { clock += 200000; R.applyAction(s, { type: "tick" }, ctx("h")); }
  assert.ok(s.g.finished);
});
