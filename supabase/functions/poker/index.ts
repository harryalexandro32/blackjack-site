// Poker table server. Every request: load the table, check who's asking, apply the move with the shared
// engine, save both the secret and the public copy in one transaction (retrying if someone else saved first).
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as E from "../_shared/poker-engine.js";
import * as R from "../_shared/poker-room.js";

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
  const { error } = await db.rpc("poker_commit", {
    p_room: roomId, p_version: version, p_state: state, p_public: R.publicState(state), p_status: R.roomStatus(state)
  });
  if (error) {
    if (String(error.message).includes("version_conflict")) return false;
    throw error;
  }
  return true;
}

async function createRoom(body: any) {
  const now = Date.now(), token = newToken(), id = crypto.randomUUID();
  const settings = R.validateSettings(body.settings || {});
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const state = R.newRoom({ code, settings, host: { id, name: body.name, buyIn: body.buyIn, tokenHash: await sha256(token), avatar: body.avatar, show: body.show }, now });
    const { data: room, error } = await db.from("poker_rooms")
      .insert({ code, settings, public_state: R.publicState(state), status: R.roomStatus(state) }).select("id").single();
    if (error) { if (error.code === "23505") continue; throw error; } // code taken: try another
    const { error: e2 } = await db.from("poker_secrets").insert({ room_id: room.id, state });
    if (e2) throw e2;
    return { roomId: room.id, playerId: id, token, state: R.personalState(state, id) };
  }
  throw new R.RoomError("Couldn't open a table right now. Try again.");
}

// Load, apply, save; retry on a write conflict.
async function mutate(by: { id?: string; code?: string }, fn: (state: any, room: any) => any) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const loaded = await load(by);
    if (!loaded) throw new R.RoomError("No table with that code.");
    const { room, state } = loaded;
    const out = await fn(state, room);
    if (out && out.readOnly) return out.result;
    if (await commit(room.id, room.version, state)) return out.result;
    await new Promise(r => setTimeout(r, 40 + Math.random() * 120));
  }
  throw new R.RoomError("The table is busy. Try again.");
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
      return json({ table: {
        sb: s.settings.sb, bb: s.settings.bb, minBuyIn: s.settings.minBuyIn, maxSeats: s.settings.maxSeats, seated: s.table.seats.filter(Boolean).length,
        odds: s.settings.odds || {}, step: s.table.step || 1, ante: s.table.ante || 0, straddle: !!s.table.straddle, runTwice: !!s.table.runTwice
      }, serverNow: now });
    }

    // Joining takes a seat; watching takes a seat-less spot. Both get a private token for later requests.
    if (type === "join" || type === "watch") {
      const token = newToken(), id = crypto.randomUUID(), tokenHash = await sha256(token);
      const result = await mutate({ code: body.code }, state => {
        R.applyAction(state, { type, name: body.name, buyIn: body.buyIn, avatar: body.avatar, show: body.show }, { now: Date.now(), playerId: id, tokenHash, shuffledDeck });
        return { result: { roomId: null, playerId: id, token, state: R.personalState(state, id) } };
      });
      const loaded = await load({ code: body.code });
      return json({ ...result, roomId: loaded!.room.id, serverNow: Date.now() });
    }

    // Everything else is a seated (or departed) player acting on their table.
    const roomId = String(body.roomId || ""), token = String(body.token || "");
    if (!roomId || !token) return json({ error: "Missing table or player." }, 400);
    const tokenHash = await sha256(token);
    const result = await mutate({ id: roomId }, state => {
      const playerId = R.findPlayerByTokenHash(state, tokenHash);
      if (!playerId) throw new R.RoomError("You're not at this table.");
      const ctx = { now: Date.now(), playerId, shuffledDeck };
      if (type === "state") return { readOnly: true, result: R.personalState(state, playerId) };
      const before = JSON.stringify(state);
      R.applyAction(state, { ...body.action, type: type === "act" ? "act" : type }, ctx);
      const unchanged = JSON.stringify(state) === before;
      return { readOnly: unchanged, result: R.personalState(state, playerId) };
    });
    return json({ state: result, serverNow: Date.now() });
  } catch (err) {
    if (err instanceof R.RoomError) return json({ error: err.message }, 409);
    console.error(err);
    return json({ error: "Something went wrong on the table server." }, 500);
  }
});
