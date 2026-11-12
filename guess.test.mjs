// Run with: node guess.test.mjs
// The browser shows your own move before the server answers. That prediction must be exactly what the server
// will send: whole bot games are played here, and before every move the prediction made from the mover's own
// view (which hides the other hands) is compared with the real table after the move.
import test from "node:test";
import assert from "node:assert";
import { webcrypto } from "node:crypto";
import * as E from "./supabase/functions/_shared/poker-engine.js";
import * as L from "./supabase/functions/_shared/ludo-engine.js";
import * as K from "./supabase/functions/_shared/checkers-engine.js";
import * as C from "./supabase/functions/_shared/capsa-engine.js";
import * as G from "./supabase/functions/_shared/gaple-engine.js";
import * as N from "./supabase/functions/_shared/cangkul-engine.js";
import { ludoMove } from "./supabase/functions/_shared/ludo-bot.js";
import { checkersMove } from "./supabase/functions/_shared/checkers-bot.js";
import { capsaMove } from "./supabase/functions/_shared/capsa-bot.js";
import { gapleMove } from "./supabase/functions/_shared/gaple-bot.js";
import { cangkulMove } from "./supabase/functions/_shared/cangkul-bot.js";
import { guess as ludoGuess } from "./ludo/guess.js";
import { guess as checkersGuess } from "./checkers/guess.js";
import { guess as capsaGuess } from "./capsa/guess.js";
import { guess as gapleGuess } from "./gaple/guess.js";
import { guess as cangkulGuess } from "./cangkul/guess.js";

const rng = a => webcrypto.getRandomValues(a);
const mix = d => { for (let i = d.length - 1; i > 0; i--) { const j = rng(new Uint32Array(1))[0] % (i + 1); [d[i], d[j]] = [d[j], d[i]]; } return d; };
const plain = x => JSON.parse(JSON.stringify(x));

// plays `games` games; returns how many moves were predicted, out of how many
function run({ games, start, view, bot, apply, guess }) {
  let moves = 0, guessed = 0;
  for (let n = 1; n <= games; n++) {
    const g = start(n);
    for (let step = 0; step < 4000 && !g.finished; step++) {
      const seat = g.turn, m = bot(g, seat, n);
      assert.ok(m, "the bot has a move");
      const before = plain(view(g, seat)), frozen = JSON.stringify(before);
      const mine = guess(before, seat, m);
      assert.strictEqual(JSON.stringify(before), frozen, "predicting never changes the table it was given");
      apply(g, seat, m);
      moves++;
      if (mine && g.finished) continue;      // some endings depend on the hidden hands; the server's answer settles those
      if (mine) { guessed++; assert.deepStrictEqual(plain(mine), plain(view(g, seat)), `game ${n}, step ${step}, ${JSON.stringify(m)}`); }
      else assert.ok(g.finished || m.type === "roll" || m.type === "draw" || m.type === "giveup", `no prediction for ${JSON.stringify(m)}`);
    }
  }
  return { moves, guessed };
}

test("ludo: every token move is predicted exactly", () => {
  const r = run({
    games: 30, start: n => L.startGame(n, { rules: { captureBonus: n % 2 === 0, blocks: n % 3 === 0, pairSafe: n % 4 === 0, homeBonus: n % 5 === 0 }, seats: [[0, 2], [0, 1, 2], [0, 1, 2, 3]][n % 3] }),
    view: L.viewFor, bot: (g, s) => ludoMove(g, s, "normal"), apply: (g, s, m) => L.act(g, s, m), guess: ludoGuess
  });
  assert.ok(r.guessed > 200, JSON.stringify(r));
});

test("checkers: every move is predicted exactly, in both rule sets", () => {
  const r = run({
    games: 12, start: n => K.startGame(n, { rules: n % 2 ? "dam" : "english" }),
    view: g => K.viewFor(g), bot: (g, s) => checkersMove(g, s, "easy"), apply: (g, s, m) => K.play(g, s, m), guess: checkersGuess
  });
  assert.ok(r.guessed > 100, JSON.stringify(r));
});

test("capsa: every play and pass is predicted exactly without seeing the other hands", () => {
  const r = run({
    games: 40, start: n => C.startGame(n, () => mix(C.newDeck()), n % 2 ? -1 : n % 4, n % 3 ? "winner" : "loser", ["off", "spare", "nospare"][n % 3]),
    view: C.viewFor, bot: (g, s) => capsaMove(g, s, "normal"),
    apply: (g, s, m) => (m.type === "play" ? C.play(g, s, m.cards) : C.pass(g, s)), guess: capsaGuess
  });
  assert.ok(r.guessed > 400, JSON.stringify(r));
});

test("gaple: every tile and pass is predicted exactly without seeing the other hands", () => {
  const r = run({
    games: 60, start: n => G.startGame(n, () => mix(G.newSet()), n % 2 ? -1 : n % 4, { opener: n % 3 ? "66" : "00" }),
    view: G.viewFor, bot: (g, s) => gapleMove(g, s, "normal"),
    apply: (g, s, m) => (m.type === "play" ? G.play(g, s, m.tile, m.end) : G.pass(g, s)), guess: gapleGuess
  });
  assert.ok(r.guessed > 400, JSON.stringify(r));
});

test("cangkul: every card played is predicted exactly without seeing the other hands or the stock", () => {
  const r = run({
    games: 60, start: n => N.startGame(n, E.shuffle(E.newDeck(), rng), { seats: 2 + (n % 3), handSize: n % 2 ? 5 : 7, emptyStock: n % 2 ? "take" : "pass", mode: n % 3 ? "winner" : "loser" }),
    view: N.viewFor, bot: (g, s) => cangkulMove(g, s, "normal"),
    apply: (g, s, m) => (m.type === "play" ? N.play(g, s, m.card) : m.type === "draw" ? N.draw(g, s) : N.giveUp(g, s)), guess: cangkulGuess
  });
  assert.ok(r.guessed > 400, JSON.stringify(r));
});

// Mahjong: what follows a discard depends on hidden hands, so only the part you can know is checked:
// your hand, the discard piles, and that the discard is the next line of the log.
import * as MJ from "./supabase/functions/_shared/mahjong-engine.js";
import { mahjongMove } from "./supabase/functions/_shared/mahjong-bot.js";
import { guess as mahjongGuess } from "./mahjong/guess.js";
test("mahjong: a discard is predicted exactly for everything the player can know", () => {
  let guessed = 0;
  for (let n = 1; n <= 25; n++) {
    const g = MJ.startGame(n, () => mix(MJ.newWall()), { dealer: n % 4, minFaan: 0 });
    for (let step = 0; step < 3000 && !g.finished; step++) {
      const seats = g.phase === "discard" ? [g.turn] : Object.keys(g.claims || {}).map(Number).filter(s => !g.claims[s].decision);
      for (const s of seats) {
        if (g.finished) break;
        const m = mahjongMove(g, s, "normal");
        if (!m) continue;
        const before = plain(MJ.viewFor(g, s)), mine = mahjongGuess(before, s, m);
        MJ.act(g, s, m);
        if (m.type !== "discard") { assert.strictEqual(mine, null); continue; }
        assert.ok(mine, "a discard is predicted");
        guessed++;
        const real = plain(MJ.viewFor(g, s));
        if (g.finished) continue;
        assert.deepStrictEqual(mine.discards, real.discards);
        const stillMine = real.turn !== s;                      // unless the turn came straight back (nobody else left to act)
        if (stillMine) { assert.deepStrictEqual(mine.hand, real.hand); assert.strictEqual(real.options, null); assert.strictEqual(real.drawn, null); assert.deepStrictEqual(mine.last, real.last); }
        const at = real.log.length - 1 - (real.logCount - mine.logCount);
        assert.deepStrictEqual(real.log[at], mine.log[mine.log.length - 1], "the discard is the next line of the log");
      }
    }
  }
  assert.ok(guessed > 300, String(guessed));
});
