// Themes and dark mode, remembered on this device. Two separate switches in the header:
// the palette button picks a theme, the moon/sun button turns dark mode on or off for whichever theme you're on.
// Loaded in <head> so the page never flashes the wrong colours.
// Also: the loading screen (theme-loader.js) and background music (theme-music.js, off until you turn it on).
(function () {
  const root = document.documentElement;
  const KEY_THEME = "cr-theme-name", KEY_MODE = "cr-mode", KEY_MUSIC = "cr-music", KEY_VOL = "cr-music-vol";

  // Each theme: felt (table), deep (page), hi (felt highlight), rail (wood edge, header), railHi,
  // text, accent (buttons, money, headings), muted text, card back, button colour, display font, page background.
  const THEMES = [
    { id: "classic", name: "Classic", tag: "Green felt and dark wood",
      c: { felt: "#0e4a37", deep: "#08301f", hi: "#156048", rail: "#2b1910", railHi: "#4a2d1c", text: "#e6d6a8", accent: "#d4ad55", muted: "#a9b9ae", back: "#7a1626", btn: "#f1e6c6" },
      dark: { felt: "#2a2d32", deep: "#131417", hi: "#393d44", rail: "#0d0e10", railHi: "#1e2024", text: "#e7e2d4", accent: "#cfae66", muted: "#9ba1a8", back: "#464b55", btn: "#e7e2d4" } },
    { id: "ocean", name: "Cards by the Ocean", tag: "Sea blue felt, sand and foam",
      c: { felt: "#0f5c73", deep: "#08364a", hi: "#1b8099", rail: "#0c2737", railHi: "#1e4a60", text: "#e9f6f3", accent: "#f2c879", muted: "#a2c9d1", back: "#1c6e8c", btn: "#f6ecd6" },
      page: "radial-gradient(140% 55% at 50% 115%, rgba(64,190,210,.35) 0%, transparent 60%), radial-gradient(90% 40% at 15% 0%, rgba(255,230,180,.12) 0%, transparent 70%), linear-gradient(#0a4258, #052434)" },
    { id: "pretty", name: "Feeling Pretty", tag: "Candy pink and sparkles", font: ["Pacifico", "'Pacifico', cursive"],
      c: { felt: "#c9457f", deep: "#7c1d4f", hi: "#e66aa1", rail: "#4e1233", railHi: "#7a2252", text: "#fff1f7", accent: "#ffb6d5", muted: "#f6c6dc", back: "#e05596", btn: "#ffe4ef" },
      page: "radial-gradient(circle at 12% 18%, rgba(255,255,255,.18) 0 2px, transparent 3px), radial-gradient(circle at 78% 30%, rgba(255,255,255,.16) 0 2px, transparent 3px), radial-gradient(circle at 40% 80%, rgba(255,255,255,.14) 0 2px, transparent 3px), radial-gradient(120% 70% at 50% 0%, #b03a75 0%, #6e1845 70%)",
      pageSize: "180px 180px, 230px 230px, 200px 200px, 100% 100%" },
    { id: "west", name: "Wild West", tag: "Saddle leather and desert dusk", font: ["Rye", "'Rye', serif"],
      c: { felt: "#8a5a2b", deep: "#3e2610", hi: "#a8743d", rail: "#2a170a", railHi: "#4d2c13", text: "#f6e6c4", accent: "#e8b030", muted: "#d6bf94", back: "#7a2e1a", btn: "#f3ddb0" },
      page: "linear-gradient(#b5652c 0%, #6e3d18 38%, #3e2610 75%)" },
    { id: "vegas", name: "Vegas", tag: "Neon, velvet and city lights", font: ["Limelight", "'Limelight', serif"],
      c: { felt: "#3d0f55", deep: "#10051a", hi: "#621c80", rail: "#0a0410", railHi: "#2a0d3a", text: "#fdf2ff", accent: "#ff4fb4", muted: "#cfaee2", back: "#b8002e", btn: "#ffe36e" },
      page: "radial-gradient(circle at 8% 22%, rgba(255,214,90,.55) 0 3px, transparent 7px), radial-gradient(circle at 26% 12%, rgba(255,79,180,.5) 0 3px, transparent 8px), radial-gradient(circle at 61% 18%, rgba(90,220,255,.45) 0 2px, transparent 7px), radial-gradient(circle at 87% 9%, rgba(255,214,90,.5) 0 3px, transparent 8px), radial-gradient(circle at 45% 28%, rgba(255,140,60,.4) 0 2px, transparent 6px), linear-gradient(#1c0830, #08030d 60%)",
      pageSize: "260px 200px, 310px 240px, 220px 180px, 280px 220px, 340px 260px, 100% 100%", glow: "0 0 6px #ff4fb4, 0 0 16px rgba(255,79,180,.7)" },
    { id: "future", name: "Into the Future", tag: "Brushed silver and cyan light", font: ["Orbitron", "'Orbitron', sans-serif"],
      c: { felt: "#4b5864", deep: "#171d23", hi: "#7a8996", rail: "#0e1317", railHi: "#2d363e", text: "#eef4f8", accent: "#79e3ff", muted: "#aebcc8", back: "#5d6c78", btn: "#dde6ed" },
      page: "repeating-linear-gradient(0deg, rgba(121,227,255,.05) 0 1px, transparent 1px 40px), repeating-linear-gradient(90deg, rgba(121,227,255,.05) 0 1px, transparent 1px 40px), linear-gradient(135deg, #2b343c, #11161b)",
      glow: "0 0 8px rgba(121,227,255,.6)" },
    { id: "aurora", name: "Northern Lights", tag: "A night sky with slow green and violet light", font: ["Josefin Sans", "'Josefin Sans', sans-serif"],
      c: { felt: "#0f3b45", deep: "#071a24", hi: "#1f6b6a", rail: "#0a1020", railHi: "#1d2540", text: "#eaf8f2", accent: "#7dffb3", muted: "#a3cdc4", back: "#3b2a6b", btn: "#e2fff1" },
      page: "radial-gradient(60% 40% at 25% 10%, rgba(125,255,179,.30), transparent 70%), radial-gradient(55% 45% at 80% 20%, rgba(155,110,255,.28), transparent 70%), radial-gradient(70% 50% at 50% 0%, rgba(80,220,200,.18), transparent 75%), linear-gradient(#0a2230, #050c14)",
      pageSize: "200% 200%, 200% 200%, 200% 200%, 100% 100%", animate: "aurora" },
    { id: "lantern", name: "Lantern Night", tag: "Red lacquer, gold and warm lantern glow", font: ["Cinzel", "'Cinzel', serif"],
      c: { felt: "#7a1414", deep: "#240505", hi: "#a32626", rail: "#160904", railHi: "#3b1d0e", text: "#fff1d6", accent: "#ffb347", muted: "#e4bea2", back: "#b8892a", btn: "#ffe3b3" },
      page: "radial-gradient(circle at 10% 15%, rgba(255,160,60,.45) 0 10px, rgba(255,120,40,.12) 22px, transparent 48px), radial-gradient(circle at 88% 22%, rgba(255,160,60,.4) 0 9px, rgba(255,120,40,.1) 20px, transparent 44px), radial-gradient(circle at 50% 6%, rgba(255,190,90,.35) 0 8px, transparent 36px), linear-gradient(#3a0a0a, #160303 70%)",
      pageSize: "100% 520px, 100% 560px, 100% 480px, 100% 100%" },
    { id: "emperor", name: "Emperor's House", tag: "Sakura, a castle and gold on black lacquer", font: ["Shippori Mincho", "'Shippori Mincho', serif"],
      c: { felt: "#3d1527", deep: "#12060c", hi: "#5e2440", rail: "#0c0508", railHi: "#2a1119", text: "#fdf0f4", accent: "#e8c066", muted: "#e3bccb", back: "#b0283f", btn: "#ffe3ec" },
      page: "radial-gradient(circle at 84% 14%, rgba(255,240,215,.9) 0 34px, rgba(255,220,190,.18) 46px, transparent 90px), linear-gradient(#2a0f1d, #10060b 70%)" },
    { id: "pirate", name: "Pirate's Cove", tag: "Ship's deck, treasure and a moonlit sea", font: ["Pirata One", "'Pirata One', serif"],
      c: { felt: "#5d3d22", deep: "#0c1620", hi: "#7d5634", rail: "#2a1a0e", railHi: "#4a2e18", text: "#f6e7c8", accent: "#f2c14e", muted: "#cdb894", back: "#7a1d1d", btn: "#f3dfb2" },
      page: "linear-gradient(#0f2233, #08121c 75%)" },
    { id: "jazz", name: "Midnight Jazz Club", tag: "Smoky blue, brass and piano keys", font: ["Poiret One", "'Poiret One', sans-serif"],
      c: { felt: "#1c2a4a", deep: "#090d1a", hi: "#2e4170", rail: "#120d0a", railHi: "#2e2018", text: "#f3ead8", accent: "#d9a441", muted: "#a9b3c9", back: "#6b1d2c", btn: "#f1e3c2" },
      page: "radial-gradient(70% 50% at 50% 0%, rgba(120,140,200,.18), transparent 70%), linear-gradient(#141c33, #070a14 75%)" },
    { id: "forest", name: "Enchanted Forest", tag: "Moss, glowing mushrooms and fireflies", font: ["Almendra", "'Almendra', serif"],
      c: { felt: "#2f5a2e", deep: "#0c160d", hi: "#4a7d3e", rail: "#1e140c", railHi: "#3a2a18", text: "#f0f7e6", accent: "#f5e07a", muted: "#b8cfa8", back: "#4a6b2a", btn: "#eef6d8" },
      page: "radial-gradient(50% 40% at 30% 70%, rgba(150,220,120,.12), transparent 70%), radial-gradient(40% 30% at 75% 30%, rgba(245,224,122,.1), transparent 70%), linear-gradient(#142414, #070d08 75%)" },
    { id: "garage", name: "Garage", tag: "Muscle cars, chrome and a checkered flag", font: ["Racing Sans One", "'Racing Sans One', sans-serif"],
      c: { felt: "#3a3d42", deep: "#121315", hi: "#575b62", rail: "#0d0d0f", railHi: "#2b2c30", text: "#f3f2ee", accent: "#ff6a1f", muted: "#b7babf", back: "#b3121b", btn: "#f1f0ea" },
      page: "repeating-conic-gradient(rgba(255,255,255,.03) 0 25%, transparent 0 50%), radial-gradient(80% 45% at 50% 0%, rgba(255,150,70,.16), transparent 70%), linear-gradient(#27282c, #0f1012 75%)",
      pageSize: "64px 64px, 100% 100%, 100% 100%" },
    { id: "space", name: "Space Fight", tag: "Starfighters, laser fire and a ringed planet", font: ["Audiowide", "'Audiowide', sans-serif"],
      c: { felt: "#1b2040", deep: "#05060f", hi: "#2d3568", rail: "#04050b", railHi: "#1b1e35", text: "#e9edff", accent: "#ffcc33", muted: "#9ba4c8", back: "#7a1f2b", btn: "#e9edff" },
      page: "radial-gradient(circle at 12% 20%, #fff 0 1px, transparent 1.5px), radial-gradient(circle at 70% 35%, #fff 0 1px, transparent 1.5px), radial-gradient(circle at 40% 75%, rgba(255,255,255,.8) 0 1px, transparent 1.5px), radial-gradient(circle at 88% 82%, rgba(255,255,255,.7) 0 1.2px, transparent 2px), radial-gradient(60% 40% at 80% 20%, rgba(120,80,220,.22), transparent 70%), radial-gradient(50% 40% at 15% 85%, rgba(40,140,220,.18), transparent 70%), linear-gradient(#0a0c1e, #03040a 80%)",
      pageSize: "170px 170px, 230px 230px, 260px 260px, 310px 310px, 100% 100%, 100% 100%, 100% 100%", glow: "0 0 8px rgba(255,204,51,.55)" },
    { id: "deezy", name: "Feeling Deezy?", tag: "Hazy pastels, lava lamps and slow clouds", font: ["Shrikhand", "'Shrikhand', cursive"],
      c: { felt: "#5b3f8c", deep: "#1c1233", hi: "#7a5bb0", rail: "#150c26", railHi: "#352352", text: "#fcf0ff", accent: "#7ff0d0", muted: "#d4c2ea", back: "#e06aa8", btn: "#fde9ff" },
      page: "radial-gradient(55% 45% at 20% 20%, rgba(255,140,200,.30), transparent 70%), radial-gradient(50% 45% at 85% 30%, rgba(120,240,210,.24), transparent 70%), radial-gradient(60% 50% at 50% 90%, rgba(160,120,255,.30), transparent 75%), linear-gradient(#2a1a4a, #140b26 80%)",
      pageSize: "200% 200%, 200% 200%, 200% 200%, 100% 100%" }
  ];

  // ---------- colour helpers ----------
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const toHex = rgb => "#" + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const rgba = (h, a) => `rgba(${hex(h).join(",")},${a})`;

  // Dark mode for any theme: the same colours pulled toward a near-black, accents kept bright.
  function darkOf(c) {
    return {
      felt: mix(c.felt, "#16171b", 0.6), deep: mix(c.deep, "#0a0a0c", 0.65), hi: mix(c.hi, "#24262b", 0.55),
      rail: mix(c.rail, "#08090a", 0.55), railHi: mix(c.railHi, "#141518", 0.55),
      text: c.text, accent: c.accent, muted: c.muted, back: mix(c.back, "#222428", 0.35), btn: c.btn
    };
  }

  let themeId = "classic", mode = "light";
  try {
    themeId = localStorage.getItem(KEY_THEME) || "classic";
    mode = localStorage.getItem(KEY_MODE) || (localStorage.getItem("cr-theme") === "dark" ? "dark" : "light"); // older single switch
  } catch {}
  const find = id => THEMES.find(t => t.id === id) || THEMES[0];

  const fontsLoaded = new Set();
  function loadFont(theme) {
    if (!theme.font || fontsLoaded.has(theme.font[0])) return;
    fontsLoaded.add(theme.font[0]);
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=" + theme.font[0].replace(/ /g, "+") + "&display=swap";
    document.head.appendChild(l);
  }

  // ---------- scenery ----------
  const here = (document.currentScript && document.currentScript.src) || "";
  let decoLayer = null, decoFor = null;
  function renderDeco() {
    if (!decoLayer || !window.CR_DECO) return;
    const id = root.dataset.themeName;
    if (decoFor === id) return;
    decoFor = id;
    const draw = window.CR_DECO[id];
    decoLayer.innerHTML = draw ? draw() : "";
    if (draw) root.dataset.deco = ""; else delete root.dataset.deco;
  }
  window.CR_DECO_READY = renderDeco;
  const sibling = name => { const sc = document.createElement("script"); sc.src = new URL(name, here).href; document.head.appendChild(sc); return sc; };
  if (here) {
    sibling("theme-deco.js").defer = true; // sits next to theme.js
    // the loading screen: hide the page until the loader is drawn over it (never longer than a moment)
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.add("cr-loading");
      sibling("theme-loader.js");
      setTimeout(() => root.classList.remove("cr-loading"), 3500);
    }
  }

  // ---------- music ----------
  let musicOn = false, musicVol = 0.6, musicLoading = null;
  try { musicOn = localStorage.getItem(KEY_MUSIC) === "on"; musicVol = +(localStorage.getItem(KEY_VOL) ?? 0.6); if (!(musicVol >= 0 && musicVol <= 1)) musicVol = 0.6; } catch {}
  function withMusic(fn) {
    if (window.CR_MUSIC) return fn(window.CR_MUSIC);
    if (!here) return;
    if (!musicLoading) { musicLoading = []; window.CR_MUSIC_READY = () => { const q = musicLoading; musicLoading = null; q.forEach(g => g(window.CR_MUSIC)); }; sibling("theme-music.js"); }
    if (musicLoading) musicLoading.push(fn);
  }
  // The music follows the game: pages say how heated the table is (0 calm, 1 normal, 2 intense) and what just
  // happened ("turn", "win", "lose", "big"). Nothing happens while the music is off.
  let cueLevel = 1;
  const lastCue = {};
  window.CR_CUE = {
    level(i) { if (i === cueLevel) return; cueLevel = i; if (window.CR_MUSIC && window.CR_MUSIC.setIntensity) window.CR_MUSIC.setIntensity(i); },
    sting(kind) {
      const now = Date.now();
      if (now - (lastCue[kind] || 0) < 1500) return;      // one of each at a time
      lastCue[kind] = now;
      if (musicOn && window.CR_MUSIC && window.CR_MUSIC.sting) window.CR_MUSIC.sting(kind);
    }
  };
  function syncMusic() {
    if (musicOn) withMusic(M => { M.setVolume(musicVol); if (M.setIntensity) M.setIntensity(cueLevel); M.start(themeId); });
    else if (window.CR_MUSIC) window.CR_MUSIC.stop();
  }

  function apply() {
    const t = find(themeId), dark = mode === "dark";
    const c = dark ? (t.dark || darkOf(t.c)) : t.c;
    const v = {
      "--felt": c.felt, "--felt-deep": c.deep, "--felt-hi": c.hi, "--rail": c.rail, "--rail-hi": c.railHi,
      "--print": c.text, "--gold": c.accent, "--muted": c.muted, "--card-back": c.back, "--btn": c.btn,
      "--btn-ink": mix(c.rail, "#000000", 0.4), "--line": rgba(c.text, dark ? 0.12 : 0.15),
      "--dialog": mix(c.rail, "#000000", 0.25), "--brand-glow": t.glow || "none",
      "--page-bg": dark && t.page ? `linear-gradient(rgba(6,6,8,.62), rgba(6,6,8,.62)), ${t.page}` : (t.page || c.deep),
      "--page-size": t.pageSize ? (dark ? "100% 100%, " + t.pageSize : t.pageSize) : "auto"
    };
    if (t.font) { loadFont(t); v["--font-display"] = t.font[1] + ', "Cormorant SC", Georgia, serif'; }
    else root.style.removeProperty("--font-display");
    for (const [k, val] of Object.entries(v)) root.style.setProperty(k, val);
    root.dataset.themeName = t.id;
    root.dataset.mode = mode;
    root.style.colorScheme = "dark";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = c.rail;
    renderDeco();
  }
  apply();
  const save = () => { try { localStorage.setItem(KEY_THEME, themeId); localStorage.setItem(KEY_MODE, mode); } catch {} };

  // ---------- page-wide styles the themes need ----------
  const css = `
    body { background: var(--page-bg, var(--felt-deep)) !important; background-size: var(--page-size, auto) !important; background-attachment: fixed !important; }
    .brand { text-shadow: var(--brand-glow, none); }
    .look-dlg { background: var(--dialog, #1b130d) !important; }
    :root.cr-loading body { visibility: hidden; }
    .theme-btn.on { box-shadow: inset 0 0 0 2px var(--gold); color: var(--gold); }
    .theme-dlg .music-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 4px; border-top: 1px solid var(--line); }
    .theme-dlg .music-row b { font-size: .95rem; }
    .theme-dlg .music-row input[type=range] { flex: 1; min-width: 120px; accent-color: var(--gold); }
    :root[data-theme-name="aurora"] body { animation: cr-aurora 70s ease-in-out infinite alternate; }
    @keyframes cr-aurora { from { background-position: 0% 0%, 100% 0%, 50% 0%, 0 0; } to { background-position: 100% 30%, 0% 40%, 30% 20%, 0 0; } }
    :root[data-theme-name="vegas"] .felt, :root[data-theme-name="vegas"] .table { box-shadow: inset 0 0 60px rgba(0,0,0,.5), 0 0 0 2px var(--rail-hi), 0 0 28px rgba(255,79,180,.35); }
    :root[data-theme-name="future"] .felt, :root[data-theme-name="future"] .table { box-shadow: inset 0 0 60px rgba(0,0,0,.45), 0 0 0 2px #9aa8b4, 0 0 22px rgba(121,227,255,.25); }
    :root[data-theme-name="lantern"] .felt, :root[data-theme-name="lantern"] .table { box-shadow: inset 0 0 60px rgba(0,0,0,.45), 0 0 0 2px #c8962e, 0 0 30px rgba(255,160,60,.25); }
    :root[data-theme-name="deezy"] body { animation: cr-aurora 50s ease-in-out infinite alternate; }
    :root[data-theme-name="garage"] .felt, :root[data-theme-name="garage"] .table { box-shadow: inset 0 0 60px rgba(0,0,0,.45), 0 0 0 3px #c9ccd2, 0 0 0 5px #6d7178, 0 10px 30px rgba(0,0,0,.5); }
    :root[data-theme-name="space"] .felt, :root[data-theme-name="space"] .table { box-shadow: inset 0 0 60px rgba(0,0,0,.5), 0 0 0 2px #3a4378, 0 0 26px rgba(90,120,255,.3); }
    :root[data-theme-name="deezy"] .felt, :root[data-theme-name="deezy"] .table { box-shadow: inset 0 0 60px rgba(40,10,60,.45), 0 0 0 2px #b79be0, 0 0 34px rgba(255,150,220,.3); }
    @media (prefers-reduced-motion: reduce) { :root[data-theme-name="aurora"] body, :root[data-theme-name="deezy"] body { animation: none; } }
    .theme-tools { display: flex; gap: 6px; align-items: center; flex: none; }
    .theme-btn { min-width: 0; width: 34px; height: 34px; padding: 0; border-radius: 50%; flex: none; background: transparent; color: var(--print);
      font-size: 1rem; line-height: 1; box-shadow: inset 0 0 0 1.5px var(--line); }
    .theme-btn:hover { box-shadow: inset 0 0 0 1.5px var(--gold); }
    .theme-dlg { border: 1px solid var(--line); border-radius: 18px; padding: 0; background: var(--dialog); color: var(--print); width: min(560px, calc(100vw - 24px)); max-height: 88vh; max-height: 88dvh; overflow: hidden; }
    .theme-dlg::backdrop { background: rgba(0,0,0,.6); }
    .theme-dlg form { display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; max-height: 88vh; max-height: 88dvh; box-sizing: border-box; }
    .theme-dlg form > * { flex: none; }
    /* only the list scrolls: Music and Done stay in view */
    .theme-dlg .theme-grid { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 2px; }
    .theme-dlg h2 { margin: 0; font-family: var(--font-display); color: var(--gold); font-size: 1.5rem; }
    .theme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
    .theme-opt { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: center; text-align: left; padding: 8px 10px; min-width: 0;
      border-radius: 14px; background: rgba(255,255,255,.04); color: var(--print); box-shadow: inset 0 0 0 1.5px transparent; font-weight: 600; }
    /* one round swatch per theme: felt in the middle, then the wood rail and a ring of the accent colour */
    .theme-opt .sw { grid-row: span 2; width: 40px; height: 40px; border-radius: 50%; }
    .theme-opt b { overflow-wrap: anywhere; line-height: 1.15; }
    @media (max-width: 520px) { .theme-grid { grid-template-columns: 1fr 1fr; gap: 6px; } .theme-dlg form { padding: 12px 10px; } .theme-opt { padding: 6px 8px; } .theme-opt .sw { width: 32px; height: 32px; } .theme-opt small { display: none; } }
    .hero h1, .hero p, .shelf h2, .foot { text-shadow: 0 1px 2px var(--felt-deep), 0 0 12px var(--felt-deep), 0 0 22px var(--felt-deep); }
    .tabs a:not([aria-current="page"]) { background: color-mix(in srgb, var(--felt-deep) 82%, transparent); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
    .steady { align-content: center; }
    @media (max-width: 720px) { .steady { align-content: space-between; } }   /* cards stay at the top of the bar, buttons at the bottom */
    .theme-btn { position: relative; }
    .theme-btn::after { content: ""; position: absolute; inset: -6px -3px; }
    .theme-opt[aria-pressed="true"] { box-shadow: inset 0 0 0 2px var(--gold); background: rgba(255,255,255,.08); }
    .theme-opt:focus-visible { outline-offset: -2px; }
    .theme-opt b { font-size: .9rem; } .theme-opt small { font-size: .7rem; font-weight: 400; opacity: .75; line-height: 1.2; }
    .theme-dlg .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    @media (max-width: 520px) { .theme-btn { width: 30px; height: 30px; font-size: .9rem; } }

    /* scenery layer: behind everything, never in the way of a tap */
    .theme-deco { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
    .theme-deco .d { position: absolute; display: block; height: auto; }
    .wrap { position: relative; z-index: 1; }
    .theme-deco { opacity: .78; }
    :root[data-mode="dark"] .theme-deco { opacity: .45; filter: brightness(.75) saturate(.85); }
    .theme-deco .hide-sm { display: block; }
    @media (max-width: 720px) { .theme-deco .hide-sm { display: none; } }
    /* room under the page, so the ground-level scenery shows once you reach the end */
    :root[data-deco] .wrap { padding-bottom: clamp(70px, 18vh, 190px); }
    :root[data-deco]:not([data-theme-name="classic"]) .panel, :root[data-deco]:not([data-theme-name="classic"]) .box { background: rgba(0,0,0,.45); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
    .theme-deco .sway { transform-origin: 50% 100%; animation: cr-sway 13s ease-in-out infinite alternate; }
    .theme-deco .sway-2 { transform-origin: 50% 100%; animation: cr-sway 16s ease-in-out -5s infinite alternate; }
    .theme-deco .sway-1 { transform-origin: 50% 0; animation: cr-swing 10s ease-in-out infinite alternate; }
    .theme-deco svg.sway-2[preserveAspectRatio^="xMidYMin"] { transform-origin: 50% 0; animation: cr-swing 12s ease-in-out -4s infinite alternate; }
    .theme-deco .sway-slow { animation: cr-bob 20s ease-in-out infinite alternate; }
    .theme-deco .float { animation: cr-bob 11s ease-in-out infinite alternate; }
    .theme-deco .float-2 { animation: cr-bob 14s ease-in-out -4s infinite alternate; }
    .theme-deco .drift { animation: cr-drift 45s ease-in-out infinite alternate; }
    .theme-deco .roll { animation: cr-roll 30s linear infinite; }
    .theme-deco .twinkle circle:nth-child(3n) { animation: cr-twinkle 6s ease-in-out infinite alternate; }
    .theme-deco .twinkle circle:nth-child(3n+1) { animation: cr-twinkle 8s ease-in-out -3s infinite alternate; }
    .theme-deco .glow { filter: drop-shadow(0 0 10px rgba(255,150,50,.45)); }
    .theme-deco .neon { filter: drop-shadow(0 0 4px currentColor); color: #ff4fb4; }
    .theme-deco .flicker { animation: cr-flicker 14s steps(1) infinite; }
    .theme-deco .flicker-2 { animation: cr-flicker 19s steps(1) -6s infinite; }
    .theme-deco .blink { animation: cr-twinkle 3s ease-in-out infinite alternate; }
    .theme-deco .beam-a { transform-origin: 300px 600px; animation: cr-beam 22s ease-in-out infinite alternate; }
    .theme-deco .beam-b { transform-origin: 1140px 600px; animation: cr-beam 27s ease-in-out -9s infinite alternate-reverse; }
    .theme-deco .wave { animation: cr-wave 10s ease-in-out infinite alternate; }
    @keyframes cr-sway { from { rotate: -.8deg; } to { rotate: 1deg; } }
    @keyframes cr-swing { from { rotate: -2deg; } to { rotate: 2deg; } }
    @keyframes cr-bob { from { translate: 0 -3px; } to { translate: 0 3px; } }
    @keyframes cr-drift { from { translate: -2vw 0; } to { translate: 3vw -1vh; } }
    @keyframes cr-roll { from { rotate: 0deg; translate: -6vw 0; } to { rotate: 360deg; translate: 6vw 0; } }
    @keyframes cr-twinkle { from { opacity: .35; } to { opacity: .9; } }
    @keyframes cr-flicker { 0%, 100% { opacity: .9; } 46% { opacity: .55; } 47% { opacity: .9; } }
    @keyframes cr-beam { from { rotate: -10deg; } to { rotate: 8deg; } }
    @keyframes cr-wave { from { translate: -10px 0; } to { translate: 10px 2px; } }
    /* Emperor's House petals drift down; Enchanted Forest fireflies wander; Jazz notes float; the record spins */
    .theme-deco .petal { animation: cr-fall var(--fall, 20s) linear var(--delay, 0s) infinite; }
    @keyframes cr-fall { from { translate: 0 0; rotate: 0deg; } 50% { translate: calc(var(--drift, 2vw) * -1) 55vh; rotate: 200deg; } to { translate: var(--drift, 2vw) 112vh; rotate: 400deg; } }
    .theme-deco .firefly { filter: drop-shadow(0 0 5px #fff27a) drop-shadow(0 0 10px rgba(255,240,120,.6)); animation: cr-firefly 9s ease-in-out var(--delay, 0s) infinite alternate; }
    @keyframes cr-firefly { 0% { translate: 0 0; opacity: .2; } 40% { opacity: 1; } 70% { opacity: .4; } 100% { translate: var(--dx, 2vw) var(--dy, 2vh); opacity: .9; } }
    .theme-deco .note { opacity: .55; animation: cr-note 12s ease-in-out var(--delay, 0s) infinite; }
    @keyframes cr-note { 0% { translate: 0 0; opacity: 0; } 20% { opacity: .55; } 100% { translate: 2vw -14vh; opacity: 0; } }
    .theme-deco .spin { transform-origin: 100px 100px; animation: cr-spin 9s linear infinite; }
    .theme-deco .spin-slow { transform-origin: 100px 100px; animation: cr-spin 60s linear infinite; }
    @keyframes cr-spin { to { rotate: 360deg; } }
    .theme-deco .glow-green { filter: drop-shadow(0 0 8px rgba(190,255,150,.45)); }
    .theme-deco .twinkle-dot { filter: drop-shadow(0 0 4px #ffe680); }
    /* Space Fight: laser bolts streak across; Garage: the flag ripples; Feeling Deezy: lava blobs rise and sink, orbs float */
    .theme-deco .laser { animation: cr-laser var(--dur, 3.2s) linear var(--delay, 0s) infinite; opacity: 0; }
    @keyframes cr-laser { 0% { translate: var(--from, -20vw) 0; opacity: 0; } 8% { opacity: 1; } 60% { opacity: 1; } 70%, 100% { translate: var(--to, 120vw) 0; opacity: 0; } }
    .theme-deco .lava { animation: cr-lava var(--dur, 14s) ease-in-out var(--delay, 0s) infinite alternate; }
    @keyframes cr-lava { from { translate: 0 0; scale: 1 1; } 50% { scale: .85 1.15; } to { translate: 0 var(--rise, -150px); scale: 1.1 .9; } }
    .theme-deco .orb { animation: cr-orb var(--dur, 16s) ease-in-out var(--delay, 0s) infinite alternate; filter: blur(.5px); }
    @keyframes cr-orb { from { translate: 0 0; opacity: .35; } to { translate: var(--dx, 3vw) var(--dy, -8vh); opacity: .85; } }
    .theme-deco .zz { animation: cr-note 7s ease-in-out var(--delay, 0s) infinite; }
    @media (prefers-reduced-motion: reduce) { .theme-deco * { animation: none !important; } .theme-deco .petal { display: none; } .theme-deco .laser { opacity: .8; } }
    @media (max-width: 720px) { .theme-deco { opacity: .65; } }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- a steady action bar ----------
  // The bar under a table (your cards, the buttons) changes with what you can do this turn. Left alone, that
  // resizes the table and moves the page on every action. So the bar keeps the tallest height it has needed
  // since you sat down, and the table above it keeps its size. It starts again when you leave the table or
  // the window changes width.
  window.CR_STEADY = function (el, name) {
    let max = 0, w = innerWidth, gone = 0;
    // what this bar needed last time on this page at this width, so even the first turn doesn't move the table
    const key = () => "cr-bar:" + location.pathname + ":" + innerWidth;
    const recall = () => { try { return Math.min(+localStorage.getItem(key()) || 0, Math.round(innerHeight * 0.55)); } catch { return 0; } };
    const hold = h => {
      max = h; el.style.minHeight = h + "px";
      document.documentElement.style.setProperty(name, h + "px");
      try { localStorage.setItem(key(), String(h)); } catch {}
    };
    const reset = () => { max = 0; el.style.minHeight = ""; };
    el.classList.add("steady");
    new ResizeObserver(() => {
      const h = el.offsetHeight;
      if (!h) { gone = gone || setTimeout(() => { gone = 0; if (!el.offsetHeight) reset(); }, 1200); return; }   // left the table
      if (!max) return hold(Math.max(h, recall()));
      if (h > max) hold(h);
    }).observe(el);
    addEventListener("resize", () => {
      if (Math.abs(innerWidth - w) <= 24) return;   // a real resize or a turned phone, not a scrollbar flicker
      w = innerWidth; reset();
      requestAnimationFrame(() => { const h = el.offsetHeight; if (h) hold(Math.max(h, recall())); });
    });
  };

  // ---------- header buttons and the picker ----------
  document.addEventListener("DOMContentLoaded", () => {
    decoLayer = document.createElement("div");
    decoLayer.className = "theme-deco"; decoLayer.setAttribute("aria-hidden", "true");
    document.body.prepend(decoLayer);
    renderDeco();
    const bar = document.querySelector(".bar-in");
    if (!bar) return;
    const tools = document.createElement("div");
    tools.className = "theme-tools";
    const pick = document.createElement("button");
    pick.type = "button"; pick.className = "theme-btn"; pick.textContent = "🎨";
    pick.setAttribute("aria-label", "Choose a theme"); pick.title = "Theme";
    let dlg = null;
    const dm = document.createElement("button");
    dm.type = "button"; dm.className = "theme-btn";
    const drawMode = () => {
      dm.textContent = mode === "dark" ? "☀" : "☾";
      dm.setAttribute("aria-label", mode === "dark" ? "Switch to full colour" : "Dim the colours");
      dm.title = mode === "dark" ? "Full colour" : "Dim the colours (easier on the eyes at night)";
    };
    dm.onclick = () => { mode = mode === "dark" ? "light" : "dark"; save(); apply(); drawMode(); drawGrid(); };
    drawMode();
    const mu = document.createElement("button");
    mu.type = "button"; mu.className = "theme-btn"; mu.textContent = "♪";
    const drawMusic = () => {
      mu.classList.toggle("on", musicOn);
      mu.setAttribute("aria-pressed", String(musicOn));
      mu.setAttribute("aria-label", musicOn ? "Turn music off" : "Turn music on");
      mu.title = musicOn ? "Music: on" : "Music: off";
      const t = dlg && dlg.querySelector(".music-toggle");
      if (t) t.textContent = musicOn ? "Music on" : "Music off";
    };
    mu.onclick = () => { musicOn = !musicOn; try { localStorage.setItem(KEY_MUSIC, musicOn ? "on" : "off"); } catch {} syncMusic(); drawMusic(); };
    // game sound effects (poker and Capsa have them): the same switch as the 🔊 button on the table
    const fx = document.createElement("button");
    fx.type = "button"; fx.className = "theme-btn";
    let fxOn = true;
    try { fxOn = localStorage.getItem("pk-sound") !== "off"; } catch {}
    const drawFx = () => {
      fx.textContent = fxOn ? "🔊" : "🔇";
      fx.setAttribute("aria-pressed", String(fxOn));
      fx.setAttribute("aria-label", fxOn ? "Mute sound effects" : "Turn sound effects on");
      fx.title = fxOn ? "Sound effects: on" : "Sound effects: off";
    };
    fx.onclick = () => {
      fxOn = !fxOn;
      try { localStorage.setItem("pk-sound", fxOn ? "on" : "off"); } catch {}
      drawFx();
      dispatchEvent(new CustomEvent("cr-fx", { detail: fxOn }));
    };
    addEventListener("cr-fx", e => { fxOn = !!e.detail; drawFx(); });
    drawFx();
    fx.hidden = !document.getElementById("btnSound");     // only on pages that have sound effects
    tools.append(mu, fx, pick, dm);
    bar.appendChild(tools);

    dlg = document.createElement("dialog");
    dlg.className = "theme-dlg";
    dlg.setAttribute("aria-label", "Themes");
    dlg.innerHTML = `<form method="dialog"><div class="row"><h2>Themes</h2><span class="note"></span></div><div class="theme-grid"></div>
      <div class="music-row"><b>Music</b><button type="button" class="ghost music-toggle"></button><label class="note" for="crMusicVol">Volume</label><input type="range" id="crMusicVol" min="0" max="100" step="1"></div>
      <div class="row"><small class="note">Each theme has its own tune. The ☾ button dims any theme for playing at night.</small><button class="primary" value="close">Done</button></div></form>`;
    document.body.appendChild(dlg);
    dlg.querySelector(".music-toggle").onclick = () => mu.click();
    const volIn = dlg.querySelector("#crMusicVol");
    volIn.value = Math.round(musicVol * 100);
    volIn.oninput = () => {
      musicVol = volIn.value / 100;
      try { localStorage.setItem(KEY_VOL, String(musicVol)); } catch {}
      if (window.CR_MUSIC) window.CR_MUSIC.setVolume(musicVol);
    };
    drawMusic();
    syncMusic();
    const grid = dlg.querySelector(".theme-grid");
    function drawGrid() {
      grid.innerHTML = "";
      for (const t of THEMES) {
        const c = mode === "dark" ? (t.dark || darkOf(t.c)) : t.c;
        const b = document.createElement("button");
        b.type = "button"; b.className = "theme-opt"; b.setAttribute("aria-pressed", t.id === themeId);
        b.innerHTML = `<span class="sw"></span><b></b><small></small>`;
        b.querySelector(".sw").style.background = `radial-gradient(circle at 50% 40%, ${c.hi} 0 35%, ${c.felt} 36% 62%, ${c.rail} 63% 78%, ${c.accent} 79% 86%, ${c.rail} 87%)`;
        b.querySelector("b").textContent = t.name;
        b.querySelector("small").textContent = t.tag;
        if (t.font) { loadFont(t); b.querySelector("b").style.fontFamily = t.font[1]; }
        b.onclick = () => { themeId = t.id; save(); apply(); drawGrid(); if (musicOn) syncMusic(); };
        grid.appendChild(b);
      }
    }
    pick.onclick = () => { drawGrid(); dlg.showModal(); const cur = grid.querySelector('[aria-pressed="true"]'); if (cur) { cur.focus({ preventScroll: true }); cur.scrollIntoView({ block: "nearest" }); } };
  });
})();
