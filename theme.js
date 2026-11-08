// Themes and dark mode, remembered on this device. Two separate switches in the header:
// the palette button picks a theme, the moon/sun button turns dark mode on or off for whichever theme you're on.
// Loaded in <head> so the page never flashes the wrong colours.
(function () {
  const root = document.documentElement;
  const KEY_THEME = "cr-theme-name", KEY_MODE = "cr-mode";

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
      pageSize: "100% 520px, 100% 560px, 100% 480px, 100% 100%" }
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
  if (here) {
    const sc = document.createElement("script");
    sc.src = new URL("theme-deco.js", here).href; sc.defer = true; // sits next to theme.js
    document.head.appendChild(sc);
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
    :root[data-theme-name="aurora"] body { animation: cr-aurora 40s ease-in-out infinite alternate; }
    @keyframes cr-aurora { from { background-position: 0% 0%, 100% 0%, 50% 0%, 0 0; } to { background-position: 100% 30%, 0% 40%, 30% 20%, 0 0; } }
    :root[data-theme-name="vegas"] .felt, :root[data-theme-name="vegas"] .table { box-shadow: inset 0 0 60px rgba(0,0,0,.5), 0 0 0 2px var(--rail-hi), 0 0 28px rgba(255,79,180,.35); }
    :root[data-theme-name="future"] .felt, :root[data-theme-name="future"] .table { box-shadow: inset 0 0 60px rgba(0,0,0,.45), 0 0 0 2px #9aa8b4, 0 0 22px rgba(121,227,255,.25); }
    :root[data-theme-name="lantern"] .felt, :root[data-theme-name="lantern"] .table { box-shadow: inset 0 0 60px rgba(0,0,0,.45), 0 0 0 2px #c8962e, 0 0 30px rgba(255,160,60,.25); }
    @media (prefers-reduced-motion: reduce) { :root[data-theme-name="aurora"] body { animation: none; } }
    .theme-tools { display: flex; gap: 6px; align-items: center; flex: none; }
    .theme-btn { min-width: 0; width: 34px; height: 34px; padding: 0; border-radius: 50%; flex: none; background: transparent; color: var(--print);
      font-size: 1rem; line-height: 1; box-shadow: inset 0 0 0 1.5px var(--line); }
    .theme-btn:hover { box-shadow: inset 0 0 0 1.5px var(--gold); }
    .theme-dlg { border: 1px solid var(--line); border-radius: 18px; padding: 0; background: var(--dialog); color: var(--print); width: min(560px, calc(100vw - 24px)); max-height: 88vh; }
    .theme-dlg::backdrop { background: rgba(0,0,0,.6); }
    .theme-dlg form { display: grid; gap: 12px; padding: 16px 18px; }
    .theme-dlg h2 { margin: 0; font-family: var(--font-display); color: var(--gold); font-size: 1.5rem; }
    .theme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .theme-opt { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; align-items: center; text-align: left; padding: 10px; min-width: 0;
      border-radius: 14px; background: rgba(255,255,255,.04); color: var(--print); box-shadow: inset 0 0 0 1.5px transparent; font-weight: 600; }
    .theme-opt[aria-pressed="true"] { box-shadow: inset 0 0 0 2px var(--gold); background: rgba(255,255,255,.08); }
    .theme-opt .sw { grid-row: span 2; width: 42px; height: 42px; border-radius: 50%; }
    .theme-opt b { font-size: .9rem; } .theme-opt small { font-size: .7rem; font-weight: 400; opacity: .75; line-height: 1.2; }
    .theme-dlg .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    @media (max-width: 520px) { .theme-btn { width: 30px; height: 30px; font-size: .9rem; } }

    /* scenery layer: behind everything, never in the way of a tap */
    .theme-deco { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
    .theme-deco .d { position: absolute; display: block; height: auto; }
    .wrap { position: relative; z-index: 1; }
    :root[data-mode="dark"] .theme-deco { opacity: .55; filter: brightness(.75) saturate(.85); }
    :root[data-deco] .panel, :root[data-deco] .box { background: rgba(0,0,0,.45); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
    .theme-deco .sway { transform-origin: 50% 100%; animation: cr-sway 7s ease-in-out infinite alternate; }
    .theme-deco .sway-2 { transform-origin: 50% 100%; animation: cr-sway 9s ease-in-out -3s infinite alternate; }
    .theme-deco .sway-1 { transform-origin: 50% 0; animation: cr-swing 5s ease-in-out infinite alternate; }
    .theme-deco svg.sway-2[preserveAspectRatio^="xMidYMin"] { transform-origin: 50% 0; animation: cr-swing 6.5s ease-in-out -2s infinite alternate; }
    .theme-deco .sway-slow { animation: cr-bob 12s ease-in-out infinite alternate; }
    .theme-deco .float { animation: cr-bob 6s ease-in-out infinite alternate; }
    .theme-deco .float-2 { animation: cr-bob 8s ease-in-out -2s infinite alternate; }
    .theme-deco .drift { animation: cr-drift 26s linear infinite alternate; }
    .theme-deco .roll { animation: cr-roll 14s linear infinite; }
    .theme-deco .twinkle circle:nth-child(3n) { animation: cr-twinkle 3s ease-in-out infinite alternate; }
    .theme-deco .twinkle circle:nth-child(3n+1) { animation: cr-twinkle 4.5s ease-in-out -1s infinite alternate; }
    .theme-deco .glow { filter: drop-shadow(0 0 14px rgba(255,150,50,.65)); }
    .theme-deco .neon { filter: drop-shadow(0 0 6px currentColor) drop-shadow(0 0 3px #fff); color: #ff4fb4; }
    .theme-deco .flicker { animation: cr-flicker 5s steps(1) infinite; }
    .theme-deco .flicker-2 { animation: cr-flicker 7s steps(1) -2s infinite; }
    .theme-deco .blink { animation: cr-twinkle 1.2s steps(2) infinite; }
    .theme-deco .beam-a { transform-origin: 300px 600px; animation: cr-beam 9s ease-in-out infinite alternate; }
    .theme-deco .beam-b { transform-origin: 1140px 600px; animation: cr-beam 11s ease-in-out -4s infinite alternate-reverse; }
    .theme-deco .wave { animation: cr-wave 5s ease-in-out infinite alternate; }
    @keyframes cr-sway { from { rotate: -1.5deg; } to { rotate: 1.8deg; } }
    @keyframes cr-swing { from { rotate: -4deg; } to { rotate: 4deg; } }
    @keyframes cr-bob { from { translate: 0 -6px; } to { translate: 0 6px; } }
    @keyframes cr-drift { from { translate: -4vw 0; } to { translate: 6vw -2vh; } }
    @keyframes cr-roll { from { rotate: 0deg; translate: -10vw 0; } to { rotate: 720deg; translate: 10vw 0; } }
    @keyframes cr-twinkle { from { opacity: .15; } to { opacity: 1; } }
    @keyframes cr-flicker { 0%, 100% { opacity: 1; } 42% { opacity: .35; } 44% { opacity: 1; } 47% { opacity: .5; } 49% { opacity: 1; } }
    @keyframes cr-beam { from { rotate: -18deg; } to { rotate: 14deg; } }
    @keyframes cr-wave { from { translate: -20px 0; } to { translate: 20px 4px; } }
    @media (prefers-reduced-motion: reduce) { .theme-deco * { animation: none !important; } }
    @media (max-width: 720px) { .theme-deco { opacity: .8; } }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

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
    const dm = document.createElement("button");
    dm.type = "button"; dm.className = "theme-btn";
    const drawMode = () => {
      dm.textContent = mode === "dark" ? "☀" : "☾";
      dm.setAttribute("aria-label", mode === "dark" ? "Switch to light mode" : "Switch to dark mode");
      dm.title = mode === "dark" ? "Light mode" : "Dark mode";
    };
    dm.onclick = () => { mode = mode === "dark" ? "light" : "dark"; save(); apply(); drawMode(); drawGrid(); };
    drawMode();
    tools.append(pick, dm);
    bar.appendChild(tools);

    const dlg = document.createElement("dialog");
    dlg.className = "theme-dlg";
    dlg.setAttribute("aria-label", "Themes");
    dlg.innerHTML = `<form method="dialog"><div class="row"><h2>Themes</h2><span class="note"></span></div><div class="theme-grid"></div>
      <div class="row"><small class="note">Dark mode works with every theme: use the ☾ button.</small><button class="primary" value="close">Done</button></div></form>`;
    document.body.appendChild(dlg);
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
        b.onclick = () => { themeId = t.id; save(); apply(); drawGrid(); };
        grid.appendChild(b);
      }
    }
    pick.onclick = () => { drawGrid(); dlg.showModal(); };
  });
})();
