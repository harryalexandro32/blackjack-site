// Table sounds, made on the fly with Web Audio (no files to download). Muted state is remembered on this device.
const KEY = "pk-sound";
let ctx = null, master = null;
let on = (() => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } })();

export const soundOn = () => on;
export function setSound(v) {
  const was = on;
  on = !!v;
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
  if (on) unlock();
  if (was !== on) dispatchEvent(new CustomEvent("cr-fx", { detail: on }));   // keeps the header button in step
}
// the header button (theme.js) flips the same switch
addEventListener("cr-fx", e => { on = !!e.detail; if (on) unlock(); });

// Browsers only allow audio after the player has tapped or clicked something.
function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
["pointerdown", "keydown"].forEach(ev => addEventListener(ev, () => { if (on) unlock(); }, { passive: true }));

function tone({ freq = 440, to = null, type = "sine", dur = 0.12, vol = 0.3, at = 0, attack = 0.005 }) {
  const c = ctx, t0 = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise({ dur = 0.08, vol = 0.25, at = 0, from = 4000, to = 800, q = 0.8 }) {
  const c = ctx, t0 = c.currentTime + at;
  const len = Math.ceil(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf; f.type = "bandpass"; f.Q.value = q;
  f.frequency.setValueAtTime(from, t0); f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master); src.start(t0);
}

const SOUNDS = {
  deal: at => noise({ dur: 0.07, vol: 0.22, at, from: 5000, to: 1500 }),                       // card sliding on felt
  flip: at => noise({ dur: 0.05, vol: 0.18, at, from: 2500, to: 6000, q: 1.2 }),
  check: at => { tone({ freq: 140, to: 90, type: "sine", dur: 0.09, vol: 0.5, at }); tone({ freq: 140, to: 90, dur: 0.09, vol: 0.4, at: at + 0.11 }); }, // two knocks
  chips: at => { for (let k = 0; k < 3; k++) tone({ freq: 2600 + Math.random() * 900, type: "triangle", dur: 0.05, vol: 0.13, at: at + k * 0.045 }); },
  allin: at => { for (let k = 0; k < 7; k++) tone({ freq: 2200 + Math.random() * 1400, type: "triangle", dur: 0.06, vol: 0.14, at: at + k * 0.04 }); },
  fold: at => noise({ dur: 0.18, vol: 0.16, at, from: 1800, to: 400 }),
  turn: at => { tone({ freq: 880, dur: 0.14, vol: 0.22, at }); tone({ freq: 1320, dur: 0.22, vol: 0.2, at: at + 0.12 }); },
  win: at => [523, 659, 784, 1047].forEach((f, k) => tone({ freq: f, type: "triangle", dur: 0.28, vol: 0.22, at: at + k * 0.1 })),
  pot: at => [392, 523].forEach((f, k) => tone({ freq: f, type: "triangle", dur: 0.2, vol: 0.14, at: at + k * 0.09 })),
  chat: at => tone({ freq: 1200, to: 1600, dur: 0.08, vol: 0.12, at }),
  react: at => tone({ freq: 700, to: 1400, type: "triangle", dur: 0.12, vol: 0.14, at })
};

// play("chips"), or play("deal", 0.2) to start 0.2 s from now
export function play(name, at = 0) {
  if (!on || document.hidden || !SOUNDS[name]) return;
  if (!unlock() || ctx.state !== "running") return;
  try { SOUNDS[name](Math.max(0, at)); } catch { /* never let a sound break the game */ }
}
