// Hand replay: every finished hand is saved (on this device) and can be stepped through action by action.
const KEY = "pk-replays", KEEP = 30;
const $ = id => document.getElementById(id);
let list = [], tableKey = "", ui = null;

function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.tableKey === tableKey ? s.list : []; } catch { return []; } }
function store() { try { localStorage.setItem(KEY, JSON.stringify({ tableKey, list })); } catch {} }

// Call when a table opens, so replays from another table don't mix in.
export function useTable(key) { tableKey = key; list = load(); }
export const hasReplay = no => list.some(r => r.no === no);

// Saves a finished hand from the public view (only cards this player was allowed to see).
export function saveHand(view) {
  const t = view.table, h = t.hand;
  if (!h || h.street !== "done" || hasReplay(h.no)) return;
  list.push({
    no: h.no, at: Date.now(), me: view.me, button: t.button, sb: t.sb, bb: t.bb,
    seats: t.seats.map((s, i) => s && h.players[i] ? { name: s.name, avatar: s.avatar || "", hole: h.players[i].hole || null } : null),
    board: h.board, runs: h.runs || null, log: h.log, results: h.results || [], showdown: !!h.showdown, mucked: h.mucked || []
  });
  if (list.length > KEEP) list = list.slice(-KEEP);
  store();
}

// helpers passed in from the table screen so cards, money and avatars look the same everywhere
let H = null;
export function openReplay(no, helpers) {
  H = helpers;
  const r = list.find(x => x.no === no);
  if (!r) return;
  ui = { r, step: 0, timer: 0 };
  $("rpTitle").textContent = `Hand ${r.no}`;
  $("replayDlg").showModal();
  draw();
}

const STREET_CARDS = { preflop: 0, flop: 3, turn: 4, river: 5 };
// state after the first `k` actions: pot, each seat's latest action, who folded, and which street we're on
function stateAt(r, k) {
  let pot = 0, street = "preflop";
  const bets = {}, last = {}, folded = new Set();
  for (let i = 0; i < k; i++) {
    const e = r.log[i];
    if (e.street !== street) { street = e.street; for (const s in bets) bets[s] = 0; for (const s in last) delete last[s]; }
    const s = e.seat;
    if (e.type === "ante") pot += e.amount;
    else if (["small blind", "big blind", "straddle"].includes(e.type) || e.type.startsWith("call")) { pot += e.amount; bets[s] = (bets[s] || 0) + e.amount; }
    else if (e.type.startsWith("bet") || e.type.startsWith("raise")) { pot += e.to - (bets[s] || 0); bets[s] = e.to; }
    if (e.type === "fold") folded.add(s);
    if (s >= 0) last[s] = e;
  }
  return { pot, street, last, folded };
}

function draw() {
  const { r, step } = ui, end = r.log.length + 1, final = step >= end;
  const st = stateAt(r, Math.min(step, r.log.length));
  // board
  const boardBox = $("rpBoard"); boardBox.innerHTML = "";
  const boards = final ? (r.runs ? r.runs.map(x => x.board) : [r.board]) : [r.board.slice(0, STREET_CARDS[st.street] || 0)];
  boards.forEach((b, i) => {
    const row = document.createElement("div"); row.className = "rp-board";
    if (boards.length > 1) row.insertAdjacentHTML("beforeend", `<span class="rp-run">Run ${i + 1}</span>`);
    for (let k = 0; k < 5; k++) row.appendChild(b[k] ? H.cardEl(b[k]) : Object.assign(document.createElement("div"), { className: "card slot" }));
    boardBox.appendChild(row);
  });
  $("rpPot").textContent = final ? "" : `Pot ${H.fmt(st.pot)}`;
  // players
  const pl = $("rpPlayers"); pl.innerHTML = "";
  r.seats.forEach((s, i) => {
    if (!s) return;
    const row = document.createElement("div");
    row.className = "rp-pl" + (st.folded.has(i) ? " folded" : "");
    const win = final && r.results.find(x => x.seat === i);
    const e = st.last[i];
    row.innerHTML = `<span class="mini-av">${H.avatarSvg(s.avatar || H.avatarFor(s))}</span><span class="rp-name"></span><span class="rp-cards"></span><span class="rp-act"></span>`;
    row.querySelector(".rp-name").textContent = (i === r.me ? "You" : s.name) + (i === r.button ? " · D" : "");
    const cards = row.querySelector(".rp-cards");
    (s.hole || [null, null]).forEach(c => cards.appendChild(H.cardEl(c)));
    const act = row.querySelector(".rp-act");
    act.textContent = win ? `wins ${H.fmt(win.amount)}` : final && r.mucked.includes(i) ? "mucks" : e ? H.shortAction(e) : "";
    if (win) act.classList.add("pos");
    pl.appendChild(row);
  });
  // the action list, with this step highlighted
  const lines = $("rpLog"); lines.innerHTML = "";
  r.log.forEach((e, i) => {
    const d = document.createElement("div");
    d.textContent = H.describeFor(e, r);
    if (i === step - 1) d.className = "now";
    else if (i >= step) d.className = "later";
    lines.appendChild(d);
  });
  const res = document.createElement("div");
  res.textContent = r.results.map(x => `${x.seat === r.me ? "You" : r.seats[x.seat]?.name} won ${H.fmt(x.amount)}${x.hand ? " with " + x.hand.toLowerCase() : ""}`).join(" · ");
  res.className = final ? "now pos" : "later";
  lines.appendChild(res);
  const now = lines.querySelector(".now"); if (now) now.scrollIntoView({ block: "nearest" });
  $("rpStep").textContent = final ? "Result" : step === 0 ? "Start" : `${step} / ${r.log.length}`;
  $("rpPrev").disabled = step === 0; $("rpNext").disabled = final;
  $("rpPlay").textContent = ui.timer ? "Pause" : final ? "Replay" : "Play";
}

function stop() { clearInterval(ui.timer); ui.timer = 0; }
export function setupReplay() {
  $("rpPrev").onclick = () => { stop(); ui.step = Math.max(0, ui.step - 1); draw(); };
  $("rpNext").onclick = () => { stop(); ui.step = Math.min(ui.r.log.length + 1, ui.step + 1); draw(); };
  $("rpPlay").onclick = () => {
    if (ui.timer) { stop(); return draw(); }
    if (ui.step >= ui.r.log.length + 1) ui.step = 0;
    ui.timer = setInterval(() => { ui.step++; if (ui.step >= ui.r.log.length + 1) stop(); draw(); }, 900);
    draw();
  };
  $("replayDlg").addEventListener("close", () => { if (ui) stop(); });
}
