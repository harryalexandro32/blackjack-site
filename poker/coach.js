// Coach mode (bots mode): looks at the decisions you made in a hand and writes one short note about the
// most important one. It only uses what you knew when you acted: your cards, the board, the bet, and how
// many players were still in. Opponents' cards are treated as unknown.
import { equity } from "./bot.js";

const pct = x => x > 0 && x < 0.01 ? "under 1%" : Math.round(x * 100) + "%";

// How big the bet you faced was, compared with the pot before it.
function betSize(toCall, pot) {
  const before = Math.max(1, pot - toCall), r = toCall / before;
  if (r < 0.4) return "a small bet";
  if (r < 0.6) return "a half-pot bet";
  if (r < 0.85) return "a two-thirds pot bet";
  if (r < 1.3) return "a pot-sized bet";
  return "a big overbet";
}

// Called just before you act. Returns what the coach needs to remember about the decision.
export function snapshot(table, seat, action) {
  const h = table.hand, legal = { call: Math.max(0, h.currentBet - h.players[seat].bet) };
  const pot = h.players.reduce((s, p) => s + (p ? p.committed : 0), 0);
  const opponents = h.players.filter((p, i) => p && i !== seat && !p.folded).length;
  const toCall = Math.min(legal.call, table.seats[seat].stack);
  return {
    street: h.street, type: action.type, opponents, toCall, pot,
    eq: equity(h.players[seat].hole, h.board, Math.max(1, opponents), 1500),
    need: toCall / (pot + toCall || 1), size: toCall ? betSize(toCall, pot) : ""
  };
}

const STREET = { preflop: "before the flop", flop: "on the flop", turn: "on the turn", river: "on the river" };

// One note for the hand: the costliest mistake if there was one, otherwise the decision that mattered most.
export function noteFor(decisions) {
  if (!decisions.length) return null;
  const notes = decisions.map(d => {
    const when = STREET[d.street], eq = pct(d.eq), need = pct(d.need);
    if (d.type === "fold" && d.toCall > 0) {
      const gap = d.eq - d.need;
      return gap > 0.07
        ? { score: gap, text: `Folding ${when} was a bit tight: you had ${eq} to win and only needed ${need} to call ${d.size}.` }
        : { score: 0.01, good: true, text: `Folding ${when} was right: you had ${eq} to win against ${d.size}, and needed ${need}.` };
    }
    if (d.type === "call") {
      const gap = d.need - d.eq;
      return gap > 0.07
        ? { score: gap, text: `Calling ${when} cost you: you had ${eq} to win but needed ${need} against ${d.size}.` }
        : { score: 0.02, good: true, text: `Good call ${when}: you had ${eq} to win and the price only needed ${need}.` };
    }
    if (d.type === "check" && d.eq > 0.7)
      return { score: (d.eq - 0.7) * 0.5, text: `You checked ${when} with ${eq} to win. A bet would usually get more chips in.` };
    if (d.type === "raise" && d.eq < 0.2)
      return { score: 0.03, text: `That bet ${when} was a bluff with ${eq} to win. It can work, but it's risky against ${d.opponents} player${d.opponents === 1 ? "" : "s"}.` };
    if (d.type === "raise" && d.eq > 0.6)
      return { score: 0.015, good: true, text: `Nice value bet ${when}: you had ${eq} to win.` };
    return { score: 0, good: true, text: `${d.type === "check" ? "Checking" : d.type === "raise" ? "Betting" : "Your play"} ${when} with ${eq} to win was reasonable.` };
  });
  const mistakes = notes.filter(n => !n.good).sort((a, b) => b.score - a.score);
  if (mistakes.length) return mistakes[0].text;
  // nothing went wrong: talk about the biggest decision you faced
  return notes.slice().sort((a, b) => b.score - a.score)[0].text;
}
