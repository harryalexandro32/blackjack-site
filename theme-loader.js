// The loading screen: the current theme's little animation while a page opens.
// theme.js marks the page as loading (and hides it) before anything paints; this file draws the loader over it,
// then fades it out once the page is ready: about a second on the first page you open, half that after.
// A tap skips it. Each loader is an SVG (viewBox 0 0 200 140) animated by the ld- keyframes below.
(function () {
  const card = (x, y, cls = "", style = "") => `<g class="${cls}" style="${style}"><rect x="${x}" y="${y}" width="30" height="42" rx="3.5" fill="#9b1c2c" stroke="#f4ecd8" stroke-width="2"/><rect x="${x + 4}" y="${y + 4}" width="22" height="34" rx="2" fill="none" stroke="#f4ecd8" stroke-width=".8" opacity=".7"/><path d="M${x + 15} ${y + 12} l5 9 l-5 9 l-5 -9Z" fill="#f4ecd8" opacity=".6"/></g>`;

  const LOADERS = {
    classic: { text: "Shuffling the deck…", font: "'Playfair Display', Georgia, serif", svg: () => {
      let s = "";
      for (let i = 0; i < 6; i++) s += card(46, 56 - i * 1.5, "ld-riffle-l", `--i:${i}`);
      for (let i = 0; i < 6; i++) s += card(124, 56 - i * 1.5, "ld-riffle-r", `--i:${i}`);
      return s;
    } },

    west: { text: "Saddling up…", font: "'Rye', serif", svg: () => `
      <g transform="translate(70 82) scale(1.15)">
        <g class="ld-twirl">
          <rect x="4" y="-23" width="64" height="8" rx="1.5" fill="#b9bcc0"/><rect x="4" y="-23" width="64" height="2.5" fill="#e4e6e8"/>
          <rect x="62" y="-26" width="4" height="3" fill="#8d9196"/>
          <rect x="-15" y="-27" width="24" height="17" rx="3" fill="#8d9196"/>
          <path d="M-11 -27 v17 M-4 -27 v17 M3 -27 v17" stroke="#5d6166" stroke-width="1.6"/>
          <path d="M-15 -24 l-9 -8 l4 -3 l9 8Z" fill="#5d6166"/>
          <path d="M-15 -12 C-19 -4 -25 14 -21 28 L-7 30 C-9 16 -5 4 0 -10Z" fill="#7a4a24"/><path d="M-17 2 L-9 4 M-18 12 L-9 14" stroke="#5a3415" stroke-width="1.5"/>
          <path d="M-5 -10 Q-6 7 7 5 Q12 -1 9 -10" fill="none" stroke="#5d6166" stroke-width="2.4"/><path d="M1 -10 q1 6 -2 9" stroke="#5d6166" stroke-width="2" fill="none"/>
        </g>
        <g class="ld-flash" transform="translate(74 -19)"><path d="M0 0 L14 -9 L10 -2 L24 0 L10 2 L14 9Z" fill="#ffd36b"/><circle r="5" fill="#fff4c2"/></g>
        <g class="ld-smoke" transform="translate(80 -22)"><circle r="6" fill="#e9dcc4"/><circle cx="8" cy="-4" r="5" fill="#e9dcc4"/><circle cx="3" cy="-9" r="4" fill="#e9dcc4"/></g>
      </g>` },

    ocean: { text: "Setting sail…", font: "'Pacifico', cursive", svg: () => `
      <g class="ld-bob"><g transform="translate(100 78)">
        <path d="M-34 0 L34 0 L22 16 L-22 16Z" fill="#f4ecd8"/><path d="M0 0 L0 -40 L26 -4Z" fill="#fff"/><path d="M-2 0 L-2 -34 L-22 -4Z" fill="#e9dcc4"/>
        <text x="9" y="-12" font-size="10" fill="#c0392b" font-family="serif">♥</text>
      </g></g>
      <g class="ld-wave"><path d="M-60 98 q15 -10 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V140 H-60Z" fill="#2c8fb0" opacity=".85"/></g>
      <g class="ld-wave2"><path d="M-60 108 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V140 H-60Z" fill="#0f5c73"/></g>` },

    pretty: { text: "Getting gorgeous…", font: "'Pacifico', cursive", svg: () => `
      <g transform="translate(100 72)"><path class="ld-beat" d="M0 26 C-34 4 -40 -14 -30 -24 C-20 -34 -6 -28 0 -16 C6 -28 20 -34 30 -24 C40 -14 34 4 0 26Z" fill="#ff7ab0" stroke="#fff" stroke-width="3"/></g>
      ${[[52, 40, 0], [150, 36, .4], [60, 108, .8], [146, 104, 1.2], [100, 22, 1.6]].map(([x, y, d]) => `<path class="ld-twinkle" style="animation-delay:${d}s;transform-origin:${x}px ${y}px" d="M${x} ${y - 9} L${x + 2.5} ${y - 2.5} L${x + 9} ${y} L${x + 2.5} ${y + 2.5} L${x} ${y + 9} L${x - 2.5} ${y + 2.5} L${x - 9} ${y} L${x - 2.5} ${y - 2.5}Z" fill="#fff1f7"/>`).join("")}` },

    vegas: { text: "Spinning up…", font: "'Limelight', serif", svg: () => {
      const sym = ["7", "♠", "♥", "♦", "♣", "7"], col = { "7": "#ffd36b", "♠": "#fdf2ff", "♣": "#fdf2ff", "♥": "#ff4fb4", "♦": "#ff4fb4" };
      const reel = (x, k) => `<g clip-path="url(#ldwin)"><g class="ld-reel" style="animation-duration:${1.4 + k * 0.35}s">${[...sym, ...sym].map((s, i) => `<text x="${x}" y="${84 + i * 34 - 6 * 34}" font-size="28" text-anchor="middle" fill="${col[s]}" font-family="Limelight, serif">${s}</text>`).join("")}</g></g>`;
      return `<defs><clipPath id="ldwin"><rect x="40" y="48" width="120" height="48" rx="6"/></clipPath></defs>
        <rect x="32" y="40" width="136" height="64" rx="12" fill="#10051a" stroke="#ff4fb4" stroke-width="3" class="ld-neon"/>
        <rect x="40" y="48" width="120" height="48" rx="6" fill="#fdf2ff" opacity=".08"/>
        ${reel(66, 0)}${reel(100, 1)}${reel(134, 2)}
        <path d="M80 48 v48 M120 48 v48" stroke="#ff4fb4" stroke-width="1.5" opacity=".6"/>
        <path d="M168 58 h10 v-22" stroke="#c9c9d6" stroke-width="4" fill="none"/><circle cx="178" cy="32" r="7" fill="#ff4fb4" class="ld-neon"/>`;
    } },

    future: { text: "Booting the table…", font: "'Orbitron', sans-serif", svg: () => `
      <circle cx="100" cy="70" r="52" fill="none" stroke="#79e3ff" stroke-width="2" stroke-dasharray="6 10" class="ld-spin" style="transform-origin:100px 70px" opacity=".7"/>
      <circle cx="100" cy="70" r="44" fill="none" stroke="#79e3ff" stroke-width="1" opacity=".3"/>
      <g class="ld-flipcard" style="transform-origin:100px 70px">
        <rect x="82" y="46" width="36" height="50" rx="4" fill="rgba(121,227,255,.12)" stroke="#79e3ff" stroke-width="2"/>
        <text x="100" y="80" text-anchor="middle" font-size="26" fill="#79e3ff">♠</text>
      </g>
      <rect x="70" y="40" width="60" height="2" fill="#79e3ff" opacity=".6" class="ld-scan"/>` },

    aurora: { text: "Waiting for the lights…", font: "'Josefin Sans', sans-serif", svg: () => `
      <defs><linearGradient id="ldau" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dffb3" stop-opacity="0"/><stop offset=".5" stop-color="#7dffb3" stop-opacity=".7"/><stop offset="1" stop-color="#a77dff" stop-opacity="0"/></linearGradient></defs>
      ${[[0, 30, ".9", "4s"], [20, 46, ".6", "5.5s"], [-10, 60, ".45", "7s"]].map(([dx, y, o, dur]) => `<g class="ld-sway" style="animation-duration:${dur}"><path d="M${-40 + dx} ${y} q30 -24 60 0 t60 0 t60 0 t60 0 t60 0 v40 q-30 -24 -60 0 t-60 0 t-60 0 t-60 0 t-60 0Z" fill="url(#ldau)" opacity="${o}"/></g>`).join("")}
      ${[[30, 20], [70, 12], [150, 18], [180, 34], [12, 50], [120, 8]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#fff" class="ld-twinkle" style="animation-delay:${i * 0.3}s;transform-origin:${x}px ${y}px"/>`).join("")}
      <path d="M0 140 L30 112 L52 126 L84 100 L118 124 L150 104 L200 132 V140Z" fill="#071a24"/>` },

    lantern: { text: "Lighting the lanterns…", font: "'Cinzel', serif", svg: () => {
      const lan = (x, s, dur, delay, o) => `<g class="ld-rise" style="animation-duration:${dur}s;animation-delay:${delay}s;opacity:${o}"><g transform="translate(${x} 140) scale(${s})">
        <circle cx="0" cy="-10" r="26" fill="#ff8a2e" opacity=".25" class="ld-flicker"/>
        <path d="M-14 -30 Q-18 -10 -10 6 L10 6 Q18 -10 14 -30 Q0 -36 -14 -30Z" fill="#e8402a"/><path d="M-14 -30 Q0 -36 14 -30" stroke="#ffcf6b" stroke-width="2" fill="none"/>
        <path d="M-8 -26 Q-10 -10 -5 4 M8 -26 Q10 -10 5 4" stroke="#b8261a" stroke-width="1.4" fill="none"/>
        <ellipse cx="0" cy="-8" rx="6" ry="10" fill="#ffd36b" opacity=".75" class="ld-flicker"/><rect x="-9" y="5" width="18" height="3" fill="#c8962e"/>
      </g></g>`;
      return lan(150, .5, 5, -2.5, .55) + lan(44, .6, 5.6, -1, .7) + lan(100, 1, 4.2, 0, 1);
    } },

    emperor: { text: "Waiting for the blossoms…", font: "'Shippori Mincho', serif", svg: () => `
      <g transform="translate(100 66)"><g class="ld-slowspin">
        ${[0, 72, 144, 216, 288].map((a, i) => `<g transform="rotate(${a})"><path class="ld-bloom" style="animation-delay:${i * 0.12}s" d="M0 0 C-14 -14 -14 -32 -5 -38 L0 -32 L5 -38 C14 -32 14 -14 0 0Z" fill="#ffc4d4" stroke="#ff9ab5" stroke-width="1"/></g>`).join("")}
        <circle r="6" fill="#ff7aa0"/>${[0, 72, 144, 216, 288].map(a => `<circle cx="0" cy="-10" r="1.6" fill="#ffd36b" transform="rotate(${a + 36})"/>`).join("")}
      </g></g>
      ${[[40, 0], [150, 1.2], [80, 2.1], [170, 2.8]].map(([x, d]) => `<path class="ld-petal" style="animation-delay:${d}s" d="M${x} 0 c-4 -4 -4 -9 -1 -11 l1 2 l1 -2 c3 2 3 7 -1 11Z" fill="#ffc4d4"/>`).join("")}` },

    pirate: { text: "Charting the course…", font: "'Pirata One', serif", svg: () => `
      <path d="M24 22 L176 16 L182 120 L20 126Z" fill="#e9d3a4" stroke="#b08a52" stroke-width="2"/>
      <path d="M24 22 L176 16 L182 120 L20 126Z" fill="none" stroke="#c9a86a" stroke-width="6" opacity=".35"/>
      <path d="M52 96 q10 -20 30 -18 q16 2 18 -16 q4 -22 26 -18 q18 4 22 -14" fill="none" stroke="#7a1d1d" stroke-width="2.6" stroke-dasharray="5 5" mask="url(#ldtrail)"/>
      <defs><mask id="ldtrail"><path class="ld-draw" d="M52 96 q10 -20 30 -18 q16 2 18 -16 q4 -22 26 -18 q18 4 22 -14" fill="none" stroke="#fff" stroke-width="6" pathLength="100"/></mask></defs>
      <g class="ld-xmark" style="transform-origin:148px 30px"><path d="M141 23 l14 14 M155 23 l-14 14" stroke="#c0392b" stroke-width="4" stroke-linecap="round"/></g>
      <circle cx="50" cy="97" r="3.5" fill="#7a1d1d"/>
      <g transform="translate(46 44)" class="ld-wobble"><circle r="13" fill="none" stroke="#7a5a2b" stroke-width="1.5"/><path d="M0 -12 L3 0 L0 12 L-3 0Z" fill="#7a5a2b"/><path d="M-12 0 L0 -3 L12 0 L0 3Z" fill="#b08a52"/></g>` },

    jazz: { text: "Warming up the band…", font: "'Poiret One', sans-serif", svg: () => {
      let k = "";
      for (let i = 0; i < 10; i++) k += `<rect class="ld-key" style="animation-delay:${i * 0.09}s" x="${30 + i * 14}" y="70" width="13" height="50" rx="1.5" fill="#f4efe4"/>`;
      for (let i = 0; i < 9; i++) if ([0, 1, 3, 4, 5, 7, 8].includes(i)) k += `<rect x="${30 + i * 14 + 9}" y="70" width="9" height="30" rx="1" fill="#141218"/>`;
      const notes = [[50, 0], [100, .9], [150, 1.8]].map(([x, d]) => `<path class="ld-noteup" style="animation-delay:${d}s" d="M${x} 58 a5 4 -20 1 1 0 -1 V34 l12 -3 V52 a5 4 -20 1 1 0 -1 V38 l-11 3Z" fill="#d9a441"/>`).join("");
      return `<rect x="26" y="66" width="148" height="58" rx="4" fill="#120d0a"/>${k}${notes}`;
    } },

    forest: { text: "Following the fireflies…", font: "'Uncial Antiqua', serif", svg: () => `
      <ellipse cx="100" cy="118" rx="60" ry="8" fill="#0c160d"/>
      <g class="ld-glowpulse"><circle cx="100" cy="84" r="40" fill="#b6ff7a" opacity=".12"/></g>
      <rect x="93" y="84" width="14" height="34" rx="6" fill="#efe6cf"/>
      <path d="M70 88 Q100 44 130 88Z" fill="#c6f05a" class="ld-glowpulse"/><circle cx="88" cy="76" r="4" fill="#f5ffdf"/><circle cx="108" cy="70" r="3" fill="#f5ffdf"/><circle cx="116" cy="82" r="2.5" fill="#f5ffdf"/>
      ${[[38, 3.2, 0], [52, 4.4, -1.5], [30, 5.6, -3], [46, 3.8, -2.2]].map(([r, dur, d]) => `<g class="ld-orbit" style="animation-duration:${dur}s;animation-delay:${d}s;transform-origin:100px 80px"><circle cx="${100 + r}" cy="80" r="2.6" fill="#f5e07a"/><circle cx="${100 + r}" cy="80" r="7" fill="#f5e07a" opacity=".25"/></g>`).join("")}` }
  };

  // Garage: a rev counter; the needle kicks up, holds, drops back, with exhaust puffs
  LOADERS.garage = { text: "Revving the engine…", font: "'Racing Sans One', sans-serif", svg: () => `
      <path d="M40 110 A60 60 0 1 1 160 110" fill="none" stroke="#2b2c30" stroke-width="16" stroke-linecap="round"/>
      <path d="M40 110 A60 60 0 0 1 136 62" fill="none" stroke="#c9ccd2" stroke-width="4"/>
      <path d="M136 62 A60 60 0 0 1 160 110" fill="none" stroke="#ff3b2b" stroke-width="5"/>
      ${Array.from({ length: 7 }, (_, i) => `<path d="M100 50 V58" stroke="#f3f2ee" stroke-width="3" transform="rotate(${-90 + i * 30} 100 110)"/>`).join("")}
      <g class="ld-rev" style="transform-origin:100px 110px"><path d="M100 110 L100 58" stroke="#ff6a1f" stroke-width="4" stroke-linecap="round"/></g>
      <circle cx="100" cy="110" r="8" fill="#c9ccd2"/>
      <g class="ld-puff" style="animation-delay:0s"><circle cx="30" cy="124" r="6" fill="#9aa0a8"/></g>
      <g class="ld-puff" style="animation-delay:.35s"><circle cx="26" cy="128" r="5" fill="#b7babf"/></g>` };
  // Space Fight: a starfighter holding still while the stars streak past
  LOADERS.space = { text: "Engaging thrusters…", font: "'Audiowide', sans-serif", svg: () => {
    let s = "";
    for (let i = 0; i < 14; i++) s += `<rect class="ld-streak" style="animation-delay:${(-i * 0.13).toFixed(2)}s" x="${200 + (i * 37) % 60}" y="${10 + (i * 53) % 120}" width="${18 + (i % 4) * 8}" height="1.6" fill="#fff"/>`;
    return s + `<g transform="translate(36 30)"><path d="M8 40 L118 31 L156 40 L118 49Z" fill="#d5dbe8"/><path d="M58 34 L88 4 L102 6 L84 34Z M58 46 L88 76 L102 74 L84 46Z" fill="#8f9bb6"/>
      <path d="M98 36 L122 38 L122 42 L98 44 Q92 40 98 36Z" fill="#2a3a5c"/><g class="ld-glowpulse"><circle cx="6" cy="40" r="9" fill="#7fd0ff"/><circle cx="-2" cy="40" r="14" fill="#7fd0ff" opacity=".3"/></g></g>`;
  } };
  // Feeling Deezy?: a lava lamp, blobs drifting up and down
  LOADERS.deezy = { text: "Drifting off…", font: "'Shrikhand', cursive", svg: () => `
      <defs><clipPath id="ldlamp"><path d="M86 30 L114 30 L126 112 L74 112Z"/></clipPath></defs>
      <path d="M90 14 L110 14 L114 30 L86 30Z" fill="#c9ccd8"/><path d="M86 30 L114 30 L126 112 L74 112Z" fill="#8a5fd0"/>
      <g clip-path="url(#ldlamp)"><ellipse class="ld-lava" cx="100" cy="100" rx="11" ry="13" fill="#ff7ac8"/><ellipse class="ld-lava" style="animation-delay:-1.6s" cx="94" cy="96" rx="8" ry="10" fill="#ff9ad5"/><ellipse class="ld-lava" style="animation-delay:-.8s" cx="108" cy="104" rx="7" ry="8" fill="#ff7ac8"/><ellipse cx="100" cy="114" rx="30" ry="9" fill="#ff7ac8"/></g>
      <path d="M74 112 L126 112 L132 132 L68 132Z" fill="#c9ccd8"/>
      <circle class="ld-twinkle" cx="50" cy="40" r="4" fill="#9ff3e0"/><circle class="ld-twinkle" style="animation-delay:-.7s" cx="150" cy="56" r="3" fill="#ffe39a"/><circle class="ld-twinkle" style="animation-delay:-1.3s" cx="40" cy="96" r="3" fill="#ff9ad5"/>` };

  const LOADER_CSS = `
  .ld-riffle-l { animation: ld-riffle-l 2.4s ease-in-out infinite; animation-delay: calc(var(--i) * 0.11s); }
  .ld-riffle-r { animation: ld-riffle-r 2.4s ease-in-out infinite; animation-delay: calc(var(--i) * 0.11s + 0.055s); }
  @keyframes ld-riffle-l { 0%, 12% { transform: translate(0, 0) rotate(0); } 30% { transform: translate(4px, -6px) rotate(-8deg); } 55%, 75% { transform: translate(39px, calc(var(--i) * -1.5px)) rotate(0); } 100% { transform: translate(0, 0); } }
  @keyframes ld-riffle-r { 0%, 12% { transform: translate(0, 0) rotate(0); } 30% { transform: translate(-4px, -6px) rotate(8deg); } 55%, 75% { transform: translate(-39px, calc(var(--i) * -1.5px - 1px)) rotate(0); } 100% { transform: translate(0, 0); } }
  .ld-twirl { animation: ld-twirl 2.6s cubic-bezier(.45,.05,.3,1) infinite; }
  @keyframes ld-twirl { 0% { transform: rotate(0); } 55% { transform: rotate(-1080deg); } 100% { transform: rotate(-1080deg); } }
  .ld-flash { opacity: 0; animation: ld-flash 2.6s infinite; }
  @keyframes ld-flash { 0%, 60% { opacity: 0; transform: translate(74px, -19px) scale(.3); } 63% { opacity: 1; transform: translate(74px, -19px) scale(1.15); } 72%, 100% { opacity: 0; transform: translate(74px, -19px) scale(1.4); } }
  .ld-smoke { opacity: 0; animation: ld-smoke 2.6s infinite; }
  @keyframes ld-smoke { 0%, 62% { opacity: 0; transform: translate(80px, -22px) scale(.5); } 70% { opacity: .8; } 100% { opacity: 0; transform: translate(98px, -40px) scale(1.6); } }
  .ld-bob { animation: ld-bob 2.8s ease-in-out infinite; transform-origin: 100px 90px; }
  @keyframes ld-bob { 0%, 100% { transform: translateY(0) rotate(-5deg); } 50% { transform: translateY(5px) rotate(5deg); } }
  .ld-wave { animation: ld-wave 3s linear infinite; } .ld-wave2 { animation: ld-wave 2.2s linear infinite reverse; }
  @keyframes ld-wave { to { transform: translateX(60px); } }
  .ld-beat { animation: ld-beat 1.1s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes ld-beat { 0%, 40%, 100% { transform: scale(1); } 15% { transform: scale(1.14); } 28% { transform: scale(1.05); } }
  .ld-twinkle { animation: ld-twinkle 2s ease-in-out infinite; }
  @keyframes ld-twinkle { 0%, 100% { opacity: .15; transform: scale(.5); } 50% { opacity: 1; transform: scale(1.1); } }
  .ld-reel { animation: ld-reel 1.6s cubic-bezier(.2,.6,.3,1) infinite; }
  @keyframes ld-reel { 0% { transform: translateY(0); } 70%, 100% { transform: translateY(204px); } }
  .ld-neon { animation: ld-neon 1.6s ease-in-out infinite; }
  @keyframes ld-neon { 50% { opacity: .55; } }
  .ld-spin { animation: ld-spin 6s linear infinite; } @keyframes ld-spin { to { transform: rotate(360deg); } }
  .ld-flipcard { animation: ld-flip 2s ease-in-out infinite; }
  @keyframes ld-flip { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(-1); } }
  .ld-scan { animation: ld-scan 2s ease-in-out infinite; } @keyframes ld-scan { 0%, 100% { transform: translateY(0); opacity: 0; } 20%, 80% { opacity: .7; } 50% { transform: translateY(60px); } }
  .ld-sway { animation: ld-sway 5s ease-in-out infinite alternate; } @keyframes ld-sway { to { transform: translateX(-30px) translateY(4px); } }
  .ld-rise { animation: ld-rise 4.4s linear infinite; } @keyframes ld-rise { 0% { transform: translate(0, 10px); } 50% { transform: translate(6px, -60px); } 100% { transform: translate(-4px, -150px); } }
  .ld-flicker { animation: ld-flicker .9s ease-in-out infinite alternate; } @keyframes ld-flicker { to { opacity: .45; } }
  .ld-slowspin { animation: ld-spin 9s linear infinite; }
  .ld-bloom { animation: ld-bloom 3.2s ease-in-out infinite; transform-origin: 0 0; } @keyframes ld-bloom { 0% { transform: scale(0); } 30%, 80% { transform: scale(1); } 100% { transform: scale(0); } }
  .ld-petal { animation: ld-petal 3.6s linear infinite; opacity: 0; } @keyframes ld-petal { 0% { transform: translate(0, 0) rotate(0); opacity: 0; } 15% { opacity: .9; } 100% { transform: translate(-20px, 150px) rotate(220deg); opacity: 0; } }
  .ld-draw { stroke-dasharray: 100; animation: ld-draw 3s ease-in-out infinite; } @keyframes ld-draw { 0% { stroke-dashoffset: 100; } 65%, 100% { stroke-dashoffset: 0; } }
  .ld-xmark { animation: ld-x 3s ease-in-out infinite; } @keyframes ld-x { 0%, 62% { transform: scale(0); } 72% { transform: scale(1.3); } 80%, 100% { transform: scale(1); } }
  .ld-wobble { animation: ld-wobble 3s ease-in-out infinite; } @keyframes ld-wobble { 0%, 100% { transform: translate(46px, 44px) rotate(-14deg); } 50% { transform: translate(46px, 44px) rotate(18deg); } }
  .ld-key { animation: ld-key 1.8s ease-in-out infinite; } @keyframes ld-key { 0%, 20%, 100% { fill: #f4efe4; transform: translateY(0); } 8% { fill: #d9a441; transform: translateY(2px); } }
  .ld-noteup { animation: ld-noteup 2.7s ease-out infinite; opacity: 0; } @keyframes ld-noteup { 0% { transform: translateY(10px); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(8px, -30px); opacity: 0; } }
  .ld-glowpulse { animation: ld-glow 2.4s ease-in-out infinite; } @keyframes ld-glow { 50% { opacity: .7; } }
  .ld-orbit { animation: ld-spin 4s linear infinite; }
  .ld-rev { animation: ld-rev 1.8s cubic-bezier(.3,1.4,.5,1) infinite; } @keyframes ld-rev { 0% { transform: rotate(-88deg); } 35%, 55% { transform: rotate(80deg); } 60% { transform: rotate(66deg); } 65% { transform: rotate(80deg); } 100% { transform: rotate(-88deg); } }
  .ld-puff { animation: ld-puff 1.8s ease-out infinite; opacity: 0; } @keyframes ld-puff { 0%, 30% { opacity: 0; transform: translate(0, 0) scale(.5); } 45% { opacity: .9; } 100% { opacity: 0; transform: translate(-24px, -10px) scale(2); } }
  .ld-streak { animation: ld-streak .9s linear infinite; } @keyframes ld-streak { from { transform: translateX(0); } to { transform: translateX(-260px); } }
  .ld-lava { animation: ld-lava 3.2s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; } @keyframes ld-lava { from { transform: translateY(0) scale(1, 1); } to { transform: translateY(-58px) scale(1.15, .85); } }
  @media (prefers-reduced-motion: reduce) { [class^="ld-"], [class*=" ld-"] { animation-duration: 0s !important; animation-iteration-count: 1 !important; } }
  `;

  window.CR_LOADERS = LOADERS;
  const root = document.documentElement;
  if (!root.classList.contains("cr-loading")) return;
  const id = root.dataset.themeName || "classic", L = LOADERS[id] || LOADERS.classic;
  const style = document.createElement("style");
  style.textContent = LOADER_CSS + `
    .cr-loader { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; cursor: pointer;
      background: radial-gradient(120% 90% at 50% 30%, var(--felt, #0e4a37), var(--felt-deep, #08301f)); transition: opacity .35s ease; }
    .cr-loader.out { opacity: 0; pointer-events: none; }
    .cr-loader .in { display: grid; justify-items: center; gap: 8px; width: min(340px, 72vw); }
    .cr-loader svg { width: 100%; height: auto; }
    .cr-loader .say { font-family: ${L.font}; color: var(--gold, #d4ad55); font-size: clamp(1.1rem, 3.6vw, 1.5rem); text-align: center; }`;
  document.head.appendChild(style);
  const el = document.createElement("div");
  el.className = "cr-loader"; el.setAttribute("role", "status"); el.setAttribute("aria-label", "Loading");
  el.innerHTML = `<div class="in"><svg viewBox="0 0 200 140" aria-hidden="true">${L.svg()}</svg><div class="say">${L.text}</div></div>`;
  root.appendChild(el);
  let seen = false;
  try { seen = sessionStorage.getItem("cr-loader-seen") === "1"; sessionStorage.setItem("cr-loader-seen", "1"); } catch {}
  const minMs = seen ? 500 : 1000;
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    root.classList.remove("cr-loading");
    el.classList.add("out");
    setTimeout(() => el.remove(), 400);
  };
  const whenReady = () => setTimeout(finish, Math.max(0, minMs - performance.now()));
  if (document.readyState === "complete") whenReady(); else addEventListener("load", whenReady);
  el.addEventListener("click", finish);
  setTimeout(finish, 3000);                          // never hold the page longer than this
})();
