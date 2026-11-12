// The Mahjong cheat sheets: "The basics" (how the game is played) and "Faan and points" (how a win is scored).
// Both are built from the same rules the game uses (the faan values and the payment table come straight from
// the engine), shown in a dialog, and can be printed or saved as a PDF on their own.
import * as M from "../supabase/functions/_shared/mahjong-engine.js";
import { tileSvg } from "./tiles.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const tiles = (codes, label) => {
  const row = el("span", "sheet-tiles");
  if (label) row.setAttribute("aria-label", label);
  codes.split(" ").forEach(c => { if (c === "|") { row.appendChild(el("span", "gap")); return; } const t = el("span", "tile"); t.innerHTML = tileSvg(c); t.title = M.tileName(c); row.appendChild(t); });
  return row;
};
const section = (title, ...kids) => { const s = el("section", "sheet-sec"); s.appendChild(el("h3", "", title)); kids.forEach(k => s.appendChild(typeof k === "string" ? el("p", "", k) : k)); return s; };
const bullets = items => { const ul = el("ul"); items.forEach(i => { const li = el("li"); if (typeof i === "string") li.textContent = i; else i.forEach(x => li.append(x)); ul.appendChild(li); }); return ul; };
const pair = (label, node) => { const d = el("div", "sheet-pair"); d.appendChild(el("b", "", label)); d.appendChild(node); return d; };
const table = (head, rows) => {
  const t = el("table", "sheet-table"), h = t.createTHead().insertRow();
  head.forEach(x => h.appendChild(el("th", "", x)));
  const b = t.createTBody();
  rows.forEach(r => { const tr = b.insertRow(); r.forEach(x => { const td = tr.insertCell(); if (typeof x === "string" || typeof x === "number") td.textContent = x; else td.appendChild(x); }); });
  return t;
};

function basics() {
  const root = el("div", "sheet");
  root.appendChild(el("p", "sheet-lead", "Hong Kong Mahjong for four players, as it is played on this site."));
  root.appendChild(section("The tiles (144)",
    pair("Dots, 1 to 9", tiles("1p 2p 3p 4p 5p 6p 7p 8p 9p")),
    pair("Bamboo, 1 to 9", tiles("1s 2s 3s 4s 5s 6s 7s 8s 9s")),
    pair("Characters, 1 to 9", tiles("1m 2m 3m 4m 5m 6m 7m 8m 9m")),
    pair("Winds: East, South, West, North", tiles("1z 2z 3z 4z")),
    pair("Dragons: white, green, red", tiles("5z 6z 7z")),
    pair("Flowers and seasons (bonus tiles)", tiles("1f 2f 3f 4f | 5f 6f 7f 8f")),
    "There are four of every suit tile, wind and dragon, and one of each flower and season. Flowers and seasons are never part of your hand: when you draw one it is set aside and you draw a replacement."));
  root.appendChild(section("The goal",
    "Be the first to hold a complete hand: four sets and a pair, 14 tiles in all.",
    pair("A complete hand", tiles("2p 3p 4p | 6s 6s 6s | 7m 8m 9m | 7z 7z 7z | 1z 1z")),
    "Two special hands also win: seven pairs, and thirteen orphans (a 1 and a 9 of every suit, every wind and every dragon, with one of them doubled)."));
  root.appendChild(section("The three kinds of set",
    pair("Chow: three in a row, one suit", tiles("4s 5s 6s")),
    pair("Pung: three the same", tiles("8p 8p 8p")),
    pair("Kong: four the same", tiles("5z 5z 5z 5z")),
    "Winds and dragons can't form a chow. A kong still counts as one set, so you draw a replacement tile for the extra one."));
  root.appendChild(section("Your turn",
    bullets([
      "Draw a tile from the wall. The dealer starts with 14 tiles and simply discards first.",
      "If your hand is complete, declare Mahjong.",
      "If you hold four of a kind, or draw the fourth tile of a pung you have laid down, you may declare a kong and draw a replacement.",
      "Otherwise throw one tile away, face up. Play passes to the next player, unless somebody claims your tile."
    ])));
  root.appendChild(section("Claiming a discard",
    "When another player throws a tile you need, you can take it instead of waiting for your turn:",
    table(["Claim", "Who may take it", "What you need"], [
      ["Win (Mahjong)", "Anyone", "The tile completes your hand"],
      ["Pung", "Anyone", "Two of the same tile in hand"],
      ["Kong", "Anyone", "Three of the same tile in hand"],
      ["Chow", "Only the player right after the one who threw it", "Two tiles that make a run with it"]
    ]),
    bullets([
      "If several players want the same tile, a win beats a pung or kong, and a pung or kong beats a chow. If two players can win on it, the one who plays sooner after the thrower takes it.",
      "A claimed set is laid face up for everyone to see and stays there.",
      "After a pung or chow you don't draw: you throw a tile, and play carries on from you. After a kong you draw a replacement first.",
      "When somebody adds a fourth tile to a pung they have laid down, you may take that tile to win. This is called robbing the kong."
    ])));
  root.appendChild(section("Seats, winds and the deal",
    bullets([
      "The dealer is East; the next players in turn are South, West and North. That is your seat wind for the hand.",
      "The round also has a wind, shown in the middle of the table. It starts as East and moves on once everyone has dealt.",
      "The dealer deals again after winning the hand or after a drawn hand. Otherwise the deal passes to the next player.",
      "If the wall runs out before anyone wins, the hand is drawn and nobody scores."
    ])));
  root.appendChild(section("Good habits for a first game",
    bullets([
      "Throw lonely winds first, then lonely 1s and 9s. Keep dragons and your own winds a little longer: a pung of them is worth faan.",
      "Keep pairs and neighbours. Two tiles in a row such as 4-5 can be finished by a 3 or a 6; a 1-2 or a 4-6 can be finished by only one tile.",
      "Don't claim everything. Each claim shows a set to the table, costs you the concealed-hand faan, and leaves fewer tiles to change your mind with.",
      "Watch the discards. A tile you can see three times can't complete your pung any more.",
      "Late in the hand, a tile that was thrown before and not claimed is a safer throw than a fresh one.",
      "If the table needs 3 faan to win, pick a way to earn them early (see the other sheet). A complete hand without enough faan can't win."
    ])));
  return root;
}

const FAAN_NOTES = {
  self: "You drew the winning tile yourself.",
  concealed: "You claimed no discard for a set (a kong made from your own four tiles still counts as concealed).",
  noFlowers: "You hold no flower or season.",
  ownFlower: "The flower with your seat's number: 1 East, 2 South, 3 West, 4 North.",
  ownSeason: "The season with your seat's number, counted the same way.",
  allFlowers: "All four flowers.",
  allSeasons: "All four seasons.",
  dragon: "A pung or kong of one dragon. Each dragon set counts.",
  seatWind: "A pung or kong of your own seat wind.",
  roundWind: "A pung or kong of the round wind. If it is also your seat wind, both count.",
  allChows: "All four sets are chows.",
  lastWall: "You drew the very last tile of the wall and it won.",
  lastDiscard: "You won on the discard that followed the last tile of the wall.",
  kongWin: "You won on the replacement tile drawn after a kong.",
  robbing: "You won on a tile another player was adding to a pung.",
  allPungs: "All four sets are pungs or kongs.",
  mixed: "Every suit tile is from one suit, with winds or dragons beside them.",
  sevenPairs: "Seven pairs instead of four sets.",
  small3: "Pungs of two dragons and a pair of the third. The two dragon pungs are not counted again.",
  pure: "Every tile is from one suit: no winds, no dragons.",
  big3: "Pungs of all three dragons. The dragon pungs are not counted again."
};
const LIMIT_NOTES = {
  thirteen: "A 1 and a 9 of every suit, every wind and every dragon, with one of them doubled.",
  honors: "Only winds and dragons.",
  bigWinds: "Pungs of all four winds.",
  smallWinds: "Pungs of three winds and a pair of the fourth.",
  gates: "1-1-1-2-3-4-5-6-7-8-9-9-9 of one suit, all concealed, plus any one more tile of that suit.",
  fourConcealed: "Four pungs none of which was claimed, won by your own draw or by completing the pair.",
  terminals: "Pungs of 1s and 9s only.",
  allKongs: "Four kongs.",
  heavenly: "The dealer's first 14 tiles are already a complete hand.",
  earthly: "A player other than the dealer completes the hand with their very first draw, before anyone has claimed a tile."
};

function faan() {
  const root = el("div", "sheet");
  root.appendChild(el("p", "sheet-lead", "How a winning hand is scored on this site. Only the winner scores."));
  root.appendChild(section("How it works",
    bullets([
      "Every scoring feature of the winning hand is worth a number of faan. Add them up.",
      `The total is capped at ${M.LIMIT} faan. A few rare hands are worth the full ${M.LIMIT} whatever else they hold.`,
      "The table below turns faan into points, and points into pretend dollars at the rate the table chose.",
      "A table may require at least 3 faan to win. A complete hand worth less than that can't declare Mahjong."
    ])));
  const pay = M.PAY.map((p, f) => [f === M.LIMIT ? `${f} (limit)` : String(f), String(p), `${p} from each of the three`, `${p * 2} from the thrower`]);
  root.appendChild(section("From faan to points",
    table(["Faan", "Points", "You draw the winning tile", "You win off a discard"], pay),
    "Self-drawn, all three other players pay you the points. Off a discard, only the player who threw the tile pays, and pays double; the other two pay nothing. A self-drawn win therefore brings in more, and adds 1 faan as well."));
  const byValue = {};
  Object.entries(M.FAAN).forEach(([k, [label, f]]) => (byValue[f] ||= []).push([label, FAAN_NOTES[k] || ""]));
  const rows = [];
  Object.keys(byValue).map(Number).sort((a, b) => a - b).forEach(f => byValue[f].forEach(([label, note]) => rows.push([String(f), label, note])));
  root.appendChild(section("What earns faan", table(["Faan", "Feature", "What it means"], rows)));
  root.appendChild(section(`Limit hands (${M.LIMIT} faan each)`, table(["Hand", "What it is"], Object.entries(M.LIMITS).map(([k, label]) => [label, LIMIT_NOTES[k] || ""]))));
  root.appendChild(section("Easy ways to reach 3 faan",
    bullets([
      "Mixed one suit: collect one suit plus winds and dragons. 3 faan by itself.",
      "All pungs: four pungs and a pair. 3 faan by itself.",
      "A dragon pung (1), a concealed hand (1) and a self-drawn win (1).",
      "A concealed hand of all chows (1 + 1) that you draw yourself (1), or with no flowers (1).",
      "Two honour pungs, such as a dragon and your seat wind (1 + 1), plus any one of: self-drawn, no flowers, your own flower."
    ])));
  root.appendChild(section("A worked example",
    pair("You draw the last tile yourself, with no flowers and nothing claimed", tiles("2s 3s 4s | 5s 5s 5s | 7s 8s 9s | 6z 6z 6z | 1z 1z")),
    bullets([
      "Mixed one suit (bamboo with a dragon and a wind): 3",
      "Dragon pung (green): 1",
      "Concealed hand: 1",
      "Self-drawn: 1",
      "No flowers: 1",
      `Total 7 faan = ${M.PAY[7]} points from each of the three other players, ${M.PAY[7] * 3} in all.`
    ])));
  return root;
}

const SHEETS = { basics: { title: "Mahjong: the basics", build: basics }, faan: { title: "Mahjong: faan and points", build: faan } };
let current = "basics";

function show(which) {
  current = SHEETS[which] ? which : "basics";
  const dlg = document.getElementById("sheetDlg"), body = document.getElementById("sheetBody");
  document.getElementById("sheetTitle").textContent = SHEETS[current].title;
  body.innerHTML = ""; body.appendChild(SHEETS[current].build()); body.scrollTop = 0;
  dlg.querySelectorAll("[data-sheet-tab]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.sheetTab === current)));
}

export function openSheet(which = current) {
  const dlg = document.getElementById("sheetDlg");
  show(which);
  if (!dlg.open) dlg.showModal();
}

// "Save as PDF" goes through the browser's print dialog, which offers "Save as PDF" as a destination.
// Only the sheet is printed: a copy of it is placed in #printArea and the print styles hide everything else.
function savePdf() {
  let area = document.getElementById("printArea");
  if (!area) { area = el("div"); area.id = "printArea"; document.body.appendChild(area); }
  area.innerHTML = "";
  area.appendChild(el("h1", "", SHEETS[current].title));
  area.appendChild(SHEETS[current].build());
  area.appendChild(el("p", "sheet-foot", "The Card Room · thecardroom.vercel.app"));
  const title = document.title;
  document.title = SHEETS[current].title;                 // the suggested file name
  const done = () => { document.title = title; document.documentElement.classList.remove("print-sheet"); window.removeEventListener("afterprint", done); };
  document.documentElement.classList.add("print-sheet");
  window.addEventListener("afterprint", done);
  window.print();
}

export function initSheet() {
  const dlg = document.getElementById("sheetDlg");
  dlg.querySelectorAll("[data-sheet-tab]").forEach(b => (b.onclick = () => show(b.dataset.sheetTab)));
  document.getElementById("sheetPdf").onclick = savePdf;
  document.querySelectorAll("[data-open-sheet]").forEach(b => (b.onclick = () => openSheet(b.dataset.openSheet || undefined)));
}
