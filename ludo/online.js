// Ludo with friends: the room lives on the server (the same table server as the card games).
// This browser sends moves, listens for changes, and nudges the clock when a turn or a bot's pause is due.
const CONFIG = window.POKER_CONFIG || {};
const SEAT_KEY = "ld-seat";
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";

const saveSeat = s => { try { localStorage.setItem(SEAT_KEY, JSON.stringify(s)); } catch {} };
const loadSeat = () => { try { return JSON.parse(localStorage.getItem(SEAT_KEY)); } catch { return null; } };
const clearSeat = () => { try { localStorage.removeItem(SEAT_KEY); } catch {} };
export const hasSavedLudoSeat = () => !!loadSeat();

// the host's private keys by room code (shared with poker; codes never repeat)
const HOST_KEYS = "pk-hostkeys";
const hostKeys = () => { try { return JSON.parse(localStorage.getItem(HOST_KEYS)) || {}; } catch { return {}; } };
const saveHostKey = (code, key) => { try { localStorage.setItem(HOST_KEYS, JSON.stringify({ ...hostKeys(), [code]: key })); } catch {} };

async function call(body) {
  let res;
  try {
    res = await fetch(`${CONFIG.supabaseUrl}/functions/v1/poker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CONFIG.anonKey, Authorization: `Bearer ${CONFIG.anonKey}` },
      body: JSON.stringify(body)
    });
  } catch { throw new Error("Can't reach the game server. Check your connection."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || "The game server didn't answer.");
  return data;
}

let libPromise = null;
function realtimeLib() {
  if (window.supabase) return Promise.resolve(window.supabase);
  libPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SUPABASE_JS; s.onload = () => resolve(window.supabase); s.onerror = reject;
    document.head.appendChild(s);
  });
  return libPromise;
}

export async function peekRoom(code) { return (await call({ type: "peek", code })).table; }

export class OnlineLudo {
  static async create({ name, avatar, pointValue, actSeconds, skill, rules, players }) {
    const r = await call({ type: "create", game: "ludo", name, avatar, settings: { pointValue, actSeconds, skill, rules, players } });
    if (r.hostKey) saveHostKey(r.state.code, r.hostKey);
    return OnlineLudo.from(r);
  }
  static async join({ code, name, avatar }) { return OnlineLudo.from(await call({ type: "join", game: "ludo", code, name, avatar })); }
  static async claim({ code, hostKey }) {
    const r = await call({ type: "claim", code, hostKey });
    saveHostKey(r.state.code, hostKey);
    return OnlineLudo.from(r);
  }
  static async resume() {
    const seat = loadSeat();
    if (!seat) throw new Error("No saved room on this device.");
    try { const r = await call({ type: "state", roomId: seat.roomId, token: seat.token }); return new OnlineLudo(seat, r.state, r.serverNow); }
    catch (e) { clearSeat(); throw e; }
  }
  static from(r) {
    const seat = { roomId: r.roomId, playerId: r.playerId, token: r.token, code: r.state.code };
    saveSeat(seat);
    return new OnlineLudo(seat, r.state, r.serverNow);
  }

  constructor(seat, state, serverNow) {
    this.seat = seat;
    this.listeners = new Set();
    this.offset = serverNow - Date.now();
    this.lastTick = 0;
    this.v = 0; this.sending = 0; this.held = 0; this.leadUntil = 0;
    this.accept(state);
    this.live = false;
    this.lastRefresh = Date.now();
    this.poll = setInterval(() => { if (Date.now() - this.lastRefresh > (this.live ? 15000 : 2000)) this.refresh(); }, 1000);
    this.clock = setInterval(() => this.checkClock(), 100);
    this.listen();
  }

  async listen() {
    try {
      const lib = await realtimeLib();
      this.client = lib.createClient(CONFIG.supabaseUrl, CONFIG.anonKey, { auth: { persistSession: false } });
      this.channel = this.client.channel("room-" + this.seat.roomId)
        .on("broadcast", { event: "update" }, msg => this.onUpdate(msg))
        .subscribe(status => { this.live = status === "SUBSCRIBED"; });
    } catch { /* polling keeps up */ }
  }

  accept(state) {
    this.state = state;
    this.lastRefresh = Date.now();
    if (state.closed || state.left) clearSeat();
    const v = this.view();
    this.listeners.forEach(fn => fn(v));
  }

  async refresh() {
    if (this.refreshing) { this.again = true; return; }
    this.refreshing = true;
    try { this.take(await call({ type: "state", roomId: this.seat.roomId, token: this.seat.token })); }
    catch { /* next time */ }
    finally { this.refreshing = false; if (this.again) { this.again = false; this.refresh(); } }
  }

  // The server only moves when asked: any open browser nudges it when a turn, a bot's pause or the next deal is due.
  checkClock() {
    const s = this.state, now = Date.now() + this.offset;
    if (!s || s.closed || s.left || this.refreshing || this.sending) return;
    const wait = this.nudgeWait();
    const due = (s.deadline && now > s.deadline + 300 + wait) || (s.botAt && now > s.botAt + 30 + wait) || (s.nextGameAt && now > s.nextGameAt + 100 + wait);
    if (due && Date.now() - this.lastTick > 900) {
      this.lastTick = Date.now() + Math.random() * 300;
      if (wait) this.leadUntil = Date.now() + 15000;   // the first in line seems away: this browser leads for a while
      this.send("tick").catch(() => {});
    }
  }

  async send(type, action = {}) {
    this.sending++;
    try { this.take(await call({ type, action, roomId: this.seat.roomId, token: this.seat.token })); }
    finally {
      this.sending--;
      if (!this.sending) { const held = this.held; this.held = 0; if (held > this.v) this.refresh(); }
    }
  }

  // Take a server answer, unless a newer one already arrived (answers can come back out of order).
  take(r) {
    if (r.v != null) { if (r.v < this.v) return; this.v = r.v; }
    this.offset = r.serverNow - Date.now();
    this.accept(r.state);
  }

  // The room says something changed (v = the room's new version). Skip it when this browser already has that
  // version; while a move of our own is on its way, wait for its answer, which usually is that very change.
  onUpdate(msg) {
    const v = msg && msg.payload && typeof msg.payload.v === "number" ? msg.payload.v : Infinity;
    if (v <= this.v) return;
    if (this.sending) { this.held = Math.max(this.held, v); return; }
    this.refresh();
  }

  // Browsers take turns nudging the clock: the first person at the table goes at once, the next ones only if
  // nothing has happened a moment later (so a table of four doesn't send four requests for every bot move).
  nudgeWait() {
    if (Date.now() < this.leadUntil) return 0;
    const s = this.state, seats = s.seats || (s.table && s.table.seats) || [];
    const people = [];
    seats.forEach((x, i) => { if (x && !x.bot) people.push(i); });
    const k = people.indexOf(s.me);
    return Math.min(3, k < 0 ? people.length : k) * 700;
  }

  subscribe(fn) { this.listeners.add(fn); fn(this.view()); return () => this.listeners.delete(fn); }

  view() {
    const s = this.state, toLocal = ms => ms == null ? null : ms - this.offset;
    return {
      mode: "online", me: s.me, isHost: s.isHost, hostSeat: s.hostSeat, code: s.code, myName: s.myName,
      seats: s.seats, table: s.table || [0, 1, 2, 3], game: s.view, gameNo: s.gameNo, rules: s.settings.rules || {}, pointValue: s.settings.pointValue, games: { length: s.games },
      nextGameAt: toLocal(s.nextGameAt), deadline: toLocal(s.deadline), actMs: s.actMs,
      started: s.started, ended: !!(s.closed || s.left), summary: s.summary || null,
      chat: s.chat || [], sessions: s.sessions || [], ledger: s.ledger || [], ledgerResetAt: s.ledgerResetAt,
      sessionNo: s.sessionNo, ending: s.ending, closing: s.closing,
      hostKey: s.isHost ? hostKeys()[s.code] || null : null
    };
  }

  move(m) { return this.send("move", { move: m }); }
  start() { return this.send("start"); }
  leave() { return this.send("leave"); }
  close() { return this.send("close"); }
  endSession() { return this.send("endSession"); }
  markPaid() { return this.send("markPaid"); }
  chat(text) { return this.send("chat", { text }); }
  react(emoji) { return this.send("react", { emoji }); }
  setPrefs(p) { return this.send("prefs", p); }
  nextGame() { return Promise.resolve(); }

  destroy() {
    clearInterval(this.poll); clearInterval(this.clock); this.listeners.clear();
    if (this.channel) this.client.removeChannel(this.channel);
  }
}
