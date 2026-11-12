// What the room's "update" message carries, so browsers needn't ask for the table after every move:
//   c: the part of the table every player sees (never the room code)
//   p: each player's own part (their hand, their seat…), encrypted with a key made from that player's private
//      token, so nobody else on the channel can read it.
// sealCast returns null when there is nobody to tell or the message would be too big; browsers then fetch as before.
// M is the room's rules module (personalState). Each game's online.js opens its own part (openCast there).
const CAST_MAX = 120000;
const b64 = u => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

export async function sealCast(state, M) {
  try {
    const ids = Object.entries(state.players || {}).filter(([, p]) => p && !p.left && p.tokenHash).map(([id]) => id);
    if (!ids.length || ids.length > 16) return null;
    const views = ids.map(id => M.personalState(state, id));
    const keys = new Set();
    views.forEach(v => Object.keys(v).forEach(k => keys.add(k)));
    const common = {}, own = ids.map(() => ({}));
    for (const k of keys) {
      if (k === "code") continue;
      const js = views.map(v => JSON.stringify(v[k]));
      if (ids.length > 1 && js[0] !== undefined && js.every(j => j === js[0])) common[k] = views[0][k];
      else views.forEach((v, i) => { if (v[k] !== undefined) own[i][k] = v[k]; });
    }
    const enc = new TextEncoder(), p = {};
    for (let i = 0; i < ids.length; i++) {
      const raw = await crypto.subtle.digest("SHA-256", enc.encode("cast:" + state.players[ids[i]].tokenHash));
      const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(own[i]))));
      p[ids[i]] = b64(iv) + "." + b64(ct);
    }
    const cast = { c: common, p };
    return JSON.stringify(cast).length > CAST_MAX ? null : cast;
  } catch (e) { console.error("cast", e); return null; }
}
