// Mahjong tile faces drawn as SVG (viewBox 0 0 60 80), built once per tile and cached.
// Suits: dots (p), bamboo (s), characters (m); honours 1z-7z (E S W N, white, green, red);
// flowers 1f-4f (plum, orchid, chrysanthemum, bamboo) and seasons 5f-8f (spring, summer, autumn, winter),
// each drawn as a little picture with its character in the corner and its number in a badge.
// The Chinese characters use Noto Serif SC, loaded with only the glyphs we need.
const BLUE = "#1a4a9e", RED = "#c62828", GREEN = "#2e7d32", INK = "#14110e";
const NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const HONOR = ["", "東", "南", "西", "北"];
const CJK = "'Noto Serif SC', 'Songti SC', 'SimSun', serif";

(() => {
  if (typeof document === "undefined" || document.querySelector("link[data-mj-font]")) return;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.dataset.mjFont = "";
  l.href = "https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@900&display=swap&text=" + encodeURIComponent("一二三四五六七八九萬東南西北中發梅蘭菊竹春夏秋冬");
  document.head.appendChild(l);
})();

const char = (ch, x, y, size, color, extra = "") => `<text x="${x}" y="${y}" text-anchor="middle" font-family="${CJK}" font-weight="900" font-size="${size}" fill="${color}" ${extra}>${ch}</text>`;

// ---------- dots ----------
const dot = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r * 0.62}" fill="none" stroke="#fff" stroke-width="${r * 0.2}"/><circle cx="${x}" cy="${y}" r="${r * 0.22}" fill="#fff"/>`;
const DOTS = {
  1: () => `<circle cx="30" cy="40" r="22" fill="${GREEN}"/><circle cx="30" cy="40" r="17" fill="#fff"/><circle cx="30" cy="40" r="14" fill="${RED}"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<circle cx="${(30 + 10 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(40 + 10 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="2" fill="#fff"/>`).join("")}<circle cx="30" cy="40" r="5" fill="${BLUE}"/>`,
  2: () => dot(30, 23, 10.5, GREEN) + dot(30, 57, 10.5, BLUE),
  3: () => dot(15, 17, 8.5, BLUE) + dot(30, 40, 8.5, RED) + dot(45, 63, 8.5, GREEN),
  4: () => dot(17, 23, 9.5, BLUE) + dot(43, 23, 9.5, GREEN) + dot(17, 57, 9.5, GREEN) + dot(43, 57, 9.5, BLUE),
  5: () => dot(16, 19, 8.5, BLUE) + dot(44, 19, 8.5, GREEN) + dot(30, 40, 8.5, RED) + dot(16, 61, 8.5, GREEN) + dot(44, 61, 8.5, BLUE),
  6: () => dot(18, 16, 8, GREEN) + dot(42, 16, 8, GREEN) + [40, 63].flatMap(y => [dot(18, y, 8, RED), dot(42, y, 8, RED)]).join(""),
  7: () => dot(13, 13, 6.8, GREEN) + dot(30, 22, 6.8, GREEN) + dot(47, 31, 6.8, GREEN) + [49, 66].flatMap(y => [dot(19, y, 7.4, RED), dot(41, y, 7.4, RED)]).join(""),
  8: () => [12, 31, 50, 68].flatMap(y => [dot(18, y, 8, BLUE), dot(42, y, 8, BLUE)]).join(""),
  9: () => [[16, BLUE], [40, RED], [64, GREEN]].flatMap(([y, c]) => [12, 30, 48].map(x => dot(x, y, 7.6, c))).join("")
};

// ---------- bamboo ----------
const stick = (x, y, c = GREEN, h = 20) => `<g transform="translate(${x} ${y})"><rect x="-4" y="${-h / 2}" width="8" height="${h}" rx="4" fill="${c}" stroke="#0b3d12" stroke-opacity=".35" stroke-width="1"/><rect x="-5.2" y="-1.6" width="10.4" height="3.2" rx="1.4" fill="${c}"/><rect x="-5.2" y="${-h / 2 + 1}" width="10.4" height="2.4" rx="1.2" fill="${c}"/><rect x="-5.2" y="${h / 2 - 3.4}" width="10.4" height="2.4" rx="1.2" fill="${c}"/><line x1="0" y1="${-h / 2 + 3}" x2="0" y2="${h / 2 - 3}" stroke="#fff" stroke-width="1.4" opacity=".6"/></g>`;
const BAMBOO = {
  // the one of bamboo is traditionally a bird
  1: () => `<g transform="translate(30 42)">
      <path d="M-3 18 L-12 32 M5 18 L12 32" stroke="${RED}" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M8 2 C26 -6 30 -26 16 -30 C24 -16 14 -8 6 -6Z" fill="${GREEN}"/><path d="M8 4 C28 2 32 -14 26 -22 C28 -8 18 0 8 -1Z" fill="${BLUE}"/>
      <ellipse cx="-2" cy="7" rx="14" ry="13" fill="${GREEN}"/><path d="M-12 8 q8 9 20 3" stroke="#a5d6a7" stroke-width="2" fill="none"/>
      <circle cx="-10" cy="-8" r="8" fill="${RED}"/><circle cx="-12.5" cy="-10" r="2.2" fill="#fff"/><circle cx="-12.5" cy="-10" r="1" fill="${INK}"/>
      <path d="M-18 -7 L-26 -4 L-18 -2Z" fill="#f2a900"/><path d="M-9 -16 l-2 -6 l4 4 l1 -6 l2 6" fill="${RED}"/></g>`,
  2: () => stick(30, 23, GREEN, 24) + stick(30, 57, BLUE, 24),
  3: () => stick(30, 21, GREEN, 22) + stick(17, 57, BLUE, 22) + stick(43, 57, BLUE, 22),
  4: () => stick(18, 23, BLUE, 24) + stick(42, 23, GREEN, 24) + stick(18, 57, GREEN, 24) + stick(42, 57, BLUE, 24),
  5: () => stick(15, 23, GREEN, 24) + stick(45, 23, BLUE, 24) + stick(30, 40, RED, 24) + stick(15, 57, BLUE, 24) + stick(45, 57, GREEN, 24),
  6: () => [14, 30, 46].map(x => stick(x, 23, GREEN, 24)).join("") + [14, 30, 46].map(x => stick(x, 57, BLUE, 24)).join(""),
  7: () => stick(30, 15, RED, 16) + [14, 30, 46].map(x => stick(x, 40, GREEN, 17)).join("") + [14, 30, 46].map(x => stick(x, 65, BLUE, 17)).join(""),
  8: () => [11, 23.5, 36.5, 49].map(x => stick(x, 23, GREEN, 24)).join("") + [11, 23.5, 36.5, 49].map(x => stick(x, 57, BLUE, 24)).join(""),
  9: () => [[15, GREEN], [40, BLUE], [65, GREEN]].flatMap(([y, c]) => [14, 30, 46].map((x, i) => stick(x, y, i === 1 ? RED : c, 18))).join("")
};

// ---------- flowers and seasons: a picture, the character in the corner, the number in a badge ----------
const blossom = (x, y, r, petal = "#f48fb1", heart = "#ffd54f") => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(a => `<circle cx="${(r * 0.62 * Math.cos((a - 90) * Math.PI / 180)).toFixed(2)}" cy="${(r * 0.62 * Math.sin((a - 90) * Math.PI / 180)).toFixed(2)}" r="${r * 0.55}" fill="${petal}" stroke="#c2185b" stroke-width=".7"/>`).join("")}<circle r="${r * 0.32}" fill="${heart}"/><circle r="${r * 0.12}" fill="#c2185b"/></g>`;
const leaf = (x, y, len, angle, c = "#43a047") => `<path transform="translate(${x} ${y}) rotate(${angle})" d="M0 0 C${len * 0.3} ${-len * 0.22} ${len * 0.75} ${-len * 0.18} ${len} 0 C${len * 0.75} ${len * 0.18} ${len * 0.3} ${len * 0.22} 0 0Z" fill="${c}"/>`;
const PICTURES = {
  // plum: a dark branch with pink blossoms
  1: () => `<path d="M12 70 C20 58 26 52 32 44 C38 36 44 30 50 22" stroke="#5d4037" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M28 48 C22 44 18 40 14 34 M40 34 C46 34 50 38 52 44" stroke="#5d4037" stroke-width="2.2" fill="none" stroke-linecap="round"/>
       ${blossom(32, 44, 9)}${blossom(15, 33, 7)}${blossom(50, 22, 7.5)}${blossom(51, 45, 6)}<circle cx="20" cy="62" r="2.6" fill="#ec407a"/><circle cx="43" cy="30" r="2.2" fill="#ec407a"/>`,
  // orchid: long arching leaves and a purple flower
  2: () => `<g fill="none" stroke-linecap="round"><path d="M30 74 C24 58 14 46 6 40" stroke="#2e7d32" stroke-width="2.8"/><path d="M30 74 C36 58 46 48 56 44" stroke="#388e3c" stroke-width="2.8"/><path d="M30 74 C29 62 27 54 24 48" stroke="#43a047" stroke-width="2.4"/><path d="M30 74 C34 64 38 58 42 56" stroke="#2e7d32" stroke-width="2"/></g>
       <g transform="translate(32 34)">${[-60, 0, 60, 180].map((a, i) => `<ellipse rx="5.5" ry="11" transform="rotate(${a}) translate(0 -8)" fill="${i === 3 ? "#ab47bc" : "#8e24aa"}"/>`).join("")}${[-60, 0, 60].map(a => `<ellipse rx="2.6" ry="6" transform="rotate(${a}) translate(0 -8)" fill="#e1bee7"/>`).join("")}<circle r="3.6" fill="#fdd835"/><circle r="1.4" fill="#6a1b9a"/></g>
       <g transform="translate(16 52) scale(.55)">${[-60, 0, 60].map(a => `<ellipse rx="5.5" ry="11" transform="rotate(${a}) translate(0 -8)" fill="#ba68c8"/>`).join("")}<circle r="3.6" fill="#fdd835"/></g>`,
  // chrysanthemum: a full golden flower head on a stem
  3: () => `<path d="M30 54 C30 62 31 68 30 74" stroke="#2e7d32" stroke-width="3" fill="none"/>${leaf(30, 64, 14, -150, "#388e3c")}${leaf(30, 68, 13, -30, "#43a047")}
       <g transform="translate(30 36)">${Array.from({ length: 18 }, (_, i) => `<ellipse rx="2.8" ry="10" transform="rotate(${i * 20}) translate(0 -9)" fill="#ffb300" stroke="#e65100" stroke-width=".6"/>`).join("")}${Array.from({ length: 12 }, (_, i) => `<ellipse rx="2.2" ry="6" transform="rotate(${i * 30 + 15}) translate(0 -5)" fill="#ffca28" stroke="#ef6c00" stroke-width=".5"/>`).join("")}<circle r="4" fill="#8d4b00"/></g>`,
  // bamboo: jointed stalks with sharp leaves
  4: () => `<g>${[[22, 14, 60, "#43a047"], [37, 26, 48, "#2e7d32"]].map(([x, y, h, c]) => `<rect x="${x}" y="${y}" width="7" height="${h}" rx="2" fill="${c}"/>${Array.from({ length: Math.floor(h / 14) }, (_, k) => `<rect x="${x - 1}" y="${y + 12 + k * 14}" width="9" height="2.4" rx="1" fill="#1b5e20"/>`).join("")}`).join("")}
       ${leaf(29, 26, 18, -30, "#1b5e20")}${leaf(29, 30, 16, -10, "#2e7d32")}${leaf(44, 40, 16, -20, "#1b5e20")}${leaf(22, 46, 16, -160, "#2e7d32")}${leaf(22, 40, 14, -190, "#1b5e20")}${leaf(44, 52, 14, 10, "#2e7d32")}</g>`,
  // spring: a green sprig coming into bud
  5: () => `<path d="M30 74 C30 60 31 48 34 30" stroke="#33691e" stroke-width="2.8" fill="none" stroke-linecap="round"/>
       ${leaf(31, 62, 15, -150, "#7cb342")}${leaf(31, 58, 15, -30, "#8bc34a")}${leaf(32, 46, 13, -160, "#7cb342")}${leaf(33, 42, 13, -20, "#9ccc65")}
       ${blossom(34, 27, 7, "#f8bbd0", "#fff176")}${blossom(22, 40, 5, "#f8bbd0", "#fff176")}<circle cx="44" cy="34" r="2.6" fill="#f48fb1"/>`,
  // summer: a blazing sun over waves
  6: () => `<g transform="translate(30 40)">${Array.from({ length: 12 }, (_, i) => `<path d="M-2.6 -13 L0 -22 L2.6 -13Z" transform="rotate(${i * 30})" fill="#ff7043"/>`).join("")}<circle r="12" fill="#e53935"/><circle r="8.5" fill="#ff7043"/><circle r="4" fill="#ffcc80"/></g>
       <path d="M8 68 q5.5 -5 11 0 t11 0 t11 0 t11 0" stroke="${BLUE}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
  // autumn: a red-orange maple leaf
  7: () => `<path d="M30 22 L33.5 32 L43 27 L40 37.5 L51 38.5 L42 45.5 L47 53 L35.5 50 L32.5 59 L30 64 L27.5 59 L24.5 50 L13 53 L18 45.5 L9 38.5 L20 37.5 L17 27 L26.5 32Z" fill="#e65100" stroke="#bf360c" stroke-width="1"/>
       <path d="M30 26 L30 72 M30 46 L40 38 M30 46 L20 38 M30 54 L38 50 M30 54 L22 50" stroke="#ffcc80" stroke-width="1.2" fill="none"/><path d="M30 64 L30 74" stroke="#6d4c41" stroke-width="2"/>`,
  // winter: a snowflake
  8: () => `<g transform="translate(30 45)" stroke="${BLUE}" stroke-width="2.6" stroke-linecap="round" fill="none">${[0, 60, 120, 180, 240, 300].map(a => `<g transform="rotate(${a})"><line y1="0" y2="-21"/><line x1="0" y1="-11" x2="-6" y2="-17"/><line x1="0" y1="-11" x2="6" y2="-17"/><line x1="0" y1="-17" x2="-3.5" y2="-21"/><line x1="0" y1="-17" x2="3.5" y2="-21"/></g>`).join("")}<circle r="3.4" fill="#90caf9"/></g>`
};
const BONUS = [["", ""], ["梅", "#c2185b"], ["蘭", "#7b1fa2"], ["菊", "#e65100"], ["竹", GREEN], ["春", "#2e7d32"], ["夏", "#c62828"], ["秋", "#d84315"], ["冬", BLUE]];

function face(code) {
  const n = +code[0], s = code[1];
  if (s === "p") return DOTS[n]();
  if (s === "s") return BAMBOO[n]();
  if (s === "m") return char(NUM[n], 30, 35, 31, BLUE) + char("萬", 30, 72, 34, RED);
  if (s === "z") {
    if (n <= 4) return char(HONOR[n], 30, 56, 46, INK);
    if (n === 5) return `<rect x="11" y="13" width="38" height="54" rx="4" fill="none" stroke="${BLUE}" stroke-width="5"/><rect x="18" y="20" width="24" height="40" rx="2" fill="none" stroke="${BLUE}" stroke-width="2.4"/>`;
    if (n === 6) return char("發", 30, 57, 46, GREEN);
    return char("中", 30, 58, 50, RED);
  }
  const [ch, c] = BONUS[n];
  return PICTURES[n]() + char(ch, 11, 17, 13, c) + `<circle cx="49" cy="12" r="7.5" fill="${c}"/><text x="49" y="16" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="800" font-size="11" fill="#fff">${((n - 1) % 4) + 1}</text>`;
}
const cache = new Map();
export function tileSvg(code) {
  if (!cache.has(code)) cache.set(code, `<svg viewBox="0 0 60 80" aria-hidden="true"><rect x="1.5" y="1.5" width="57" height="77" rx="8" fill="#fbf6ea" stroke="#c9bfa8" stroke-width="1.5"/>${face(code)}</svg>`);
  return cache.get(code);
}
