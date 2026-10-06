import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Smile ID — server side only. Never import this into a client component.
 *
 * Integration: the hosted v12 Web SDK (docs.usesmileid.com, read October
 * 2026). The server mints a short-lived v3 token per session; the browser
 * never sees the API key. The verdict arrives only on the callback webhook —
 * the browser's onResult confirms submission, nothing more.
 *
 * Products:
 *   smartselfie   -> Verified Real, only through the REST API below: the
 *                    onboarding selfie is SmartSelfie Compare against the
 *                    main photo, ENROLLING the face under the member id; a
 *                    re-check a reviewer asks for is Authentication against
 *                    that enrolment. The hosted selfie is retired (decided
 *                    6 October 2026) — it enrolled nothing a re-check could use.
 *   photo_match   -> replacing a matched main photo: Authentication + Compare
 *                    with a fresh selfie (REST, below).
 *   biometric_kyc -> ID check (NIN, Virtual NIN or BVN, country NG; optional),
 *                    hosted — the hosted flow's only remaining use.
 * Never Enhanced KYC or Basic KYC: neither matches a selfie to the record.
 */

export type SmileProduct = "smartselfie" | "biometric_kyc";
export type SmileEnv = "sandbox" | "production";
export type SmileIdType = "NIN_V2" | "V_NIN" | "BVN";
export type SmileStatus = "clear" | "attention" | "block" | "error";

export const SMILE_ID_TYPES: SmileIdType[] = ["NIN_V2", "V_NIN", "BVN"];

/** Format rules from Smile ID's Nigeria coverage page. */
export const ID_NUMBER_PATTERN: Record<SmileIdType, RegExp> = {
  NIN_V2: /^\d{11}$/,
  BVN: /^\d{11}$/,
  V_NIN: /^[A-Za-z0-9]{16}$/,
};

/** The webhook's `product` value for each web-integration product. */
export const WEBHOOK_PRODUCT: Record<SmileProduct, string> = {
  smartselfie: "smart_selfie_registration",
  biometric_kyc: "biometric_kyc",
};

export const SMILE_SCRIPT_URL = "https://cdn.usesmileid.com/inline/v12/js/script.min.js";

/** The overlay accent. Teal, not amber: it sits behind white button text. */
export const SMILE_THEME_COLOR = "#00695C";

export type SmileConfig = {
  partnerId: string;
  apiKey: string;
  env: SmileEnv;
  callbackUrl: string;
};

export function smileConfig(): SmileConfig | null {
  const partnerId = process.env.SMILE_ID_PARTNER_ID ?? "";
  const apiKey = process.env.SMILE_ID_API_KEY ?? "";
  const env = process.env.SMILE_ID_ENV === "production" ? "production" : "sandbox";
  const callbackUrl = process.env.SMILE_ID_CALLBACK_URL ?? "";
  if (!partnerId || !apiKey || !callbackUrl) return null;
  return { partnerId, apiKey, env, callbackUrl };
}

function apiBase(env: SmileEnv): string {
  return env === "production" ? "https://api.smileidentity.com" : "https://testapi.smileidentity.com";
}

/**
 * Mint a v3 token. Multipart body, partner id in both the header and the
 * body (a JSON body is rejected with 415). Returns null on any failure; the
 * caller tells the member to try again.
 */
export async function mintSmileToken(cfg: SmileConfig): Promise<string | null> {
  const body = new FormData();
  body.set("partner_id", cfg.partnerId);
  try {
    const res = await fetch(`${apiBase(cfg.env)}/v3/token`, {
      method: "POST",
      headers: {
        "smileid-partner-id": cfg.partnerId,
        "smileid-api-key": cfg.apiKey,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { token?: unknown };
    return typeof json.token === "string" && json.token ? json.token : null;
  } catch {
    return null;
  }
}

/** How old a callback's Response-Timestamp may be before it's refused. */
export const CALLBACK_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Verify a callback's signature: base64 HMAC-SHA256 of
 * Response-Timestamp + partner ID + "sid_request", keyed with the API key.
 *
 * WHAT THIS DOES NOT COVER: Smile ID's signature is over the timestamp, not
 * the body. A valid signature proves Smile ID signed *a* request at that
 * moment; it does not bind the payload. So the caller also requires a fresh
 * timestamp, a matching pending session (an unguessable nonce echoed in
 * partner_params), the right product, first-result-wins idempotency and, for
 * the ID check, the checked number matching the one the member entered.
 */
export function verifySmileSignature(
  cfg: SmileConfig,
  signature: string | null,
  timestamp: string | null,
  now: number = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (!signature || !timestamp) return { ok: false, reason: "missing signature headers" };

  const sentAt = Date.parse(timestamp);
  if (Number.isNaN(sentAt)) return { ok: false, reason: "unreadable timestamp" };
  if (Math.abs(now - sentAt) > CALLBACK_MAX_AGE_MS) return { ok: false, reason: "stale timestamp" };

  const expected = createHmac("sha256", cfg.apiKey)
    .update(timestamp + cfg.partnerId + "sid_request")
    .digest("base64");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad signature" };
  return { ok: true };
}

/**
 * Keyed HMAC of an ID number, so the same ID can't verify two accounts. The
 * key comes from Supabase Vault via the service role; the number is hashed
 * here, in memory, and never stored or sent to the database.
 *
 * The type is part of the input: a NIN and a BVN are different identifiers.
 */
export function hashIdNumber(key: string, idType: SmileIdType, idNumber: string): string {
  const normalised = idType === "V_NIN" ? idNumber.trim().toUpperCase() : idNumber.trim();
  return createHmac("sha256", key).update(`${idType}:${normalised}`).digest("hex");
}

export function isSmileStatus(v: unknown): v is SmileStatus {
  return v === "clear" || v === "attention" || v === "block" || v === "error";
}

/**
 * Sandbox test identities (docs: "Testing in Sandbox"). The sandbox decides
 * the outcome from surname + given names + email, not from the ID number —
 * which is only format-checked and echoed back. There is no `attention`
 * scenario for either product; that state is tested with mock data.
 */
export const SANDBOX_IDENTITIES: {
  key: string;
  label: string;
  given_names: string;
  last_name: string;
  email: string;
  products: SmileProduct[];
}[] = [
  { key: "clear", label: "clear — passes", given_names: "Amina Fatou", last_name: "Clearwater", email: "amina.clearwater@example.com", products: ["smartselfie", "biometric_kyc"] },
  { key: "high_risk", label: "block — high_risk", given_names: "Rashid Omar", last_name: "Dangerfield", email: "rashid.dangerfield@example.com", products: ["smartselfie", "biometric_kyc"] },
  { key: "spoof", label: "block — spoof_detected", given_names: "Taiwo Adeyemi", last_name: "Masquero", email: "taiwo.masquero@example.com", products: ["smartselfie", "biometric_kyc"] },
  { key: "face_mismatch", label: "block — face_verification_failed", given_names: "Obinna Chukwu", last_name: "Twinley", email: "obinna.twinley@example.com", products: ["biometric_kyc"] },
  { key: "not_found", label: "block — identifier_not_found", given_names: "Fatima Bello", last_name: "Ghostwell", email: "fatima.ghostwell@example.com", products: ["biometric_kyc"] },
  { key: "bad_image", label: "error — image_unavailable_or_invalid", given_names: "Kofi Mensah", last_name: "Blurton", email: "kofi.blurton@example.com", products: ["smartselfie", "biometric_kyc"] },
  { key: "unavailable", label: "error — service_unavailable", given_names: "Ngozi Ifeoma", last_name: "Downsworth", email: "ngozi.downsworth@example.com", products: ["biometric_kyc"] },
  { key: "internal", label: "error — internal_error", given_names: "Chidinma Obi", last_name: "Glitchford", email: "chidinma.glitchford@example.com", products: ["smartselfie", "biometric_kyc"] },
];

/**
 * Whether this deployment may offer the sandbox test-identity picker.
 *
 * Only in sandbox, and never on a Vercel production deployment unless the
 * member's email is on SMILE_ID_SANDBOX_TESTERS. Otherwise anyone on the live
 * site could pick "clear" and earn Verified Real for free while sandbox keys
 * are in use.
 */
export function sandboxPickerAllowed(cfg: SmileConfig | null, email: string | undefined): boolean {
  if (!cfg || cfg.env !== "sandbox") return false;
  if (process.env.VERCEL_ENV !== "production") return true;
  const testers = (process.env.SMILE_ID_SANDBOX_TESTERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && testers.includes(email.toLowerCase()));
}

// ---------------------------------------------------------------------------
// The main-photo face match — REST, with a selfie captured in the page
// (0029; decided 5 October 2026). Ported from live-profile-and-prompt-14.
// ---------------------------------------------------------------------------

/** The selfie and 6–8 liveness frames from `<smart-camera-web>`. Passed through to Smile ID; never stored. */
export type SelfieCapture = { selfie: Blob; livenessFrames: Blob[] };

/** Consent as Smile ID's v3 API asks for it — the member agreed on our screen first. */
export type CaptureConsent = { grantedAt: string; language: string };

/**
 * Who the check is for, as Smile ID requires it (the same fields the hosted
 * flow sends). Sent to Smile ID only — Toastly stores none of it.
 */
export type SmileUserDetails = { given_names: string; last_name: string; email: string };

function consentField(c: CaptureConsent) {
  return JSON.stringify({
    granted: true,
    granted_at: c.grantedAt,
    notice_language: c.language,
    notice_privacy_policy_url: "https://trytoastly.com/privacy",
  });
}

function captureFields(form: FormData, capture: SelfieCapture) {
  form.append("selfie_image", capture.selfie, "selfie.jpg");
  capture.livenessFrames.slice(0, 8).forEach((f, i) => form.append("liveness_images", f, `liveness-${i}.jpg`));
}

/**
 * Submit one job. Its verification_sessions id travels in partner_params as
 * `toastly_session`, the nonce the callback matches on — the same as the
 * hosted flow, so one signed callback handles every result.
 */
async function submitJob(
  cfg: SmileConfig,
  path: "/v3/authentication" | "/v3/compare",
  form: FormData,
  userId: string | undefined,
  /** What we sent that must never reach a log, should Smile ID echo it back. */
  sent: string[],
): Promise<string> {
  const token = await mintSmileToken(cfg);
  if (!token) throw new Error("Smile ID token unavailable.");
  const res = await fetch(`${apiBase(cfg.env)}${path}`, {
    method: "POST",
    headers: {
      "SmileID-Token": token,
      "SmileID-Partner-ID": cfg.partnerId,
      Accept: "application/json",
      ...(userId ? { "User-ID": userId } : {}),
    },
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status !== 202 && !res.ok) {
    // Smile ID's own error text (field names, codes) — with anything we sent
    // (member id, names, email) scrubbed, should it echo a value back: the
    // caller logs this message.
    const why = scrub(await res.text().catch(() => ""), sent).slice(0, 300);
    throw new Error(`Smile ID ${path} was refused (${res.status})${why ? `: ${why}` : ""}.`);
  }
  const body = (await res.json()) as { job_id?: string };
  if (!body.job_id) throw new Error(`Smile ID ${path} returned no job id.`);
  return body.job_id;
}

/** Replace every value we sent with [redacted]. Exported for its test. */
export function scrub(text: string, sent: string[]): string {
  let out = text;
  for (const v of sent) {
    if (v && v.length >= 2) out = out.split(v).join("[redacted]");
  }
  return out.replace(/[^\s"'<>]+@[^\s"'<>]+\.[A-Za-z]{2,}/g, "[redacted]");
}

const sentBy = (profileId: string, d: SmileUserDetails) => [profileId, d.given_names, d.last_name, d.email];

/**
 * Is this fresh selfie the member Smile ID enrolled? A replacement main
 * photo, and a re-check a reviewer asked for.
 */
export async function submitAuthentication(
  cfg: SmileConfig,
  args: { sessionId: string; profileId: string; capture: SelfieCapture; consent: CaptureConsent; userDetails: SmileUserDetails },
): Promise<string> {
  const form = new FormData();
  form.append("user_id", args.profileId);
  form.append("user_details", JSON.stringify(args.userDetails));
  captureFields(form, args.capture);
  form.append("consent", consentField(args.consent));
  form.append("callback_url", cfg.callbackUrl);
  form.append("partner_params", JSON.stringify({ toastly_session: args.sessionId }));
  return submitJob(cfg, "/v3/authentication", form, undefined, sentBy(args.profileId, args.userDetails));
}

/**
 * Does the fresh selfie match the main photo (sent as a PORTRAIT image)?
 *
 * Compare also ENROLS the face it's given under the User-ID. So `enrol` is
 * set only for the onboarding selfie — the one that earns Verified Real. A
 * replacement must never enrol: if its Authentication half failed, an
 * impostor's selfie would overwrite the member's enrolled face.
 */
export async function submitCompare(
  cfg: SmileConfig,
  args: {
    sessionId: string;
    profileId: string;
    capture: SelfieCapture;
    mainPhoto: Blob;
    consent: CaptureConsent;
    userDetails: SmileUserDetails;
    enrol: boolean;
  },
): Promise<string> {
  const form = new FormData();
  form.append("user_details", JSON.stringify(args.userDetails));
  captureFields(form, args.capture);
  form.append("comparison_image", args.mainPhoto, "main-photo.jpg");
  form.append("comparison_image_type", "PORTRAIT");
  form.append("consent", consentField(args.consent));
  form.append("callback_url", cfg.callbackUrl);
  form.append("partner_params", JSON.stringify({ toastly_session: args.sessionId }));
  return submitJob(cfg, "/v3/compare", form, args.enrol ? args.profileId : undefined, sentBy(args.profileId, args.userDetails));
}
