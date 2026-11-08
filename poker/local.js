// AI mode: the whole table runs in this browser. The engine is the same one the online server uses.
import * as E from "../supabase/functions/_shared/poker-engine.js";
import { decide, botNames, STYLES, STYLE_KEYS } from "./bot.js";
import { randomAvatar, PRESETS } from "./avatars.js";
import { snapshot, noteFor } from "./coach.js";

// A bot's look matches its style: a picture from that style's list, one not already at the table if possible.
function styleAvatar(style, used) {
  const pool = STYLES[style].avatars.map(n => PRESETS.find(p => p.name === n)).filter(Boolean).map(p => p.code);
  const free = pool.filter(c => !used.has(c));
  const list = free.length ? free : pool;
  return list[Math.floor(Math.random() * list.length)] || randomAvatar();
}

const KEY = "pk-ai";
const BETWEEN_HANDS_MS = 4500;
const rng = a => crypto.getRandomValues(a);
const sleepMs = () => 650 + Math.floor(Math.random() * 800);

export function savedAiTable() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); return s && !s.ended ? s : null; } catch { return null; }
}

export class LocalTable {
  // opts: { name, bots, skill, botStyle: "mixed" | style, coach, botShow: "show" | "muck" | "mix", sb, bb, buyIn (cents), avatar, show }
  static create(opts) {
    const seats = opts.bots + 1;
    // bots mode: bets and raises go up in big-blind steps
    const t = E.createTable({ smallBlind: opts.sb, bigBlind: opts.bb, maxSeats: seats, step: opts.bb });
    const names = botNames(opts.bots, opts.name);
    const players = {};
    const me = 0;
    t.seats[me] = { id: "me", name: opts.name, stack: opts.buyIn, avatar: opts.avatar || "", show: !!opts.show };
    players[me] = { name: opts.name, buyIn: opts.buyIn, isBot: false };
    const used = new Set([opts.avatar]);
    // a mixed table cycles through the styles (in a random order) so every kind of player shows up
    const order = STYLE_KEYS.slice().sort(() => Math.random() - 0.5);
    for (let i = 1; i < seats; i++) {
      const style = !opts.botStyle || opts.botStyle === "mixed" ? order[(i - 1) % order.length] : opts.botStyle;
      const av = styleAvatar(style, used);
      used.add(av);
      t.seats[i] = { id: "bot" + i, name: names[i - 1], stack: opts.buyIn, avatar: av, show: false };
      players[i] = { name: names[i - 1], buyIn: opts.buyIn, isBot: true, style, styleLabel: STYLES[style].label };
    }
    // random first button, like cutting for the deal
    t.button = Math.floor(Math.random() * seats) - 1;
    return new LocalTable({ table: t, players, me, skill: opts.skill, botShow: opts.botShow || "mix", coach: opts.coach !== false, minBuyIn: opts.buyIn, ended: false, departed: [] });
  }

  constructor(state) {
    this.s = state;
    if (!state.table.step) state.table.step = state.table.bb; // tables saved before raise steps existed
    this.listeners = new Set();
    this.nextHandAt = null;
    this.timer = null;
    this.botTimer = null;
    queueMicrotask(() => this.tick());
  }

  subscribe(fn) { this.listeners.add(fn); fn(this.view()); return () => this.listeners.delete(fn); }
  emit() {
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch {}
    const v = this.view();
    this.listeners.forEach(fn => fn(v));
  }

  view() {
    const { table: t, me, players } = this.s;
    return {
      mode: "ai", me, isHost: true, players, minBuyIn: this.s.minBuyIn,
      table: E.publicView(t, me),
      nextHandAt: this.nextHandAt, deadline: null,
      started: true, ended: this.s.ended, summary: this.s.summary || null,
      waitingForRebuy: !E.handInProgress(t) && t.seats[me].stack === 0,
      coachOn: this.s.coach !== false, coach: this.s.coach !== false ? this.s.coachNote || null : null
    };
  }

  // Decide what happens next: a bot's turn, the next deal, or nothing.
  tick() {
    clearTimeout(this.botTimer); clearTimeout(this.timer);
    const t = this.s.table;
    if (this.s.ended) return;
    if (E.handInProgress(t)) {
      const seat = t.hand.toAct;
      if (seat !== this.s.me && seat >= 0) {
        this.botTimer = setTimeout(() => {
          if (!E.handInProgress(t) || t.hand.toAct !== seat) return;
          E.act(t, seat, decide(t, seat, this.s.skill, this.s.players[seat]?.style));
          this.afterAction();
        }, sleepMs());
      }
      return;
    }
    // between hands
    const meBusted = t.seats[this.s.me].stack === 0;
    if (meBusted) { this.nextHandAt = null; this.emit(); return; }
    if (this.nextHandAt === null) this.nextHandAt = Date.now() + (t.hand ? BETWEEN_HANDS_MS : 600);
    this.timer = setTimeout(() => this.deal(), Math.max(0, this.nextHandAt - Date.now()));
    this.emit();
  }

  afterAction() {
    const t = this.s.table;
    if (!E.handInProgress(t)) {
      this.nextHandAt = null;
      // the hand is over: the coach looks back at your decisions
      const d = this.s.decisions;
      if (this.s.coach !== false && d && d.no === t.hand.no && d.list.length) {
        const text = noteFor(d.list);
        if (text) this.s.coachNote = { no: t.hand.no, text };
      }
    }
    this.emit();
    this.tick();
  }

  deal() {
    const t = this.s.table;
    if (E.handInProgress(t) || this.s.ended) return;
    // busted bots buy back in so the game keeps going
    t.seats.forEach((s, i) => {
      if (s && i !== this.s.me && s.stack === 0) { s.stack = this.s.minBuyIn; this.s.players[i].buyIn += this.s.minBuyIn; }
    });
    if (!E.canStartHand(t)) { this.nextHandAt = null; this.emit(); return; }
    // bots follow the table setting; "mix" decides afresh for each bot every hand
    const mode = this.s.botShow || "mix";
    t.seats.forEach((s, i) => { if (s && i !== this.s.me) s.show = mode === "show" || (mode === "mix" && Math.random() < 0.5); });
    E.startHand(t, E.shuffle(E.newDeck(), rng));
    this.nextHandAt = null;
    this.emit();
    this.tick();
  }

  async act(action) {
    const t = this.s.table, me = this.s.me;
    if (this.s.coach !== false && E.legalActions(t, me)) {
      if (!this.s.decisions || this.s.decisions.no !== t.hand.no) this.s.decisions = { no: t.hand.no, list: [] };
      this.s.decisions.list.push(snapshot(t, me, action));
    }
    E.act(t, me, action);
    this.afterAction();
  }

  async dealNow() { this.nextHandAt = Date.now(); this.tick(); }

  async rebuy(cents) {
    const t = this.s.table, me = this.s.me;
    if (E.handInProgress(t) && !t.hand.players[me]?.folded && t.hand.players[me]) throw new Error("You can buy back in once this hand is over.");
    if (t.seats[me].stack > 0) throw new Error("You can only buy back in when you're out of chips.");
    if (cents < this.s.minBuyIn) throw new Error("That is below the minimum buy-in.");
    t.seats[me].stack = cents; t.seats[me].sittingOut = false;
    this.s.players[me].buyIn += cents;
    this.nextHandAt = null;
    this.tick();
  }

  async setPrefs({ avatar, show }) {
    const seat = this.s.table.seats[this.s.me];
    if (avatar !== undefined) seat.avatar = avatar;
    if (show !== undefined) seat.show = !!show;
    this.emit();
  }

  async setCoach(on) { this.s.coach = !!on; this.emit(); }

  async setSitOut(on) {
    this.s.table.seats[this.s.me].sittingOut = on;
    this.emit();
    this.tick();
  }

  // Leaving ends an AI session: fold any live hand, then cash everyone out.
  async leave() {
    const t = this.s.table, me = this.s.me;
    if (E.handInProgress(t) && t.hand.toAct === me) E.act(t, me, { type: "fold" });
    else if (E.handInProgress(t) && t.hand.players[me] && !t.hand.players[me].folded) t.hand.players[me].folded = true;
    // Chips still in the middle go back to whoever put them in, so the summary adds up.
    if (E.handInProgress(t)) t.hand.players.forEach((p, i) => { if (p) { t.seats[i].stack += p.committed; p.committed = 0; } });
    clearTimeout(this.botTimer); clearTimeout(this.timer);
    const rows = Object.entries(this.s.players).map(([i, p]) => ({ name: p.name, buyIn: p.buyIn, cashOut: t.seats[i].stack, isBot: p.isBot, me: +i === me, avatar: t.seats[i].avatar || "" }));
    this.s.ended = true;
    this.s.summary = { ...E.settle(rows), hands: t.handNo, closedAt: Date.now() };
    this.emit();
    try { localStorage.removeItem(KEY); } catch {}
  }

  destroy() { clearTimeout(this.botTimer); clearTimeout(this.timer); this.listeners.clear(); }
}
