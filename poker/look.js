// The avatar picker: ready-made characters plus every part to change. openLook(code) resolves to the new code, or null.
import * as A from "./avatars.js";

const $ = id => document.getElementById(id);
const person = a => a.k === 0;

// Each row of the editor. "tiles" show a small preview of that choice; "swatch" rows are colors.
const ROWS = [
  { key: "k", label: "Character", tiles: A.KINDS },
  { key: "g", label: "Look", tiles: ["Man", "Woman"], when: person },
  { key: "sk", label: "Skin", swatch: A.SKIN, names: A.SKIN_NAMES, when: person },
  { key: "e", label: "Eyes", tiles: A.EYES, when: person, zoom: true },
  { key: "hs", label: "Hair", tiles: A.HAIR, when: person },
  { key: "hc", label: "Hair color", swatch: A.HAIR_COLOR, when: a => person(a) && a.hs !== 10 },
  { key: "fh", label: "Facial hair", tiles: A.FACIAL, when: a => person(a) && a.g === 0 },
  { key: "hat", label: "Hat", tiles: A.HATS },
  { key: "htc", label: "Hat color", swatch: A.HAT_COLOR, when: a => a.hat > 0 },
  { key: "gl", label: "Glasses", tiles: A.GLASSES },
  { key: "sh", label: "Shirt", swatch: A.SHIRT, when: a => person(a) || a.k === 2, labelFor: a => a.k === 2 ? "Scarf" : "Shirt" },
  { key: "bg", label: "Background", swatch: A.BG }
];

let cur = null, resolveFn = null;

function draw() {
  $("lookPreview").innerHTML = A.avatarSvg(A.encode(cur), "Your avatar");
  const code = A.encode(cur);
  $("lookPresets").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.code === code));
  const box = $("lookFields");
  box.innerHTML = "";
  for (const row of ROWS) {
    if (row.when && !row.when(cur)) continue;
    const wrap = document.createElement("div");
    wrap.className = "look-row";
    const label = row.labelFor ? row.labelFor(cur) : row.label;
    wrap.innerHTML = `<span class="label">${label}</span><div class="look-opts ${row.swatch ? "swatches" : "tiles"}" role="group" aria-label="${label}"></div>`;
    const opts = wrap.lastChild;
    const list = row.swatch || row.tiles;
    list.forEach((item, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-pressed", cur[row.key] === i);
      if (row.swatch) {
        b.className = "swatch"; b.style.background = item;
        b.setAttribute("aria-label", row.names ? row.names[i] : `${label} ${i + 1}`);
        b.title = row.names ? row.names[i] : "";
      } else {
        b.className = "tile" + (row.zoom ? " zoom" : "");
        const trial = { ...cur, [row.key]: i };
        if (row.key === "k" && i > 0) trial.hat = 0, trial.gl = 0;
        b.innerHTML = `<span class="av">${A.avatarSvg(A.encode(trial))}</span><span>${item}</span>`;
      }
      b.onclick = () => {
        cur[row.key] = i;
        if (row.key === "g" && i === 1) cur.fh = 0;
        draw();
      };
      opts.appendChild(b);
    });
    box.appendChild(wrap);
  }
}

function setup() {
  const pre = $("lookPresets");
  A.PRESETS.forEach(p => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tile"; b.dataset.code = p.code;
    b.innerHTML = `<span class="av">${A.avatarSvg(p.code)}</span><span>${p.name}</span>`;
    b.onclick = () => { cur = A.decode(p.code); draw(); };
    pre.appendChild(b);
  });
  $("lookRandom").onclick = () => { cur = A.decode(A.randomAvatar()); draw(); };
  $("lookDlg").addEventListener("close", () => {
    const r = resolveFn; resolveFn = null;
    if (r) r($("lookDlg").returnValue === "save" ? A.encode(cur) : null);
  });
}
let ready = false;

export function openLook(code) {
  if (!ready) { setup(); ready = true; }
  cur = A.decode(code || A.DEFAULT_AVATAR);
  draw();
  $("lookDlg").returnValue = "";
  $("lookDlg").showModal();
  $("lookFields").scrollTop = 0;
  return new Promise(res => { resolveFn = res; });
}
