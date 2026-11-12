// What the table will look like right after you play a card, worked out in the browser so the page can show it
// at once instead of waiting for the server. The server's answer replaces it a moment later.
// The other hands and the stock are unknown here (only their sizes), which is all the rules need for one card.
// Returns null for drawing (the card comes from the server) and for a card that ends the game.
import * as C from "../supabase/functions/_shared/cangkul-engine.js";

export function guess(view, seat, m) {
  if (!view || view.finished || view.turn !== seat || !view.hand || !m || m.type !== "play") return null;
  try {
    const g = structuredClone(view);
    g.hands = view.counts.map((n, i) => (i === seat ? [...view.hand] : new Array(n).fill("??")));
    g.stock = new Array(view.stock).fill("??");
    g.discard = new Array(view.discard).fill("??");
    C.play(g, seat, m.card);
    if (g.finished) return null;
    return structuredClone(C.viewFor(g, seat));
  } catch { return null; }
}
