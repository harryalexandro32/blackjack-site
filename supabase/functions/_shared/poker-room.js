// Online table rules on top of the engine: seating, buy-ins, turn clock, leaving, closing and settling up.
// Pure functions over a JSON state so they can be tested without a database. The edge function loads the
// state, calls applyAction, and saves the result.
import * as E from "./poker-engine.js";

export const LIMITS = { maxCents: 1e11, nameLen: 16, betweenHandsMs: 5000, resumeMs: 2000, timeoutsBeforeSitOut: 2 };

export class RoomError extends Error {}
const fail = msg => { throw new RoomError(msg); };
const int = v => (Number.isSafeInteger(v) ? v : NaN);

export function cleanName(name) {
  const n = String(name || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, LIMITS.nameLen);
  if (!n) fail("Enter your name.");
  return n;
}

// Avatars are short codes of numbers and dots (see poker/avatars.js); anything else becomes the default.
export const cleanAvatar = a => typeof a === "string" && /^[0-9.]{1,40}$/.test(a) ? a : "";

export function validateSettings(s) {
  const sb = int(s.sb), bb = int(s.bb), minBuyIn = int(s.minBuyIn), maxSeats = int(s.maxSeats), actSeconds = int(s.actSeconds);
  if (!(sb > 0 && bb > 0 && sb <= bb)) fail("Blinds must be positive and the small blind no bigger than the big blind.");
  if (bb > LIMITS.maxCents / 10) fail("Those blinds are too big.");
  if (!(minBuyIn >= bb && minBuyIn <= LIMITS.maxCents)) fail("The minimum buy-in has to be at least one big blind.");
  if (!(maxSeats >= 2 && maxSeats <= 8)) fail("A table has 2 to 8 seats.");
  if (![20, 30, 60, 120].includes(actSeconds)) fail("Pick a time to act from the list.");
  return { sb, bb, minBuyIn, maxSeats, actSeconds };
}

function checkBuyIn(state, amount) {
  const a = int(amount);
  if (!(a >= state.settings.minBuyIn)) fail(`The minimum buy-in at this table is ${dollars(state.settings.minBuyIn)}.`);
  if (a > LIMITS.maxCents) fail("That buy-in is too big.");
  return a;
}
const dollars = c => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });

export function newRoom({ code, settings, host, now }) {
  const s = validateSettings(settings);
  const state = {
    code, settings: s,
    table: E.createTable({ smallBlind: s.sb, bigBlind: s.bb, maxSeats: s.maxSeats }),
    players: {}, hostId: host.id, started: false,
    deadline: null, deadlineKey: null, nextHandAt: null, closing: false, closed: false, summary: null, createdAt: now
  };
  seatPlayer(state, host, now);
  return state;
}

function uniqueName(state, name) {
  const taken = new Set(Object.values(state.players).filter(p => !p.left).map(p => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let k = 2; ; k++) { const n = `${name.slice(0, LIMITS.nameLen - 2)} ${k}`; if (!taken.has(n.toLowerCase())) return n; }
}

function seatPlayer(state, { id, name, buyIn, tokenHash, avatar, show }, now) {
  const amount = checkBuyIn(state, buyIn);
  const seat = state.table.seats.findIndex(s => !s);
  if (seat < 0) fail("This table is full.");
  const clean = uniqueName(state, cleanName(name));
  state.table.seats[seat] = { id, name: clean, stack: amount, sittingOut: false, avatar: cleanAvatar(avatar), show: !!show };
  state.players[id] = { name: clean, seat, buyIn: amount, tokenHash, left: false, leaving: false, cashOut: null, timeouts: 0, joinedAt: now };
  wakeTable(state, now);
  return seat;
}

const seatOf = (state, id) => state.players[id] && !state.players[id].left ? state.players[id].seat : -1;
const liveInHand = (state, seat) => E.handInProgress(state.table) && state.table.hand.players[seat] && !state.table.hand.players[seat].folded;

// If the game is running but stalled for lack of players, schedule a deal soon.
function wakeTable(state, now) {
  if (state.started && !state.closed && !E.handInProgress(state.table) && state.nextHandAt === null) state.nextHandAt = now + LIMITS.resumeMs;
}

function removeFromSeat(state, id) {
  const p = state.players[id], seat = p.seat;
  p.cashOut = state.table.seats[seat] ? state.table.seats[seat].stack : 0;
  p.avatar = state.table.seats[seat]?.avatar || "";
  p.left = true; p.leaving = false;
  state.table.seats[seat] = null;
}

function finalize(state, now) {
  const rows = Object.entries(state.players).map(([id, p]) => ({
    id, name: p.name, buyIn: p.buyIn, cashOut: p.left ? p.cashOut : state.table.seats[p.seat].stack,
    avatar: p.left ? p.avatar || "" : state.table.seats[p.seat].avatar || ""
  }));
  state.summary = { ...E.settle(rows), hands: state.table.handNo, closedAt: now };
  state.closed = true; state.closing = false; state.nextHandAt = null; state.deadline = null;
}

// Everything that should happen on its own after a move: auto-folds for players who left,
// seat clean-up between hands, closing, the next deal, and the turn clock.
function settleDown(state, ctx) {
  const t = state.table, now = ctx.now;
  for (let guard = 0; guard < 50; guard++) {
    if (state.closed) break;
    if (E.handInProgress(t)) {
      // players who left or keep timing out don't hold up the table
      const seat = t.hand.toAct, s = t.seats[seat], p = s && state.players[s.id];
      if (p && p.leaving) { E.act(t, seat, { type: "fold" }); continue; }
      if (p && p.timeouts >= LIMITS.timeoutsBeforeSitOut) { E.autoAction(t); continue; }
      break;
    }
    // between hands
    for (const [id, p] of Object.entries(state.players)) if (p.leaving && !p.left) removeFromSeat(state, id);
    if (state.closing) { finalize(state, now); break; }
    if (!state.started) break;
    if (!E.canStartHand(t)) { state.nextHandAt = null; break; } // wait for a join, rebuy or sit-in (wakeTable restarts)
    if (state.nextHandAt === null) state.nextHandAt = now + (t.hand ? LIMITS.betweenHandsMs : 0);
    if (now < state.nextHandAt) break;
    E.startHand(t, ctx.shuffledDeck());
    state.nextHandAt = null; // loop again: a hand can end at once if everyone is all in from the blinds
  }
  // turn clock: restarts whenever the player to act changes
  if (E.handInProgress(t) && !state.closed) {
    const key = `${t.hand.no}:${t.hand.toAct}:${t.hand.log.length}`;
    if (state.deadlineKey !== key) { state.deadlineKey = key; state.deadline = now + state.settings.actSeconds * 1000; }
  } else { state.deadline = null; state.deadlineKey = null; }
}

// action: { type, ... }. ctx: { now, playerId, shuffledDeck() }
export function applyAction(state, action, ctx) {
  const me = ctx.playerId, now = ctx.now, t = state.table;
  if (state.closed && !["state", "tick"].includes(action.type)) fail("This table is closed.");
  const mySeat = seatOf(state, me);
  const needSeat = () => { if (mySeat < 0) fail("You're not seated at this table."); };
  const needHost = () => { if (me !== state.hostId) fail("Only the host can do that."); };

  switch (action.type) {
    case "state": break;
    case "join":
      seatPlayer(state, { id: me, name: action.name, buyIn: action.buyIn, tokenHash: ctx.tokenHash, avatar: action.avatar, show: action.show }, now);
      break;
    case "prefs":
      // your own avatar, and whether you show or muck your cards when the rules let you choose
      needSeat();
      if (action.avatar !== undefined) t.seats[mySeat].avatar = cleanAvatar(action.avatar);
      if (action.show !== undefined) t.seats[mySeat].show = !!action.show;
      break;
    case "start":
      needHost();
      if (state.started) fail("The game has already started.");
      if (E.dealableSeats(t).length < 2) fail("You need at least two players with chips to start.");
      state.started = true; state.nextHandAt = now;
      break;
    case "act": {
      needSeat();
      if (!E.handInProgress(t) || t.hand.toAct !== mySeat) fail("It's not your turn.");
      const a = { type: String(action.action) };
      if (a.type === "raise") a.to = int(action.to);
      try { E.act(t, mySeat, a); } catch (e) { fail(e.message); }
      state.players[me].timeouts = 0;
      break;
    }
    case "rebuy": {
      needSeat();
      if (liveInHand(state, mySeat)) fail("You can buy back in once this hand is over.");
      if (t.seats[mySeat].stack > 0) fail("You can only buy back in when you're out of chips.");
      const amount = checkBuyIn(state, action.amount);
      t.seats[mySeat].stack = amount; t.seats[mySeat].sittingOut = false;
      state.players[me].buyIn += amount;
      wakeTable(state, now);
      break;
    }
    case "sitout":
      needSeat();
      t.seats[mySeat].sittingOut = !!action.on;
      if (!action.on) { state.players[me].timeouts = 0; wakeTable(state, now); }
      break;
    case "leave":
      needSeat();
      if (liveInHand(state, mySeat)) state.players[me].leaving = true;
      else removeFromSeat(state, me);
      break;
    case "close":
      needHost();
      state.closing = true;
      break;
    case "tick": {
      // Anyone can nudge the clock; the server decides whether time is really up.
      if (E.handInProgress(t) && state.deadline !== null && now >= state.deadline) {
        const seat = t.hand.toAct, id = t.seats[seat].id;
        E.autoAction(t);
        const p = state.players[id];
        p.timeouts += 1;
        if (p.timeouts >= LIMITS.timeoutsBeforeSitOut) t.seats[seat].sittingOut = true;
      }
      break;
    }
    default: fail("Unknown request.");
  }
  settleDown(state, ctx);
  return state;
}

export function roomStatus(state) { return state.closed ? "closed" : state.started ? "playing" : "waiting"; }

function shared(state) {
  const bySeat = {};
  for (const [id, p] of Object.entries(state.players)) if (!p.left) bySeat[p.seat] = { name: p.name, buyIn: p.buyIn, isHost: id === state.hostId, avatar: state.table.seats[p.seat]?.avatar || "" };
  return {
    code: state.code, status: roomStatus(state), settings: state.settings, players: bySeat,
    departed: Object.values(state.players).filter(p => p.left).map(p => ({ name: p.name, buyIn: p.buyIn, cashOut: p.cashOut, avatar: p.avatar || "" })),
    hostSeat: seatOf(state, state.hostId), started: state.started, closing: state.closing, closed: state.closed,
    deadline: state.deadline, nextHandAt: state.nextHandAt, actMs: state.settings.actSeconds * 1000,
    summary: state.summary
  };
}

// Safe for everyone: no hole cards except at showdown, no deck.
export function publicState(state) { return { ...shared(state), view: E.publicView(state.table, -1) }; }

export function personalState(state, playerId) {
  const p = state.players[playerId];
  const seat = seatOf(state, playerId);
  const out = { ...shared(state), view: E.publicView(state.table, seat), me: seat, playerId, isHost: playerId === state.hostId, left: !!(p && p.left), leaving: !!(p && p.leaving) };
  if (p && p.left && !state.closed) {
    // A player who cashed out sees their result, with the others still playing.
    const rows = Object.values(state.players).map(q => ({ name: q.name, buyIn: q.buyIn, cashOut: q.left ? q.cashOut : null, me: q === p, avatar: q.left ? q.avatar || "" : state.table.seats[q.seat]?.avatar || "" }));
    out.summary = { rows: rows.map(r => ({ ...r, net: r.cashOut == null ? 0 : r.cashOut - r.buyIn })), payments: [], hands: state.table.handNo, partial: true };
  }
  if (out.summary && !out.summary.partial) out.summary = { ...out.summary, rows: out.summary.rows.map(r => ({ ...r, me: r.id === playerId, id: undefined })) };
  return out;
}

export function findPlayerByTokenHash(state, hash) {
  for (const [id, p] of Object.entries(state.players)) if (p.tokenHash === hash) return id;
  return null;
}
