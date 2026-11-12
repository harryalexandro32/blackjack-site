// What the board will look like right after your own move, worked out in the browser so the page can show it
// at once instead of waiting for the server. The server's answer replaces it a moment later.
// Returns null when the move ends the game (the server settles that).
import * as K from "../supabase/functions/_shared/checkers-engine.js";

export function guess(view, seat, m) {
  if (!view || view.finished || view.turn !== seat || !m) return null;
  try {
    const g = structuredClone(view);
    g.log = new Array(view.logCount).fill(null);
    K.play(g, seat, { from: m.from, to: m.to, path: m.path });
    if (g.finished) return null;
    return structuredClone(K.viewFor(g));
  } catch { return null; }
}
