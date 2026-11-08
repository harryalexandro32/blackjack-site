// Avatars: drawn as SVG from a short code like "0.1.2.0.5.3.0.1.0.1.2.4", so the server only stores a few numbers.
// Each number picks one option, in the order of FIELDS. Unknown or missing numbers fall back to the first option.

export const FIELDS = ["k", "g", "sk", "e", "hs", "hc", "fh", "hat", "htc", "gl", "sh", "bg"];

export const KINDS = ["Person", "Grim Reaper", "Snowman", "Fox", "Cat", "Bear", "Owl", "Robot"];
export const SKIN = ["#f7dcc8", "#efc6a2", "#e2b47f", "#c68b5c", "#94603c", "#5b3820"];
export const SKIN_NAMES = ["Fair", "Light", "Golden", "Tan", "Brown", "Deep"];
export const EYES = ["Round", "Almond"];
export const HAIR = ["Short", "Buzz", "Swept", "Afro", "Curly", "Long", "Bob", "Bun", "Ponytail", "Braids", "Bald"];
export const HAIR_COLOR = ["#1c1714", "#3b2618", "#6e4527", "#d9b45e", "#a8452b", "#9b9b9b", "#efebe2", "#3f63bd", "#cc5d9d"];
export const FACIAL = ["None", "Stubble", "Beard", "Mustache"];
export const HATS = ["None", "Cowboy", "Beanie", "Top hat"];
export const HAT_COLOR = ["#7b4a26", "#c9a56a", "#232326", "#efe9dc", "#8c2b24"];
export const GLASSES = ["None", "Sunglasses", "Glasses"];
export const SHIRT = ["#2f5d8a", "#8c2b24", "#2e6b46", "#3a3a42", "#c9a227", "#6d3f8a", "#efe9dc"];
export const BG = ["#24543a", "#7a2a22", "#24496e", "#c9a227", "#4b2e6b", "#2a2a30", "#b85c2a", "#5b8fa8"];

const SIZES = { k: KINDS.length, g: 2, sk: SKIN.length, e: EYES.length, hs: HAIR.length, hc: HAIR_COLOR.length, fh: FACIAL.length, hat: HATS.length, htc: HAT_COLOR.length, gl: GLASSES.length, sh: SHIRT.length, bg: BG.length };
export const optionCount = key => SIZES[key];

export function decode(code) {
  const parts = String(code || "").split(".");
  const a = {};
  FIELDS.forEach((f, i) => { const n = parseInt(parts[i], 10); a[f] = n >= 0 && n < SIZES[f] ? n : 0; });
  return a;
}
export const encode = a => FIELDS.map(f => a[f] || 0).join(".");

// Ready-made characters. Everything can still be changed afterwards.
const P = (name, o) => ({ name, code: encode({ k: 0, g: 0, sk: 1, e: 0, hs: 0, hc: 1, fh: 0, hat: 0, htc: 0, gl: 0, sh: 0, bg: 0, ...o }) });
export const PRESETS = [
  P("Cowboy", { sk: 3, hs: 0, hc: 2, fh: 1, hat: 1, htc: 0, sh: 1, bg: 6 }),
  P("Cowgirl", { g: 1, sk: 1, hs: 5, hc: 3, hat: 1, htc: 1, sh: 2, bg: 3 }),
  P("Cool guy", { sk: 4, hs: 2, hc: 0, gl: 1, sh: 3, bg: 2 }),
  P("Cool girl", { g: 1, sk: 2, hs: 6, hc: 0, gl: 1, sh: 5, bg: 1 }),
  P("Grim Reaper", { k: 1, bg: 5 }),
  P("Snowman", { k: 2, hat: 3, htc: 2, sh: 1, bg: 7 }),
  P("Kenji", { sk: 2, e: 1, hs: 0, hc: 0, sh: 0, bg: 1 }),
  P("Mei", { g: 1, sk: 2, e: 1, hs: 5, hc: 0, sh: 1, bg: 4 }),
  P("Marcus", { sk: 5, hs: 1, hc: 0, fh: 2, sh: 4, bg: 2 }),
  P("Amara", { g: 1, sk: 5, hs: 3, hc: 0, sh: 3, bg: 6 }),
  P("Darnell", { sk: 4, hs: 9, hc: 0, fh: 3, gl: 1, sh: 1, bg: 0 }),
  P("Zola", { g: 1, sk: 4, hs: 4, hc: 1, sh: 2, bg: 3 }),
  P("Rosa", { g: 1, sk: 3, hs: 8, hc: 4, sh: 6, bg: 0 }),
  P("Gran", { g: 1, sk: 0, hs: 7, hc: 6, gl: 2, sh: 5, bg: 7 }),
  P("Old Pete", { sk: 1, hs: 10, fh: 2, hc: 5, gl: 2, sh: 3, bg: 4 }),
  P("The Dealer", { sk: 0, hs: 2, hc: 1, fh: 3, hat: 3, htc: 2, sh: 3, bg: 1 }),
  P("Fox", { k: 3, bg: 0 }),
  P("Cat", { k: 4, bg: 2 }),
  P("Bear", { k: 5, bg: 6 }),
  P("Owl", { k: 6, bg: 4 }),
  P("Robot", { k: 7, bg: 5 })
];
export const DEFAULT_AVATAR = PRESETS[2].code;

// For bots: a ready-made character most of the time, otherwise someone random.
export function randomAvatar(rand = Math.random) {
  if (rand() < 0.5) return PRESETS[Math.floor(rand() * PRESETS.length)].code;
  const a = {};
  FIELDS.forEach(f => a[f] = Math.floor(rand() * SIZES[f]));
  if (rand() < 0.75) a.k = 0;          // mostly people
  if (rand() < 0.6) a.hat = 0;
  if (rand() < 0.6) a.gl = 0;
  if (a.g === 1) a.fh = 0;
  if (rand() < 0.8 && a.hc > 6) a.hc = Math.floor(rand() * 5);
  return encode(a);
}

// ---------- drawing ----------
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * (1 + amt))));
  return "#" + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, "0")).join("");
}
const torso = fill => `<path d="M14 100 C16 83 30 76 50 76 C70 76 84 83 86 100Z" fill="${fill}"/>`;

const HAIR_BACK = {
  3: c => `<g fill="${c}"><circle cx="50" cy="31" r="22"/><circle cx="31" cy="40" r="12"/><circle cx="69" cy="40" r="12"/><circle cx="37" cy="22" r="12"/><circle cx="63" cy="22" r="12"/><circle cx="50" cy="16" r="12"/></g>`,
  5: c => `<path d="M29 44 C27 22 39 17 50 17 C61 17 73 22 71 44 L73 82 Q63 86 60 78 L60 54 L40 54 L40 78 Q37 86 27 82Z" fill="${c}"/>`,
  6: c => `<path d="M28.5 44 C27 21 40 17 50 17 C60 17 73 21 71.5 44 L72 63 Q72 67 67 66 L33 66 Q28 67 28 63Z" fill="${c}"/>`,
  7: c => `<circle cx="50" cy="16" r="9" fill="${c}"/><circle cx="50" cy="16" r="9" fill="#000" opacity=".12"/>`,
  8: c => `<path d="M63 24 Q82 30 77 57 Q75 67 68 71 Q72 54 65 37Z" fill="${c}"/>`,
  9: c => `<g fill="${c}">${[29, 34.5, 65.5, 71].map(x => `<rect x="${x - 2.4}" y="34" width="4.8" height="${x < 50 ? 44 : 44}" rx="2.4"/>`).join("")}</g>`
};
const HAIR_FRONT = {
  0: c => `<path d="M30.5 47 C29 30 37 22.5 50 22.5 C63 22.5 71 30 69.5 47 C67 39 64 34 58 32.5 C52 35 42 35 36 33 C33 36 31.5 41 30.5 47Z" fill="${c}"/>`,
  1: c => `<path d="M31 44 C30 30 38 24 50 24 C62 24 70 30 69 44 C67 37 62 32 50 32 C38 32 33 37 31 44Z" fill="${c}" opacity=".7"/>`,
  2: c => `<path d="M30.5 47 C28 28 38 20.5 52 21 C65 21.5 72 30 69.5 47 C68 38 65 33 60 31 C54 33.5 46 29 40 31.5 C35 33.5 32 39 30.5 47Z" fill="${c}"/><path d="M44 25 Q55 23 63 28" stroke="#fff" stroke-opacity=".18" stroke-width="1.5" fill="none"/>`,
  3: c => `<path d="M31 45 C30 33 38 27 50 27 C62 27 70 33 69 45 C66 37 60 33.5 50 33.5 C40 33.5 34 37 31 45Z" fill="${c}"/>`,
  4: c => `<g fill="${c}"><ellipse cx="50" cy="31" rx="18" ry="9"/>${[195, 215, 235, 255, 275, 295, 315, 335].map(d => { const r = d * Math.PI / 180; return `<circle cx="${(50 + 18 * Math.cos(r)).toFixed(1)}" cy="${(41 + 17 * Math.sin(r)).toFixed(1)}" r="6.2"/>`; }).join("")}</g>`,
  5: c => `<path d="M30.5 48 C29 29 38 21.5 50 21.5 C62 21.5 71 29 69.5 48 C67 37 59 30.5 50 31 C46 35 38 39 30.5 48Z" fill="${c}"/>`,
  6: c => `<path d="M30.5 46 C29 27 39 21 50 21 C61 21 71 27 69.5 46 L68.5 37.5 C60 35 40 35 31.5 37.5Z" fill="${c}"/>`,
  7: c => `<path d="M30.5 46 C29 29 38 22 50 22 C62 22 71 29 69.5 46 C67 36 60 31 50 31 C40 31 33 36 30.5 46Z" fill="${c}"/>`,
  8: c => `<path d="M30.5 46 C29 29 38 22 50 22 C62 22 71 29 69.5 46 C67 36 60 31 50 31 C40 31 33 36 30.5 46Z" fill="${c}"/>`,
  9: c => `<path d="M30.5 45 C29 29 38 22.5 50 22.5 C62 22.5 71 29 69.5 45 C67 37 60 32 50 32 C40 32 33 37 30.5 45Z" fill="${c}"/><g stroke="#000" stroke-opacity=".18" stroke-width="1">${[38, 44, 50, 56, 62].map(x => `<path d="M${x} 24 L${x} 32"/>`).join("")}</g>`,
  10: () => `<ellipse cx="43" cy="30" rx="6" ry="3" fill="#fff" opacity=".18"/>`
};

function eyes(a, skin) {
  const out = [];
  for (const x of [42, 58]) {
    if (a.e === 1) {
      out.push(`<path d="M${x - 4} 47 Q${x} 44.2 ${x + 4} 47 Q${x} 49.2 ${x - 4} 47Z" fill="#fff"/><circle cx="${x}" cy="46.9" r="1.7" fill="#2a1c13"/><path d="M${x - 4.2} 47 Q${x} 43.9 ${x + 4.2} 47" stroke="${shade(skin, -.45)}" stroke-width="1.1" fill="none"/>`);
    } else {
      out.push(`<ellipse cx="${x}" cy="47" rx="3.5" ry="3.3" fill="#fff"/><circle cx="${x}" cy="47.3" r="2.1" fill="#2a1c13"/><circle cx="${x + .8}" cy="46.4" r=".7" fill="#fff"/>`);
    }
  }
  if (a.g === 1) out.push(`<path d="M38.3 46.2 l-2.3 -1.6 M61.7 46.2 l2.3 -1.6" stroke="#2a1c13" stroke-width="1" stroke-linecap="round"/>`);
  return out.join("");
}

function person(a) {
  const skin = SKIN[a.sk], hair = HAIR_COLOR[a.hc], woman = a.g === 1, bald = a.hs === 10;
  const brow = a.hc >= 5 && a.hc <= 6 ? "#8a8a8a" : shade(hair, a.hc === 3 ? -.35 : -.1);
  let s = "";
  if (!bald && HAIR_BACK[a.hs]) s += HAIR_BACK[a.hs](hair);
  s += torso(SHIRT[a.sh]);
  s += `<path d="M42 74 L50 84 L58 74Z" fill="${shade(skin, -.08)}"/>`;
  s += `<rect x="43" y="58" width="14" height="18" rx="5" fill="${shade(skin, -.1)}"/>`;
  s += `<ellipse cx="31" cy="49" rx="4" ry="5.5" fill="${shade(skin, -.06)}"/><ellipse cx="69" cy="49" rx="4" ry="5.5" fill="${shade(skin, -.06)}"/>`;
  s += woman
    ? `<path d="M31.5 44 C31.5 28 39.5 24.5 50 24.5 C60.5 24.5 68.5 28 68.5 44 C68.5 58 60 67.5 50 67.5 C40 67.5 31.5 58 31.5 44Z" fill="${skin}"/>`
    : `<path d="M31 44 C31 28 39 24.5 50 24.5 C61 24.5 69 28 69 44 C69 59 61 68 50 68 C39 68 31 59 31 44Z" fill="${skin}"/>`;
  if (woman) s += `<circle cx="38.5" cy="55" r="3.6" fill="#e2766c" opacity=".22"/><circle cx="61.5" cy="55" r="3.6" fill="#e2766c" opacity=".22"/>`;
  if (!woman && a.fh === 1) s += `<path d="M32 50 Q32 66 50 69 Q68 66 68 50 Q66 61 60 62 Q50 60 40 62 Q34 61 32 50Z" fill="${hair}" opacity=".3"/>`;
  if (!woman && a.fh === 2) s += `<path d="M31 45 Q30 71 50 73 Q70 71 69 45 Q67 58 61 60.5 Q55 56 50 57 Q45 56 39 60.5 Q33 58 31 45Z" fill="${hair}"/>`;
  s += eyes(a, skin);
  s += woman
    ? `<path d="M38 41.8 Q42 39 46 41.2 M54 41.2 Q58 39 62 41.8" stroke="${brow}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
    : `<path d="M37.5 41.5 Q42 39.2 46.5 41 M53.5 41 Q58 39.2 62.5 41.5" stroke="${brow}" stroke-width="2.3" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M50 47.5 Q48 53 49.6 54.6 Q51.4 55 52.3 53.8" stroke="${shade(skin, -.3)}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  if (!woman && a.fh === 3) s += `<path d="M42.5 58 Q46.5 54.5 50 56.3 Q53.5 54.5 57.5 58 Q53.5 57.6 50 58.6 Q46.5 57.6 42.5 58Z" fill="${hair}"/>`;
  s += woman
    ? `<path d="M45.2 59.2 Q50 57.6 54.8 59.2 Q50 64 45.2 59.2Z" fill="#b94a4f"/>`
    : `<path d="M45 59.5 Q50 63 55 59.5" stroke="#6b2f24" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
  if (HAIR_FRONT[a.hs]) s += HAIR_FRONT[a.hs](hair);
  return s;
}

const FUR = {
  3: f => `<path d="M30 36 L27 9 L47 26Z" fill="#e07a2e"/><path d="M70 36 L73 9 L53 26Z" fill="#e07a2e"/><path d="M32 30 L30.5 15 L42 26Z" fill="#3a2418"/><path d="M68 30 L69.5 15 L58 26Z" fill="#3a2418"/>
    ${torso("#e07a2e")}<path d="M38 100 Q38 82 50 78 Q62 82 62 100Z" fill="#fbf3ea"/>
    <path d="M23 40 Q26 23 50 21 Q74 23 77 40 Q77 57 50 74 Q23 57 23 40Z" fill="#e07a2e"/>
    <path d="M30 49 Q42 52 50 58 Q58 52 70 49 Q64 64 50 74 Q36 64 30 49Z" fill="#fbf3ea"/>
    <ellipse cx="50" cy="66" rx="3.4" ry="2.5" fill="#1d1d1d"/>
    <ellipse cx="41" cy="45" rx="2.6" ry="3.1" fill="#2a1c13"/><ellipse cx="59" cy="45" rx="2.6" ry="3.1" fill="#2a1c13"/><circle cx="41.8" cy="44" r=".8" fill="#fff"/><circle cx="59.8" cy="44" r=".8" fill="#fff"/>`,
  4: () => `${torso("#8d8f99")}<path d="M28 38 L29 13 L45 28Z" fill="#8d8f99"/><path d="M72 38 L71 13 L55 28Z" fill="#8d8f99"/><path d="M31 32 L31.5 19 L40 28Z" fill="#e8a5b0"/><path d="M69 32 L68.5 19 L60 28Z" fill="#e8a5b0"/>
    <ellipse cx="50" cy="48" rx="23" ry="20.5" fill="#8d8f99"/>
    <path d="M44 31 L46 37 M50 30 L50 37 M56 31 L54 37" stroke="#6c6e78" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="41" cy="46" rx="3.6" ry="4" fill="#a7d86d"/><ellipse cx="59" cy="46" rx="3.6" ry="4" fill="#a7d86d"/><ellipse cx="41" cy="46" rx="1" ry="3.3" fill="#111"/><ellipse cx="59" cy="46" rx="1" ry="3.3" fill="#111"/>
    <path d="M47.5 53.5 h5 l-2.5 3Z" fill="#e8a5b0"/><path d="M50 56.5 q-2.5 3.2 -5.2 1.6 M50 56.5 q2.5 3.2 5.2 1.6" stroke="#3a3a40" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    <path d="M38 55 L24 52 M38 57.5 L24 59 M62 55 L76 52 M62 57.5 L76 59" stroke="#eee" stroke-width=".8" stroke-linecap="round"/>`,
  5: () => `${torso("#8a5a36")}<circle cx="30" cy="29" r="8.5" fill="#8a5a36"/><circle cx="70" cy="29" r="8.5" fill="#8a5a36"/><circle cx="30" cy="29" r="4.3" fill="#c79a72"/><circle cx="70" cy="29" r="4.3" fill="#c79a72"/>
    <circle cx="50" cy="48" r="23" fill="#8a5a36"/><ellipse cx="50" cy="58" rx="10.5" ry="8.5" fill="#d2a77d"/>
    <ellipse cx="50" cy="54.5" rx="3.8" ry="2.7" fill="#2a1a10"/><path d="M50 57 V60.5 M46 61 Q50 64 54 61" stroke="#2a1a10" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <circle cx="41" cy="45" r="2.5" fill="#1d130c"/><circle cx="59" cy="45" r="2.5" fill="#1d130c"/><circle cx="41.8" cy="44.2" r=".7" fill="#fff"/><circle cx="59.8" cy="44.2" r=".7" fill="#fff"/>`,
  6: () => `<path d="M24 100 Q19 60 30 34 Q50 22 70 34 Q81 60 76 100Z" fill="#7a5a3c"/><path d="M31 33 L27 16 L41 28Z" fill="#5e4430"/><path d="M69 33 L73 16 L59 28Z" fill="#5e4430"/>
    <ellipse cx="50" cy="84" rx="15" ry="18" fill="#c8a982"/><path d="M42 78 l3 3 l3 -3 M52 78 l3 3 l3 -3 M47 86 l3 3 l3 -3" stroke="#7a5a3c" stroke-width="1.2" fill="none"/>
    <circle cx="41" cy="46" r="10.5" fill="#ead9bc"/><circle cx="59" cy="46" r="10.5" fill="#ead9bc"/>
    <circle cx="41" cy="46" r="6" fill="#f2c443"/><circle cx="59" cy="46" r="6" fill="#f2c443"/><circle cx="41" cy="46" r="3.2" fill="#111"/><circle cx="59" cy="46" r="3.2" fill="#111"/><circle cx="42" cy="45" r="1" fill="#fff"/><circle cx="60" cy="45" r="1" fill="#fff"/>
    <path d="M46.5 52 L53.5 52 L50 60Z" fill="#e0a030"/>`,
  7: () => `${torso("#9aa5b1")}<path d="M30 92 h40" stroke="#7c8794" stroke-width="2"/><circle cx="50" cy="88" r="3.4" fill="#5ee1ff"/>
    <rect x="44" y="62" width="12" height="16" fill="#7c8794"/>
    <path d="M50 24 V13" stroke="#7c8794" stroke-width="2.4"/><circle cx="50" cy="11" r="3.6" fill="#e5484d"/>
    <circle cx="26" cy="46" r="4.2" fill="#7c8794"/><circle cx="74" cy="46" r="4.2" fill="#7c8794"/>
    <rect x="27" y="24" width="46" height="42" rx="9" fill="#b9c2cc" stroke="#7c8794" stroke-width="1.5"/>
    <rect x="35" y="39" width="12" height="10" rx="3" fill="#1d2a35"/><rect x="53" y="39" width="12" height="10" rx="3" fill="#1d2a35"/>
    <circle cx="41" cy="44" r="2.8" fill="#5ee1ff"/><circle cx="59" cy="44" r="2.8" fill="#5ee1ff"/>
    <rect x="39" y="55" width="22" height="6" rx="2" fill="#1d2a35"/><path d="M44 55 v6 M50 55 v6 M56 55 v6" stroke="#5ee1ff" stroke-opacity=".6" stroke-width="1"/>`
};

function reaper() {
  return `<path d="M79 100 L75 6" stroke="#6b4a2a" stroke-width="3.2" stroke-linecap="round"/><path d="M75.5 8 Q57 0 37 13 Q57 8 74.5 17Z" fill="#cfd6dc"/>
    <path d="M13 100 C13 70 21 19 50 13 C79 19 87 70 87 100Z" fill="#1e1c24"/>
    <ellipse cx="50" cy="49" rx="17.5" ry="21.5" fill="#0b0a0e"/>
    <ellipse cx="50" cy="46" rx="13" ry="14" fill="#ece6d6"/><rect x="43" y="54" width="14" height="9" rx="3" fill="#ece6d6"/>
    <ellipse cx="44.5" cy="46" rx="3.7" ry="4.2" fill="#141217"/><ellipse cx="55.5" cy="46" rx="3.7" ry="4.2" fill="#141217"/>
    <circle cx="44.5" cy="46.5" r="1" fill="#e5484d"/><circle cx="55.5" cy="46.5" r="1" fill="#e5484d"/>
    <path d="M50 50.5 l-1.8 3.6 h3.6Z" fill="#141217"/><path d="M46.5 57.5 v5 M49 57.5 v5 M51.5 57.5 v5 M54 57.5 v5" stroke="#9a9488" stroke-width=".8"/>`;
}
function snowman(a) {
  const scarf = SHIRT[a.sh];
  return `<circle cx="50" cy="102" r="31" fill="#f4f7fb" stroke="#c8d5e2" stroke-width="1.2"/><circle cx="50" cy="86" r="2" fill="#222"/><circle cx="50" cy="95" r="2" fill="#222"/>
    <circle cx="50" cy="47" r="21" fill="#f7f9fc" stroke="#c8d5e2" stroke-width="1.2"/>
    <circle cx="43" cy="44" r="2.3" fill="#222"/><circle cx="57" cy="44" r="2.3" fill="#222"/>
    <path d="M50 49 L67 52.5 L50 55Z" fill="#e8812d"/>
    ${[[42, 58], [45.5, 60.6], [50, 61.6], [54.5, 60.6], [58, 58]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="#222"/>`).join("")}
    <path d="M29 66 Q50 75 71 66 L71 73 Q50 81 29 73Z" fill="${scarf}"/><path d="M60 72 L64 92 L71 90 L67 71Z" fill="${shade(scarf, -.2)}"/>`;
}

function hat(a) {
  const c = HAT_COLOR[a.htc];
  if (a.hat === 1) return `<path d="M33 30 C33 13 40 8 46 12.5 Q50 15.5 54 12.5 C60 8 67 13 67 30Z" fill="${c}"/><rect x="33" y="24.5" width="34" height="4.5" fill="${shade(c, -.4)}"/>
    <path d="M11 30 Q19 23 33 27.5 Q50 31.5 67 27.5 Q81 23 89 30 Q80 38 50 37 Q20 38 11 30Z" fill="${shade(c, -.12)}"/>`;
  if (a.hat === 2) return `<path d="M29 37 C29 17 40 11 50 11 C60 11 71 17 71 37Z" fill="${c}"/><rect x="28" y="31" width="44" height="9" rx="4.5" fill="${shade(c, -.18)}"/><circle cx="50" cy="10" r="4.5" fill="${shade(c, .15)}"/>`;
  if (a.hat === 3) return `<rect x="35" y="3" width="30" height="27" rx="2" fill="${c}"/><rect x="35" y="22" width="30" height="5" fill="${c === "#8c2b24" ? "#232326" : "#8c2b24"}"/><ellipse cx="50" cy="30" rx="24" ry="4.6" fill="${shade(c, -.1)}"/>`;
  return "";
}
function glasses(a) {
  if (a.gl === 1) return `<path d="M34.5 43.5 h13 v4.5 q0 5.5 -6.5 5.5 q-6.5 0 -6.5 -5.5Z M52.5 43.5 h13 v4.5 q0 5.5 -6.5 5.5 q-6.5 0 -6.5 -5.5Z" fill="#121214"/>
    <path d="M47.5 45 h5 M34.5 44.5 L30 45.5 M65.5 44.5 L70 45.5" stroke="#121214" stroke-width="1.8"/><path d="M37 46 l3 -1.5 M55 46 l3 -1.5" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>`;
  if (a.gl === 2) return `<circle cx="42" cy="47" r="5.3" fill="#fff" fill-opacity=".1" stroke="#2a2a2a" stroke-width="1.6"/><circle cx="58" cy="47" r="5.3" fill="#fff" fill-opacity=".1" stroke="#2a2a2a" stroke-width="1.6"/>
    <path d="M47.3 46.5 Q50 45 52.7 46.5 M36.7 46 L31 45 M63.3 46 L69 45" stroke="#2a2a2a" stroke-width="1.4" fill="none"/>`;
  return "";
}

let uid = 0;
// The avatar as an SVG string. `label` is announced to screen readers.
export function avatarSvg(code, label = "") {
  const a = decode(code), id = "av" + (++uid);
  let body = a.k === 0 ? person(a) : a.k === 1 ? reaper() : a.k === 2 ? snowman(a) : FUR[a.k](a);
  body += glasses(a) + hat(a);
  const aria = label ? `role="img" aria-label="${label.replace(/[<>"&]/g, "")}"` : `aria-hidden="true"`;
  return `<svg viewBox="0 0 100 100" ${aria}><defs><clipPath id="${id}"><circle cx="50" cy="50" r="50"/></clipPath></defs><g clip-path="url(#${id})"><rect width="100" height="100" fill="${BG[a.bg]}"/><circle cx="50" cy="38" r="40" fill="#fff" opacity=".07"/>${body}</g></svg>`;
}
