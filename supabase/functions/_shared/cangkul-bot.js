// Cangkul bots: shared by the browser (bots mode, hints) and the server (bot seats online).
// They only look at their own cards, the table, how many cards everyone holds, how deep the stock is,
// and what everybody has seen happen so far (the log).
import { legal, rankOf, byRank, RANKS } from "./cangkul-engine.js";

// What a careful player remembers from the log:
//   gone: cards in the discard pile; table: cards in the current trick;
//   known[seat]: cards a player picked up off the table and hasn't played since;
//   out[seat][suit]: the player showed they hold none of that suit (they had to dig or skip) and
//   hasn't picked up cards since that could change it.
export function remember(g) {
  const gone = new Set(), known = g.hands.map(() => new Set()), out = g.hands.map(() => ({}));
  let table = [];
  for (const e of g.log) {
    if (e.type === "play") { table.push(e.card); known[e.seat].delete(e.card); }
    else if (e.type === "draw") out[e.seat] = { [e.suit]: true };       // the cards dug up could be anything else
    else if (e.type === "skip") out[e.seat][e.suit] = true;
    else if (e.type === "take") { e.cards.forEach(c => known[e.seat].add(c)); out[e.seat][e.suit] = false; table = []; }
    else if (e.type === "trick") { table.forEach(c => gone.add(c)); table = []; }
  }
  return { gone, known, out, table };
}

// Is this card the highest of its suit still around (nobody else can beat it)?
function isBoss(card, hand, mem) {
  for (let r = rankOf(card) + 1; r < RANKS.length; r++) {
    const c = RANKS[r] + card[1];
    if (!mem.gone.has(c) && !hand.includes(c)) return false;
  }
  return true;
}

function leadCard(g, seat, hand, skill) {
  const bySuit = {};
  for (const c of hand) (bySuit[c[1]] = bySuit[c[1]] || []).push(c);
  for (const s in bySuit) bySuit[s].sort(byRank);
  const suits = Object.keys(bySuit);
  const longest = suits.slice().sort((a, b) => bySuit[b].length - bySuit[a].length || rankOf(bySuit[a][0]) - rankOf(bySuit[b][0]))[0];
  if (skill !== "hard") return bySuit[longest][0];                      // shed the long suit, lowest card first

  const mem = remember(g), stock = g.stock.length;
  const others = g.hands.map((h, i) => i).filter(i => i !== seat && g.hands[i].length);
  const fewest = Math.min(...others.map(i => g.hands[i].length));
  let best = null;
  for (const s of suits) {
    const cards = bySuit[s], top = cards[cards.length - 1];
    const dry = others.filter(i => mem.out[i][s] && ![...mem.known[i]].some(c => c[1] === s));
    let score = cards.length * 2;                                       // long suits go first
    // a suit somebody is out of: they have to dig (the deeper the stock, the more it hurts), or pick up / skip
    for (const i of dry) score += (stock ? 10 + Math.min(stock, 12) : 8) * (g.hands[i].length === fewest ? 2 : 1);
    const boss = isBoss(top, hand, mem);
    if (boss) score += cards.length > 1 ? 6 : 3;                        // the lead comes straight back
    if (cards.length === 1 && stock && hand.length > 2) score -= 3;     // don't run yourself out of a suit
    // an opponent about to go out who is known to hold this suit: don't feed them
    for (const i of others) if (g.hands[i].length <= 2 && [...mem.known[i]].some(c => c[1] === s)) score -= 6;
    const everyoneDry = dry.length === others.length;
    const card = boss || (everyoneDry && stock) ? top : cards[0];
    if (!best || score > best.score) best = { score, card };
  }
  return best.card;
}

function followCard(g, seat, L, skill) {
  const cards = L.cards.slice().sort(byRank), low = cards[0], high = cards[cards.length - 1];
  const t = g.trick;
  const top = t.plays.length ? Math.max(...t.plays.map(p => rankOf(p.card))) : -1;
  const winners = cards.filter(c => rankOf(c) > top);
  if (skill !== "hard") return winners.length ? high : low;             // try to win the trick, otherwise shed low

  const mem = remember(g), hand = g.hands[seat];
  const after = t.pending.slice(1);
  const stuck = i => mem.out[i][t.suit] && ![...mem.known[i]].some(c => c[1] === t.suit) && !g.stock.length;
  if (!winners.length) return low;
  if (after.every(stuck)) return winners[0];                            // last to play: the cheapest card that wins
  // Is the lead worth a high card right now?
  const others = g.hands.map((h, i) => i).filter(i => i !== seat && g.hands[i].length);
  const holdsDrySuit = others.some(i => hand.some(c => c[1] !== t.suit && mem.out[i][c[1]]));
  const wantLead = hand.length <= 4 || holdsDrySuit || others.some(i => g.hands[i].length <= 2);
  if (isBoss(high, hand, mem) && wantLead) return high;
  if (wantLead && after.length === 1 && rankOf(high) >= 9) return high;
  return low;                                                           // keep the high cards for when the lead matters
}

// Returns { type: "play", card }, { type: "draw" } or { type: "giveup" } for the player whose turn it is.
export function cangkulMove(g, seat, skill = "normal") {
  const L = legal(g, seat);
  if (!L) return null;
  if (!L.cards.length) return { type: L.canDraw ? "draw" : "giveup" };
  if (L.cards.length === 1) return { type: "play", card: L.cards[0] };
  if (skill === "easy" && Math.random() < 0.5) return { type: "play", card: L.cards[Math.floor(Math.random() * L.cards.length)] };
  return { type: "play", card: L.leading ? leadCard(g, seat, g.hands[seat], skill) : followCard(g, seat, L, skill) };
}

export const SKILLS = ["easy", "normal", "hard"];
