// Heist rooms on the server: a lobby of people (and optional bots), the pick / vote / heist clock, bot decisions,
// two chat channels (everyone, and the cops), a tally of wins. No money. Pure functions over JSON.
// Someone who leaves mid-game is played by a bot until the game ends, so the table can finish.
import * as H from "./heist-engine.js";
import { RoomError, REACTIONS, cleanName, cleanAvatar } from "./poker-room.js";

export const LIMITS = { chatLen: 200, chatKeep: 80, chatBurst: 6, chatWindowMs: 10000, nameLen: 16, snipeMs: 60000 };
const fail = msg => { throw new RoomError(msg); };
const BOT_NAMES = ["Rosa", "Kenji", "Amara", "Luis", "Priya", "Otto", "Mei", "Walt", "Nadia", "Greta"];
const rand = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
const pickOne = a => a[Math.floor(rand() * a.length)];
// With only bots left to act, each step still takes a moment so people can follow.
const BOT_MS = { pick: 2500, vote: 2000, heist: 1800, snipe: 2500 };

export function validateSettings(s) {
  const opt = (v, list, d) => list.includes(+v) ? +v : d;
  return {
    special: !!s.special,
    pickSeconds: opt(s.pickSeconds, [60, 90, 120, 180], 90),
    voteSeconds: opt(s.voteSeconds, [20, 30, 45], 30),
    heistSeconds: opt(s.heistSeconds, [15, 20, 30], 20),
    bots: opt(s.bots, [0, 5, 6, 7, 8, 9, 10], 0)
  };
}

export function newRoom({ code, settings, host, now }) {
  const state = {
    game: "heist", code, settings: validateSettings(settings || {}),
    seats: [], players: {}, hostId: host.id, hostKeyHash: host.hostKeyHash || null,
    g: null, gameNo: 0, inGame: [], botSeats: [], wins: {}, deadline: null, phaseKey: null, phaseStart: null,
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
  if (state.seats.filter(s => !s.bot).length >= H.MAX_PLAYERS) fail("This room is full.");
  const clean = uniqueName(state, cleanName(name), id);
  state.seats.push({ id, name: clean, avatar: cleanAvatar(avatar), bot: false });
  state.players[id] = { name: clean, tokenHash, left: false, chatTimes: [] };
}

const running = state => !!(state.g && !state.g.finished);
const gameSeat = (state, id) => state.inGame.indexOf(id);
const seatInfo = (state, id) => state.seats.find(s => s.id === id) || state.ghosts?.[id] || null;
const isBot = (state, s) => state.botSeats.includes(s);
const people = state => state.inGame.map((id, s) => isBot(state, s) ? -1 : s).filter(s => s >= 0);

// ---------- bots ----------
// How suspicious each seat looks to one bot: being on failed heists (a crew bot knows it didn't sabotage, so the
// blame falls on the others it went with), being on clean ones, and approving teams that then failed.
function suspicion(g, viewer = -1) {
  const sus = Array(g.n).fill(0);
  const iAmCrew = viewer >= 0 && !H.isCop(g.roles[viewer]);
  for (const e of g.log) {
    if (e.type !== "result") continue;
    const suspects = iAmCrew ? e.team.filter(s => s !== viewer) : e.team;
    if (!e.ok) suspects.forEach(s => sus[s] += e.fails / Math.max(1, suspects.length) * 3);
    else e.team.forEach(s => sus[s] -= 0.25);
  }
  if (viewer >= 0) sus[viewer] = -99;
  const results = g.log.filter(e => e.type === "result");
  for (const e of g.log) if (e.type === "vote" && e.ok) {
    const r = results.find(x => x.heist === e.heist && x.team.join() === e.team.join());
    if (r && !r.ok) e.votes.forEach((y, s) => { if (y && !e.team.includes(s)) sus[s] += 0.4; });
  }
  return sus;
}
function botPick(g, s) {
  const size = H.teamSize(g), sus = suspicion(g, s), me = g.roles[s];
  const others = [...Array(g.n).keys()].filter(t => t !== s);
  let pool;
  if (H.isCop(me)) {
    // a cop leader takes themself and otherwise looks trustworthy: the least suspicious non-cops (rarely a second cop)
    pool = others.filter(t => !H.isCop(g.roles[t])).sort((a, b) => sus[a] - sus[b] + (rand() - 0.5) * 0.6);
  } else if (me === "mastermind" && rand() < 0.7) {
    pool = others.filter(t => !H.isCop(g.roles[t])).sort(() => rand() - 0.5);
  } else {
    pool = others.sort((a, b) => sus[a] - sus[b] + (rand() - 0.5) * 0.8);
  }
  return [s, ...pool].slice(0, size);
}
function botVote(g, s) {
  const me = g.roles[s], team = g.team, sus = suspicion(g, s);
  const copsIn = team.filter(t => H.isCop(g.roles[t])).length;
  if (H.isCop(me)) {
    if (copsIn) return true;
    if (g.rejects === H.MAX_REJECTS - 1) return false;      // a fifth rejection hands the cops the game
    return rand() < 0.25;
  }
  if (g.rejects === H.MAX_REJECTS - 1) return true;          // the crew can't afford a fifth rejection
  // the Mastermind uses what it knows, but not every time: voting perfectly would give it away to the Sniper
  if (me === "mastermind" && rand() < 0.55) return !copsIn;
  // approve a team about as clean as the cleanest one possible; a team I'm left off is a risk (a crew member
  // only knows themself), so those get approved reluctantly, more so as rejections pile up
  const others = [...Array(g.n).keys()].filter(t => t !== s).sort((a, b) => sus[a] - sus[b]);
  const best = [s, ...others].slice(0, team.length).reduce((t, x) => t + Math.max(0, sus[x]), 0);
  const mine = team.reduce((t, x) => t + Math.max(0, sus[x]), 0);
  if (team.includes(s)) return mine <= best + 0.4;
  const cleanest = others.slice(0, team.length).reduce((t, x) => t + Math.max(0, sus[x]), 0);
  return mine <= cleanest + 0.2 && rand() < 0.25 + g.rejects * 0.2;
}
function botPlay(g, s) {
  if (!H.isCop(g.roles[s])) return "success";
  const copsOnTeam = g.team.filter(t => H.isCop(g.roles[t]));
  const need = H.needFails(g.n, g.heist);
  // with more cops than needed on the team, the extra ones stay clean to hide
  if (copsOnTeam.length > need && copsOnTeam.indexOf(s) >= need) return "success";
  return rand() < (g.heist === 0 ? 0.6 : 0.92) ? "sabotage" : "success";
}
function botSnipe(g) {
  // the Mastermind tends to vote against teams with cops and for clean ones
  const score = Array(g.n).fill(0);
  for (const e of g.log) if (e.type === "vote") {
    const dirty = e.team.some(t => H.isCop(g.roles[t]));
    e.votes.forEach((y, s) => { score[s] += dirty ? (y ? -1 : 1) : (y ? 0.4 : -0.4); });
  }
  const targets = H.snipeTargets(g);
  return targets.sort((a, b) => score[b] - score[a] + (rand() - 0.5) * 0.5)[0];
}

function botAct(state) {
  const g = state.g;
  if (g.phase === "pick" && isBot(state, g.leader)) H.pick(g, g.leader, botPick(g, g.leader));
  else if (g.phase === "vote") H.votesWaiting(g).filter(s => isBot(state, s)).forEach(s => H.vote(g, s, botVote(g, s)));
  else if (g.phase === "heist") H.playsWaiting(g).filter(s => isBot(state, s)).forEach(s => H.playCard(g, s, botPlay(g, s)));
  else if (g.phase === "snipe" && isBot(state, H.sniperSeat(g))) H.snipe(g, H.sniperSeat(g), botSnipe(g));
}
// Is the game waiting on a person right now?
function waitingOnPeople(state) {
  const g = state.g;
  if (g.phase === "pick") return !isBot(state, g.leader);
  if (g.phase === "vote") return H.votesWaiting(g).some(s => !isBot(state, s));
  if (g.phase === "heist") return H.playsWaiting(g).some(s => !isBot(state, s));
  if (g.phase === "snipe") return !isBot(state, H.sniperSeat(g));
  return false;
}

// ---------- the clock ----------
function settle(state, now) {
  const g = state.g;
  setClock(state, now);
  for (let guard = 0; guard < 12 && g && !g.finished; guard++) {
    const due = !!(state.deadline && now >= state.deadline);
    const before = state.phaseKey;
    if (!waitingOnPeople(state)) {
      // only bots left to act: give the table a moment to see what's happening first
      const ready = (state.phaseStart || 0) + BOT_MS[g.phase];
      if (now < ready) { state.deadline = ready; break; }
      botAct(state);
    } else {
      botAct(state);                       // bots don't keep people waiting
      if (due) {
        // out of time: a bot decides for a late leader or Sniper; missing votes approve, missing cards are Success
        if (g.phase === "pick") H.pick(g, g.leader, botPick(g, g.leader));
        else if (g.phase === "snipe") H.snipe(g, H.sniperSeat(g), botSnipe(g));
      }
    }
    // a clock that ran out belongs to the phase it was set for, not to one that just began
    const late = due && keyOf(g) === before;
    if (g.phase === "vote" && (!H.votesWaiting(g).length || late)) H.resolveVote(g);
    else if (g.phase === "heist" && (!H.playsWaiting(g).length || late)) H.resolveHeist(g);
    setClock(state, now);
    if (state.phaseKey === before) break;
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
const phaseMs = (state, g) => g.phase === "pick" ? state.settings.pickSeconds * 1000 : g.phase === "vote" ? state.settings.voteSeconds * 1000 : g.phase === "heist" ? state.settings.heistSeconds * 1000 : LIMITS.snipeMs;
const keyOf = g => `${g.no}:${g.heist}:${g.phase}:${g.leader}:${g.rejects}`;
function setClock(state, now) {
  const g = state.g;
  if (!g || g.finished) { state.deadline = null; state.phaseKey = null; return; }
  const key = keyOf(g);
  if (state.phaseKey === key) return;
  state.phaseKey = key;
  state.phaseStart = now;
  state.deadline = now + (waitingOnPeople(state) ? phaseMs(state, g) : BOT_MS[g.phase]);
}

// ---------- chat ----------
// "all": everyone. "cops": the cops (and the Sniper) during a game; everyone reads it once the game is over.
function canPost(state, id, channel) {
  const g = state.g, s = gameSeat(state, id);
  if (channel === "all") return true;
  if (channel === "cops") return running(state) && s >= 0 && H.isCop(g.roles[s]);
  return false;
}
function canRead(state, id, entry) {
  if (entry.channel === "all") return true;
  const g = state.g, s = gameSeat(state, id);
  if (!g || entry.game !== g.no) return false;
  return !!g.finished || (s >= 0 && H.isCop(g.roles[s]));
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
  const needPlaying = () => { inRoom(); if (!running(state) || mySeat < 0 || isBot(state, mySeat)) fail("You're not playing this game."); };
  const engine = fn => { try { fn(); } catch (e) { fail(e.message); } };
  switch (action.type) {
    case "state": case "tick": break;
    case "join": addPerson(state, { id: me, name: action.name, tokenHash: ctx.tokenHash, avatar: action.avatar }); break;
    case "start": {
      needHost();
      if (running(state)) fail("A game is already on.");
      const humans = state.seats.filter(s => !s.bot);
      const want = Math.max(H.MIN_PLAYERS, state.settings.bots || 0);
      const bots = state.settings.bots ? Math.max(0, Math.min(H.MAX_PLAYERS, want) - humans.length) : 0;
      if (humans.length + bots < H.MIN_PLAYERS) fail(`Heist needs at least ${H.MIN_PLAYERS} players (${humans.length} here). Invite more people, or let bots fill in.`);
      const used = new Set(humans.map(p => p.name.toLowerCase()));
      const botSeats = BOT_NAMES.filter(n => !used.has(n.toLowerCase())).slice(0, bots).map((name, i) => ({ id: "bot" + i, name, avatar: "", bot: true }));
      state.seats = [...humans, ...botSeats];
      state.inGame = state.seats.map(s => s.id).sort(() => rand() - 0.5);
      state.botSeats = state.inGame.map((id, s) => id.startsWith("bot") ? s : -1).filter(s => s >= 0);
      state.ghosts = {};
      state.gameNo += 1;
      state.g = H.startGame(state.gameNo, state.inGame.length, { special: state.settings.special });
      state.phaseKey = null;
      break;
    }
    case "pick": needPlaying(); engine(() => H.pick(state.g, mySeat, action.team)); break;
    case "vote": needPlaying(); engine(() => H.vote(state.g, mySeat, action.yes)); break;
    case "play": needPlaying(); engine(() => H.playCard(state.g, mySeat, action.card)); break;
    case "snipe": needPlaying(); engine(() => H.snipe(state.g, mySeat, action.target)); break;
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
      if (running(state) && mySeat >= 0) { state.ghosts[me] = { ...seatInfo(state, me) }; if (!state.botSeats.includes(mySeat)) state.botSeats.push(mySeat); state.phaseKey = null; }
      state.seats = state.seats.filter(s => s.id !== me);
      state.players[me].left = true;
      if (me === state.hostId) { const next = state.seats.find(s => !s.bot); if (next) state.hostId = next.id; }
      break;
    }
    case "chat": {
      inRoom();
      const channel = action.channel === "cops" ? "cops" : "all";
      if (!canPost(state, me, channel)) fail("You can't post there.");
      const text = String(action.text || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LIMITS.chatLen);
      if (!text) fail("Type a message first.");
      addChat(state, me, { kind: "msg", channel, text }, now);
      break;
    }
    case "react":
      inRoom();
      if (!REACTIONS.includes(action.emoji)) fail("Pick one of the reactions.");
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
    game: "heist", code: state.code, status: roomStatus(state), settings: state.settings, closed: state.closed,
    lobby: state.seats.map(s => ({ name: s.name, avatar: s.avatar, bot: s.bot, host: s.id === state.hostId, playing: state.inGame.includes(s.id) && running(state) })),
    players: state.inGame.map((id, s) => { const x = seatInfo(state, id) || { name: "?", avatar: "", bot: false }; return { name: x.name, avatar: x.avatar, bot: !!x.bot, here: state.seats.some(y => y.id === id), auto: isBot(state, s) && !x.bot }; }),
    gameNo: state.gameNo, running: running(state), deadline: state.deadline,
    phaseMs: g && !g.finished ? (state.phaseStart && state.deadline ? state.deadline - state.phaseStart : phaseMs(state, g)) : 0,
    wins: Object.values(state.wins).sort((a, b) => b.wins - a.wins || a.games - b.games)
  };
}

export function publicState(state) { return { ...shared(state), view: H.viewFor(state.g, -1), chat: [] }; }

export function personalState(state, playerId) {
  const p = state.players[playerId], seat = gameSeat(state, playerId);
  return {
    ...shared(state), view: H.viewFor(state.g, seat), me: seat, playerId, isHost: playerId === state.hostId,
    myName: p ? p.name : "", left: !!(p && p.left),
    chat: state.chat.filter(c => canRead(state, playerId, c)),
    canPost: { all: canPost(state, playerId, "all"), cops: canPost(state, playerId, "cops") }
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
