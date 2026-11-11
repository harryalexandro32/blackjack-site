// Run with: node --test
import test from "node:test";
import assert from "node:assert";
import { webcrypto } from "node:crypto";
import * as G from "./supabase/functions/_shared/gaple-engine.js";
import { gapleMove } from "./supabase/functions/_shared/gaple-bot.js";
import * as E from "./supabase/functions/_shared/poker-engine.js";

const rng = webcrypto.getRandomValues.bind(webcrypto);
const shuffled = () => { const d = G.newSet(); for (let i = d.length - 1; i > 0; i--) { const j = rng(new Uint32Array(1))[0] % (i + 1); [d[i], d[j]] = [d[j], d[i]]; } return d; };
// a game with exactly these hands and this line already on the table (tiles given left to right as "a-b")
function game(hands, { turn = 0, line = [], lastBy = -1, opts = {} } = {}) {
  return {
    no: 1, hands: hands.map(h => h.slice()), turn, line: line.map(s => { const [a, b] = s.split("-").map(Number); return { t: a <= b ? `${a}${b}` : `${b}${a}`, a, b }; }),
    origin: 0, opener: null, lastBy, passed: [false, false, false, false], voids: [[], [], [], []],
    blank25: opts.blank25 !== false, gapleBonus: opts.gapleBonus !== false, log: [], finished: null
  };
}

test("the set: 28 different tiles, 168 pips", () => {
  const set = G.newSet();
  assert.strictEqual(set.length, 28);
  assert.strictEqual(new Set(set).size, 28);
  assert.strictEqual(set.reduce((a, t) => a + G.pipsOf(t), 0), 168);
  assert.ok(set.every(t => G.lo(t) <= G.hi(t)));
});

test("dealing: 7 tiles each, every tile dealt once, nothing left over", () => {
  for (let n = 0; n < 50; n++) {
    const g = G.startGame(1, shuffled, -1);
    assert.ok(g.hands.every(h => h.length === 7));
    assert.strictEqual(new Set(g.hands.flat()).size, 28);
  }
});

test("a shuffled deck of cards gives a shuffled set of tiles", () => {
  const seen = new Set();
  for (let n = 0; n < 20; n++) {
    const tiles = G.shuffleFrom(E.shuffle(E.newDeck(), rng));
    assert.deepStrictEqual(tiles.slice().sort(), G.newSet().sort());
    seen.add(tiles.join());
  }
  assert.ok(seen.size > 15);
});

test("the first game starts with the opening tile, and it has to be played first", () => {
  for (const opener of ["66", "00"]) {
    const g = G.startGame(1, shuffled, -1, { opener });
    assert.ok(g.hands[g.turn].includes(opener));
    assert.strictEqual(g.opener, opener);
    assert.deepStrictEqual(G.legal(g, g.turn).moves.map(m => m.tile), [opener]);
    const another = g.hands[g.turn].find(t => t !== opener);
    assert.throws(() => G.play(g, g.turn, another), /double/);
    assert.throws(() => G.pass(g, g.turn), /opening tile/);
    const starter = g.turn;
    G.play(g, starter, opener);
    assert.strictEqual(g.opener, null);
    assert.strictEqual(g.turn, (starter + 1) % 4);
    assert.deepStrictEqual(G.endsOf(g), [+opener[0], +opener[0]]);
  }
  assert.strictEqual(G.startGame(1, shuffled, -1).opener, "66");      // double six unless the host says otherwise
});

test("later games: the last winner leads any tile", () => {
  const g = G.startGame(2, shuffled, 2);
  assert.strictEqual(g.turn, 2);
  assert.strictEqual(g.opener, null);
  assert.strictEqual(G.legal(g, 2).moves.length, 7);
  G.play(g, 2, g.hands[2][3]);
  assert.strictEqual(g.line.length, 1);
});

test("legal moves: a tile has to match an open end; you pick the end when both fit", () => {
  const g = game([["35", "22", "36", "14"], ["01"], ["02"], ["03"]], { line: ["3-4", "4-5"] });   // ends 3 and 5
  const L = G.legal(g, 0);
  assert.deepStrictEqual(L.ends, [3, 5]);
  assert.deepStrictEqual(L.moves, [{ tile: "35", ends: ["L", "R"] }, { tile: "36", ends: ["L"] }]);
  assert.strictEqual(L.canPass, false);
  assert.throws(() => G.play(g, 0, "22"), /doesn't match/);
  assert.throws(() => G.play(g, 0, "36", "R"), /that end/);
  assert.throws(() => G.play(g, 0, "66"), /hold/);
  assert.throws(() => G.play(g, 1, "01"), /not your turn/);
  // 3-5 on the left end: the 5 faces out, so both ends are now 5
  const left = structuredClone(g); G.play(left, 0, "35", "L");
  assert.deepStrictEqual(G.endsOf(left), [5, 5]);
  assert.deepStrictEqual(left.line[0], { t: "35", a: 5, b: 3 });
  assert.strictEqual(left.origin, 1);
  // on the right end: the 3 faces out
  const right = structuredClone(g); G.play(right, 0, "35", "R");
  assert.deepStrictEqual(G.endsOf(right), [3, 3]);
  assert.deepStrictEqual(right.line[2], { t: "35", a: 5, b: 3 });
  // a tile that fits one end goes there by itself
  G.play(g, 0, "36");
  assert.deepStrictEqual(G.endsOf(g), [6, 5]);
  assert.ok(g.line.every((x, i) => i === 0 || g.line[i - 1].b === x.a));     // neighbours always match
});

test("passing: only when nothing fits, and then you have to", () => {
  const g = game([["35", "12"], ["01", "00"], ["46"], ["55"]], { line: ["3-4", "4-5"] });
  assert.throws(() => G.pass(g, 0), /can't pass/);
  G.play(g, 0, "35", "L");                          // ends 5 and 5
  assert.strictEqual(g.turn, 1);
  assert.deepStrictEqual(G.legal(g, 1), { moves: [], canPass: true, mustPlay: null, ends: [5, 5] });
  G.pass(g, 1);
  assert.strictEqual(g.passed[1], true);
  assert.deepStrictEqual(g.voids[1], [5]);          // everyone now knows seat 1 has no 5
  assert.strictEqual(g.turn, 2);
  assert.strictEqual(g.log[g.log.length - 1].type, "pass");
});

test("going out wins: every loser pays their pips", () => {
  const g = game([["35"], ["12", "66"], ["00", "01"], ["46"]], { line: ["3-4", "4-6"] });   // ends 3 and 6
  G.play(g, 0, "35");
  const f = g.finished;
  assert.strictEqual(f.winner, 0);
  assert.strictEqual(f.reason, "out");
  assert.strictEqual(f.gaple, false);
  assert.deepStrictEqual(f.values, [0, 15, 1, 10]);
  assert.deepStrictEqual(f.points, [26, -15, -1, -10]);
  assert.strictEqual(g.turn, -1);
  assert.throws(() => G.play(g, 1, "12"), /not your turn/);
});

test("gaple: going out with a tile that fits both ends doubles the payments (if the table plays it)", () => {
  const hands = [["35"], ["12", "66"], ["00", "01"], ["46"]];
  const g = game(hands, { line: ["3-4", "4-5"] });                  // ends 3 and 5: the 3-5 fits both
  G.play(g, 0, "35", "L");
  assert.strictEqual(g.finished.gaple, true);
  assert.strictEqual(g.finished.mult, 2);
  assert.deepStrictEqual(g.finished.points, [52, -30, -2, -20]);
  assert.strictEqual(g.log[g.log.length - 1].type, "gaple");
  const off = game(hands, { line: ["3-4", "4-5"], opts: { gapleBonus: false } });
  G.play(off, 0, "35");
  assert.strictEqual(off.finished.gaple, false);
  assert.deepStrictEqual(off.finished.points, [26, -15, -1, -10]);
  // both ends showing the same number: any tile with it fits both
  const same = game([["25"], ["11"], ["11"], ["11"]], { line: ["5-4", "4-5"] });
  G.play(same, 0, "25");
  assert.strictEqual(same.finished.gaple, true);
});

test("a lone double blank counts 25 (if the table plays it)", () => {
  assert.strictEqual(G.handValue(["00"], true), 25);
  assert.strictEqual(G.handValue(["00"], false), 0);
  assert.strictEqual(G.handValue(["00", "01"], true), 1);           // only when it's the last tile left
  assert.strictEqual(G.handValue(["56", "66"], true), 23);
  const hands = [["35"], ["00"], ["00", "01"], ["46"]];
  const g = game(hands, { line: ["3-4", "4-6"] });
  G.play(g, 0, "35");
  assert.deepStrictEqual(g.finished.points, [36, -25, -1, -10]);
  const off = game([["35"], ["00"], ["01"], ["46"]], { line: ["3-4", "4-6"], opts: { blank25: false } });
  G.play(off, 0, "35");
  assert.deepStrictEqual(off.finished.points, [11, 0, -1, -10]);
});

test("blocked: nobody can play, the fewest pips win", () => {
  // seat 0 plays 3-6 on the 3: both ends are 6 and nobody holds a 6
  const g = game([["36", "11"], ["12", "45"], ["01"], ["22", "55"]], { line: ["3-4", "4-6"] });
  G.play(g, 0, "36", "L");
  const f = g.finished;
  assert.strictEqual(f.reason, "blocked");
  assert.strictEqual(f.winner, 2);                                  // 1 pip
  assert.strictEqual(f.gaple, false);
  assert.deepStrictEqual(f.values, [2, 12, 1, 14]);
  assert.deepStrictEqual(f.points, [-2, -12, 28, -14]);
  assert.strictEqual(g.log[g.log.length - 1].type, "blocked");
});

test("blocked ties: fewer tiles, then the nearest player after the last one to play", () => {
  // pips tie between seats 1 and 2 (3 each); seat 2 holds fewer tiles
  let g = game([["36", "55"], ["01", "02"], ["12"], ["22", "55"]], { line: ["3-4", "4-6"] });
  g.hands[3] = ["22", "45"];
  G.play(g, 0, "36", "L");
  assert.strictEqual(g.finished.reason, "blocked");
  assert.strictEqual(g.finished.winner, 2);
  // same pips and same number of tiles for seats 1 and 3: seat 1 comes first after seat 0
  g = game([["36", "55"], ["12"], ["45"], ["03"]], { line: ["3-4", "4-6"] });
  G.play(g, 0, "36", "L");
  assert.strictEqual(g.finished.winner, 1);
  // ... and when the last play came from seat 2, seat 3 is nearest
  g = game([["45"], ["12"], ["36", "55"], ["03"]], { turn: 2, line: ["3-4", "4-6"] });
  G.play(g, 2, "36", "L");
  assert.strictEqual(g.finished.winner, 3);
  // the player who closed the game is last in line when they tie too
  g = game([["36", "12"], ["55"], ["03"], ["45"]], { line: ["3-4", "4-6"] });
  G.play(g, 0, "36", "L");
  assert.strictEqual(g.finished.winner, 2);                         // seats 0 and 2 tie on 3 pips and 1 tile
  // a lone double blank isn't the best hand to be stuck with
  g = game([["36", "55"], ["00"], ["45"], ["22", "11"]], { line: ["3-4", "4-6"] });
  G.play(g, 0, "36", "L");
  assert.strictEqual(g.finished.winner, 3);                         // 6 pips beat 9, 10 and the 25
  assert.strictEqual(g.finished.values[1], 25);
});

test("what a player sees: their own tiles, the others' counts only", () => {
  const g = G.startGame(1, shuffled, -1);
  G.play(g, g.turn, "66");
  for (let seat = 0; seat < 4; seat++) {
    const v = G.viewFor(g, seat), text = JSON.stringify(v);
    assert.deepStrictEqual(v.hand, g.hands[seat]);
    assert.strictEqual(v.hands, undefined);
    assert.deepStrictEqual(v.counts, g.hands.map(h => h.length));
    for (let o = 0; o < 4; o++) if (o !== seat) for (const t of g.hands[o]) assert.ok(!text.includes(`"${t}"`), `seat ${seat} can see ${t}`);
    assert.strictEqual(!!v.legal, seat === g.turn);
  }
  assert.strictEqual(G.viewFor(g, -1).hand, null);
  assert.strictEqual(G.viewFor(null, 0), null);
});

test("out of time: pass when nothing fits, otherwise the heaviest tile that does", () => {
  const g = game([["35", "36", "12"], ["12"], ["46"], ["11"]], { line: ["3-4", "4-5"] });
  assert.deepStrictEqual(G.autoMove(g), { seat: 0, type: "play", tile: "36", end: "L" });
  assert.deepStrictEqual(G.autoMove(g), { seat: 1, type: "pass" });
});

// a whole game between bots; returns the finished game
function botGame(skills, leader = -1, opts = {}) {
  const g = G.startGame(1, shuffled, leader, opts);
  for (let i = 0; i < 400 && !g.finished; i++) {
    const seat = g.turn, m = gapleMove(g, seat, skills[seat]);
    if (m.type === "pass") G.pass(g, seat); else G.play(g, seat, m.tile, m.end);
  }
  return g;
}

test("bots: hundreds of whole games finish, the line always matches, points add up to zero", () => {
  const reasons = { out: 0, blocked: 0 };
  let gaples = 0;
  for (let n = 0; n < 600; n++) {
    const skill = ["easy", "normal", "hard"][n % 3];
    const opts = { opener: n % 2 ? "00" : "66", blank25: n % 4 < 2, gapleBonus: n % 5 !== 0 };
    const g = botGame([skill, skill, skill, skill], n % 2 ? -1 : n % 4, opts);
    const f = g.finished;
    assert.ok(f, "the game finished");
    reasons[f.reason] += 1; if (f.gaple) gaples += 1;
    assert.ok(g.line.every((x, i) => i === 0 || g.line[i - 1].b === x.a));
    assert.strictEqual(g.line.length + g.hands.flat().length, 28);
    assert.strictEqual(new Set([...g.line.map(x => x.t), ...g.hands.flat()]).size, 28);
    assert.ok(g.origin >= 0 && g.origin < g.line.length);
    if (n % 2) assert.strictEqual(g.line[g.origin].t, opts.opener);      // the first game opened with the opening tile
    assert.strictEqual(f.points.reduce((a, b) => a + b, 0), 0);
    assert.ok(f.points[f.winner] >= 0);
    if (f.reason === "out") assert.strictEqual(g.hands[f.winner].length, 0);
    else {
      assert.ok(g.hands.every(h => h.length && !G.movesFor(h, G.endsOf(g)).length));
      assert.strictEqual(f.values[f.winner], Math.min(...f.values));
    }
    if (!opts.gapleBonus) assert.strictEqual(f.mult, 1);
  }
  assert.ok(reasons.out > 0 && reasons.blocked > 0 && gaples > 0);
});

test("bots: the strong one beats easy ones more often than its share", () => {
  let wins = 0, score = 0;
  const N = 800;
  for (let n = 0; n < N; n++) {
    const hard = n % 4, skills = [0, 1, 2, 3].map(i => i === hard ? "hard" : "easy");
    const f = botGame(skills, n % 4).finished;
    if (f.winner === hard) wins += 1;
    score += f.points[hard];
  }
  assert.ok(wins / N > 0.27, `hard bot won ${wins} of ${N}`);
  assert.ok(score > 0, `hard bot scored ${score}`);
});

test("bots only need what a player can see", () => {
  for (let n = 0; n < 50; n++) {
    const g = G.startGame(1, shuffled, n % 4);
    for (let i = 0; i < 400 && !g.finished; i++) {
      const seat = g.turn, v = G.viewFor(g, seat);
      const pseudo = { ...v, hands: v.counts.map((c, k) => k === seat ? v.hand : Array(c).fill("x")), finished: null };
      const m = gapleMove(pseudo, seat, "hard");
      if (m.type === "pass") G.pass(g, seat); else G.play(g, seat, m.tile, m.end);
    }
    assert.ok(g.finished);
  }
});

// ---------- rooms ----------
const R = await import("./supabase/functions/_shared/gaple-room.js");
let clock = 1_000_000;
const shuffledDeck = () => E.shuffle(E.newDeck(), rng);            // what the table server passes in
const ctx = (playerId, extra = {}) => ({ now: clock, playerId, shuffledDeck, ...extra });
const settingsG = { pointValue: 100, actSeconds: 30, skill: "normal" };
// keep ticking (moving the clock) until it's a person's turn or the game ends
function runBots(s) {
  for (let i = 0; i < 200 && s.g && !s.g.finished && s.seats[s.g.turn].bot; i++) { clock += 2000; R.applyAction(s, { type: "tick" }, ctx("h")); }
}
const personAt = (s, seat) => Object.keys(s.players).find(id => !s.players[id].left && s.players[id].seat === seat);
function playOn(s, until = () => false) {
  for (let i = 0; i < 400 && s.started && s.g && !s.g.finished && !until(); i++) {
    runBots(s);
    if (!s.started || s.g.finished) break;
    const id = personAt(s, s.g.turn), m = gapleMove(s.g, s.g.turn, "normal");
    R.applyAction(s, m.type === "pass" ? { type: "pass" } : { type: "play", tile: m.tile, end: m.end }, ctx(id));
  }
}

test("gaple rooms: settings are checked and filled in", () => {
  assert.deepStrictEqual(R.validateSettings(settingsG), { pointValue: 100, actSeconds: 30, skill: "normal", opener: "66", blank25: true, gapleBonus: true });
  assert.deepStrictEqual(R.validateSettings({ pointValue: 25, actSeconds: 60, skill: "hard", opener: "00", blank25: false, gapleBonus: false }), { pointValue: 25, actSeconds: 60, skill: "hard", opener: "00", blank25: false, gapleBonus: false });
  assert.strictEqual(R.validateSettings({ ...settingsG, skill: "expert", opener: "12" }).skill, "normal");
  assert.throws(() => R.validateSettings({ ...settingsG, pointValue: 0 }), /point/);
  assert.throws(() => R.validateSettings({ ...settingsG, actSeconds: 5 }), /time/);
});

test("gaple rooms: bots fill empty seats, play their turns, and the clock covers people", () => {
  const s = R.newRoom({ code: "GAP234", settings: settingsG, host: { id: "h", name: "Host", tokenHash: "th", hostKeyHash: "key" }, now: clock });
  assert.strictEqual(R.roomStatus(s), "waiting");
  assert.strictEqual(R.publicState(s).game, "gaple");
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
  assert.throws(() => R.applyAction(s, { type: "start" }, ctx("a")), /host/);
  R.applyAction(s, { type: "start" }, ctx("h"));
  assert.strictEqual(R.roomStatus(s), "playing");
  assert.strictEqual(s.seats.filter(x => x.bot).length, 2);
  assert.strictEqual(new Set(s.seats.map(x => x.name)).size, 4);        // every bot gets its own name
  assert.ok(s.g && s.g.hands.every(h => h.length === 7));
  assert.strictEqual(s.g.opener, "66");
  assert.strictEqual(R.publicState(s).view.hand, null);            // nobody's tiles in the public copy
  assert.strictEqual(R.personalState(s, "a").view.hand.length, 7);
  runBots(s);
  if (!s.g.finished) {
    const seat = s.g.turn, id = personAt(s, seat);
    assert.throws(() => R.applyAction(s, { type: "play", tile: "nope" }, ctx(id)), /hold/);
    assert.throws(() => R.applyAction(s, { type: "pass" }, ctx(personAt(s, s.players.h.seat === seat ? s.players.a.seat : s.players.h.seat))), /not your turn/);
    const before = s.g.log.length;
    assert.ok(s.deadline > clock);
    clock += 31000; R.applyAction(s, { type: "tick" }, ctx("h"));  // out of time: auto move
    assert.ok(s.g.log.length > before);
    assert.strictEqual(s.g.log[before].seat, seat);
  }
});

test("gaple rooms: nobody sees anyone else's tiles while a game is on", () => {
  const s = R.newRoom({ code: "GAP234", settings: settingsG, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
  R.applyAction(s, { type: "join", name: "Bo" }, ctx("b", { tokenHash: "tb" }));
  R.applyAction(s, { type: "start" }, ctx("h"));
  let checks = 0;
  const check = () => {
    if (s.g.finished) return;
    // (the opening tile is no secret: whoever starts the first game holds it)
    const hidden = seat => s.g.hands.flatMap((h, i) => i === seat ? [] : h).filter(t => t !== s.g.opener);
    for (const id of ["h", "a", "b"]) {
      const seat = s.players[id].seat, text = JSON.stringify(R.personalState(s, id));
      assert.deepStrictEqual(R.personalState(s, id).view.hand, s.g.hands[seat]);
      for (const t of hidden(seat)) assert.ok(!text.includes(`"${t}"`), `${id} can see ${t}`);
      assert.ok(!text.includes("tokenHash") && !text.includes('"players"') && !text.includes('"hands"'));
    }
    const pub = JSON.stringify(R.publicState(s));
    for (const t of hidden(-1)) assert.ok(!pub.includes(`"${t}"`), `the public copy shows ${t}`);
    checks += 1;
  };
  check();
  playOn(s, () => { check(); return false; });
  assert.ok(checks > 5);
  assert.ok(s.g.finished);
  assert.strictEqual(R.personalState(s, "a").view.finished.left.length, 4);   // tiles are shown once it's over
});

test("gaple rooms: whole games run, money only moves between people, sessions end and the room stays", () => {
  const s = R.newRoom({ code: "GAP234", settings: settingsG, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: "ta" }));
  R.applyAction(s, { type: "start" }, ctx("h"));
  const people = [s.players.h.seat, s.players.a.seat];
  for (let games = 0; games < 6; games++) {
    const first = s.g.no === 1;
    assert.strictEqual(!!s.g.opener, first);                       // only the first game needs the opening tile
    if (!first) assert.strictEqual(s.g.log.length ? s.g.log[0].seat : s.g.turn, s.lastWinner);
    const moneyBefore = s.money.slice();
    playOn(s);
    const f = s.g.finished;
    assert.ok(f);
    assert.strictEqual(s.lastWinner, f.winner);
    // this game's money: what the people paid each other, nothing to or from a bot
    const delta = s.money.map((m, i) => m - moneyBefore[i]);
    if (s.seats[f.winner].bot) assert.deepStrictEqual(delta, [0, 0, 0, 0]);
    else {
      const loser = people.find(i => i !== f.winner);
      assert.strictEqual(delta[loser], f.points[loser]);
      assert.strictEqual(delta[f.winner], -f.points[loser]);
    }
    assert.ok(s.nextGameAt > clock);
    clock += 10000; R.applyAction(s, { type: "tick" }, ctx("h"));  // next game is dealt
    assert.strictEqual(s.g.no, games + 2);
  }
  assert.strictEqual(s.games, 6);
  assert.strictEqual(s.points.reduce((a, b) => a + b, 0), 0);
  assert.strictEqual(people.reduce((a, i) => a + s.money[i], 0), 0);       // people's money balances by itself
  s.seats.forEach((x, i) => { if (x.bot) assert.strictEqual(s.money[i], 0); });
  const owed = people.map(i => s.money[i] * 100);
  R.applyAction(s, { type: "endSession" }, ctx("h"));
  assert.ok(s.ending || !s.started);
  playOn(s);
  assert.ok(!s.started && !s.closed);
  assert.strictEqual(s.sessions.length, 1);
  assert.strictEqual(s.sessions[0].games, 7);
  assert.deepStrictEqual(s.sessions[0].rows.map(r => r.name).sort(), ["Ana", "Host"]);
  const ledger = R.publicState(s).ledger;
  assert.strictEqual(ledger.length, 2);
  assert.strictEqual(ledger.reduce((a, r) => a + r.net, 0), 0);
  assert.ok(ledger.every(r => r.net % 100 === 0 && r.sessions === 1));
  if (owed.some(Boolean)) assert.ok(s.sessions[0].payments.length <= 1);
  assert.strictEqual(s.seats.filter(Boolean).length, 2);           // the bots go; the people stay
  R.applyAction(s, { type: "start" }, ctx("h"));                     // next session in the same room
  assert.strictEqual(s.g.opener, "66");                            // a new session starts from the opening tile
  R.applyAction(s, { type: "markPaid" }, ctx("h"));
  assert.strictEqual(R.publicState(s).ledger.length, 0);
  R.applyAction(s, { type: "close" }, ctx("h"));
  playOn(s);
  assert.strictEqual(R.roomStatus(s), "closed");
  assert.ok(R.personalState(s, "h").summary.rows.some(r => r.me));
  assert.throws(() => R.applyAction(s, { type: "chat", text: "hi" }, ctx("h")), /closed/);
});

test("gaple rooms: the host's options reach the game", () => {
  const s = R.newRoom({ code: "GAP234", settings: { ...settingsG, opener: "00", blank25: false, gapleBonus: false, skill: "hard" }, host: { id: "h", name: "Host", tokenHash: "th" }, now: clock });
  R.applyAction(s, { type: "start" }, ctx("h"));
  assert.strictEqual(s.g.opener, "00");
  assert.ok(s.g.hands[s.g.turn].includes("00") || s.g.line[0].t === "00");
  assert.strictEqual(s.g.blank25, false);
  assert.strictEqual(s.g.gapleBonus, false);
  playOn(s);
  assert.ok(s.g.finished);
  assert.strictEqual(s.g.line[s.g.origin].t, "00");
});

test("gaple rooms: leaving hands your seat to a bot; a full room is full; the host link reconnects the host", () => {
  const s = R.newRoom({ code: "GAP234", settings: settingsG, host: { id: "h", name: "Host", tokenHash: "th", hostKeyHash: "key" }, now: clock });
  for (const [id, name] of [["a", "Ana"], ["b", "Bo"], ["c", "Host"]]) R.applyAction(s, { type: "join", name }, ctx(id, { tokenHash: "t" + id }));
  assert.strictEqual(s.players.c.name, "Host 2");                  // names don't repeat
  assert.throws(() => R.applyAction(s, { type: "join", name: "Dee" }, ctx("d", { tokenHash: "td" })), /full/);
  R.applyAction(s, { type: "start" }, ctx("h"));
  const seatA = s.players.a.seat;
  R.applyAction(s, { type: "leave" }, ctx("a"));
  assert.ok(s.seats[seatA].bot);
  assert.strictEqual(s.departed[0].name, "Ana");
  assert.strictEqual(R.personalState(s, "a").left, true);
  R.applyAction(s, { type: "join", name: "Dee" }, ctx("d", { tokenHash: "td" }));   // takes the bot's seat and its tiles
  assert.strictEqual(s.players.d.seat, seatA);
  assert.throws(() => R.claimHost(s, { hostKeyHash: "nope", id: "x", tokenHash: "tx" }), /host link/);
  assert.strictEqual(R.claimHost(s, { hostKeyHash: "key", id: "x", tokenHash: "t2" }), "h");
  assert.strictEqual(R.findPlayerByTokenHash(s, "t2"), "h");
  assert.strictEqual(R.findPlayerByTokenHash(s, "nobody"), null);
  R.applyAction(s, { type: "chat", text: "gg" }, ctx("h"));
  assert.strictEqual(R.publicState(s).chat[0].text, "gg");
  assert.throws(() => R.applyAction(s, { type: "react", emoji: "nope" }, ctx("h")), /reactions/);
  playOn(s);
  assert.ok(s.g.finished);
});
