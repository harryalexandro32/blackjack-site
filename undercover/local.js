// Undercover, pass and play: one phone for the whole table. It's passed round so each player sees their word in
// private, clues are said out loud in the order the phone shows, the table votes out loud and taps who's out.
// No server: the same rules engine runs here.
import * as U from "../supabase/functions/_shared/undercover-engine.js";
import { PAIRS } from "../supabase/functions/_shared/undercover-words.js";
import { ICONS, ROLE_NAME, ROLE_A } from "./icons.js";
import { play as sound } from "../poker/sound.js";

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let S = null;   // { names, opts, custom, g, lang, step, dealAt, peek, pick, scores, no }

// ---------- setup ----------
const saved = store.get("uc-local", {});
$("lcNames").value = (saved.names || []).join("\n");
$("lcWhite").checked = saved.mrWhite !== false;
$("lcLang").value = saved.lang || "id";
$("lcWords").value = saved.words || "builtin";
$("lcPairs").value = saved.pairs || "";
const syncPairsField = () => { $("lcPairsField").hidden = $("lcWords").value === "builtin"; };
$("lcWords").addEventListener("change", syncPairsField);
syncPairsField();

// One pair per line: "Kopi / Teh" (also , | ; or " - ").
function parsePairs(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const parts = line.split(/\s*[\/,|;]\s*|\s+-\s+|\t+/).map(w => w.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!parts.length) continue;
    if (parts.length !== 2 || U.norm(parts[0]) === U.norm(parts[1])) throw new Error(`"${line.trim().slice(0, 40)}" isn't a pair of two different words.`);
    out.push(parts.map(w => w.slice(0, 24)));
  }
  return out;
}

$("formLocal").addEventListener("submit", e => {
  e.preventDefault();
  $("lcErr").textContent = "";
  const names = [], seen = new Set();
  for (const raw of $("lcNames").value.split(/\r?\n|,/)) {
    const n = raw.replace(/\s+/g, " ").trim().slice(0, 16);
    if (!n) continue;
    if (seen.has(n.toLowerCase())) return $("lcErr").textContent = `"${n}" is in the list twice.`;
    seen.add(n.toLowerCase()); names.push(n);
  }
  if (names.length < U.MIN_PLAYERS || names.length > U.MAX_PLAYERS) return $("lcErr").textContent = `Undercover needs ${U.MIN_PLAYERS} to ${U.MAX_PLAYERS} players (${names.length} listed).`;
  let custom = [];
  const words = $("lcWords").value;
  try { if (words !== "builtin") custom = parsePairs($("lcPairs").value); } catch (err) { return $("lcErr").textContent = err.message; }
  if (words === "custom" && !custom.length) return $("lcErr").textContent = "Add some pairs of your own, or use the built-in words.";
  const opts = { mrWhite: $("lcWhite").checked, lang: $("lcLang").value, words };
  store.set("uc-local", { names, ...opts, pairs: $("lcPairs").value });
  S = { names, opts, custom, lang: opts.lang, scores: {}, no: 0 };
  newGame();
});

function drawWords() {
  const pool = [];
  if (S.opts.words !== "custom") PAIRS.forEach((_, i) => pool.push("b" + i));
  if (S.opts.words !== "builtin") S.custom.forEach((p, i) => pool.push("c" + p.join("|")));
  let used = store.get("uc-local-used", []);
  let fresh = pool.filter(k => !used.includes(k));
  if (!fresh.length) { used = used.filter(k => !pool.includes(k)); fresh = pool; }
  const r = new Uint32Array(2); crypto.getRandomValues(r);
  const key = fresh[r[0] % fresh.length];
  store.set("uc-local-used", [...used, key].slice(-500));
  let a, b;
  if (key[0] === "b") { const p = PAIRS[+key.slice(1)]; a = { id: p[0], en: p[2] }; b = { id: p[1], en: p[3] }; }
  else { const [x, y] = key.slice(1).split("|"); a = { id: x, en: x }; b = { id: y, en: y }; }
  return r[1] % 2 ? { civ: a, und: b } : { civ: b, und: a };
}

function newGame() {
  S.no += 1;
  S.g = U.startGame(S.no, S.names.length, { words: drawWords(), mrWhite: S.opts.mrWhite });
  S.step = "deal"; S.dealAt = 0; S.peek = null; S.pick = null; S.shown = false; S.seenLog = 1;
  $("scrSetup").hidden = true; $("scrRoom").hidden = true; $("scrLocal").hidden = false;
  window.scrollTo({ top: 0 });
  render();
}
function quit() {
  S = null;
  $("scrLocal").hidden = true; $("scrSetup").hidden = false;
  document.body.className = "";
}

// ---------- the screen ----------
const nameAt = s => S.names[s];
function render() {
  const g = S.g, phase = g.finished ? "done" : g.phase;
  document.body.className = "uc-" + (phase === "done" ? "lobby" : phase === "guess" ? "guess" : S.step === "deal" ? "lobby" : phase);
  const passing = S.step === "deal" || S.peek !== null || phase === "guess";
  $("lPass").hidden = !passing;
  $("lPlayers").hidden = passing;
  if (passing) renderPass(g, phase); else renderPlayers(g, phase);
  renderActions(g, phase, passing);
  renderLog(g);
  renderScores();
  announce(g);
}

function setBanner(icon, title, text) {
  $("lIcon").innerHTML = ICONS[icon];
  $("lTitle").textContent = title;
  $("lText").textContent = text;
}

// Passing the phone: "Pass to Ayu" → Ayu taps → sees the word → hides it again.
function renderPass(g, phase) {
  const box = $("lPass");
  const who = phase === "guess" ? g.guesser : S.peek !== null ? S.peek : S.dealAt;
  if (phase === "guess") setBanner("guess", "Mr. White's guess", `${nameAt(who)} was Mr. White and gets one guess at the civilians' word.`);
  else if (S.peek !== null) setBanner("lobby", "Check your word", "Only you should be looking.");
  else setBanner("lobby", "Dealing the words", `Player ${S.dealAt + 1} of ${S.names.length}. Pass the phone round; nobody else looks.`);
  if (!S.shown) {
    box.innerHTML = `<div class="pass-card"><p>Pass the phone to</p><h3></h3><button class="primary" type="button" id="lShow"></button></div>`;
    box.querySelector("h3").textContent = nameAt(who);
    $("lShow").textContent = `I'm ${nameAt(who)}: show me`;
    $("lShow").onclick = () => { S.shown = true; sound("flip", 0); render(); };
    return;
  }
  if (phase === "guess") {
    box.innerHTML = `<div class="pass-card"><p>The civilians' word is…</p><form id="lGuessForm" autocomplete="off"><input class="text-input" id="lGuess" maxlength="40" aria-label="Your guess"><button class="primary" type="submit">Guess</button></form><p class="note">One try. Either language counts.</p></div>`;
    $("lGuessForm").onsubmit = e => {
      e.preventDefault();
      const t = $("lGuess").value.trim(); if (!t) return;
      U.guess(g, who, t); S.shown = false; render();
    };
    setTimeout(() => $("lGuess") && $("lGuess").focus(), 50);
    return;
  }
  const white = g.roles[who] === "white";
  const word = U.wordOf(g, who, S.lang);
  box.innerHTML = `<div class="pass-card shown"><div class="big-word"></div><p class="note" id="lWordNote"></p>
    <div class="seg lang-seg" role="group" aria-label="Word language"><button type="button" data-v="id">Indonesia</button><button type="button" data-v="en">English</button></div>
    <button class="primary" type="button" id="lHide"></button></div>`;
  box.querySelector(".big-word").innerHTML = white ? `${ICONS.white}<b>Mr. White</b>` : `<small>${S.lang === "en" ? "Your word" : "Kata kamu"}</small><b></b>`;
  if (!white) box.querySelector(".big-word b").textContent = word;
  $("lWordNote").textContent = white ? "No word for you. Listen to the others' clues, then bluff." : "Remember it, and don't say it out loud.";
  box.querySelectorAll(".lang-seg button").forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.v === S.lang)); b.onclick = () => { S.lang = b.dataset.v; render(); }; });
  box.querySelector(".lang-seg").hidden = white;
  const last = S.peek === null && S.dealAt === S.names.length - 1;
  $("lHide").textContent = S.peek !== null ? "Hide it" : last ? "Hide it and start" : "Hide it and pass on";
  $("lHide").onclick = () => {
    S.shown = false;
    if (S.peek !== null) S.peek = null;
    else if (last) { S.step = "play"; S.lang = S.opts.lang; }
    else S.dealAt += 1;
    sound("deal", 0);
    render();
  };
}

function renderPlayers(g, phase) {
  const box = $("lPlayers"); box.innerHTML = "";
  if (phase === "clue") setBanner("clue", `Round ${g.round}: clues`, `${nameAt(g.speaker)}, give one clue out loud. Then tap Next.`);
  else if (phase === "talk" || phase === "vote") setBanner("vote", `Round ${g.round}: vote`, "Talk it over, vote out loud, then tap the player who's out.");
  else if (phase === "done") setBanner(g.finished.winner === "civilians" ? "civilian" : g.finished.winner === "white" ? "white" : "undercover", winTitle(g.finished.winner), `The civilians' word was "${U.wordOf(g, g.roles.indexOf("civilian"), S.opts.lang)}", the undercover's "${U.wordOf(g, g.roles.indexOf("undercover"), S.opts.lang)}".`);
  const voting = phase === "talk" || phase === "vote";
  S.names.forEach((n, s) => {
    const el = document.createElement(voting && g.alive[s] ? "button" : "div");
    if (el.tagName === "BUTTON") el.type = "button";
    el.className = "wp" + (g.alive[s] ? "" : " dead") + (phase === "clue" && g.speaker === s ? " speaking" : "") + (voting && S.pick === s ? " picked" : "") + (g.finished && g.finished.winners.includes(s) ? " winner" : "");
    el.innerHTML = `<div class="pic initial"></div><div class="nm"></div><div class="tag"></div>`;
    el.querySelector(".pic").textContent = n.slice(0, 1).toUpperCase();
    el.querySelector(".nm").textContent = n;
    const tag = el.querySelector(".tag"), role = !g.alive[s] || g.finished ? g.roles[s] : null;
    if (role) { tag.textContent = ROLE_NAME[role]; tag.classList.add(role); }
    else if (phase === "clue" && g.speaker === s) tag.textContent = "your clue…";
    else if (phase === "clue" && g.spoke.includes(s)) tag.textContent = "✓ done";
    if (g.finished && role !== "white") { const b = document.createElement("div"); b.className = "bubble quiet"; b.textContent = U.wordOf(g, s, S.opts.lang); el.appendChild(b); }
    if (!g.alive[s]) { const k = document.createElement("div"); k.className = "skull"; k.textContent = "✕"; el.appendChild(k); }
    if (el.tagName === "BUTTON") el.onclick = () => { S.pick = S.pick === s ? null : s; sound("chips", 0); render(); };
    box.appendChild(el);
  });
}
const winTitle = w => w === "civilians" ? "The civilians win" : w === "white" ? "Mr. White wins" : "The infiltrators win";

function renderActions(g, phase, passing) {
  const box = $("lActions"); box.innerHTML = "";
  const btn = (label, cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = label; b.onclick = fn; box.appendChild(b); return b; };
  if (passing) return;
  if (phase === "clue") {
    btn(`${nameAt(g.speaker)} gave a clue: next`, "primary", () => { U.clue(g, g.speaker, "", { spoken: true }); sound("flip", 0); render(); });
    btn("Check my word", "ghost", () => { S.peekPicking = true; renderPeekPicker(); });
  } else if (phase === "talk" || phase === "vote") {
    const b = btn(S.pick === null ? "Tap who's out" : `${nameAt(S.pick)} is out`, "primary", () => { const s = S.pick; S.pick = null; U.voteOut(g, s); render(); });
    b.disabled = S.pick === null;
    btn("It's a tie: nobody's out", "ghost", () => { S.pick = null; U.voteOut(g, null); render(); });
    btn("Check my word", "ghost", () => { renderPeekPicker(); });
  } else if (phase === "done") {
    btn("Play again", "primary", newGame);
    btn("Change players", "ghost", quit);
  }
}
function renderPeekPicker() {
  const box = $("lActions"); box.innerHTML = '<div class="hint">Whose word? (Only they look.)</div>';
  S.names.forEach((n, s) => {
    if (!S.g.alive[s]) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "ghost"; b.textContent = n;
    b.onclick = () => { S.peek = s; S.shown = false; render(); };
    box.appendChild(b);
  });
  const c = document.createElement("button"); c.type = "button"; c.className = "ghost"; c.textContent = "Cancel"; c.onclick = render; box.appendChild(c);
}

function renderLog(g) {
  const box = $("lLog"); box.innerHTML = "";
  for (const e of g.log) {
    let t = "";
    if (e.type === "round") t = `Round ${e.round}.`;
    else if (e.type === "voted") t = e.out !== null ? `${nameAt(e.out)} was voted out: ${ROLE_A[e.role]}.` : "A tie: nobody was out.";
    else if (e.type === "guess") t = `Mr. White guessed "${e.text || "…"}": ${e.right ? "right!" : "wrong."}`;
    else if (e.type === "win") t = winTitle(e.side) + ".";
    if (!t) continue;
    const d = document.createElement("div"); d.textContent = t; if (e.type === "round") d.className = "hand-sep"; box.appendChild(d);
  }
  box.scrollTop = box.scrollHeight;
}

function renderScores() {
  const g = S.g;
  if (g.finished && !g.counted) {
    g.counted = true;
    S.names.forEach((n, s) => {
      const cur = S.scores[n] || { wins: 0, games: 0, points: 0 }, won = g.finished.winners.includes(s);
      S.scores[n] = { games: cur.games + 1, wins: cur.wins + (won ? 1 : 0), points: cur.points + (won ? U.POINTS[g.roles[s]] : 0) };
    });
  }
  const box = $("lScores"); box.innerHTML = "";
  const rows = Object.entries(S.scores).sort((a, b) => b[1].points - a[1].points);
  if (!rows.length) box.innerHTML = '<div class="note">No games finished yet.</div>';
  rows.forEach(([n, w]) => { const r = document.createElement("div"); r.className = "pl"; r.innerHTML = "<span></span><b></b>"; r.firstChild.textContent = `${n} · ${w.wins} of ${w.games} won`; r.lastChild.textContent = `${w.points} pts`; box.appendChild(r); });
}

// the big announcements, same as online
let rq = [], rTimer = 0;
function announce(g) {
  for (const e of g.log.slice(S.seenLog)) {
    if (e.type === "voted") rq.push(e.out !== null ? [e.role === "civilian" ? "out" : e.role, `${nameAt(e.out)} is out`, `…and was ${ROLE_A[e.role]}${e.role === "white" ? ", who now gets one guess." : "."}`] : ["tie", "Nobody is out", "On to the next round."]);
    else if (e.type === "guess") rq.push(["guess", e.right ? "Mr. White got it!" : "Wrong guess", `"${e.text || "…"}"`]);
    else if (e.type === "round" && e.round > 1) rq.push(["clue", `Round ${e.round}`, "Another clue each, out loud."]);
    else if (e.type === "win") rq.push([e.side === "civilians" ? "civilian" : e.side === "white" ? "white" : "undercover", winTitle(e.side) + "!", ""]);
  }
  S.seenLog = g.log.length;
  if (rq.length && $("reveal").hidden) showNext();
}
function showNext() {
  const r = rq[0]; if (!r) return;
  $("revealIcon").innerHTML = ICONS[r[0]] || ""; $("revealTitle").textContent = r[1]; $("revealText").textContent = r[2];
  $("reveal").hidden = false;
  sound(r[0] === "out" || r[0] === "undercover" ? "allin" : "pot", 0);
  clearTimeout(rTimer); rTimer = setTimeout(hideNext, 3200);
}
function hideNext() { clearTimeout(rTimer); rq.shift(); $("reveal").hidden = true; if (rq.length) setTimeout(showNext, 200); }
$("reveal").addEventListener("click", () => { if (S && rq.length) hideNext(); });

$("lQuit").addEventListener("click", () => {
  if ($("lQuit").dataset.armed) { delete $("lQuit").dataset.armed; quit(); return; }
  $("lQuit").dataset.armed = "1"; $("lQuit").textContent = "Tap again to end this game";
  setTimeout(() => { delete $("lQuit").dataset.armed; $("lQuit").textContent = "End and change players"; }, 4000);
});
