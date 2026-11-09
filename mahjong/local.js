// Mahjong vs bots: the whole table runs in this browser with the same rules engine the server uses.
// Bots answer claims at once and take their turns after a short pause; you take as long as you like.
import * as M from "../supabase/functions/_shared/mahjong-engine.js";
import { mahjongMove } from "../supabase/functions/_shared/mahjong-bot.js";
import { settle } from "../supabase/functions/_shared/poker-engine.js";
import { PRESETS } from "../poker/avatars.js";

const KEY = "mj-ai";
const NEXT_GAME_MS = 9000;
const rng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
export const shuffled = () => {
  const d = M.newWall();
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
};
const BOT_NAMES = ["Rosa", "Kenji", "Amara", "Luis", "Priya", "Otto", "Mei", "Walt", "Nadia", "Greta"];
const BOT_LOOKS = ["Cowboy", "Mei", "Marcus", "Fox", "Owl", "Robot", "Gran", "The Dealer", "Zola", "Trooper"];

export function savedMahjongGame() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); return s && !s.ended ? s : null; } catch { return null; }
}

export class LocalMahjong {
  // opts: { name, avatar, skill, minFaan, pointValue (cents) }
  static create(opts) {
    const names = BOT_NAMES.filter(n => n.toLowerCase() !== opts.name.toLowerCase()).sort(() => rng() - 0.5).slice(0, 3);
    const looks = BOT_LOOKS.slice().sort(() => rng() - 0.5);
    const seats = [{ name: opts.name, avatar: opts.avatar || "", bot: false }];
    for (let i = 0; i < 3; i++) seats.push({ name: names[i], avatar: PRESETS.find(p => p.name === looks[i])?.code || "", bot: true });
    return new LocalMahjong({ seats, me: 0, skill: opts.skill || "normal", minFaan: opts.minFaan === 3 ? 3 : 0, pointValue: opts.pointValue,
      scores: [0, 0, 0, 0], games: [], gameNo: 0, game: null, nextDeal: { dealer: Math.floor(rng() * 4), round: 0 }, ended: false });
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
      game: M.viewFor(s.game, s.me), gameNo: s.gameNo, pointValue: s.pointValue, minFaan: s.minFaan, scores: s.scores, games: s.games,
      nextGameAt: this.nextGameAt, deadline: null, started: true, ended: s.ended, summary: s.summary || null
    };
  }

  deal() {
    this.s.gameNo += 1;
    this.s.game = M.startGame(this.s.gameNo, shuffled, { ...this.s.nextDeal, minFaan: this.s.minFaan });
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
    // claims: bots answer straight away; then we wait for you if you have a choice
    if (g.phase === "claim" || g.phase === "rob") {
      for (const s of Object.keys(g.claims || {}).map(Number)) {
        if (!g.claims || g.finished) break;
        if (this.s.seats[s].bot && !g.claims[s].decision) M.act(g, s, mahjongMove(g, s, this.s.skill));
      }
      if (g.finished || g.phase === "discard") return this.tick();
      this.emit();
      return;
    }
    const seat = g.turn;
    if (this.s.seats[seat].bot) {
      this.timer = setTimeout(() => {
        if (g.finished || g.turn !== seat || g.phase !== "discard") return;
        M.act(g, seat, mahjongMove(g, seat, this.s.skill));
        this.tick();
      }, 650 + Math.floor(rng() * 700));
    }
    this.emit();
  }

  // a hand just ended: add up the points, and work out who deals next
  count() {
    const g = this.s.game;
    if (!g.finished || g.counted) return;
    g.counted = true;
    g.finished.points.forEach((p, i) => this.s.scores[i] += p);
    this.s.games.push({ no: g.no, winner: g.finished.winner, faan: g.finished.faan, points: g.finished.points });
    if (this.s.games.length > 50) this.s.games.shift();
    this.s.nextDeal = M.nextDeal(g);
  }

  async move(m) { M.act(this.s.game, this.s.me, m); this.tick(); }
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
