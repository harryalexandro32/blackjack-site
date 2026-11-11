// Online mode: the table lives on the server. This browser sends moves and redraws when the table changes.
const CONFIG = window.POKER_CONFIG || {};
const SEAT_KEY = "pk-seat";
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";

const saveSeat = s => { try { localStorage.setItem(SEAT_KEY, JSON.stringify(s)); } catch {} };
const loadSeat = () => { try { return JSON.parse(localStorage.getItem(SEAT_KEY)); } catch { return null; } };
const clearSeat = () => { try { localStorage.removeItem(SEAT_KEY); } catch {} };
export const hasSavedSeat = () => !!loadSeat();

// The host's private keys, by room code: the host link needs them to open the room from another device.
const HOST_KEYS = "pk-hostkeys";
const hostKeys = () => { try { return JSON.parse(localStorage.getItem(HOST_KEYS)) || {}; } catch { return {}; } };
const saveHostKey = (code, key) => { try { localStorage.setItem(HOST_KEYS, JSON.stringify({ ...hostKeys(), [code]: key })); } catch {} };
export const hostKeyFor = code => hostKeys()[code] || null;

async function call(body) {
  let res;
  try {
    res = await fetch(`${CONFIG.supabaseUrl}/functions/v1/poker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CONFIG.anonKey, Authorization: `Bearer ${CONFIG.anonKey}` },
      body: JSON.stringify(body)
    });
  } catch { throw new Error("Can't reach the table server. Check your connection."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || "The table server didn't answer.");
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

export async function peekTable(code) {
  const r = await call({ type: "peek", code });
  return r.table;
}

export class OnlineTable {
  static async create(opts) {
    const r = await call({ type: "create", name: opts.name, buyIn: opts.buyIn, avatar: opts.avatar, show: opts.show, settings: { sb: opts.sb, bb: opts.bb, minBuyIn: opts.minBuyIn, maxSeats: opts.maxSeats, actSeconds: opts.actSeconds, odds: opts.odds, step: opts.step, game: opts.game, ante: opts.ante, straddle: opts.straddle, runTwice: opts.runTwice } });
    const seat = { roomId: r.roomId, playerId: r.playerId, token: r.token, code: r.state.code };
    saveSeat(seat);
    if (r.hostKey) saveHostKey(r.state.code, r.hostKey);
    return new OnlineTable(seat, r.state, r.serverNow);
  }
  // open a room with the host's private link
  static async claim({ code, hostKey }) {
    const r = await call({ type: "claim", code, hostKey });
    const seat = { roomId: r.roomId, playerId: r.playerId, token: r.token, code: r.state.code };
    saveSeat(seat); saveHostKey(r.state.code, hostKey);
    return new OnlineTable(seat, r.state, r.serverNow);
  }
  static async join({ code, name, buyIn, avatar, show }) {
    const r = await call({ type: "join", code, name, buyIn, avatar, show, game: "poker" });
    const seat = { roomId: r.roomId, playerId: r.playerId, token: r.token, code: r.state.code };
    saveSeat(seat);
    return new OnlineTable(seat, r.state, r.serverNow);
  }
  // a seat-less spot: see the table, chat, and sit down later
  static async watch({ code, name }) {
    const r = await call({ type: "watch", code, name, game: "poker" });
    const seat = { roomId: r.roomId, playerId: r.playerId, token: r.token, code: r.state.code };
    saveSeat(seat);
    return new OnlineTable(seat, r.state, r.serverNow);
  }
  static async resume() {
    const seat = loadSeat();
    if (!seat) throw new Error("No saved table on this device.");
    try {
      const r = await call({ type: "state", roomId: seat.roomId, token: seat.token });
      return new OnlineTable(seat, r.state, r.serverNow);
    } catch (e) { clearSeat(); throw e; }
  }

  constructor(seat, state, serverNow) {
    this.seat = seat;
    this.listeners = new Set();
    this.offset = serverNow - Date.now();
    this.lastTick = 0;
    this.accept(state);
    // Live updates come over the realtime channel; poll often only while that channel is down.
    this.live = false;
    this.lastRefresh = Date.now();
    this.poll = setInterval(() => { if (Date.now() - this.lastRefresh > (this.live ? 15000 : 2500)) this.refresh(); }, 1000);
    this.clock = setInterval(() => this.checkClock(), 500);
    this.listen();
  }

  async listen() {
    try {
      const lib = await realtimeLib();
      this.client = lib.createClient(CONFIG.supabaseUrl, CONFIG.anonKey, { auth: { persistSession: false } });
      this.channel = this.client.channel("room-" + this.seat.roomId)
        .on("broadcast", { event: "update" }, () => this.refresh())
        .subscribe(status => { this.live = status === "SUBSCRIBED"; });
    } catch { /* polling still keeps the table up to date */ }
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
    catch { /* try again on the next update or poll */ }
    finally { this.refreshing = false; if (this.again) { this.again = false; this.refresh(); } }
  }

  // The server only moves the clock when someone asks; every open browser nudges it when time is up.
  checkClock() {
    const s = this.state, serverNow = Date.now() + this.offset;
    if (!s || s.closed || s.left) return;
    const due = (s.deadline && serverNow > s.deadline + 400) || (s.nextHandAt && serverNow > s.nextHandAt + 150);
    if (due && Date.now() - this.lastTick > 1500) {
      this.lastTick = Date.now() + Math.random() * 400;
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
    const s = this.state, toLocal = ms => ms == null ? null : ms - this.offset;
    const me = s.me;
    const mySeat = me >= 0 ? s.view.seats[me] : null;
    const myHand = me >= 0 && s.view.hand ? s.view.hand.players[me] : null;
    const inLiveHand = !!(myHand && !myHand.folded && s.view.hand.street !== "done");
    return {
      mode: "online", me, isHost: s.isHost, hostSeat: s.hostSeat, code: s.code,
      players: s.players, departed: s.departed, minBuyIn: s.settings.minBuyIn, oddsRules: s.settings.odds || {},
      table: s.view, started: s.started, closing: s.closing, leaving: s.leaving,
      deadline: toLocal(s.deadline), nextHandAt: toLocal(s.nextHandAt), actMs: s.actMs,
      ended: s.closed || s.left, tableClosed: s.closed, summary: s.summary,
      waitingForRebuy: !!(mySeat && mySeat.stack === 0 && !inLiveHand),
      watching: !!s.watching, watchers: s.watchers || [], paused: !!s.paused, chat: s.chat || [], myName: s.myName || "",
      sessionNo: s.sessionNo || 1, ending: !!s.ending, sessions: s.sessions || [], ledger: s.ledger || [], ledgerResetAt: s.ledgerResetAt || null,
      hostKey: s.isHost ? hostKeyFor(s.code) : null
    };
  }

  act(a) { return this.send("act", { action: a.type, to: a.to, discard: a.discard }); }
  rebuy(amount) { return this.send("rebuy", { amount }); }
  setSitOut(on) { return this.send("sitout", { on }); }
  setPrefs(p) { return this.send("prefs", p); }
  sit(o) { return this.send("sit", o); }
  voteRunTwice(yes) { return this.send("rit", { yes }); }
  chat(text) { return this.send("chat", { text }); }
  react(emoji) { return this.send("react", { emoji }); }
  setPause(on) { return this.send("pause", { on }); }
  endSession() { return this.send("endSession"); }
  markPaid() { return this.send("markPaid"); }
  start() { return this.send("start"); }
  leave() { return this.send("leave"); }
  close() { return this.send("close"); }
  dealNow() { return Promise.resolve(); }

  destroy() {
    clearInterval(this.poll); clearInterval(this.clock); this.listeners.clear();
    if (this.channel) this.client.removeChannel(this.channel);
  }
}
