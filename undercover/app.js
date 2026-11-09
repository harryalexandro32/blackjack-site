// Undercover screens: open or join a room, the lobby, then rounds of clues, talk and the vote, with big
// announcements. Words show in Bahasa Indonesia or English, whichever each player picks.
import { REACTIONS } from "../supabase/functions/_shared/poker-room.js";
import { avatarSvg, PRESETS, DEFAULT_AVATAR } from "../poker/avatars.js";
import { openLook } from "../poker/look.js";
import { play as sound } from "../poker/sound.js";
import { ICONS, ROLE_NAME, ROLE_A } from "./icons.js";

const $ = id => document.getElementById(id);
const CONFIG = window.POKER_CONFIG || {};
const onlineEnabled = !!(CONFIG.supabaseUrl && CONFIG.anonKey);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const online = () => import("./online.js");

// ---------- your look ----------
const myAvatar = () => store.get("pk-avatar", DEFAULT_AVATAR);
function drawLookButtons() { document.querySelectorAll("[data-look]").forEach(b => b.innerHTML = `<span class="av">${avatarSvg(myAvatar())}</span>`); }
document.querySelectorAll("[data-look]").forEach(b => b.addEventListener("click", async () => { const code = await openLook(myAvatar()); if (code) { store.set("pk-avatar", code); drawLookButtons(); } }));
function avatarOf(p) {
  if (p && p.avatar) return p.avatar;
  let h = 0; for (const ch of (p && p.name) || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PRESETS[h % PRESETS.length].code;
}
const miniAv = code => `<span class="mini-av">${avatarSvg(code)}</span>`;

// ---------- screens ----------
function showScreen(id) {
  ["scrSetup", "scrRoom"].forEach(s => $(s).hidden = s !== id);
  $("meters").hidden = id !== "scrRoom";
  if (id !== "scrRoom") document.body.className = "";
}
let ctrl = null, unsub = null, view = null;
function attach(c) {
  if (unsub) unsub();
  if (ctrl && ctrl !== c) ctrl.destroy();
  ctrl = c; lastSeen = null; revealQueue = []; chatTab = "all"; lastChatN = null; roleOpen = false; wasMyTurn = false;
  showScreen("scrRoom");
  unsub = ctrl.subscribe(v => { view = v; render(); });
  const want = store.get("uc-lang", null);
  if (want && ctrl.state && ctrl.state.myLang !== want) ctrl.setPrefs({ lang: want }).catch(() => {});
}
function backToLobby() {
  if (ctrl) ctrl.destroy();
  if (unsub) unsub();
  ctrl = null; view = null; unsub = null;
  initSetup();
}
const nameOf = id => $(id).value.trim().replace(/\s+/g, " ").slice(0, 16);
function guard(fn) { return async (...a) => { try { await fn(...a); } catch (err) { flash(err.message); } }; }
function flash(text) { const h = document.querySelector(".ww-actions .hint") || $("phaseText"); if (h) { h.textContent = text; h.classList.add("bad"); setTimeout(() => h.classList.remove("bad"), 2500); } }

$("formCreate").addEventListener("submit", guard(async e => {
  e.preventDefault();
  const name = nameOf("crName");
  if (!name) return $("crErr").textContent = "Enter your name.";
  $("crErr").textContent = ""; $("btnCreate").disabled = true;
  try { store.set("pk-name", name); const { OnlineUndercover } = await online(); attach(await OnlineUndercover.create({ name, avatar: myAvatar() })); }
  catch (err) { $("crErr").textContent = err.message; }
  finally { $("btnCreate").disabled = false; }
}));
$("formJoin").addEventListener("submit", async e => {
  e.preventDefault();
  const code = $("jnCode").value.trim().toUpperCase(), name = nameOf("jnName");
  if (code.length !== 6) return $("jnErr").textContent = "Room codes are 6 letters and numbers.";
  if (!name) return $("jnErr").textContent = "Enter your name.";
  $("jnErr").textContent = ""; $("btnJoin").disabled = true;
  try { store.set("pk-name", name); const { OnlineUndercover } = await online(); attach(await OnlineUndercover.join({ code, name, avatar: myAvatar() })); }
  catch (err) { $("jnErr").textContent = err.message; }
  finally { $("btnJoin").disabled = false; }
});
$("jnCode").addEventListener("change", async () => {
  const code = $("jnCode").value.trim().toUpperCase();
  $("jnRules").textContent = "";
  if (code.length !== 6 || !onlineEnabled) return;
  try {
    const { peekRoom } = await online();
    const r = await peekRoom(code);
    $("jnRules").textContent = !r ? "No open room with that code." : r.game !== "undercover" ? "That code is a different game. Join it from its own page." : `${r.humans} ${r.humans === 1 ? "person" : "people"} in the room · words in ${r.settings.lang === "en" ? "English" : "Bahasa Indonesia"} (you can switch)`;
  } catch {}
});
$("btnRejoin").addEventListener("click", async () => {
  try { const { OnlineUndercover } = await online(); attach(await OnlineUndercover.resume()); }
  catch (err) { $("jnErr").textContent = err.message; $("btnRejoin").hidden = true; }
});
const params = new URLSearchParams(location.search);
function initSetup() {
  const name = store.get("pk-name", "");
  if (name) { $("crName").value = name; $("jnName").value = name; }
  drawLookButtons();
  $("formCreate").hidden = $("formJoin").hidden = !onlineEnabled;
  $("onlineOff").hidden = onlineEnabled;
  showScreen("scrSetup");
  if (!onlineEnabled) return;
  if (params.get("code") && params.get("host")) {
    const code = params.get("code").toUpperCase().slice(0, 6), key = params.get("host");
    window.history.replaceState(null, "", location.pathname);
    online().then(m => m.OnlineUndercover.claim({ code, hostKey: key })).then(attach).catch(err => { $("jnCode").value = code; $("jnErr").textContent = err.message; });
    return;
  }
  if (params.get("code")) { $("jnCode").value = params.get("code").toUpperCase().slice(0, 6); $("jnCode").dispatchEvent(new Event("change")); }
  online().then(m => { $("btnRejoin").hidden = !m.hasSavedSeat(); }).catch(() => {});
}

// ---------- the room ----------
let roleOpen = false, chatTab = "all", lastChatN = null, wasMyTurn = false;
const nameAt = s => s === view.me ? "You" : (view.players[s] && view.players[s].name) || "Someone";
const g = () => view && view.view;
const isAre = s => s === view.me ? "are" : "is";

function render() {
  if (!view) return;
  if (view.ended) { backToLobby(); return; }
  const v = g(), me = view.me;
  const phase = !v ? "lobby" : v.finished ? "done" : v.phase;
  const inGame = !!v && me >= 0;
  const alive = inGame && v.alive[me];
  document.body.className = "uc-" + (phase === "done" ? "lobby" : phase);
  $("mGame").textContent = view.gameNo || "–";
  $("mPhase").textContent = !v ? "–" : v.finished ? "Over" : v.round;
  $("mAlive").textContent = v ? `${v.alive.filter(Boolean).length} of ${v.n}` : "–";
  $("mCode").textContent = view.code;

  // the banner
  const doneIcon = v && v.finished ? (v.finished.winner === "civilians" ? "civilian" : v.finished.winner === "white" ? "white" : "undercover") : null;
  $("phaseIcon").innerHTML = ICONS[doneIcon || (phase === "guess" ? "guess" : phase)];
  $("phaseTitle").textContent = phase === "lobby" ? "Who's the undercover?" : phase === "done" ? winTitle(v.finished) : phase === "clue" ? `Round ${v.round}: clues` : phase === "talk" ? `Round ${v.round}: talk it over` : phase === "vote" ? (v.runoff ? `Round ${v.round}: runoff vote` : `Round ${v.round}: the vote`) : "Mr. White's guess";
  $("phaseText").textContent = bannerText(v, phase, inGame, alive);

  renderWord(v, inGame, alive);
  renderPlayers(v, phase, inGame, alive);
  renderActions(v, phase, inGame, alive);
  renderLobby(v);
  renderClues(v);
  renderLog(v);
  renderChat(v, inGame, alive);
  announce(v);
  tickClock();
}
const winTitle = f => f.winner === "civilians" ? "The civilians win" : f.winner === "white" ? "Mr. White wins" : "The infiltrators win";

function bannerText(v, phase, inGame, alive) {
  if (phase === "lobby") {
    const people = view.lobby.length;
    return view.isHost ? `${people} ${people === 1 ? "person" : "people"} here. Share the code ${view.code}; start when everyone's in (4 to 12 players).` : "Waiting for the host to start the game.";
  }
  if (phase === "done") return v.words ? `The civilians' word was "${v.words.civ}", the undercover's "${v.words.und}".` : "";
  if (!inGame) return "You're sitting this game out: watch and chat with the players who are out.";
  if (!alive && phase !== "guess") return "You're out: you can see every role and both words. Chat in the Out tab.";
  if (phase === "clue") return v.speaker === view.me ? (v.iAmWhite ? "Your turn. You have no word: give a clue that sounds like everyone else's." : "Your turn: one clue for your word, without saying it.") : `${nameAt(v.speaker)} ${isAre(v.speaker)} giving a clue…`;
  if (phase === "talk") return "Who sounded off? Talk it over, then press Ready.";
  if (phase === "vote") return v.runoff ? `It was a tie: vote again, between ${v.runoff.map(nameAt).join(" and ")}.` : v.votes[view.me] !== undefined ? "Vote cast. You can change it until time runs out." : "Tap the player you want out.";
  if (phase === "guess") return v.guesser === view.me ? "You're out, but you can still win: guess the civilians' word." : `${nameAt(v.guesser)} was Mr. White and gets one guess at the civilians' word…`;
  return "";
}

// your word, face down until you look
function renderWord(v, inGame, alive) {
  $("wordSide").hidden = !inGame;
  document.querySelector(".ww-main").classList.toggle("no-role", !inGame);
  const lang = view.lang;
  document.querySelectorAll("#langSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === lang)));
  if (!inGame) return;
  const front = $("roleFront");
  const key = `${view.gameNo}:${v.myWord}:${v.iAmWhite}:${alive}:${v.roles[view.me]}`;
  if (front.dataset.key !== key) {
    front.dataset.key = key;
    const role = v.roles[view.me];
    if (v.iAmWhite) { front.innerHTML = `${ICONS.white}<b>Mr. White</b><p>No word for you. Listen to the others, then bluff.</p>`; $("roleCard").style.setProperty("--rc", "#78909c"); }
    else {
      front.innerHTML = `<small>${lang === "en" ? "Your word" : "Kata kamu"}</small><b class="the-word"></b><p></p>`;
      front.querySelector(".the-word").textContent = v.myWord || "";
      front.querySelector("p").textContent = role ? `You were ${ROLE_A[role]}.` : "Everyone has a word. Is yours the odd one out?";
      $("roleCard").style.setProperty("--rc", role === "undercover" ? "#b71c1c" : role === "civilian" ? "#00897b" : "#26a69a");
    }
  }
  $("roleCard").classList.toggle("open", roleOpen);
}
$("roleCard").addEventListener("click", () => { roleOpen = !roleOpen; $("roleCard").classList.toggle("open", roleOpen); });
$("roleCard").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("roleCard").click(); } });
document.querySelectorAll("#langSeg button").forEach(b => b.addEventListener("click", guard(async () => {
  store.set("uc-lang", b.dataset.v);
  $("roleFront").dataset.key = "";
  await ctrl.setPrefs({ lang: b.dataset.v });
})));

function renderPlayers(v, phase, inGame, alive) {
  const box = $("players"); box.innerHTML = "";
  if (!v) {
    view.lobby.forEach(p => {
      const el = document.createElement("div"); el.className = "wp";
      el.innerHTML = `<div class="pic">${avatarSvg(avatarOf(p))}</div><div class="nm"></div><div class="tag"></div>`;
      el.querySelector(".nm").textContent = p.name;
      el.querySelector(".tag").textContent = p.host ? "Host" : "";
      box.appendChild(el);
    });
    return;
  }
  const me = view.me;
  const tally = {};
  Object.values(v.votes || {}).forEach(t => { tally[t] = (tally[t] || 0) + 1; });
  const canVote = phase === "vote" && alive;
  view.players.forEach((p, s) => {
    const clickable = canVote && v.targets.includes(s);
    const el = document.createElement(clickable ? "button" : "div");
    if (clickable) el.type = "button";
    el.className = "wp" + (v.alive[s] ? "" : " dead") + (s === me ? " me" : "") + (phase === "clue" && v.speaker === s ? " speaking" : "")
      + (phase === "vote" && v.votes[me] === s ? " picked" : "") + (phase === "vote" && v.runoff && !v.runoff.includes(s) && v.alive[s] ? " dim" : "")
      + (v.finished && v.finished.winners.includes(s) ? " winner" : "");
    el.innerHTML = `<div class="pic">${avatarSvg(avatarOf(p))}</div><div class="nm"></div><div class="tag"></div><div class="bubble" hidden></div>`;
    el.querySelector(".nm").textContent = (s === me ? "You" : p.name) + (!p.here ? " · left" : "");
    const role = v.roles[s], tag = el.querySelector(".tag");
    if (role && (s !== me || !v.alive[s] || v.finished)) { tag.textContent = ROLE_NAME[role]; tag.classList.add(role); }
    else if (phase === "clue" && v.speaker === s) tag.textContent = "speaking…";
    if (!v.alive[s]) { const k = document.createElement("div"); k.className = "skull"; k.textContent = "✕"; el.appendChild(k); }
    const c = v.clues.filter(x => x.seat === s && x.round === v.round).pop();
    if (c && !v.finished) { const b = el.querySelector(".bubble"); b.hidden = false; b.textContent = c.missed ? "…no clue" : c.spoken ? "🗣 said aloud" : c.text; if (c.missed || c.spoken) b.classList.add("quiet"); }
    if (phase === "vote" && tally[s]) { const b = document.createElement("div"); b.className = "votes"; b.textContent = tally[s]; el.appendChild(b); }
    if (phase === "talk" && view.ready[s]) { const r = document.createElement("div"); r.className = "ready"; r.textContent = "✓"; r.title = "Ready to vote"; el.appendChild(r); }
    if (clickable) el.onclick = guard(async () => { await ctrl.vote(s); sound("chips"); });
    el.setAttribute("aria-label", `${p.name}${v.alive[s] ? "" : ", out"}${role ? ", " + ROLE_NAME[role] : ""}${c && c.text ? ", clue: " + c.text : ""}`);
    box.appendChild(el);
  });
}

function renderActions(v, phase, inGame, alive) {
  const box = $("actions"); box.innerHTML = "";
  const hint = document.createElement("div"); hint.className = "hint"; box.appendChild(hint);
  const btn = (label, cls, fn) => { const b = document.createElement("button"); b.className = cls; b.textContent = label; b.onclick = guard(fn); box.appendChild(b); return b; };
  const form = $("clueForm");
  const myTurn = phase === "clue" && inGame && v.speaker === view.me;
  const myGuess = phase === "guess" && inGame && v.guesser === view.me;
  form.hidden = !(myTurn || myGuess);
  if (!form.hidden) {
    form.dataset.mode = myGuess ? "guess" : "clue";
    $("clueBtn").textContent = myGuess ? "Guess" : "Give clue";
    $("spokenBtn").hidden = myGuess;
    $("clueInput").placeholder = myGuess ? "The civilians' word is…" : "One clue, no more than a few words";
    $("clueInput").setAttribute("aria-label", myGuess ? "Your guess" : "Your clue");
  }
  const nowMine = myTurn || myGuess;
  if (nowMine && !wasMyTurn) { $("clueInput").value = ""; sound("turn", 0); setTimeout(() => $("clueInput").focus({ preventScroll: true }), 50); }
  wasMyTurn = nowMine;

  if (phase === "lobby" || phase === "done") {
    const people = view.lobby.length;
    if (view.isHost) {
      const b = btn(phase === "done" ? "New game" : "Start the game", "primary", () => ctrl.start());
      b.disabled = people < 4;
      hint.textContent = people < 4 ? `Need at least 4 players: ${people} here.` : `${people} players: ${people >= 10 ? 3 : people >= 7 ? 2 : 1} undercover${people >= 7 ? "s" : ""}${view.settings.mrWhite && people >= 5 ? " and Mr. White" : ""}.`;
    } else hint.textContent = "Waiting for the host to start.";
    return;
  }
  if (!inGame || (!alive && !myGuess)) { hint.textContent = !inGame ? "Sitting this one out." : "Watching from the sidelines."; return; }
  if (phase === "clue") hint.textContent = myTurn ? "" : `Clues so far this round: ${v.clues.filter(c => c.round === v.round).length} of ${v.alive.filter(Boolean).length}.`;
  else if (phase === "talk") {
    btn(view.myReady ? "Not ready yet" : "Ready to vote", view.myReady ? "ghost" : "primary", () => ctrl.ready());
    if (view.isHost) btn("Start the vote now", "ghost", () => ctrl.toVote());
    hint.textContent = `${view.ready.filter(Boolean).length} ready. The vote starts when everyone's ready or time runs out.`;
  } else if (phase === "vote") hint.textContent = `${Object.keys(v.votes).length} of ${v.alive.filter(Boolean).length} have voted.`;
  else if (phase === "guess") hint.textContent = myGuess ? "One try. Either language counts." : "Waiting for the guess…";
}
$("clueForm").addEventListener("submit", guard(async e => {
  e.preventDefault();
  const t = $("clueInput").value.trim();
  if (!t) return flash($("clueForm").dataset.mode === "guess" ? "Type your guess." : "Type a clue, or press Said it out loud.");
  if ($("clueForm").dataset.mode === "guess") await ctrl.guess(t); else await ctrl.clue(t);
  $("clueInput").value = "";
}));
$("spokenBtn").addEventListener("click", guard(() => ctrl.clue("", true)));

function renderLobby(v) {
  const list = $("lobbyList"); list.innerHTML = "";
  view.lobby.forEach(p => {
    const row = document.createElement("div"); row.className = "pl";
    row.innerHTML = `<span>${miniAv(avatarOf(p))}<span></span></span><span class="pts"></span>`;
    row.children[0].lastChild.textContent = p.name + (p.name === view.myName ? " (you)" : "");
    row.children[1].textContent = [p.host && "host", p.playing === false && v && !v.finished && "next game"].filter(Boolean).join(" · ");
    list.appendChild(row);
  });
  const sb = $("settingsBox");
  sb.hidden = !(view.isHost && !view.running);
  if (!sb.hidden) {
    [["sLang", "lang"], ["sWords", "words"], ["sClue", "clueSeconds"], ["sTalk", "talkSeconds"], ["sVote", "voteSeconds"]].forEach(([id, k]) => { if (document.activeElement !== $(id)) $(id).value = String(view.settings[k]); });
    $("sWhite").checked = !!view.settings.mrWhite;
    $("sWords").querySelectorAll("option").forEach(o => { if (o.value !== "builtin") o.disabled = !view.customCount; });
    $("pairsNote").textContent = view.customCount ? `${view.customCount} pair${view.customCount === 1 ? "" : "s"} of your own, plus ${view.builtinCount} built in.` : `${view.builtinCount} built-in pairs. Add your own for inside jokes.`;
  }
  $("btnHostLink").hidden = !(view.isHost && view.hostKey);
  $("btnClose").hidden = !view.isHost;
  const wins = $("winsList"); wins.innerHTML = "";
  if (!view.scores.length) wins.innerHTML = '<div class="note">No games finished yet.</div>';
  view.scores.forEach(w => { const r = document.createElement("div"); r.className = "pl"; r.innerHTML = "<span></span><b></b>"; r.firstChild.textContent = `${w.name} · ${w.wins} of ${w.games} won`; r.lastChild.textContent = `${w.points} pts`; wins.appendChild(r); });
}
for (const [id, k] of [["sLang", "lang"], ["sWords", "words"]]) $(id).addEventListener("change", guard(() => ctrl.settings({ [k]: $(id).value })));
for (const [id, k] of [["sClue", "clueSeconds"], ["sTalk", "talkSeconds"], ["sVote", "voteSeconds"]]) $(id).addEventListener("change", guard(() => ctrl.settings({ [k]: +$(id).value })));
$("sWhite").addEventListener("change", guard(() => ctrl.settings({ mrWhite: $("sWhite").checked })));

// the room's own word pairs
$("btnPairs").addEventListener("click", () => {
  $("pairsText").value = (view.customPairs || []).map(p => p.join(" / ")).join("\n");
  $("pairsErr").textContent = "";
  $("pairsDlg").showModal();
});
$("pairsSave").addEventListener("click", async e => {
  e.preventDefault();
  try {
    await ctrl.pairs($("pairsText").value);
    if (view.customCount && view.settings.words === "builtin") await ctrl.settings({ words: "mix" });
    $("pairsDlg").close();
  } catch (err) { $("pairsErr").textContent = err.message; }
});

// every clue so far, by player and round
function renderClues(v) {
  const box = $("clueTable");
  if (!v || !v.clues.length) { box.innerHTML = `<div class="note">${v ? "No clues yet." : "The game hasn't started."}</div>`; return; }
  const rounds = Math.max(...v.clues.map(c => c.round));
  box.innerHTML = "";
  const tbl = document.createElement("table");
  const head = document.createElement("tr");
  head.innerHTML = "<th></th>" + Array.from({ length: rounds }, (_, i) => `<th>R${i + 1}</th>`).join("");
  tbl.appendChild(head);
  view.players.forEach((p, s) => {
    const tr = document.createElement("tr");
    if (!v.alive[s]) tr.className = "out";
    const th = document.createElement("th"); th.textContent = s === view.me ? "You" : p.name; tr.appendChild(th);
    for (let r = 1; r <= rounds; r++) {
      const c = v.clues.find(x => x.seat === s && x.round === r);
      const td = document.createElement("td");
      td.textContent = !c ? "" : c.missed ? "—" : c.spoken ? "🗣" : c.text;
      if (c && (c.missed || c.spoken)) td.className = "quiet";
      tr.appendChild(td);
    }
    tbl.appendChild(tr);
  });
  box.appendChild(tbl);
}

// the story so far
function storyLine(e) {
  const who = s => nameAt(s);
  if (e.type === "round") return `Round ${e.round}.`;
  if (e.type === "talk") return "Every clue is in: time to talk.";
  if (e.type === "vote open") return "The vote opens.";
  if (e.type === "runoff") return `A tie: ${e.between.map(who).join(" and ")} go to a runoff.`;
  if (e.type === "voted") return e.out !== null ? `${who(e.out)} ${e.out === view.me ? "were" : "was"} voted out: ${ROLE_A[e.role]}.` : "Still tied: nobody is out this round.";
  if (e.type === "guess") return `Mr. White guessed "${e.text || "…nothing"}": ${e.right ? "right!" : "wrong."}`;
  if (e.type === "left") return `${who(e.seat)} left the game: ${ROLE_A[e.role]}.`;
  if (e.type === "win") return winTitle({ winner: e.side }) + ".";
  return "";
}
function renderLog(v) {
  const box = $("log");
  if (!v) { box.innerHTML = '<div class="note">The game hasn\'t started.</div>'; return; }
  box.innerHTML = "";
  v.log.forEach(e => { const t = storyLine(e); if (!t) return; const d = document.createElement("div"); d.textContent = t; if (e.type === "round") d.className = "hand-sep"; box.appendChild(d); });
  box.scrollTop = box.scrollHeight;
}

// ---------- the big announcements ----------
let lastSeen = null, revealQueue = [], revealTimer = 0;
function announce(v) {
  if (!v) return;
  const key = view.gameNo;
  if (!lastSeen || lastSeen.game !== key) {
    const fresh = v.log.length <= 1;
    lastSeen = { game: key, n: fresh ? 0 : v.log.length };
    if (fresh) queueReveal(view.me >= 0 && v.iAmWhite ? "white" : "clue", "Round 1", view.me < 0 ? "The game has begun." : v.iAmWhite ? "You're Mr. White: no word for you. Bluff!" : `Your word: ${v.myWord}`, view.me >= 0 && !v.iAmWhite ? v.myWord : null);
  }
  for (const e of v.log.slice(lastSeen.n)) {
    if (e.type === "voted") queueReveal(e.out !== null ? (e.role === "civilian" ? "out" : e.role) : "tie", e.out !== null ? `${nameAt(e.out)} ${isAre(e.out)} out` : "Nobody is out", e.out !== null ? `…${e.out === view.me ? "you were" : "and was"} ${ROLE_A[e.role]}${e.role === "white" ? ", who now gets one guess." : "."}` : "The runoff was tied too.");
    else if (e.type === "runoff") queueReveal("tie", "It's a tie", `Runoff between ${e.between.map(nameAt).join(" and ")}.`);
    else if (e.type === "guess") queueReveal("guess", e.right ? "Mr. White got it!" : "Wrong guess", `"${e.text || "…"}"`);
    else if (e.type === "round" && e.round > 1) queueReveal("clue", `Round ${e.round}`, "Another clue each.");
    else if (e.type === "win") queueReveal(e.side === "civilians" ? "civilian" : e.side === "white" ? "white" : "undercover", winTitle({ winner: e.side }) + "!", v.words ? `The words: ${v.words.civ} (civilians) and ${v.words.und} (undercover).` : "");
  }
  lastSeen.n = v.log.length;
}
function queueReveal(icon, title, text, word = null) {
  revealQueue.push({ icon, title, text, word });
  if (revealQueue.length === 1) showReveal();
}
function showReveal() {
  const r = revealQueue[0]; if (!r) return;
  $("revealIcon").innerHTML = ICONS[r.icon] || "";
  $("revealTitle").textContent = r.title; $("revealText").textContent = r.text;
  $("reveal").hidden = false;
  sound(r.icon === "out" || r.icon === "undercover" ? "allin" : r.icon === "clue" ? "deal" : "pot", 0);
  clearTimeout(revealTimer);
  revealTimer = setTimeout(nextReveal, 3600);
}
function nextReveal() { clearTimeout(revealTimer); revealQueue.shift(); $("reveal").hidden = true; if (revealQueue.length) setTimeout(showReveal, 200); }
$("reveal").addEventListener("click", nextReveal);

// ---------- the clock ----------
function tickClock() {
  if (!view) return;
  const left = view.deadline && view.phaseMs ? Math.max(0, Math.min(100, (view.deadline - Date.now()) / view.phaseMs * 100)) : 0;
  $("phaseBar").style.width = left + "%";
}
setInterval(tickClock, 250);

// ---------- chat: everyone, and the players who are out ----------
const CHANNELS = { all: "Everyone", grave: "Out" };
function readable(v, inGame, alive) {
  const out = ["all"];
  if ((inGame && !alive) || (!inGame && view.running) || (v && v.finished)) out.push("grave");
  return out;
}
function renderChat(v, inGame, alive) {
  const chans = readable(v, inGame, alive);
  if (!chans.includes(chatTab)) chatTab = view.canPost.grave ? "grave" : "all";
  const tabs = $("chatTabs");
  const key = chans.join() + chatTab;
  if (tabs.dataset.key !== key) {
    tabs.dataset.key = key; tabs.innerHTML = "";
    chans.forEach(c => { const b = document.createElement("button"); b.type = "button"; b.className = "ghost"; b.textContent = CHANNELS[c]; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", c === chatTab); b.onclick = () => { chatTab = c; tabs.dataset.key = ""; render(); }; tabs.appendChild(b); });
  }
  tabs.hidden = chans.length < 2;
  const box = $("chatLog"); box.innerHTML = "";
  const msgs = view.chat.filter(c => c.channel === chatTab);
  if (!msgs.length) box.innerHTML = `<div class="note">${chatTab === "grave" ? "Only players who are out read this." : "No messages yet."}</div>`;
  msgs.forEach(c => {
    const d = document.createElement("div"); d.className = "chat-line " + c.channel + (c.kind === "react" ? " react" : "");
    d.innerHTML = "<b></b> <span></span>"; d.firstChild.textContent = c.name; d.lastChild.textContent = c.kind === "react" ? c.emoji : c.text;
    box.appendChild(d);
  });
  box.scrollTop = box.scrollHeight;
  const can = view.canPost[chatTab];
  $("chatInput").disabled = !can;
  $("chatInput").placeholder = can ? (chatTab === "grave" ? "Talk to the others who are out…" : "Say something…") : chatTab === "all" ? "You're out: use the Out tab" : "You can't post here";
  $("chatReacts").hidden = !view.canPost.all || chatTab !== "all";
  const newest = view.chat.length ? view.chat[view.chat.length - 1].n : 0;
  if (lastChatN !== null && newest > lastChatN) sound("chat", 0);
  lastChatN = newest;
}
REACTIONS.forEach(e => {
  const b = document.createElement("button"); b.type = "button"; b.className = "react-btn"; b.textContent = e; b.setAttribute("aria-label", "Send " + e);
  b.onclick = guard(() => ctrl.react(e));
  $("chatReacts").appendChild(b);
});
$("chatForm").addEventListener("submit", guard(async e => { e.preventDefault(); const t = $("chatInput").value.trim(); if (!t) return; await ctrl.chat(t, chatTab); $("chatInput").value = ""; }));

// ---------- room tools ----------
$("btnLook").onclick = guard(async () => { const code = await openLook(myAvatar()); if (!code) return; store.set("pk-avatar", code); drawLookButtons(); await ctrl.setPrefs({ avatar: code }); });
$("btnCopyLink").onclick = async () => {
  const url = `${location.origin}${location.pathname}?code=${view.code}`;
  try { await navigator.clipboard.writeText(url); $("btnCopyLink").textContent = "Link copied"; } catch { $("btnCopyLink").textContent = url; }
  setTimeout(() => $("btnCopyLink").textContent = "Copy invite link", 2500);
};
$("btnHostLink").onclick = async () => {
  const url = `${location.origin}${location.pathname}?code=${view.code}&host=${view.hostKey}`;
  try { await navigator.clipboard.writeText(url); $("btnHostLink").textContent = "Host link copied. Keep it private"; } catch { $("btnHostLink").textContent = url; }
  setTimeout(() => $("btnHostLink").textContent = "Copy host link", 3500);
};
let leaveArmed = 0, closeArmed = 0;
$("btnLeave").onclick = guard(async () => {
  if (!leaveArmed) { leaveArmed = setTimeout(() => { leaveArmed = 0; $("btnLeave").textContent = "Leave the room"; }, 4000); $("btnLeave").textContent = view.running && view.me >= 0 && view.view.alive[view.me] ? "Tap again: you'll be out of this game" : "Tap again to leave"; return; }
  clearTimeout(leaveArmed); leaveArmed = 0;
  await ctrl.leave().catch(() => {});
  backToLobby();
});
$("btnClose").onclick = guard(async () => {
  if (!closeArmed) { closeArmed = setTimeout(() => { closeArmed = 0; $("btnClose").textContent = "Close room for good"; }, 4000); $("btnClose").textContent = "Tap again to close the room"; return; }
  clearTimeout(closeArmed); closeArmed = 0;
  await ctrl.close();
});

initSetup();
