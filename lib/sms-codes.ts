/**
 * Verification-code SMS — sign-in, new device, phone change, account deletion.
 *
 * SERVER ONLY. No imports on purpose: the unit tests load this file on its own
 * and prove each rule against a deliberately broken copy.
 *
 * How a code reaches a member: Supabase Auth makes the code and calls the
 * "Send SMS" hook (app/api/auth/send-sms); that route calls handleSendSms()
 * below, which delivers the code. We never make or store the code ourselves.
 *
 * Routing (owner, 15 October 2026):
 *   +234         Termii Messaging API, channel "dnd" (the DND route works only
 *                through the API, so there is no dashboard testing).
 *   anything else Nothing is sent: the member sees the "not open in your
 *                country yet" message. The Twilio Verify route is a separate task.
 *
 * Rules that must hold, each with a test and a constraint check:
 *   - ONE wording for every code SMS, byte for byte (CODE_SMS_TEMPLATE).
 *   - The channel is always "dnd".
 *   - No phone number, code or key ever reaches a log.
 *   - Only the production deploy sends a real SMS. Local and Preview log
 *     "code sent" (never the code) and send nothing.
 *   - A failure shows the member only a generic message; Termii's response is
 *     never passed on.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The approved wording. Termii requires every message to match the approved
 * sample exactly, with the business name; only {code} changes.
 *
 * Approved by Termii; do not edit without re-approval.
 */
export const CODE_SMS_TEMPLATE =
  "Your Toastly verification code is {code}. This code expires in 10 minutes. Do not share it with anyone.";

export function codeSmsText(code: string): string {
  return CODE_SMS_TEMPLATE.replace("{code}", code);
}

/** What a member sees when a code can't be sent. Never Termii's response. */
export const CODE_SEND_FAILED = "We couldn't send your code. Try again in a minute.";
/** Codes are for Nigerian numbers until the Twilio Verify route ships. */
export const CODE_COUNTRY_UNAVAILABLE =
  "Toastly codes work for Nigerian numbers (+234) for now. We'll let you know when your country opens.";

export const TERMII_SEND_URL = "https://api.ng.termii.com/api/sms/send";

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal; cache?: "no-store" }) => Promise<{ ok: boolean; status: number }>;
/** Only these keys, only these values: nothing identifying can be passed to a log. */
export type LogMeta = Partial<Record<"provider" | "reason" | "status" | "mode", string | number>>;
export type Logger = (message: string, meta?: LogMeta) => void;

/** E.164 with a "+", from "+234…" or Supabase's digits-only "234…". */
export function normaliseE164(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[^\d]/g, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

export function isNigerianNumber(e164: string): boolean {
  return e164.startsWith("+234");
}

/** Only the production deploy sends a real SMS. Local and Preview never do. */
export function smsMayReallySend(env: Env): boolean {
  return env.VERCEL_ENV === "production";
}

export type CodeSendResult = { ok: boolean; reason?: "not_configured" | "termii_http" | "network" | "not_sent_outside_production" };

/**
 * Send one code through Termii's Messaging API (not the Token API): POST
 * /api/sms/send, channel "dnd", type "plain", `to` in international format
 * without the "+", sender and key from the environment.
 *
 * Never throws; never returns or logs the number, the code or Termii's body.
 */
export async function sendCodeViaTermii(
  e164: string,
  code: string,
  deps: { env: Env; fetchImpl: FetchLike; log: Logger },
): Promise<CodeSendResult> {
  const { env, fetchImpl, log } = deps;
  if (!smsMayReallySend(env)) {
    log("code sent", { provider: "termii", mode: "not sent outside production" });
    return { ok: true, reason: "not_sent_outside_production" };
  }
  const apiKey = env.TERMII_API_KEY;
  const from = env.TERMII_SENDER_ID;
  if (!apiKey || !from) {
    log("code not sent", { provider: "termii", reason: "not configured" });
    return { ok: false, reason: "not_configured" };
  }
  try {
    const res = await fetchImpl(TERMII_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: e164.replace(/^\+/, ""),
        from,
        sms: codeSmsText(code),
        type: "plain",
        channel: "dnd",
        api_key: apiKey,
      }),
      // The Supabase hook has about five seconds to answer.
      signal: AbortSignal.timeout(3500),
      cache: "no-store",
    });
    if (!res.ok) {
      log("code not sent", { provider: "termii", reason: "http error", status: res.status });
      return { ok: false, reason: "termii_http" };
    }
    log("code sent", { provider: "termii" });
    return { ok: true };
  } catch {
    log("code not sent", { provider: "termii", reason: "network" });
    return { ok: false, reason: "network" };
  }
}

// ---------------------------------------------------------------------------
// The Supabase "Send SMS" hook
// ---------------------------------------------------------------------------

/**
 * Standard Webhooks signature, as Supabase sends it: webhook-id,
 * webhook-timestamp and webhook-signature ("v1,<base64>", possibly several,
 * space-separated), over `${id}.${timestamp}.${body}` with the hook secret
 * ("v1,whsec_<base64>" as the dashboard shows it).
 */
export function verifyHookSignature(
  secret: string,
  id: string | null,
  timestamp: string | null,
  rawBody: string,
  signatureHeader: string | null,
  nowMs: number,
  toleranceSeconds = 300,
): boolean {
  if (!id || !timestamp || !signatureHeader) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > toleranceSeconds) return false;
  const keyText = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  let key: Buffer;
  try {
    key = Buffer.from(keyText, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signatureHeader.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** A number's key in the rate-limit table: keyed and one-way, never the number. */
export function phoneKey(e164: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`sms-code:${e164}`).digest("hex");
}

export type HookResponse = { status: number; body: Record<string, unknown> };
type HeaderGetter = { get(name: string): string | null };
export type HookDeps = {
  env: Env;
  fetchImpl: FetchLike;
  /** Records a send for this number and says whether it is allowed (our own rate limit). */
  allow: (key: string) => Promise<boolean>;
  log: Logger;
  now?: () => number;
};

const refusal = (status: number, message: string): HookResponse => ({
  status,
  body: { error: { http_code: status, message } },
});

/**
 * Supabase calls this with { user: { phone, new_phone, … }, sms: { otp } }.
 * The destination is the number the code is for: a pending new_phone (first
 * confirmation, or a change) when there is one, otherwise phone.
 */
export async function handleSendSms(rawBody: string, headers: HeaderGetter, deps: HookDeps): Promise<HookResponse> {
  const { env, log } = deps;
  const secret = env.SEND_SMS_HOOK_SECRET;
  if (!secret) {
    log("hook refused", { reason: "secret not configured" });
    return refusal(500, "send_failed");
  }
  const ok = verifyHookSignature(
    secret,
    headers.get("webhook-id"),
    headers.get("webhook-timestamp"),
    rawBody,
    headers.get("webhook-signature"),
    (deps.now ?? Date.now)(),
  );
  if (!ok) {
    log("hook refused", { reason: "bad signature" });
    return refusal(401, "unauthorized");
  }

  let payload: { user?: { phone?: unknown; new_phone?: unknown }; sms?: { otp?: unknown } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    log("hook refused", { reason: "bad body" });
    return refusal(400, "bad_request");
  }
  const e164 = normaliseE164(payload.user?.new_phone || payload.user?.phone);
  const otp = payload.sms?.otp;
  if (!e164 || typeof otp !== "string" || !/^\d{4,10}$/.test(otp)) {
    log("hook refused", { reason: "bad body" });
    return refusal(400, "bad_request");
  }

  // Delivery route only: the phone's country never decides anything else, and
  // diaspora status comes from the profile country.
  if (!isNigerianNumber(e164)) {
    log("code not sent", { reason: "country not enabled" });
    return refusal(400, "country_not_enabled");
  }

  const pepper = env.PHONE_HASH_PEPPER ?? (env.VERCEL_ENV === "production" ? "" : "development-only");
  if (!pepper) {
    log("code not sent", { reason: "pepper not configured" });
    return refusal(500, "send_failed");
  }
  try {
    if (!(await deps.allow(phoneKey(e164, pepper)))) {
      log("code not sent", { reason: "rate limited" });
      return refusal(429, "too_many_requests");
    }
  } catch {
    // Fail closed: an unreachable limiter must not become unlimited SMS spend.
    log("code not sent", { reason: "rate limiter unavailable" });
    return refusal(500, "send_failed");
  }

  const sent = await sendCodeViaTermii(e164, otp, { env, fetchImpl: deps.fetchImpl, log });
  return sent.ok ? { status: 200, body: {} } : refusal(502, "send_failed");
}
