// Live odds for your own hand. Uses only what you can see: your two cards, the board, and how many
// players are still in. Their cards are unknown, so they're treated as random hands.
import { evaluate, newDeck, CATEGORY } from "../supabase/functions/_shared/poker-engine.js";

const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;

// Simulates the rest of the hand many times.
//  win:  share of runouts you win outright, tie: share you split, cats: chance of ending on each hand category.
export function handOdds(hole, board, opponents, iterations = 5000) {
  const seen = new Set([...hole, ...board]);
  const rest = newDeck().filter(c => !seen.has(c));
  const toCome = 5 - board.length, need = opponents * 2 + toCome;
  const cats = Array(CATEGORY.length).fill(0);
  let win = 0, tie = 0;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rnd() * (rest.length - i));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const full = toCome ? board.concat(rest.slice(0, toCome)) : board;
    const mine = evaluate(hole.concat(full));
    cats[mine.cat]++;
    if (!opponents) continue;
    let best = 0;
    for (let o = 0; o < opponents && best <= mine.score; o++) {
      const s = evaluate([rest[toCome + o * 2], rest[toCome + o * 2 + 1], ...full]).score;
      if (s > best) best = s;
    }
    if (mine.score > best) win++;
    else if (mine.score === best) tie++;
  }
  return { win: win / iterations, tie: tie / iterations, cats: cats.map(c => c / iterations), iterations };
}
