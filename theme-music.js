// Background music for every theme, played live with Web Audio: no audio files, every tune original.
// window.CR_MUSIC = { start(themeId), stop(), setVolume(0..1), playing() }. theme.js owns the on/off switch.
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
    node.connect(out);
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

  // ---------- the tunes ----------
  const T = {};

  // Classic: a gentle bossa nova. Nylon guitar, soft bass, rim and shaker, a flute line now and then.
  T.classic = {
    bpm: 128, beats: 4,
    chords: [[48, [52, 55, 59, 62]], [45, [52, 55, 58, 61]], [50, [53, 57, 60, 64]], [43, [53, 57, 59, 62]]],   // Cmaj9, A7, Dm9, G13
    scale: [64, 65, 67, 69, 71, 72, 74, 76, 77, 79],
    init() { this.mo = motif(this.scale, 8, 5); },
    bar(n, t, b) {
      const [root, ch] = this.chords[n % 4], e = b / 2;
      bass(root - 12, t, b * 1.4, 0.28); bass(root - 5, t + 1.5 * b, b * 0.9, 0.22); bass(root - 12, t + 2 * b, b * 1.4, 0.26); bass(root - 5, t + 3.5 * b, b * 0.5, 0.2);
      [0, 3, 6, 10, 13].forEach(k => ch.forEach((m, j) => pluck(m, t + k * e * 0.5 + j * 0.012, 0.09, false, 0.4)));   // bossa rhythm in 16ths
      for (let i = 0; i < 8; i++) shaker(t + i * e, i % 2 ? 0.018 : 0.03);
      [3, 6].forEach(k => block(t + k * e, 0.05, 2600));
      if (n % 4 >= 2) for (const [p, i] of vary(this.mo, this.scale, n % 8 >= 4 ? 2 : 0)) flute(this.scale[i] + 12, t + p * e, e * 1.6, 0.05, 0.012);
    }
  };

  // Cards by the Ocean: island calypso. Steel drum melody, plucky bass, shaker, and waves rolling in.
  T.ocean = {
    bpm: 108, beats: 4,
    chords: [[48, [60, 64, 67]], [53, [60, 65, 69]], [55, [59, 62, 67]], [48, [60, 64, 67]]],
    scale: [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 79],
    init() { this.mo = motif(this.scale, 8, 6); this.mo2 = motif(this.scale, 8, 5); },
    bar(n, t, b) {
      const [root, ch] = this.chords[n % 4], e = b / 2;
      [0, 1.5, 2, 3.5].forEach((k, i) => bass(root - 12 + (i % 2 ? 7 : 0), t + k * b, b * 0.6, 0.26));
      [1, 3].forEach(k => ch.forEach(m => steel(m, t + k * b, 0.03)));
      [0.5, 2.5].forEach(k => ch.forEach(m => steel(m, t + k * b, 0.022)));
      for (let i = 0; i < 8; i++) shaker(t + i * e, i % 2 ? 0.03 : 0.015);
      const mo = n % 8 < 4 ? this.mo : this.mo2;
      for (const [p, i] of vary(mo, this.scale, n % 2)) steel(this.scale[i] + 12, t + p * e, 0.11);
      if (n % 4 === 0) noiseHit(t, { dur: b * 3.5, v: 0.03, type: "lowpass", freq: 700, attack: b * 1.5, send: 0.5 });   // a wave
    }
  };

  // Feeling Pretty: bubbly pop. Music box arpeggios, soft pad, finger snaps, a sweet celesta tune.
  T.pretty = {
    bpm: 116, beats: 4,
    chords: [[53, [65, 69, 72, 76]], [50, [62, 65, 69, 72]], [46, [62, 65, 70, 74]], [48, [64, 67, 72, 76]]],   // Fmaj7, Dm7, Bbmaj7, C
    scale: [72, 74, 76, 77, 79, 81, 84, 86],
    init() { this.mo = motif(this.scale, 8, 6); },
    bar(n, t, b) {
      const [root, ch] = this.chords[n % 4], e = b / 2;
      pad(ch.map(m => m - 12), t, b * 4.2, 0.022, "triangle");
      bass(root - 12, t, b * 0.9, 0.3, "sine"); bass(root - 12, t + 2.5 * b, b * 0.5, 0.22, "sine"); bass(root, t + 3 * b, b * 0.5, 0.18, "sine");
      for (let i = 0; i < 8; i++) bell(ch[i % 4] + 12, t + i * e, 0.035, [[1, 1, 0.5], [3.0, 0.2, 0.2]], 0.5);
      kick(t, 0.35); kick(t + 2 * b, 0.3);
      [1, 3].forEach(k => noiseHit(t + k * b, { dur: 0.09, v: 0.08, type: "bandpass", freq: 1600, q: 1.2, send: 0.4 }));   // snaps
      for (let i = 0; i < 8; i++) hat(t + i * e, 0.012);
      if (n % 2 === 1) for (const [p, i] of vary(this.mo, this.scale, n % 4 === 3 ? 1 : 0)) bell(this.scale[i], t + p * e, 0.09);
    }
  };

  // Wild West: a lonesome trail. Boom-chick guitar, clip-clop hooves, a whistled tune in A minor.
  const WEST_TUNE = [[[69, 2], [72, 1], [76, 3], [74, 1], [72, 1]], [[71, 3], [67, 1], [69, 4]], [[72, 2], [71, 1], [69, 3], [67, 1], [65, 1]], [[64, 6], [0, 2]],
    [[69, 2], [72, 1], [76, 3], [79, 1], [77, 1]], [[76, 3], [74, 1], [72, 4]], [[71, 2], [72, 1], [74, 2], [71, 1], [68, 2]], [[69, 6], [0, 2]]];
  T.west = {
    bpm: 96, beats: 4,
    chords: [[45, [57, 60, 64]], [43, [55, 59, 62]], [41, [53, 57, 60]], [40, [52, 56, 59]], [45, [57, 60, 64]], [43, [55, 59, 62]], [40, [52, 56, 59]], [45, [57, 60, 64]]],
    bar(n, t, b) {
      const [root, ch] = this.chords[n % 8], e = b / 2;
      pluck(root, t, 0.26, false, 0.3); pluck(root + 7, t + 2 * b, 0.2, false, 0.3);   // boom on 1 and 3
      [1, 3].forEach(k => ch.forEach((m, j) => pluck(m, t + k * b + j * 0.015, 0.09, true, 0.3)));
      for (let i = 0; i < 4; i++) { block(t + i * b, 0.06, 1100); block(t + i * b + e * 0.66, 0.04, 1400); }   // hooves
      let at = 0;
      for (const [m, len] of WEST_TUNE[n % 8]) { if (m) flute(m + 12, t + at * e, len * e * 0.95, 0.07, 0.015, pickOf([null, null, m + 10])); at += len; }
    }
  };

  // Vegas: a late-night casino groove. Four on the floor, octave bass, brass stabs, a glittery lead.
  T.vegas = {
    bpm: 118, beats: 4,
    chords: [[50, [62, 65, 69, 72]], [50, [62, 65, 69, 72]], [55, [62, 65, 67, 71]], [55, [62, 65, 67, 71]]],   // Dm7, G9
    scale: [62, 65, 67, 69, 72, 74, 77],
    init() { this.mo = motif(this.scale, 16, 7); },
    bar(n, t, b) {
      const [root, ch] = this.chords[n % 4], s = b / 4;
      for (let i = 0; i < 4; i++) { kick(t + i * b, 0.5); hat(t + i * b + 2 * s, 0.035, true); }
      [1, 3].forEach(k => snare(t + k * b, 0.09));
      for (let i = 0; i < 8; i++) synth(root - 12 + (i % 2 ? 12 : 0), t + i * 2 * s, s * 1.6, 0.05, 1200, 200, [-6, 6], 0.1);
      if (n % 2 === 0) ch.forEach(m => synth(m, t + 1.5 * b, 0.22, 0.03, 3200, 900, [-10, 10], 0.4));
      else ch.forEach(m => synth(m, t + 3.5 * b, 0.4, 0.03, 3200, 700, [-10, 10], 0.4));
      if (n % 4 >= 2) for (const [p, i] of this.mo) bell(this.scale[i] + 12, t + p * s, 0.06, [[1, 1, 0.4], [2.0, 0.4, 0.25]], 0.5);
    }
  };

  // Into the Future: synthwave. Rolling 16th arps, big pad, punchy drums.
  T.future = {
    bpm: 104, beats: 4,
    chords: [[45, [57, 60, 64]], [41, [57, 60, 65]], [48, [55, 60, 64]], [43, [55, 59, 62]]],   // Am, F, C, G
    scale: [69, 71, 72, 74, 76, 79, 81],
    init() { this.mo = motif(this.scale, 16, 6); },
    bar(n, t, b) {
      const [root, ch] = this.chords[n % 4], s = b / 4;
      pad(ch, t, b * 4.1, 0.018, "sawtooth");
      for (let i = 0; i < 16; i++) synth(root - 12 + (i % 4 === 2 ? 12 : 0), t + i * s, s * 0.9, 0.045, 900 + (i % 4) * 300, 180, [-5, 5], 0.1);
      for (let i = 0; i < 16; i++) synth(ch[i % 3] + 12, t + i * s, s * 0.7, 0.012, 4000, 1200, [0], 0.5, "square");
      [0, 2].forEach(k => kick(t + k * b, 0.5)); kick(t + 2.75 * b, 0.3);
      [1, 3].forEach(k => { snare(t + k * b, 0.12); noiseHit(t + k * b, { dur: 0.4, v: 0.03, freq: 3000, send: 0.9 }); });
      for (let i = 0; i < 8; i++) hat(t + i * 2 * s + s, 0.02);
      if (n % 8 >= 4) for (const [p, i] of this.mo) synth(this.scale[i] + 12, t + p * s, s * 2.2, 0.035, 2600, 900, [-12, 12], 0.6);
    }
  };

  // Northern Lights: slow and spacious. Shimmering pads and glassy notes falling like snow; no drums.
  T.aurora = {
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

  // Lantern Night: a G major pentatonic guzheng tune over a soft drone, wood block and a low drum.
  const PENTA = [55, 57, 59, 62, 64, 67, 69, 71, 74, 76, 79, 81];
  const LANTERN_PHRASES = [
    [[74, 1], [76, 1], [79, 2], [76, 1], [74, 1], [71, 2]],
    [[69, 1], [71, 1], [74, 1], [76, 1], [74, 2], [71, 2]],
    [[67, 1.5], [69, 0.5], [71, 1], [74, 1], [69, 2], [67, 2]],
    [[79, 1], [76, 1], [74, 1], [71, 1], [74, 3], [0, 1]]
  ];
  T.lantern = {
    bpm: 76, beats: 4,
    drones: [[43, 50, 62], [40, 47, 59], [36, 43, 64], [38, 45, 62]],
    bar(n, t, beat) {
      if (n % 2 === 0) pad(this.drones[(n / 2) % 4], t, beat * 8.2, 0.045);
      thump(t, 110, 50, 0.3, 0.6);
      if (n % 2 === 1) thump(t + 2.5 * beat, 110, 50, 0.18, 0.5);
      [1, 3].forEach(b => noiseHit(t + b * beat, { dur: 0.05, v: 0.06, type: "bandpass", freq: 1800, q: 6, send: 0.4 }));
      const phrase = n % 8 === 7 ? null : LANTERN_PHRASES[n % 4];
      if (phrase) {
        let at = 0;
        for (const [m, len] of phrase) { if (m) { pluck(m, t + at * beat, 0.34); if (len >= 2) pluck(m, t + (at + 0.5) * beat, 0.11); } at += len; }
      } else {
        PENTA.slice(3).forEach((m, i) => pluck(m, t + i * beat * 0.12, 0.22));
        pluck(79, t + 2 * beat, 0.34);
      }
    }
  };

  // Emperor's House: koto in the miyako-bushi scale, a breathy shakuhachi, a distant taiko.
  const MIYAKO = [50, 51, 55, 57, 58, 62, 63, 67, 69, 70, 74];   // D Eb G A Bb
  T.emperor = {
    bpm: 66, beats: 4,
    init() { this.mo = motif(MIYAKO.slice(4), 8, 5); },
    bar(n, t, b) {
      const e = b / 2;
      pad([38, 45], t, b * 4.3, 0.035);
      // koto: a falling pattern with the odd quick flourish
      const start = 5 + (n % 4);
      [0, 1, 2, 3].forEach(k => pluck(MIYAKO[start - k] + 12, t + k * b, 0.24, true, 0.6));
      if (n % 2) [0.12, 0.24].forEach((d, k) => pluck(MIYAKO[start - 2 + k] + 12, t + 3 * b + d, 0.12, true, 0.6));
      if (n % 4 === 0) { thump(t, 90, 38, 0.4, 0.9); thump(t + 0.3, 90, 38, 0.2, 0.7); }
      if (n % 4 >= 2) { const sc = MIYAKO.slice(4); for (const [p, i] of this.mo) flute(sc[i] + 12, t + p * e, e * 2.6, 0.06, 0.04, sc[i] + 11); }
    }
  };

  // Pirate's Cove: a sea shanty in D minor, 6/8: accordion melody, oom-pah chords, stomps and a tambourine.
  const SHANTY = [
    [[62, 2], [69, 1], [69, 2], [65, 1]], [[67, 2], [65, 1], [64, 2], [62, 1]], [[60, 2], [64, 1], [67, 2], [64, 1]], [[69, 3], [67, 2], [64, 1]],
    [[62, 2], [69, 1], [69, 2], [72, 1]], [[74, 2], [72, 1], [69, 2], [65, 1]], [[67, 2], [64, 1], [64, 2], [61, 1]], [[62, 6]]
  ];
  const SHANTY_CHORDS = [[50, [62, 65, 69]], [43, [62, 67, 70]], [48, [60, 64, 67]], [45, [61, 64, 69]], [50, [62, 65, 69]], [50, [62, 65, 69]], [45, [61, 64, 67]], [50, [62, 65, 69]]];
  T.pirate = {
    bpm: 132, beats: 6,
    bar(n, t, e) {
      const [root, chord] = SHANTY_CHORDS[n % 8];
      bass(root - 12, t, e * 1.8, 0.3); bass(root - 12 + 7, t + 3 * e, e * 1.8, 0.24);
      [1, 2, 4, 5].forEach(i => chord.forEach(m => reed(m - 12, t + i * e, e * 0.8, 0.018)));
      thump(t, 90, 40, 0.4, 0.3); thump(t + 3 * e, 90, 40, 0.3, 0.3);
      for (let i = 0; i < 6; i++) noiseHit(t + i * e, { dur: 0.06, v: i % 3 ? 0.02 : 0.04, freq: 9000, send: 0.2 });
      let at = 0; const up = Math.floor(n / 8) % 2 ? 12 : 0;
      for (const [m, len] of SHANTY[n % 8]) { reed(m + up, t + at * e, len * e * 0.92, 0.055); at += len; }
    }
  };

  // Midnight Jazz Club: a ii-V-I-VI loop in C, swung, walking bass, brushed ride, electric piano.
  T.jazz = {
    bpm: 112, beats: 4,
    chords: [
      { root: 50, voicing: [65, 69, 72, 76], scale: [62, 64, 65, 67, 69, 71, 72, 74, 76, 77] },
      { root: 43, voicing: [65, 71, 76], scale: [62, 64, 65, 67, 69, 71, 72, 74, 76, 77] },
      { root: 48, voicing: [64, 67, 71, 74], scale: [60, 62, 64, 67, 69, 71, 72, 74, 76, 79] },
      { root: 45, voicing: [67, 70, 73, 76], scale: [61, 64, 65, 67, 69, 70, 73, 76] }
    ],
    bar(n, t, beat) {
      const ch = this.chords[n % 4], next = this.chords[(n + 1) % 4], sw = beat * 2 / 3;
      const walk = [ch.root, ch.root + pickOf([3, 4, 7]), ch.root + pickOf([5, 7, 9]), next.root + pickOf([-1, 1])];
      walk.forEach((m, i) => bass(m, t + i * beat, beat * 0.95));
      for (let i = 0; i < 4; i++) {
        noiseHit(t + i * beat, { dur: 0.22, v: 0.035, freq: 8000 });
        if (i % 2) { noiseHit(t + i * beat + sw, { dur: 0.12, v: 0.022, freq: 8500 }); noiseHit(t + i * beat, { dur: 0.16, v: 0.05, type: "bandpass", freq: 3000, attack: 0.03 }); }
      }
      const comp = Math.random() < 0.5 ? [[sw, 0.3], [3 * beat, 0.5]] : [[beat + sw, 0.35], [2 * beat + sw, 0.25]];
      comp.forEach(([at, d]) => ch.voicing.forEach(m => epiano(m, t + at, d, 0.05)));
      if (n % 2 === 1 || Math.random() < 0.35) {
        const slots = [0, 1, 2, 3, 4, 5, 6].filter(k => k >= pickOf([0, 1, 2]) && Math.random() < 0.72);
        let m = pickOf(ch.scale);
        for (const k of slots) {
          epiano(m + 12, t + Math.floor(k / 2) * beat + (k % 2 ? sw : 0), 0.25, 0.075);
          const i = ch.scale.indexOf(m), step = pickOf([-2, -1, -1, 1, 1, 2]);
          m = ch.scale[Math.max(0, Math.min(ch.scale.length - 1, i + step))];
        }
      }
    }
  };

  // Enchanted Forest: a gentle jig in D. Harp arpeggios, a tin whistle, a soft frame drum.
  T.forest = {
    bpm: 112, beats: 6,
    chords: [[50, [62, 66, 69]], [48, [60, 64, 67]], [50, [62, 66, 69]], [45, [61, 64, 69]], [47, [62, 66, 71]], [43, [62, 67, 71]], [48, [60, 64, 67]], [50, [62, 66, 69]]],
    scale: [74, 76, 78, 79, 81, 83, 84, 86],
    init() { this.mo = motif(this.scale, 6, 5); this.mo2 = motif(this.scale, 6, 4); },
    bar(n, t, e) {
      const [root, ch] = this.chords[n % 8];
      bass(root - 12, t, e * 2.6, 0.22, "sine");
      [0, 1, 2, 3, 4, 5].forEach(i => pluck([ch[0], ch[1], ch[2], ch[1] + 12, ch[2], ch[1]][i], t + i * e, 0.13, true, 0.7));
      thump(t, 140, 70, 0.22, 0.25); thump(t + 3 * e, 140, 70, 0.14, 0.25);
      const mo = n % 4 < 2 ? this.mo : this.mo2;
      if (n % 16 >= 4) for (const [p, i] of vary(mo, this.scale, n % 2 ? 1 : 0)) flute(this.scale[i], t + p * e, e * 1.1, 0.055, 0.01);
    }
  };

  // Garage: a driving surf-rock groove. Gritty power chords, a pumping bass, a backbeat, a twangy lead.
  T.garage = {
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

  // Space Fight: a heroic march. Low strings, timpani, brass fanfares, a snare roll into each phrase.
  T.space = {
    bpm: 100, beats: 4,
    chords: [[43, [55, 59, 62]], [41, [53, 57, 60]], [48, [55, 60, 64]], [43, [55, 59, 62, 65]]],   // G, F, C, G7
    tune: [[67, 1], [67, 0.5], [67, 0.5], [72, 2]], tune2: [[74, 1], [72, 0.5], [71, 0.5], [69, 1], [67, 1]],
    bar(n, t, b) {
      const [root, ch] = this.chords[n % 4];
      pad(ch.map(m => m - 12), t, b * 4.1, 0.022, "sawtooth");
      [0, 2].forEach(k => thump(t + k * b, 90, 55, 0.5, 0.6));          // timpani
      thump(t + 3.5 * b, 90, 55, 0.3, 0.4);
      for (let i = 0; i < 4; i++) snare(t + i * b + b * 0.5, 0.05);
      if (n % 4 === 3) for (let i = 0; i < 6; i++) snare(t + 3 * b + i * b / 6, 0.03 + i * 0.01);
      bass(root - 12, t, b * 1.8, 0.3, "triangle", 500); bass(root - 12, t + 2 * b, b * 1.8, 0.28, "triangle", 500);
      if (n % 8 < 4) {
        let at = 0;
        for (const [m, len] of (n % 2 ? this.tune2 : this.tune)) { ch.slice(0, 1).forEach(() => synth(m, t + at * b, len * b * 0.95, 0.05, 2600, 900, [-9, 9], 0.45)); synth(m - 12, t + at * b, len * b * 0.95, 0.03, 1800, 700, [-9, 9], 0.4); at += len; }
      } else ch.forEach(m => synth(m + 12, t, 0.25, 0.03, 3000, 900, [-12, 12], 0.5));
    }
  };

  // Feeling Deezy?: slow lo-fi. Warm electric piano, a lazy beat, vinyl crackle, a dreamy bell melody.
  T.deezy = {
    bpm: 72, beats: 4,
    chords: [[41, [57, 60, 64, 67]], [40, [55, 59, 62, 65]], [38, [57, 60, 64, 65]], [43, [53, 57, 59, 62]]],   // Fmaj9, Em7, Dm9, G9
    scale: [69, 72, 74, 76, 79, 81, 84],
    init() { this.mo = motif(this.scale, 16, 5); this.mo2 = motif(this.scale, 16, 4); },
    bar(n, t, b) {
      const [root, ch] = this.chords[n % 4], s = b / 4;
      ch.forEach((m, i) => epiano(m, t + i * 0.03, b * 3.6, 0.045));
      ch.forEach((m, i) => epiano(m, t + 2.5 * b + i * 0.03, b * 1.2, 0.03));
      bass(root - 12, t, b * 1.6, 0.26, "sine", 500); bass(root - 12 + 7, t + 2.5 * b, b * 1.2, 0.2, "sine", 500);
      kick(t, 0.38); kick(t + 1.75 * b, 0.22); kick(t + 2.5 * b, 0.3);
      [1, 3].forEach(k => noiseHit(t + k * b + 0.02, { dur: 0.2, v: 0.06, type: "bandpass", freq: 1500, q: 0.7, send: 0.5 }));
      for (let i = 0; i < 8; i++) hat(t + i * 2 * s + (i % 2 ? s * 0.33 : 0), 0.014);
      for (let i = 0; i < 6; i++) noiseHit(t + Math.random() * 4 * b, { dur: 0.01, v: 0.012, freq: 3000, send: 0 });   // crackle
      const mo = n % 4 < 2 ? this.mo : this.mo2;
      if (n % 8 >= 2) for (const [p, i] of mo) bell(this.scale[i], t + p * s * 1.02, 0.05, [[1, 1, 1.6], [2.0, 0.3, 0.6], [3.0, 0.1, 0.3]], 0.8);
    }
  };

  // evens out how loud the tunes feel
  const LEVEL = { aurora: 1.9, forest: 1.6, future: 1.3, emperor: 1.25, jazz: 0.8, classic: 0.9, garage: 0.85, space: 1.0, deezy: 1.35 };

  // ---------- control ----------
  let pending = null;
  function begin(name) {
    const tune = T[name]; if (!tune) return;
    clearInterval(timer);
    current = name;
    if (tune.init) tune.init();
    newBus();
    out.gain.setValueAtTime(0.0001, ctx.currentTime); out.gain.exponentialRampToValueAtTime(0.8 * (LEVEL[name] || 1), ctx.currentTime + 1.2);
    const beat = 60 / tune.bpm, barLen = beat * tune.beats;
    let bar = 0, next = ctx.currentTime + 0.15;
    timer = setInterval(() => {
      if (ctx.state !== "running") return;
      while (next < ctx.currentTime + 0.6) { try { tune.bar(bar, next, beat); } catch { /* never break the page */ } bar++; next += barLen; }
    }, 100);
  }
  function start(name) {
    if (!T[name] || !setup()) return;
    if (current === name && timer) return;
    pending = name;
    const go = () => { if (pending !== name) return; pending = null; begin(name); };
    if (ctx.state === "running") return go();
    ctx.resume().then(() => { if (ctx.state === "running") go(); }).catch(() => {});
    // still blocked: wait for the first tap or key press on the page
    const unlock = () => { removeEventListener("pointerdown", unlock); removeEventListener("keydown", unlock); ctx.resume().then(go); };
    addEventListener("pointerdown", unlock); addEventListener("keydown", unlock);
  }
  function stop() {
    pending = null;
    if (!ctx) return;
    clearInterval(timer); timer = null; current = null;
    cutBus(0.4);
  }
  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (vol) vol.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  }
  // quiet while the tab is in the background
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {}); else if (current) ctx.resume().catch(() => {});
  });

  // For checking levels without speakers: render a tune offline.
  async function renderOffline(name, seconds = 12) {
    const saved = [ctx, out, verb, vol];
    ctx = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100); noiseBuf = null; plucks.clear();
    out = ctx.createGain(); out.gain.value = 0.8 * (LEVEL[name] || 1); const comp = ctx.createDynamicsCompressor(); out.connect(comp).connect(ctx.destination);
    verb = ctx.createConvolver(); const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.28; verb.connect(wet).connect(out);
    const tune = T[name], beat = 60 / tune.bpm, barLen = beat * tune.beats;
    if (tune.init) tune.init();
    for (let bar = 0, t = 0.05; t < seconds; bar++, t += barLen) tune.bar(bar, t, beat);
    const buf = await ctx.startRendering();
    [ctx, out, verb, vol] = saved; noiseBuf = null; plucks.clear();
    return buf;
  }

  window.CR_MUSIC = { start, stop, setVolume, playing: () => current, tunes: Object.keys(T), renderOffline };
  if (window.CR_MUSIC_READY) window.CR_MUSIC_READY();
})();
