// Live odds for your own hand, for Hold'em, Omaha and Five Card Draw. Uses only what you can see: your cards,
// the board, and how many players are still in. Their cards are unknown, so they're treated as random hands.
import { evaluate, evaluateFor, newDeck, CATEGORY, GAMES } from "../supabase/functions/_shared/poker-engine.js";

const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
export const STRONG_FROM = 3; // three of a kind
const RANKS = "23456789TJQKA";
const rv = c => RANKS.indexOf(c[0]) + 2;

// Five Card Draw: a sensible swap for a hand (used for bots, for random opponents, and as a suggestion).
// Keep made hands; draw to four-card flushes and straights; otherwise keep pairs or the best high cards.
export function drawChoice(hole) {
  const e = evaluate(hole);
  if (e.cat >= 4) return [];                                         // straight or better: stand pat
  const count = {};
  for (const c of hole) count[c[0]] = (count[c[0]] || 0) + 1;
  if (e.cat === 3) return hole.filter(c => count[c[0]] !== 3);      // trips: swap the other two
  if (e.cat === 2) return hole.filter(c => count[c[0]] === 1);      // two pair: swap the odd card
  const bySuit = {};
  for (const c of hole) (bySuit[c[1]] = bySuit[c[1]] || []).push(c);
  const four = Object.values(bySuit).find(g => g.length === 4);
  if (four) return hole.filter(c => !four.includes(c));             // four to a flush
  if (e.cat === 1) return hole.filter(c => count[c[0]] !== 2);      // a pair: swap the other three
  // four in a row (open-ended straight draw)
  const sorted = hole.slice().sort((a, b) => rv(a) - rv(b));
  for (let skip = 0; skip < 5; skip++) {
    const rest = sorted.filter((_, i) => i !== skip);
    if (rest.every((c, i) => i === 0 || rv(c) === rv(rest[i - 1]) + 1)) return [sorted[skip]];
  }
  const high = hole.slice().sort((a, b) => rv(b) - rv(a));
  if (high[0][0] === "A") return high.slice(1);                     // keep the ace, swap four
  return high.slice(2);                                              // keep the two best, swap three
}

// Plays out the rest of the hand many times.
//  game: holdem | omaha | draw.  discard (draw only): the cards you plan to swap; null once you've drawn.
//  oppDraw (draw only): whether the other players still get to draw.
// Returns win (share you win outright), tie (share you split), cats (chance of ending on each hand),
// strong (chance of three of a kind or better at the end), nextStrong (after just the next cards; board games only).
export function simulate({ game = "holdem", hole, board = [], opponents, iterations = 3000, discard = null, oppDraw = false }) {
  const holeN = (GAMES[game] || GAMES.holdem).hole, isDraw = game === "draw";
  const seen = new Set([...hole, ...board]);
  const rest = newDeck().filter(c => !seen.has(c));
  const toCome = isDraw ? 0 : 5 - board.length, next = board.length ? 1 : 3;
  const myDraw = isDraw && discard ? discard.length : 0;
  const oppDrawMax = isDraw && oppDraw ? 4 : 0;
  const need = toCome + myDraw + opponents * (holeN + oppDrawMax);
  const kept = isDraw && discard ? hole.filter(c => !discard.includes(c)) : hole;
  const cats = Array(CATEGORY.length).fill(0);
  let win = 0, tie = 0, nextStrong = 0;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < Math.min(need, rest.length); i++) {
      const j = i + Math.floor(rnd() * (rest.length - i));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    let k = 0;
    const take = n => { const out = rest.slice(k, k + n); k += n; return out; };
    const full = toCome ? board.concat(take(toCome)) : board;
    const myHand = isDraw ? kept.concat(take(myDraw)) : hole;
    const mine = evaluateFor(game, myHand, full);
    cats[mine.cat]++;
    if (toCome && evaluateFor(game, hole, board.concat(full.slice(board.length, board.length + next))).cat >= STRONG_FROM) nextStrong++;
    if (!opponents) continue;
    let best = 0;
    for (let o = 0; o < opponents && best <= mine.score; o++) {
      let opp = take(holeN);
      if (oppDrawMax) { const d = drawChoice(opp); opp = opp.filter(c => !d.includes(c)).concat(take(d.length)); }
      const sc = evaluateFor(game, opp, full).score;
      if (sc > best) best = sc;
    }
    if (mine.score > best) win++;
    else if (mine.score === best) tie++;
  }
  const share = cats.map(c => c / iterations);
  return {
    win: win / iterations, tie: tie / iterations, cats: share, iterations,
    strong: share.slice(STRONG_FROM).reduce((a, b) => a + b, 0),
    nextStrong: toCome ? nextStrong / iterations : null
  };
}

// Hold'em-style call kept for the table screen: (hole, board, opponents, iterations, game, extra)
export function handOdds(hole, board, opponents, iterations = 5000, game = "holdem", extra = {}) {
  return simulate({ game, hole, board, opponents, iterations, ...extra });
}
