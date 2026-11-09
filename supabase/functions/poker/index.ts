// Table server for every online game (poker tables, Capsa Banting and Mahjong rooms). Every request: load the room,
// check who's asking, apply the move with the shared rules, save both the secret and the public copy in one
// transaction (retrying if someone else saved first).
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as E from "../_shared/poker-engine.js";
import * as R from "../_shared/poker-room.js";
import * as CR from "../_shared/capsa-room.js";
import * as MR from "../_shared/mahjong-room.js";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const rng = (a: Uint32Array) => crypto.getRandomValues(a);
const shuffledDeck = () => E.shuffle(E.newDeck(), rng);
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[E.randomInt(CODE_CHARS.length, rng)]).join("");
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");
async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join("");
}
// Which game's rules a room follows.
const ROOMS: any = { capsa: CR, mahjong: MR };
const rulesFor = (state: any): any => (state && ROOMS[state.game]) || R;
const GAME_NAMES: any = { capsa: "a Capsa room", mahjong: "a Mahjong room", poker: "a poker table" };
const PAGES: any = { capsa: "the Capsa page", mahjong: "the Mahjong page", poker: "the poker page" };

async function load(by: { id?: string; code?: string }) {
  let q = db.from("poker_rooms").select("id, code, version, status");
  q = by.id ? q.eq("id", by.id) : q.eq("code", String(by.code || "").toUpperCase());
  const { data: room, error } = await q.maybeSingle();
  if (error) throw error;
  if (!room) return null;
  const { data: sec, error: e2 } = await db.from("poker_secrets").select("state").eq("room_id", room.id).single();
  if (e2) throw e2;
  return { room, state: sec.state };
}

async function commit(roomId: string, version: number, state: any) {
  const M = rulesFor(state);
  const { error } = await db.rpc("poker_commit", {
    p_room: roomId, p_version: version, p_state: state, p_public: M.publicState(state), p_status: M.roomStatus(state)
  });
  if (error) {
    if (String(error.message).includes("version_conflict")) return false;
    throw error;
  }
  return true;
}

async function createRoom(body: any) {
  const now = Date.now(), token = newToken(), id = crypto.randomUUID();
  // the host's private key: the host link carries it so the room can be opened as host from any device
  const hostKey = newToken(), hostKeyHash = await sha256(hostKey);
  const M: any = ROOMS[body.game] || R;
  const settings = M.validateSettings(body.settings || {});
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const state = M.newRoom({ code, settings, host: { id, name: body.name, buyIn: body.buyIn, tokenHash: await sha256(token), hostKeyHash, avatar: body.avatar, show: body.show }, now });
    const { data: room, error } = await db.from("poker_rooms")
      .insert({ code, settings, public_state: M.publicState(state), status: M.roomStatus(state) }).select("id").single();
    if (error) { if (error.code === "23505") continue; throw error; } // code taken: try another
    const { error: e2 } = await db.from("poker_secrets").insert({ room_id: room.id, state });
    if (e2) throw e2;
    return { roomId: room.id, playerId: id, token, hostKey, state: M.personalState(state, id) };
  }
  throw new R.RoomError("Couldn't open a room right now. Try again.");
}

// Load, apply, save; retry on a write conflict.
async function mutate(by: { id?: string; code?: string }, fn: (state: any, room: any) => any) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const loaded = await load(by);
    if (!loaded) throw new R.RoomError("No table or room with that code.");
    const { room, state } = loaded;
    const out = await fn(state, room);
    if (out && out.readOnly) return out.result;
    if (await commit(room.id, room.version, state)) return out.result;
    await new Promise(r => setTimeout(r, 40 + Math.random() * 120));
  }
  throw new R.RoomError("The room is busy. Try again.");
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const now = Date.now();
  try {
    const type = String(body.type || "");
    if (type === "create") return json({ ...(await createRoom(body)), serverNow: Date.now() });

    if (type === "peek") {
      const loaded = await load({ code: body.code });
      if (!loaded || loaded.state.closed) return json({ table: null, serverNow: now });
      const s = loaded.state;
      if (s.game === "capsa") return json({ table: { game: "capsa", mode: s.settings.mode || "winner", doublePair: s.settings.doublePair || "off", pointValue: s.settings.pointValue, humans: s.seats.filter((x: any) => x && !x.bot).length }, serverNow: now });
      if (s.game === "mahjong") return json({ table: { game: "mahjong", minFaan: s.settings.minFaan || 0, pointValue: s.settings.pointValue, humans: s.seats.filter((x: any) => x && !x.bot).length }, serverNow: now });
      return json({ table: {
        sb: s.settings.sb, bb: s.settings.bb, minBuyIn: s.settings.minBuyIn, maxSeats: s.settings.maxSeats, seated: s.table.seats.filter(Boolean).length,
        game: s.table.game || "holdem", odds: s.settings.odds || {}, step: s.table.step || 1, ante: s.table.ante || 0, straddle: !!s.table.straddle, runTwice: !!s.table.runTwice
      }, serverNow: now });
    }

    // The host's private link: a fresh token for the host on this device.
    if (type === "claim") {
      const token = newToken(), tokenHash = await sha256(token), hostKeyHash = await sha256(String(body.hostKey || ""));
      let playerId = "";
      const result = await mutate({ code: body.code }, state => {
        const M = rulesFor(state);
        playerId = M.claimHost(state, { hostKeyHash, id: crypto.randomUUID(), tokenHash, now: Date.now() });
        return { result: M.personalState(state, playerId) };
      });
      const loaded = await load({ code: body.code });
      return json({ roomId: loaded!.room.id, playerId, token, state: result, serverNow: Date.now() });
    }

    // Joining takes a seat; watching (poker) takes a seat-less spot. Both get a private token for later requests.
    if (type === "join" || type === "watch") {
      const token = newToken(), id = crypto.randomUUID(), tokenHash = await sha256(token);
      const result = await mutate({ code: body.code }, state => {
        const M = rulesFor(state);
        const kind = ROOMS[state.game] ? state.game : "poker";
        if (body.game && body.game !== kind) throw new R.RoomError(`That code is ${GAME_NAMES[kind]}. Join it from ${PAGES[kind]}.`);
        M.applyAction(state, { type, name: body.name, buyIn: body.buyIn, avatar: body.avatar, show: body.show }, { now: Date.now(), playerId: id, tokenHash, shuffledDeck });
        return { result: { roomId: null, playerId: id, token, state: M.personalState(state, id) } };
      });
      const loaded = await load({ code: body.code });
      return json({ ...result, roomId: loaded!.room.id, serverNow: Date.now() });
    }

    // Everything else is a seated (or departed) player acting in their room.
    const roomId = String(body.roomId || ""), token = String(body.token || "");
    if (!roomId || !token) return json({ error: "Missing room or player." }, 400);
    const tokenHash = await sha256(token);
    const result = await mutate({ id: roomId }, state => {
      const M = rulesFor(state);
      const playerId = M.findPlayerByTokenHash(state, tokenHash);
      if (!playerId) throw new R.RoomError("You're not in this room.");
      const ctx = { now: Date.now(), playerId, shuffledDeck };
      if (type === "state") return { readOnly: true, result: M.personalState(state, playerId) };
      const before = JSON.stringify(state);
      M.applyAction(state, { ...body.action, type: type === "act" ? "act" : type }, ctx);
      const unchanged = JSON.stringify(state) === before;
      return { readOnly: unchanged, result: M.personalState(state, playerId) };
    });
    return json({ state: result, serverNow: Date.now() });
  } catch (err) {
    if (err instanceof R.RoomError) return json({ error: err.message }, 409);
    console.error(err);
    return json({ error: "Something went wrong on the table server." }, 500);
  }
});
