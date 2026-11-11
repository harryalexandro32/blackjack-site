// Undercover with friends: the room lives on the table server. This browser sends choices, listens for changes,
// and nudges the server when a phase's time is up.
const CONFIG = window.POKER_CONFIG || {};
const SEAT_KEY = "uc-seat";
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";

const saveSeat = s => { try { localStorage.setItem(SEAT_KEY, JSON.stringify(s)); } catch {} };
const loadSeat = () => { try { return JSON.parse(localStorage.getItem(SEAT_KEY)); } catch { return null; } };
const clearSeat = () => { try { localStorage.removeItem(SEAT_KEY); } catch {} };
export const hasSavedSeat = () => !!loadSeat();

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

export class OnlineUndercover {
  static async create({ name, avatar }) {
    const r = await call({ type: "create", game: "undercover", name, avatar, settings: {} });
    if (r.hostKey) saveHostKey(r.state.code, r.hostKey);
    return OnlineUndercover.from(r);
  }
  static async join({ code, name, avatar }) { return OnlineUndercover.from(await call({ type: "join", game: "undercover", code, name, avatar })); }
  static async claim({ code, hostKey }) {
    const r = await call({ type: "claim", code, hostKey });
    saveHostKey(r.state.code, hostKey);
    return OnlineUndercover.from(r);
  }
  static async resume() {
    const seat = loadSeat();
    if (!seat) throw new Error("No saved room on this device.");
    try { const r = await call({ type: "state", roomId: seat.roomId, token: seat.token }); return new OnlineUndercover(seat, r.state, r.serverNow); }
    catch (e) { clearSeat(); throw e; }
  }
  static from(r) {
    const seat = { roomId: r.roomId, playerId: r.playerId, token: r.token, code: r.state.code };
    saveSeat(seat);
    return new OnlineUndercover(seat, r.state, r.serverNow);
  }

  constructor(seat, state, serverNow) {
    this.seat = seat;
    this.listeners = new Set();
    this.offset = serverNow - Date.now();
    this.lastTick = 0;
    this.accept(state);
    this.live = false;
    this.lastRefresh = Date.now();
    this.poll = setInterval(() => { if (Date.now() - this.lastRefresh > (this.live ? 15000 : 2000)) this.refresh(); }, 1000);
    this.clock = setInterval(() => this.checkClock(), 500);
    this.listen();
  }

  async listen() {
    try {
      const lib = await realtimeLib();
      this.client = lib.createClient(CONFIG.supabaseUrl, CONFIG.anonKey, { auth: { persistSession: false } });
      this.channel = this.client.channel("undercover-" + this.seat.roomId)
        .on("broadcast", { event: "update" }, () => this.refresh())
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
    try { const r = await call({ type: "state", roomId: this.seat.roomId, token: this.seat.token }); this.offset = r.serverNow - Date.now(); this.accept(r.state); }
    catch { /* next time */ }
    finally { this.refreshing = false; if (this.again) { this.again = false; this.refresh(); } }
  }

  checkClock() {
    const s = this.state, now = Date.now() + this.offset;
    if (!s || s.closed || s.left || !s.deadline) return;
    if (now > s.deadline + 300 && Date.now() - this.lastTick > 900) {
      this.lastTick = Date.now() + Math.random() * 300;
      this.send("tick").catch(() => {});
    }
  }

  async send(type, action = {}) {
    const r = await call({ type, action, roomId: this.seat.roomId, token: this.seat.token });
    this.offset = r.serverNow - Date.now();
    this.accept(r.state);
  }

  subscribe(fn) { this.listeners.add(fn); fn(this.view()); return () => this.listeners.delete(fn); }

  view() {
    const s = this.state;
    return { ...s, deadline: s.deadline == null ? null : s.deadline - this.offset, ended: !!(s.closed || s.left), hostKey: s.isHost ? hostKeys()[s.code] || null : null };
  }

  start() { return this.send("start"); }
  clue(text, spoken = false) { return this.send("clue", { text, spoken }); }
  vote(target) { return this.send("vote", { target }); }
  guess(text) { return this.send("guess", { text }); }
  ready() { return this.send("ready"); }
  toVote() { return this.send("toVote"); }
  settings(settings) { return this.send("settings", { settings }); }
  pairs(text) { return this.send("pairs", { text }); }
  chat(text, channel) { return this.send("chat", { text, channel }); }
  react(emoji) { return this.send("react", { emoji }); }
  setPrefs(p) { return this.send("prefs", p); }
  leave() { return this.send("leave"); }
  close() { return this.send("close"); }

  destroy() {
    clearInterval(this.poll); clearInterval(this.clock); this.listeners.clear();
    if (this.channel) this.client.removeChannel(this.channel);
  }
}
