// What the table will look like right after you discard, worked out in the browser so the page can show the
// tile leaving your hand at once instead of waiting for the server. The server's answer replaces it a moment later.
// What happens next (whether somebody may claim the tile, or the next player draws) depends on hands this
// browser can't see, so the table is shown waiting until the server says which.
// Returns null for everything except a plain discard (claims, kongs and wins come from the server).
export function guess(view, seat, m) {
  if (!view || view.finished || view.turn !== seat || view.phase !== "discard" || !view.hand || !m || m.type !== "discard") return null;
  const t = String(m.tile), i = view.hand.indexOf(t);
  if (i < 0) return null;
  const out = structuredClone(view);
  out.hand.splice(i, 1);
  out.counts[seat] = out.hand.length;
  out.discards[seat].push({ t });
  out.last = { tile: t, by: seat };
  out.drawn = null;
  out.options = null;
  out.phase = "claim"; out.waiting = [];
  out.log.push({ type: "discard", seat, tile: t });
  if (out.log.length > 60) out.log.shift();
  out.logCount = view.logCount + 1;
  return out;
}
