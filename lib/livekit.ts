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

export function isLiveKitConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_URL &&
      process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET,
  );
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
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit is not configured");
  }

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
