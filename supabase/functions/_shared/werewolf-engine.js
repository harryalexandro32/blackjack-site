// Werewolf (the simple version), as a pure JSON-friendly engine. Seats 0..n-1 for the players in this game.
//
// Roles: Werewolves (1 for 5-6 players, 2 for 7-9, 3 for 10-12), one Seer, one Doctor, the rest Villagers.
// Night: the wolves pick someone to kill (most votes among them), the Seer learns whether one player is a wolf,
// the Doctor protects one player (not the same one two nights running). Dawn: the victim dies unless protected.
// Day: everyone talks, then votes; the most votes is voted out (a tie, or skips winning, means nobody).
// A player who dies has their role revealed. The village wins when every wolf is dead; the wolves win when they
// are as many as everyone else.

export const ROLES = { wolf: "Werewolf", seer: "Seer", doctor: "Doctor", villager: "Villager" };
export const MIN_PLAYERS = 5, MAX_PLAYERS = 12;
export const wolvesFor = n => n >= 10 ? 3 : n >= 7 ? 2 : 1;

function randInt(n) {
  const r = new Uint32Array(1);
  globalThis.crypto.getRandomValues(r);
  return r[0] % n;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// roles: a fixed list for tests, otherwise dealt at random
export function startGame(no, n, { roles = null } = {}) {
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`Werewolf needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players.`);
  const deck = roles ? roles.slice() : shuffle([...Array(wolvesFor(n)).fill("wolf"), "seer", "doctor", ...Array(n - wolvesFor(n) - 2).fill("villager")]);
  return {
    no, n, roles: deck, alive: Array(n).fill(true), round: 1, phase: "night",
    night: { wolves: {}, seer: null, doctor: null }, lastProtected: -1, seen: [],
    votes: {}, log: [{ type: "night", round: 1 }], finished: null
  };
}

const living = g => [...Array(g.n).keys()].filter(s => g.alive[s]);
const isWolf = (g, s) => g.roles[s] === "wolf";

// Who still has to do something tonight: living wolves (each picks), the living Seer and Doctor.
export function nightWaiting(g) {
  if (g.phase !== "night") return [];
  return living(g).filter(s => (isWolf(g, s) && g.night.wolves[s] === undefined) || (g.roles[s] === "seer" && g.night.seer === null) || (g.roles[s] === "doctor" && g.night.doctor === null));
}
// Who a player may pick tonight.
export function nightTargets(g, s) {
  if (g.phase !== "night" || !g.alive[s]) return [];
  const r = g.roles[s];
  if (r === "wolf") return living(g).filter(t => !isWolf(g, t));
  if (r === "seer") return living(g).filter(t => t !== s && !g.seen.some(x => x.target === t));
  if (r === "doctor") return living(g).filter(t => t !== g.lastProtected);
  return [];
}

export function nightAction(g, s, target) {
  if (g.phase !== "night") throw new Error("It isn't night.");
  if (!g.alive[s]) throw new Error("The dead don't act.");
  if (g.roles[s] === "villager") throw new Error("Villagers sleep through the night.");
  const t = +target;
  if (!nightTargets(g, s).includes(t)) throw new Error("You can't pick that player.");
  const r = g.roles[s];
  if (r === "wolf") g.night.wolves[s] = t;
  else if (r === "seer") { if (g.night.seer !== null) throw new Error("You've already looked tonight."); g.night.seer = t; g.seen.push({ round: g.round, target: t, wolf: isWolf(g, t) }); }
  else if (r === "doctor") g.night.doctor = t;
  else throw new Error("Villagers sleep through the night.");
  return g;
}

// Dawn: the wolves' choice dies unless the Doctor protected them.
export function resolveNight(g) {
  if (g.phase !== "night") return g;
  const tally = {};
  for (const t of Object.values(g.night.wolves)) tally[t] = (tally[t] || 0) + 1;
  let target = null, best = 0;
  for (const [t, n] of Object.entries(tally)) if (n > best || (n === best && randInt(2))) { best = n; target = +t; }
  const saved = target !== null && g.night.doctor === target;
  if (target !== null && !saved) g.alive[target] = false;
  g.lastProtected = g.night.doctor ?? -1;
  g.log.push({ type: "dawn", round: g.round, killed: target !== null && !saved ? target : null, role: target !== null && !saved ? g.roles[target] : null, saved });
  g.night = { wolves: {}, seer: null, doctor: null };
  if (checkWin(g)) return g;
  g.phase = "day"; g.votes = {};
  return g;
}

// The talking is over: time to vote.
export function startVote(g) {
  if (g.phase !== "day") return g;
  g.phase = "vote"; g.votes = {};
  g.log.push({ type: "vote open", round: g.round });
  return g;
}
// target = a living player, or -1 to skip
export function vote(g, s, target) {
  if (g.phase !== "vote") throw new Error("It isn't time to vote.");
  if (!g.alive[s]) throw new Error("The dead don't vote.");
  const t = +target;
  if (t !== -1 && (!g.alive[t] || t === s)) throw new Error("You can't vote for that player.");
  g.votes[s] = t;
  return g;
}
export const votesWaiting = g => g.phase === "vote" ? living(g).filter(s => g.votes[s] === undefined) : [];

export function resolveVote(g) {
  if (g.phase !== "vote") return g;
  const tally = {};
  for (const t of Object.values(g.votes)) tally[t] = (tally[t] || 0) + 1;
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  let out = null;
  if (ranked.length && +ranked[0][0] !== -1 && (ranked.length === 1 || ranked[1][1] < ranked[0][1])) out = +ranked[0][0];
  if (out !== null) g.alive[out] = false;
  g.log.push({ type: "voted", round: g.round, out, role: out !== null ? g.roles[out] : null, votes: { ...g.votes } });
  g.votes = {};
  if (checkWin(g)) return g;
  g.round += 1; g.phase = "night";
  g.log.push({ type: "night", round: g.round });
  return g;
}

// A player who leaves the game dies on the spot (their role is revealed).
export function leave(g, s) {
  if (g.finished || !g.alive[s]) return g;
  g.alive[s] = false;
  delete g.night.wolves[s]; delete g.votes[s];
  g.log.push({ type: "left", seat: s, role: g.roles[s] });
  checkWin(g);
  return g;
}

function checkWin(g) {
  const wolves = living(g).filter(s => isWolf(g, s)).length, others = living(g).length - wolves;
  if (wolves === 0) return finish(g, "village");
  if (wolves >= others) return finish(g, "wolves");
  return false;
}
function finish(g, side) {
  g.finished = { winner: side, winners: [...Array(g.n).keys()].filter(s => (side === "wolves") === isWolf(g, s)) };
  g.phase = "done";
  g.log.push({ type: "win", side });
  return true;
}

// What one player may see: their own role, fellow wolves, what the Seer has learned, everyone's role once dead
// (the dead see all roles), all roles at the end.
export function viewFor(g, s) {
  if (!g) return null;
  const meDead = s >= 0 && !g.alive[s];
  const show = t => g.finished || !g.alive[t] || t === s || meDead || (s >= 0 && isWolf(g, s) && isWolf(g, t));
  return {
    no: g.no, n: g.n, round: g.round, phase: g.phase, alive: g.alive,
    roles: g.roles.map((r, t) => show(t) ? r : null),
    myRole: s >= 0 ? g.roles[s] : null,
    targets: s >= 0 ? nightTargets(g, s) : [],
    myNight: s >= 0 && g.phase === "night" ? (isWolf(g, s) ? g.night.wolves[s] ?? null : g.roles[s] === "seer" ? g.night.seer : g.roles[s] === "doctor" ? g.night.doctor : null) : null,
    wolfVotes: s >= 0 && isWolf(g, s) ? g.night.wolves : null,
    seen: s >= 0 && g.roles[s] === "seer" ? g.seen : [],
    lastProtected: s >= 0 && g.roles[s] === "doctor" ? g.lastProtected : -1,
    votes: g.phase === "vote" ? g.votes : {},
    nightWaiting: g.phase === "night" ? nightWaiting(g).length : 0,
    log: g.log, finished: g.finished
  };
}
