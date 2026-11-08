// Bot decisions for AI mode. Bots see only what a player would: their own cards, the board, stacks and bets.
import { legalActions } from "../supabase/functions/_shared/poker-engine.js";
import { simulate, drawChoice } from "./odds.js";

const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;

// Chance to win against `opponents` random hands, by simulation. Ties count as half a win.
// game: holdem | omaha | draw. In Five Card Draw before the draw, everyone (you included) is assumed to swap sensibly.
export function equity(hole, board, opponents, iterations = 300, game = "holdem", stage = null) {
  const preDraw = game === "draw" && (stage === "first" || stage === "draw");
  const r = simulate({ game, hole, board, opponents, iterations, discard: preDraw ? drawChoice(hole) : null, oppDraw: preDraw });
  return r.win + r.tie / 2;
}
export { drawChoice };

const SKILL = {
  easy:   { iters: 120, noise: 0.18, aggression: 0.35, bluff: 0.02, callSlack: 0.12 },
  normal: { iters: 260, noise: 0.08, aggression: 0.6,  bluff: 0.06, callSlack: 0.03 },
  hard:   { iters: 450, noise: 0.03, aggression: 0.85, bluff: 0.1,  callSlack: -0.01 }
};

// Personalities change how a bot plays; skill (above) changes how well it reads its own hand.
//  entry:   how strong a hand must be (vs. a fair share) to play on facing a bet before the flop
//  stubborn: extra price a bot will pay to see more cards (calling stations love this)
//  barrel:  chance to keep betting or raising when it already has a decent hand
export const STYLES = {
  rock:    { label: "Rock",            note: "plays few hands and bets only with good ones", aggression: 0.45, bluff: 0.01, callSlack: -0.05, entry: 1.45, stubborn: 0,    barrel: 0.25,
             avatars: ["Old Pete", "Bear", "Gran", "Owl"] },
  maniac:  { label: "Maniac",          note: "raises and bluffs all the time",                 aggression: 1.0,  bluff: 0.3,  callSlack: 0.04,  entry: 0.55, stubborn: 0.05, barrel: 0.75,
             avatars: ["Fox", "Cowboy", "Cool guy", "Cool girl", "Candy"] },
  station: { label: "Calling station", note: "calls almost anything and rarely raises",       aggression: 0.12, bluff: 0.01, callSlack: 0.22,  entry: 0.45, stubborn: 0.25, barrel: 0.1,
             avatars: ["Snowman", "Cat", "Kenji", "Mei"] },
  shark:   { label: "Shark",           note: "solid and hard to read",                          aggression: 0.8,  bluff: 0.09, callSlack: -0.01, entry: 0.95, stubborn: 0,    barrel: 0.55,
             avatars: ["The Dealer", "Trooper", "Grim Reaper", "Robot"] }
};
export const STYLE_KEYS = Object.keys(STYLES);

function roundTo(amount, unit) { return Math.max(unit, Math.round(amount / unit) * unit); }

// Returns an engine action for the bot in `seat`.
export function decide(table, seat, skill = "normal", style = null) {
  const base = SKILL[skill] || SKILL.normal, st = STYLES[style];
  // skill sets how carefully the bot reads its hand; a personality sets how it likes to play
  const cfg = st ? { ...base, aggression: st.aggression, bluff: st.bluff, callSlack: st.callSlack + (base.callSlack - SKILL.normal.callSlack) } : base;
  const entry = st ? st.entry : 0.8, stubborn = st ? st.stubborn : 0, barrel = st ? st.barrel : 0.4;
  const h = table.hand, me = h.players[seat], legal = legalActions(table, seat), game = table.game || "holdem";
  // Five Card Draw: the draw itself. Good players swap sensibly; easy bots sometimes keep a card too many.
  if (legal.draw) {
    let discard = drawChoice(me.hole);
    if (skill === "easy" && discard.length > 1 && rnd() < 0.3) discard = discard.slice(1);
    return { type: "draw", discard };
  }
  const opponents = h.players.filter((p, i) => p && i !== seat && !p.folded).length;
  const pot = h.players.reduce((s, p) => s + (p ? p.committed : 0), 0);
  const toCall = legal.call;
  const potOdds = toCall / (pot + toCall || 1);
  let eq = equity(me.hole, h.board, Math.max(1, opponents), game === "holdem" ? cfg.iters : Math.round(cfg.iters * 0.6), game, h.street);
  eq = Math.min(1, Math.max(0, eq + (rnd() * 2 - 1) * cfg.noise));
  // What a hand "should" win against this many opponents, so thresholds scale with table size.
  const fair = 1 / (opponents + 1);
  const strength = eq / fair; // 1 = average, 2 = twice the fair share

  const unit = legal.raise ? legal.raise.step : 1; // bets go up in the table's steps
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
    if (legal.raise && ((strength > 1.4 && rnd() < 0.45 + barrel * 0.6) || rnd() < cfg.bluff)) return raiseTo(0.4 + rnd() * (0.3 + cfg.aggression * 0.4));
    return { type: "check" };
  }
  // Before the flop, picky players fold hands below their standard.
  if ((h.street === "preflop" || h.street === "first") && strength < entry && toCall > table.bb && rnd() > stubborn) return { type: "fold" };
  // Facing a bet: call when the price is right, raise sometimes, otherwise fold.
  if (eq + cfg.callSlack + stubborn * (h.street === "river" ? 0.5 : 1) >= potOdds) {
    if (legal.raise && strength > 1.6 && rnd() < cfg.aggression * 0.5) return raiseTo(0.6 + rnd() * 0.5);
    if (legal.raise && rnd() < cfg.bluff * 0.4) return raiseTo(0.8 + rnd() * 0.6); // maniacs re-raise light
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
