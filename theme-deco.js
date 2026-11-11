// Background scenery for each theme, drawn as SVG and placed around the edges of the page behind everything.
// theme.js calls window.CR_DECO[themeId]() and puts the result in a fixed layer that ignores taps.
(function () {
  // a style that starts with "!" marks a piece that is left out on phones, where there is no room beside the heading
  const svg = (box, style, body, extra = "") => `<svg class="d ${extra}${style[0] === "!" ? " hide-sm" : ""}" viewBox="${box}" style="${style.replace(/^!/, "")}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${body}</svg>`;
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
      ${svg("0 0 120 120", "!right:14vw;top:11vh;width:clamp(56px,7.2vw,104px)", `<path d="M60 8 L74 44 L112 44 L82 68 L94 106 L60 84 L26 106 L38 68 L8 44 L46 44Z" fill="none" stroke="#ff4fb4" stroke-width="5" stroke-linejoin="round"/>`, "neon flicker")}
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
  // a smiling dragon with scales, a flame mane and claws, chasing a flaming pearl over lucky clouds
  const dragon = `
    <defs>
      <linearGradient id="dgRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef3340"/><stop offset=".6" stop-color="#c8102e"/><stop offset="1" stop-color="#8f0b1e"/></linearGradient>
      <linearGradient id="dgGold" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff9d2e"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
      <radialGradient id="dgPearl" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fffdf0"/><stop offset=".5" stop-color="#ffd36b"/><stop offset="1" stop-color="#ff8a1f"/></radialGradient>
      <pattern id="dgScale" width="9" height="8" patternUnits="userSpaceOnUse"><path d="M0 0 Q4.5 7 9 0 M-4.5 4 Q0 11 4.5 4 M4.5 4 Q9 11 13.5 4" fill="none" stroke="#ffcf5e" stroke-width="1.1" opacity=".75"/></pattern>
    </defs>
    <g fill="none" stroke="#e0b040" stroke-width="3.5" stroke-linecap="round" opacity=".7">
      <path d="M14 222 Q14 206 32 206 Q40 194 56 198 Q70 190 82 204 Q98 202 98 216 Q98 224 84 224 L28 224 Q14 224 14 222Z"/>
      <path d="M196 224 Q196 210 212 210 Q220 200 234 204 Q246 196 256 208 Q270 206 270 218"/>
    </g>
    <!-- tail tuft -->
    <path transform="translate(22 204) rotate(-150) scale(1.1)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(20 198) rotate(-110) scale(0.9)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(28 208) rotate(170) scale(0.8)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/>
    <!-- back fins, drawn under the body so only their tips show -->
    <path transform="translate(52 160) rotate(-35) scale(0.8)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(74 160) rotate(20) scale(0.8)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(104 198) rotate(150) scale(0.9)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(134 202) rotate(200) scale(0.9)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(166 150) rotate(60) scale(1)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(158 122) rotate(70) scale(1)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(178 88) rotate(-20) scale(1)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(206 78) rotate(0) scale(1)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/>
    <g transform="translate(118 196) rotate(20) scale(1 1)">
      <path d="M-6 0 C-8 12 -2 18 6 22 L12 30 L2 30 C-8 26 -16 16 -14 2Z" fill="#b00d24" stroke="#5c060f" stroke-width="1.5"/>
      <path d="M2 30 l-6 9 M7 30 l0 10 M12 30 l7 8" stroke="#ffd36b" stroke-width="2.6" stroke-linecap="round" fill="none"/></g><g transform="translate(170 128) rotate(-70) scale(-1 1)">
      <path d="M-6 0 C-8 12 -2 18 6 22 L12 30 L2 30 C-8 26 -16 16 -14 2Z" fill="#b00d24" stroke="#5c060f" stroke-width="1.5"/>
      <path d="M2 30 l-6 9 M7 30 l0 10 M12 30 l7 8" stroke="#ffd36b" stroke-width="2.6" stroke-linecap="round" fill="none"/></g>
    <path d="M24 200 C34 158 70 150 88 178" fill="none" stroke-linecap="round" stroke-width="20" stroke="#5c060f"/><path d="M88 178 C104 204 142 208 158 176" fill="none" stroke-linecap="round" stroke-width="28" stroke="#5c060f"/><path d="M158 176 C174 142 150 116 176 94 C196 78 220 86 232 72" fill="none" stroke-linecap="round" stroke-width="34" stroke="#5c060f"/>
    <path d="M24 200 C34 158 70 150 88 178" fill="none" stroke-linecap="round" stroke-width="15" stroke="url(#dgRed)"/><path d="M88 178 C104 204 142 208 158 176" fill="none" stroke-linecap="round" stroke-width="23" stroke="url(#dgRed)"/><path d="M158 176 C174 142 150 116 176 94 C196 78 220 86 232 72" fill="none" stroke-linecap="round" stroke-width="29" stroke="url(#dgRed)"/>
    <path d="M24 200 C34 158 70 150 88 178" fill="none" stroke-linecap="round" stroke-width="13" stroke="url(#dgScale)"/><path d="M88 178 C104 204 142 208 158 176" fill="none" stroke-linecap="round" stroke-width="21" stroke="url(#dgScale)"/><path d="M158 176 C174 142 150 116 176 94 C196 78 220 86 232 72" fill="none" stroke-linecap="round" stroke-width="27" stroke="url(#dgScale)"/>
    <!-- a pale belly line and a highlight along the back -->
    <path d="M24 200 C34 158 70 150 88 178 C104 204 142 208 158 176 C174 142 150 116 176 94 C196 78 220 86 232 72" fill="none" stroke="#ffe7a8" stroke-width="2.2" stroke-dasharray="1 5" stroke-linecap="round" opacity=".7" transform="translate(3 5)"/>
    <g transform="translate(92 184) rotate(60) scale(1 1)">
      <path d="M-6 0 C-8 12 -2 18 6 22 L12 30 L2 30 C-8 26 -16 16 -14 2Z" fill="#b00d24" stroke="#5c060f" stroke-width="1.5"/>
      <path d="M2 30 l-6 9 M7 30 l0 10 M12 30 l7 8" stroke="#ffd36b" stroke-width="2.6" stroke-linecap="round" fill="none"/></g><g transform="translate(184 100) rotate(-30) scale(1 1)">
      <path d="M-6 0 C-8 12 -2 18 6 22 L12 30 L2 30 C-8 26 -16 16 -14 2Z" fill="#b00d24" stroke="#5c060f" stroke-width="1.5"/>
      <path d="M2 30 l-6 9 M7 30 l0 10 M12 30 l7 8" stroke="#ffd36b" stroke-width="2.6" stroke-linecap="round" fill="none"/></g>
    <!-- head -->
    <g transform="translate(236 66) scale(1.2)">
      <!-- mane -->
      <path transform="translate(-14 -2) rotate(-100) scale(1)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(-12 -12) rotate(-70) scale(1.1)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(-4 -20) rotate(-40) scale(1.1)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(-16 8) rotate(-130) scale(0.9)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(-10 16) rotate(-160) scale(0.8)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/>
      <!-- antlers -->
      <path d="M4 -22 C0 -36 -8 -42 -18 -44 M-4 -34 C-4 -42 0 -46 4 -50 M12 -22 C14 -36 10 -46 2 -54 M12 -38 C18 -42 20 -48 20 -54" fill="none" stroke="#ffd36b" stroke-width="4" stroke-linecap="round"/>
      <!-- skull and snout -->
      <path d="M-16 4 C-20 -16 -4 -26 14 -23 C26 -21 34 -14 46 -12 C60 -10 66 0 60 9 C56 15 46 15 38 16 C30 17 26 22 16 24 C2 27 -12 20 -16 4Z" fill="url(#dgRed)" stroke="#5c060f" stroke-width="1.6"/>
      <!-- jaw, with a happy open mouth -->
      <path d="M22 15 C30 26 46 26 56 15 C48 19 34 19 22 15Z" fill="#5c060f"/>
      <path d="M26 17 l3 5 l3 -4 l3 5 l3 -4 l3 5 l3 -5 l3 4 l3 -5" fill="none" stroke="#fff5d8" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M14 22 C24 34 44 36 58 20 C50 36 28 40 14 22Z" fill="#b00d24" stroke="#5c060f" stroke-width="1.4"/>
      <!-- beard -->
      <path d="M22 34 C20 44 26 50 24 58 M32 37 C32 46 38 50 38 58" fill="none" stroke="#ffd36b" stroke-width="3" stroke-linecap="round"/>
      <!-- brow, eye, nostril -->
      <path d="M2 -20 C10 -28 22 -26 28 -17 C20 -20 10 -19 2 -14Z" fill="url(#dgGold)"/>
      <circle cx="15" cy="-9" r="7.5" fill="#fff8e0" stroke="#5c060f" stroke-width="1.2"/><circle cx="17" cy="-9" r="4" fill="#2a0606"/><circle cx="18.6" cy="-10.8" r="1.4" fill="#fff"/>
      <ellipse cx="54" cy="-3" rx="3" ry="2.2" fill="#5c060f"/><path d="M40 -10 C46 -14 54 -12 58 -8" fill="none" stroke="#ef6a70" stroke-width="1.6" stroke-linecap="round"/>
      <!-- whiskers -->
      <path d="M58 2 C74 2 84 14 80 30 C78 38 70 40 68 34 M56 8 C66 20 64 38 50 46 C44 49 40 44 44 40" fill="none" stroke="#ffd36b" stroke-width="2.6" stroke-linecap="round"/>
    </g>
    <!-- the flaming pearl it chases -->
    <g transform="translate(4 -13)">
    <circle cx="300" cy="40" r="20" fill="#ffb347" opacity=".18"/>
    <path transform="translate(300 26) rotate(-10) scale(0.9)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(312 32) rotate(40) scale(0.7)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/><path transform="translate(288 32) rotate(-50) scale(0.7)" d="M0 0 C-7 -8 -6 -18 2 -26 C1 -18 8 -16 7 -8 C12 -12 12 -18 11 -22 C18 -12 14 -2 6 2Z" fill="url(#dgGold)"/>
    <circle cx="300" cy="42" r="12" fill="url(#dgPearl)"/><circle cx="296" cy="38" r="3.4" fill="#fffdf0" opacity=".9"/></g>`;

  const lanternNight = () => {
    const spots = [["福", 3, 26], ["喜", 17, 8], ["發", 81, 14], ["春", 94, 30], ["樂", 44, 2], ["吉", 62, 4]];
    return `${spots.map(([ch, x, len], i) => `<svg class="d sway-${i % 2 ? "2" : "1"} glow" viewBox="0 0 100 ${len + 170}" style="left:${x}vw;top:calc(var(--bar-h, 64px) - 4px);height:clamp(88px,${12 + len / 5}vh,${150 + len * 1.5}px);transform-origin:50% 0" preserveAspectRatio="xMidYMin meet" aria-hidden="true">${lanternDefs}${lantern(ch, len)}</svg>`).join("")}
      ${svg("0 -18 322 248", "left:0;bottom:0;width:clamp(170px,26vw,400px)", dragon, "float")}
      ${svg("0 0 160 80", "right:3vw;bottom:4vh;width:clamp(80px,10.4vw,160px)", cloud)}
      ${svg("0 0 160 80", "right:16vw;bottom:14vh;width:clamp(56px,6.4vw,104px)", cloud, "drift")}`;
  };

  // ---------- Emperor's House: sakura everywhere, falling petals, a castle, hanging scrolls ----------
  const sakuraFlower = (x, y, s, c = "#ffc4d4") => `<g transform="translate(${x} ${y}) scale(${s})">${[0, 72, 144, 216, 288].map(a => `<path d="M0 0 C-6 -6 -6 -13 -2 -16 L0 -13.5 L2 -16 C6 -13 6 -6 0 0Z" fill="${c}" transform="rotate(${a})"/>`).join("")}<circle r="2.6" fill="#ff7aa0"/></g>`;
  const sakuraBranch = (flip, seed) => {
    const r = rnd(seed), flowers = [];
    const pts = [[60, 120], [95, 96], [130, 78], [170, 60], [210, 48], [250, 40], [290, 34], [120, 120], [160, 104], [200, 92], [240, 80], [150, 46], [195, 30], [70, 150], [105, 140], [230, 110], [270, 66], [320, 30], [335, 52]];
    pts.forEach(([x, y]) => flowers.push(sakuraFlower(x + r() * 10 - 5, y + r() * 10 - 5, 0.9 + r() * 0.8, r() < 0.3 ? "#ffe1ea" : r() < 0.6 ? "#ffb3c7" : "#ffc9d6")));
    return `<g ${flip ? 'transform="translate(360 0) scale(-1 1)"' : ""}>
      <path d="M0 175 C60 150 120 110 190 70 C240 44 300 28 350 22" stroke="#3b2224" stroke-width="10" fill="none" stroke-linecap="round"/>
      <path d="M110 118 C130 130 150 128 170 112 M180 76 C190 52 205 40 222 30 M240 52 C262 60 282 58 300 46 M70 146 C80 162 96 168 112 160" stroke="#3b2224" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      ${flowers.join("")}</g>`;
  };
  const castle = `<g>
    <path d="M30 260 L52 205 L248 205 L270 260Z" fill="#3a2c31"/><path d="M52 205 L248 205" stroke="#5a4650" stroke-width="2"/>
    <rect x="70" y="160" width="160" height="45" fill="#f1e9df"/><g fill="#2b1d24"><rect x="88" y="174" width="12" height="16"/><rect x="128" y="174" width="12" height="16"/><rect x="160" y="174" width="12" height="16"/><rect x="200" y="174" width="12" height="16"/></g>
    <path d="M40 165 Q150 140 260 165 Q246 152 236 146 L64 146 Q54 152 40 165Z" fill="#26323f"/>
    <rect x="95" y="112" width="110" height="36" fill="#f1e9df"/><g fill="#2b1d24"><rect x="114" y="122" width="10" height="14"/><rect x="145" y="122" width="10" height="14"/><rect x="176" y="122" width="10" height="14"/></g>
    <path d="M70 117 Q150 96 230 117 Q218 106 210 100 L90 100 Q82 106 70 117Z" fill="#26323f"/>
    <rect x="118" y="72" width="64" height="30" fill="#f1e9df"/><rect x="142" y="80" width="16" height="14" fill="#2b1d24"/>
    <path d="M98 77 Q150 58 202 77 Q192 66 186 60 L114 60 Q108 66 98 77Z" fill="#26323f"/>
    <path d="M128 60 Q150 38 172 60Z" fill="#26323f"/>
    <path d="M136 44 q-6 -10 2 -16 M164 44 q6 -10 -2 -16" stroke="#e8c066" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M40 165 Q34 160 30 152 M260 165 Q266 160 270 152 M70 117 Q64 112 62 104 M230 117 Q236 112 238 104" stroke="#e8c066" stroke-width="3" fill="none"/></g>`;
  const scroll = chars => `<rect x="4" y="0" width="52" height="8" rx="4" fill="#c9a24a"/><rect x="8" y="8" width="44" height="${chars.length * 46 + 16}" fill="#f4e9d6"/>
    <rect x="11" y="11" width="38" height="${chars.length * 46 + 10}" fill="none" stroke="#c9a24a" stroke-width="1.5"/>
    ${chars.map((ch, i) => `<text x="30" y="${50 + i * 46}" text-anchor="middle" font-size="34" font-family="'Shippori Mincho','Noto Serif JP','Yu Mincho',serif" fill="#8a1f2c" font-weight="700">${ch}</text>`).join("")}
    <rect x="4" y="${chars.length * 46 + 24}" width="52" height="8" rx="4" fill="#c9a24a"/>`;
  const petals = () => {
    const r = rnd(21), out = [];
    for (let i = 0; i < 22; i++) {
      const x = Math.round(r() * 100), dur = 16 + r() * 16, delay = -r() * dur, size = 10 + r() * 10;
      out.push(`<svg class="d petal" viewBox="-10 -10 20 20" style="left:${x}vw;top:-4vh;width:${size.toFixed(0)}px;--fall:${dur.toFixed(1)}s;--delay:${delay.toFixed(1)}s;--drift:${(r() * 8 - 4).toFixed(1)}vw" aria-hidden="true"><path d="M0 8 C-7 2 -7 -6 -2 -9 L0 -6 L2 -9 C7 -6 7 2 0 8Z" fill="${r() < 0.5 ? "#ffc4d4" : "#ffdbe5"}"/></svg>`);
    }
    return out.join("");
  };
  const emperor = () => `
    ${svg("0 0 360 200", "!left:46vw;top:calc(var(--bar-h, 64px) - 6px);width:clamp(180px,24vw,360px)", sakuraBranch(false, 4), "sway-slow")}
    ${svg("0 0 360 200", "right:-1vw;top:calc(var(--bar-h, 64px) + 2vh);width:clamp(150px,24vw,380px)", sakuraBranch(true, 9), "sway-slow")}
    ${svg("0 0 360 200", "right:-2vw;bottom:2vh;width:clamp(150px,22vw,340px);transform:scaleY(-1)", sakuraBranch(true, 15))}
    ${svg("0 0 300 260", "left:3vw;bottom:0;width:clamp(150px,20vw,300px)", castle)}
    ${svg("0 0 60 180", "left:1.5vw;top:34vh;height:clamp(120px,24vh,220px)", scroll(["皇", "桜", "福"]), "sway-1")}
    ${svg("0 0 60 134", "right:2vw;top:44vh;height:clamp(90px,18vh,170px)", scroll(["和", "夢"]), "sway-2")}
    ${petals()}`;

  // ---------- Pirate's Cove: jolly roger, treasure chest of gold, ship's wheel, rope, night sea ----------
  const pirate = () => `
    ${svg("0 0 140 220", "!right:16vw;top:calc(var(--bar-h, 64px) + 2vh);height:clamp(140px,30vh,300px)", `<rect x="16" y="0" width="7" height="220" fill="#5b3a1e"/>
      <path d="M23 12 L130 20 Q118 50 130 80 L23 72Z" fill="#141414"/>
      <g fill="#f3ecdf"><circle cx="70" cy="40" r="15"/><rect x="62" y="50" width="16" height="9" rx="2"/></g>
      <g fill="#141414"><circle cx="64" cy="39" r="4"/><circle cx="76" cy="39" r="4"/><path d="M70 45 l-2 4 h4Z"/></g>
      <g stroke="#f3ecdf" stroke-width="5" stroke-linecap="round"><path d="M50 58 L90 70 M90 58 L50 70"/></g>`, "sway")}
    ${svg("0 0 240 170", "left:2vw;bottom:2vh;width:clamp(130px,17vw,250px)", `<path d="M20 70 Q120 30 220 70 L220 80 L20 80Z" fill="#7a4a22"/><rect x="20" y="78" width="200" height="80" rx="6" fill="#8a5528"/>
      <g fill="#c9a24a"><rect x="20" y="76" width="200" height="8"/><rect x="104" y="72" width="32" height="40" rx="4"/><rect x="20" y="150" width="200" height="8"/><rect x="40" y="78" width="8" height="80"/><rect x="192" y="78" width="8" height="80"/></g>
      <circle cx="120" cy="96" r="6" fill="#3a2410"/>
      <g fill="#f2c14e" stroke="#b8862a" stroke-width="2">${[[60, 64], [86, 52], [112, 46], [140, 50], [168, 58], [74, 40], [128, 32], [154, 40], [100, 30]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11"/>`).join("")}</g>
      <g fill="#f2c14e" stroke="#b8862a" stroke-width="2"><circle cx="232" cy="160" r="9"/><circle cx="12" cy="162" r="8"/></g>`)}
    ${svg("0 0 200 200", "right:2vw;bottom:3vh;width:clamp(110px,13vw,200px)", `<g class="spin-slow"><circle cx="100" cy="100" r="62" fill="none" stroke="#6b4423" stroke-width="12"/><circle cx="100" cy="100" r="18" fill="#6b4423"/>
      ${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<g transform="rotate(${a} 100 100)"><rect x="96" y="14" width="8" height="70" rx="3" fill="#7d5230"/><circle cx="100" cy="14" r="8" fill="#7d5230"/></g>`).join("")}<circle cx="100" cy="100" r="7" fill="#c9a24a"/></g>`)}
    ${band("0 0 1440 40", "left:0;top:calc(var(--bar-h, 64px) - 4px);width:100%;height:24px", `<path d="M0 8 Q60 30 120 8 Q180 30 240 8 Q300 30 360 8 Q420 30 480 8 Q540 30 600 8 Q660 30 720 8 Q780 30 840 8 Q900 30 960 8 Q1020 30 1080 8 Q1140 30 1200 8 Q1260 30 1320 8 Q1380 30 1440 8" stroke="#a87a45" stroke-width="7" fill="none" stroke-dasharray="14 5"/>`)}
    ${band("0 0 1440 140", "left:0;bottom:0;width:100%;height:clamp(60px,12vh,130px)", `<path class="wave" d="M0 60 C120 40 240 80 360 60 C480 40 600 80 720 60 C840 40 960 80 1080 60 C1200 40 1320 80 1440 60 L1440 140 L0 140Z" fill="#0f2a3d" opacity=".9"/>
      <path d="M0 90 C160 75 320 105 480 90 C640 75 800 105 960 90 C1120 75 1280 105 1440 90 L1440 140 L0 140Z" fill="#0a1e2c"/>`)}
    ${svg("0 0 200 200", "right:6vw;top:calc(var(--bar-h, 64px) + 3vh);width:clamp(60px,7vw,110px)", `<circle cx="100" cy="100" r="70" fill="#f4ecd2"/><circle cx="78" cy="84" r="12" fill="#e2d8b8"/><circle cx="120" cy="118" r="9" fill="#e2d8b8"/>`)}`;

  // ---------- Midnight Jazz Club: brass horns, piano keys, a spinning record, floating notes ----------
  const jazz = () => {
    const keys = [];
    for (let i = 0; i < 52; i++) keys.push(`<rect x="${i * 28}" y="0" width="27" height="90" fill="#f4efe4"/>`);
    for (let i = 0; i < 52; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) keys.push(`<rect x="${i * 28 + 19}" y="0" width="17" height="56" fill="#141218"/>`);
    const r = rnd(33), notes = [];
    for (let i = 0; i < 9; i++) notes.push(svg("0 0 40 60", `left:${(5 + r() * 90).toFixed(0)}vw;top:${(25 + r() * 45).toFixed(0)}vh;width:${(18 + r() * 14).toFixed(0)}px;--delay:${(-r() * 12).toFixed(1)}s`, i % 2 ? `<path d="M12 48 a9 7 -20 1 1 0 -1 V8 L34 2 V40 a9 7 -20 1 1 0 -1 V14 L14 19Z" fill="#d9a441"/>` : `<path d="M16 46 a9 7 -20 1 1 0 -1 V4 q10 6 14 16 q-6 -6 -12 -6Z" fill="#d9a441"/>`, "note"));
    return `
      ${band("0 0 1440 600", "left:0;top:0;width:100%;height:100vh", `<defs><radialGradient id="jz" cx=".5" cy="0" r="1"><stop offset="0" stop-color="#fff3d0" stop-opacity=".16"/><stop offset=".6" stop-color="#fff3d0" stop-opacity="0"/></radialGradient></defs>
        <polygon points="560,0 880,0 1100,600 340,600" fill="url(#jz)"/>`)}
      ${band("0 0 1456 90", "left:0;bottom:0;width:100%;height:clamp(40px,8vh,80px)", keys.join(""))}
      ${svg("0 0 200 200", "right:3vw;top:calc(var(--bar-h, 64px) + 2vh);width:clamp(90px,11vw,170px)", `<g class="spin"><circle cx="100" cy="100" r="92" fill="#111"/>${[78, 66, 54, 44].map(rr => `<circle cx="100" cy="100" r="${rr}" fill="none" stroke="#2a2a2a" stroke-width="2"/>`).join("")}<circle cx="100" cy="100" r="28" fill="#a3263a"/><circle cx="100" cy="100" r="4" fill="#111"/><path d="M60 40 A70 70 0 0 1 150 44" stroke="#fff" stroke-opacity=".12" stroke-width="6" fill="none"/></g>`)}
      ${svg("0 0 200 240", "left:1.5vw;bottom:calc(clamp(40px,8vh,80px) + 1vh);height:clamp(150px,32vh,300px)", `<g fill="none" stroke="#d9a441" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M60 104 C34 104 28 120 31 140 C33 152 44 156 44 164 C44 172 24 178 22 200 C20 226 42 236 60 236 C78 236 100 226 98 200 C96 178 76 172 76 164 C76 156 87 152 89 140 C92 120 86 104 60 104Z"/>
        <path d="M56 104 V22 M64 104 V22"/><path d="M54 22 C50 12 58 4 66 8 C72 12 68 20 62 18"/>
        <path d="M57 30 V214 M59 30 V214 M61 30 V214 M63 30 V214" stroke-width="1" opacity=".8"/>
        <path d="M50 196 h20" stroke-width="3"/><path d="M42 176 c-4 6 4 10 0 16 M78 176 c4 6 -4 10 0 16" stroke-width="2"/>
        <g transform="translate(-60 0)"><path d="M150 24 l10 8 L178 50 Q182 56 182 66 L182 176 Q182 214 214 214 Q244 214 244 184 L244 160 Q246 146 256 140"/>
        <path d="M196 54 L196 174 Q196 200 214 200 Q230 200 230 184 L230 160 Q228 146 218 140"/>
        <ellipse cx="237" cy="140" rx="19" ry="4.5"/><path d="M178 50 Q186 46 196 54"/>
        ${[84, 104, 124, 144, 164].map(y => `<circle cx="189" cy="${y}" r="4"/>`).join("")}</g></g>`, "sway")}
      ${svg("0 0 60 180", "right:2.5vw;bottom:calc(clamp(40px,8vh,80px) + 1vh);height:clamp(110px,24vh,220px)", `<g fill="none" stroke="#d9a441" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="17" y="6" width="26" height="40" rx="13"/><path d="M17 18 h26 M17 26 h26 M17 34 h26" stroke-width="1.4"/>
        <path d="M11 30 Q11 58 30 58 Q49 58 49 30"/><path d="M30 58 V172 M13 172 h34"/></g>`)}
      ${notes.join("")}`;
  };

  // ---------- Enchanted Forest: trees with fairy lights, glowing mushrooms, vines, fireflies ----------
  const forest = () => {
    const r = rnd(41), flies = [];
    for (let i = 0; i < 18; i++) flies.push(`<svg class="d firefly" viewBox="0 0 10 10" style="left:${(r() * 100).toFixed(0)}vw;top:${(15 + r() * 75).toFixed(0)}vh;width:8px;--delay:${(-r() * 10).toFixed(1)}s;--dx:${(r() * 8 - 4).toFixed(1)}vw;--dy:${(r() * 8 - 4).toFixed(1)}vh" aria-hidden="true"><circle cx="5" cy="5" r="3" fill="#fff6a8"/></svg>`);
    const tree = flip => `<g ${flip ? 'transform="translate(220 0) scale(-1 1)"' : ""}>
      <path d="M40 520 C60 400 50 300 70 200 C80 150 60 100 40 60 M70 200 C110 160 150 150 190 120 M62 300 C100 290 140 300 170 280 M58 120 C90 90 120 70 150 30" stroke="#1d150e" stroke-width="20" fill="none" stroke-linecap="round"/>
      <path d="M110 180 C130 220 128 250 120 290 M150 150 C160 190 170 210 168 240" stroke="#2f5a2e" stroke-width="4" fill="none"/>
      ${[[90, 190], [120, 172], [150, 158], [176, 132], [90, 290], [120, 296], [148, 292], [80, 110], [104, 90], [128, 64]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#ffe680" class="twinkle-dot"/>`).join("")}
      <path d="M70 200 C110 160 150 150 190 120" stroke="#ffe680" stroke-opacity=".25" stroke-width="1.5" fill="none"/></g>`;
    const mushroom = (x, s, cap) => `<g transform="translate(${x} 0) scale(${s})"><rect x="-7" y="-34" width="14" height="34" rx="6" fill="#efe6cf"/><path d="M-26 -30 Q0 -64 26 -30Z" fill="${cap}"/>
      <g fill="#fff" opacity=".9"><circle cx="-10" cy="-42" r="4"/><circle cx="6" cy="-48" r="3"/><circle cx="14" cy="-36" r="3.5"/></g></g>`;
    return `
      ${svg("0 0 220 520", "left:-2vw;bottom:0;height:clamp(260px,78vh,640px)", tree(false))}
      ${svg("0 0 220 520", "right:-2vw;bottom:0;height:clamp(240px,70vh,580px)", tree(true))}
      ${band("0 0 1440 60", "left:0;top:calc(var(--bar-h, 64px) - 6px);width:100%;height:40px", `<path d="M0 10 C80 40 160 0 240 25 C320 50 400 5 480 28 C560 50 640 6 720 26 C800 48 880 8 960 28 C1040 48 1120 6 1200 26 C1280 46 1360 10 1440 22" stroke="#2f5a2e" stroke-width="5" fill="none"/>
        ${Array.from({ length: 24 }, (_, i) => `<ellipse cx="${30 + i * 60}" cy="${22 + (i % 2) * 10}" rx="9" ry="5" fill="#4a7d3e" transform="rotate(${i % 2 ? 30 : -30} ${30 + i * 60} ${22 + (i % 2) * 10})"/>`).join("")}`)}
      ${svg("0 0 300 80", "left:5vw;bottom:0;width:clamp(190px,28vw,420px)", `<g transform="translate(0 80)" class="glow-green">${mushroom(40, 1.2, "#d9443a")}${mushroom(110, 0.8, "#e8a33a")}${mushroom(170, 1, "#d9443a")}${mushroom(240, 0.7, "#9a5ad9")}</g>`)}
      ${svg("0 0 200 80", "right:6vw;bottom:0;width:clamp(140px,19vw,290px)", `<g transform="translate(0 80)" class="glow-green">${mushroom(50, 0.9, "#9a5ad9")}${mushroom(120, 1.1, "#d9443a")}</g>`)}
      ${flies.join("")}`;
  };


  // ---------- Garage: a muscle car, a tyre stack, a checkered flag, tools on the wall ----------
  const garage = () => {
    const wheel = x => `<g transform="translate(${x} 134)"><circle r="33" fill="#141416"/><circle r="31" fill="none" stroke="#2a2a2e" stroke-width="5"/><circle r="19" fill="#c9ccd2"/><circle r="19" fill="none" stroke="#7d828a" stroke-width="2"/>${[0, 72, 144, 216, 288].map(a => `<path d="M0 0 L0 -16" stroke="#7d828a" stroke-width="4" stroke-linecap="round" transform="rotate(${a})"/>`).join("")}<circle r="5" fill="#5a5e65"/></g>`;
    const car = `
      <path d="M14 92 L44 89 L46 95 L22 99Z M30 96 L34 104" stroke="#7a0b10" stroke-width="3" fill="#a31015"/>
      <path d="M16 120 L22 99 Q32 91 62 89 L124 85 Q152 56 194 52 L262 52 Q288 54 316 83 L482 89 Q508 91 512 105 L514 125 Q514 135 500 135 L16 135 Q6 135 9 127Z" fill="#c4161c"/>
      <path d="M124 85 Q152 56 194 52 L262 52 Q288 54 316 83Z" fill="#a31015"/>
      <path d="M138 83 Q158 61 194 58 L224 58 L224 83Z M234 58 L262 58 Q282 62 302 83 L234 83Z" fill="#1b2026"/>
      <path d="M148 79 Q162 64 184 61 L172 79Z M244 61 L258 61 L250 79 L238 79Z" fill="#fff" opacity=".18"/>
      <path d="M356 86 L392 79 L418 86Z" fill="#1b2026"/>
      <path d="M20 106 L510 106 L512 113 L18 113Z" fill="#fff" opacity=".92"/><path d="M20 116 L512 116 L513 120 L18 120Z" fill="#fff" opacity=".6"/>
      <path d="M4 127 L34 127 L34 133 L4 133Z M488 129 L518 129 L518 134 L488 134Z" fill="#d7dade"/>
      <path d="M500 97 L513 99 L513 107 L498 106Z" fill="#ffe9a3"/><path d="M12 104 L22 102 L22 110 L12 110Z" fill="#ff4d3d"/>
      <path d="M40 137 L80 137 L80 142 L40 142Z" fill="#9aa0a8"/>
      ${wheel(112)}${wheel(420)}
      <path d="M170 94 h22 M262 94 h22" stroke="#7a0b10" stroke-width="3" stroke-linecap="round"/>`;
    const tyre = y => `<g transform="translate(0 ${y})"><ellipse cx="60" cy="0" rx="56" ry="16" fill="#1a1a1c"/><ellipse cx="60" cy="-6" rx="56" ry="16" fill="#26262a"/><ellipse cx="60" cy="-6" rx="28" ry="7" fill="#0c0c0e"/></g>`;
    const checker = Array.from({ length: 12 }, (_, i) => { const r = Math.floor(i / 4), c = i % 4; return `<rect x="${c * 22}" y="${r * 18}" width="22" height="18" fill="${(r + c) % 2 ? "#111" : "#f4f4f0"}"/>`; }).join("");
    return `
      ${band("0 0 1440 80", "left:0;bottom:0;width:100%;height:clamp(28px,6vh,60px)", `<rect width="1440" height="80" fill="#1d1e21"/><path d="M0 6 H1440" stroke="#f4c430" stroke-width="10" stroke-dasharray="60 40"/><ellipse cx="900" cy="50" rx="90" ry="10" fill="#000" opacity=".35"/>`)}
      ${svg("0 0 520 180", "right:2vw;bottom:clamp(14px,3vh,34px);width:clamp(230px,36vw,520px)", car)}
      ${svg("0 0 120 130", "left:2vw;bottom:clamp(18px,4vh,40px);width:clamp(70px,9vw,120px)", tyre(126) + tyre(96) + tyre(66) + tyre(36))}
      ${svg("0 0 120 130", "left:clamp(64px,9vw,128px);bottom:clamp(18px,4vh,40px);width:clamp(52px,6.5vw,90px)", tyre(126) + tyre(96))}
      ${svg("0 0 110 160", "!right:21vw;top:calc(var(--bar-h, 64px) + 3vh);width:clamp(64px,8vw,110px)", `<rect x="4" y="0" width="5" height="160" rx="2" fill="#c9ccd2"/><g class="wave" transform="translate(9 6)">${checker}</g>`)}
      ${svg("0 0 200 120", "right:3vw;top:calc(var(--bar-h, 64px) + 2vh);width:clamp(110px,15vw,210px)", `<rect x="0" y="0" width="200" height="120" rx="6" fill="#4a3a2a"/>${Array.from({ length: 40 }, (_, i) => `<circle cx="${12 + (i % 10) * 20}" cy="${12 + Math.floor(i / 10) * 30}" r="2" fill="#2b2016"/>`).join("")}
        <g class="sway-1" style="transform-origin:40px 10px"><path d="M40 10 V80" stroke="#c9ccd2" stroke-width="8" stroke-linecap="round"/><path d="M28 80 a12 12 0 1 0 24 0 l-6 0 l0 8 l-12 0 l0 -8Z" fill="#c9ccd2"/></g>
        <g class="sway-2" style="transform-origin:100px 10px"><path d="M100 10 V96" stroke="#ff6a1f" stroke-width="7" stroke-linecap="round"/><rect x="88" y="10" width="24" height="12" rx="3" fill="#ff6a1f"/></g>
        <path d="M150 14 L150 70 M140 70 L160 70 L156 104 L144 104Z" stroke="#c9ccd2" stroke-width="6" stroke-linecap="round" fill="#9aa0a8"/></svg>`.replace(/<\/svg>$/, ""))}`;
  };

  // ---------- Space Fight: a ringed planet, two starfighters trading laser fire, a cruiser far off ----------
  const space = () => {
    const r = rnd(77), stars = [];
    for (let i = 0; i < 60; i++) stars.push(`<circle cx="${(r() * 1440).toFixed(0)}" cy="${(r() * 900).toFixed(0)}" r="${(0.6 + r() * 1.4).toFixed(1)}" fill="#fff"/>`);
    const bolts = [];
    for (let i = 0; i < 7; i++) {
      const green = i % 2 === 0, top = (22 + r() * 56).toFixed(0);
      bolts.push(`<svg class="d laser" viewBox="0 0 120 8" style="top:${top}vh;left:0;width:clamp(50px,7vw,110px);--delay:${(-r() * 6).toFixed(1)}s;--dur:${(2.4 + r() * 2).toFixed(1)}s;--from:${green ? "-10vw" : "105vw"};--to:${green ? "110vw" : "-15vw"};filter:drop-shadow(0 0 6px ${green ? "#5dff9a" : "#ff4a4a"})"><rect x="0" y="2" width="120" height="4" rx="2" fill="${green ? "#c8ffd9" : "#ffd0d0"}"/><rect x="0" y="0" width="120" height="8" rx="4" fill="${green ? "#2bdc6c" : "#ff2b2b"}" opacity=".55"/></svg>`);
    }
    const fighter = `<path d="M8 40 L118 31 L156 40 L118 49Z" fill="#d5dbe8"/><path d="M118 31 L156 40 L118 49 L126 40Z" fill="#aab3c7"/>
      <path d="M58 34 L88 4 L102 6 L84 34Z M58 46 L88 76 L102 74 L84 46Z" fill="#8f9bb6"/><path d="M88 4 L102 6 L100 12 L90 10Z M88 76 L102 74 L100 68 L90 70Z" fill="#ff8a2a"/>
      <path d="M98 36 L122 38 L122 42 L98 44 Q92 40 98 36Z" fill="#2a3a5c"/><path d="M100 37 L112 38 L104 40Z" fill="#9fd4ff"/>
      <circle cx="10" cy="40" r="7" fill="#7fd0ff" class="blink"/><circle cx="10" cy="40" r="13" fill="#7fd0ff" opacity=".25"/>`;
    const raider = `<path d="M8 40 L66 12 L150 30 L150 50 L66 68Z" fill="#4b4f5e"/><path d="M66 12 L150 30 L150 34 L70 24Z M66 68 L150 50 L150 46 L70 56Z" fill="#c62828"/>
      <path d="M40 40 L70 32 L84 40 L70 48Z" fill="#1c1f29"/><path d="M48 40 L68 35 L74 40 L68 45Z" fill="#ff6b6b"/>
      <rect x="146" y="34" width="10" height="5" fill="#ffb14a" class="blink"/><rect x="146" y="42" width="10" height="5" fill="#ffb14a" class="blink"/>`;
    return `
      ${band("0 0 1440 900", "left:0;top:0;width:100%;height:100%", `<g class="twinkle">${stars.join("")}</g>`)}
      ${svg("0 0 400 300", "left:-4vw;bottom:-3vh;width:clamp(240px,38vw,560px)", `<defs><radialGradient id="pl" cx="35%" cy="35%"><stop offset="0" stop-color="#e48a5a"/><stop offset=".6" stop-color="#9c3f3a"/><stop offset="1" stop-color="#3a1424"/></radialGradient></defs>
        <clipPath id="ringfront"><rect x="0" y="170" width="400" height="140"/></clipPath>
        <g transform="rotate(-14 200 170)"><ellipse cx="200" cy="170" rx="190" ry="40" fill="none" stroke="#e9c48a" stroke-width="10" opacity=".5"/></g>
        <circle cx="200" cy="170" r="110" fill="url(#pl)"/><path d="M110 140 Q200 120 300 150 M100 180 Q200 165 305 195" stroke="#f1a87a" stroke-width="7" fill="none" opacity=".35"/>
        <g transform="rotate(-14 200 170)"><ellipse cx="200" cy="170" rx="190" ry="40" fill="none" stroke="#f3d19a" stroke-width="10" opacity=".85" clip-path="url(#ringfront)"/></g>`)}
      ${svg("0 0 300 70", "right:4vw;top:calc(var(--bar-h, 64px) + 4vh);width:clamp(140px,22vw,320px)", `<path d="M10 40 Q30 18 120 16 L280 22 Q292 30 280 40 L120 52 Q30 56 10 40Z" fill="#2a2f45"/><path d="M60 30 L250 26 M60 44 L250 40" stroke="#3d4566" stroke-width="3"/>${Array.from({ length: 14 }, (_, i) => `<circle cx="${70 + i * 13}" cy="${33 + (i % 2) * 6}" r="1.4" fill="#ffd27a" class="blink"/>`).join("")}<circle cx="284" cy="31" r="5" fill="#7fd0ff" opacity=".8"/>`, "drift")}
      ${svg("0 0 164 80", "left:6vw;top:34vh;width:clamp(90px,13vw,190px)", fighter, "float")}
      ${svg("0 0 164 80", "right:7vw;top:54vh;width:clamp(80px,11vw,170px)", raider, "float-2")}
      ${svg("0 0 164 80", "right:22vw;top:20vh;width:clamp(50px,6vw,90px);opacity:.75", raider, "float")}
      ${bolts.join("")}`;
  };

  // ---------- Feeling Deezy?: a lava lamp, a sleepy moon, soft clouds, floating pastel orbs ----------
  const deezy = () => {
    const r = rnd(23), orbs = [];
    const cols = ["#ff9ad5", "#9ff3e0", "#c9a8ff", "#ffe39a", "#a8d8ff"];
    for (let i = 0; i < 16; i++) {
      const size = 10 + r() * 34;
      orbs.push(`<svg class="d orb" viewBox="0 0 40 40" style="left:${(r() * 96).toFixed(0)}vw;top:${(14 + r() * 76).toFixed(0)}vh;width:${size.toFixed(0)}px;--delay:${(-r() * 12).toFixed(1)}s;--dur:${(12 + r() * 10).toFixed(0)}s;--dx:${((r() - 0.5) * 8).toFixed(1)}vw;--dy:${(-4 - r() * 8).toFixed(1)}vh"><circle cx="20" cy="20" r="18" fill="${cols[i % 5]}" opacity=".55"/><circle cx="14" cy="13" r="5" fill="#fff" opacity=".45"/></svg>`);
    }
    const blobs = [[70, 300, 26, 0, 14, -170], [58, 250, 18, -5, 18, -120], [84, 340, 20, -9, 16, -210], [66, 200, 14, -3, 11, -90]]
      .map(([x, y, rad, d, dur, rise]) => `<ellipse class="lava" cx="${x}" cy="${y}" rx="${rad}" ry="${rad * 1.2}" fill="#ff7ac8" style="--delay:${d}s;--dur:${dur}s;--rise:${rise}px;transform-box:fill-box;transform-origin:center"/>`).join("");
    const cloud = (c, o) => `<g fill="${c}" opacity="${o}"><ellipse cx="80" cy="60" rx="60" ry="26"/><ellipse cx="130" cy="44" rx="46" ry="30"/><ellipse cx="180" cy="62" rx="54" ry="22"/><ellipse cx="40" cy="70" rx="34" ry="16"/></g>`;
    return `
      ${svg("0 0 240 110", "left:4vw;top:calc(var(--bar-h, 64px) + 4vh);width:clamp(140px,20vw,280px)", cloud("#ffd6f0", .55), "drift")}
      ${svg("0 0 240 110", "left:38vw;top:calc(var(--bar-h, 64px) + 10vh);width:clamp(100px,14vw,200px)", cloud("#d6fff5", .4), "drift")}
      ${svg("0 0 160 160", "right:5vw;top:calc(var(--bar-h, 64px) + 2vh);width:clamp(80px,11vw,150px)", `<circle cx="80" cy="80" r="64" fill="#fff4c8" opacity=".25"/><path d="M98 22 A58 58 0 1 0 136 110 A46 46 0 1 1 98 22Z" fill="#fff0b8"/>
        <path d="M60 78 q8 6 16 0 M86 92 q6 5 12 0" stroke="#8a6bb0" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M66 104 q10 8 22 0" stroke="#8a6bb0" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="62" cy="96" r="6" fill="#ffb3d1" opacity=".6"/>`, "float")}
      ${svg("0 0 40 40", "right:16vw;top:calc(var(--bar-h, 64px) + 6vh);width:22px;--delay:0s", `<text x="6" y="30" font-size="28" fill="#e9dcff" font-family="Shrikhand, cursive">z</text>`, "zz")}
      ${svg("0 0 40 40", "right:14vw;top:calc(var(--bar-h, 64px) + 3vh);width:16px;--delay:-3s", `<text x="6" y="30" font-size="28" fill="#e9dcff" font-family="Shrikhand, cursive">z</text>`, "zz")}
      ${svg("0 0 160 420", "right:3vw;bottom:0;height:clamp(200px,48vh,440px)", `<defs><clipPath id="lamp"><path d="M50 60 L110 60 L130 330 L30 330Z"/></clipPath><linearGradient id="lampg" x1="0" x2="1"><stop offset="0" stop-color="#7a4fc4"/><stop offset=".5" stop-color="#b58cf0"/><stop offset="1" stop-color="#6a3fb0"/></linearGradient></defs>
        <path d="M58 20 L102 20 L110 60 L50 60Z" fill="#c9ccd8"/><path d="M50 60 L110 60 L130 330 L30 330Z" fill="url(#lampg)" opacity=".9"/>
        <g clip-path="url(#lamp)">${blobs}<ellipse cx="80" cy="335" rx="60" ry="22" fill="#ff7ac8"/></g>
        <path d="M60 64 L66 320" stroke="#fff" stroke-width="5" opacity=".18" stroke-linecap="round"/>
        <path d="M30 330 L130 330 L144 410 L16 410Z" fill="#c9ccd8"/><path d="M30 330 L130 330 L132 342 L28 342Z" fill="#a7abb9"/>`)}
      ${band("0 0 1440 160", "left:0;bottom:0;width:100%;height:clamp(50px,11vh,110px)", `<path class="wave" d="M0 60 C180 20 360 100 540 60 C720 20 900 100 1080 60 C1260 20 1350 70 1440 50 L1440 160 L0 160Z" fill="#c9a8ff" opacity=".35"/><path d="M0 100 C200 70 400 130 640 100 C880 70 1100 130 1440 96 L1440 160 L0 160Z" fill="#ff9ad5" opacity=".3"/>`)}
      ${orbs.join("")}`;
  };

  // ---------- Classic: a few chips, a fan of cards and a gold flourish, kept faint ----------
  const chipStack = (x, n, c) => Array.from({ length: n }, (_, i) => `<g transform="translate(${x} ${150 - i * 11})"><ellipse cx="0" cy="6" rx="34" ry="11" fill="#0b1f17"/><ellipse cx="0" cy="0" rx="34" ry="11" fill="${c}"/><ellipse cx="0" cy="0" rx="34" ry="11" fill="none" stroke="#f4f1ea" stroke-width="3" stroke-dasharray="9 12"/><ellipse cx="0" cy="0" rx="20" ry="6" fill="none" stroke="#f4f1ea" stroke-opacity=".5" stroke-width="1.5"/></g>`).join("");
  const fanCard = (rot, suit, red) => `<g transform="rotate(${rot} 100 190)"><rect x="70" y="50" width="60" height="86" rx="6" fill="#fbf9f3" stroke="#0b1f17" stroke-opacity=".35"/><text x="100" y="104" text-anchor="middle" font-size="34" font-family="Georgia, serif" fill="${red ? "#b3223a" : "#1d1b22"}">${suit}</text></g>`;
  const classic = () => `
    ${svg("0 0 230 170", "left:1.5vw;bottom:2vh;width:clamp(120px,15vw,230px);opacity:.5", chipStack(48, 5, "#c0392b") + chipStack(118, 3, "#1e7d4f") + chipStack(184, 4, "#1d1d22"))}
    ${svg("0 0 200 150", "right:2vw;bottom:2vh;width:clamp(110px,14vw,210px);opacity:.45", fanCard(-28, "♠") + fanCard(-9, "♥", true) + fanCard(10, "♣") + fanCard(29, "♦", true))}
    ${svg("0 0 300 60", "!right:5vw;top:calc(var(--bar-h, 64px) + 3vh);width:clamp(140px,18vw,270px);opacity:.4", `<g fill="none" stroke="#d4ad55" stroke-width="2.5" stroke-linecap="round"><path d="M10 30 H110 M190 30 H290"/><path d="M110 30 C120 12 136 12 150 30 C164 48 180 48 190 30 C180 12 164 12 150 30 C136 48 120 48 110 30Z"/></g><circle cx="150" cy="30" r="4" fill="#d4ad55"/>`)}`;

  window.CR_DECO = { classic, ocean, pretty, west, vegas, future, aurora, lantern: lanternNight, emperor, pirate, jazz, forest, garage, space, deezy };
  if (window.CR_DECO_READY) window.CR_DECO_READY();
})();
