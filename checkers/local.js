// Checkers on this device: against a bot, or two people taking turns. Same rules engine the server uses.
import * as K from "../supabase/functions/_shared/checkers-engine.js";
import { checkersMove } from "../supabase/functions/_shared/checkers-bot.js";
import { PRESETS } from "../poker/avatars.js";

const BOT_NAMES = ["Rosa", "Kenji", "Amara", "Luis", "Priya", "Otto", "Mei", "Walt"];
const BOT_LOOKS = ["Cowboy", "Mei", "Marcus", "Fox", "Owl", "Robot", "Gran", "The Dealer"];
const rand = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;

export class LocalCheckers {
  // opts: { mode: "ai" | "local", rules, skill, names: [a, b], avatar }
  constructor(opts) {
    const people = opts.mode === "ai"
      ? [{ name: opts.names[0], avatar: opts.avatar || "", bot: false },
         (() => { const i = rand(BOT_NAMES.length); return { name: BOT_NAMES.filter(n => n.toLowerCase() !== opts.names[0].toLowerCase())[i % (BOT_NAMES.length - 1)], avatar: PRESETS.find(p => p.name === BOT_LOOKS[i])?.code || "", bot: true }; })()]
      : [{ name: opts.names[0], avatar: "", bot: false }, { name: opts.names[1], avatar: "", bot: false }];
    this.s = { mode: opts.mode, rules: opts.rules, skill: opts.skill || "normal", people, order: [0, 1], gameNo: 0, g: null, wins: people.map(p => ({ name: p.name, wins: 0, draws: 0, games: 0, bot: p.bot })) };
    this.listeners = new Set();
    this.timer = null;
    this.hist = [];                                    // positions before each person's move, for take-backs
    this.deal();
  }
  deal() {
    const s = this.s;
    if (s.g) s.order = [s.order[1], s.order[0]];      // colours swap every game
    s.gameNo += 1;
    s.g = K.startGame(s.gameNo, { rules: s.rules });
    this.hist = [];
    this.tick();
  }
  subscribe(fn) { this.listeners.add(fn); fn(this.view()); return () => this.listeners.delete(fn); }
  emit() { const v = this.view(); this.listeners.forEach(fn => fn(v)); }
  seatOfMe() { return this.s.mode === "ai" ? this.s.order.indexOf(0) : (this.s.g.finished ? -1 : this.s.g.turn); }
  view() {
    const s = this.s;
    return {
      mode: s.mode, me: this.seatOfMe(), bottom: s.mode === "ai" ? s.order.indexOf(0) : 0,
      players: s.order.map(i => s.people[i]), view: K.viewFor(s.g), gameNo: s.gameNo, running: !s.g.finished,
      deadline: null, moveMs: 0, wins: s.wins.slice().sort((a, b) => b.wins - a.wins), isHost: true, settings: { rules: s.rules },
      lobby: [], chat: [], ended: false, canTakeBack: this.hist.length > 0
    };
  }
  tick() {
    clearTimeout(this.timer);
    const s = this.s, g = s.g;
    if (g.finished) {
      if (!g.counted) {
        g.counted = true;
        s.order.forEach((pi, seat) => { const w = s.wins[pi]; w.games++; if (g.finished.winner === seat) w.wins++; if (g.finished.winner === -1) w.draws++; });
      }
    } else if (s.people[s.order[g.turn]].bot) {
      const seat = g.turn;
      this.timer = setTimeout(() => {
        if (g.finished || g.turn !== seat) return;
        K.play(g, seat, checkersMove(g, seat, s.skill));
        this.tick();
      }, 550 + rand(350));
    }
    this.emit();
  }
  async move(m) {
    const g = this.s.g;
    const before = JSON.stringify({ g, wins: this.s.wins });
    K.play(g, g.turn, m);
    this.hist.push(before);
    if (this.hist.length > 200) this.hist.shift();
    this.tick();
  }
  // back to just before the last move a person made (against a bot, the bot's reply goes too)
  async takeBack() {
    if (!this.hist.length) return;
    clearTimeout(this.timer);
    const h = JSON.parse(this.hist.pop());
    this.s.g = h.g; this.s.wins = h.wins;
    this.tick();
  }
  async resign() { const g = this.s.g; K.resign(g, this.s.mode === "ai" ? this.s.order.indexOf(0) : g.turn); this.tick(); }
  async rematch() { if (this.s.g.finished) this.deal(); }
  async leave() { clearTimeout(this.timer); }
  destroy() { clearTimeout(this.timer); this.listeners.clear(); }
}
