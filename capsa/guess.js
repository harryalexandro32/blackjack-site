// What the table will look like right after your own play or pass, worked out in the browser so the page can
// show it at once instead of waiting for the server. The server's answer replaces it a moment later.
// The other hands are unknown here (only how many cards each holds), which is all the rules need for one move.
// Returns null when the move ends the game (the server settles the score).
import * as C from "../supabase/functions/_shared/capsa-engine.js";

export function guess(view, seat, m) {
  if (!view || view.finished || view.turn !== seat || !view.hand || !m) return null;
  try {
    const g = structuredClone(view);
    g.hands = view.counts.map((n, i) => (i === seat ? [...view.hand] : new Array(n).fill("??")));
    if (m.type === "play") C.play(g, seat, m.cards); else if (m.type === "pass") C.pass(g, seat); else return null;
    if (g.finished) return null;
    return structuredClone(C.viewFor(g, seat));
  } catch { return null; }
}
