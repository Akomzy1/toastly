import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/schema";
import { recordConsent } from "@/lib/consent-record";
import {
  ID_NUMBER_PATTERN,
  SANDBOX_IDENTITIES,
  SMILE_ID_TYPES,
  SMILE_THEME_COLOR,
  hashIdNumber,
  mintSmileToken,
  sandboxPickerAllowed,
  smileConfig,
  type SmileIdType,
  type SmileProduct,
} from "@/lib/smile-id";

export const dynamic = "force-dynamic";

/**
 * Start a Smile ID ID-check session (the hosted flow's only remaining use).
 *
 * Mints a v3 token on the server — the API key never leaves it — and returns
 * the hosted-flow config for the browser. Nothing here decides an outcome:
 * that arrives only on /api/smile-id/callback.
 *
 * NOTHING in this file reads a tier, an entitlement or a payment state.
 * Verification is free on every plan and is never paywalled (CLAUDE.md).
 */

const PRIVACY_POLICY_URL = "https://trytoastly.com/privacy";
// The Stake mark, as served by the app's PWA icon set.
const LOGO_PATH = "/icons/icon-512.png";
/** Attempts per product per member per 24 hours. Each one is a billed job. */
const DAILY_ATTEMPTS = 5;

type Body = {
  product?: unknown;
  consent?: unknown;
  given_names?: unknown;
  last_name?: unknown;
  id_type?: unknown;
  id_number?: unknown;
  sandbox_identity?: unknown;
};

function refuse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const cfg = smileConfig();
  const admin = createAdminClient();
  if (!cfg || !isSupabaseConfigured() || !admin) {
    return refuse(503, "Verification isn't available right now. Please try again later.");
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return refuse(400, "Something went wrong. Please try again.");
  }

  // The ID check only. Every selfie — onboarding, a new main photo, a re-check
  // a reviewer asked for — runs in the page (app/(app)/verify/selfie-actions
  // .ts): the hosted selfie is retired for Verified Real (decided 6 October
  // 2026) because it enrols no face a later re-check could use.
  const product: SmileProduct | null = body.product === "biometric_kyc" ? body.product : null;
  if (!product) return refuse(400, "Something went wrong. Please try again.");

  // Our own consent screen ran first; Smile ID's is skipped only because of it.
  if (body.consent !== true) return refuse(400, "Please tick the box to agree before you start.");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse(401, "Please sign in again.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("stage")
    .eq("id", user.id)
    .single();
  if (!profile) return refuse(401, "Please sign in again.");

  // The ladder: phone, then Verified Real, then (optionally) the ID ring.
  if (profile.stage !== "verified_real") {
    return refuse(409, "The ID check opens once you're Verified Real.");
  }

  // The agreement is recorded with the version of the wording shown (0029),
  // before anything is sent to Smile ID.
  const consented = await recordConsent(supabase, user.id, "id_check");
  if (!consented.ok) return refuse(503, "Verification isn't available right now. Please try again later.");

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("verification_sessions")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .eq("product", product)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_ATTEMPTS) {
    return refuse(429, "You've tried a few times today. Please try again tomorrow.");
  }

  // Names. Smile ID requires given names, a surname and a contact. They go to
  // Smile ID only — nothing here stores them.
  const sandbox =
    sandboxPickerAllowed(cfg, user.email) && typeof body.sandbox_identity === "string"
      ? SANDBOX_IDENTITIES.find((s) => s.key === body.sandbox_identity && s.products.includes(product))
      : undefined;

  const lastName = typeof body.last_name === "string" ? body.last_name.trim() : "";
  if (!sandbox && (lastName.length < 1 || lastName.length > 60)) {
    return refuse(400, "Enter your surname.");
  }
  // First names as on the ID.
  const givenNames = typeof body.given_names === "string" ? body.given_names.trim() : "";
  if (!sandbox && (givenNames.length < 1 || givenNames.length > 80)) {
    return refuse(400, "Enter your first name as it appears on your ID.");
  }
  if (!sandbox && !user.email) return refuse(400, "Add an email address to your account first.");

  const userDetails = sandbox
    ? { given_names: sandbox.given_names, last_name: sandbox.last_name, email: sandbox.email }
    : { given_names: givenNames, last_name: lastName, email: user.email! };

  // The ID check: hash the number here, in memory. It is never stored.
  let idType: SmileIdType | null = null;
  let idNumber: string | null = null;
  let idHash: string | null = null;
  if (product === "biometric_kyc") {
    idType = SMILE_ID_TYPES.includes(body.id_type as SmileIdType) ? (body.id_type as SmileIdType) : null;
    const raw = typeof body.id_number === "string" ? body.id_number.replace(/\s+/g, "") : "";
    if (!idType || !ID_NUMBER_PATTERN[idType].test(raw)) {
      return refuse(400, "That number isn't in the right format. Check it and try again.");
    }
    idNumber = idType === "V_NIN" ? raw.toUpperCase() : raw;

    const { data: key, error: keyError } = await admin.rpc("id_number_hmac_key");
    if (keyError || typeof key !== "string") {
      return refuse(503, "Verification isn't available right now. Please try again later.");
    }
    idHash = hashIdNumber(key, idType, idNumber);

    const [{ data: taken }, { data: blocked }] = await Promise.all([
      admin.from("verified_id_hashes").select("profile_id").eq("id_hash", idHash).maybeSingle(),
      admin.from("blocked_id_hashes").select("id_hash").eq("id_hash", idHash).maybeSingle(),
    ]);
    if (blocked || (taken && taken.profile_id !== user.id)) {
      return refuse(
        409,
        "This ID can't be used to verify this account. If you think that's a mistake, email support@trytoastly.com.",
      );
    }
  }

  const { data: session, error: insertError } = await admin
    .from("verification_sessions")
    .insert({
      profile_id: user.id,
      product,
      environment: cfg.env,
      id_type: idType,
      id_hash: idHash,
    })
    .select("id")
    .single();
  if (insertError || !session) {
    return refuse(503, "Verification isn't available right now. Please try again later.");
  }

  const token = await mintSmileToken(cfg);
  if (!token) {
    await admin
      .from("verification_sessions")
      .update({ status: "error", result_code: "token_unavailable", passed: false, completed_at: new Date().toISOString() })
      .eq("id", session.id);
    return refuse(503, "We couldn't reach our verification provider. Please try again in a minute.");
  }

  const config: Record<string, unknown> = {
    token,
    product,
    callback_url: cfg.callbackUrl,
    environment: cfg.env,
    partner_details: {
      partner_id: cfg.partnerId,
      name: "Toastly",
      logo_url: `${SITE_URL}${LOGO_PATH}`,
      policy_url: PRIVACY_POLICY_URL,
      theme_color: SMILE_THEME_COLOR,
    },
    consent_information: {
      granted: true,
      granted_at: new Date().toISOString(),
      notice_language: "en",
      notice_privacy_policy_url: PRIVACY_POLICY_URL,
    },
    user_details: userDetails,
    // The session id is the nonce the callback is matched on.
    partner_params: { toastly_session: session.id },
  };
  if (product === "biometric_kyc" && idType && idNumber) {
    config.id_info = { NG: { [idType]: { id_number: idNumber } } };
  }

  return NextResponse.json(
    { session_id: session.id, config },
    { headers: { "Cache-Control": "no-store" } },
  );
}
