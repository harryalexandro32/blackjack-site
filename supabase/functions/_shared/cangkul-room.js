// Cangkul rooms on the server: seats (people and bots), the turn clock, bot moves, scoring,
// sessions and the ledger, chat, the host link. Pure functions over JSON state, like capsa-room.js.
//
// A room has 2 to 4 seats. The host chooses whether bots fill the empty ones; without bots a game needs
// at least 2 people, and anyone who sits down mid-game is dealt in from the next game.
// Money: points won from or lost to a bot don't turn into money. Only what people win from each other is
// settled, so friends only ever owe each other.
import * as C from "./cangkul-engine.js";
import { cangkulMove } from "./cangkul-bot.js";
import { settle } from "./poker-engine.js";
import { RoomError, REACTIONS, cleanName, cleanAvatar } from "./poker-room.js";

export const LIMITS = { nextGameMs: 7000, botMs: 1100, chatLen: 160, chatKeep: 40, chatBurst: 6, chatWindowMs: 10000, sessionsKeep: 50, nameLen: 16 };
const fail = msg => { throw new RoomError(msg); };
const int = v => (Number.isSafeInteger(v) ? v : NaN);
const BOT_NAMES = ["Rosa", "Kenji", "Amara", "Luis", "Priya", "Otto", "Mei", "Walt"];

export function validateSettings(s) {
  const pointValue = int(s.pointValue), actSeconds = int(s.actSeconds), seats = int(s.seats === undefined ? 4 : s.seats);
  if (!(pointValue >= 1 && pointValue <= 1e9)) fail("Pick how many dollars a point is worth.");
  if (![20, 30, 60].includes(actSeconds)) fail("Pick a time to play from the list.");
  if (!(seats >= 2 && seats <= C.MAX_SEATS)) fail("Pick 2, 3 or 4 seats.");
  const skill = ["easy", "normal", "hard"].includes(s.skill) ? s.skill : "normal";
  const mode = s.mode === "loser" ? "loser" : "winner";
  const handSize = int(s.handSize) === 5 ? 5 : 7;
  const emptyStock = s.emptyStock === "pass" ? "pass" : "take";
  return { pointValue, actSeconds, seats, bots: s.bots === true, skill, mode, handSize, emptyStock };
}

export function newRoom({ code, settings, host, now }) {
  const s = validateSettings(settings), zeros = () => Array(s.seats).fill(0);
  const state = {
    game: "cangkul", code, settings: s,
    seats: Array(s.seats).fill(null), players: {}, hostId: host.id, hostKeyHash: host.hostKeyHash || null,
    started: false, g: null, gameNo: 0, lastWinner: -1, games: 0,
    points: zeros(), money: zeros(), departed: [],
    nextGameAt: null, deadline: null, deadlineKey: null, botAt: null,
    chat: [], chatSeq: 0, sessions: [], ledger: {}, sessionNo: 1, ending: false, closing: false, closed: false, summary: null, createdAt: now
  };
  seatPerson(state, host);
  return state;
}

function uniqueName(state, name, selfId) {
  const taken = new Set(Object.entries(state.players).filter(([id, p]) => !p.left && id !== selfId).map(([, p]) => p.name.toLowerCase()));
  state.seats.forEach(s => { if (s && s.bot) taken.add(s.name.toLowerCase()); });
  if (!taken.has(name.toLowerCase())) return name;
  for (let k = 2; ; k++) { const n = `${name.slice(0, LIMITS.nameLen - 2)} ${k}`; if (!taken.has(n.toLowerCase())) return n; }
}

// A person sits down: in an empty seat (dealt in from the next game), or in a bot's seat (taking over its
// cards if a game is on).
function seatPerson(state, { id, name, tokenHash, avatar }) {
  let seat = state.seats.findIndex(s => !s);
  if (seat < 0) seat = state.seats.findIndex(s => s && s.bot);
  if (seat < 0) fail(`This room is full: ${state.seats.length} people are already playing.`);
  const clean = uniqueName(state, cleanName(name), id);
  state.seats[seat] = { id, name: clean, avatar: cleanAvatar(avatar), bot: false };
  state.points[seat] = 0; state.money[seat] = 0;
  state.players[id] = { name: clean, seat, tokenHash, left: false, timeouts: 0, chatTimes: [] };
  return seat;
}

function botFor(state, seat) {
  const used = new Set(state.seats.filter(Boolean).map(s => s.name.toLowerCase()));
  const name = BOT_NAMES.find(n => !used.has(n.toLowerCase())) || "Bot " + (seat + 1);
  return { id: "bot" + seat, name, avatar: "", bot: true };
}

const seatOf = (state, id) => state.players[id] && !state.players[id].left ? state.players[id].seat : -1;
const isBotSeat = (state, seat) => !!(state.seats[seat] && state.seats[seat].bot);
const inGame = (state, seat) => !!(state.g && !state.g.finished && state.g.in.includes(seat));

// Bots fill the empty seats if the room plays with bots; otherwise a bot that stood in for someone who
// left mid-game gets up again.
function arrangeBots(state) {
  state.seats.forEach((s, i) => {
    if (state.settings.bots) { if (!s) state.seats[i] = botFor(state, i); }   // one at a time, so names don't repeat
    else if (s && s.bot) { state.seats[i] = null; state.points[i] = 0; state.money[i] = 0; }
  });
}

// The next game, for everyone seated. False if fewer than 2 are.
function deal(state, ctx) {
  arrangeBots(state);
  const players = state.seats.map((s, i) => s ? i : -1).filter(i => i >= 0);
  if (players.length < 2) return false;
  state.gameNo += 1;
  state.g = C.startGame(state.gameNo, ctx.shuffledDeck(), {
    seats: state.seats.length, players, handSize: state.settings.handSize, mode: state.settings.mode, emptyStock: state.settings.emptyStock, leader: state.lastWinner
  });
  state.nextGameAt = null;
  return true;
}

// A game just ended: points for everyone, money only between people.
function score(state) {
  const g = state.g, f = g && g.finished;
  if (!f || g.counted) return;
  g.counted = true;
  state.games += 1;
  f.points.forEach((p, i) => state.points[i] += p);
  const person = i => state.seats[i] && !state.seats[i].bot;
  if (f.mode === "loser") {
    // places: a point from every person you finish above (bots don't pay or get paid)
    for (const i of g.in) for (const j of g.in)
      if (f.place[i] < f.place[j] && person(i) && person(j)) { state.money[i] += 1; state.money[j] -= 1; }
  } else if (person(f.winner)) {
    for (const i of g.in) if (i !== f.winner && person(i)) { state.money[i] -= f.left[i].length; state.money[f.winner] += f.left[i].length; }
  }
  state.lastWinner = f.winner;
}

// Everyone with money in this session (people only): seated now, or who left during it.
function sessionRows(state) {
  const v = state.settings.pointValue;
  const rows = state.seats.map((s, i) => s && !s.bot ? { name: s.name, avatar: s.avatar, points: state.points[i], net: state.money[i] * v } : null).filter(Boolean);
  for (const d of state.departed) rows.push({ name: d.name, avatar: d.avatar, points: d.points, net: d.money * v });
  return rows;
}
const ledgerList = state => Object.values(state.ledger || {}).sort((a, b) => b.net - a.net);

function endSession(state, now) {
  const rows = sessionRows(state);
  const result = settle(rows.map(r => ({ name: r.name, buyIn: 0, cashOut: r.net })));
  if (state.games > 0) {
    state.sessions = [...state.sessions, { no: state.sessionNo, endedAt: now, games: state.games, rows: rows.map(r => ({ name: r.name, points: r.points, net: r.net })), payments: result.payments }].slice(-LIMITS.sessionsKeep);
    for (const r of rows) {
      const k = r.name.toLowerCase(), cur = state.ledger[k] || { name: r.name, net: 0, sessions: 0 };
      state.ledger[k] = { name: r.name, net: cur.net + r.net, sessions: cur.sessions + 1 };
    }
  }
  const summary = { rows: rows.map(r => ({ ...r })), payments: result.payments, games: state.games, pointValue: state.settings.pointValue };
  // the room stays: everyone still here starts the next session from zero, with a random first leader
  for (const [id, p] of Object.entries(state.players)) if (p.left) delete state.players[id];
  state.points = state.points.map(() => 0); state.money = state.money.map(() => 0); state.departed = []; state.games = 0;
  state.sessionNo += 1; state.lastWinner = -1;
  state.started = false; state.ending = false; state.g = null; state.nextGameAt = null; state.deadline = null; state.botAt = null;
  state.seats = state.seats.map(s => s && s.bot ? null : s);
  return summary;
}

function finalize(state, now) {
  const summary = endSession(state, now);
  summary.ledger = ledgerList(state);
  state.summary = summary;
  state.closed = true; state.closing = false;
}

// A bot's whole turn: a card, or digging until one turns up (and picking up or skipping if the stock runs dry).
function botTurn(state) {
  const g = state.g, seat = g.turn;
  const m = cangkulMove(g, seat, state.settings.skill);
  if (m.type === "play") C.play(g, seat, m.card);
  else C.autoMove(g);
}

// Everything that happens on its own: bots playing, counting a finished game, the next deal, the clock.
function settleDown(state, ctx) {
  const now = ctx.now;
  for (let guard = 0; guard < 30; guard++) {
    if (state.closed || !state.started) break;
    const g = state.g;
    if (g && g.finished) {
      score(state);
      if (state.closing) { finalize(state, now); break; }
      if (state.ending) { state.lastSummary = endSession(state, now); break; }
      if (state.nextGameAt === null) state.nextGameAt = now + LIMITS.nextGameMs;
      if (now < state.nextGameAt) break;
      // not enough players left for another game: the session ends here
      if (!deal(state, ctx)) { state.lastSummary = endSession(state, now); break; }
      continue;
    }
    if (!g) { if (!deal(state, ctx)) { state.lastSummary = endSession(state, now); break; } continue; }
    // bots take their turn after a short pause so people can follow the play
    if (isBotSeat(state, g.turn)) {
      if (state.botAt === null) { state.botAt = now + LIMITS.botMs; break; }
      if (now < state.botAt) break;
      botTurn(state);
      state.botAt = null;
      continue;
    }
    break;
  }
  if (state.closing && !state.started && !state.closed) finalize(state, now);
  // the clock for people
  const g = state.g;
  if (state.started && g && !g.finished && !isBotSeat(state, g.turn)) {
    const key = `${g.no}:${g.turn}:${g.step}`;
    if (state.deadlineKey !== key) { state.deadlineKey = key; state.deadline = now + state.settings.actSeconds * 1000; }
  } else { state.deadline = null; state.deadlineKey = null; }
}

function addChat(state, me, entry, now) {
  const p = state.players[me];
  if (!p || p.left) fail("You're not in this room.");
  p.chatTimes = (p.chatTimes || []).filter(at => now - at < LIMITS.chatWindowMs);
  if (p.chatTimes.length >= LIMITS.chatBurst) fail("Slow down a little.");
  p.chatTimes.push(now);
  state.chatSeq += 1;
  state.chat = [...state.chat, { n: state.chatSeq, name: p.name, seat: seatOf(state, me), at: now, ...entry }].slice(-LIMITS.chatKeep);
}

// action: { type, ... }. ctx: { now, playerId, tokenHash?, shuffledDeck() }
export function applyAction(state, action, ctx) {
  const me = ctx.playerId, now = ctx.now;
  if (state.closed && !["state", "tick"].includes(action.type)) fail("This room is closed.");
  const mySeat = seatOf(state, me);
  const needSeat = () => { if (mySeat < 0) fail("You're not in this room."); };
  const needHost = () => { if (me !== state.hostId) fail("Only the host can do that."); };
  const needTurn = () => { needSeat(); if (!state.g || state.g.finished || state.g.turn !== mySeat) fail("It's not your turn."); };
  const move = fn => { needTurn(); try { fn(); } catch (e) { fail(e.message); } state.players[me].timeouts = 0; };
  switch (action.type) {
    case "state": case "tick": break;
    case "join": seatPerson(state, { id: me, name: action.name, tokenHash: ctx.tokenHash, avatar: action.avatar }); break;
    case "start": {
      needHost();
      if (state.started) fail("The game has already started.");
      const seated = state.seats.filter(Boolean).length;
      if (!state.settings.bots && seated < 2) fail("Cangkul needs at least 2 players. Share the room code first.");
      state.started = true;
      break;
    }
    case "play": move(() => C.play(state.g, mySeat, String(action.card || ""))); break;
    case "draw": move(() => C.draw(state.g, mySeat)); break;
    case "giveup": move(() => C.giveUp(state.g, mySeat)); break;
    case "prefs":
      needSeat();
      if (action.avatar !== undefined) state.seats[mySeat].avatar = cleanAvatar(action.avatar);
      break;
    case "leave": {
      needSeat();
      const p = state.players[me];
      // their result so far stays in the session; a bot takes the seat if they were in a game (or the room
      // plays with bots), otherwise the seat is simply free again
      state.departed.push({ name: p.name, avatar: state.seats[mySeat].avatar, points: state.points[mySeat], money: state.money[mySeat] });
      state.points[mySeat] = 0; state.money[mySeat] = 0;
      state.seats[mySeat] = state.started && (state.settings.bots || inGame(state, mySeat)) ? botFor(state, mySeat) : null;
      p.left = true;
      break;
    }
    case "chat": {
      const text = String(action.text || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LIMITS.chatLen);
      if (!text) fail("Type a message first.");
      addChat(state, me, { kind: "msg", text }, now);
      break;
    }
    case "react":
      if (!REACTIONS.includes(action.emoji)) fail("Pick one of the reactions.");
      addChat(state, me, { kind: "react", emoji: action.emoji }, now);
      break;
    case "endSession":
      needHost();
      if (!state.started) fail("There's no session going right now.");
      if (!state.g || state.g.finished) { score(state); state.lastSummary = endSession(state, now); }
      else state.ending = true;   // after the game in play
      break;
    case "markPaid": needHost(); state.ledger = {}; state.ledgerResetAt = now; break;
    case "close":
      needHost();
      state.closing = true;
      if (!state.g || state.g.finished) { score(state); finalize(state, now); }
      break;
    default: fail("Unknown request.");
  }
  // the clock: a person who ran out of time plays their lowest card, or digs for one
  if (action.type === "tick" && state.g && !state.g.finished && state.deadline !== null && now >= state.deadline && !isBotSeat(state, state.g.turn)) {
    C.autoMove(state.g);
  }
  settleDown(state, ctx);
  return state;
}

export const roomStatus = state => state.closed ? "closed" : state.started ? "playing" : "waiting";

function shared(state) {
  return {
    game: "cangkul", code: state.code, status: roomStatus(state), settings: state.settings,
    seats: state.seats.map((s, i) => s && { name: s.name, avatar: s.avatar, bot: s.bot, points: state.points[i], money: state.money[i] }),
    hostSeat: seatOf(state, state.hostId), started: state.started, gameNo: state.gameNo, games: state.games,
    nextGameAt: state.nextGameAt, deadline: state.deadline, botAt: state.botAt, actMs: state.settings.actSeconds * 1000,
    chat: state.chat, sessions: state.sessions.slice(-20), ledger: ledgerList(state), ledgerResetAt: state.ledgerResetAt || null,
    sessionNo: state.sessionNo, ending: state.ending, closing: state.closing, closed: state.closed,
    departed: state.departed.map(d => ({ name: d.name, points: d.points })), lastSummary: state.lastSummary || null
  };
}

export function publicState(state) { return { ...shared(state), view: C.viewFor(state.g, -1) }; }

export function personalState(state, playerId) {
  const p = state.players[playerId], seat = seatOf(state, playerId);
  const out = { ...shared(state), view: C.viewFor(state.g, seat), me: seat, playerId, isHost: playerId === state.hostId, myName: p ? p.name : "", left: !!(p && p.left) };
  if (state.closed && state.summary) out.summary = { ...state.summary, rows: state.summary.rows.map(r => ({ ...r, me: p && r.name === p.name })) };
  return out;
}

export function findPlayerByTokenHash(state, hash) {
  for (const [id, p] of Object.entries(state.players)) if (p.tokenHash === hash) return id;
  return null;
}

export function claimHost(state, { hostKeyHash, id, tokenHash }) {
  if (!state.hostKeyHash || state.hostKeyHash !== hostKeyHash) fail("That host link doesn't match this room.");
  if (state.closed) fail("This room was closed for good.");
  const current = state.players[state.hostId];
  if (current && !current.left) { current.tokenHash = tokenHash; return state.hostId; }
  const name = current ? current.name : "Host";
  seatPerson(state, { id, name, tokenHash, avatar: "" });
  state.hostId = id;
  return id;
}
