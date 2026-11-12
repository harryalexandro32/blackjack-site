// The Mahjong coach: the advice behind the Hint button, and the reasons for it in plain words.
// It judges like the Expert bot, from what you can see only: your tiles, the melds, the flowers and the discards.
//   advise(view) → null when there is no hand in play, otherwise
//     { move, short, lines }   move is the one to make (null when it isn't your decision), short is one sentence
//                              for the status line, lines are the coach's explanation
//   review(view, tile) → a sentence about a tile you threw against the coach's advice, or null
import * as M from "../supabase/functions/_shared/mahjong-engine.js";
import { mahjongMove, plan, unseen } from "../supabase/functions/_shared/mahjong-bot.js";

const name = t => M.tileName(t);
const SUIT = { m: "characters", p: "dots", s: "bamboo" };
const list = tiles => { const n = tiles.map(name); return n.length <= 5 ? n.join(", ") : n.slice(0, 5).join(", ") + ` and ${n.length - 5} more`; };

// The table as the bots' judgement wants it, built from your own view (the other hands stay empty).
function tableFor(view) {
  const g = view.game, me = view.me, o = g.options;
  const claiming = !!(o && (o.kind === "claim" || o.kind === "rob"));
  let opts = null;
  if (claiming) { opts = { ...o }; delete opts.kind; delete opts.tile; }
  return {
    no: g.no, hands: g.counts.map((n, i) => (i === me ? g.hand.slice() : [])), melds: g.melds, flowers: g.flowers, discards: g.discards, wall: { length: g.wallLeft },
    turn: g.turn, phase: g.phase, drawn: g.drawn, dealer: g.dealer, round: g.round, minFaan: g.minFaan, last: g.last, kong: g.kong,
    claims: claiming ? { [me]: { opts, decision: null } } : null,
    fresh: [false, false, false, false], anyClaim: true, afterKong: false, lastTile: g.wallLeft === 0, finished: null
  };
}

// How far a hand is from ready, and which unseen tiles bring it closer.
function reach(hand, melds, left) {
  const c = M.counts(hand), sh = M.shanten(c, melds);
  const kinds = [];
  let n = 0;
  for (let i = 0; i < 34; i++) {
    if (!left[i]) continue;
    c[i]++;
    if (M.shanten(c, melds) < sh) { n += left[i]; kinds.push(M.tileAt(i)); }
    c[i]--;
  }
  return { sh, n, kinds };
}
const away = sh => sh < 0 ? "complete" : sh === 0 ? "ready (one tile from a complete hand)" : sh === 1 ? "1 tile away from ready" : `${sh} tiles away from ready`;
const helps = r => r.n ? `${r.n} unseen tile${r.n === 1 ? "" : "s"} would ${r.sh === 0 ? "complete it" : "bring it closer"}: ${list(r.kinds)}.` : "No unseen tile helps it any more, so the shape has to change.";

function planLine(t, me, p) {
  const need = t.minFaan || 0, seat = M.WIND_NAMES[M.seatWindOf(t, me)], round = M.WIND_NAMES[t.round];
  if (p.kind === "flush") return `Plan: one suit. Most of your tiles are ${SUIT[p.suit]}, and a hand of one suit plus winds and dragons is worth 3 faan (7 with no winds or dragons at all).`;
  if (p.kind === "pungs") return "Plan: all pungs. You hold a lot of pairs, and four pungs with a pair is worth 3 faan.";
  if (p.kind === "value") return `Plan: collect faan. This table needs ${need} faan to win, so hold on to dragons, your seat wind (${seat}) and the round wind (${round}): a pung of any of them is 1 faan.`;
  return "Plan: finish fast. Any complete hand wins at this table, so take the shortest road to four sets and a pair.";
}

const payLine = (faan, self) => {
  const pts = M.PAY[Math.min(M.LIMIT, faan)];
  return self ? `Self-drawn, each of the other three pays you ${pts} point${pts === 1 ? "" : "s"}.` : `Won off a discard, the player who threw it pays you ${pts * 2} points.`;
};

function discardLines(t, me, tile, p, left) {
  const hand = t.hands[me], melds = t.melds[me].length, lines = [];
  const rest = hand.slice(); rest.splice(rest.indexOf(tile), 1);
  const r = reach(rest, melds, left);
  lines.push(`Throw the ${name(tile)}. That leaves you ${away(r.sh)}. ${helps(r)}`);
  // why this tile and not another
  const copies = hand.filter(x => x === tile).length, i = M.indexOf(tile);
  if (p.kind === "flush" && !M.isHonor(tile) && tile[1] !== p.suit) lines.push(`It isn't ${SUIT[p.suit]}, so it has no place in a one-suit hand.`);
  else if (M.isHonor(tile) && copies === 1) lines.push(p.valueHonor(i) ? "A single dragon or wind only becomes a set if you find two more of it, and your other tiles are closer to a set than that." : "A single wind that isn't yours can only become a set with two more of it, and it earns no faan even then. Lonely winds go first.");
  else if (M.isTerminal(tile) && copies === 1) lines.push("A 1 or a 9 fits into a single run (1-2-3 or 7-8-9), while a middle tile fits into three. Edge tiles are the weakest of a suit.");
  // the runner-up, when it is clearly worse
  const others = [...new Set(hand)].filter(x => x !== tile).map(x => { const h = hand.slice(); h.splice(h.indexOf(x), 1); return { x, r: reach(h, melds, left) }; })
    .sort((a, b) => a.r.sh - b.r.sh || b.r.n - a.r.n);
  const worse = others.find(o => o.r.sh > r.sh || o.r.n < r.n);
  const reasoned = lines.length > 1;
  if (others.length && others[0].r.sh === r.sh && others[0].r.n >= r.n && worse !== others[0]) { if (!reasoned) lines.push(`Throwing the ${name(others[0].x)} would leave just as many helpful tiles, so this one is a close call.`); }
  else if (worse && worse.r.sh === r.sh) lines.push(`For comparison, throwing the ${name(worse.x)} would leave only ${worse.r.n} helpful tile${worse.r.n === 1 ? "" : "s"}.`);
  else if (worse) lines.push(`For comparison, throwing the ${name(worse.x)} would put you a step further from ready.`);
  if (t.wall.length < 30) {
    const thrown = t.discards.some(d => d.some(x => x.t === tile));
    lines.push(thrown ? "The wall is getting short. This tile has been thrown before and nobody won on it, so it's on the safer side." : "The wall is getting short, so somebody may be ready. When two throws are equally good for you, pick the one that has been thrown before.");
  }
  return lines;
}

function claimLines(t, me, o, m, p) {
  const hand = t.hands[me], melds = t.melds[me].length, c = M.counts(hand), before = M.shanten(c, melds);
  const tile = o.tile, i = M.indexOf(tile), lines = [];
  const afterClaim = remove => {
    const cc = c.slice(); remove.forEach(x => cc[M.indexOf(x)]--);
    let best = 99;
    for (let k = 0; k < 34; k++) if (cc[k]) { cc[k]--; best = Math.min(best, M.shanten(cc, melds + 1)); cc[k]++; }
    return best;
  };
  const exposedAlready = t.melds[me].some(x => !x.concealed);
  const openCost = exposedAlready ? "" : " The price: your hand stops being concealed (that is 1 faan gone), and everyone can see the set.";
  const worth = p.valueHonor(i) ? ` A pung of ${M.isDragon(tile) ? "dragons" : "this wind"} is worth 1 faan on its own.` : "";
  if (m.claim === "kong") {
    lines.push(`Take the kong of ${name(tile)}. Four of a kind is a set, and you draw a replacement tile for the fourth.${worth}${openCost}`);
  } else if (m.claim === "pung") {
    const a = afterClaim([tile, tile]);
    lines.push(`Take the pung of ${name(tile)}. ${a < before ? `It takes you from ${away(before)} to ${away(a)}.` : `It doesn't bring you closer by itself, but it is faan you need.`}${worth}${openCost}`);
  } else if (m.claim === "chow") {
    const a = afterClaim(m.tiles);
    lines.push(`Take the chow with your ${name(m.tiles[0])} and ${name(m.tiles[1])}. It takes you from ${away(before)} to ${away(a)}.${openCost}`);
    if ((t.minFaan || 0) === 0) lines.push("Chows earn no faan, but at this table any complete hand wins, so speed matters most.");
  } else {
    // pass: say why each offer isn't worth it
    const flushOff = p.kind === "flush" && !M.isHonor(tile) && tile[1] !== p.suit;
    if (o.kind === "rob") lines.push("Pass. You can only take this tile to win, and it doesn't complete a hand that is allowed to win here.");
    else if (flushOff) lines.push(`Pass. The ${name(tile)} isn't ${SUIT[p.suit]}, and a set of it would break your one-suit hand.`);
    else {
      const bits = [];
      if (o.pung || o.kong) { const a = afterClaim([tile, tile]); bits.push(a < before ? "a pung would bring you closer, but not in a way that fits the plan" : "a pung wouldn't bring you any closer to a complete hand"); }
      if (o.chows) {
        const best = Math.min(...o.chows.map(afterClaim));
        bits.push(p.kind === "value" || p.kind === "pungs" ? `a chow earns no faan and doesn't fit the plan` : best < before ? "a chow would help a little, but there is a better use of this turn" : "a chow wouldn't bring you any closer either");
      }
      lines.push(`Pass: ${bits.join(", and ") || "taking it wouldn't help"}.`);
    }
    if (!exposedAlready) lines.push("Passing also keeps your hand concealed, which is worth 1 faan when you win.");
  }
  return lines;
}

export function advise(view) {
  const g = view && view.game;
  if (!g || g.finished || !g.hand || view.me < 0) return null;
  const me = view.me, t = tableFor(view), p = plan(t, me), left = unseen(t, me, "coach"), o = g.options;
  const lines = [planLine(t, me, p)];
  if (!o) {
    // not your decision: say where the hand stands
    const r = reach(t.hands[me], t.melds[me].length, left);
    lines.push(`You are ${away(r.sh)}. ${helps(r)}`);
    return { move: null, short: "", lines };
  }
  const m = mahjongMove(t, me, "coach");
  if (!m) return null;
  if (m.type === "win" || m.claim === "win") {
    const self = m.type === "win";
    return { move: m, short: "Hint: declare Mahjong!", lines: [`Declare Mahjong! Your hand is complete and worth ${o.win.faan} faan. ${payLine(o.win.faan, self)}`] };
  }
  if (m.type === "kong") {
    lines.push(`Declare the kong of ${name(m.tile)}. Four of a kind counts as a set, you draw a replacement tile, and those four tiles weren't doing other work in your hand.`);
    return { move: m, short: `Hint: declare a kong of ${name(m.tile)}.`, lines };
  }
  if (m.type === "discard") {
    lines.push(...discardLines(t, me, m.tile, p, left));
    return { move: m, short: `Hint: throw the ${name(m.tile)}.`, lines };
  }
  lines.push(...claimLines(t, me, o, m, p));
  const short = m.claim === "pass" ? "Hint: pass." : m.claim === "chow" ? `Hint: take the chow with your ${name(m.tiles[0])} and ${name(m.tiles[1])}.` : `Hint: take the ${m.claim}.`;
  return { move: m, short, lines };
}

// You threw `tile` although the coach advised another: what that cost, in one sentence (null when nothing to say).
export function review(view, tile) {
  const a = advise(view);
  if (!a || !a.move || a.move.type !== "discard" || a.move.tile === tile) return null;
  const me = view.me, t = tableFor(view), left = unseen(t, me, "coach"), melds = t.melds[me].length;
  const after = x => { const h = t.hands[me].slice(); const i = h.indexOf(x); if (i < 0) return null; h.splice(i, 1); return reach(h, melds, left); };
  const mine = after(tile), best = after(a.move.tile);
  if (!mine || !best) return null;
  if (mine.sh > best.sh) return `You threw the ${name(tile)}. That puts you ${away(mine.sh)}; throwing the ${name(a.move.tile)} would have kept you ${away(best.sh)}.`;
  if (mine.n < best.n) return `You threw the ${name(tile)}: ${mine.n} unseen tile${mine.n === 1 ? "" : "s"} now help your hand. The ${name(a.move.tile)} would have left ${best.n}.`;
  return `You threw the ${name(tile)}. By the numbers that is as good as my ${name(a.move.tile)}.`;
}
