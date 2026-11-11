// Cangkul (Cangkulan), as a pure JSON-friendly engine shared by the browser and the server.
//
// One 52-card deck, 2 to 4 players, 7 cards each (or 5); the rest is the face-down stock. Aces are high.
// The leader plays any card. Going clockwise, everyone else must play a card of that suit.
// No card of the suit? You "cangkul" (dig): draw from the stock one card at a time, keeping every card,
// until you draw the suit, which is played at once. You can't draw while you can follow suit.
// Stock empty and still nothing to play (a table option):
//   "take": you pick up every card played in this trick so far and your turn is skipped.
//   "pass": you just skip.
// The trick goes on with whoever is left. The highest card on the table wins it and its player leads next;
// if no card is left on the table (everything was picked up), the leader leads again.
// A player who plays their last card is out and safe. If the trick's winner is out, the next player
// clockwise still holding cards leads.
//
// Winner mode: the game ends at the end of the trick in which somebody ran out of cards. The first player
// out wins; everyone else pays them 1 point per card left.
// Loser mode: play goes on until one player is left holding cards. Places score +1 against every player you
// finish above (4 players: +3 +1 -1 -3; 3 players: +2 0 -2; 2 players: +1 -1).
//
// A table can have empty seats: only the seats in g.in were dealt in.

export const RANKS = "23456789TJQKA";
export const SUITS = "shcd";            // the order cards are kept in a hand (colours alternate)
export const SUIT_NAMES = { s: "spades", h: "hearts", c: "clubs", d: "diamonds" };
export const SUIT_ONE = { s: "spade", h: "heart", c: "club", d: "diamond" };
export const MAX_SEATS = 4;

export const rankOf = c => RANKS.indexOf(c[0]);         // 0 = 2 … 12 = A
export const suitOf = c => SUITS.indexOf(c[1]);
export const bySuit = (a, b) => suitOf(a) - suitOf(b) || rankOf(a) - rankOf(b);
export const byRank = (a, b) => rankOf(a) - rankOf(b) || suitOf(a) - suitOf(b);

export function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return d;
}

// ---------- a game ----------
// game = { no, seats, in: [seat], mode, emptyStock, handSize, hands: [[cards]...], stock: [cards] (top = end),
//          discard: [cards], turn, trick: { suit, lead, plays: [{ seat, card, drawn? }], pending: [seat] } | null,
//          last: the trick just finished | null, out: [seat, in the order they went out], log: [], step,
//          finished: null | { mode, winner, loser?, place?, points: [per seat], reason, left } }

// Deals a new game from a freshly shuffled 52-card deck.
// opts: { seats (table size), players (the seats dealt in; default all), handSize 5|7, mode, emptyStock, leader }
// leader: last game's winner, or -1 (or a seat that isn't playing) for a random one.
export function startGame(no, deck, opts = {}) {
  const seats = Math.min(MAX_SEATS, Math.max(2, opts.seats || MAX_SEATS));
  const players = (opts.players || Array.from({ length: seats }, (_, i) => i)).filter(i => i >= 0 && i < seats).sort((a, b) => a - b);
  if (players.length < 2) throw new Error("Cangkul needs at least 2 players.");
  const handSize = opts.handSize === 5 ? 5 : 7;
  const hands = Array.from({ length: seats }, () => []);
  players.forEach((seat, k) => hands[seat] = deck.slice(k * handSize, (k + 1) * handSize).sort(bySuit));
  const stock = deck.slice(players.length * handSize);
  // no leader given: wherever the ace of spades landed in the shuffle picks one
  const leader = players.includes(opts.leader) ? opts.leader : players[Math.max(0, deck.indexOf("As")) % players.length];
  return {
    no, seats, in: players, mode: opts.mode === "loser" ? "loser" : "winner", emptyStock: opts.emptyStock === "pass" ? "pass" : "take", handSize,
    hands, stock, discard: [], turn: leader, trick: null, last: null, out: [], log: [], step: 0, finished: null
  };
}

const holding = (g, i) => g.hands[i].length > 0;
const holders = g => g.in.filter(i => holding(g, i));
// the next player clockwise still holding cards
const nextHolder = (g, from) => {
  for (let k = 1; k <= g.seats; k++) { const i = (from + k) % g.seats; if (holding(g, i)) return i; }
  return from;
};

// What the player whose turn it is may do.
// cards: what they may play; canDraw: they must cangkul; giveUp: "take" or "pass" when the stock is empty too.
export function legal(g, seat) {
  if (g.finished || g.turn !== seat) return null;
  const hand = g.hands[seat];
  if (!g.trick) return { leading: true, suit: null, cards: hand.slice(), canDraw: false, giveUp: null };
  const suit = g.trick.suit, cards = hand.filter(c => c[1] === suit);
  return { leading: false, suit, cards, canDraw: !cards.length && g.stock.length > 0, giveUp: !cards.length && !g.stock.length ? g.emptyStock : null };
}

// Why a card can't be played, or "" if it can.
export function whyNot(g, seat, card) {
  const L = legal(g, seat);
  if (!L) return "It's not your turn.";
  if (!g.hands[seat].includes(card)) return "You can only play a card you hold.";
  if (L.leading || card[1] === L.suit) return "";
  if (L.cards.length) return `You have to follow suit: play a ${SUIT_ONE[L.suit]}.`;
  if (L.canDraw) return `You have no ${SUIT_NAMES[L.suit]}: cangkul from the stock.`;
  return L.giveUp === "take" ? `You have no ${SUIT_NAMES[L.suit]} and the stock is empty: pick up the cards.` : `You have no ${SUIT_NAMES[L.suit]} and the stock is empty: skip this trick.`;
}

export function play(g, seat, card) {
  const err = whyNot(g, seat, card);
  if (err) throw new Error(err);
  g.step += 1;
  return putDown(g, seat, card, false);
}

function putDown(g, seat, card, drawn) {
  g.hands[seat] = g.hands[seat].filter(c => c !== card);
  if (!g.trick) {
    const pending = [];
    for (let k = 1; k < g.seats; k++) { const i = (seat + k) % g.seats; if (holding(g, i)) pending.push(i); }
    g.trick = { suit: card[1], lead: seat, plays: [], pending };
    g.last = null;
  } else g.trick.pending.shift();
  g.trick.plays.push(drawn ? { seat, card, drawn: true } : { seat, card });
  g.log.push(drawn ? { seat, type: "play", card, drawn: true } : { seat, type: "play", card });
  if (!g.hands[seat].length) {
    g.out.push(seat);
    g.log.push({ seat, type: "out", place: g.out.length });
    if (g.mode === "loser" && holders(g).length <= 1) return finishLoser(g);
  }
  return advance(g);
}

// One card off the stock. If it's the suit that was led it's played at once; otherwise it stays in the hand.
// Returns { card, played }.
export function draw(g, seat) {
  const L = legal(g, seat);
  if (!L) throw new Error("It's not your turn.");
  if (!L.canDraw) throw new Error(L.leading ? "You're leading: play any card." : L.cards.length ? "You can follow suit, so you can't draw." : "The stock is empty.");
  const card = g.stock.pop();
  g.step += 1;
  const prev = g.log[g.log.length - 1];
  if (prev && prev.type === "draw" && prev.seat === seat) prev.n += 1;
  else g.log.push({ seat, type: "draw", n: 1, suit: L.suit });
  if (card[1] === L.suit) { putDown(g, seat, card, true); return { card, played: true }; }
  g.hands[seat] = [...g.hands[seat], card].sort(bySuit);
  return { card, played: false };
}

// Stock empty and nothing to play: pick up the trick so far ("take") or skip ("pass"), as the table plays it.
export function giveUp(g, seat) {
  const L = legal(g, seat);
  if (!L) throw new Error("It's not your turn.");
  if (!L.giveUp) throw new Error(L.leading ? "You're leading: play any card." : L.cards.length ? "You can follow suit." : "Cangkul from the stock first.");
  g.step += 1;
  const t = g.trick;
  if (L.giveUp === "take" && t.plays.length) {
    const cards = t.plays.map(p => p.card);
    g.hands[seat] = [...g.hands[seat], ...cards].sort(bySuit);
    t.plays = [];
    g.log.push({ seat, type: "take", cards, suit: t.suit });
  } else g.log.push({ seat, type: "skip", suit: t.suit });
  t.pending.shift();
  return advance(g);
}

function advance(g) {
  if (g.trick.pending.length) { g.turn = g.trick.pending[0]; return g; }
  return endTrick(g);
}

// Everyone has had their turn: the highest card wins; with no card left on the table the leader keeps the lead.
function endTrick(g) {
  const t = g.trick;
  let winner = t.lead;
  if (t.plays.length) winner = t.plays.reduce((a, b) => rankOf(b.card) > rankOf(a.card) ? b : a).seat;
  g.discard.push(...t.plays.map(p => p.card));
  g.last = { suit: t.suit, lead: t.lead, plays: t.plays, winner };
  g.trick = null;
  g.log.push({ seat: winner, type: "trick", n: t.plays.length });
  if (g.mode !== "loser" && g.out.length) return finishWinner(g);
  if (holders(g).length <= 1) return finishLoser(g);
  g.turn = holding(g, winner) ? winner : nextHolder(g, winner);
  return g;
}

function finishWinner(g) {
  const winner = g.out[0], points = g.hands.map(() => 0);
  for (const i of g.in) if (i !== winner) { points[i] -= g.hands[i].length; points[winner] += g.hands[i].length; }
  g.finished = { mode: "winner", winner, points, reason: "out", left: g.hands.map(h => h.slice()) };
  g.turn = -1;
  g.log.push({ seat: winner, type: "win" });
  return g;
}

// Loser mode's end. place[seat] is 0 for 1st …; -1 for a seat that wasn't dealt in.
// Points: +1 from every player you finish above.
function finishLoser(g) {
  const place = g.hands.map(() => -1);
  g.out.forEach((s, i) => place[s] = i);
  const rest = g.in.filter(i => !g.out.includes(i));
  rest.forEach(i => place[i] = g.out.length);
  const points = place.map((p, i) => p < 0 ? 0 : g.in.reduce((a, j) => a + (j === i ? 0 : place[j] > p ? 1 : place[j] < p ? -1 : 0), 0));
  const loser = rest.length ? rest[0] : g.out[g.out.length - 1];
  g.finished = { mode: "loser", winner: g.out[0], loser, place, points, reason: "last", left: g.hands.map(h => h.slice()) };
  g.turn = -1;
  g.log.push({ seat: loser, type: "lose" });
  return g;
}

// A timed-out player: follow with (or lead) their lowest card; with nothing to play, dig until something
// turns up, and pick up or skip if the stock runs dry.
export function autoMove(g) {
  const seat = g.turn, L = legal(g, seat);
  if (!L) return null;
  if (L.cards.length) {
    const card = L.cards.slice().sort(byRank)[0];
    play(g, seat, card);
    return { seat, type: "play", card };
  }
  let drawn = 0;
  while (!g.finished && g.turn === seat && legal(g, seat).canDraw) {
    const before = g.step;
    const r = draw(g, seat);
    drawn += 1;
    if (r.played || g.step === before) return { seat, type: "draw", n: drawn };
  }
  const now = legal(g, seat);
  if (now && now.giveUp) giveUp(g, seat);
  return { seat, type: drawn ? "draw" : "giveup", n: drawn };
}

// What one viewer may see: their own cards, everyone's card counts, the table, how deep the stock is, the log.
// Nobody sees the stock's order or another player's hand (until the game is over: f.left shows what was left).
export function viewFor(g, seat) {
  if (!g) return null;
  return {
    no: g.no, seats: g.seats, in: g.in, mode: g.mode, emptyStock: g.emptyStock, handSize: g.handSize, out: g.out, turn: g.turn,
    trick: g.trick, last: g.last, log: g.log, step: g.step,
    counts: g.hands.map(h => h.length), stock: g.stock.length, discard: g.discard.length,
    hand: seat >= 0 ? g.hands[seat] : null,
    legal: seat >= 0 ? legal(g, seat) : null,
    finished: g.finished
  };
}
