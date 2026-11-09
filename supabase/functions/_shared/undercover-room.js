// Undercover rooms on the server: a lobby of people, the clue / talk / vote clock, Mr. White's guess, two chat
// channels (everyone, and the out), points per player. Words come from the built-in Indonesian/English list and,
// if the host adds them, the room's own pairs. Each player sees words in the language they pick.
// No bots: clues need a person. No money: the room keeps points (Civilian win 2, Mr. White 6, Undercover 10).
import * as U from "./undercover-engine.js";
import { PAIRS } from "./undercover-words.js";
import { RoomError, REACTIONS, cleanName, cleanAvatar } from "./poker-room.js";

export const LIMITS = { chatLen: 200, chatKeep: 80, chatBurst: 6, chatWindowMs: 10000, nameLen: 16, customPairs: 100, wordLen: 24, guessMs: 30000 };
const fail = msg => { throw new RoomError(msg); };
const LANGS = ["id", "en"];

export function validateSettings(s) {
  const opt = (v, list, d) => list.includes(+v) ? +v : d;
  return {
    mrWhite: s.mrWhite === undefined ? true : !!s.mrWhite,
    lang: LANGS.includes(s.lang) ? s.lang : "id",
    words: ["builtin", "mix", "custom"].includes(s.words) ? s.words : "builtin",
    clueSeconds: opt(s.clueSeconds, [20, 30, 45, 60], 30),
    talkSeconds: opt(s.talkSeconds, [0, 60, 120, 180], 60),
    voteSeconds: opt(s.voteSeconds, [20, 30, 45, 60], 30)
  };
}

export function newRoom({ code, settings, host, now }) {
  const state = {
    game: "undercover", code, settings: validateSettings(settings || {}),
    seats: [], players: {}, hostId: host.id, hostKeyHash: host.hostKeyHash || null,
    g: null, gameNo: 0, inGame: [], ready: {}, scores: {}, deadline: null, phaseKey: null,
    custom: [], used: [], chat: [], chatSeq: 0, closed: false, createdAt: now
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
  if (state.seats.length >= U.MAX_PLAYERS) fail("This room is full.");
  const clean = uniqueName(state, cleanName(name), id);
  state.seats.push({ id, name: clean, avatar: cleanAvatar(avatar) });
  state.players[id] = { name: clean, tokenHash, left: false, chatTimes: [], lang: null };
}

const running = state => !!(state.g && !state.g.finished);
const gameSeat = (state, id) => state.inGame.indexOf(id);
const seatInfo = (state, id) => state.seats.find(s => s.id === id) || state.ghosts?.[id] || null;
const langOf = (state, id) => (state.players[id] && state.players[id].lang) || state.settings.lang;

// ---------- the room's own word pairs ----------
// One pair per line: "Kopi / Teh", "Kopi, Teh", "Kopi - Teh" or "Kopi | Teh".
export function parsePairs(text) {
  const out = [], seen = new Set();
  for (const line of String(text || "").split(/\r?\n/)) {
    const parts = line.split(/\s*[\/,|;]\s*|\s+-\s+|\t+/).map(w => w.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!parts.length) continue;
    if (parts.length !== 2) fail(`"${line.trim().slice(0, 40)}" isn't a pair. Write two words with a / between them.`);
    const [a, b] = parts;
    if (a.length > LIMITS.wordLen || b.length > LIMITS.wordLen) fail(`Keep each word under ${LIMITS.wordLen} letters.`);
    if (U.norm(a) === U.norm(b) || !U.norm(a) || !U.norm(b)) fail(`"${a} / ${b}" needs two different words.`);
    const key = [U.norm(a), U.norm(b)].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a, b]);
  }
  if (out.length > LIMITS.customPairs) fail(`Up to ${LIMITS.customPairs} pairs.`);
  return out;
}

function drawWords(state) {
  const mode = state.settings.words;
  const pool = [];
  if (mode !== "custom") PAIRS.forEach((_, i) => pool.push("b" + i));
  if (mode !== "builtin") state.custom.forEach((_, i) => pool.push("c" + i));
  if (!pool.length) fail("Add some word pairs first, or use the built-in words.");
  let fresh = pool.filter(k => !state.used.includes(k));
  if (!fresh.length) { state.used = state.used.filter(k => !pool.includes(k)); fresh = pool; }
  const r = new Uint32Array(2); globalThis.crypto.getRandomValues(r);
  const key = fresh[r[0] % fresh.length];
  state.used = [...state.used, key].slice(-400);
  const i = +key.slice(1);
  let a, b;
  if (key[0] === "b") { const p = PAIRS[i]; a = { id: p[0], en: p[2] }; b = { id: p[1], en: p[3] }; }
  else { const p = state.custom[i]; a = { id: p[0], en: p[0] }; b = { id: p[1], en: p[1] }; }
  return r[1] % 2 ? { civ: a, und: b } : { civ: b, und: a };
}

// ---------- the clock ----------
function settle(state, now) {
  const g = state.g;
  setClock(state, now);
  for (let guard = 0; guard < 40 && g && !g.finished; guard++) {
    const due = !!(state.deadline && now >= state.deadline);
    if (g.phase === "clue") {
      if (!due) break;
      U.skipClue(g);
    } else if (g.phase === "talk") {
      const people = state.inGame.filter((id, s) => g.alive[s] && state.seats.some(x => x.id === id));
      const allReady = people.length > 0 && people.every(id => state.ready[id]);
      if (!due && !allReady && state.settings.talkSeconds > 0) break;
      U.startVote(g); state.ready = {};
    } else if (g.phase === "vote") {
      if (U.votesWaiting(g).length && !due) break;
      U.resolveVote(g);
    } else if (g.phase === "guess") {
      if (!due) break;
      U.guessTimeout(g);
    } else break;
    setClock(state, now);
  }
  if (g && g.finished && !g.counted) {
    g.counted = true;
    state.inGame.forEach((id, s) => {
      const info = seatInfo(state, id); if (!info) return;
      const k = info.name.toLowerCase(), cur = state.scores[k] || { name: info.name, wins: 0, games: 0, points: 0 };
      const won = g.finished.winners.includes(s);
      state.scores[k] = { ...cur, games: cur.games + 1, wins: cur.wins + (won ? 1 : 0), points: cur.points + (won ? U.POINTS[g.roles[s]] : 0) };
    });
  }
  setClock(state, now);
}
const phaseSeconds = (state, g) => g.phase === "clue" ? state.settings.clueSeconds : g.phase === "talk" ? state.settings.talkSeconds : g.phase === "vote" ? state.settings.voteSeconds : LIMITS.guessMs / 1000;
function setClock(state, now) {
  const g = state.g;
  if (!g || g.finished) { state.deadline = null; state.phaseKey = null; return; }
  const key = `${g.no}:${g.round}:${g.phase}:${g.speaker}:${g.runoff ? g.runoff.join("-") : ""}`;
  if (state.phaseKey === key) return;
  state.phaseKey = key;
  state.phaseStart = now;
  state.deadline = now + phaseSeconds(state, g) * 1000;
}

// ---------- chat ----------
// "all": everyone in the lobby or after a game; during a game only players still in. "grave": the out and onlookers.
function canPost(state, id, channel) {
  const g = state.g, s = gameSeat(state, id);
  const inPlay = running(state) && s >= 0;
  if (channel === "all") return !running(state) || (inPlay && g.alive[s]);
  if (channel === "grave") return running(state) && (s < 0 || !g.alive[s]);
  return false;
}
function canRead(state, id, entry) {
  if (entry.channel === "all") return true;
  const g = state.g, s = gameSeat(state, id);
  if (!g || entry.game !== g.no) return false;
  return s < 0 || !g.alive[s] || !!g.finished;
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
  const engine = fn => { try { fn(); } catch (e) { fail(e.message); } };
  switch (action.type) {
    case "state": case "tick": break;
    case "join": addPerson(state, { id: me, name: action.name, tokenHash: ctx.tokenHash, avatar: action.avatar }); break;
    case "start": {
      needHost();
      if (running(state)) fail("A game is already on.");
      if (state.seats.length < U.MIN_PLAYERS) fail(`Undercover needs at least ${U.MIN_PLAYERS} players (${state.seats.length} here).`);
      const words = drawWords(state);
      state.inGame = state.seats.map(s => s.id).sort(() => Math.random() - 0.5);
      state.ghosts = {};
      state.gameNo += 1;
      state.g = U.startGame(state.gameNo, state.inGame.length, { words, mrWhite: state.settings.mrWhite });
      state.ready = {}; state.phaseKey = null;
      break;
    }
    case "clue": needPlaying(); engine(() => U.clue(state.g, mySeat, action.text, { spoken: !!action.spoken })); break;
    case "vote": needPlaying(); engine(() => U.vote(state.g, mySeat, action.target)); break;
    case "guess": needPlaying(); engine(() => U.guess(state.g, mySeat, action.text)); break;
    case "ready":
      needPlaying();
      if (state.g.phase !== "talk" || !state.g.alive[mySeat]) fail("You can't do that now.");
      state.ready[me] = !state.ready[me];
      break;
    case "toVote": needHost(); if (!running(state) || state.g.phase !== "talk") fail("It isn't talking time."); U.startVote(state.g); state.ready = {}; break;
    case "settings":
      needHost();
      if (running(state)) fail("Change the settings between games.");
      state.settings = validateSettings({ ...state.settings, ...action.settings });
      break;
    case "pairs":
      needHost();
      if (running(state)) fail("Change the words between games.");
      state.custom = parsePairs(action.text);
      state.used = state.used.filter(k => k[0] !== "c");
      if (!state.custom.length && state.settings.words === "custom") state.settings = { ...state.settings, words: "builtin" };
      break;
    case "prefs": {
      inRoom();
      const seat = state.seats.find(s => s.id === me);
      if (seat && action.avatar !== undefined) seat.avatar = cleanAvatar(action.avatar);
      if (action.lang !== undefined) state.players[me].lang = LANGS.includes(action.lang) ? action.lang : null;
      break;
    }
    case "leave": {
      inRoom();
      const p = state.players[me];
      if (running(state) && mySeat >= 0) { state.ghosts[me] = { ...seatInfo(state, me) }; U.leave(state.g, mySeat); }
      state.seats = state.seats.filter(s => s.id !== me);
      p.left = true;
      if (me === state.hostId && state.seats.length) state.hostId = state.seats[0].id;
      break;
    }
    case "chat": {
      const channel = action.channel === "grave" ? "grave" : "all";
      if (!canPost(state, me, channel)) fail(channel === "all" ? "You're out: talk in the out chat." : "You can't post there.");
      const text = String(action.text || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LIMITS.chatLen);
      if (!text) fail("Type a message first.");
      addChat(state, me, { kind: "msg", channel, text }, now);
      break;
    }
    case "react":
      if (!REACTIONS.includes(action.emoji)) fail("Pick one of the reactions.");
      if (!canPost(state, me, "all")) fail("Only players still in can react.");
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
    game: "undercover", code: state.code, status: roomStatus(state), settings: state.settings, closed: state.closed,
    lobby: state.seats.map(s => ({ name: s.name, avatar: s.avatar, host: s.id === state.hostId, playing: state.inGame.includes(s.id) && running(state) })),
    players: state.inGame.map(id => { const s = seatInfo(state, id) || { name: "?", avatar: "" }; return { name: s.name, avatar: s.avatar, here: state.seats.some(x => x.id === id) }; }),
    ready: g && g.phase === "talk" ? state.inGame.map(id => !!state.ready[id]) : [],
    gameNo: state.gameNo, running: running(state), deadline: state.deadline,
    phaseMs: g && !g.finished ? phaseSeconds(state, g) * 1000 : 0,
    customCount: state.custom.length, builtinCount: PAIRS.length,
    counts: g ? { undercover: g.roles.filter(r => r === "undercover").length, white: g.roles.filter(r => r === "white").length } : null,
    scores: Object.values(state.scores).sort((a, b) => b.points - a.points || b.wins - a.wins)
  };
}

// The public copy (sent to everyone listening) never carries words, roles of players still in, or chat.
// (Seat -1 sees what an onlooker sees: roles of players already out, the words only once the game is over.)
export function publicState(state) { return { ...shared(state), view: U.viewFor(state.g, -1, state.settings.lang), chat: [] }; }

export function personalState(state, playerId) {
  const p = state.players[playerId], seat = gameSeat(state, playerId);
  const lang = langOf(state, playerId);
  return {
    ...shared(state), view: U.viewFor(state.g, seat, lang), me: seat, playerId, isHost: playerId === state.hostId,
    myName: p ? p.name : "", left: !!(p && p.left), lang, myLang: p ? p.lang : null,
    chat: state.chat.filter(c => canRead(state, playerId, c)),
    canPost: { all: canPost(state, playerId, "all"), grave: canPost(state, playerId, "grave") },
    myReady: !!state.ready[playerId],
    customPairs: playerId === state.hostId ? state.custom : null
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
