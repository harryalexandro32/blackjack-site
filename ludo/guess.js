// What the table will look like right after your own move, worked out in the browser so the page can show it
// at once instead of waiting for the server. The server's answer replaces it a moment later.
// Returns null when the move can't be predicted here (a dice roll, or a move that ends the game).
import * as L from "../supabase/functions/_shared/ludo-engine.js";

export function guess(view, seat, m) {
  if (!view || view.finished || view.turn !== seat || !m || m.type !== "move") return null;
  try {
    const g = structuredClone(view), had = g.log.length;
    L.act(g, seat, { type: "move", token: m.token });
    if (g.finished) return null;
    const out = L.viewFor(g, seat);
    out.logCount = view.logCount + (g.log.length - had);
    return structuredClone(out);
  } catch { return null; }
}
