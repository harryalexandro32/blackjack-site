// Undercover, as a pure JSON-friendly engine. Seats 0..n-1 for the players in this game.
//
// Everyone gets a secret word. The civilians share one word; the undercover(s) get a close but different word and
// don't know they're the undercover. Mr. White (optional) gets no word at all and must bluff.
// Each round every living player gives one clue in turn (Mr. White never goes first in round 1), the table talks,
// then votes; the most votes is out and their role is shown. A tie goes to a runoff between the tied players;
// a second tie means nobody is out. Mr. White, when voted out, gets one guess at the civilians' word: right and
// Mr. White wins alone. The civilians win when every undercover and Mr. White is out. The infiltrators win when the
// civilians are no more than the infiltrators still in.
//
// words: { civ: { id, en }, und: { id, en } } (a custom pair has the same text in both languages)

export const ROLES = { civilian: "Civilian", undercover: "Undercover", white: "Mr. White" };
export const MIN_PLAYERS = 4, MAX_PLAYERS = 12;
export const POINTS = { civilian: 2, undercover: 10, white: 6 };
export const CLUE_LEN = 40;
export const undercoversFor = n => n >= 10 ? 3 : n >= 7 ? 2 : 1;
export const whitesFor = (n, on) => on && n >= 5 ? 1 : 0;

function randInt(n) {
  const r = new Uint32Array(1);
  globalThis.crypto.getRandomValues(r);
  return r[0] % n;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Lowercase letters and digits only: "Kupu-kupu" and "kupu kupu" match.
export const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const words = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// Does a clue give the word away? The word as whole words ("iced coffee"), or glued into a longer word
// ("coffeeshop") for words of 4+ letters, so a short word like "Ex" or "AC" doesn't block "next" or "back".
export function saysWord(clue, word) {
  const c = words(clue), w = words(word);
  if (!w) return false;
  if (` ${c} `.includes(` ${w} `)) return true;
  return norm(word).length >= 4 && norm(clue).includes(norm(word));
}

export function startGame(no, n, { words, mrWhite = true, roles = null, first = null } = {}) {
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`Undercover needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players.`);
  if (!words) throw new Error("No words to deal.");
  const u = undercoversFor(n), w = whitesFor(n, mrWhite);
  const deck = roles ? roles.slice() : shuffle([...Array(u).fill("undercover"), ...Array(w).fill("white"), ...Array(n - u - w).fill("civilian")]);
  const starters = [...Array(n).keys()].filter(s => deck[s] !== "white");
  const start = first !== null ? first : starters[randInt(starters.length)];
  const g = {
    no, n, roles: deck, words, alive: Array(n).fill(true), round: 1, phase: "clue",
    starter: start, speaker: start, spoke: [], clues: [], votes: {}, runoff: null, guesser: null,
    log: [{ type: "round", round: 1 }], finished: null
  };
  return g;
}

const living = g => [...Array(g.n).keys()].filter(s => g.alive[s]);
export const wordOf = (g, s, lang = "id") => { const r = g.roles[s]; const w = r === "civilian" ? g.words.civ : r === "undercover" ? g.words.und : null; return w ? (w[lang] || w.id) : null; };

// The next living player after seat s (going round the table) who hasn't given a clue this round.
function nextSpeaker(g, from) {
  for (let k = 1; k <= g.n; k++) {
    const s = (from + k) % g.n;
    if (g.alive[s] && !g.spoke.includes(s)) return s;
  }
  return null;
}
function afterClue(g) {
  const next = nextSpeaker(g, g.speaker);
  if (next === null) { g.speaker = null; g.phase = "talk"; g.log.push({ type: "talk", round: g.round }); }
  else g.speaker = next;
}

// A clue: one short line, or spoken aloud at the table (text empty, spoken true).
export function clue(g, s, text, { spoken = false } = {}) {
  if (g.phase !== "clue") throw new Error("It isn't time for clues.");
  if (s !== g.speaker) throw new Error("It isn't your turn to give a clue.");
  const t = String(text || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, CLUE_LEN);
  if (!spoken && !t) throw new Error("Type a clue first.");
  if (t) {
    const mine = [g.words.civ, g.words.und][g.roles[s] === "civilian" ? 0 : 1];
    if (g.roles[s] !== "white" && [mine.id, mine.en].some(w => saysWord(t, w))) throw new Error("Your clue can't contain your word.");
  }
  g.spoke.push(s);
  g.clues.push({ round: g.round, seat: s, text: t, spoken: !t });
  afterClue(g);
  return g;
}
// Time ran out on the speaker.
export function skipClue(g) {
  if (g.phase !== "clue" || g.speaker === null) return g;
  g.spoke.push(g.speaker);
  g.clues.push({ round: g.round, seat: g.speaker, text: "", missed: true });
  afterClue(g);
  return g;
}

export function startVote(g) {
  if (g.phase !== "talk") return g;
  g.phase = "vote"; g.votes = {}; g.runoff = null;
  g.log.push({ type: "vote open", round: g.round });
  return g;
}
export const voteTargets = (g, s) => g.phase !== "vote" || !g.alive[s] ? [] : (g.runoff || living(g)).filter(t => t !== s && g.alive[t]);
export function vote(g, s, target) {
  if (g.phase !== "vote") throw new Error("It isn't time to vote.");
  if (!g.alive[s]) throw new Error("You're out: you don't vote.");
  const t = +target;
  if (!voteTargets(g, s).includes(t)) throw new Error(g.runoff ? "This runoff is between the tied players only." : "You can't vote for that player.");
  g.votes[s] = t;
  return g;
}
export const votesWaiting = g => g.phase === "vote" ? living(g).filter(s => g.votes[s] === undefined && voteTargets(g, s).length) : [];

export function resolveVote(g) {
  if (g.phase !== "vote") return g;
  const tally = {};
  for (const t of Object.values(g.votes)) tally[t] = (tally[t] || 0) + 1;
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const top = ranked.length ? ranked.filter(([, c]) => c === ranked[0][1]).map(([t]) => +t) : [];
  const votes = { ...g.votes };
  g.votes = {};
  if (top.length === 1) return eliminate(g, top[0], votes);
  if (top.length > 1 && !g.runoff) {
    g.runoff = top;
    g.log.push({ type: "runoff", round: g.round, between: top, votes });
    return g;
  }
  g.log.push({ type: "voted", round: g.round, out: null, votes });
  return nextRound(g);
}

// Pass and play: the table votes out loud and taps who's out, or that nobody is (a tie).
export function voteOut(g, s) {
  if (g.phase !== "talk" && g.phase !== "vote") throw new Error("It isn't time to vote.");
  if (s === null) { g.log.push({ type: "voted", round: g.round, out: null, votes: {} }); return nextRound(g); }
  if (!g.alive[s]) throw new Error("That player is already out.");
  g.votes = {};
  return eliminate(g, s, {});
}

function eliminate(g, s, votes) {
  g.alive[s] = false;
  g.runoff = null;
  g.log.push({ type: "voted", round: g.round, out: s, role: g.roles[s], votes });
  if (g.roles[s] === "white") { g.phase = "guess"; g.guesser = s; return g; }
  if (checkWin(g)) return g;
  return nextRound(g);
}

// Mr. White's one guess at the civilians' word, in either language.
export function guess(g, s, text) {
  if (g.phase !== "guess" || s !== g.guesser) throw new Error("It isn't your guess.");
  const t = String(text || "").replace(/\s+/g, " ").trim().slice(0, CLUE_LEN);
  const right = !!norm(t) && [g.words.civ.id, g.words.civ.en].some(w => norm(w) === norm(t));
  g.log.push({ type: "guess", seat: s, text: t, right });
  g.guesser = null;
  if (right) return finish(g, "white", [s]);
  if (checkWin(g)) return g;
  return nextRound(g);
}
export const guessTimeout = g => g.phase === "guess" ? guess(g, g.guesser, "") : g;

function nextRound(g) {
  g.round += 1; g.phase = "clue"; g.spoke = []; g.votes = {}; g.runoff = null;
  // the next round starts one seat further round the table
  let s = g.starter;
  for (let k = 1; k <= g.n; k++) { const t = (g.starter + k) % g.n; if (g.alive[t]) { s = t; break; } }
  g.starter = s; g.speaker = s;
  g.log.push({ type: "round", round: g.round });
  return g;
}

// Someone leaves mid-game: they're out (role shown), and play moves on if it was waiting for them.
export function leave(g, s) {
  if (g.finished || !g.alive[s]) return g;
  g.alive[s] = false;
  delete g.votes[s];
  g.log.push({ type: "left", seat: s, role: g.roles[s] });
  if (g.runoff) g.runoff = g.runoff.filter(t => t !== s);
  if (checkWin(g)) return g;
  if (g.phase === "clue" && g.speaker === s) afterClue(g);
  if (g.phase === "guess" && g.guesser === s) { g.guesser = null; return nextRound(g); }
  if (g.phase === "vote" && g.runoff && g.runoff.length < 2) { g.runoff = null; }
  return g;
}

function checkWin(g) {
  const inf = living(g).filter(s => g.roles[s] !== "civilian").length, civ = living(g).length - inf;
  if (inf === 0) return finish(g, "civilians");
  if (civ <= inf) {
    const winners = [...Array(g.n).keys()].filter(s => g.roles[s] === "undercover" || (g.roles[s] === "white" && g.alive[s]));
    return finish(g, "infiltrators", winners);
  }
  return false;
}
function finish(g, side, winners = null) {
  g.finished = { winner: side, winners: winners || [...Array(g.n).keys()].filter(s => g.roles[s] === "civilian") };
  g.phase = "done"; g.speaker = null;
  g.log.push({ type: "win", side, winners: g.finished.winners });
  return true;
}

// What one player may see, with words in their language. Nobody is told whether they're a civilian or the
// undercover: you only see your word. Mr. White knows. Roles of players who are out are shown; the out and the
// onlookers see everything; at the end everyone does.
export function viewFor(g, s, lang = "id") {
  if (!g) return null;
  const all = !!g.finished || (s >= 0 && !g.alive[s]);
  const word = w => w ? (w[lang] || w.id) : null;
  return {
    no: g.no, n: g.n, round: g.round, phase: g.phase, alive: g.alive,
    roles: g.roles.map((r, t) => all || !g.alive[t] ? r : (t === s && r === "white" ? r : null)),
    myWord: s >= 0 ? wordOf(g, s, lang) : null,
    iAmWhite: s >= 0 && g.roles[s] === "white",
    words: all ? { civ: word(g.words.civ), und: word(g.words.und) } : null,
    speaker: g.speaker, clues: g.clues, votes: g.phase === "vote" ? g.votes : {}, runoff: g.runoff,
    targets: s >= 0 ? voteTargets(g, s) : [], guesser: g.guesser,
    log: g.log, finished: g.finished
  };
}
