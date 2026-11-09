// Checkers rooms on the server: two players (the first two people in the room; anyone else watches), a move
// clock, colours swapping every game, a tally of wins, chat. No money. Pure functions over JSON, like the others.
import * as K from "./checkers-engine.js";
import { checkersMove } from "./checkers-bot.js";
import { RoomError, REACTIONS, cleanName, cleanAvatar } from "./poker-room.js";

export const LIMITS = { chatLen: 200, chatKeep: 60, chatBurst: 6, chatWindowMs: 10000, nameLen: 16, maxPeople: 12 };
const fail = msg => { throw new RoomError(msg); };

export function validateSettings(s) {
  return {
    rules: K.RULES.includes(s.rules) ? s.rules : "dam",
    moveSeconds: [0, 30, 60, 120].includes(+s.moveSeconds) ? +s.moveSeconds : 60
  };
}

export function newRoom({ code, settings, host, now }) {
  const state = {
    game: "checkers", code, settings: validateSettings(settings || {}),
    seats: [], players: {}, hostId: host.id, hostKeyHash: host.hostKeyHash || null,
    g: null, gameNo: 0, inGame: [], wins: {}, deadline: null, deadlineKey: null,
    chat: [], chatSeq: 0, closed: false, createdAt: now
  };
  addPerson(state, host);
  return state;
}

function uniqueName(state, name, selfId) {
  const taken = new Set(state.seats.filter(s => s.id !== selfId).map(s => s.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let k = 2; ; k++) { const n = `${name.slice(0, LIMITS.nameLen - 2)} ${k}`; if (!taken.has(n.toLowerCase())) return n; }
}
function addPerson(state, { id, name, tokenHash, avatar }) {
  if (state.seats.length >= LIMITS.maxPeople) fail("This room is full.");
  const clean = uniqueName(state, cleanName(name), id);
  state.seats.push({ id, name: clean, avatar: cleanAvatar(avatar) });
  state.players[id] = { name: clean, tokenHash, left: false, chatTimes: [] };
}

const running = state => !!(state.g && !state.g.finished);
const seatInfo = (state, id) => state.seats.find(s => s.id === id) || state.ghosts?.[id] || null;

function startGame(state) {
  const people = state.seats.map(s => s.id);
  // the same two keep playing while both are here; otherwise the first two in the room
  let pair = state.inGame.filter(id => people.includes(id));
  if (pair.length < 2) pair = people.slice(0, 2);
  if (pair.length < 2) fail("Checkers needs two players: share the code with a friend.");
  state.gameNo += 1;
  // colours swap every game: whoever had the second move goes first now
  const order = state.inGame.length === 2 && pair.includes(state.inGame[0]) && pair.includes(state.inGame[1]) ? [state.inGame[1], state.inGame[0]] : pair;
  state.inGame = order;
  state.ghosts = {};
  state.g = K.startGame(state.gameNo, { rules: state.settings.rules });
  state.deadlineKey = null;
}

// ---------- the clock: out of time, a move is made for you ----------
function settle(state, now) {
  const g = state.g;
  for (let guard = 0; guard < 4 && g && !g.finished; guard++) {
    setClock(state, now);
    if (!state.deadline || now < state.deadline) break;
    const seat = g.turn;
    K.play(g, seat, checkersMove(g, seat, "normal"));
    g.log.push({ type: "timeout", seat });
  }
  if (g && g.finished && !g.counted) {
    g.counted = true;
    state.inGame.forEach((id, s) => {
      const info = seatInfo(state, id); if (!info) return;
      const k = info.name.toLowerCase(), cur = state.wins[k] || { name: info.name, wins: 0, draws: 0, games: 0 };
      state.wins[k] = { ...cur, games: cur.games + 1, wins: cur.wins + (g.finished.winner === s ? 1 : 0), draws: cur.draws + (g.finished.winner === -1 ? 1 : 0) };
    });
  }
  setClock(state, now);
}
function setClock(state, now) {
  const g = state.g;
  if (!g || g.finished || !state.settings.moveSeconds) { state.deadline = null; state.deadlineKey = null; return; }
  const key = `${g.no}:${g.moves}`;
  if (state.deadlineKey === key) return;
  state.deadlineKey = key;
  state.deadline = now + state.settings.moveSeconds * 1000;
}

function addChat(state, id, entry, now) {
  const p = state.players[id];
  if (!p || p.left) fail("You're not in this room.");
  p.chatTimes = (p.chatTimes || []).filter(at => now - at < LIMITS.chatWindowMs);
  if (p.chatTimes.length >= LIMITS.chatBurst) fail("Slow down a little.");
  p.chatTimes.push(now);
  state.chatSeq += 1;
  state.chat = [...state.chat, { n: state.chatSeq, name: p.name, at: now, ...entry }].slice(-LIMITS.chatKeep);
}

export function applyAction(state, action, ctx) {
  const me = ctx.playerId, now = ctx.now;
  if (state.closed && !["state", "tick"].includes(action.type)) fail("This room is closed.");
  const inRoom = () => { if (!state.players[me] || state.players[me].left) fail("You're not in this room."); };
  const needHost = () => { if (me !== state.hostId) fail("Only the host can do that."); };
  const side = running(state) ? state.inGame.indexOf(me) : -1;
  switch (action.type) {
    case "state": case "tick": break;
    case "join": addPerson(state, { id: me, name: action.name, tokenHash: ctx.tokenHash, avatar: action.avatar }); break;
    case "start":
      inRoom();
      if (running(state)) fail("A game is already on.");
      // the host starts the first game; after that either player can call a rematch
      if (me !== state.hostId && !(state.g && state.inGame.includes(me))) fail("Only the host can start.");
      startGame(state);
      break;
    case "move":
      inRoom();
      if (side < 0) fail("You're watching this game.");
      try { K.play(state.g, side, { from: +action.from, to: +action.to, path: Array.isArray(action.path) ? action.path.map(Number) : undefined }); } catch (e) { fail(e.message); }
      break;
    case "resign":
      inRoom();
      if (side < 0) fail("You're not playing.");
      K.resign(state.g, side);
      break;
    case "settings":
      needHost();
      if (running(state)) fail("Change the rules between games.");
      state.settings = validateSettings({ ...state.settings, ...action.settings });
      break;
    case "prefs": {
      inRoom();
      const seat = state.seats.find(s => s.id === me);
      if (seat && action.avatar !== undefined) seat.avatar = cleanAvatar(action.avatar);
      break;
    }
    case "leave": {
      inRoom();
      if (side >= 0) { state.ghosts[me] = { ...seatInfo(state, me) }; K.resign(state.g, side); }
      state.seats = state.seats.filter(s => s.id !== me);
      state.players[me].left = true;
      if (me === state.hostId && state.seats.length) state.hostId = state.seats[0].id;
      break;
    }
    case "chat": {
      inRoom();
      const text = String(action.text || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LIMITS.chatLen);
      if (!text) fail("Type a message first.");
      addChat(state, me, { kind: "msg", text }, now);
      break;
    }
    case "react":
      inRoom();
      if (!REACTIONS.includes(action.emoji)) fail("Pick one of the reactions.");
      addChat(state, me, { kind: "react", emoji: action.emoji }, now);
      break;
    case "close": needHost(); state.closed = true; break;
    default: fail("Unknown request.");
  }
  settle(state, now);
  return state;
}

export const roomStatus = state => state.closed ? "closed" : running(state) ? "playing" : "waiting";

export function publicState(state) {
  return {
    game: "checkers", code: state.code, status: roomStatus(state), settings: state.settings, closed: state.closed,
    lobby: state.seats.map(s => ({ name: s.name, avatar: s.avatar, host: s.id === state.hostId, playing: state.inGame.includes(s.id) })),
    players: state.inGame.map(id => { const s = seatInfo(state, id) || { name: "?", avatar: "" }; return { name: s.name, avatar: s.avatar, here: state.seats.some(x => x.id === id) }; }),
    view: K.viewFor(state.g), gameNo: state.gameNo, running: running(state), deadline: state.deadline,
    moveMs: state.settings.moveSeconds * 1000,
    wins: Object.values(state.wins).sort((a, b) => b.wins - a.wins || a.games - b.games),
    chat: []
  };
}

export function personalState(state, playerId) {
  const p = state.players[playerId];
  return {
    ...publicState(state), chat: state.chat, me: state.g ? state.inGame.indexOf(playerId) : -1, playerId,
    isHost: playerId === state.hostId, myName: p ? p.name : "", left: !!(p && p.left)
  };
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
  addPerson(state, { id, name: current ? current.name : "Host", tokenHash, avatar: "" });
  state.hostId = id;
  return id;
}
