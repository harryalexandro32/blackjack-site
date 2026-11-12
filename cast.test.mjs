// Run with: node cast.test.mjs
// The room's update message: every player can rebuild exactly their own table from it, and nobody else's hand.
import test from "node:test";
import assert from "node:assert";
import { webcrypto } from "node:crypto";
import * as E from "./supabase/functions/_shared/poker-engine.js";
import * as CR from "./supabase/functions/_shared/capsa-room.js";
import * as MR from "./supabase/functions/_shared/mahjong-room.js";
import * as LR from "./supabase/functions/_shared/ludo-room.js";
import { sealCast } from "./supabase/functions/_shared/cast.js";

const rng = a => webcrypto.getRandomValues(a);
const sha = async s => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), b => b.toString(16).padStart(2, "0")).join("");

// the same steps as openCast in each game's online.js
async function open(cast, id, token, code) {
  const enc = new TextEncoder(), bytes = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", enc.encode("cast:" + await sha(token))), "AES-GCM", false, ["decrypt"]);
  const [iv, ct] = cast.p[id].split(".");
  const own = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(iv) }, key, bytes(ct))));
  return { code, ...cast.c, ...own };
}

const games = [
  ["capsa", CR, { pointValue: 100, actSeconds: 30, skill: "normal" }],
  ["mahjong", MR, { pointValue: 100, actSeconds: 20, skill: "normal", minFaan: 0 }],
  ["ludo", LR, { pointValue: 100, actSeconds: 20, skill: "normal", rules: {} }]
];
for (const [name, R, settings] of games) test(`${name}: each player opens their own table; hands and the room code stay out of the shared part`, async () => {
  const ctx = (playerId, extra = {}) => ({ now: 1000, playerId, shuffledDeck: () => E.shuffle(E.newDeck(), rng), ...extra });
  const s = R.newRoom({ code: "ABC234", settings: R.validateSettings(settings), host: { id: "h", name: "Host", tokenHash: await sha("tok-h") }, now: 1000 });
  R.applyAction(s, { type: "join", name: "Ana" }, ctx("a", { tokenHash: await sha("tok-a") }));
  R.applyAction(s, { type: "start" }, ctx("h"));
  const cast = await sealCast(s, R);
  assert.ok(cast, "a message is built");
  assert.ok(!JSON.stringify(cast).includes("ABC234"), "no room code anywhere");
  for (const [id, token] of [["h", "tok-h"], ["a", "tok-a"]]) {
    const want = JSON.parse(JSON.stringify(R.personalState(s, id)));
    assert.deepStrictEqual(await open(cast, id, token, "ABC234"), want, id);
  }
  if (name !== "ludo") assert.strictEqual(cast.c.view, undefined, "the view (it holds a hand) is never shared in the clear");
  await assert.rejects(open(cast, "h", "tok-a", "ABC234"), "another player's token can't open it");
  // a player who left gets nothing; one person alone gets everything encrypted
  R.applyAction(s, { type: "leave" }, ctx("a"));
  const solo = await sealCast(s, R);
  assert.deepStrictEqual(Object.keys(solo.p), ["h"]);
  assert.deepStrictEqual(solo.c, {});
});
