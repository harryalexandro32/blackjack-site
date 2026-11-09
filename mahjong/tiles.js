// Mahjong tile faces drawn as SVG (viewBox 0 0 60 80), built once per tile and cached.
// Suits: dots (p), bamboo (s), characters (m); honours 1z-7z (E S W N, white, green, red); flowers 1f-8f.
// The Chinese characters use Noto Serif SC, loaded with only the glyphs we need.
const BLUE = "#1f4e9c", RED = "#c0392b", GREEN = "#2e7d32", INK = "#1d1a17";
const NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const HONOR = ["", "東", "南", "西", "北"];
const BONUS = [["", ""], ["梅", "#c2185b"], ["蘭", "#7b1fa2"], ["菊", "#e08a00"], ["竹", GREEN], ["春", "#2e7d32"], ["夏", "#c0392b"], ["秋", "#d35400"], ["冬", "#1f4e9c"]];
const CJK = "'Noto Serif SC', 'Songti SC', 'SimSun', serif";

(() => {
  if (document.querySelector("link[data-mj-font]")) return;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.dataset.mjFont = "";
  l.href = "https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700&display=swap&text=" + encodeURIComponent("一二三四五六七八九萬東南西北中發梅蘭菊竹春夏秋冬");
  document.head.appendChild(l);
})();

const dot = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="none" stroke="#fff" stroke-width="${r * 0.22}"/><circle cx="${x}" cy="${y}" r="${r * 0.18}" fill="#fff"/>`;
const DOTS = {
  1: () => `<circle cx="30" cy="40" r="20" fill="${GREEN}"/><circle cx="30" cy="40" r="15" fill="#fff"/><circle cx="30" cy="40" r="12" fill="${RED}"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<circle cx="${30 + 9 * Math.cos(a * Math.PI / 180)}" cy="${40 + 9 * Math.sin(a * Math.PI / 180)}" r="1.6" fill="#fff"/>`).join("")}<circle cx="30" cy="40" r="4" fill="${BLUE}"/>`,
  2: () => dot(30, 24, 9, GREEN) + dot(30, 56, 9, BLUE),
  3: () => dot(16, 18, 7.5, BLUE) + dot(30, 40, 7.5, RED) + dot(44, 62, 7.5, GREEN),
  4: () => dot(18, 24, 8.5, BLUE) + dot(42, 24, 8.5, GREEN) + dot(18, 56, 8.5, GREEN) + dot(42, 56, 8.5, BLUE),
  5: () => dot(17, 20, 7.5, BLUE) + dot(43, 20, 7.5, GREEN) + dot(30, 40, 7.5, RED) + dot(17, 60, 7.5, GREEN) + dot(43, 60, 7.5, BLUE),
  6: () => dot(19, 17, 7, GREEN) + dot(41, 17, 7, GREEN) + [40, 62].flatMap(y => [dot(19, y, 7, RED), dot(41, y, 7, RED)]).join(""),
  7: () => dot(14, 14, 6, GREEN) + dot(30, 23, 6, GREEN) + dot(46, 32, 6, GREEN) + [49, 66].flatMap(y => [dot(20, y, 6.5, RED), dot(40, y, 6.5, RED)]).join(""),
  8: () => [13, 31, 49, 67].flatMap(y => [dot(19, y, 7, BLUE), dot(41, y, 7, BLUE)]).join(""),
  9: () => [[17, BLUE], [40, RED], [63, GREEN]].flatMap(([y, c]) => [13, 30, 47].map(x => dot(x, y, 6.5, c))).join("")
};
const stick = (x, y, c = GREEN, h = 18) => `<g transform="translate(${x} ${y})"><rect x="-3.2" y="${-h / 2}" width="6.4" height="${h}" rx="3" fill="${c}"/><rect x="-4.2" y="-1.2" width="8.4" height="2.4" rx="1" fill="${c}"/><line x1="0" y1="${-h / 2 + 2}" x2="0" y2="${h / 2 - 2}" stroke="#fff" stroke-width="1" opacity=".55"/></g>`;
const BAMBOO = {
  1: () => `<g transform="translate(30 42)"><path d="M-4 18 L-14 30 M4 18 L12 30" stroke="${RED}" stroke-width="3" stroke-linecap="round"/><path d="M8 4 C24 -6 26 -24 14 -28 C22 -16 12 -8 6 -6Z" fill="${GREEN}"/><path d="M8 4 C26 0 30 -14 24 -20 C26 -8 16 -2 8 -2Z" fill="${BLUE}"/><ellipse cx="-2" cy="6" rx="13" ry="12" fill="${GREEN}"/><circle cx="-10" cy="-8" r="7" fill="${RED}"/><circle cx="-12" cy="-9" r="1.6" fill="#fff"/><path d="M-17 -7 L-23 -5 L-17 -4Z" fill="#e0a300"/><path d="M-6 2 q6 6 14 2" stroke="#fff" stroke-width="1.4" fill="none"/></g>`,
  2: () => stick(30, 24) + stick(30, 56, BLUE),
  3: () => stick(30, 22) + stick(18, 56, BLUE) + stick(42, 56, BLUE),
  4: () => stick(18, 24, BLUE) + stick(42, 24) + stick(18, 56) + stick(42, 56, BLUE),
  5: () => stick(16, 24) + stick(44, 24, BLUE) + stick(30, 40, RED) + stick(16, 56, BLUE) + stick(44, 56),
  6: () => [14, 30, 46].map(x => stick(x, 24, GREEN)).join("") + [14, 30, 46].map(x => stick(x, 56, BLUE)).join(""),
  7: () => stick(30, 16, RED, 14) + [14, 30, 46].map(x => stick(x, 40, GREEN, 15)).join("") + [14, 30, 46].map(x => stick(x, 64, BLUE, 15)).join(""),
  8: () => [11, 23, 37, 49].map(x => stick(x, 24, GREEN)).join("") + [11, 23, 37, 49].map(x => stick(x, 56, BLUE)).join(""),
  9: () => [[16, GREEN], [40, BLUE], [64, GREEN]].flatMap(([y, c]) => [14, 30, 46].map((x, i) => stick(x, y, i === 1 ? RED : c, 16))).join("")
};
const char = (ch, y, size, color) => `<text x="30" y="${y}" text-anchor="middle" font-family="${CJK}" font-weight="700" font-size="${size}" fill="${color}">${ch}</text>`;
function face(code) {
  const n = +code[0], s = code[1];
  if (s === "p") return DOTS[n]();
  if (s === "s") return BAMBOO[n]();
  if (s === "m") return char(NUM[n], 34, 26, BLUE) + char("萬", 70, 30, RED);
  if (s === "z") {
    if (n <= 4) return char(HONOR[n], 54, 40, INK);
    if (n === 5) return `<rect x="13" y="15" width="34" height="50" rx="3" fill="none" stroke="${BLUE}" stroke-width="4"/><rect x="19" y="21" width="22" height="38" rx="2" fill="none" stroke="${BLUE}" stroke-width="2"/>`;
    if (n === 6) return char("發", 55, 40, GREEN);
    return char("中", 55, 42, RED);
  }
  const [ch, c] = BONUS[n];
  return char(ch, 55, 36, c) + `<text x="49" y="18" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="700" font-size="11" fill="${c}">${((n - 1) % 4) + 1}</text>`;
}
const cache = new Map();
export function tileSvg(code) {
  if (!cache.has(code)) cache.set(code, `<svg viewBox="0 0 60 80" aria-hidden="true"><rect x="1.5" y="1.5" width="57" height="77" rx="8" fill="#f7f1e3" stroke="#c9bfa8" stroke-width="1.5"/>${face(code)}</svg>`);
  return cache.get(code);
}
