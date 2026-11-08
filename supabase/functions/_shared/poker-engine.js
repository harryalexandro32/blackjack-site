// No-limit Texas Hold'em engine. Pure and JSON-serializable: the whole table is a plain object,
// so the browser (AI mode) and the Supabase edge function (online mode) run the exact same rules.
// Chips are integers (the site uses cents). Cards are strings like "As", "Td", "2c".

export const RANKS = "23456789TJQKA";
export const SUITS = "shdc";

// ---------- deck ----------
export function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return d;
}

// Uniform integer in [0, n) from a cryptographic RNG, rejecting the uneven tail (no modulo bias).
export function randomInt(n, getRandomValues) {
  const limit = Math.floor(0x100000000 / n) * n, buf = new Uint32Array(1);
  do getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}

// Fisher-Yates.
export function shuffle(cards, getRandomValues) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, getRandomValues);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// ---------- hand evaluation ----------
const rv = c => RANKS.indexOf(c[0]) + 2;
const PLURAL = { 2: "Twos", 3: "Threes", 4: "Fours", 5: "Fives", 6: "Sixes", 7: "Sevens", 8: "Eights", 9: "Nines", 10: "Tens", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces" };
const SINGLE = { 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace" };
export const CATEGORY = ["High card", "Pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"];

// Highest straight in cards. Returns { high, cards } or null. The ace also plays low (5-4-3-2-A).
function findStraight(cards) {
  const byRank = {};
  for (const c of cards) if (!byRank[rv(c)]) byRank[rv(c)] = c;
  if (byRank[14]) byRank[1] = byRank[14];
  for (let high = 14; high >= 5; high--) {
    const run = [high, high - 1, high - 2, high - 3, high - 4];
    if (run.every(r => byRank[r])) return { high, cards: run.map(r => byRank[r]) };
  }
  return null;
}

function score(cat, ranks) {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 15 + (ranks[i] || 0);
  return s;
}

// Best 5-card hand from 5 to 7 cards. Higher score wins; equal scores split.
export function evaluate(cards) {
  const sorted = cards.slice().sort((a, b) => rv(b) - rv(a));
  const bySuit = {};
  for (const c of sorted) (bySuit[c[1]] = bySuit[c[1]] || []).push(c);
  const flush = Object.values(bySuit).find(s => s.length >= 5) || null;

  if (flush) {
    const sf = findStraight(flush);
    if (sf) return { score: score(8, [sf.high]), cat: 8, best: sf.cards, name: sf.high === 14 ? "Royal flush" : `Straight flush, ${SINGLE[sf.high]} high` };
  }

  const groups = {};
  for (const c of sorted) (groups[rv(c)] = groups[rv(c)] || []).push(c);
  const g = Object.entries(groups).map(([r, cs]) => ({ r: +r, cs })).sort((a, b) => b.cs.length - a.cs.length || b.r - a.r);
  const kickers = (exclude, n) => sorted.filter(c => !exclude.includes(rv(c))).slice(0, n);

  if (g[0].cs.length === 4) {
    const k = kickers([g[0].r], 1);
    return { score: score(7, [g[0].r, rv(k[0])]), cat: 7, best: [...g[0].cs, ...k], name: `Four of a kind, ${PLURAL[g[0].r]}` };
  }
  if (g[0].cs.length === 3) {
    const pair = g.slice(1).find(x => x.cs.length >= 2);
    if (pair) return { score: score(6, [g[0].r, pair.r]), cat: 6, best: [...g[0].cs, ...pair.cs.slice(0, 2)], name: `Full house, ${PLURAL[g[0].r]} full of ${PLURAL[pair.r]}` };
  }
  if (flush) {
    const f = flush.slice(0, 5);
    return { score: score(5, f.map(rv)), cat: 5, best: f, name: `Flush, ${SINGLE[rv(f[0])]} high` };
  }
  const st = findStraight(sorted);
  if (st) return { score: score(4, [st.high]), cat: 4, best: st.cards, name: `Straight, ${SINGLE[st.high]} high` };
  if (g[0].cs.length === 3) {
    const k = kickers([g[0].r], 2);
    return { score: score(3, [g[0].r, ...k.map(rv)]), cat: 3, best: [...g[0].cs, ...k], name: `Three of a kind, ${PLURAL[g[0].r]}` };
  }
  if (g[0].cs.length === 2 && g[1] && g[1].cs.length === 2) {
    const k = kickers([g[0].r, g[1].r], 1);
    return { score: score(2, [g[0].r, g[1].r, ...k.map(rv)]), cat: 2, best: [...g[0].cs, ...g[1].cs, ...k], name: `Two pair, ${PLURAL[g[0].r]} and ${PLURAL[g[1].r]}` };
  }
  if (g[0].cs.length === 2) {
    const k = kickers([g[0].r], 3);
    return { score: score(1, [g[0].r, ...k.map(rv)]), cat: 1, best: [...g[0].cs, ...k], name: `Pair of ${PLURAL[g[0].r]}` };
  }
  const top = sorted.slice(0, 5);
  return { score: score(0, top.map(rv)), cat: 0, best: top, name: `High card, ${SINGLE[rv(top[0])]}` };
}

// ---------- table ----------
// table = { sb, bb, maxSeats, seats: [ {id, name, stack, sittingOut} | null ], button, handNo, hand }
export function createTable({ smallBlind, bigBlind, maxSeats = 8 }) {
  if (!(bigBlind > 0) || !(smallBlind > 0) || smallBlind > bigBlind) throw new Error("Blinds must be positive and the small blind no bigger than the big blind.");
  if (!(maxSeats >= 2 && maxSeats <= 8)) throw new Error("A table has 2 to 8 seats.");
  return { sb: smallBlind, bb: bigBlind, maxSeats, seats: Array(maxSeats).fill(null), button: -1, handNo: 0, hand: null };
}

export const handInProgress = t => !!t.hand && t.hand.street !== "done";
const isDealtIn = s => s && s.stack > 0 && !s.sittingOut;
export const dealableSeats = t => t.seats.map((s, i) => isDealtIn(s) ? i : -1).filter(i => i >= 0);
export const canStartHand = t => !handInProgress(t) && dealableSeats(t).length >= 2;

// Next index after `from` (wrapping) that satisfies pred.
function nextSeat(n, from, pred) {
  for (let k = 1; k <= n; k++) { const i = (from + k + n) % n; if (pred(i)) return i; }
  return -1;
}

const canAct = p => p && !p.folded && !p.allIn;

function put(t, seat, amount) {
  const s = t.seats[seat], p = t.hand.players[seat];
  const a = Math.min(amount, s.stack);
  s.stack -= a; p.bet += a; p.committed += a;
  if (s.stack === 0) p.allIn = true;
  return a;
}

function log(t, entry) { t.hand.log.push({ ...entry, street: t.hand.street }); }

// Starts the next hand. `deck` must be a freshly shuffled 52-card deck.
export function startHand(t, deck) {
  if (!canStartHand(t)) throw new Error("Need at least two players with chips to deal.");
  const n = t.maxSeats, inSeats = dealableSeats(t), dealt = i => inSeats.includes(i);
  t.button = nextSeat(n, t.button < 0 ? -1 : t.button, dealt);
  const headsUp = inSeats.length === 2;
  const sbSeat = headsUp ? t.button : nextSeat(n, t.button, dealt);
  const bbSeat = nextSeat(n, sbSeat, dealt);
  t.handNo += 1;
  t.hand = {
    no: t.handNo, deck: deck.slice(), board: [], street: "preflop",
    players: t.seats.map((s, i) => dealt(i) ? { hole: [], bet: 0, committed: 0, folded: false, allIn: false, acted: false, startStack: s.stack } : null),
    sbSeat, bbSeat, toAct: -1, currentBet: 0, minRaise: t.bb, log: [], results: null, reveal: {}, runout: false
  };
  const h = t.hand;
  log(t, { seat: sbSeat, type: "small blind", amount: put(t, sbSeat, t.sb) });
  log(t, { seat: bbSeat, type: "big blind", amount: put(t, bbSeat, t.bb) });
  h.currentBet = t.bb; // others call the full big blind even if the big blind is short
  for (let round = 0; round < 2; round++) {
    let i = nextSeat(n, t.button, dealt);
    for (let k = 0; k < inSeats.length; k++) { h.players[i].hole.push(h.deck.pop()); i = nextSeat(n, i, dealt); }
  }
  h.toAct = nextSeat(n, bbSeat, i => canAct(h.players[i]));
  advanceIfRoundOver(t, bbSeat);
  return t;
}

// What the player in `seat` may do right now.
export function legalActions(t, seat) {
  const h = t.hand;
  if (!handInProgress(t) || h.toAct !== seat) return null;
  const p = h.players[seat], stack = t.seats[seat].stack;
  const toCall = Math.max(0, h.currentBet - p.bet);
  const othersCanAct = h.players.some((q, i) => i !== seat && canAct(q));
  const res = { fold: true, check: toCall === 0, call: toCall > 0 ? Math.min(toCall, stack) : 0, raise: null };
  // Raising needs betting to be open for this player (no incomplete all-in raise since they acted),
  // chips beyond the call, and someone left who could respond.
  if (!p.acted && stack > toCall && othersCanAct) {
    const maxTo = p.bet + stack;
    res.raise = { min: Math.min(h.currentBet + h.minRaise, maxTo), max: maxTo, isBet: h.currentBet === 0 };
  }
  return res;
}

// action = { type: "fold" | "check" | "call" | "raise", to?: total bet for this street when raising }
export function act(t, seat, action) {
  const h = t.hand, legal = legalActions(t, seat);
  if (!legal) throw new Error("It's not your turn.");
  const p = h.players[seat];
  switch (action.type) {
    case "fold":
      p.folded = true; log(t, { seat, type: "fold" }); break;
    case "check":
      if (!legal.check) throw new Error("You can't check when there's a bet to call.");
      p.acted = true; log(t, { seat, type: "check" }); break;
    case "call": {
      if (!legal.call) throw new Error("There's nothing to call.");
      const a = put(t, seat, legal.call); p.acted = true;
      log(t, { seat, type: p.allIn ? "call all-in" : "call", amount: a }); break;
    }
    case "raise": {
      if (!legal.raise) throw new Error("You can't raise right now.");
      const to = Math.floor(Number(action.to));
      if (!(to >= legal.raise.min && to <= legal.raise.max)) throw new Error(`Raise must be between ${legal.raise.min} and ${legal.raise.max}.`);
      const raiseBy = to - h.currentBet;
      put(t, seat, to - p.bet);
      if (raiseBy >= h.minRaise) {
        h.minRaise = raiseBy; // a full raise reopens betting for everyone else
        h.players.forEach((q, i) => { if (q && i !== seat) q.acted = false; });
      }
      h.currentBet = Math.max(h.currentBet, to);
      p.acted = true;
      log(t, { seat, type: (legal.raise.isBet ? "bet" : "raise") + (p.allIn ? " all-in" : ""), to }); break;
    }
    default: throw new Error("Unknown action.");
  }
  advanceIfRoundOver(t, seat);
  return t;
}

// The action a timed-out player takes: check when free, otherwise fold.
export function autoAction(t) {
  const seat = t.hand && t.hand.toAct, legal = seat >= 0 ? legalActions(t, seat) : null;
  if (!legal) return null;
  const a = legal.check ? { type: "check" } : { type: "fold" };
  act(t, seat, a);
  return { seat, ...a };
}

function needsToAct(h, i) {
  const p = h.players[i];
  return canAct(p) && (!p.acted || p.bet < h.currentBet);
}

function advanceIfRoundOver(t, fromSeat) {
  const h = t.hand, n = t.maxSeats;
  const live = h.players.map((p, i) => p && !p.folded ? i : -1).filter(i => i >= 0);
  if (live.length === 1) return finishHand(t);
  const next = nextSeat(n, fromSeat, i => needsToAct(h, i));
  if (next >= 0) { h.toAct = next; return; }
  // betting round over
  for (;;) {
    h.players.forEach(p => { if (p) { p.bet = 0; p.acted = false; } });
    h.currentBet = 0; h.minRaise = t.bb;
    if (h.street === "river") return finishHand(t);
    h.deck.pop(); // burn
    if (h.street === "preflop") { h.board.push(h.deck.pop(), h.deck.pop(), h.deck.pop()); h.street = "flop"; }
    else if (h.street === "flop") { h.board.push(h.deck.pop()); h.street = "turn"; }
    else { h.board.push(h.deck.pop()); h.street = "river"; }
    const actors = h.players.filter(canAct).length;
    if (actors >= 2) { h.toAct = nextSeat(n, t.button, i => canAct(h.players[i])); return; }
    h.runout = true; // everyone else is all-in: deal the rest with no betting
  }
}

// Splits everything committed into a main pot and side pots.
export function buildPots(h) {
  const ps = h.players.map((p, i) => p ? { i, c: p.committed, live: !p.folded } : null).filter(Boolean);
  const levels = [...new Set(ps.filter(p => p.live && p.c > 0).map(p => p.c))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const L of levels) {
    const amount = ps.reduce((s, p) => s + Math.min(p.c, L) - Math.min(p.c, prev), 0);
    const eligible = ps.filter(p => p.live && p.c >= L).map(p => p.i);
    if (amount > 0) pots.push({ amount, eligible });
    prev = L;
  }
  const leftover = ps.reduce((s, p) => s + Math.max(0, p.c - prev), 0); // dead money above the last live level
  if (leftover && pots.length) pots[pots.length - 1].amount += leftover;
  return pots;
}

function finishHand(t) {
  const h = t.hand, n = t.maxSeats;
  // Return any bet nobody called.
  const ps = h.players.map((p, i) => p ? { i, c: p.committed } : null).filter(Boolean).sort((a, b) => b.c - a.c);
  if (ps.length > 1 && ps[0].c > ps[1].c) {
    const back = ps[0].c - ps[1].c;
    h.players[ps[0].i].committed -= back; t.seats[ps[0].i].stack += back;
    h.uncalled = { seat: ps[0].i, amount: back };
  }
  const live = h.players.map((p, i) => p && !p.folded ? i : -1).filter(i => i >= 0);
  const showdown = live.length > 1;
  const evals = {};
  if (showdown) for (const i of live) evals[i] = evaluate([...h.players[i].hole, ...h.board]);
  const won = {};
  const pots = buildPots(h);
  h.pots = pots.map(pot => {
    let winners = pot.eligible;
    if (showdown) {
      const best = Math.max(...pot.eligible.map(i => evals[i].score));
      winners = pot.eligible.filter(i => evals[i].score === best);
    }
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    // odd chips go to the first winners clockwise from the button
    const order = [];
    for (let k = 1; k <= n; k++) { const i = (t.button + k) % n; if (winners.includes(i)) order.push(i); }
    for (const i of order) { const amt = share + (odd > 0 ? 1 : 0); if (odd > 0) odd--; won[i] = (won[i] || 0) + amt; t.seats[i].stack += amt; }
    return { amount: pot.amount, eligible: pot.eligible, winners };
  });
  // Who turns their cards over. A pot winner at showdown must show to claim it, and all-in hands are
  // tabled. Everyone else follows their own setting (seat.show): show, or muck when the rules allow it.
  const wants = i => !!t.seats[i].show;
  if (showdown) {
    for (const i of live) if (won[i] || h.runout || wants(i)) h.reveal[i] = h.players[i].hole;
    h.mucked = live.filter(i => !h.reveal[i]);
  } else {
    if (live.length && wants(live[0])) h.reveal[live[0]] = h.players[live[0]].hole;
    h.mucked = [];
  }
  h.results = Object.entries(won).map(([i, amount]) => ({ seat: +i, amount, hand: showdown ? evals[i].name : null, best: showdown ? evals[i].best : null }));
  h.handNames = showdown ? Object.fromEntries(live.filter(i => h.reveal[i]).map(i => [i, evals[i].name])) : {};
  h.street = "done"; h.toAct = -1; h.showdown = showdown;
  h.players.forEach(p => { if (p) p.bet = 0; });
}

// Chips in the middle. Zero once the hand is over, because the pots have been paid out to stacks.
export const potTotal = h => h && h.street !== "done" ? h.players.reduce((s, p) => s + (p ? p.committed : 0), 0) : 0;

// What one viewer may see. viewerSeat = -1 for spectators / the public copy.
export function publicView(t, viewerSeat = -1) {
  const h = t.hand;
  return {
    sb: t.sb, bb: t.bb, maxSeats: t.maxSeats, button: t.button, handNo: t.handNo,
    seats: t.seats.map(s => s && { id: s.id, name: s.name, stack: s.stack, sittingOut: !!s.sittingOut, avatar: s.avatar || "", show: !!s.show }),
    hand: h && {
      no: h.no, board: h.board, street: h.street, toAct: h.toAct, currentBet: h.currentBet, minRaise: h.minRaise,
      sbSeat: h.sbSeat, bbSeat: h.bbSeat, pot: potTotal(h), runout: h.runout, showdown: !!h.showdown,
      players: h.players.map((p, i) => p && {
        bet: p.bet, committed: p.committed, folded: p.folded, allIn: p.allIn,
        hole: i === viewerSeat || h.reveal[i] ? p.hole : null, hasCards: !p.folded
      }),
      log: h.log, results: h.results, pots: h.pots || null, handNames: h.handNames || {}, uncalled: h.uncalled || null, mucked: h.mucked || [],
      legal: viewerSeat >= 0 ? legalActions(t, viewerSeat) : null
    }
  };
}

// ---------- settling up ----------
// players = [{ name, buyIn, cashOut }] → nets plus a short list of payments that squares everyone.
export function settle(players) {
  const rows = players.map(p => ({ ...p, net: p.cashOut - p.buyIn }));
  const debt = rows.filter(r => r.net < 0).map(r => ({ name: r.name, amt: -r.net })).sort((a, b) => b.amt - a.amt);
  const cred = rows.filter(r => r.net > 0).map(r => ({ name: r.name, amt: r.net })).sort((a, b) => b.amt - a.amt);
  const payments = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const amt = Math.min(debt[i].amt, cred[j].amt);
    if (amt > 0) payments.push({ from: debt[i].name, to: cred[j].name, amount: amt });
    debt[i].amt -= amt; cred[j].amt -= amt;
    if (debt[i].amt === 0) i++;
    if (cred[j].amt === 0) j++;
  }
  return { rows, payments };
}
