// Werewolf rooms on the server: a lobby of people (and optional bots), the game's night / day / vote clock,
// bot decisions, three chat channels (everyone, wolves, the graveyard), wins per player. Pure functions over JSON.
// No money here: it's for fun, and the room keeps a tally of who won how often.
import * as W from "./werewolf-engine.js";
import { RoomError, REACTIONS, cleanName, cleanAvatar } from "./poker-room.js";

export const LIMITS = { chatLen: 200, chatKeep: 80, chatBurst: 6, chatWindowMs: 10000, nameLen: 16 };
const fail = msg => { throw new RoomError(msg); };
const BOT_NAMES = ["Rosa", "Kenji", "Amara", "Luis", "Priya", "Otto", "Mei", "Walt", "Nadia", "Greta", "Bram", "Ines"];
const pick = a => a[Math.floor(Math.random() * a.length)];

export function validateSettings(s) {
  const opt = (v, list, d) => list.includes(+v) ? +v : d;
  return {
    nightSeconds: opt(s.nightSeconds, [30, 45, 60], 45),
    daySeconds: opt(s.daySeconds, [60, 120, 180, 300], 120),
    voteSeconds: opt(s.voteSeconds, [30, 45, 60], 45),
    bots: opt(s.bots, [0, 5, 6, 7, 8, 9, 10], 0)          // 0 = people only; otherwise top the table up to this size
  };
}

export function newRoom({ code, settings, host, now }) {
  const state = {
    game: "werewolf", code, settings: validateSettings(settings || {}),
    seats: [], players: {}, hostId: host.id, hostKeyHash: host.hostKeyHash || null,
    g: null, gameNo: 0, inGame: [], ready: {}, wins: {}, deadline: null, phaseKey: null,
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
  if (state.seats.filter(s => !s.bot).length >= W.MAX_PLAYERS) fail("This room is full.");
  const clean = uniqueName(state, cleanName(name), id);
  state.seats.push({ id, name: clean, avatar: cleanAvatar(avatar), bot: false });
  state.players[id] = { name: clean, tokenHash, left: false, chatTimes: [] };
}

const running = state => !!(state.g && !state.g.finished);
const gameSeat = (state, id) => state.inGame.indexOf(id);
const seatInfo = (state, id) => state.seats.find(s => s.id === id) || state.ghosts?.[id] || null;
const isBot = (state, gs) => { const id = state.inGame[gs]; return !!(id && id.startsWith("bot")); };

// ---------- bots ----------
function botNight(state) {
  const g = state.g;
  for (const s of W.nightWaiting(g)) {
    if (!isBot(state, s)) continue;
    const targets = W.nightTargets(g, s);
    if (!targets.length) continue;
    let t;
    if (g.roles[s] === "wolf") { const chosen = Object.values(g.night.wolves); t = chosen.length ? chosen[0] : pick(targets); }
    else if (g.roles[s] === "doctor") t = targets.includes(s) && Math.random() < 0.35 ? s : pick(targets);
    else t = pick(targets);
    W.nightAction(g, s, t);
  }
}
function botVotes(state) {
  const g = state.g;
  for (const s of W.votesWaiting(g)) {
    if (!isBot(state, s)) continue;
    const others = g.alive.map((a, t) => a && t !== s ? t : -1).filter(t => t >= 0);
    const tally = {};
    Object.values(g.votes).forEach(t => { if (t >= 0) tally[t] = (tally[t] || 0) + 1; });
    const leading = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([t]) => +t);
    let t;
    const known = g.roles[s] === "seer" ? g.seen.find(x => x.wolf && g.alive[x.target]) : null;
    if (known) t = known.target;
    else if (g.roles[s] === "wolf") t = leading.find(x => g.roles[x] !== "wolf" && x !== s) ?? pick(others.filter(x => g.roles[x] !== "wolf"));
    else t = Math.random() < 0.1 ? -1 : (leading.find(x => x !== s) !== undefined && Math.random() < 0.5 ? leading.find(x => x !== s) : pick(others));
    W.vote(g, s, t ?? -1);
  }
}

// ---------- the clock ----------
// With nobody alive but bots, each phase still takes a few seconds so the dead and onlookers can follow.
const BOT_ONLY_MS = { night: 4000, day: 6000, vote: 4000 };
// A night always lasts a little while, so how fast it ends gives nothing away about who has a night role.
const NIGHT_MIN_MS = 8000;
const peopleAlive = state => !!state.g && state.inGame.some((id, s) => state.g.alive[s] && !isBot(state, s));

function settle(state, now) {
  const g = state.g;
  setClock(state, now);                      // a phase that just began gets its start time and deadline first
  for (let guard = 0; guard < 10 && g && !g.finished; guard++) {
    const due = !!(state.deadline && now >= state.deadline);
    if (!peopleAlive(state) && !due) break;
    if (g.phase === "night") {
      botNight(state);
      if (W.nightWaiting(g).length && !due) break;
      const earliest = (state.phaseStart || 0) + NIGHT_MIN_MS;
      if (!due && peopleAlive(state) && now < earliest) { state.deadline = Math.min(state.deadline || earliest, earliest); break; }
      W.resolveNight(g); state.ready = {};
      setClock(state, now);
      continue;
    }
    if (g.phase === "day") {
      const people = state.inGame.map((id, s) => g.alive[s] && !isBot(state, s) ? id : null).filter(Boolean);
      const allReady = people.length > 0 && people.every(id => state.ready[id]);
      if (!due && !allReady && people.length) break;
      W.startVote(g);
      setClock(state, now);
      continue;
    }
    if (g.phase === "vote") {
      botVotes(state);
      if (W.votesWaiting(g).length && !due) break;
      W.resolveVote(g);
      setClock(state, now);
      continue;
    }
    break;
  }
  if (g && g.finished && !g.counted) {
    g.counted = true;
    state.inGame.forEach((id, s) => {
      const info = seatInfo(state, id); if (!info) return;
      const k = info.name.toLowerCase(), cur = state.wins[k] || { name: info.name, wins: 0, games: 0, bot: !!info.bot };
      state.wins[k] = { ...cur, games: cur.games + 1, wins: cur.wins + (g.finished.winners.includes(s) ? 1 : 0) };
    });
  }
  setClock(state, now);
}
function setClock(state, now) {
  const g = state.g;
  if (!g || g.finished) { state.deadline = null; state.phaseKey = null; return; }
  const key = `${g.no}:${g.phase}:${g.round}`;
  if (state.phaseKey === key) return;
  state.phaseKey = key;
  state.phaseStart = now;
  const sec = g.phase === "night" ? state.settings.nightSeconds : g.phase === "day" ? state.settings.daySeconds : state.settings.voteSeconds;
  state.deadline = now + (peopleAlive(state) ? sec * 1000 : BOT_ONLY_MS[g.phase]);
}

// ---------- chat ----------
// "all": everyone in the lobby or after a game; during a game only the living. "wolves": living wolves.
// "grave": the dead, and anyone sitting this game out.
function canPost(state, id, channel) {
  const g = state.g, s = gameSeat(state, id);
  const inPlay = running(state) && s >= 0;
  if (channel === "all") return !running(state) || (inPlay && g.alive[s]);
  if (channel === "wolves") return inPlay && g.alive[s] && g.roles[s] === "wolf";
  if (channel === "grave") return running(state) && (s < 0 || !g.alive[s]);
  return false;
}
function canRead(state, id, entry) {
  if (entry.channel === "all") return true;
  const g = state.g, s = gameSeat(state, id);
  if (!g || entry.game !== g.no) return entry.channel === "grave" && false;
  if (entry.channel === "wolves") return s >= 0 && (g.roles[s] === "wolf" || !g.alive[s] || !!g.finished);
  if (entry.channel === "grave") return s < 0 || !g.alive[s] || !!g.finished;
  return false;
}
function addChat(state, id, entry, now) {
  const p = state.players[id];
  if (!p || p.left) fail("You're not in this room.");
  p.chatTimes = (p.chatTimes || []).filter(at => now - at < LIMITS.chatWindowMs);
  if (p.chatTimes.length >= LIMITS.chatBurst) fail("Slow down a little.");
  p.chatTimes.push(now);
  state.chatSeq += 1;
  state.chat = [...state.chat, { n: state.chatSeq, name: p.name, at: now, game: state.g ? state.g.no : 0, ...entry }].slice(-LIMITS.chatKeep);
}

// ---------- actions ----------
export function applyAction(state, action, ctx) {
  const me = ctx.playerId, now = ctx.now;
  if (state.closed && !["state", "tick"].includes(action.type)) fail("This room is closed.");
  const inRoom = () => { if (!state.players[me] || state.players[me].left) fail("You're not in this room."); };
  const needHost = () => { if (me !== state.hostId) fail("Only the host can do that."); };
  const mySeat = gameSeat(state, me);
  const needPlaying = () => { inRoom(); if (!running(state) || mySeat < 0) fail("You're not playing this game."); };
  switch (action.type) {
    case "state": case "tick": break;
    case "join": addPerson(state, { id: me, name: action.name, tokenHash: ctx.tokenHash, avatar: action.avatar }); break;
    case "start": {
      needHost();
      if (running(state)) fail("A game is already on.");
      const people = state.seats.filter(s => !s.bot);
      const want = Math.max(W.MIN_PLAYERS, state.settings.bots || 0);
      const bots = state.settings.bots ? Math.max(0, Math.min(W.MAX_PLAYERS, want) - people.length) : 0;
      if (people.length + bots < W.MIN_PLAYERS) fail(`Werewolf needs at least ${W.MIN_PLAYERS} players (${people.length} here). Invite more people, or let bots fill in.`);
      const used = new Set(people.map(p => p.name.toLowerCase()));
      const botSeats = BOT_NAMES.filter(n => !used.has(n.toLowerCase())).slice(0, bots).map((name, i) => ({ id: "bot" + i, name, avatar: "", bot: true }));
      state.seats = [...people, ...botSeats];
      state.inGame = state.seats.map(s => s.id).sort(() => Math.random() - 0.5);
      state.ghosts = {};
      state.gameNo += 1;
      state.g = W.startGame(state.gameNo, state.inGame.length);
      state.ready = {}; state.phaseKey = null;
      break;
    }
    case "act": needPlaying(); try { W.nightAction(state.g, mySeat, action.target); } catch (e) { fail(e.message); } break;
    case "vote": needPlaying(); try { W.vote(state.g, mySeat, action.target); } catch (e) { fail(e.message); } break;
    case "ready":
      needPlaying();
      if (state.g.phase !== "day" || !state.g.alive[mySeat]) fail("You can't do that now.");
      state.ready[me] = !state.ready[me];
      break;
    case "toVote": needHost(); if (!running(state) || state.g.phase !== "day") fail("It isn't daytime."); W.startVote(state.g); setClock(state, now); break;
    case "settings":
      needHost();
      if (running(state)) fail("Change the settings between games.");
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
      const p = state.players[me];
      if (running(state) && mySeat >= 0) { state.ghosts[me] = { ...seatInfo(state, me) }; W.leave(state.g, mySeat); }
      state.seats = state.seats.filter(s => s.id !== me);
      p.left = true;
      if (me === state.hostId) { const next = state.seats.find(s => !s.bot); if (next) state.hostId = next.id; }
      break;
    }
    case "chat": {
      const channel = ["all", "wolves", "grave"].includes(action.channel) ? action.channel : "all";
      if (!canPost(state, me, channel)) fail(channel === "all" ? "Only the living can talk to the village. Use the graveyard chat." : "You can't post there.");
      const text = String(action.text || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LIMITS.chatLen);
      if (!text) fail("Type a message first.");
      addChat(state, me, { kind: "msg", channel, text }, now);
      break;
    }
    case "react":
      if (!REACTIONS.includes(action.emoji)) fail("Pick one of the reactions.");
      if (!canPost(state, me, "all")) fail("Only the living can react.");
      addChat(state, me, { kind: "react", channel: "all", emoji: action.emoji }, now);
      break;
    case "close": needHost(); state.closed = true; break;
    default: fail("Unknown request.");
  }
  settle(state, now);
  return state;
}

export const roomStatus = state => state.closed ? "closed" : running(state) ? "playing" : "waiting";

function shared(state) {
  const g = state.g;
  return {
    game: "werewolf", code: state.code, status: roomStatus(state), settings: state.settings, closed: state.closed,
    lobby: state.seats.map(s => ({ name: s.name, avatar: s.avatar, bot: s.bot, host: s.id === state.hostId, playing: state.inGame.includes(s.id) && running(state) })),
    players: state.inGame.map(id => { const s = seatInfo(state, id) || { name: "?", avatar: "", bot: false }; return { name: s.name, avatar: s.avatar, bot: !!s.bot, here: state.seats.some(x => x.id === id) }; }),
    ready: g && g.phase === "day" ? state.inGame.map(id => !!state.ready[id]) : [],
    gameNo: state.gameNo, running: running(state), deadline: state.deadline,
    phaseMs: g ? (g.phase === "night" ? state.settings.nightSeconds : g.phase === "day" ? state.settings.daySeconds : state.settings.voteSeconds) * 1000 : 0,
    wins: Object.values(state.wins).sort((a, b) => b.wins - a.wins || a.games - b.games)
  };
}

// The public copy (sent to everyone listening) never carries roles, night choices or private chat.
export function publicState(state) { return { ...shared(state), view: W.viewFor(state.g, -1), chat: [] }; }

export function personalState(state, playerId) {
  const p = state.players[playerId], seat = gameSeat(state, playerId);
  const g = state.g;
  const view = W.viewFor(g, seat);
  return {
    ...shared(state), view, me: seat, playerId, isHost: playerId === state.hostId, myName: p ? p.name : "", left: !!(p && p.left),
    chat: state.chat.filter(c => canRead(state, playerId, c)),
    canPost: { all: canPost(state, playerId, "all"), wolves: canPost(state, playerId, "wolves"), grave: canPost(state, playerId, "grave") },
    myReady: !!state.ready[playerId]
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
