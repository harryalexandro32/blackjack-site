// Gaple vs bots: the whole table runs in this browser with the same rules engine the server uses.
import * as G from "../supabase/functions/_shared/gaple-engine.js";
import { gapleMove } from "../supabase/functions/_shared/gaple-bot.js";
import { settle } from "../supabase/functions/_shared/poker-engine.js";
import { PRESETS } from "../poker/avatars.js";

const KEY = "gp-ai";
const NEXT_GAME_MS = 7000;
const rng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
export const shuffled = () => {
  const d = G.newSet();
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
};
const BOT_NAMES = ["Rosa", "Kenji", "Amara", "Luis", "Priya", "Otto", "Mei", "Walt", "Nadia", "Greta"];
const BOT_LOOKS = ["Cowboy", "Mei", "Marcus", "Fox", "Owl", "Robot", "Gran", "The Dealer", "Zola", "Trooper"];

export function savedGapleGame() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); return s && !s.ended ? s : null; } catch { return null; }
}

export class LocalGaple {
  // opts: { name, avatar, skill, pointValue (cents), opener: "66" | "00", blank25, gapleBonus }
  static create(opts) {
    const names = BOT_NAMES.filter(n => n.toLowerCase() !== opts.name.toLowerCase()).sort(() => rng() - 0.5).slice(0, 3);
    const looks = BOT_LOOKS.slice().sort(() => rng() - 0.5);
    const seats = [{ name: opts.name, avatar: opts.avatar || "", bot: false }];
    for (let i = 0; i < 3; i++) seats.push({ name: names[i], avatar: PRESETS.find(p => p.name === looks[i])?.code || "", bot: true });
    return new LocalGaple({ seats, me: 0, skill: opts.skill || "normal", settings: { opener: opts.opener === "00" ? "00" : "66", blank25: opts.blank25 !== false, gapleBonus: opts.gapleBonus !== false }, pointValue: opts.pointValue, scores: [0, 0, 0, 0], games: [], gameNo: 0, game: null, lastWinner: -1, ended: false });
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
      game: G.viewFor(s.game, s.me), gameNo: s.gameNo, settings: s.settings, pointValue: s.pointValue, scores: s.scores, games: s.games,
      nextGameAt: this.nextGameAt, deadline: null, started: true, ended: s.ended, summary: s.summary || null
    };
  }

  deal() {
    this.s.gameNo += 1;
    this.s.game = G.startGame(this.s.gameNo, shuffled, this.s.lastWinner, this.s.settings);
    this.nextGameAt = null;
  }

  tick() {
    clearTimeout(this.timer);
    const g = this.s.game;
    if (this.s.ended || !g) return;
    if (g.finished) {
      if (this.nextGameAt === null) this.nextGameAt = Date.now() + NEXT_GAME_MS;
      this.timer = setTimeout(() => { this.deal(); this.emit(); this.tick(); }, Math.max(0, this.nextGameAt - Date.now()));
      this.emit();
      return;
    }
    const seat = g.turn;
    if (this.s.seats[seat].bot) {
      this.timer = setTimeout(() => {
        if (g.finished || g.turn !== seat) return;
        const m = gapleMove(g, seat, this.s.skill);
        if (m.type === "pass") G.pass(g, seat); else G.play(g, seat, m.tile, m.end);
        this.after();
      }, 700 + Math.floor(rng() * 900));
    }
    this.emit();
  }

  // a game just ended: add up the points
  after() {
    const g = this.s.game;
    if (g.finished && !g.counted) {
      g.counted = true;
      g.finished.points.forEach((p, i) => this.s.scores[i] += p);
      this.s.lastWinner = g.finished.winner;
      this.s.games.push({ no: g.no, winner: g.finished.winner, reason: g.finished.reason, points: g.finished.points });
      if (this.s.games.length > 50) this.s.games.shift();
    }
    this.tick();
  }

  async play(tile, end) { G.play(this.s.game, this.s.me, tile, end); this.after(); }
  async pass() { G.pass(this.s.game, this.s.me); this.after(); }
  async nextGame() { if (this.s.game.finished) { this.nextGameAt = Date.now(); this.tick(); } }

  // Leaving ends the session: points become pretend dollars and everyone settles up.
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
