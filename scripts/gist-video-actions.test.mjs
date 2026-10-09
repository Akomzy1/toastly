/**
 * Video actions → database → LiveKit (lib/gist-video.ts), with a fake
 * database and a fake LiveKit. The rules themselves are tested against
 * Postgres in scripts/sql-test/gist-video.test.mjs; this proves LiveKit
 * always follows the database: cameras for both only while video is on.
 *
 *   node --test scripts/gist-video-actions.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyVideoAction, isVideoAction } from "../lib/gist-video.ts";

const A = "a0000000-0000-0000-0000-000000000001";
const B = "b0000000-0000-0000-0000-000000000002";

function fakes({ result, after, error = null }) {
  const calls = [];
  const camera = [];
  return {
    calls,
    camera,
    deps: {
      rpc: async (fn, args) => (calls.push({ fn, args }), { data: result, error }),
      session: async () => ({ proposer_id: A, invitee_id: B, video_state: after }),
      setCamera: async (room, ids, allowed) => (camera.push({ room, ids, allowed }), true),
      roomName: (s) => `gist_${s}`,
    },
  };
}

test("accepting turns cameras on for BOTH people — and only then", async () => {
  const f = fakes({ result: "on", after: "on" });
  assert.deepEqual(await applyVideoAction("s1", "accept", "turned_off", f.deps), { state: "on" });
  assert.deepEqual(f.calls, [{ fn: "gist_video_answer", args: { p_session_id: "s1", p_accept: true } }]);
  assert.deepEqual(f.camera, [{ room: "gist_s1", ids: [A, B], allowed: true }]);
});

test("asking doesn't turn a camera on; nor does a decline or a cancel", async () => {
  for (const [action, result, after, fn] of [
    ["request", "requested", "requested", "gist_video_request"],
    ["decline", "off", "off", "gist_video_answer"],
    ["cancel", "off", "off", "gist_video_cancel"],
  ]) {
    const f = fakes({ result, after });
    await applyVideoAction("s1", action, "turned_off", f.deps);
    assert.equal(f.calls[0].fn, fn);
    assert.deepEqual(f.camera, [{ room: "gist_s1", ids: [A, B], allowed: false }], `${action}: cameras stay off for both`);
  }
});

test("either person turning video off takes the camera from BOTH, with the reason", async () => {
  const f = fakes({ result: "off", after: "off" });
  await applyVideoAction("s1", "off", "weak_connection", f.deps);
  assert.deepEqual(f.calls[0], { fn: "gist_video_off", args: { p_session_id: "s1", p_reason: "weak_connection" } });
  assert.deepEqual(f.camera, [{ room: "gist_s1", ids: [A, B], allowed: false }]);
});

test("LiveKit follows the stored state, not the action: an accept that lapsed leaves cameras off", async () => {
  // The database answered 'unavailable' (no video plan any more): state is off.
  const f = fakes({ result: "unavailable", after: "off" });
  assert.deepEqual(await applyVideoAction("s1", "accept", "turned_off", f.deps), { state: "unavailable" });
  assert.deepEqual(f.camera, [{ room: "gist_s1", ids: [A, B], allowed: false }]);
});

test("a refusal from the database changes nothing in LiveKit", async () => {
  const f = fakes({ result: null, after: "off", error: { message: "Video was declined in this Gist." } });
  assert.deepEqual(await applyVideoAction("s1", "request", "turned_off", f.deps), { error: "Video was declined in this Gist." });
  assert.deepEqual(f.camera, []);
});

test("only the five actions exist", () => {
  for (const a of ["request", "cancel", "accept", "decline", "off"]) assert.equal(isVideoAction(a), true);
  for (const a of ["on", "record", "", null, 1]) assert.equal(isVideoAction(a), false);
});
