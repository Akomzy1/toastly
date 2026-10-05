import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Smile ID — the main-photo face match (PRD §5.1.2, Prompt 14).
 *
 * SERVER ONLY. Two v3 products per check (decided 2026-10-05):
 *   - SmartSelfie Authentication: is this fresh selfie the member Smile ID
 *     enrolled at Verified Real? (user_id = the member's profile id)
 *   - SmartSelfie Compare: does the same selfie match the new main photo,
 *     sent as a PORTRAIT comparison image?
 *
 * Toastly never stores the selfie or its liveness frames: they are passed
 * through to Smile ID in the request and dropped. What comes back, and what
 * Toastly keeps, is a category — clear / attention / block / error and a
 * reason code — never a score, an image or a face template.
 *
 * Verified against Smile ID's v3 docs on 2026-10-05: /v3/token for a JWT,
 * multipart /v3/authentication and /v3/compare, webhook signed with
 * HMAC-SHA256(api key, Response-Timestamp + partner id + "sid_request").
 * The webhook body shape is documented only by example — confirm against
 * the sandbox before launch.
 *
 * NOT CONNECTED until SMILE_ID_PARTNER_ID and SMILE_ID_API_KEY are set
 * (GO-LIVE.md). It also depends on Verified Real enrolling members with
 * Smile ID, which is still a stub.
 */

const BASE = {
  sandbox: "https://testapi.smileidentity.com",
  production: "https://api.smileidentity.com",
} as const;

export function smileIdConfigured(): boolean {
  return Boolean(process.env.SMILE_ID_PARTNER_ID && process.env.SMILE_ID_API_KEY);
}

function config() {
  const partnerId = process.env.SMILE_ID_PARTNER_ID;
  const apiKey = process.env.SMILE_ID_API_KEY;
  if (!partnerId || !apiKey) throw new Error("Smile ID is not configured.");
  const env = process.env.SMILE_ID_ENVIRONMENT === "production" ? "production" : "sandbox";
  return { partnerId, apiKey, base: BASE[env] };
}

export type SelfieCapture = {
  /** The fresh selfie, JPEG. Passed through; never stored. */
  selfie: Blob;
  /** 6–8 JPEG liveness frames from the capture. Passed through; never stored. */
  livenessFrames: Blob[];
};

/** Consent as Smile ID's v3 API asks for it. The wording is held (Prompt 14). */
export type CaptureConsent = { grantedAt: string; language: string };

async function token(): Promise<string> {
  const { partnerId, apiKey, base } = config();
  const res = await fetch(`${base}/v3/token`, {
    method: "POST",
    headers: { "SmileID-Partner-ID": partnerId, "SmileID-API-Key": apiKey },
  });
  if (!res.ok) throw new Error(`Smile ID token request failed (${res.status}).`);
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error("Smile ID returned no token.");
  return body.token;
}

function consentField(c: CaptureConsent) {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trytoastly.com";
  return JSON.stringify({
    granted: true,
    granted_at: c.grantedAt,
    notice_language: c.language,
    notice_privacy_policy_url: `${site}/privacy`,
  });
}

function partnerParams(checkId: string, step: "authenticate" | "compare" | "onboard") {
  // Our own reference travels with the job, so the webhook can be matched
  // to a face_match_jobs row without trusting anything else in the body.
  return JSON.stringify({ toastly_check_id: checkId, toastly_step: step });
}

async function submit(
  path: "/v3/authentication" | "/v3/compare",
  form: FormData,
  userId?: string,
): Promise<string> {
  const { partnerId, base } = config();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "SmileID-Token": await token(),
      "SmileID-Partner-ID": partnerId,
      Accept: "application/json",
      ...(userId ? { "User-ID": userId } : {}),
    },
    body: form,
  });
  if (res.status !== 202 && !res.ok) {
    throw new Error(`Smile ID ${path} was refused (${res.status}).`);
  }
  const body = (await res.json()) as { job_id?: string };
  if (!body.job_id) throw new Error(`Smile ID ${path} returned no job id.`);
  return body.job_id;
}

function captureFields(form: FormData, capture: SelfieCapture) {
  form.append("selfie_image", capture.selfie, "selfie.jpg");
  // The v3 API takes 6–8 liveness frames; send at most 8.
  capture.livenessFrames
    .slice(0, 8)
    .forEach((frame, i) => form.append("liveness_images", frame, `liveness-${i}.jpg`));
}

/** Is this fresh selfie the member Smile ID enrolled at Verified Real? */
export async function submitAuthentication(args: {
  checkId: string;
  profileId: string;
  capture: SelfieCapture;
  consent: CaptureConsent;
  callbackUrl: string;
}): Promise<string> {
  const form = new FormData();
  form.append("user_id", args.profileId);
  captureFields(form, args.capture);
  form.append("consent", consentField(args.consent));
  form.append("callback_url", args.callbackUrl);
  form.append("partner_params", partnerParams(args.checkId, "authenticate"));
  return submit("/v3/authentication", form);
}

/**
 * Does the fresh selfie match the main photo?
 *
 * Compare also ENROLS the face it is given. So `enrol` is set only for the
 * onboarding selfie — the one that earns Verified Real — which enrols the
 * member under their profile id for later Authentication. A replacement
 * check must never enrol: if the Authentication half failed, an impostor's
 * selfie would overwrite the member's enrolled face.
 */
export async function submitCompare(args: {
  checkId: string;
  profileId: string;
  capture: SelfieCapture;
  mainPhoto: Blob;
  consent: CaptureConsent;
  callbackUrl: string;
  step: "compare" | "onboard";
  enrol: boolean;
}): Promise<string> {
  const form = new FormData();
  captureFields(form, args.capture);
  form.append("comparison_image", args.mainPhoto, "main-photo.jpg");
  form.append("comparison_image_type", "PORTRAIT");
  form.append("consent", consentField(args.consent));
  form.append("callback_url", args.callbackUrl);
  form.append("partner_params", partnerParams(args.checkId, args.step));
  return submit("/v3/compare", form, args.enrol ? args.profileId : undefined);
}

/**
 * Webhook signature: base64(HMAC-SHA256(api key, Response-Timestamp +
 * partner id + "sid_request")), sent as Response-Signature.
 */
export function verifyWebhook(headers: Headers): boolean {
  if (!smileIdConfigured()) return false;
  const { partnerId, apiKey } = config();
  const timestamp = headers.get("Response-Timestamp");
  const signature = headers.get("Response-Signature");
  if (!timestamp || !signature) return false;
  const expected = createHmac("sha256", apiKey)
    .update(`${timestamp}${partnerId}sid_request`)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
