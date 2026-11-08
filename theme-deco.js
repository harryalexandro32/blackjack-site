// Background scenery for each theme, drawn as SVG and placed around the edges of the page behind everything.
// theme.js calls window.CR_DECO[themeId]() and puts the result in a fixed layer that ignores taps.
(function () {
  const svg = (box, style, body, extra = "") => `<svg class="d ${extra}" viewBox="${box}" style="${style}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${body}</svg>`;
  const band = (box, style, body, extra = "") => `<svg class="d ${extra}" viewBox="${box}" style="${style}" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`;
  // a seeded random so scenes look the same every time
  const rnd = seed => () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

  // ---------- Cards by the Ocean: sun, sea, beach, palm trees, gulls ----------
  const palm = (flip) => `<g ${flip ? 'transform="translate(200 0) scale(-1 1)"' : ""}>
    <path d="M100 400 C96 330 90 262 106 196 C111 172 115 152 118 136" stroke="#5c3f22" stroke-width="15" fill="none" stroke-linecap="round"/>
    ${[380, 350, 320, 290, 262, 236, 212, 190, 170].map(y => `<path d="M${92 + (400 - y) * 0.06} ${y} q8 -3 16 0" stroke="#3e2a16" stroke-width="2.5" fill="none"/>`).join("")}
    <g fill="#1d6b4c">
      <path d="M118 135 C150 108 186 114 202 142 C176 128 150 128 118 141Z"/><path d="M118 135 C84 104 44 108 18 136 C50 122 86 125 118 142Z"/>
      <path d="M118 135 C100 94 70 74 38 70 C70 88 95 106 113 140Z"/><path d="M118 135 C131 94 162 74 192 78 C162 92 141 110 123 140Z"/>
      <path d="M117 138 C93 141 70 162 60 194 C80 171 100 156 120 146Z"/><path d="M120 138 C146 146 166 166 172 198 C155 173 138 158 118 146Z"/>
    </g>
    <g fill="#2a8a62" opacity=".7"><path d="M118 135 C150 112 180 118 196 138 C172 128 150 130 118 139Z"/><path d="M118 135 C100 98 74 80 46 76 C74 92 96 108 114 138Z"/></g>
    <circle cx="113" cy="143" r="6.5" fill="#6b4a26"/><circle cx="124" cy="146" r="6.5" fill="#5a3d1f"/><circle cx="118" cy="153" r="6.5" fill="#6b4a26"/></g>`;
  const ocean = () => `
    ${svg("0 0 200 200", "right:6vw;top:9vh;width:clamp(72px,11.2vw,152px)", `<circle cx="100" cy="100" r="60" fill="#ffd27a"/><circle cx="100" cy="100" r="92" fill="#ffd27a" opacity=".18"/>`, "sway-slow")}
    ${svg("0 0 300 60", "left:14vw;top:16vh;width:clamp(72px,9.6vw,136px)", `<g stroke="#f4fbff" stroke-width="3" fill="none" stroke-linecap="round"><path d="M10 30 q14 -14 28 0 q14 -14 28 0"/><path d="M120 18 q10 -10 20 0 q10 -10 20 0"/><path d="M210 40 q12 -12 24 0 q12 -12 24 0"/></g>`, "drift")}
    ${band("0 0 1440 240", "left:0;bottom:0;width:100%;height:clamp(88px,17.6vh,184px)", `
      <path d="M0 70 C160 50 320 90 480 70 C640 50 800 90 960 70 C1120 50 1280 90 1440 70 L1440 160 L0 160Z" fill="#1f8fa8" opacity=".85"/>
      <path class="wave" d="M0 92 C120 76 240 108 360 92 C480 76 600 108 720 92 C840 76 960 108 1080 92 C1200 76 1320 108 1440 92 L1440 170 L0 170Z" fill="#3fb6c9" opacity=".7"/>
      <path d="M0 150 C220 128 420 160 640 142 C880 122 1100 156 1440 136 L1440 240 L0 240Z" fill="#f0d49a"/>
      <path d="M0 150 C220 128 420 160 640 142 C880 122 1100 156 1440 136" stroke="#ffffff" stroke-width="6" fill="none" opacity=".75"/>
      <path d="M0 190 C300 175 700 200 1000 185 C1200 176 1340 190 1440 182 L1440 240 L0 240Z" fill="#e2c084"/>
      <g fill="#c9a36a" opacity=".7"><circle cx="200" cy="205" r="3"/><circle cx="520" cy="215" r="2.5"/><circle cx="910" cy="200" r="3"/><circle cx="1230" cy="212" r="2.5"/></g>
      <g transform="translate(330 168)"><path d="M0 0 L14 -10 L28 0 L22 12 L6 12Z" fill="#ff8a65"/></g>`)}
    ${svg("0 0 200 400", "left:-1vw;bottom:2vh;height:clamp(160px,41.6vh,416px)", palm(false), "sway")}
    ${svg("0 0 200 400", "right:-1vw;bottom:1vh;height:clamp(136px,33.6vh,344px)", palm(true), "sway-2")}`;

  // ---------- Feeling Pretty: bows, candies, lollipops, hearts ----------
  const bow = c => `<path d="M80 50 C50 12 8 18 14 50 C8 82 50 88 80 50Z" fill="${c}"/><path d="M80 50 C110 12 152 18 146 50 C152 82 110 88 80 50Z" fill="${c}"/>
    <path d="M80 50 C58 30 30 32 32 50" stroke="#fff" stroke-opacity=".35" stroke-width="4" fill="none"/><path d="M76 56 L56 100 L68 94 L76 104Z" fill="${c}"/><path d="M84 56 L104 100 L92 94 L84 104Z" fill="${c}"/>
    <ellipse cx="80" cy="50" rx="13" ry="15" fill="${c}" stroke="#fff" stroke-opacity=".45" stroke-width="3"/>`;
  const candy = (c1, c2) => `<path d="M8 8 L36 30 L8 52 Q2 30 8 8Z" fill="${c1}"/><path d="M112 8 L84 30 L112 52 Q118 30 112 8Z" fill="${c1}"/>
    <ellipse cx="60" cy="30" rx="28" ry="21" fill="${c1}"/><g clip-path="none" stroke="${c2}" stroke-width="6" opacity=".85"><path d="M42 14 L62 48"/><path d="M58 10 L78 46"/></g>
    <ellipse cx="52" cy="22" rx="8" ry="4" fill="#fff" opacity=".5"/>`;
  const lolly = c => `<rect x="37" y="72" width="6" height="90" rx="3" fill="#fff"/><circle cx="40" cy="40" r="36" fill="${c}"/>
    <path d="M40 40 m0 -4 a4 4 0 1 1 -4 4 a8 8 0 1 1 8 8 a12 12 0 1 1 -12 -12 a16 16 0 1 1 16 16 a20 20 0 1 1 -20 -20 a24 24 0 1 1 24 24" stroke="#fff" stroke-width="5" fill="none" opacity=".9"/>`;
  const heart = c => `<path d="M20 36 C4 24 0 12 8 5 C14 0 20 4 20 10 C20 4 26 0 32 5 C40 12 36 24 20 36Z" fill="${c}"/>`;
  const pretty = () => {
    const r = rnd(7), bits = [];
    const spots = [[4, 30], [10, 62], [3, 82], [90, 34], [94, 60], [88, 84], [16, 46], [84, 48]];
    spots.forEach(([x, y], i) => {
      const rot = Math.round(r() * 60 - 30), size = 38 + r() * 28;
      const kind = i % 3;
      if (kind === 0) bits.push(svg("0 0 120 60", `left:${x}vw;top:${y}vh;width:clamp(56px,${size / 10}vw,${size + 50}px);transform:rotate(${rot}deg)`, candy(["#ff6fae", "#ffd166", "#9be7ff"][i % 3], "#fff"), "float"));
      else if (kind === 1) bits.push(svg("0 0 80 165", `left:${x}vw;top:${y}vh;height:clamp(80px,${size / 6}vh,170px);transform:rotate(${rot}deg)`, lolly(["#ff4f9a", "#b06cff", "#ff8fb8"][i % 3]), "float-2"));
      else bits.push(svg("0 0 40 40", `left:${x}vw;top:${y}vh;width:clamp(17.6px,2.1vw,32px);transform:rotate(${rot}deg)`, heart(["#ff9fcb", "#fff0f7", "#ff6fae"][i % 3]), "float"));
    });
    return `${svg("0 0 160 105", "left:1vw;top:9vh;width:clamp(72px,8.8vw,136px);transform:rotate(-12deg)", bow("#ff4f9a"), "sway")}
      ${svg("0 0 160 105", "right:1vw;top:9vh;width:clamp(72px,8.8vw,136px);transform:rotate(12deg)", bow("#ff4f9a"), "sway-2")}
      ${band("0 0 1440 60", "left:0;top:calc(var(--bar-h, 64px) - 6px);width:100%;height:46px", `<path d="M0 10 Q120 50 240 10 Q360 50 480 10 Q600 50 720 10 Q840 50 960 10 Q1080 50 1200 10 Q1320 50 1440 10" stroke="#ffb6d5" stroke-width="8" fill="none" opacity=".9"/>
        ${[240, 480, 720, 960, 1200].map(x => `<circle cx="${x}" cy="12" r="9" fill="#ff4f9a"/>`).join("")}`)}
      ${bits.join("")}`;
  };

  // ---------- Wild West: setting sun, mesas, cacti, vultures ----------
  const cactus = c => `<g fill="${c}"><rect x="45" y="20" width="30" height="240" rx="15"/>
    <path d="M45 150 L24 150 Q12 150 12 138 L12 84 Q12 72 24 72 Q36 72 36 84 L36 128 L45 128Z"/><path d="M75 116 L96 116 Q108 116 108 104 L108 48 Q108 36 96 36 Q84 36 84 48 L84 94 L75 94Z"/></g>
    <g stroke="#000" stroke-opacity=".18" stroke-width="2"><path d="M55 30 V255 M65 30 V255"/></g>`;
  const west = () => `
    ${svg("0 0 400 400", "right:2vw;top:10vh;width:clamp(88px,12vw,192px)", `<circle cx="200" cy="200" r="130" fill="#ffb347" opacity=".95"/><circle cx="200" cy="200" r="190" fill="#ff8c3a" opacity=".22"/><g stroke="#c2632a" stroke-width="6" opacity=".35"><line x1="90" y1="230" x2="310" y2="230"/><line x1="110" y1="262" x2="290" y2="262"/><line x1="140" y1="292" x2="260" y2="292"/></g>`)}
    ${svg("0 0 300 70", "left:18vw;top:18vh;width:clamp(80px,11.2vw,160px)", `<g stroke="#2a170a" stroke-width="4" fill="none" stroke-linecap="round"><path d="M10 40 q18 -20 36 0 q18 -20 36 0"/><path d="M170 20 q14 -16 28 0 q14 -16 28 0"/></g>`, "drift")}
    ${band("0 0 1440 260", "left:0;bottom:0;width:100%;height:clamp(88px,19.2vh,200px)", `
      <path d="M0 260 L0 150 L90 150 L110 110 L300 110 L330 150 L470 150 L500 120 L560 120 L590 150 L820 150 L850 90 L1060 90 L1090 150 L1250 150 L1270 125 L1360 125 L1380 150 L1440 150 L1440 260Z" fill="#7a3f1c" opacity=".75"/>
      <path d="M0 260 L0 190 L200 190 L230 160 L420 160 L450 190 L700 190 L730 170 L800 170 L830 190 L1100 190 L1130 165 L1330 165 L1360 190 L1440 190 L1440 260Z" fill="#4a2510"/>
      <path d="M0 230 C300 215 600 240 900 225 C1150 213 1300 232 1440 222 L1440 260 L0 260Z" fill="#2e1709"/>`)}
    ${svg("0 0 120 260", "left:3vw;bottom:3vh;height:clamp(120px,30.4vh,304px)", cactus("#2f4a22"), "")}
    ${svg("0 0 120 260", "right:5vw;bottom:2vh;height:clamp(88px,22.4vh,224px)", cactus("#3a5a29"), "")}
    ${svg("0 0 60 60", "right:22vw;bottom:5vh;width:clamp(24px,3.2vw,48px)", `<g stroke="#a8743d" stroke-width="2.5" fill="none" opacity=".9"><circle cx="30" cy="30" r="24"/><path d="M10 22 Q30 40 50 20 M12 40 Q30 18 48 42 M22 8 Q34 30 24 54 M40 8 Q24 30 38 54"/></g>`, "roll")}`;

  // ---------- Vegas: skyline with lit windows, neon signs, searchlights ----------
  const vegas = () => {
    const r = rnd(11), b = [], w = [];
    let x = 0;
    while (x < 1440) {
      const bw = 40 + Math.floor(r() * 70), bh = 70 + Math.floor(r() * 170);
      b.push(`<rect x="${x}" y="${300 - bh}" width="${bw - 4}" height="${bh}" fill="#0c0414"/>`);
      for (let wy = 300 - bh + 10; wy < 290; wy += 14) for (let wx = x + 6; wx < x + bw - 12; wx += 11)
        if (r() < 0.38) w.push(`<rect x="${wx}" y="${wy}" width="5" height="7" fill="${["#ffd65a", "#ff4fb4", "#5adcff", "#ffd65a"][Math.floor(r() * 4)]}" opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`);
      x += bw;
    }
    return `
      ${band("0 0 1440 600", "left:0;bottom:0;width:100%;height:80vh", `<g class="beam-a"><polygon points="300,600 230,0 300,0" fill="url(#vb)"/></g><g class="beam-b"><polygon points="1140,600 1140,0 1210,0" fill="url(#vb)"/></g>
        <defs><linearGradient id="vb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff6c8" stop-opacity=".12"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></linearGradient></defs>`)}
      ${band("0 0 1440 300", "left:0;bottom:0;width:100%;height:clamp(96px,22.4vh,224px)", `${b.join("")}${w.join("")}
        <rect x="690" y="40" width="12" height="260" fill="#0c0414"/><ellipse cx="696" cy="60" rx="34" ry="12" fill="#0c0414"/><circle cx="696" cy="34" r="5" fill="#ff4fb4" class="blink"/>`)}
      ${svg("0 0 120 120", "left:3vw;top:14vh;width:clamp(56px,7.2vw,104px)", `<path d="M60 8 L74 44 L112 44 L82 68 L94 106 L60 84 L26 106 L38 68 L8 44 L46 44Z" fill="none" stroke="#ff4fb4" stroke-width="5" stroke-linejoin="round"/>`, "neon flicker")}
      ${svg("0 0 160 90", "right:3vw;top:14vh;width:clamp(72px,8.8vw,128px)", `<g fill="none" stroke="#5adcff" stroke-width="4"><rect x="8" y="14" width="62" height="62" rx="10" transform="rotate(-12 39 45)"/><rect x="88" y="10" width="62" height="62" rx="10" transform="rotate(10 119 41)"/></g>
        <g fill="#5adcff"><circle cx="26" cy="34" r="5"/><circle cx="50" cy="56" r="5"/><circle cx="106" cy="28" r="5"/><circle cx="132" cy="54" r="5"/><circle cx="119" cy="41" r="5"/></g>`, "neon")}
      ${svg("0 0 120 120", "left:6vw;top:44vh;width:clamp(40px,4.8vw,72px)", `<path d="M60 104 C20 74 8 50 22 32 C34 18 52 24 60 40 C68 24 86 18 98 32 C112 50 100 74 60 104Z" fill="none" stroke="#ff3b5c" stroke-width="5"/>`, "neon flicker-2")}
      ${svg("0 0 120 130", "right:6vw;top:42vh;width:clamp(40px,4.8vw,72px)", `<path d="M60 10 C40 40 10 52 14 76 C18 98 44 100 56 86 L48 120 L72 120 L64 86 C76 100 102 98 106 76 C110 52 80 40 60 10Z" fill="none" stroke="#ffd65a" stroke-width="5"/>`, "neon")}`;
  };

  // ---------- Into the Future: ringed planet, stars, grid floor, circuits ----------
  const future = () => {
    const r = rnd(5), stars = [];
    for (let i = 0; i < 60; i++) stars.push(`<circle cx="${(r() * 1440).toFixed(0)}" cy="${(r() * 700).toFixed(0)}" r="${(0.6 + r() * 1.6).toFixed(1)}" fill="#e8f6ff" opacity="${(0.3 + r() * 0.6).toFixed(2)}"/>`);
    const grid = [];
    for (let i = 0; i <= 24; i++) { const x = i * 60; grid.push(`<line x1="${720 + (x - 720) * 0.12}" y1="0" x2="${x * 2 - 720}" y2="260" />`); }
    [8, 22, 42, 70, 108, 160, 230].forEach(y => grid.push(`<line x1="-200" y1="${y}" x2="1640" y2="${y}"/>`));
    const circuit = flip => `<g ${flip ? 'transform="translate(160 0) scale(-1 1)"' : ""} stroke="#79e3ff" stroke-width="2" fill="none" opacity=".55">
      <path d="M0 40 H60 L90 70 V180 L120 210 H160"/><path d="M0 120 H40 L60 140 V300"/><path d="M0 260 H80 L110 290 V420"/><path d="M30 0 V20 L50 40"/></g>
      <g fill="#79e3ff" ${flip ? 'transform="translate(160 0) scale(-1 1)"' : ""}><circle cx="160" cy="210" r="5"/><circle cx="60" cy="300" r="5"/><circle cx="110" cy="420" r="5"/><circle cx="90" cy="70" r="4"/></g>`;
    return `
      ${band("0 0 1440 700", "left:0;top:0;width:100%;height:100vh", stars.join(""), "twinkle")}
      ${svg("0 0 300 200", "right:4vw;top:11vh;width:clamp(104px,14.4vw,224px)", `<defs><radialGradient id="fp" cx=".35" cy=".35"><stop offset="0" stop-color="#e9f1f7"/><stop offset=".6" stop-color="#8fa1b0"/><stop offset="1" stop-color="#3a4652"/></radialGradient></defs>
        <ellipse cx="150" cy="100" rx="138" ry="30" fill="none" stroke="#79e3ff" stroke-width="5" opacity=".55" transform="rotate(-14 150 100)"/>
        <circle cx="150" cy="100" r="62" fill="url(#fp)"/>
        <path d="M14 112 A138 30 -14 0 0 286 68" fill="none" stroke="#79e3ff" stroke-width="5" opacity=".9" transform="rotate(0)"/>
        <circle cx="40" cy="40" r="10" fill="#c9d6e0"/>`, "sway-slow")}
      ${band("0 0 1440 260", "left:0;bottom:0;width:100%;height:clamp(88px,20.8vh,208px)", `<rect width="1440" height="260" fill="url(#fg)"/><defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#79e3ff" stop-opacity="0"/><stop offset="1" stop-color="#79e3ff" stop-opacity=".12"/></linearGradient></defs><g stroke="#79e3ff" stroke-width="1.6" opacity=".45">${grid.join("")}</g>`)}
      ${svg("0 0 160 440", "left:0;top:18vh;height:clamp(176px,48vh,416px)", circuit(false))}
      ${svg("0 0 160 440", "right:0;top:24vh;height:clamp(176px,44.8vh,400px)", circuit(true))}`;
  };

  // ---------- Northern Lights: stars, mountains with snow, pine trees ----------
  const pine = (x, h, c) => `<g fill="${c}"><path d="M${x} ${240 - h} L${x - h * 0.28} ${240 - h * 0.45} L${x - h * 0.14} ${240 - h * 0.45} L${x - h * 0.36} 240 L${x + h * 0.36} 240 L${x + h * 0.14} ${240 - h * 0.45} L${x + h * 0.28} ${240 - h * 0.45}Z"/></g>`;
  const aurora = () => {
    const r = rnd(3), stars = [];
    for (let i = 0; i < 90; i++) stars.push(`<circle cx="${(r() * 1440).toFixed(0)}" cy="${(r() * 520).toFixed(0)}" r="${(0.5 + r() * 1.5).toFixed(1)}" fill="#ffffff" opacity="${(0.3 + r() * 0.7).toFixed(2)}"/>`);
    const trees = [];
    for (let x = 10; x < 1440; x += 26 + r() * 30) if (x < 380 || x > 1060) trees.push(pine(x, 60 + r() * 90, "#04121a"));
    // the lights themselves: soft curtains of green and violet that ripple slowly
    const curtain = (y, c1, c2, id, d) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}" stop-opacity="0"/><stop offset=".55" stop-color="${c1}" stop-opacity=".4"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></linearGradient></defs>
      <path d="${d}" transform="translate(0 ${y})" fill="url(#${id})"/>`;
    return `
      ${band("0 0 1440 700", "left:0;top:0;width:100%;height:100vh", stars.join(""), "twinkle")}
      ${band("0 0 1440 420", "left:-5vw;top:6vh;width:110vw;height:55vh", `<g filter="url(#ab)"><defs><filter id="ab"><feGaussianBlur stdDeviation="10"/></filter></defs>
        ${curtain(0, "#7dffb3", "#2ad1a0", "a1", "M0 140 C180 40 360 220 560 110 C760 0 920 200 1120 90 C1260 20 1360 120 1440 80 L1440 300 C1300 330 1180 230 1020 300 C820 380 640 240 460 320 C300 390 140 280 0 340Z")}
        ${curtain(40, "#a77dff", "#5a3bd6", "a2", "M0 220 C200 120 380 260 600 170 C820 80 980 240 1200 150 C1320 100 1400 170 1440 140 L1440 330 C1260 380 1080 300 900 360 C700 420 520 320 340 380 C200 420 80 360 0 390Z")}
      </g>`, "wave")}
      ${band("0 0 1440 240", "left:0;bottom:0;width:100%;height:clamp(96px,24vh,240px)", `
        <path d="M0 240 L0 140 L160 60 L260 120 L420 30 L560 130 L700 70 L860 150 L1000 50 L1150 120 L1300 60 L1440 130 L1440 240Z" fill="#0d2a38"/>
        <path d="M160 60 L190 78 L175 82 L160 74 L145 84 L132 74Z M420 30 L452 50 L436 54 L420 46 L404 56 L390 46Z M1000 50 L1030 68 L1016 72 L1000 64 L986 74 L972 66Z M1300 60 L1326 76 L1300 70 L1278 78Z" fill="#dff3f0" opacity=".85"/>
        <path d="M0 240 L0 190 L200 150 L380 200 L560 160 L760 205 L960 165 L1180 200 L1440 160 L1440 240Z" fill="#081a24"/>
        ${trees.join("")}`)}`;
  };

  // ---------- Lantern Night: hanging lanterns with characters, plum blossoms, lucky clouds ----------
  const lantern = (ch, len) => `<line x1="50" y1="0" x2="50" y2="${len}" stroke="#c8962e" stroke-width="2"/>
    <g transform="translate(0 ${len})">
      <rect x="32" y="0" width="36" height="10" rx="3" fill="#e0b040"/>
      <ellipse cx="50" cy="62" rx="44" ry="54" fill="#d6262b"/>
      <ellipse cx="50" cy="62" rx="44" ry="54" fill="url(#lg)"/>
      <g fill="none" stroke="#8c1015" stroke-width="2" opacity=".7"><ellipse cx="50" cy="62" rx="28" ry="54"/><ellipse cx="50" cy="62" rx="12" ry="54"/></g>
      <rect x="32" y="112" width="36" height="10" rx="3" fill="#e0b040"/>
      <text x="50" y="76" text-anchor="middle" font-size="38" font-family="'Noto Serif SC','Songti SC','SimSun',serif" fill="#ffd36b" font-weight="700">${ch}</text>
      <g stroke="#e0b040" stroke-width="2"><line x1="44" y1="122" x2="42" y2="160"/><line x1="50" y1="122" x2="50" y2="166"/><line x1="56" y1="122" x2="58" y2="160"/></g>
      <circle cx="50" cy="124" r="4" fill="#d6262b"/>
    </g>`;
  const lanternDefs = `<defs><radialGradient id="lg" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#ffcf6b" stop-opacity=".75"/><stop offset=".55" stop-color="#ff7a2e" stop-opacity=".15"/><stop offset="1" stop-color="#5a0508" stop-opacity=".35"/></radialGradient></defs>`;
  const blossom = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-7" rx="5" ry="7" fill="#ffc9d6" transform="rotate(${a})"/>`).join("")}<circle r="3" fill="#ffd36b"/></g>`;
  const cloud = `<g fill="none" stroke="#e0b040" stroke-width="4" stroke-linecap="round" opacity=".75"><path d="M10 60 Q10 30 40 30 Q50 10 75 15 Q100 0 120 25 Q150 22 150 50 Q150 70 125 70 L30 70 Q10 70 10 60Z"/><path d="M40 52 q0 -14 14 -14 q14 0 14 14 q0 9 -9 9"/><path d="M100 50 q0 -12 12 -12 q12 0 12 12"/></g>`;
  const lanternNight = () => {
    const spots = [["福", 3, 26], ["喜", 17, 8], ["發", 81, 14], ["春", 94, 30], ["樂", 44, 2], ["吉", 62, 4]];
    return `${spots.map(([ch, x, len], i) => `<svg class="d sway-${i % 2 ? "2" : "1"} glow" viewBox="0 0 100 ${len + 170}" style="left:${x}vw;top:calc(var(--bar-h, 64px) - 4px);height:clamp(88px,${12 + len / 5}vh,${150 + len * 1.5}px);transform-origin:50% 0" preserveAspectRatio="xMidYMin meet" aria-hidden="true">${lanternDefs}${lantern(ch, len)}</svg>`).join("")}
      ${svg("0 0 300 220", "left:0;bottom:0;width:clamp(120px,17.6vw,272px)", `<path d="M0 220 C40 170 90 140 150 120 C200 104 240 80 290 40" stroke="#3a1a0c" stroke-width="9" fill="none" stroke-linecap="round"/>
        <path d="M120 128 C130 100 150 86 170 76" stroke="#3a1a0c" stroke-width="5" fill="none"/><path d="M60 170 C70 150 62 130 48 118" stroke="#3a1a0c" stroke-width="4" fill="none"/>
        ${blossom(170, 76, 1.3)}${blossom(240, 66, 1.1)}${blossom(48, 118, 1.2)}${blossom(130, 126, 1)}${blossom(205, 100, 1.4)}${blossom(282, 42, 1.2)}${blossom(95, 150, 0.9)}`)}
      ${svg("0 0 160 80", "right:3vw;bottom:4vh;width:clamp(80px,10.4vw,160px)", cloud)}
      ${svg("0 0 160 80", "right:16vw;bottom:14vh;width:clamp(56px,6.4vw,104px)", cloud, "drift")}`;
  };

  window.CR_DECO = { ocean, pretty, west, vegas, future, aurora, lantern: lanternNight };
  if (window.CR_DECO_READY) window.CR_DECO_READY();
})();
