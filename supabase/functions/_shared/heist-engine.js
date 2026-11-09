// Heist, as a pure JSON-friendly engine. Seats 0..n-1 for the players in this game (5 to 10).
//
// A crew of thieves pulls up to 5 heists. Some players are secretly undercover cops, and the cops know each other.
// Each heist: the leader picks a team of the size shown; everyone votes in the open to approve the team or not
// (a strict majority approves). Approved: the team members each secretly play Success or Sabotage. Crew members
// can only play Success; cops may play either. One Sabotage and the heist fails (with 7 or more players, the
// 4th heist needs two). Not approved: leadership passes to the next player; five rejected teams in a row and
// the cops win. The crew wins with 3 successful heists, the cops with 3 failed ones.
//
// Special roles (a host option): the Mastermind is crew and secretly knows who the cops are; the Sniper is a cop.
// If the crew pulls off 3 heists, the Sniper gets one shot: name the Mastermind and the cops win after all.

export const MIN_PLAYERS = 5, MAX_PLAYERS = 10;
export const ROLES = { crew: "Crew", cop: "Undercover cop", mastermind: "Mastermind", sniper: "Sniper" };
export const COPS = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };
export const TEAMS = { 5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4], 8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5] };
export const MAX_REJECTS = 5;
export const isCop = r => r === "cop" || r === "sniper";
export const needFails = (n, heist) => heist === 3 && n >= 7 ? 2 : 1;

function randInt(n) {
  const r = new Uint32Array(1);
  globalThis.crypto.getRandomValues(r);
  return r[0] % n;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function startGame(no, n, { special = false, roles = null, leader = null } = {}) {
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`Heist needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players.`);
  const cops = COPS[n];
  const deck = roles ? roles.slice() : shuffle([
    ...Array(cops - (special ? 1 : 0)).fill("cop"), ...(special ? ["sniper", "mastermind"] : []),
    ...Array(n - cops - (special ? 1 : 0)).fill("crew")
  ]);
  return {
    no, n, roles: deck, special: deck.includes("mastermind"),
    leader: leader !== null ? leader : randInt(n), heist: 0, results: [], rejects: 0,
    phase: "pick", team: [], votes: {}, plays: {}, log: [{ type: "heist", heist: 0 }], finished: null
  };
}

export const teamSize = g => TEAMS[g.n][g.heist];

export function pick(g, s, team) {
  if (g.phase !== "pick") throw new Error("It isn't time to pick a team.");
  if (s !== g.leader) throw new Error("Only the leader picks the team.");
  const t = [...new Set((team || []).map(Number))].filter(x => Number.isInteger(x) && x >= 0 && x < g.n);
  if (t.length !== teamSize(g)) throw new Error(`Pick ${teamSize(g)} players for this heist.`);
  g.team = t.sort((a, b) => a - b);
  g.phase = "vote"; g.votes = {};
  g.log.push({ type: "team", heist: g.heist, leader: s, team: g.team });
  return g;
}

export function vote(g, s, yes) {
  if (g.phase !== "vote") throw new Error("It isn't time to vote.");
  g.votes[s] = !!yes;
  return g;
}
export const votesWaiting = g => g.phase === "vote" ? [...Array(g.n).keys()].filter(s => g.votes[s] === undefined) : [];

// Anyone who didn't vote in time counts as approving.
export function resolveVote(g) {
  if (g.phase !== "vote") return g;
  const votes = [...Array(g.n).keys()].map(s => g.votes[s] !== false);
  const yes = votes.filter(Boolean).length;
  const ok = yes * 2 > g.n;
  g.log.push({ type: "vote", heist: g.heist, leader: g.leader, team: g.team, votes, ok });
  g.votes = {};
  if (ok) { g.rejects = 0; g.phase = "heist"; g.plays = {}; return g; }
  g.rejects += 1;
  if (g.rejects >= MAX_REJECTS) return finish(g, "cops", "rejects");
  g.leader = (g.leader + 1) % g.n;
  g.phase = "pick"; g.team = [];
  return g;
}

// card: "success" | "sabotage"
export function playCard(g, s, card) {
  if (g.phase !== "heist") throw new Error("There's no heist on right now.");
  if (!g.team.includes(s)) throw new Error("You're not on this heist.");
  if (card !== "success" && card !== "sabotage") throw new Error("Play Success or Sabotage.");
  if (card === "sabotage" && !isCop(g.roles[s])) throw new Error("The crew can only play Success.");
  g.plays[s] = card;
  return g;
}
export const playsWaiting = g => g.phase === "heist" ? g.team.filter(s => g.plays[s] === undefined) : [];

// Anyone on the team who didn't play in time plays Success.
export function resolveHeist(g) {
  if (g.phase !== "heist") return g;
  const fails = g.team.filter(s => g.plays[s] === "sabotage").length;
  const ok = fails < needFails(g.n, g.heist);
  g.results.push({ heist: g.heist, team: g.team, fails, ok });
  g.log.push({ type: "result", heist: g.heist, team: g.team, fails, ok });
  g.plays = {};
  const wins = g.results.filter(r => r.ok).length, losses = g.results.length - wins;
  if (losses >= 3) return finish(g, "cops", "heists");
  if (wins >= 3) {
    if (g.special) { g.phase = "snipe"; g.team = []; g.log.push({ type: "snipe open" }); return g; }
    return finish(g, "crew", "heists");
  }
  g.heist += 1; g.leader = (g.leader + 1) % g.n;
  g.phase = "pick"; g.team = [];
  g.log.push({ type: "heist", heist: g.heist });
  return g;
}

export const sniperSeat = g => g.roles.indexOf("sniper");
export const snipeTargets = g => [...Array(g.n).keys()].filter(s => !isCop(g.roles[s]));
export function snipe(g, s, target) {
  if (g.phase !== "snipe") throw new Error("It isn't time for the Sniper.");
  if (s !== sniperSeat(g)) throw new Error("Only the Sniper takes the shot.");
  const t = +target;
  if (!snipeTargets(g).includes(t)) throw new Error("Pick someone from the crew.");
  const hit = g.roles[t] === "mastermind";
  g.log.push({ type: "snipe", seat: s, target: t, hit });
  return finish(g, hit ? "cops" : "crew", hit ? "sniped" : "heists");
}

function finish(g, side, how) {
  g.finished = { winner: side, how, winners: [...Array(g.n).keys()].filter(s => isCop(g.roles[s]) === (side === "cops")) };
  g.phase = "done";
  g.log.push({ type: "win", side, how });
  return g;
}

// What one player may see: their own role; cops see the other cops; the Mastermind sees the cops (without
// knowing which is the Sniper). Everything at the end. Votes are public once counted; heist cards never are,
// only how many sabotages there were.
export function viewFor(g, s) {
  if (!g) return null;
  const me = s >= 0 ? g.roles[s] : null;
  const roles = g.roles.map((r, t) => {
    if (g.finished || t === s) return r;
    if (isCop(me) && isCop(r)) return r;
    if (me === "mastermind" && isCop(r)) return "cop";
    return null;
  });
  return {
    no: g.no, n: g.n, phase: g.phase, heist: g.heist, leader: g.leader, team: g.team, results: g.results, rejects: g.rejects,
    teamSize: g.phase === "done" ? 0 : TEAMS[g.n][g.heist], sizes: TEAMS[g.n], needs: TEAMS[g.n].map((_, i) => needFails(g.n, i)), special: g.special,
    roles, myRole: me, voted: g.phase === "vote" ? Object.keys(g.votes).map(Number) : [], myVote: s >= 0 && g.phase === "vote" ? (g.votes[s] ?? null) : null,
    played: g.phase === "heist" ? Object.keys(g.plays).map(Number) : [], myPlay: s >= 0 && g.phase === "heist" ? (g.plays[s] ?? null) : null,
    sniper: g.phase === "snipe" ? (isCop(me) ? sniperSeat(g) : -1) : -1,
    log: g.log, finished: g.finished
  };
}
