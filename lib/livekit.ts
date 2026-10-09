import { createHmac } from "node:crypto";

/**
 * LiveKit access tokens.
 *
 * LiveKit is the one WebRTC provider for Toastly — CLAUDE.md requires
 * picking one and staying on it. Do not add a second.
 *
 * Everything here is VoIP. A Gist never touches a carrier number and never
 * exposes either party's real phone number: identities in a room are profile
 * UUIDs, and there is no field anywhere in this path that could carry a phone
 * number even by accident.
 *
 * Tokens are minted server-side only. The API secret must never reach the
 * browser — a client that could mint its own token could join any room.
 */

const b64url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/**
 * LIVEKIT_URL, tidied: trimmed, and with a repeated scheme collapsed
 * ("wss://wss://x.livekit.cloud" → "wss://x.livekit.cloud"). A doubled scheme
 * once made every call fail with "could not establish signal connection".
 */
export function livekitUrl(): string | null {
  const raw = (process.env.LIVEKIT_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  const host = raw.replace(/^((wss?|https?):\/\/)+/i, "");
  return `wss://${host}`;
}

/** Key and secret, trimmed: a pasted trailing space or newline makes every token invalid. */
function credentials(): { apiKey: string; apiSecret: string } | null {
  const apiKey = (process.env.LIVEKIT_API_KEY ?? "").trim();
  const apiSecret = (process.env.LIVEKIT_API_SECRET ?? "").trim();
  return apiKey && apiSecret ? { apiKey, apiSecret } : null;
}

export function isLiveKitConfigured(): boolean {
  return Boolean(livekitUrl() && credentials());
}

/**
 * Mint a join token.
 *
 * `canPublishVideo` is passed in from the entitlement check, not decided
 * here: on a voice Gist, and on any tier without live video, the token itself
 * withholds video publish permission. That means the restriction holds even
 * if the client is modified — UI copy is not a control, and neither is a
 * disabled button.
 */
export function createGistToken({
  roomName,
  identity,
  ttlSeconds = 60 * 60,
  canPublishVideo,
}: {
  roomName: string;
  identity: string;
  ttlSeconds?: number;
  canPublishVideo: boolean;
}): string {
  const creds = credentials();
  if (!creds) {
    throw new Error("LiveKit is not configured");
  }
  const { apiKey, apiSecret } = creds;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: apiKey,
    sub: identity,
    // Identity is the profile UUID. Never a name, never a number.
    nbf: now,
    exp: now + ttlSeconds,
    video: {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // Audio always; video only when the entitlement allows it.
      canPublishSources: canPublishVideo
        ? ["microphone", "camera"]
        : ["microphone"],
    },
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(payload),
  )}`;
  const signature = b64url(
    createHmac("sha256", apiSecret).update(signingInput).digest(),
  );

  return `${signingInput}.${signature}`;
}

/** Room names are derived from the session id — never from member names. */
export function gistRoomName(sessionId: string): string {
  return `gist_${sessionId}`;
}

/**
 * Close a Gist room for everyone in it — used when the server's clock says
 * the time is up. Without this, the 18-minute box would rest on each
 * browser's own timer, and a modified client could simply stay connected.
 *
 * Calls LiveKit's RoomService.DeleteRoom with a short-lived server token.
 * Never throws: a room that's already gone is the result we wanted.
 */
export async function closeGistRoom(roomName: string): Promise<boolean> {
  const url = livekitUrl();
  const creds = credentials();
  if (!url || !creds) return false;
  const { apiKey, apiSecret } = creds;

  const now = Math.floor(Date.now() / 1000);
  const signingInput = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: apiKey, nbf: now, exp: now + 60, video: { roomCreate: true } }),
  )}`;
  const token = `${signingInput}.${b64url(createHmac("sha256", apiSecret).update(signingInput).digest())}`;

  const host = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/$/, "");
  try {
    const res = await fetch(`${host}/twirp/livekit.RoomService/DeleteRoom`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ room: roomName }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * Camera rights for everyone in a Gist room — the server half of "both or
 * neither" (0040). Video on: both may publish a camera. Video off (either
 * person turned it off, a decline, a weak connection): camera rights are
 * withdrawn from both, and LiveKit unpublishes any camera track still live.
 * Microphone and data are always kept.
 *
 * Calls RoomService.UpdateParticipant with a short-lived room-admin token.
 * Someone who isn't in the room yet gets the same rule from their join token
 * (app/api/gist/[id]/join). Never throws.
 */
export async function setGistCamera(roomName: string, identities: string[], allowed: boolean): Promise<boolean> {
  const url = livekitUrl();
  const creds = credentials();
  if (!url || !creds) return false;
  const { apiKey, apiSecret } = creds;
  const now = Math.floor(Date.now() / 1000);
  const signingInput = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: apiKey, nbf: now - 10, exp: now + 60, video: { roomAdmin: true, room: roomName } }),
  )}`;
  const token = `${signingInput}.${b64url(createHmac("sha256", apiSecret).update(signingInput).digest())}`;
  const host = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/$/, "");
  const results = await Promise.all(
    identities.map(async (identity) => {
      try {
        const res = await fetch(`${host}/twirp/livekit.RoomService/UpdateParticipant`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            room: roomName,
            identity,
            permission: {
              can_subscribe: true,
              can_publish: true,
              can_publish_data: true,
              can_publish_sources: allowed ? ["MICROPHONE", "CAMERA"] : ["MICROPHONE"],
            },
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        // Not in the room right now: their next join token carries the rule.
        return res.ok || res.status === 404;
      } catch {
        return false;
      }
    }),
  );
  return results.every(Boolean);
}

/**
 * Configuration check for the signed-in diagnostic route: can this server
 * reach LiveKit, and does LiveKit accept its key and secret? Returns yes/no
 * facts only — never the key, the secret or a token.
 */
export async function checkLiveKit(): Promise<{
  configured: boolean;
  host: string | null;
  reachable: boolean;
  credentialsAccepted: boolean;
  status: number | null;
  /** True when the stored value carries stray whitespace (now trimmed everywhere). */
  keyHadStraySpace: boolean;
  secretHadStraySpace: boolean;
}> {
  const url = livekitUrl();
  const creds = credentials();
  const host = url ? url.replace(/^wss:\/\//, "") : null;
  const keyHadStraySpace = (process.env.LIVEKIT_API_KEY ?? "") !== (process.env.LIVEKIT_API_KEY ?? "").trim();
  const secretHadStraySpace = (process.env.LIVEKIT_API_SECRET ?? "") !== (process.env.LIVEKIT_API_SECRET ?? "").trim();
  const flags = { keyHadStraySpace, secretHadStraySpace };
  if (!url || !creds) return { configured: false, host, reachable: false, credentialsAccepted: false, status: null, ...flags };
  const { apiKey, apiSecret } = creds;

  const now = Math.floor(Date.now() / 1000);
  const signingInput = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: apiKey, nbf: now - 10, exp: now + 60, video: { roomList: true } }),
  )}`;
  const token = `${signingInput}.${b64url(createHmac("sha256", apiSecret).update(signingInput).digest())}`;
  try {
    const res = await fetch(`https://${host}/twirp/livekit.RoomService/ListRooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return { configured: true, host, reachable: true, credentialsAccepted: res.ok, status: res.status, ...flags };
  } catch {
    return { configured: true, host, reachable: false, credentialsAccepted: false, status: null, ...flags };
  }
}
