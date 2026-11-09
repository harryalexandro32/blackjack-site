// Capsa Banting bots: shared by the browser (bots mode) and the server (empty seats online).
// They only look at their own cards, what's on the table, and how many cards everyone has left.
import { expertMove } from "./capsa-expert.js";
import { classify, whyNot, isBomb, rankOf, valueOf, byValue, legal } from "./capsa-engine.js";

const NATURAL = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
const SEQS = [[2, 3, 4, 5, 6], [3, 4, 5, 6, 7], [4, 5, 6, 7, 8], [5, 6, 7, 8, 9], [6, 7, 8, 9, 10], [7, 8, 9, 10, 11], [8, 9, 10, 11, 12], [9, 10, 11, 12, 13], [10, 11, 12, 13, 14], [11, 12, 13, 14, 2]];

function pick(list, k) {
  const out = [];
  const go = (start, chosen) => {
    if (chosen.length === k) return out.push(chosen);
    for (let i = start; i < list.length; i++) go(i + 1, [...chosen, list[i]]);
  };
  go(0, []);
  return out;
}

// Every sensible play from a hand (all singles, pairs, triples, bombs; a good spread of 5-card packages).
export function combos(hand) {
  const out = [], seen = new Set();
  const add = cards => {
    const key = cards.slice().sort(byValue).join(" ");
    if (seen.has(key)) return;
    const c = classify(cards);
    if (c) { seen.add(key); out.push({ cards: cards.slice().sort(byValue), combo: c }); }
  };
  const byRank = {};
  for (const c of hand) (byRank[c[0]] = byRank[c[0]] || []).push(c);
  for (const c of hand) add([c]);
  for (const g of Object.values(byRank)) {
    if (g.length >= 2) pick(g, 2).forEach(add);
    if (g.length >= 3) pick(g, 3).forEach(add);
    if (g.length === 4) add(g);
  }
  // full houses: each three of a kind with the cheapest pair of another rank
  const triples = Object.values(byRank).filter(g => g.length >= 3).map(g => g.slice(0, 3));
  const pairs = Object.values(byRank).filter(g => g.length >= 2).map(g => g.slice(0, 2));
  for (const t of triples) for (const p of pairs) if (p[0][0] !== t[0][0]) add([...t, ...p]);
  // straights: lowest cards for the bottom four, every suit choice for the top card
  for (const seq of SEQS) {
    const groups = seq.map(n => hand.filter(c => NATURAL[c[0]] === n));
    if (groups.some(g => !g.length)) continue;
    const top = groups[4];
    for (const t of top) add([...groups.slice(0, 4).map(g => g[0]), t]);
    // straight flushes in each suit
    for (const s of "dchs") {
      const sf = seq.map(n => hand.find(c => NATURAL[c[0]] === n && c[1] === s));
      if (sf.every(Boolean)) add(sf);
    }
  }
  // flushes: per suit, the lowest four under each possible top card
  for (const s of "dchs") {
    const suited = hand.filter(c => c[1] === s).sort(byValue);
    for (let top = 4; top < suited.length; top++) add([...suited.slice(0, 4), suited[top]]);
  }
  return out;
}

const isTwo = c => rankOf(c) === 12;

// How much a play "costs": playing 2s, bombs and high cards, or breaking up pairs and triples.
function cost(play, hand) {
  let c = play.cards.reduce((sum, card) => sum + valueOf(card), 0) / play.cards.length;
  c += play.cards.filter(isTwo).length * 30;
  if (isBomb(play.combo)) c += 60;
  // breaking a group of the same rank
  if (play.combo.type === "single" || play.combo.type === "pair") {
    const left = hand.filter(x => !play.cards.includes(x));
    for (const card of play.cards) if (left.some(x => x[0] === card[0])) c += 12;
  }
  return c - play.cards.length * 6; // getting rid of more cards is good
}

// Returns { type: "play", cards } or { type: "pass" } for the player whose turn it is.
export function capsaMove(g, seat, skill = "normal") {
  if (skill === "expert") return expertMove(g, seat);
  const L = legal(g, seat);
  if (!L) return null;
  const hand = g.hands[seat];
  const rnd = Math.random;
  const opponentsMin = Math.min(...g.hands.map((h, i) => i === seat || !h.length ? 99 : h.length));
  const options = combos(hand).filter(p => !whyNot(g, seat, p.cards));
  if (!options.length) return { type: "pass" };

  // a bomb on a single 2 wins the game on the spot
  if (L.table && L.table.type === "single" && L.table.key >= 48) {
    const bomb = options.find(p => isBomb(p.combo));
    if (bomb) return { type: "play", cards: bomb.cards };
  }
  // can finish right now?
  const finisher = options.find(p => p.cards.length === hand.length);
  if (finisher) return { type: "play", cards: finisher.cards };

  if (skill === "easy" && rnd() < 0.35) return { type: "play", cards: options[Math.floor(rnd() * options.length)].cards };

  if (L.leading) {
    // don't get stuck holding a lone 2: play it while there's another card left
    if (hand.length === 2 && hand.some(isTwo)) {
      const two = options.find(p => p.cards.length === 1 && isTwo(p.cards[0]));
      if (two) return { type: "play", cards: two.cards };
    }
    // lead low: a cheap package, then a low pair or triple, then the lowest single
    const lowPackages = options.filter(p => p.combo.size === 5 && !isBomb(p.combo) && !p.cards.some(isTwo) && Math.max(...p.cards.map(rankOf)) <= 9);
    const lowGroups = options.filter(p => (p.combo.type === "pair" || p.combo.type === "triple") && rankOf(p.cards[0]) <= 7);
    const pool = lowPackages.length ? lowPackages : lowGroups.length ? lowGroups : options.filter(p => p.combo.type === "single");
    const best = (pool.length ? pool : options).slice().sort((a, b) => cost(a, hand) - cost(b, hand))[0];
    return { type: "play", cards: best.cards };
  }

  // following: the cheapest play that beats the table, unless it's too precious to spend yet
  const sorted = options.slice().sort((a, b) => cost(a, hand) - cost(b, hand));
  const best = sorted[0];
  const precious = best.cards.some(isTwo) || isBomb(best.combo);
  const danger = opponentsMin <= 3 || hand.length <= 4;
  if (precious && !danger && L.canPass && rnd() < (skill === "hard" ? 0.75 : 0.55)) return { type: "pass" };
  if (!precious && skill !== "easy" && rankOf(best.cards[best.cards.length - 1]) >= 11 && !danger && L.canPass && rnd() < 0.3) return { type: "pass" };
  return { type: "play", cards: best.cards };
}
