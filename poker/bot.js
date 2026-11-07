// Bot decisions for AI mode. Bots see only what a player would: their own cards, the board, stacks and bets.
import { evaluate, newDeck, legalActions } from "../supabase/functions/_shared/poker-engine.js";

const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;

// Chance to win against `opponents` random hands, by simulation. Ties count as shared wins.
export function equity(hole, board, opponents, iterations = 300) {
  const seen = new Set([...hole, ...board]);
  const rest = newDeck().filter(c => !seen.has(c));
  let score = 0;
  for (let it = 0; it < iterations; it++) {
    // partial shuffle: only as many cards as we need
    const need = opponents * 2 + (5 - board.length);
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rnd() * (rest.length - i));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const fullBoard = board.concat(rest.slice(opponents * 2, need));
    const mine = evaluate(hole.concat(fullBoard)).score;
    let best = 0, tiedWith = 0, lost = false;
    for (let o = 0; o < opponents; o++) {
      const s = evaluate([rest[o * 2], rest[o * 2 + 1], ...fullBoard]).score;
      if (s > mine) { lost = true; break; }
      if (s === mine) tiedWith++;
      best = Math.max(best, s);
    }
    if (!lost) score += 1 / (tiedWith + 1);
  }
  return score / iterations;
}

const SKILL = {
  easy:   { iters: 120, noise: 0.18, aggression: 0.35, bluff: 0.02, callSlack: 0.12 },
  normal: { iters: 260, noise: 0.08, aggression: 0.6,  bluff: 0.06, callSlack: 0.03 },
  hard:   { iters: 450, noise: 0.03, aggression: 0.85, bluff: 0.1,  callSlack: -0.01 }
};

function roundTo(amount, unit) { return Math.max(unit, Math.round(amount / unit) * unit); }

// Returns an engine action for the bot in `seat`.
export function decide(table, seat, skill = "normal") {
  const cfg = SKILL[skill] || SKILL.normal;
  const h = table.hand, me = h.players[seat], legal = legalActions(table, seat);
  const opponents = h.players.filter((p, i) => p && i !== seat && !p.folded).length;
  const pot = h.players.reduce((s, p) => s + (p ? p.committed : 0), 0);
  const toCall = legal.call;
  const potOdds = toCall / (pot + toCall || 1);
  let eq = equity(me.hole, h.board, Math.max(1, opponents), cfg.iters);
  eq = Math.min(1, Math.max(0, eq + (rnd() * 2 - 1) * cfg.noise));
  // What a hand "should" win against this many opponents, so thresholds scale with table size.
  const fair = 1 / (opponents + 1);
  const strength = eq / fair; // 1 = average, 2 = twice the fair share

  const unit = table.bb >= 100 ? 100 : 1; // bet in whole dollars at bigger stakes
  const raiseTo = frac => {
    if (!legal.raise) return null;
    const target = h.currentBet + frac * (pot + toCall);
    return { type: "raise", to: Math.min(legal.raise.max, Math.max(legal.raise.min, roundTo(target, unit))) };
  };

  // Very strong: build the pot.
  if (strength > 2.2 - cfg.aggression * 0.6 && legal.raise && rnd() < 0.55 + cfg.aggression * 0.4) {
    const shove = eq > 0.8 && table.seats[seat].stack < pot * 1.2;
    if (shove) return { type: "raise", to: legal.raise.max };
    return raiseTo(0.5 + rnd() * cfg.aggression * 0.7);
  }
  // Nothing to call: check, or bet with a decent hand / the occasional bluff.
  if (legal.check) {
    if (legal.raise && (strength > 1.4 || rnd() < cfg.bluff)) return raiseTo(0.4 + rnd() * 0.4);
    return { type: "check" };
  }
  // Facing a bet: call when the price is right, bluff-raise rarely, otherwise fold.
  if (eq + cfg.callSlack >= potOdds) {
    if (legal.raise && strength > 1.6 && rnd() < cfg.aggression * 0.5) return raiseTo(0.6 + rnd() * 0.5);
    return { type: "call" };
  }
  if (legal.raise && rnd() < cfg.bluff * 0.5 && h.street !== "river") return raiseTo(0.7);
  return { type: "fold" };
}

const NAMES = ["Rosa", "Dmitri", "Kenji", "Amara", "Luis", "Priya", "Otto", "Mei", "Walt", "Nadia", "Faisal", "Greta"];
export function botNames(n, avoid = "") {
  const pool = NAMES.filter(x => x.toLowerCase() !== avoid.toLowerCase());
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}
