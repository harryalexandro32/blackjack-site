// Background music for every theme, played live with Web Audio: every tune original, and it follows the game.
// window.CR_MUSIC = { start(themeId), stop(), setVolume(0..1), setIntensity(0..2), sting(kind), playing() }.
// theme.js owns the on/off switch; the games report how heated the table is and what just happened (window.CR_CUE).
// Intensity: 0 calm, 1 normal, 2 intense (layers come in and drop out at the next bar). Stings: turn, win, lose, big.
// Browsers only let audio start after a tap or key press on the page, so start() may wait for one.
(function () {
  let ctx = null, out = null, vol = null, verb = null, timer = null, current = null, volume = 0.6;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const pickOf = a => a[Math.floor(Math.random() * a.length)];

  function setup() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    vol = ctx.createGain(); vol.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    vol.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2.2;
    irBuf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = irBuf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    return true;
  }
  // Each tune plays through its own output and reverb. Switching tunes cuts the old one off at once: the notes
  // it had already scheduled and its reverb tail go silent with it, instead of bleeding into the new tune.
  let irBuf = null;
  function newBus() {
    cutBus(0.03);
    out = ctx.createGain(); out.gain.value = 0.0001; out.connect(vol);
    verb = ctx.createConvolver(); verb.buffer = irBuf;
    const wet = ctx.createGain(); wet.gain.value = 0.28;
    verb.connect(wet).connect(out);
  }
  function cutBus(secs) {
    if (!out) return;
    const old = out, t = ctx.currentTime;
    old.gain.cancelScheduledValues(t);
    old.gain.setValueAtTime(Math.max(0.0001, old.gain.value), t);
    old.gain.exponentialRampToValueAtTime(0.0001, t + secs);
    setTimeout(() => { try { old.disconnect(); } catch {} }, secs * 1000 + 80);
    out = null;
  }
  function voice(node, send = 0.5) {
    node.connect(target || out);
    if (send) { const s = ctx.createGain(); s.gain.value = send; node.connect(s).connect(verb); }
  }
  const env = (g, t, vol, a, d, end) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); if (d) g.gain.exponentialRampToValueAtTime(vol * 0.35, t + a + d); g.gain.exponentialRampToValueAtTime(0.0001, end); };

  // ---------- instruments ----------
  function epiano(m, t, dur, v = 0.12) {
    const f = mtof(m), car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f; mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.5);
    mod.connect(mg).connect(car.frequency);
    env(g, t, v, 0.01, 0.4, t + dur + 0.6);
    car.connect(g); voice(g, 0.6);
    [car, mod].forEach(o => { o.start(t); o.stop(t + dur + 0.7); });
  }
  function bass(m, t, dur, v = 0.32, type = "triangle", cut = 900) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o.frequency.value = mtof(m);
    f.type = "lowpass"; f.frequency.setValueAtTime(cut, t); f.frequency.exponentialRampToValueAtTime(Math.max(160, cut * 0.3), t + 0.25);
    env(g, t, v, 0.012, 0.18, t + dur);
    o.connect(f).connect(g); voice(g, 0.15); o.start(t); o.stop(t + dur + 0.05);
  }
  let noiseBuf = null;
  function noiseHit(t, { dur = 0.08, v = 0.1, type = "highpass", freq = 7000, q = 0.7, send = 0.3, attack = 0.002 } = {}) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g); voice(g, send); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  const plucks = new Map();
  function pluckBuf(m, bright) {
    const k = m + ":" + bright;
    if (plucks.has(k)) return plucks.get(k);
    const sr = ctx.sampleRate, N = Math.round(sr / mtof(m)), len = Math.floor(sr * 2.4);
    const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
    const damp = 0.5 * (bright ? 0.9985 : 0.996);
    for (let i = N; i < len; i++) d[i] = damp * (d[i - N] + d[i - N - 1 < 0 ? 0 : i - N - 1]);
    plucks.set(k, b);
    return b;
  }
  function pluck(m, t, v = 0.22, bright = true, send = 0.5, cut = null) {
    const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = pluckBuf(m, bright); f.type = "lowpass"; f.frequency.value = cut || (bright ? 6000 : 2200);
    g.gain.value = v; s.connect(f).connect(g); voice(g, send); s.start(t);
  }
  function pad(notes, t, dur, v = 0.05, type = "sine") {
    notes.forEach(m => [-5, 5].forEach(cents => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = mtof(m); o.detune.value = cents;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      if (type !== "sine") { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1400; o.connect(f).connect(g); } else o.connect(g);
      voice(g, 0.8); o.start(t); o.stop(t + dur + 0.05);
    }));
  }
  function reed(m, t, dur, v = 0.05) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    f.type = "lowpass"; f.frequency.value = 1900; f.Q.value = 0.6;
    lfo.frequency.value = 5.5; lg.gain.value = v * 0.25; lfo.connect(lg).connect(g.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.04); g.gain.setValueAtTime(v, t + dur - 0.05); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    [-7, 7].forEach(c => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = c; o.connect(f); o.start(t); o.stop(t + dur + 0.02); });
    f.connect(g); voice(g, 0.35); lfo.start(t); lfo.stop(t + dur + 0.02);
  }
  // flute / whistle / shakuhachi: a sine with vibrato that grows, and a breath of noise at the start
  function flute(m, t, dur, v = 0.08, breath = 0.02, glideFrom = null) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = "sine";
    if (glideFrom) { o.frequency.setValueAtTime(mtof(glideFrom), t); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.12); } else o.frequency.value = mtof(m);
    lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(mtof(m) * 0.012, t + Math.min(0.6, dur)); lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.06); g.gain.setValueAtTime(v * 0.9, t + Math.max(0.07, dur - 0.08)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); voice(g, 0.6); o.start(t); o.stop(t + dur + 0.02); lfo.start(t); lfo.stop(t + dur + 0.02);
    if (breath) noiseHit(t, { dur: 0.12, v: breath, type: "bandpass", freq: mtof(m) * 2, q: 2, send: 0.4, attack: 0.03 });
  }
  // bells: music box, celesta, steel drum (a few sine partials with their own decays)
  function bell(m, t, v = 0.1, partials = [[1, 1, 1.2], [2.0, 0.35, 0.5], [3.0, 0.15, 0.3], [4.2, 0.08, 0.2]], send = 0.6) {
    const f = mtof(m);
    for (const [ratio, amp, dec] of partials) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f * ratio;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * amp, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g); voice(g, send); o.start(t); o.stop(t + dec + 0.02);
    }
  }
  const steel = (m, t, v = 0.12) => bell(m, t, v, [[1, 1, 0.9], [2.0, 0.5, 0.45], [2.95, 0.25, 0.3], [4.05, 0.12, 0.18]], 0.45);
  // synth: detuned saws through a filter that opens and closes (bass, arps, brass stabs)
  function synth(m, t, dur, v = 0.06, cutHi = 2400, cutLo = 300, voices = [-8, 8], send = 0.3, type = "sawtooth") {
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "lowpass"; f.Q.value = 4; f.frequency.setValueAtTime(cutHi, t); f.frequency.exponentialRampToValueAtTime(cutLo, t + Math.max(0.05, dur));
    env(g, t, v, 0.005, 0, t + dur);
    voices.forEach(c => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(m); o.detune.value = c; o.connect(f); o.start(t); o.stop(t + dur + 0.02); });
    f.connect(g); voice(g, send);
  }
  function thump(t, from = 120, to = 45, v = 0.45, dur = 0.35) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); voice(g, 0.25); o.start(t); o.stop(t + dur + 0.02);
  }
  const kick = (t, v = 0.55) => thump(t, 150, 42, v, 0.3);
  const snare = (t, v = 0.12) => { noiseHit(t, { dur: 0.16, v, type: "bandpass", freq: 2200, q: 0.8, send: 0.35 }); thump(t, 220, 160, v * 1.2, 0.08); };
  const hat = (t, v = 0.03, open = false) => noiseHit(t, { dur: open ? 0.18 : 0.05, v, freq: 9000, send: 0.15 });
  const shaker = (t, v = 0.025) => noiseHit(t, { dur: 0.07, v, freq: 6500, attack: 0.02, send: 0.15 });
  const block = (t, v = 0.07, freq = 1800) => noiseHit(t, { dur: 0.05, v, type: "bandpass", freq, q: 7, send: 0.35 });

  // a short tune made up when the music starts, then repeated with small changes: it feels like a melody, not noodling
  function motif(scale, slots, notes = 5) {
    const pos = [...Array(slots).keys()].sort(() => Math.random() - 0.5).slice(0, notes).sort((a, b) => a - b);
    let i = Math.floor(scale.length / 2);
    return pos.map(p => { i = Math.max(0, Math.min(scale.length - 1, i + pickOf([-2, -1, -1, 1, 1, 2, 0]))); return [p, i]; });
  }
  const vary = (mo, scale, shift) => mo.map(([p, i]) => [p, Math.max(0, Math.min(scale.length - 1, i + shift))]);

  // ---------- extra instruments for the adaptive tunes ----------
  const crash = (t, v = 0.05, dur = 1.4) => noiseHit(t, { dur, v, freq: 5200, q: 0.5, send: 0.7, attack: 0.004 });
  const brass = (m, t, dur, v = 0.045) => synth(m, t, dur, v, 2300, 800, [-10, 10], 0.45);
  const strings = (notes, t, dur, v = 0.02) => pad(notes, t, dur, v, "sawtooth");
  const conga = (t, v = 0.12, hi = false) => thump(t, hi ? 330 : 240, hi ? 260 : 180, v, 0.18);
  const clap = (t, v = 0.07) => { [0, 0.012, 0.026].forEach(d => noiseHit(t + d, { dur: 0.09, v, type: "bandpass", freq: 1400, q: 1.1, send: 0.35 })); };
  const taiko = (t, v = 0.5) => thump(t, 110, 48, v, 0.7);
  const gong = (t, v = 0.05) => { noiseHit(t, { dur: 2.6, v, type: "bandpass", freq: 420, q: 3, send: 0.9, attack: 0.03 }); thump(t, 70, 60, 0.2, 2.2); };
  // where the i-th eighth note falls, swung (sw = 0.66) or straight (sw = 0.5)
  const eighth = (t, b, i, sw = 0.5) => t + Math.floor(i / 2) * b + (i % 2 ? b * sw : 0);
  const prog = (tune, n) => { const p = Math.floor(n / 8) % 2 && tune.B ? tune.B : tune.A; return p[n % p.length]; };
  const playLine = (line, t, b, fn) => { let at = 0; for (const [m, len] of line) { if (m) fn(m, t + at * b, len * b); at += len; } };

  // ---------- the tunes: each bar(n, t, beat, I) plays at intensity I (0 calm, 1 normal, 2 intense) ----------
  // A and B are 8-bar chord sections that take turns. lead() is the voice that plays the theme's cues.
  const N = {};

  // Classic: a lounge bossa. Nylon guitar and bass when calm; rim, shaker and brushes join; a flute takes the tune when it heats up.
  N.classic = {
    bpm: 132, beats: 4, key: 60,
    A: [[48, [52, 55, 59, 62]], [45, [52, 55, 58, 61]], [50, [53, 57, 60, 64]], [43, [53, 57, 59, 64]]],
    B: [[41, [52, 57, 60, 64]], [40, [50, 55, 59, 62]], [45, [49, 55, 59, 64]], [50, [53, 57, 60, 64]], [43, [53, 57, 59, 62]], [48, [52, 55, 59, 62]], [45, [52, 55, 58, 61]], [43, [53, 57, 59, 62]]],
    scale: [67, 69, 71, 72, 74, 76, 79], init() { this.mo = motif(this.scale, 8, 5); },
    lead(m, t, d, v = 0.08) { flute(m, t, d, v, 0.015); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n), e = b / 2;
      [0, 1.5, 2.5, 3].forEach((k, i) => ch.forEach((m, j) => pluck(m, t + k * b + j * 0.012, i === 0 ? 0.11 : 0.08, false, 0.45)));
      bass(root - 12, t, b * 1.4, 0.26); bass(root - 5, t + 1.5 * b, b * 0.5, 0.18); bass(root - 12, t + 2 * b, b * 1.4, 0.24); bass(root - 5, t + 3.5 * b, b * 0.5, 0.18);
      if (I >= 1) { [0, 0.75, 1.5, 2.5, 3.25].forEach(k => block(t + k * b + (n % 2 ? 0.5 * b : 0) % (4 * b), 0.05, 2200)); for (let i = 0; i < 8; i++) shaker(eighth(t, b, i), 0.022); }
      if (I >= 2) { for (let i = 0; i < 8; i++) hat(eighth(t, b, i), i % 2 ? 0.015 : 0.03); kick(t, 0.35); kick(t + 2.5 * b, 0.25);
        for (const [p, i] of vary(this.mo, this.scale, n % 2)) this.lead(this.scale[i], t + p * e, e * 1.6, 0.075); }
    }
  };

  // Cards by the Ocean: island calypso. Steel pan and soft pad when calm; ukulele, congas and shaker; then a full steel-pan tune.
  N.ocean = {
    bpm: 112, beats: 4, key: 65,
    A: [[41, [57, 60, 65]], [48, [55, 60, 64]], [50, [57, 62, 65]], [46, [58, 62, 65]]],
    B: [[46, [58, 62, 65]], [41, [57, 60, 65]], [48, [55, 60, 64]], [50, [57, 62, 65]], [43, [58, 62, 67]], [48, [55, 60, 64]], [41, [57, 60, 65]], [48, [55, 60, 64]]],
    scale: [72, 74, 76, 77, 79, 81, 84], init() { this.mo = motif(this.scale, 16, 7); },
    lead(m, t, d, v = 0.12) { steel(m, t, v); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n), s = b / 4;
      pad(ch, t, b * 4.1, 0.016);
      bass(root - 12, t, b * 0.9, 0.26); bass(root - 5, t + 1.5 * b, b * 0.4, 0.2); bass(root - 12, t + 2 * b, b * 0.9, 0.24); bass(root - 10, t + 3.5 * b, b * 0.4, 0.2);
      [0, 1, 2, 3].forEach(k => steel(ch[(k + n) % ch.length] + 12, t + k * b + 0.5 * b, 0.05));
      if (I >= 1) { [0, 0.5, 1.5, 2, 2.5, 3.5].forEach((k, i) => ch.forEach((m, j) => pluck(m + 12, t + k * b + j * 0.01, 0.05, true, 0.3, 4000)));
        [0, 0.75, 1.5, 2, 2.75, 3.5].forEach((k, i) => conga(t + k * b, 0.1, i % 2 === 1)); for (let i = 0; i < 16; i++) shaker(t + i * s, i % 4 === 2 ? 0.03 : 0.015); }
      if (I >= 2) { kick(t, 0.4); kick(t + 2 * b, 0.4); snare(t + b, 0.07); snare(t + 3 * b, 0.07);
        for (const [p, i] of vary(this.mo, this.scale, n % 4 === 3 ? 1 : 0)) steel(this.scale[i], t + p * s, 0.12); }
    }
  };

  // Feeling Pretty: bubblegum pop. Music box when calm; claps, four-on-the-floor and synth bass; a bright hook on top.
  N.pretty = {
    bpm: 120, beats: 4, key: 69,
    A: [[45, [57, 61, 64]], [52, [56, 59, 64]], [42, [57, 61, 66]], [50, [57, 62, 66]]],
    B: [[50, [57, 62, 66]], [45, [57, 61, 64]], [52, [56, 59, 64]], [42, [57, 61, 66]], [50, [57, 62, 66]], [52, [56, 59, 64]], [45, [57, 61, 64]], [52, [56, 59, 62]]],
    scale: [73, 76, 78, 80, 81, 83, 85, 88], init() { this.mo = motif(this.scale, 16, 8); },
    lead(m, t, d, v = 0.035) { synth(m, t, d, v, 4200, 1600, [-6, 6], 0.4, "square"); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n), s = b / 4;
      pad(ch, t, b * 4.1, 0.022);
      for (let i = 0; i < 8; i++) bell(ch[i % ch.length] + 12 + (i > 3 ? 12 : 0), t + i * 2 * s, 0.07, [[1, 1, 0.8], [2.0, 0.3, 0.3], [3.0, 0.1, 0.2]], 0.6);
      if (I >= 1) { for (let i = 0; i < 4; i++) kick(t + i * b, 0.45); [1, 3].forEach(k => clap(t + k * b, 0.06));
        for (let i = 0; i < 8; i++) synth(root - 12 + (i % 2 ? 12 : 0), t + i * 2 * s, s * 1.5, 0.04, 1500, 300, [-5, 5], 0.1); for (let i = 0; i < 8; i++) hat(t + i * 2 * s + s, 0.02); }
      if (I >= 2) { for (let i = 0; i < 16; i++) hat(t + i * s, 0.012); for (const [p, i] of this.mo) this.lead(this.scale[i], t + p * s, s * 1.8);
        if (n % 4 === 3) for (let i = 0; i < 4; i++) clap(t + 3 * b + i * s, 0.04); }
    }
  };

  // Wild West: a spaghetti-western ride. Twangy guitar and wind when calm; a galloping rhythm; then the lone whistle.
  N.west = {
    bpm: 100, beats: 4, key: 57, minor: true,
    A: [[45, [57, 60, 64]], [43, [55, 59, 62]], [41, [53, 57, 60]], [40, [52, 56, 59]]],
    B: [[45, [57, 60, 64]], [48, [55, 60, 64]], [43, [55, 59, 62]], [45, [57, 60, 64]], [41, [53, 57, 60]], [43, [55, 59, 62]], [40, [52, 56, 59]], [40, [52, 56, 59]]],
    tune: [[69, 1.5], [72, 0.5], [76, 2]], tune2: [[74, 1], [72, 1], [71, 1], [69, 1]],
    lead(m, t, d, v = 0.07) { flute(m + 12, t, d, v, 0.015, m + 10); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n);
      pluck(root, t, 0.2, true, 0.8, 2400); pluck(ch[1], t + 2 * b, 0.12, true, 0.8, 2400);
      if (n % 2 === 0) noiseHit(t, { dur: b * 3, v: 0.012, type: "bandpass", freq: 900, q: 0.6, send: 0.9, attack: b });   // wind
      if (I >= 1) { for (let k = 0; k < 4; k++) { const at = t + k * b; pluck(root, at, 0.08, false, 0.2, 900); pluck(root, at + b / 3, 0.06, false, 0.2, 900); pluck(root + 7, at + 2 * b / 3, 0.07, false, 0.2, 900); block(at, 0.04, 900); block(at + 2 * b / 3, 0.03, 1200); }
        bass(root - 12, t, b * 1.8, 0.24); bass(root - 5, t + 2 * b, b * 1.8, 0.22); }
      if (I >= 2) { snare(t + b, 0.06); snare(t + 3 * b, 0.06); kick(t, 0.35); kick(t + 2 * b, 0.35);
        if (n % 4 < 2) playLine(n % 2 ? this.tune2 : this.tune, t, b, (m, at, d) => this.lead(m, at, d * 0.95)); }
    }
  };

  // Vegas: a big-band swing. Walking bass and piano when calm; ride cymbal and brass stabs; then the brass takes the tune.
  N.vegas = {
    bpm: 144, beats: 4, key: 62,
    A: [[50, [60, 65, 69]], [43, [59, 65, 69]], [48, [59, 64, 67]], [45, [61, 64, 67]]],
    B: [[53, [60, 64, 69]], [50, [60, 65, 69]], [43, [59, 65, 69]], [48, [59, 64, 67]], [41, [60, 64, 69]], [43, [59, 62, 65]], [48, [59, 64, 67]], [43, [59, 65, 69]]],
    scale: [62, 65, 67, 69, 72, 74, 77], init() { this.mo = motif(this.scale, 8, 5); },
    lead(m, t, d, v = 0.05) { brass(m, t, d, v); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n), [nr] = prog(this, n + 1);
      [root, root + 4, root + 7, nr + 1].forEach((m, k) => bass(m - 12, t + k * b, b * 0.9, 0.26));
      [1, 2.66].forEach(k => ch.forEach(m => epiano(m, t + k * b, b * 0.5, 0.03)));
      if (I >= 1) { for (let i = 0; i < 8; i++) if (i % 2 === 0 || i === 3 || i === 7) hat(eighth(t, b, i, 0.66), 0.03, i % 2 === 0); [1, 3].forEach(k => hat(t + k * b, 0.03));
        if (n % 2) ch.forEach(m => brass(m + 12, eighth(t, b, 3, 0.66), b * 0.4, 0.025)); }
      if (I >= 2) { kick(t, 0.3); kick(t + 2 * b, 0.25); snare(eighth(t, b, 5, 0.66), 0.05);
        for (const [p, i] of vary(this.mo, this.scale, n % 2)) this.lead(this.scale[i] + 12, eighth(t, b, p, 0.66), b * 0.7, 0.045); }
    }
  };

  // Into the Future: synthwave. A glowing pad and soft arp when calm; drums and pumping bass; then the lead and gated snare.
  N.future = {
    bpm: 100, beats: 4, key: 69, minor: true,
    A: [[45, [57, 60, 64]], [41, [57, 60, 65]], [48, [55, 60, 64]], [43, [55, 59, 62]]],
    B: [[50, [57, 62, 65]], [41, [57, 60, 65]], [45, [57, 60, 64]], [43, [55, 59, 62]], [50, [57, 62, 65]], [41, [57, 60, 65]], [48, [55, 60, 64]], [52, [56, 59, 64]]],
    scale: [69, 71, 72, 74, 76, 79, 81], init() { this.mo = motif(this.scale, 16, 6); },
    lead(m, t, d, v = 0.04) { synth(m + 12, t, d, v, 2800, 1000, [-12, 12], 0.6); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n), s = b / 4;
      pad(ch, t, b * 4.1, I ? 0.02 : 0.032, "sawtooth");
      for (let i = 0; i < 16; i++) synth(ch[i % 3] + 12, t + i * s, s * 0.7, I ? 0.012 : 0.018, 4000, 1200, [0], 0.5, "square");
      if (I >= 1) { for (let i = 0; i < 16; i++) synth(root - 12 + (i % 4 === 2 ? 12 : 0), t + i * s, s * 0.9, 0.045, 900 + (i % 4) * 300, 180, [-5, 5], 0.1);
        [0, 2].forEach(k => kick(t + k * b, 0.5)); [1, 3].forEach(k => snare(t + k * b, 0.1)); for (let i = 0; i < 8; i++) hat(t + i * 2 * s + s, 0.02); }
      if (I >= 2) { kick(t + 2.75 * b, 0.3); [1, 3].forEach(k => noiseHit(t + k * b, { dur: 0.4, v: 0.035, freq: 3000, send: 0.9 }));
        for (const [p, i] of vary(this.mo, this.scale, n % 8 >= 4 ? 1 : 0)) this.lead(this.scale[i], t + p * s, s * 2.2); }
    }
  };

  // Northern Lights: ambient. Shimmering pads and falling glass when calm; a slow pulse and sub bass; then a soft beat and a high line.
  N.aurora = {
    bpm: 66, beats: 4, key: 62,
    A: [[50, [62, 66, 69, 73]], [47, [59, 62, 66, 69]], [43, [59, 62, 66, 71]], [45, [57, 62, 64, 69]]],
    scale: [74, 76, 78, 81, 83, 86], init() { this.mo = motif(this.scale, 8, 3); },
    lead(m, t, d, v = 0.06) { bell(m, t, v, [[1, 1, 2.2], [2.0, 0.3, 0.8], [3.0, 0.12, 0.4]], 0.9); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n);
      pad(ch, t, b * 4.4, 0.04);
      for (let i = 0; i < 3; i++) this.lead(pickOf(this.scale) + 12, t + (i * 1.3 + Math.random() * 0.4) * b, 0, 0.035);
      if (I >= 1) { for (let i = 0; i < 8; i++) synth(ch[i % ch.length], t + i * b / 2, b * 0.4, 0.012, 1600, 500, [-4, 4], 0.7); bass(root - 12, t, b * 3.8, 0.2, "sine", 400); }
      if (I >= 2) { kick(t, 0.3); kick(t + 2 * b, 0.25); noiseHit(t + b, { dur: 0.5, v: 0.02, freq: 4000, send: 1 }); noiseHit(t + 3 * b, { dur: 0.5, v: 0.02, freq: 4000, send: 1 });
        for (const [p, i] of this.mo) flute(this.scale[i] + 12, t + p * b / 2, b * 1.2, 0.04, 0.008); }
    }
  };

  // Lantern Night: a festival tune. Guzheng ripples and a dizi flute when calm; temple blocks and hand drum; then big drums and the gong.
  N.lantern = {
    bpm: 92, beats: 4, key: 62,
    A: [[50, [62, 66, 69]], [43, [62, 67, 71]], [45, [64, 69, 73]], [50, [62, 66, 69]]],
    B: [[47, [62, 66, 71]], [43, [62, 67, 71]], [45, [64, 69, 73]], [50, [62, 66, 69]], [47, [62, 66, 71]], [45, [64, 69, 73]], [43, [62, 67, 71]], [45, [64, 69, 73]]],
    scale: [74, 76, 78, 81, 83, 86, 88], init() { this.mo = motif(this.scale, 8, 6); },
    lead(m, t, d, v = 0.07) { flute(m, t, d, v, 0.02, m - 2); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n), s = b / 4;
      for (let i = 0; i < 8; i++) pluck([...ch, ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12, ch[0] + 12][i], t + i * s + (n % 2 ? 2 * b : 0), 0.1, true, 0.6);
      bass(root - 12, t, b * 3.5, 0.18, "sine", 500);
      for (const [p, i] of vary(this.mo, this.scale, n % 2)) if (I >= 1 || n % 4 >= 2) this.lead(this.scale[i], t + p * b / 2, b * 0.8, I >= 1 ? 0.07 : 0.05);
      if (I >= 1) { [0, 1, 1.5, 2, 3].forEach((k, i) => block(t + k * b, 0.05, i % 2 ? 1500 : 1100)); conga(t + 2.5 * b, 0.12); }
      if (I >= 2) { taiko(t, 0.5); taiko(t + 1.5 * b, 0.35); taiko(t + 2 * b, 0.45); for (let i = 0; i < 4; i++) noiseHit(t + 3 * b + i * s, { dur: 0.06, v: 0.04, type: "bandpass", freq: 3000, q: 2, send: 0.3 }); if (n % 8 === 0) gong(t, 0.045); }
    }
  };

  // Emperor's House: koto and shakuhachi in an old Japanese scale. Calm; a soft taiko heartbeat; then rolling taiko and fast koto.
  N.emperor = {
    bpm: 72, beats: 4, key: 62, minor: true,
    A: [[50, [62, 63, 67, 69]], [50, [62, 63, 67, 70]], [43, [62, 67, 69, 70]], [45, [62, 63, 69, 70]]],
    scale: [62, 63, 67, 69, 70, 74, 75, 79, 81], init() { this.mo = motif(this.scale, 8, 5); },
    lead(m, t, d, v = 0.08) { flute(m + 12, t, d, v, 0.035, m + 11); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n);
      ch.forEach((m, j) => pluck(m, t + j * 0.11, 0.13, true, 0.7, 3200));
      pluck(ch[2] + 12, t + 2 * b, 0.1, true, 0.7, 3200); pluck(ch[3], t + 3 * b, 0.08, true, 0.7, 3200);
      bass(root - 12, t, b * 3.8, 0.14, "sine", 400);
      if (n % 2 || I >= 1) for (const [p, i] of vary(this.mo, this.scale, n % 4 >= 2 ? 1 : 0)) this.lead(this.scale[i], t + p * b / 2, b * 1.1, 0.07);
      if (I >= 1) { taiko(t, 0.4); taiko(t + 2 * b, 0.3); block(t + 3.5 * b, 0.04, 2600); }
      if (I >= 2) { [0.5, 1, 1.5, 2.5, 3, 3.25, 3.5, 3.75].forEach((k, i) => taiko(t + k * b, i > 4 ? 0.25 : 0.35));
        for (let i = 0; i < 8; i++) pluck(ch[i % 4] + 12, t + i * b / 2 + b / 4, 0.06, true, 0.4, 3600); }
    }
  };

  // Pirate's Cove: a sea shanty in 6/8. Accordion and bass when calm; stomps and claps; then the fiddle tune.
  N.pirate = {
    bpm: 126, beats: 6, key: 62, minor: true,
    A: [[50, [62, 65, 69]], [48, [60, 64, 67]], [50, [62, 65, 69]], [45, [61, 64, 69]]],
    B: [[41, [60, 65, 69]], [48, [60, 64, 67]], [50, [62, 65, 69]], [45, [61, 64, 69]], [46, [62, 65, 70]], [41, [60, 65, 69]], [45, [61, 64, 69]], [50, [62, 65, 69]]],
    tune: [[74, 1], [74, 0.5], [76, 0.5], [77, 1], [76, 1], [74, 1], [72, 1]], tune2: [[69, 1], [72, 1], [74, 1], [76, 1.5], [74, 0.5], [73, 1]],
    lead(m, t, d, v = 0.06) { reed(m, t, d, v); },
    bar(n, t, e, I) {
      const [root, ch] = prog(this, n);
      [0, 3].forEach(k => ch.forEach(m => reed(m, t + k * e, e * 2.6, 0.022)));
      bass(root - 12, t, e * 2.5, 0.28); bass(root - 5, t + 3 * e, e * 2.5, 0.24);
      if (I >= 1) { [0, 3].forEach(k => kick(t + k * e, 0.45)); [1.5, 4.5].forEach(k => clap(t + k * e, 0.05)); [2, 5].forEach(k => shaker(t + k * e, 0.03)); }
      if (I >= 2) { playLine(n % 2 ? this.tune2 : this.tune, t, e, (m, at, d) => this.lead(m, at, d * 0.9, 0.055)); if (n % 4 === 3) crash(t, 0.03); }
    }
  };

  // Midnight Jazz Club: a piano trio. Brushes and walking bass when calm; ride cymbal and fuller comping; then the sax solo.
  N.jazz = {
    bpm: 116, beats: 4, key: 58,
    A: [[48, [58, 62, 63, 67]], [41, [57, 60, 63, 67]], [46, [57, 60, 62, 65]], [43, [58, 62, 65, 69]]],
    B: [[48, [58, 62, 63, 67]], [41, [57, 60, 63, 67]], [50, [57, 60, 64, 65]], [43, [59, 62, 65, 69]], [48, [58, 62, 63, 67]], [41, [57, 60, 63, 67]], [46, [57, 60, 62, 65]], [46, [57, 60, 62, 65]]],
    scale: [65, 67, 70, 72, 74, 75, 77, 79], init() { this.mo = motif(this.scale, 8, 6); this.mo2 = motif(this.scale, 8, 5); },
    lead(m, t, d, v = 0.06) { reed(m, t, d, v); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n), [nr] = prog(this, n + 1);
      [root, root + 3, root + 7, nr - 1].forEach((m, k) => bass(m - 12, t + k * b, b * 0.9, 0.28));
      [0, 1.66].forEach((k, i) => ch.forEach(m => epiano(m, t + k * b, b * (i ? 1.2 : 0.6), I ? 0.04 : 0.03)));
      for (let k = 0; k < 4; k++) noiseHit(t + k * b, { dur: b * 0.9, v: 0.012, type: "bandpass", freq: 3500, q: 0.5, send: 0.2, attack: b * 0.3 });
      if (I >= 1) { for (let i = 0; i < 8; i++) if (i % 2 === 0 || i === 3 || i === 7) hat(eighth(t, b, i, 0.66), 0.028, i % 2 === 0); [1, 3].forEach(k => hat(t + k * b, 0.02)); ch.forEach(m => epiano(m + 12, eighth(t, b, 7, 0.66), b * 0.3, 0.02)); }
      if (I >= 2) { kick(t, 0.2); snare(eighth(t, b, 3, 0.66), 0.03); for (const [p, i] of vary(n % 2 ? this.mo2 : this.mo, this.scale, n % 4 >= 2 ? 1 : 0)) this.lead(this.scale[i], eighth(t, b, p, 0.66), b * 0.6, 0.055); }
    }
  };

  // Enchanted Forest: a Celtic folk tune in 6/8. Harp and a breathy flute when calm; bodhrán drum; then the fiddle jig.
  N.forest = {
    bpm: 112, beats: 6, key: 67,
    A: [[43, [55, 59, 62]], [40, [55, 59, 64]], [48, [55, 60, 64]], [50, [54, 57, 62]]],
    B: [[48, [55, 60, 64]], [43, [55, 59, 62]], [50, [54, 57, 62]], [40, [55, 59, 64]], [48, [55, 60, 64]], [50, [54, 57, 62]], [43, [55, 59, 62]], [50, [54, 57, 62]]],
    jig: [[79, 1], [78, 0.5], [76, 0.5], [74, 1], [76, 1], [78, 1], [79, 1]], jig2: [[81, 1], [79, 1], [76, 1], [74, 1.5], [76, 0.5], [74, 1]],
    lead(m, t, d, v = 0.06) { flute(m, t, d, v, 0.025); },
    bar(n, t, e, I) {
      const [root, ch] = prog(this, n);
      [...ch, ch[0] + 12, ch[1] + 12, ch[2] + 12].forEach((m, i) => pluck(m, t + i * e, 0.1, true, 0.6, 3000));
      bass(root - 12, t, e * 5.5, 0.18, "sine", 500);
      if (I === 0 && n % 4 >= 2) playLine(n % 2 ? this.jig2 : this.jig, t, e, (m, at, d) => this.lead(m - 12, at, d * 1.4, 0.045));
      if (I >= 1) { [0, 2, 3, 5].forEach((k, i) => thump(t + k * e, i % 2 ? 160 : 120, 70, i % 2 ? 0.2 : 0.35, 0.25)); [1, 4].forEach(k => noiseHit(t + k * e, { dur: 0.06, v: 0.03, type: "bandpass", freq: 800, q: 1, send: 0.2 })); }
      if (I >= 2) playLine(n % 2 ? this.jig2 : this.jig, t, e, (m, at, d) => reed(m, at, d * 0.92, 0.05));
    }
  };

  // Garage: a blues-rock boogie. A chugging riff when calm; the drums kick in; then lead licks and crashes.
  N.garage = {
    bpm: 138, beats: 4, key: 52,
    A: [[40, [52, 56, 59]], [40, [52, 56, 59]], [45, [57, 61, 64]], [40, [52, 56, 59]]],
    B: [[45, [57, 61, 64]], [45, [57, 61, 64]], [40, [52, 56, 59]], [40, [52, 56, 59]], [47, [59, 63, 66]], [45, [57, 61, 64]], [40, [52, 56, 59]], [47, [59, 63, 66]]],
    scale: [64, 67, 69, 70, 71, 74, 76, 79], init() { this.mo = motif(this.scale, 8, 6); },
    lead(m, t, d, v = 0.18) { pluck(m, t, v, true, 0.6, 3600); },
    bar(n, t, b, I) {
      const [root] = prog(this, n);
      [0, 7, 9, 7, 10, 9, 7, 9].forEach((off, i) => synth(root - 12 + off, eighth(t, b, i, 0.66), b * 0.45, 0.042, 1500, 400, [-12, 12], 0.12, "sawtooth"));
      for (let i = 0; i < 8; i++) bass(root - 12 + (i % 2 ? 0 : 0), eighth(t, b, i, 0.66), b * 0.3, 0.2, "triangle", 500);
      if (I >= 1) { [0, 2].forEach(k => kick(t + k * b, 0.55)); kick(eighth(t, b, 5, 0.66), 0.3); [1, 3].forEach(k => snare(t + k * b, 0.14)); for (let i = 0; i < 8; i++) hat(eighth(t, b, i, 0.66), 0.025); }
      if (I >= 2) { for (const [p, i] of vary(this.mo, this.scale, n % 2)) this.lead(this.scale[i], eighth(t, b, p, 0.66), b * 0.5, 0.16); if (n % 4 === 0) crash(t, 0.04); }
    }
  };

  // Space Fight: a film-score battle. Low strings and a pulsing ostinato when calm; a marching snare and timpani; then the brass theme.
  N.space = {
    bpm: 112, beats: 4, key: 55,
    A: [[43, [55, 59, 62]], [43, [55, 59, 62]], [39, [55, 58, 63]], [41, [53, 57, 60]]],
    B: [[36, [55, 60, 64]], [38, [53, 57, 62]], [43, [55, 59, 62]], [39, [55, 58, 63]], [36, [55, 60, 64]], [41, [53, 57, 60]], [43, [55, 59, 62]], [42, [54, 57, 62]]],
    tune: [[67, 1.5], [74, 0.5], [74, 1], [72, 0.5], [71, 0.5]], tune2: [[69, 1], [71, 0.5], [72, 0.5], [74, 1.5], [67, 0.5]],
    lead(m, t, d, v = 0.05) { brass(m, t, d, v); brass(m - 12, t, d, v * 0.6); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n), s = b / 4;
      strings(ch.map(m => m - 12), t, b * 4.1, 0.032);
      for (let i = 0; i < 16; i++) synth([root, root + 12, root + 7, root + 12][i % 4], t + i * s, s * 0.8, 0.036, 1400, 400, [-8, 8], 0.25);
      if (I === 0) taiko(t, 0.25);
      if (I >= 1) { taiko(t, 0.4); taiko(t + 2 * b, 0.35); for (let i = 0; i < 4; i++) snare(t + i * b + b / 2, 0.05); snare(t + 3.75 * b, 0.06); }
      if (I >= 2) { playLine(n % 2 ? this.tune2 : this.tune, t, b, (m, at, d) => this.lead(m + 12, at, d * 0.95)); if (n % 4 === 0) crash(t, 0.04);
        if (n % 4 === 3) for (let i = 0; i < 8; i++) snare(t + 3 * b + i * b / 8, 0.03 + i * 0.008); }
    }
  };

  // Feeling Deezy?: chillwave. A woozy electric piano and pad when calm; a lazy beat and crackle; then a dreamy lead floats over.
  N.deezy = {
    bpm: 74, beats: 4, key: 65,
    A: [[41, [57, 60, 64, 67]], [40, [55, 59, 62, 65]], [38, [57, 60, 64, 65]], [43, [53, 57, 59, 62]]],
    B: [[46, [57, 62, 65, 69]], [45, [55, 60, 64, 67]], [43, [53, 57, 62, 65]], [48, [55, 58, 62, 64]], [46, [57, 62, 65, 69]], [45, [55, 60, 64, 67]], [38, [57, 60, 64, 65]], [43, [53, 57, 59, 62]]],
    scale: [69, 72, 74, 76, 79, 81, 84], init() { this.mo = motif(this.scale, 16, 5); this.mo2 = motif(this.scale, 16, 4); },
    lead(m, t, d, v = 0.05) { flute(m, t, d, v, 0.01, m - 1); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n), s = b / 4;
      ch.forEach((m, i) => epiano(m, t + i * 0.035, b * 3.6, 0.042));
      pad(ch.map(m => m + 12), t, b * 4.2, 0.012);
      bass(root - 12, t, b * 1.6, 0.24, "sine", 500); bass(root - 5, t + 2.5 * b, b * 1.2, 0.18, "sine", 500);
      if (I >= 1) { kick(t, 0.36); kick(t + 1.75 * b, 0.2); kick(t + 2.5 * b, 0.28); [1, 3].forEach(k => noiseHit(t + k * b + 0.025, { dur: 0.2, v: 0.055, type: "bandpass", freq: 1500, q: 0.7, send: 0.5 }));
        for (let i = 0; i < 8; i++) hat(t + i * 2 * s + (i % 2 ? s * 0.33 : 0), 0.013); for (let i = 0; i < 5; i++) noiseHit(t + Math.random() * 4 * b, { dur: 0.01, v: 0.012, freq: 3000, send: 0 }); }
      if (I >= 2) for (const [p, i] of (n % 4 < 2 ? this.mo : this.mo2)) this.lead(this.scale[i], t + p * s * 1.02, s * 3, 0.05);
      else if (n % 8 >= 4) for (const [p, i] of this.mo2) bell(this.scale[i], t + p * s, 0.04, [[1, 1, 1.6], [2.0, 0.3, 0.6]], 0.8);
    }
  };

  // ---------- upgrades: the current tune, kept as it is at "normal", stripped back when calm, built up when intense ----------
  // (These replace the first-round rewrites for the themes where the original concept should stay.)

  // Vegas: the same late-night casino groove. Calm = the lounge before the doors open; intense = full floor show.
  N.vegas = {
    bpm: 118, beats: 4, key: 62, minor: true,
    A: [[50, [62, 65, 69, 72]], [50, [62, 65, 69, 72]], [55, [62, 65, 67, 71]], [55, [62, 65, 67, 71]]],
    B: [[46, [62, 65, 69, 70]], [46, [62, 65, 69, 70]], [45, [61, 64, 67, 69]], [45, [61, 64, 67, 69]], [50, [62, 65, 69, 72]], [55, [62, 65, 67, 71]], [46, [62, 65, 69, 70]], [45, [61, 64, 67, 69]]],
    scale: [62, 65, 67, 69, 72, 74, 77], init() { this.mo = motif(this.scale, 16, 7); this.riff = motif(this.scale, 8, 5); },
    lead(m, t, d, v = 0.045) { brass(m, t, d, v); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n), s = b / 4;
      if (I === 0) {
        pad(ch, t, b * 4.1, 0.018, "sawtooth");
        for (let i = 0; i < 4; i++) synth(root - 12 + (i % 2 ? 12 : 0), t + i * b, b * 0.8, 0.04, 900, 200, [-6, 6], 0.15);
        kick(t, 0.3); kick(t + 2 * b, 0.25); hat(t + 1.5 * b, 0.02, true); hat(t + 3.5 * b, 0.02, true);
        if (n % 2) for (const [p, i] of this.mo.slice(0, 4)) bell(this.scale[i] + 12, t + p * s, 0.05, [[1, 1, 0.5], [2.0, 0.4, 0.3]], 0.6);
        return;
      }
      // the current groove
      for (let i = 0; i < 4; i++) { kick(t + i * b, 0.5); hat(t + i * b + 2 * s, 0.035, true); }
      [1, 3].forEach(k => snare(t + k * b, 0.09));
      for (let i = 0; i < 8; i++) synth(root - 12 + (i % 2 ? 12 : 0), t + i * 2 * s, s * 1.6, 0.05, 1200, 200, [-6, 6], 0.1);
      if (n % 2 === 0) ch.forEach(m => synth(m, t + 1.5 * b, 0.22, 0.03, 3200, 900, [-10, 10], 0.4));
      else ch.forEach(m => synth(m, t + 3.5 * b, 0.4, 0.03, 3200, 700, [-10, 10], 0.4));
      if (n % 4 >= 2) for (const [p, i] of this.mo) bell(this.scale[i] + 12, t + p * s, 0.06, [[1, 1, 0.4], [2.0, 0.4, 0.25]], 0.5);
      if (I === 2) {
        [1, 3].forEach(k => clap(t + k * b, 0.05)); for (let i = 0; i < 16; i++) if (i % 4 !== 2) hat(t + i * s, 0.012);
        if (n % 4 < 2) for (const [p, i] of vary(this.riff, this.scale, n % 2)) brass(this.scale[i], t + p * b / 2, b * 0.4, 0.04);
        ch.forEach(m => synth(m + 12, t + 2.5 * b, 0.18, 0.02, 4000, 1200, [-10, 10], 0.4));
        if (n % 4 === 0) crash(t, 0.035);
        if (n % 4 === 3) noiseHit(t + 2 * b, { dur: 2 * b, v: 0.03, type: "bandpass", freq: 2500, q: 0.8, send: 0.6, attack: 2 * b * 0.9 });
      }
    }
  };

  // Into the Future: the same synthwave. Calm = pad and arp in the dark; intense = the full drive with the lead on every phrase.
  N.future = {
    bpm: 104, beats: 4, key: 69, minor: true,
    A: [[45, [57, 60, 64]], [41, [57, 60, 65]], [48, [55, 60, 64]], [43, [55, 59, 62]]],
    B: [[41, [57, 60, 65]], [43, [55, 59, 62]], [45, [57, 60, 64]], [45, [57, 60, 64]], [41, [57, 60, 65]], [43, [55, 59, 62]], [48, [55, 60, 64]], [40, [56, 59, 64]]],
    scale: [69, 71, 72, 74, 76, 79, 81], init() { this.mo = motif(this.scale, 16, 6); },
    lead(m, t, d, v = 0.035) { synth(m + 12, t, d, v, 2600, 900, [-12, 12], 0.6); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n), s = b / 4;
      pad(ch, t, b * 4.1, I === 0 ? 0.026 : 0.018, "sawtooth");
      for (let i = 0; i < 16; i++) synth(ch[i % 3] + 12, t + i * s, s * 0.7, I === 0 ? 0.016 : 0.012, 4000, 1200, [0], 0.5, "square");
      if (I === 0) { bass(root - 12, t, b * 3.8, 0.2, "sine", 400); if (n % 4 === 3) for (const [p, i] of this.mo.slice(0, 3)) this.lead(this.scale[i], t + p * s, s * 3, 0.022); return; }
      for (let i = 0; i < 16; i++) synth(root - 12 + (i % 4 === 2 ? 12 : 0), t + i * s, s * 0.9, 0.045, 900 + (i % 4) * 300, 180, [-5, 5], 0.1);
      [0, 2].forEach(k => kick(t + k * b, 0.5)); kick(t + 2.75 * b, 0.3);
      [1, 3].forEach(k => { snare(t + k * b, 0.12); noiseHit(t + k * b, { dur: 0.4, v: 0.03, freq: 3000, send: 0.9 }); });
      for (let i = 0; i < 8; i++) hat(t + i * 2 * s + s, 0.02);
      if (n % 8 >= 4 || I === 2) for (const [p, i] of vary(this.mo, this.scale, I === 2 && n % 8 < 4 ? 1 : 0)) this.lead(this.scale[i], t + p * s, s * 2.2);
      if (I === 2) {
        for (let i = 0; i < 16; i++) synth(ch[(i + 1) % 3] + 24, t + i * s + s / 2, s * 0.4, 0.007, 5000, 2000, [0], 0.7, "square");
        for (let i = 0; i < 8; i++) hat(t + i * 2 * s, 0.018, true);
        if (n % 4 === 3) [0, 1, 2, 3].forEach(k => thump(t + 3 * b + k * s, 200 - k * 30, 80, 0.3, 0.2));
        if (n % 8 === 0) crash(t, 0.035);
      }
    }
  };

  // Northern Lights: still slow, still no drums. Calm = the bare sky; intense = shimmering arpeggios and a soft swell.
  N.aurora = {
    bpm: 60, beats: 4, key: 62,
    A: [[38, [62, 66, 69, 73, 76]], [40, [64, 67, 71, 74, 78]], [35, [62, 66, 69, 71, 74]], [43, [62, 67, 71, 74, 78]]],
    B: [[43, [62, 67, 71, 74, 78]], [45, [61, 64, 69, 71, 76]], [35, [62, 66, 69, 71, 74]], [42, [61, 64, 69, 73, 76]], [43, [62, 67, 71, 74, 78]], [45, [61, 64, 69, 71, 76]], [40, [64, 67, 71, 74, 78]], [38, [62, 66, 69, 73, 76]]],
    lead(m, t, d, v = 0.06) { bell(m, t, v, [[1, 1, 2.5], [2.0, 0.2, 1.2], [3.0, 0.08, 0.6]], 0.9); },
    cues: {
      big(tune, t) { const [, ch] = prog(tune, 0); ch.concat(ch.map(m => m + 12)).forEach((m, i) => tune.lead(m + 12, t + i * 0.09, 0, 0.05)); pad(ch, t, 3, 0.04); return 2.6; }
    },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n);
      pad([root, root + 7], t, b * 4.4, 0.04);
      if (I >= 1) pad(ch.slice(0, 3), t, b * 4.4, 0.022, "triangle");
      const count = I === 0 ? 2 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) this.lead(pickOf(ch) + 12 * pickOf([0, 1, 1]), t + Math.random() * b * 3.8, 0, 0.05);
      if (I === 2) {
        for (let i = 0; i < 8; i++) this.lead(ch[i % ch.length] + 12, t + i * b / 2, 0, 0.022);
        flute(ch[n % ch.length] + 12, t + b, b * 2.6, 0.022, 0.006);
        pad([root + 24 + 7], t, b * 4.2, 0.012);
      }
    }
  };

  // Lantern Night: the same guzheng tune. Calm = guzheng over the drone; intense = dizi doubling, festival cymbals and the gong.
  const PENTA = [55, 57, 59, 62, 64, 67, 69, 71, 74, 76, 79, 81];
  const LANTERN_PHRASES = [
    [[74, 1], [76, 1], [79, 2], [76, 1], [74, 1], [71, 2]],
    [[69, 1], [71, 1], [74, 1], [76, 1], [74, 2], [71, 2]],
    [[67, 1.5], [69, 0.5], [71, 1], [74, 1], [69, 2], [67, 2]],
    [[79, 1], [76, 1], [74, 1], [71, 1], [74, 3], [0, 1]]
  ];
  const LANTERN_B = [
    [[76, 1], [79, 1], [81, 2], [79, 1], [76, 1], [74, 2]],
    [[71, 1], [74, 1], [76, 2], [74, 1], [71, 1], [69, 2]],
    [[67, 1], [69, 1], [71, 1], [74, 1], [76, 2], [74, 2]],
    [[79, 1.5], [76, 0.5], [74, 1], [71, 1], [67, 3], [0, 1]]
  ];
  N.lantern = {
    bpm: 76, beats: 4, key: 67,
    A: [[43, [62, 67, 71]]],
    drones: [[43, 50, 62], [40, 47, 59], [36, 43, 64], [38, 45, 62]],
    lead(m, t, d, v = 0.3) { pluck(m, t, v); },
    bar(n, t, beat, I) {
      if (n % 2 === 0) pad(this.drones[(n / 2) % 4], t, beat * 8.2, 0.045);
      if (I >= 1) {
        thump(t, 110, 50, 0.3, 0.6);
        if (n % 2 === 1) thump(t + 2.5 * beat, 110, 50, 0.18, 0.5);
        [1, 3].forEach(b => noiseHit(t + b * beat, { dur: 0.05, v: 0.06, type: "bandpass", freq: 1800, q: 6, send: 0.4 }));
      }
      const B = Math.floor(n / 8) % 2 === 1;
      const phrase = n % 8 === 7 ? null : (B ? LANTERN_B : LANTERN_PHRASES)[n % 4];
      if (phrase) {
        let at = 0;
        for (const [m, len] of phrase) { if (m) { pluck(m, t + at * beat, I === 0 ? 0.26 : 0.34); if (len >= 2) pluck(m, t + (at + 0.5) * beat, 0.11); if (I === 2) flute(m + 12, t + at * beat, len * beat * 0.9, 0.04, 0.015); } at += len; }
      } else {
        PENTA.slice(3).forEach((m, i) => pluck(m, t + i * beat * 0.12, 0.22));
        pluck(79, t + 2 * beat, 0.34);
      }
      if (I === 2) {
        thump(t + 1.5 * beat, 120, 55, 0.22, 0.4); thump(t + 3 * beat, 120, 55, 0.25, 0.4);
        [0.5, 1.5, 2.5, 3.5].forEach(k => noiseHit(t + k * beat, { dur: 0.12, v: 0.025, type: "bandpass", freq: 6000, q: 1.5, send: 0.5 }));
        if (n % 8 === 0) gong(t, 0.045);
      }
    }
  };

  // Midnight Jazz Club: more jazz. A proper ride pattern and hi-hat, walking bass with approach notes, real comping;
  // calm = piano and bass with brushes; intense = a horn solo over the changes and a drummer who talks back.
  N.jazz = {
    bpm: 112, beats: 4, key: 60,
    A: [
      { root: 50, voicing: [65, 69, 72, 76], scale: [62, 64, 65, 67, 69, 71, 72, 74, 76, 77] },
      { root: 43, voicing: [65, 71, 76], scale: [62, 64, 65, 67, 69, 71, 72, 74, 76, 77] },
      { root: 48, voicing: [64, 67, 71, 74], scale: [60, 62, 64, 67, 69, 71, 72, 74, 76, 79] },
      { root: 45, voicing: [67, 70, 73, 76], scale: [61, 64, 65, 67, 69, 70, 73, 76] }
    ],
    B: [
      { root: 52, voicing: [62, 67, 71, 74], scale: [64, 66, 67, 69, 71, 72, 74, 76] },
      { root: 45, voicing: [61, 67, 70, 73], scale: [61, 64, 65, 67, 69, 70, 73, 76] },
      { root: 50, voicing: [65, 69, 72, 76], scale: [62, 64, 65, 67, 69, 71, 72, 74, 76, 77] },
      { root: 43, voicing: [65, 69, 71, 76], scale: [62, 64, 65, 67, 69, 71, 72, 74, 76, 77] },
      { root: 48, voicing: [64, 67, 71, 74], scale: [60, 62, 64, 67, 69, 71, 72, 74, 76, 79] },
      { root: 45, voicing: [67, 70, 73, 76], scale: [61, 64, 65, 67, 69, 70, 73, 76] },
      { root: 50, voicing: [65, 69, 72, 76], scale: [62, 64, 65, 67, 69, 71, 72, 74, 76, 77] },
      { root: 43, voicing: [65, 71, 76], scale: [62, 64, 65, 67, 69, 71, 72, 74, 76, 77] }
    ],
    lead(m, t, d, v = 0.06) { reed(m, t, d, v); },
    bar(n, t, beat, I) {
      const p = Math.floor(n / 8) % 2 ? this.B : this.A, ch = p[n % p.length], next = p[(n + 1) % p.length], sw = beat * 2 / 3;
      // walking bass: chord tones, then a chromatic step into the next chord
      const walk = [ch.root, ch.root + pickOf([3, 4, 7]), ch.root + pickOf([5, 7, 9]), next.root + pickOf([-1, 1])];
      walk.forEach((m, i) => bass(m, t + i * beat, beat * 0.95));
      if (I === 2 && Math.random() < 0.4) bass(walk[2] + 1, t + 2 * beat + sw, beat * 0.3, 0.2);
      if (I === 0) {
        for (let i = 0; i < 4; i++) noiseHit(t + i * beat, { dur: beat * 0.9, v: 0.016, type: "bandpass", freq: 3500, q: 0.5, send: 0.2, attack: beat * 0.35 });   // brush swirl
        ch.voicing.forEach(m => epiano(m, t, beat * 2.5, 0.04)); ch.voicing.forEach(m => epiano(m, t + 2 * beat + sw, beat * 1.2, 0.03));
        return;
      }
      // ride: ding, ding-a ding, ding-a; hi-hat foot on 2 and 4
      for (let i = 0; i < 4; i++) { noiseHit(t + i * beat, { dur: 0.3, v: 0.034, freq: 8000 }); if (i % 2) { noiseHit(t + i * beat + sw, { dur: 0.15, v: 0.022, freq: 8500 }); noiseHit(t + i * beat, { dur: 0.05, v: 0.03, freq: 6000 }); } }
      for (let i = 1; i < 4; i += 2) noiseHit(t + i * beat, { dur: 0.16, v: 0.04, type: "bandpass", freq: 3000, attack: 0.03 });
      const comp = Math.random() < 0.5 ? [[sw, 0.3], [3 * beat, 0.5]] : [[beat + sw, 0.35], [2 * beat + sw, 0.25]];
      comp.forEach(([at, d]) => ch.voicing.forEach(m => epiano(m, t + at, d, 0.05)));
      const solo = (fn, from = 0) => {
        const slots = [0, 1, 2, 3, 4, 5, 6, 7].filter(k => k >= from && Math.random() < 0.72);
        let m = pickOf(ch.scale);
        for (const k of slots) { fn(m, t + Math.floor(k / 2) * beat + (k % 2 ? sw : 0)); const i = ch.scale.indexOf(m); m = ch.scale[Math.max(0, Math.min(ch.scale.length - 1, i + pickOf([-2, -1, -1, 1, 1, 2])))]; }
      };
      if (I === 1 && (n % 2 === 1 || Math.random() < 0.35)) solo((m, at) => epiano(m + 12, at, 0.25, 0.075), pickOf([0, 1, 2]));
      if (I === 2) {
        solo((m, at) => reed(m, at, sw * 0.95, 0.05), n % 2);
        for (let i = 0; i < 4; i++) if (Math.random() < 0.35) snare(t + i * beat + sw, 0.025);
        kick(t, 0.15);
        if (n % 4 === 3) [0, 1, 2].forEach(k => snare(t + 3 * beat + k * sw / 2, 0.04 + k * 0.01));
      }
    }
  };

  // Enchanted Forest: the same jig. Calm = harp and bass; intense = a fiddle joins the whistle and the drum gets busy.
  N.forest = {
    bpm: 112, beats: 6, key: 62,
    A: [[50, [62, 66, 69]], [48, [60, 64, 67]], [50, [62, 66, 69]], [45, [61, 64, 69]], [47, [62, 66, 71]], [43, [62, 67, 71]], [48, [60, 64, 67]], [50, [62, 66, 69]]],
    B: [[47, [62, 66, 71]], [43, [62, 67, 71]], [50, [62, 66, 69]], [45, [61, 64, 69]], [47, [62, 66, 71]], [43, [62, 67, 71]], [45, [61, 64, 69]], [50, [62, 66, 69]]],
    scale: [74, 76, 78, 79, 81, 83, 84, 86],
    init() { this.mo = motif(this.scale, 6, 5); this.mo2 = motif(this.scale, 6, 4); },
    lead(m, t, d, v = 0.055) { flute(m, t, d, v, 0.01); },
    bar(n, t, e, I) {
      const [root, ch] = prog(this, n);
      bass(root - 12, t, e * 2.6, 0.22, "sine");
      [0, 1, 2, 3, 4, 5].forEach(i => pluck([ch[0], ch[1], ch[2], ch[1] + 12, ch[2], ch[1]][i], t + i * e, 0.13, true, 0.7));
      const mo = n % 4 < 2 ? this.mo : this.mo2;
      if (I === 0) { if (n % 8 >= 6) for (const [p, i] of mo) this.lead(this.scale[i], t + p * e, e * 1.3, 0.04); return; }
      thump(t, 140, 70, 0.22, 0.25); thump(t + 3 * e, 140, 70, 0.14, 0.25);
      if (n % 16 >= 4 || I === 2) for (const [p, i] of vary(mo, this.scale, n % 2 ? 1 : 0)) {
        this.lead(this.scale[i], t + p * e, e * 1.1);
        if (I === 2) reed(this.scale[i] - 12, t + p * e, e * 1.0, 0.035);
      }
      if (I === 2) {
        [1, 2, 4, 5].forEach(k => thump(t + k * e, 170, 90, 0.1, 0.18));
        noiseHit(t + 5 * e, { dur: 0.05, v: 0.03, type: "bandpass", freq: 900, q: 1, send: 0.2 });
        if (n % 2 === 0) { const g = this.scale[(n / 2) % this.scale.length]; flute(g + 2, t + 2.9 * e, e * 0.12, 0.03, 0); }
      }
    }
  };

  // Garage: the same surf-rock. Calm = just bass and a ringing chord; intense = palm-muted chugs, lead on every phrase, crashes.
  N.garage = {
    bpm: 136, beats: 4, key: 52,
    A: [[40, [52, 59, 64]], [40, [52, 59, 64]], [45, [57, 64, 69]], [43, [55, 62, 67]]],
    B: [[45, [57, 64, 69]], [45, [57, 64, 69]], [40, [52, 59, 64]], [40, [52, 59, 64]], [47, [59, 66, 71]], [45, [57, 64, 69]], [40, [52, 59, 64]], [47, [59, 66, 71]]],
    scale: [64, 67, 69, 71, 74, 76, 79], init() { this.mo = motif(this.scale, 16, 7); },
    lead(m, t, d, v = 0.16) { pluck(m, t, v, true, 0.55, 3200); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n), s = b / 4;
      if (I === 0) {
        for (let i = 0; i < 4; i++) bass(root, t + i * b, b * 0.9, 0.24, "sawtooth", 600);
        ch.forEach(m => synth(m, t, b * 3, 0.018, 1600, 600, [-14, 14], 0.4, "sawtooth"));
        hat(t + b, 0.02); hat(t + 3 * b, 0.02);
        return;
      }
      [0, 2].forEach(k => kick(t + k * b, 0.55)); kick(t + 2.5 * b, 0.35);
      [1, 3].forEach(k => snare(t + k * b, 0.14));
      for (let i = 0; i < 8; i++) hat(t + i * 2 * s, i % 2 ? 0.02 : 0.035);
      for (let i = 0; i < 8; i++) bass(root + (i === 7 ? 2 : 0), t + i * 2 * s, s * 1.7, 0.26, "sawtooth", 700);
      [0, 1.5, 3].forEach(k => ch.forEach(m => synth(m, t + k * b, k === 3 ? b * 0.9 : b * 0.4, 0.022, 1700, 500, [-14, 14], 0.15, "sawtooth")));
      if (n % 8 >= 4 || I === 2) for (const [p, i] of vary(this.mo, this.scale, I === 2 && n % 8 < 4 ? 1 : 0)) this.lead(this.scale[i], t + p * s);
      if (I === 2) {
        for (let i = 0; i < 16; i++) if (i % 4 !== 0) synth(root + 12, t + i * s, s * 0.5, 0.012, 900, 300, [-10, 10], 0.1, "sawtooth");
        for (let i = 0; i < 8; i++) hat(t + i * 2 * s + s, 0.02, true);
        if (n % 4 === 0) crash(t, 0.04);
        if (n % 4 === 3) [0, 1, 2, 3].forEach(k => thump(t + 3 * b + k * s, 180 - k * 25, 70, 0.3, 0.2));
      }
    }
  };

  // Space Fight: the same heroic march. Calm = strings and a quiet timpani; intense = a brass countermelody, cymbals and snare rolls.
  N.space = {
    bpm: 100, beats: 4, key: 55,
    A: [[43, [55, 59, 62]], [41, [53, 57, 60]], [48, [55, 60, 64]], [43, [55, 59, 62, 65]]],
    B: [[39, [55, 58, 63]], [41, [53, 57, 60]], [43, [55, 59, 62]], [43, [55, 59, 62]], [39, [55, 58, 63]], [41, [53, 57, 60]], [46, [53, 58, 62]], [38, [54, 57, 62]]],
    tune: [[67, 1], [67, 0.5], [67, 0.5], [72, 2]], tune2: [[74, 1], [72, 0.5], [71, 0.5], [69, 1], [67, 1]], counter: [[79, 2], [76, 1], [74, 1]],
    lead(m, t, d, v = 0.05) { synth(m, t, d, v, 2600, 900, [-9, 9], 0.45); },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n);
      pad(ch.map(m => m - 12), t, b * 4.1, I === 0 ? 0.03 : 0.022, "sawtooth");
      bass(root - 12, t, b * 1.8, 0.3, "triangle", 500); bass(root - 12, t + 2 * b, b * 1.8, 0.28, "triangle", 500);
      if (I === 0) { thump(t, 90, 55, 0.3, 0.6); if (n % 4 < 2) playLine(n % 2 ? this.tune2 : this.tune, t, b, (m, at, d) => synth(m - 12, at, d * 0.95, 0.028, 1600, 600, [-9, 9], 0.5)); return; }
      [0, 2].forEach(k => thump(t + k * b, 90, 55, 0.5, 0.6));
      thump(t + 3.5 * b, 90, 55, 0.3, 0.4);
      for (let i = 0; i < 4; i++) snare(t + i * b + b * 0.5, 0.05);
      if (n % 4 === 3) for (let i = 0; i < 6; i++) snare(t + 3 * b + i * b / 6, 0.03 + i * 0.01);
      if (n % 8 < 4) playLine(n % 2 ? this.tune2 : this.tune, t, b, (m, at, d) => { this.lead(m, at, d * 0.95); synth(m - 12, at, d * 0.95, 0.03, 1800, 700, [-9, 9], 0.4); });
      else ch.forEach(m => synth(m + 12, t, 0.25, 0.03, 3000, 900, [-12, 12], 0.5));
      if (I === 2) {
        if (n % 8 >= 4) playLine(this.counter, t, b, (m, at, d) => brass(m, at, d * 0.95, 0.035));
        for (let i = 0; i < 8; i++) synth(ch[i % ch.length] + 12, t + i * b / 2, b * 0.4, 0.016, 2200, 700, [-6, 6], 0.3);
        for (let i = 0; i < 16; i++) if (i % 4 === 3) snare(t + i * b / 4, 0.03);
        if (n % 4 === 0) crash(t, 0.04);
      }
    }
  };

  // Feeling Deezy?: the relaxing lo-fi, kept relaxing. Calm = piano, bass and crackle, no beat; normal = the current tune;
  // intense = still slow: a breathy flute line and a soft shaker drift in.
  N.deezy = {
    bpm: 72, beats: 4, key: 65,
    A: [[41, [57, 60, 64, 67]], [40, [55, 59, 62, 65]], [38, [57, 60, 64, 65]], [43, [53, 57, 59, 62]]],
    B: [[46, [57, 62, 65, 69]], [45, [55, 60, 64, 67]], [43, [53, 57, 62, 65]], [48, [55, 58, 62, 64]], [41, [57, 60, 64, 67]], [40, [55, 59, 62, 65]], [38, [57, 60, 64, 65]], [43, [53, 57, 59, 62]]],
    scale: [69, 72, 74, 76, 79, 81, 84], init() { this.mo = motif(this.scale, 16, 5); this.mo2 = motif(this.scale, 16, 4); },
    lead(m, t, d, v = 0.045) { bell(m, t, v, [[1, 1, 1.6], [2.0, 0.3, 0.6], [3.0, 0.1, 0.3]], 0.8); },
    cues: {
      big(tune, t) { const [, ch] = prog(tune, 0); ch.forEach((m, i) => epiano(m, t + i * 0.05, 2.2, 0.05)); [0, 4, 7, 12].forEach((iv, i) => tune.lead(tune.key + 12 + iv, t + 0.3 + i * 0.16, 0, 0.05)); return 2.4; },
      win(tune, t) { [0, 4, 7, 11, 14].forEach((iv, i) => tune.lead(tune.key + 12 + iv, t + i * 0.14, 0, 0.055)); pad([tune.key, tune.key + 4, tune.key + 11], t + 0.3, 2.2, 0.02); return 2.2; }
    },
    bar(n, t, b, I) {
      const [root, ch] = prog(this, n), s = b / 4;
      ch.forEach((m, i) => epiano(m, t + i * 0.03, b * 3.6, 0.045));
      ch.forEach((m, i) => epiano(m, t + 2.5 * b + i * 0.03, b * 1.2, 0.03));
      bass(root - 12, t, b * 1.6, 0.26, "sine", 500); bass(root - 12 + 7, t + 2.5 * b, b * 1.2, 0.2, "sine", 500);
      for (let i = 0; i < 6; i++) noiseHit(t + Math.random() * 4 * b, { dur: 0.01, v: 0.012, freq: 3000, send: 0 });   // crackle
      const mo = n % 4 < 2 ? this.mo : this.mo2;
      if (I === 0) { if (n % 4 >= 2) for (const [p, i] of mo) this.lead(this.scale[i], t + p * s * 1.02, 0, 0.04); return; }
      kick(t, 0.38); kick(t + 1.75 * b, 0.22); kick(t + 2.5 * b, 0.3);
      [1, 3].forEach(k => noiseHit(t + k * b + 0.02, { dur: 0.2, v: 0.06, type: "bandpass", freq: 1500, q: 0.7, send: 0.5 }));
      for (let i = 0; i < 8; i++) hat(t + i * 2 * s + (i % 2 ? s * 0.33 : 0), 0.014);
      if (n % 8 >= 2) for (const [p, i] of mo) this.lead(this.scale[i], t + p * s * 1.02, 0, 0.05);
      if (I === 2) {
        for (const [p, i] of vary(n % 2 ? this.mo2 : this.mo, this.scale, -1)) flute(this.scale[i], t + p * s * 1.02 + s, s * 3.2, 0.03, 0.012);
        for (let i = 0; i < 8; i++) shaker(t + i * 2 * s + (i % 2 ? s * 0.33 : 0), 0.012);
      }
    }
  };

  // ---------- Garage and Northern Lights: today's tunes, kept as they are (the cues still play) ----------
  const OLD_AURORA = {
    bpm: 60, beats: 4,
    chords: [[38, [62, 66, 69, 73, 76]], [40, [64, 67, 71, 74, 78]], [35, [62, 66, 69, 71, 74]], [43, [62, 67, 71, 74, 78]]],   // Dmaj9, Em9, Bm9, Gmaj9
    bar(n, t, b) {
      const [root, ch] = this.chords[n % 4];
      pad([root, root + 7], t, b * 4.4, 0.04);
      pad(ch.slice(0, 3), t, b * 4.4, 0.022, "triangle");
      const count = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) bell(pickOf(ch) + 12 * pickOf([0, 1, 1]), t + Math.random() * b * 3.8, 0.05, [[1, 1, 2.5], [2.0, 0.2, 1.2], [3.0, 0.08, 0.6]], 0.9);
    }
  };

  const OLD_GARAGE = {
    bpm: 136, beats: 4,
    chords: [[40, [52, 59, 64]], [40, [52, 59, 64]], [45, [57, 64, 69]], [43, [55, 62, 67]]],   // E5, E5, A5, G5
    scale: [64, 67, 69, 71, 74, 76, 79],
    init() { this.mo = motif(this.scale, 16, 7); },
    bar(n, t, b) {
      const [root, ch] = this.chords[n % 4], s = b / 4;
      [0, 2].forEach(k => kick(t + k * b, 0.55)); kick(t + 2.5 * b, 0.35);
      [1, 3].forEach(k => snare(t + k * b, 0.14));
      for (let i = 0; i < 8; i++) hat(t + i * 2 * s, i % 2 ? 0.02 : 0.035);
      for (let i = 0; i < 8; i++) bass(root + (i === 7 ? 2 : 0), t + i * 2 * s, s * 1.7, 0.26, "sawtooth", 700);
      [0, 1.5, 3].forEach(k => ch.forEach(m => synth(m, t + k * b, k === 3 ? b * 0.9 : b * 0.4, 0.022, 1700, 500, [-14, 14], 0.15, "sawtooth")));
      if (n % 8 >= 4) for (const [p, i] of this.mo) pluck(this.scale[i], t + p * s, 0.16, true, 0.55, 3200);
    }
  };

  N.aurora = { ...N.aurora, bpm: OLD_AURORA.bpm, bar(n, t, b) { OLD_AURORA.bar(n, t, b); } };
  N.garage = { ...N.garage, bpm: OLD_GARAGE.bpm, init() { OLD_GARAGE.init && OLD_GARAGE.init(); N.garage.mo = motif(N.garage.scale, 16, 7); }, bar(n, t, b) { OLD_GARAGE.bar(n, t, b); } };

  // ---------- cues: short phrases in each theme's own voice, for things that happen at the table ----------
  function cue(tune, kind, t) {
    if (tune.cues && tune.cues[kind]) return tune.cues[kind](tune, t);
    const k = tune.key, third = tune.minor ? 3 : 4, L = (m, at, d, v) => tune.lead(m, at, d, v);
    if (kind === "turn") { L(k + 12, t, 0.16); L(k + 19, t + 0.14, 0.32); return 0.5; }
    if (kind === "win") {
      [0, third, 7, 12].forEach((iv, i) => L(k + 12 + iv, t + i * 0.11, 0.2));
      L(k + 24, t + 0.48, 1.1); [0, 4, 7].forEach(iv => pad([k + iv], t + 0.45, 1.6, 0.02)); crash(t + 0.45, 0.04, 1.6); return 1.8;
    }
    if (kind === "lose") { [7, third, 0, -5].forEach((iv, i) => L(k + iv, t + i * 0.28, 0.3)); thump(t + 1.1, 90, 40, 0.35, 0.8); return 1.8; }
    if (kind === "big") {
      for (let i = 0; i < 12; i++) snare(t + i * 0.055 * (1 - i * 0.03), 0.03 + i * 0.006);
      const hit = t + 0.62; kick(hit, 0.6); thump(hit, 80, 40, 0.5, 1); crash(hit, 0.06, 2);
      [0, 7, 12].forEach(iv => L(k + iv, hit, 0.9, undefined)); return 2.4;
    }
    return 0;
  }

  // evens out how loud the tunes feel (set by rendering each one and measuring)
  const LEVEL = { classic: 0.96, ocean: 1.06, pretty: 1.01, west: 1.19, vegas: 1.0, future: 1.24, aurora: 1.9, lantern: 0.98, emperor: 0.83, pirate: 1.12, jazz: 0.81, forest: 1.49, garage: 0.85, space: 1.0, deezy: 1.3 };

  // ---------- control ----------
  let intensity = 1, cueBus = null, target = null, pending = null, level = 1;
  function begin(name) {
    const tune = N[name]; if (!tune) return;
    clearInterval(timer);
    current = name;
    if (tune.init) tune.init();
    newBus();
    level = LEVEL[name] || 1;
    if (cueBus) { const old = cueBus; setTimeout(() => { try { old.disconnect(); } catch {} }, 3000); }
    cueBus = ctx.createGain(); cueBus.gain.value = 0.9 * level; cueBus.connect(vol);
    out.gain.setValueAtTime(0.0001, ctx.currentTime); out.gain.exponentialRampToValueAtTime(0.8 * level, ctx.currentTime + 1.2);
    const beat = 60 / tune.bpm, barLen = beat * tune.beats;
    let bar = 0, next = ctx.currentTime + 0.15;
    timer = setInterval(() => {
      if (ctx.state !== "running") return;
      while (next < ctx.currentTime + 0.6) { try { tune.bar(bar, next, beat, intensity); } catch (e) { /* never break the page */ } bar++; next += barLen; }
    }, 100);
  }
  function start(name) {
    if (!N[name] || !setup()) return;
    if (current === name && timer) return;
    pending = name;
    const go = () => { if (pending !== name) return; pending = null; begin(name); };
    if (ctx.state === "running") return go();
    ctx.resume().then(() => { if (ctx.state === "running") go(); }).catch(() => {});
    const unlock = () => { removeEventListener("pointerdown", unlock); removeEventListener("keydown", unlock); ctx.resume().then(go); };
    addEventListener("pointerdown", unlock); addEventListener("keydown", unlock);
  }
  function stop() {
    pending = null;
    if (!ctx) return;
    clearInterval(timer); timer = null; current = null;
    cutBus(0.4);
  }
  // 0 calm, 1 normal, 2 intense: takes effect from the next bar
  function setIntensity(i) { intensity = Math.max(0, Math.min(2, Math.round(i))); }
  // a cue for something at the table: "turn", "win", "lose", "big". The music dips so the cue stands out.
  function sting(kind) {
    if (!ctx || !current || !out) return;
    const t = ctx.currentTime + 0.03, prev = target;
    target = cueBus;
    let len = 0;
    try { len = cue(N[current], kind, t); } finally { target = prev; }
    if (!len) return;
    const g = out.gain, now = ctx.currentTime, full = 0.8 * level;
    g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(full * 0.3, now + 0.08); g.setValueAtTime(full * 0.3, now + len * 0.8); g.linearRampToValueAtTime(full, now + len * 0.8 + 0.7);
  }
  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (vol) vol.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  }
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {}); else if (current) ctx.resume().catch(() => {});
  });

  // For checking levels without speakers: render a tune offline at one intensity.
  async function renderOffline(name, seconds = 12, I = 1) {
    const saved = [ctx, out, verb, vol];
    ctx = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100); noiseBuf = null; plucks.clear();
    out = ctx.createGain(); out.gain.value = 0.8 * (LEVEL[name] || 1); const comp = ctx.createDynamicsCompressor(); out.connect(comp).connect(ctx.destination);
    verb = ctx.createConvolver(); const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.28; verb.connect(wet).connect(out);
    const tune = N[name], beat = 60 / tune.bpm, barLen = beat * tune.beats;
    if (tune.init) tune.init();
    for (let bar = 0, t = 0.05; t < seconds; bar++, t += barLen) tune.bar(bar, t, beat, I);
    const buf = await ctx.startRendering();
    [ctx, out, verb, vol] = saved; noiseBuf = null; plucks.clear();
    return buf;
  }

  window.CR_MUSIC = { start, stop, setVolume, setIntensity, sting, playing: () => current, intensity: () => intensity, tunes: Object.keys(N), renderOffline, LEVEL };
  if (window.CR_MUSIC_READY) window.CR_MUSIC_READY();
})();
