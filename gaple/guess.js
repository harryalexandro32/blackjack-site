// What the table will look like right after your own tile or pass, worked out in the browser so the page can
// show it at once instead of waiting for the server. The server's answer replaces it a moment later.
// The other hands are unknown here. The rules look into them for one thing only: whether the table is blocked
// (nobody can play). So each other player is given a full set here, which never looks blocked; if the table
// really is blocked, the server's answer says so a moment later.
// Returns null when the move ends the game (the server settles the score).
import * as G from "../supabase/functions/_shared/gaple-engine.js";

export function guess(view, seat, m) {
  if (!view || view.finished || view.turn !== seat || !view.hand || !m) return null;
  try {
    const g = structuredClone(view);
    g.hands = view.counts.map((n, i) => (i === seat ? [...view.hand] : n ? G.newSet() : []));
    if (m.type === "play") G.play(g, seat, m.tile, m.end); else if (m.type === "pass") G.pass(g, seat); else return null;
    if (g.finished) return null;
    const out = structuredClone(G.viewFor(g, seat));
    out.counts = view.counts.map((n, i) => (i === seat ? g.hands[seat].length : n));
    return out;
  } catch { return null; }
}
