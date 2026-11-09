// Capsa Banting (house rules), as a pure JSON-friendly engine shared by the browser and the server.
//
// 4 players, 13 cards each. Card order 3 4 5 6 7 8 9 10 J Q K A 2 (2 highest); suits ♦ < ♣ < ♥ < ♠.
// Plays: single, pair, three of a kind, and 5-card packages (straight < flush < full house < straight flush).
// Bombs: four of a kind (just the 4 cards) and straight flush. A bomb beats any package or a single 2, and a
// higher bomb beats a lower one. A bomb on a single 2 ends the game: the bomber wins, the bombed player loses.
// Straights: 2-3-4-5-6 is the lowest, J-Q-K-A-2 the highest; A-2-3-4-5 and wrap-arounds aren't straights.
// The first game starts with the 3♦ (any play containing it); later games start with the last winner.
// You can't finish on a single 2. Once you pass you're out until the round ends.
// Scoring: losers pay the winner 1 point per card left, each 2 counting 2; ×2 with 10–12 cards, ×3 with 13.
// Bombed on a 2: that player pays the bomber double; the others pay nothing.
//
// Loser mode (a host option): going out doesn't end the game. Players who finish leave the rotation and play
// goes on until one player is left holding cards. Places score +1 against every player you finish above
// (so 1st +3, 2nd +1, 3rd -1, last -3). A bomb on a single 2 still ends the game: players already out keep
// their places, the bomber takes the best open place, the rest go by fewest cards, the bombed player is last.
// If a player goes out and nobody beats their last play, the next player still holding cards leads.

export const ORDER = "3456789TJQKA2";
export const SUITS = "dchs"; // ♦ ♣ ♥ ♠, weakest to strongest
export const SEATS = 4;

export const rankOf = c => ORDER.indexOf(c[0]);         // 0 = 3 … 12 = 2
export const suitOf = c => SUITS.indexOf(c[1]);
export const valueOf = c => rankOf(c) * 4 + suitOf(c);   // every card has its own strength
export const byValue = (a, b) => valueOf(a) - valueOf(b);

export function newDeck() {
  const d = [];
  for (const r of ORDER) for (const s of SUITS) d.push(r + s);
  return d;
}

// Package strength, low to high; bombs are quads and straight flushes.
export const PACKAGES = ["straight", "flush", "fullhouse", "quads", "straightflush"];
export const NAMES = { single: "Single", pair: "Pair", triple: "Three of a kind", straight: "Straight", flush: "Flush", fullhouse: "Full house", quads: "Bomb: four of a kind", straightflush: "Bomb: straight flush" };
export const isBomb = c => c && (c.type === "quads" || c.type === "straightflush");
const isPackage = c => c && PACKAGES.includes(c.type);

// Straights by natural rank: 2-3-4-5-6 (lowest) up to 10-J-Q-K-A, plus J-Q-K-A-2 (highest).
const NATURAL = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
function straightInfo(cards) {
  const nat = cards.map(c => NATURAL[c[0]]).sort((a, b) => a - b);
  if (new Set(nat).size !== 5) return null;
  if (nat.join() === "2,11,12,13,14") {                   // J-Q-K-A-2: the top card is the 2
    return { seq: 9, top: cards.find(c => c[0] === "2") };
  }
  for (let i = 1; i < 5; i++) if (nat[i] !== nat[i - 1] + 1) return null;
  const topNat = nat[4];
  return { seq: nat[0] - 2, top: cards.find(c => NATURAL[c[0]] === topNat) }; // 2-6 is seq 0, 10-A is seq 8
}

// What a set of cards is, or null if it isn't a legal play. key: higher beats lower within the same type.
export function classify(cards) {
  const n = cards.length;
  if (!n || new Set(cards).size !== n) return null;
  const ranks = cards.map(rankOf), same = ranks.every(r => r === ranks[0]);
  const top = cards.slice().sort(byValue)[n - 1];
  if (n === 1) return { type: "single", size: 1, key: valueOf(cards[0]) };
  if (n === 2) return same ? { type: "pair", size: 2, key: valueOf(top) } : null;
  if (n === 3) return same ? { type: "triple", size: 3, key: ranks[0] } : null;
  if (n === 4) return same ? { type: "quads", size: 4, key: ranks[0] } : null;
  if (n !== 5) return null;
  const flush = cards.every(c => c[1] === cards[0][1]);
  const st = straightInfo(cards);
  if (st && flush) return { type: "straightflush", size: 5, key: st.seq * 4 + suitOf(st.top) };
  const count = {};
  ranks.forEach(r => count[r] = (count[r] || 0) + 1);
  const groups = Object.entries(count).sort((a, b) => b[1] - a[1]);
  if (groups[0][1] === 3 && groups[1][1] === 2) return { type: "fullhouse", size: 5, key: +groups[0][0] };
  if (flush) return { type: "flush", size: 5, key: valueOf(top) };
  if (st) return { type: "straight", size: 5, key: st.seq * 4 + suitOf(st.top) };
  return null;
}

// Does `play` beat `table` (the combination currently on the table)?
export function beats(play, table) {
  if (!table) return true;
  if (isBomb(play)) {
    if (table.type === "single" && table.key >= 12 * 4) return true;   // a bomb beats a single 2
    if (isPackage(table)) {
      const a = PACKAGES.indexOf(play.type), b = PACKAGES.indexOf(table.type);
      return a > b || (a === b && play.key > table.key);
    }
    return false;
  }
  if (isPackage(play)) {
    if (!isPackage(table) || isBomb(table)) return false;
    const a = PACKAGES.indexOf(play.type), b = PACKAGES.indexOf(table.type);
    return a > b || (a === b && play.key > table.key);
  }
  return play.type === table.type && play.key > table.key;
}

// ---------- a game ----------
// game = { no, hands: [[cards]...], turn, trick: { combo, cards, by } | null, passed: [bool], lead3d: bool,
//          log: [], finished: null | { winner, bombed?, points: [per seat], reason } }
const hasAllTwos = hand => hand.filter(c => c[0] === "2").length === 4;

// Deals a new game. shuffled() must return a freshly shuffled 52-card deck; it's called again if someone
// gets all four 2s. leader: the last winner, or -1 for the first game (the 3♦ starts).
export function startGame(no, shuffled, leader = -1, mode = "winner") {
  let hands;
  for (let tries = 0; tries < 50; tries++) {
    const deck = shuffled();
    hands = [0, 1, 2, 3].map(i => deck.slice(i * 13, i * 13 + 13).sort(byValue));
    if (!hands.some(hasAllTwos)) break;
  }
  const first = leader < 0;
  const turn = first ? hands.findIndex(h => h.includes("3d")) : leader;
  return { no, mode: mode === "loser" ? "loser" : "winner", out: [], hands, turn, trick: null, passed: [false, false, false, false], lead3d: first, log: [], finished: null };
}

const holding = (g, i) => g.hands[i].length > 0;
// the next player still in the round (holding cards, not passed), or `from` if there's nobody else
const nextSeat = (g, from) => {
  for (let k = 1; k < SEATS; k++) { const i = (from + k) % SEATS; if (!g.passed[i] && holding(g, i)) return i; }
  return from;
};
// the next player holding cards, whether or not they passed
const nextHolder = (g, from) => {
  for (let k = 1; k <= SEATS; k++) { const i = (from + k) % SEATS; if (holding(g, i)) return i; }
  return from;
};

// What the player whose turn it is may do.
export function legal(g, seat) {
  if (g.finished || g.turn !== seat) return null;
  const leading = !g.trick;
  const onlySingleTwo = g.hands[seat].length === 1 && g.hands[seat][0][0] === "2";
  return { leading, canPass: !leading || onlySingleTwo, mustInclude: g.lead3d ? "3d" : null, table: g.trick ? g.trick.combo : null };
}

// Every legal play from a hand against a table combo (null when leading), checked exhaustively: all 1-5 card
// subsets (at most 2,379 for 13 cards). mustInclude: "3d" on the game's first play.
export function legalPlays(hand, table = null, mustInclude = null) {
  const out = [], n = hand.length;
  const consider = cards => {
    if (mustInclude && !cards.includes(mustInclude)) return;
    const c = classify(cards);
    if (!c || (table && !beats(c, table))) return;
    if (cards.length === n && c.type === "single" && rankOf(cards[0]) === 12) return; // can't finish on a single 2
    out.push({ cards, combo: c });
  };
  const go = (start, chosen) => {
    if (chosen.length) consider(chosen);
    if (chosen.length === 5) return;
    for (let i = start; i < n; i++) go(i + 1, [...chosen, hand[i]]);
  };
  go(0, []);
  return out;
}

// Why a play isn't allowed, or "" if it is.
export function whyNot(g, seat, cards) {
  const L = legal(g, seat);
  if (!L) return "It's not your turn.";
  const hand = g.hands[seat];
  if (!cards.length) return "Pick some cards first.";
  if (!cards.every(c => hand.includes(c))) return "You can only play cards you hold.";
  const combo = classify(cards);
  if (!combo) return "That isn't a combination you can play.";
  if (L.mustInclude && !cards.includes(L.mustInclude)) return "The first play of the game has to include the 3♦.";
  if (L.table && !beats(combo, L.table)) {
    if (isBomb(combo)) return "A bomb only beats a package or a single 2.";
    if (combo.type !== L.table.type && !(isPackage(combo) && isPackage(L.table))) return `You have to play a ${NAMES[L.table.type].toLowerCase()} (or a bomb).`;
    return "That doesn't beat what's on the table.";
  }
  if (cards.length === hand.length && combo.type === "single" && rankOf(cards[0]) === 12) return "You can't finish the game with a single 2.";
  return "";
}

export function play(g, seat, cards) {
  const err = whyNot(g, seat, cards);
  if (err) throw new Error(err);
  const combo = classify(cards), prev = g.trick;
  g.hands[seat] = g.hands[seat].filter(c => !cards.includes(c));
  g.lead3d = false;
  g.log.push({ seat, type: "play", cards: cards.slice().sort(byValue), combo: combo.type });
  // a bomb on a single 2 ends the game at once
  if (prev && prev.combo.type === "single" && rankOf(prev.cards[0]) === 12 && isBomb(combo)) {
    g.trick = { combo, cards, by: seat };
    return g.mode === "loser" ? finishLoser(g, "bomb", seat, prev.by) : finish(g, seat, prev.by);
  }
  g.trick = { combo, cards, by: seat };
  if (!g.hands[seat].length) {
    if (g.mode !== "loser") return finish(g, seat, -1);
    g.out.push(seat);
    g.log.push({ seat, type: "out", place: g.out.length });
    if (g.hands.filter(h => h.length).length <= 1) return finishLoser(g, "out");
  }
  const next = nextSeat(g, seat);
  if (next === seat) newRound(g, holding(g, seat) ? seat : nextHolder(g, seat));
  else g.turn = next;
  return g;
}

export function pass(g, seat) {
  const L = legal(g, seat);
  if (!L) throw new Error("It's not your turn.");
  if (!L.canPass) throw new Error("You're leading: play anything you like.");
  g.log.push({ seat, type: "pass" });
  if (!g.trick) {                                  // a leader holding only a single 2 hands the lead on
    // if every player is down to a single 2, nobody can ever finish: the game ends and nobody pays
    if (g.hands.every(h => !h.length || (h.length === 1 && h[0][0] === "2"))) return g.mode === "loser" ? finishLoser(g, "stuck") : finish(g, -1, -1);
    g.turn = nextHolder(g, seat);
    return g;
  }
  g.passed[seat] = true;
  const by = g.trick.by, live = [0, 1, 2, 3].filter(i => !g.passed[i] && holding(g, i) && i !== by);
  if (!live.length) newRound(g, holding(g, by) ? by : nextHolder(g, by)); // everyone else passed
  else g.turn = nextSeat(g, seat);
  return g;
}

// Everyone else passed: the last player to play starts a new round with anything.
function newRound(g, leader) {
  g.trick = null;
  g.passed = [false, false, false, false];
  g.turn = leader;
  g.log.push({ seat: leader, type: "round" });
}

// Points a player pays for the cards left in hand.
export function penalty(hand) {
  const cards = hand.length, twos = hand.filter(c => c[0] === "2").length;
  const mult = cards === 13 ? 3 : cards >= 10 ? 2 : 1;
  return (cards + twos) * mult;
}

function finish(g, winner, bombed) {
  const points = [0, 0, 0, 0];
  if (winner < 0) {
    g.finished = { winner: -1, bombed: null, points, reason: "stuck", left: g.hands.map(h => h.slice()) };
    g.turn = -1;
    g.log.push({ seat: -1, type: "stuck" });
    return g;
  }
  if (bombed >= 0) {
    const owe = penalty(g.hands[bombed]) * 2;
    points[bombed] -= owe; points[winner] += owe;
  } else {
    for (let i = 0; i < SEATS; i++) if (i !== winner) { const p = penalty(g.hands[i]); points[i] -= p; points[winner] += p; }
  }
  g.finished = { winner, bombed: bombed >= 0 ? bombed : null, points, reason: bombed >= 0 ? "bomb" : "out", left: g.hands.map(h => h.slice()) };
  g.turn = -1;
  g.log.push({ seat: winner, type: bombed >= 0 ? "bomb win" : "win" });
  return g;
}

// Loser mode's end. place[seat] is 0 for 1st … 3 for last; players stuck together share a place.
// Points: +1 from every player you finish above.
function finishLoser(g, reason, bomber = -1, bombed = -1) {
  const place = [0, 0, 0, 0];
  g.out.forEach((s, i) => place[s] = i);
  let rest = [0, 1, 2, 3].filter(i => !g.out.includes(i));
  let next = g.out.length;
  if (reason === "bomb") {
    if (!g.out.includes(bomber)) { place[bomber] = next++; rest = rest.filter(i => i !== bomber); }
    rest = rest.filter(i => i !== bombed);
    const fromBomber = i => (i - bomber + SEATS) % SEATS;
    rest.sort((a, b) => g.hands[a].length - g.hands[b].length || penalty(g.hands[a]) - penalty(g.hands[b]) || fromBomber(a) - fromBomber(b));
    rest.forEach(i => place[i] = next++);
    place[bombed] = next;
  } else if (reason === "stuck") {
    rest.forEach(i => place[i] = next);        // nobody can finish: they share the place
  } else {
    rest.forEach(i => place[i] = next);        // the one player left holding cards
  }
  const points = place.map((p, i) => place.reduce((a, q, j) => a + (j === i ? 0 : q > p ? 1 : q < p ? -1 : 0), 0));
  const firsts = [0, 1, 2, 3].filter(i => place[i] === 0);
  const winner = firsts.length === 1 ? firsts[0] : -1;
  const lasts = [0, 1, 2, 3].filter(i => place[i] === Math.max(...place));
  const loser = lasts.length === 1 && Math.max(...place) > 0 ? lasts[0] : -1;
  g.finished = { mode: "loser", winner, loser, bombed: reason === "bomb" ? bombed : null, bomber: reason === "bomb" ? bomber : null, place, points, reason, left: g.hands.map(h => h.slice()) };
  g.turn = -1;
  g.log.push({ seat: reason === "stuck" ? -1 : loser, type: reason === "stuck" ? "stuck" : reason === "bomb" ? "bomb lose" : "lose" });
  return g;
}

// A timed-out player: pass if allowed, otherwise lead the lowest single (with the 3♦ if it's the first play).
export function autoMove(g) {
  const seat = g.turn, L = legal(g, seat);
  if (!L) return null;
  if (L.canPass) { pass(g, seat); return { seat, type: "pass" }; }
  const hand = g.hands[seat];
  // lead the lowest card, but play a 2 before it would be the last card left
  const card = L.mustInclude || (hand.length === 2 && hand[1][0] === "2" ? hand[1] : hand[0]);
  play(g, seat, [card]);
  return { seat, type: "play", cards: [card] };
}

// What one viewer may see: their own cards, everyone's card counts, the table and the log.
export function viewFor(g, seat) {
  if (!g) return null;
  return {
    no: g.no, mode: g.mode || "winner", out: g.out || [], turn: g.turn, trick: g.trick, passed: g.passed, lead3d: g.lead3d, log: g.log,
    counts: g.hands.map(h => h.length),
    hand: seat >= 0 ? g.hands[seat] : null,
    legal: seat >= 0 ? legal(g, seat) : null,
    finished: g.finished
  };
}
