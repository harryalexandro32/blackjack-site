// Ludo vs bots: the whole table runs in this browser with the same rules engine the server uses.
import * as L from "../supabase/functions/_shared/ludo-engine.js";
import { ludoMove } from "../supabase/functions/_shared/ludo-bot.js";
import { settle } from "../supabase/functions/_shared/poker-engine.js";
import { PRESETS } from "../poker/avatars.js";

const KEY = "ld-ai";
const NEXT_GAME_MS = 8000;
const rng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
const BOT_NAMES = ["Rosa", "Kenji", "Amara", "Luis", "Priya", "Otto", "Mei", "Walt", "Nadia", "Greta"];
const BOT_LOOKS = ["Cowboy", "Mei", "Marcus", "Fox", "Owl", "Robot", "Gran", "The Dealer", "Zola", "Trooper"];

export function savedLudoGame() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); return s && !s.ended ? s : null; } catch { return null; }
}

export class LocalLudo {
  // opts: { name, avatar, skill, rules, pointValue (cents) }
  static create(opts) {
    const names = BOT_NAMES.filter(n => n.toLowerCase() !== opts.name.toLowerCase()).sort(() => rng() - 0.5).slice(0, 3);
    const looks = BOT_LOOKS.slice().sort(() => rng() - 0.5);
    const seats = [{ name: opts.name, avatar: opts.avatar || "", bot: false }];
    for (let i = 0; i < 3; i++) seats.push({ name: names[i], avatar: PRESETS.find(p => p.name === looks[i])?.code || "", bot: true });
    return new LocalLudo({ seats, me: 0, skill: opts.skill || "normal", rules: opts.rules || {}, pointValue: opts.pointValue,
      scores: [0, 0, 0, 0], games: [], gameNo: 0, game: null, lastWinner: -1, ended: false });
  }

  constructor(state) {
    this.s = state;
    this.listeners = new Set();
    this.timer = null;
    this.nextGameAt = null;
    if (!this.s.game) this.deal();
    queueMicrotask(() => this.tick());
  }

  subscribe(fn) { this.listeners.add(fn); fn(this.view()); return () => this.listeners.delete(fn); }
  emit() {
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch {}
    const v = this.view();
    this.listeners.forEach(fn => fn(v));
  }

  view() {
    const s = this.s;
    return {
      mode: "ai", me: s.me, isHost: true, seats: s.seats.map((x, i) => ({ ...x, points: s.scores[i] })),
      game: L.viewFor(s.game, s.me), gameNo: s.gameNo, pointValue: s.pointValue, rules: s.rules, scores: s.scores, games: s.games,
      nextGameAt: this.nextGameAt, deadline: null, started: true, ended: s.ended, summary: s.summary || null
    };
  }

  deal() {
    this.s.gameNo += 1;
    this.s.game = L.startGame(this.s.gameNo, { rules: this.s.rules, first: this.s.lastWinner >= 0 ? this.s.lastWinner : 0 });
    this.nextGameAt = null;
  }

  tick() {
    clearTimeout(this.timer);
    const g = this.s.game;
    if (this.s.ended || !g) return;
    if (g.finished) {
      this.count();
      if (this.nextGameAt === null) this.nextGameAt = Date.now() + NEXT_GAME_MS;
      this.timer = setTimeout(() => { this.deal(); this.emit(); this.tick(); }, Math.max(0, this.nextGameAt - Date.now()));
      this.emit();
      return;
    }
    const seat = g.turn;
    if (this.s.seats[seat].bot) {
      // a bot rolls, then (after the die lands) moves
      this.timer = setTimeout(() => {
        if (g.finished || g.turn !== seat) return;
        L.act(g, seat, ludoMove(g, seat, this.s.skill));
        this.tick();
      }, g.phase === "roll" ? 650 + Math.floor(rng() * 400) : 750);
    }
    this.emit();
  }

  count() {
    const g = this.s.game;
    if (!g.finished || g.counted) return;
    g.counted = true;
    g.finished.points.forEach((p, i) => this.s.scores[i] += p);
    this.s.lastWinner = g.finished.winner;
    this.s.games.push({ no: g.no, winner: g.finished.winner, points: g.finished.points });
    if (this.s.games.length > 50) this.s.games.shift();
  }

  async move(m) { L.act(this.s.game, this.s.me, m); this.tick(); }
  async nextGame() { if (this.s.game.finished) { this.nextGameAt = Date.now(); this.tick(); } }

  async leave() {
    clearTimeout(this.timer);
    const s = this.s;
    const rows = s.seats.map((x, i) => ({ name: x.name, buyIn: 0, cashOut: s.scores[i] * s.pointValue, isBot: x.bot, me: i === s.me, avatar: x.avatar, points: s.scores[i] }));
    s.ended = true;
    s.summary = { ...settle(rows), games: s.games.length, pointValue: s.pointValue };
    this.emit();
    try { localStorage.removeItem(KEY); } catch {}
  }

  destroy() { clearTimeout(this.timer); this.listeners.clear(); }
}
