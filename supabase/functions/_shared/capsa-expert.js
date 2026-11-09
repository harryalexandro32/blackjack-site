// The "expert" Capsa Banting bot. It plans its whole hand instead of just the next play:
//  - splits the hand into the fewest plays (trying every way to build one or two 5-card packages),
//  - remembers every card played so far, so it knows which of its plays nobody can beat any more ("bosses"),
//  - leads its weakest plays first and keeps bosses (2s, aces, bombs) to win the lead back,
//  - when only one weak play is left, cashes its bosses and goes out,
//  - only beats the table when that leaves its hand in better shape than passing, unless someone is about to go out.
// Like the other bots it only sees its own cards, the cards already played, and how many cards everyone has.
import { classify, isBomb, rankOf, valueOf, byValue, legal, legalPlays, newDeck } from "./capsa-engine.js";

const PACKAGES = ["pairs2s", "straight", "flush", "fullhouse", "quads", "straightflush"];

// What this player knows: cards nobody has played yet (not counting its own) and how many cards the others hold.
function knowledge(g, seat) {
  const played = new Set();
  for (const e of g.log || []) if (e.type === "play") e.cards.forEach(c => played.add(c));
  const mine = new Set(g.hands[seat]);
  const unseen = newDeck().filter(c => !played.has(c) && !mine.has(c));
  const others = g.hands.map((h, i) => i === seat ? 0 : h.length);
  const byRank = {};
  for (const c of unseen) (byRank[rankOf(c)] = byRank[rankOf(c)] || []).push(c);
  for (const cs of Object.values(byRank)) cs.sort(byValue);
  return { unseen, byRank, others, maxOther: Math.max(...others) };
}

// Can anyone still beat this play? Exact for singles, pairs and triples; packages are judged on what's possible.
function isBoss(play, K) {
  const { combo } = play, size = play.cards.length;
  if (K.maxOther < size) return true;                       // nobody has enough cards to answer it
  const u = K.unseen, byRank = K.byRank;
  const bombPossible = minRank => Object.entries(byRank).some(([r, cs]) => cs.length === 4 && +r > minRank);
  switch (combo.type) {
    case "single": {
      if (u.some(c => valueOf(c) > combo.key)) return false;
      return true;                                          // a bomb on a single 2 is handled where it matters
    }
    case "pair":
      return !Object.values(byRank).some(cs => cs.length >= 2 && valueOf(cs[cs.length - 1]) > combo.key);
    case "triple":
      return !Object.entries(byRank).some(([r, cs]) => cs.length >= 3 && +r > combo.key);
    case "pairs2": case "pairs2s": {   // a higher neighbouring pair of pairs still out there?
      const ranks = Object.keys(byRank).map(Number);
      return !ranks.some(r => byRank[r].length >= 2 && byRank[r - 1] && byRank[r - 1].length >= 2 && Math.max(...byRank[r].map(valueOf)) > combo.key) && (combo.type === "pairs2" || !bombPossible(-1));
    }
    case "straightflush": return true;
    case "quads": return !bombPossible(combo.key);
    case "fullhouse":
      return !Object.entries(byRank).some(([r, cs]) => cs.length >= 3 && +r > combo.key) && !bombPossible(-1);
    default: return false;                                  // straights and flushes can nearly always be topped
  }
}

// Split a hand into plays: up to two 5-card packages, then the rest by rank (quads, triples, pairs, singles).
// Lower score is better: fewer plays, and above all fewer plays that someone can beat.
function bestSplit(hand, K, cache, dp = "off") {
  const key = hand.slice().sort(byValue).join("");
  if (cache.has(key)) return cache.get(key);
  const packs = legalPlays(hand, null, null, dp).filter(p => p.cards.length === 5 || p.combo.type === "pairs2");
  const options = [[]];
  for (let i = 0; i < packs.length; i++) {
    options.push([packs[i]]);
    for (let j = i + 1; j < packs.length; j++) if (!packs[j].cards.some(c => packs[i].cards.includes(c))) options.push([packs[i], packs[j]]);
  }
  let best = null;
  for (const opt of options) {
    const used = new Set(opt.flatMap(p => p.cards));
    const groups = {};
    for (const c of hand) if (!used.has(c)) (groups[rankOf(c)] = groups[rankOf(c)] || []).push(c);
    const plays = [...opt];
    for (const cs of Object.values(groups)) {
      cs.sort(byValue);
      plays.push({ cards: cs, combo: classify(cs) });
    }
    const s = scoreSplit(plays, hand, K);
    if (!best || s < best.score) best = { plays, score: s };
  }
  cache.set(key, best);
  return best;
}

function scoreSplit(plays, hand, K) {
  let losers = 0, bosses = 0, s = 0;
  for (const p of plays) {
    if (isBoss(p, K)) { bosses++; p.boss = true; } else { losers++; p.boss = false; }
    // a weak single is the hardest thing to get rid of; a high one almost controls a round
    if (p.combo.type === "single" && !p.boss) s += 2 + (8 - Math.min(8, Math.floor(rankOf(p.cards[0]) * 0.75))) * 0.4;
  }
  s += losers * 10 + plays.length * 2 - bosses * 3;
  // you can't go out on a lone 2: a hand that would end on one is badly stuck
  if (plays.length === 1 && plays[0].cards.length === 1 && rankOf(plays[0].cards[0]) === 12) s += 30;
  return s;
}

const weakness = p => PACKAGES.includes(p.combo.type) ? p.combo.key / 40 : p.combo.type === "single" ? valueOf(p.cards[0]) / 52 : rankOf(p.cards[0]) / 13;

export function expertMove(g, seat) {
  const L = legal(g, seat);
  if (!L) return null;
  const hand = g.hands[seat];
  const K = knowledge(g, seat), cache = new Map();
  const options = legalPlays(hand, L.table, L.mustInclude, g.dp);
  if (!options.length) return { type: "pass" };
  const finisher = options.find(p => p.cards.length === hand.length);
  if (finisher) return { type: "play", cards: finisher.cards };
  // a bomb on a single 2 ends the game in the bomber's favour
  if (L.table && L.table.type === "single" && L.table.key >= 48) {
    const bomb = options.find(p => isBomb(p.combo));
    if (bomb) return { type: "play", cards: bomb.cards };
  }
  const danger = Math.min(...K.others.map((n, i) => i === seat || !n ? 99 : n));   // fewest cards anyone else holds
  const loser = g.mode === "loser";

  if (L.leading) {
    const split = bestSplit(hand, K, cache, g.dp);
    let pool = split.plays.filter(p => options.some(o => o.cards.length === p.cards.length && o.cards.every(c => p.cards.includes(c))));
    if (L.mustInclude) {                                              // first play: the 3♦ play that leaves the best hand
      const withIt = options.filter(o => o.cards.includes(L.mustInclude)).sort((a, b) => b.cards.length - a.cards.length).slice(0, 40);
      let pick = null, pickVal = Infinity;
      for (const o of withIt) { const v = bestSplit(hand.filter(c => !o.cards.includes(c)), K, cache, g.dp).score; if (v < pickVal) { pickVal = v; pick = o; } }
      return { type: "play", cards: pick.cards };
    }
    if (!pool.length) pool = options;
    const losers = pool.filter(p => !isBoss(p, K)), bosses = pool.filter(p => isBoss(p, K));
    // one weak play left (or none): take rounds with the bosses, then go out with the last play
    if (split.plays.filter(p => !p.boss).length <= 1 && bosses.length) {
      bosses.sort((a, b) => b.cards.length - a.cards.length);
      return { type: "play", cards: bosses[0].cards };
    }
    let lead = losers.length ? losers : pool;
    // don't hand an almost-out player an easy single (or pair) to finish on
    if (danger === 1) { const no1 = lead.filter(p => p.cards.length > 1); if (no1.length) lead = no1; }
    if (danger === 2) { const no2 = lead.filter(p => p.cards.length !== 2 && p.cards.length > 1); if (no2.length) lead = no2; }
    if (danger <= 2 && lead.every(p => p.cards.length === 1)) {      // forced to lead a single: lead the highest
      return { type: "play", cards: lead.slice().sort((a, b) => valueOf(b.cards[0]) - valueOf(a.cards[0]))[0].cards };
    }
    lead = lead.slice().sort((a, b) => b.cards.length - a.cards.length || weakness(a) - weakness(b));
    return { type: "play", cards: lead[0].cards };
  }

  // following: compare every answer with passing
  const now = bestSplit(hand, K, cache, g.dp);
  const tableBy = g.trick ? g.trick.by : -1;
  const threat = tableBy >= 0 ? g.hands[tableBy].length : 99;
  let passCost = 3;
  if (danger <= 2 || threat <= 3) passCost += loser ? 10 : 30;     // someone is about to go out: stop them
  else if (danger <= 4) passCost += loser ? 4 : 8;
  let best = { type: "pass" }, bestVal = now.score + passCost;
  for (const o of options) {
    const rest = hand.filter(c => !o.cards.includes(c));
    const after = bestSplit(rest, K, cache, g.dp);
    let val = after.score;
    const control = isBoss(o, K);
    const weakLeft = after.plays.filter(p => !p.boss).length;
    if (control) val -= weakLeft <= 2 ? 9 : 4;                        // winning the lead is worth more near the end
    const spendsTop = o.cards.some(c => rankOf(c) === 12) || isBomb(o.combo);
    if (spendsTop && hand.length > 7 && danger > 4) val += 12;         // keep 2s and bombs for later
    const whole = now.plays.some(p => p.cards.length === o.cards.length && o.cards.every(c => p.cards.includes(c)));
    if (!whole) val += 4;                                             // breaking up a pair, triple or package
    if (val < bestVal) { bestVal = val; best = { type: "play", cards: o.cards }; }
  }
  return best;
}
