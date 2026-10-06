import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { capture } from "@/lib/analytics";
import { combineOutcomes, onboardingOutcome, type StepResult } from "@/lib/face-match";
import {
  ID_NUMBER_PATTERN,
  WEBHOOK_PRODUCT,
  hashIdNumber,
  isSmileStatus,
  smileConfig,
  verifySmileSignature,
  type SmileIdType,
  type SmileProduct,
  type SmileStatus,
} from "@/lib/smile-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Smile ID result webhook — THE ONLY SOURCE OF TRUTH for verification.
 *
 * WHAT IS READ from the payload: status, reason, product, the job id and our
 * own session nonce. For the ID check, id_fields.id_number is read once, in
 * memory, to recompute its HMAC — never stored, never logged.
 *
 * WHAT IS NEVER READ: every other id_fields value (name, date of birth,
 * photo, phone numbers, address, marital status…), image_links, kyc_receipt,
 * user_provided_info, antifraud and device_signals. They are not copied, not
 * logged and not stored. Marital status in particular: Toastly never verifies
 * it and must never appear to (PRD §5.2.1).
 *
 * Smile ID retries up to four times and may deliver out of order, so this is
 * idempotent: the first result for a session wins; repeats return 200.
 */

/** Smile ID's documented ceiling for webhook bodies. */
const MAX_BODY_BYTES = 1.5 * 1024 * 1024;

type Outcome = { status: SmileStatus; code: string | null; passed: boolean };

async function readCapped(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  if (!req.body) return "";

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function str(v: unknown, max = 128): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type FaceSession = {
  id: string;
  profile_id: string;
  step: "onboard" | "authenticate" | "compare";
  photo_id: string | null;
  check_id: string | null;
};

/** Files the database decided to replace: it can't reach storage itself. */
async function deleteReplaced(admin: Admin, path: unknown) {
  const paths = typeof path === "string" && path ? [path] : [];
  const { data: queued } = await admin.from("storage_deletions").select("id, name").eq("bucket_id", "profile-photos").limit(50);
  for (const q of queued ?? []) paths.push(q.name);
  if (paths.length) await admin.storage.from("profile-photos").remove(paths);
  if (queued?.length) await admin.from("storage_deletions").delete().in("id", queued.map((q) => q.id));
}

/**
 * A selfie-check result (0029). Only the category and reason code are kept —
 * never an image, a score or a face template.
 *
 *   onboard       one Compare: settles Verified Real and the main photo
 *   authenticate  } a replacement main photo: both must report, then the
 *   compare       } combined outcome is recorded once
 */
async function handleFaceMatch(admin: Admin, s: FaceSession, r: StepResult, jobId: string | null) {
  const now = new Date().toISOString();
  const onboard = s.step === "onboard" ? onboardingOutcome(r) : null;
  const passed = onboard ? onboard.live === "passed" : r.status === "clear";

  const { data: claimed } = await admin
    .from("verification_sessions")
    .update({ status: r.status, result_code: r.reason ?? (r.status === "clear" ? "clear" : null), passed, job_id: jobId, completed_at: now })
    .eq("id", s.id)
    .in("status", ["started", "submitted"])
    .select("id");
  if (!claimed || claimed.length === 0) return NextResponse.json({ ok: true, ignored: "already decided" });

  if (onboard) {
    const { data: before } = await admin.from("profiles").select("stage").eq("id", s.profile_id).single();
    const { data: replaced, error } = await admin.rpc("record_onboarding_check", {
      p_session: s.id,
      p_live: onboard.live,
      p_match: onboard.match.outcome,
      p_reason: onboard.match.outcome === "mismatch" ? onboard.match.reason : null,
    });
    if (error && !/not the pending main photo/.test(error.message)) {
      return NextResponse.json({ error: "could not record" }, { status: 500 });
    }
    await deleteReplaced(admin, replaced);
    if (onboard.live === "passed" && before?.stage === "phone_verified") {
      await capture("verification_complete", s.profile_id, { stage: "verified_real" });
    }
    await admin.rpc("emit_trust_event", {
      p_profile_id: s.profile_id,
      p_subject_id: null,
      p_kind: "liveness_result",
      p_meta: { status: r.status, reason: r.reason, step: "onboard" },
    });
  } else if (s.check_id) {
    // Both halves of a replacement check. Whichever reports second records
    // the outcome; a repeat after that finds no pending photo and is ignored.
    const { data: pair } = await admin
      .from("verification_sessions")
      .select("step, status, result_code, photo_id")
      .eq("check_id", s.check_id);
    const auth = pair?.find((p) => p.step === "authenticate");
    const comp = pair?.find((p) => p.step === "compare");
    const done = (p?: { status: string }) => p && p.status !== "started" && p.status !== "submitted";
    if (auth && comp && done(auth) && done(comp) && isSmileStatus(auth.status) && isSmileStatus(comp.status)) {
      const result = combineOutcomes(
        { status: auth.status, reason: auth.result_code },
        { status: comp.status, reason: comp.result_code },
      );
      const { data: replaced, error } = await admin.rpc("record_main_photo_match", {
        p_photo_id: comp.photo_id ?? s.photo_id,
        p_outcome: result.outcome,
        p_reason: result.outcome === "mismatch" ? result.reason : null,
      });
      if (error && !/not the pending main photo/.test(error.message)) {
        return NextResponse.json({ error: "could not record" }, { status: 500 });
      }
      await deleteReplaced(admin, replaced);
    }
  }

  revalidatePath("/verify");
  revalidatePath("/profile/photos");
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const cfg = smileConfig();
  const admin = createAdminClient();
  if (!cfg || !admin) {
    // 503 makes Smile ID retry once we're configured, rather than drop it.
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const raw = await readCapped(req);
  if (raw === null) return NextResponse.json({ error: "too large" }, { status: 413 });

  const sig = verifySmileSignature(
    cfg,
    req.headers.get("response-signature"),
    req.headers.get("response-timestamp"),
  );
  if (!sig.ok) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    payload = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const params = (payload.partner_params ?? {}) as Record<string, unknown>;
  const sessionId = str(params.toastly_session, 36);
  const jobId = str(req.headers.get("job-id")) ?? str(params.job_id);

  // Not one of ours (or not ours any more): acknowledge, change nothing.
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return NextResponse.json({ ok: true, ignored: "no session" });
  }

  const { data: session } = await admin
    .from("verification_sessions")
    .select("id, profile_id, product, environment, id_type, id_hash, status, step, photo_id, check_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return NextResponse.json({ ok: true, ignored: "unknown session" });

  // First result wins.
  if (session.status !== "started" && session.status !== "submitted") {
    return NextResponse.json({ ok: true, ignored: "already decided" });
  }

  // The main-photo selfie checks (0029) — submitted over REST, matched on the
  // same nonce, so they're handled here rather than by a second webhook.
  if (session.step) {
    if (session.environment !== cfg.env) return NextResponse.json({ ok: true, ignored: "environment mismatch" });
    const st = payload.status;
    if (!isSmileStatus(st)) return NextResponse.json({ error: "bad request" }, { status: 400 });
    return handleFaceMatch(admin, session, { status: st, reason: str(payload.reason, 64) }, jobId);
  }

  const product = session.product as SmileProduct;
  if (payload.product !== WEBHOOK_PRODUCT[product] || session.environment !== cfg.env) {
    return NextResponse.json({ ok: true, ignored: "product mismatch" });
  }

  const status = payload.status;
  if (!isSmileStatus(status)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  let outcome: Outcome = {
    status,
    code: str(payload.reason, 64) ?? (status === "clear" ? "clear" : null),
    passed: status === "clear",
  };

  // The ID check: the number Smile ID checked must be the number the member
  // entered — the signature doesn't cover the body, so this binds the result
  // to the session. The number lives only in this block.
  if (product === "biometric_kyc" && outcome.passed) {
    const idFields = (payload.id_fields ?? {}) as Record<string, unknown>;
    const idType = session.id_type as SmileIdType | null;
    const checked = typeof idFields.id_number === "string" ? idFields.id_number.replace(/\s+/g, "") : "";
    const { data: key } = await admin.rpc("id_number_hmac_key");

    if (!idType || !session.id_hash || typeof key !== "string" || !ID_NUMBER_PATTERN[idType].test(checked)) {
      outcome = { status: "error", code: "id_unreadable", passed: false };
    } else if (hashIdNumber(key, idType, checked) !== session.id_hash) {
      outcome = { status: "block", code: "id_mismatch", passed: false };
    }
  }

  const now = new Date().toISOString();

  // One ID, one account. The primary key decides any race.
  if (product === "biometric_kyc" && outcome.passed) {
    const { error } = await admin.from("verified_id_hashes").insert({
      id_hash: session.id_hash,
      profile_id: session.profile_id,
      id_type: session.id_type,
      verified_at: now,
    });
    if (error) {
      const { data: existing } = await admin
        .from("verified_id_hashes")
        .select("profile_id")
        .eq("id_hash", session.id_hash)
        .maybeSingle();
      if (existing?.profile_id !== session.profile_id) {
        outcome = { status: "block", code: "id_already_used", passed: false };
      }
    }
  }

  // Claim the session — only if still undecided, so a concurrent retry can't
  // apply the same result twice.
  const { data: claimed } = await admin
    .from("verification_sessions")
    .update({
      status: outcome.status,
      result_code: outcome.code,
      passed: outcome.passed,
      // Only a verified ID's hash is kept (privacy policy §8).
      id_hash: outcome.passed ? session.id_hash : null,
      job_id: jobId,
      completed_at: now,
    })
    .eq("id", session.id)
    .in("status", ["started", "submitted"])
    .select("id");
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ ok: true, ignored: "already decided" });
  }

  if (outcome.passed) {
    const { data: profile } = await admin
      .from("profiles")
      .select("stage")
      .eq("id", session.profile_id)
      .single();

    if (product === "smartselfie" && profile?.stage === "phone_verified") {
      await admin
        .from("profiles")
        .update({ stage: "verified_real", liveness_verified_at: now })
        .eq("id", session.profile_id);
      await capture("verification_complete", session.profile_id, { stage: "verified_real" });
    }
    // A re-verification selfie (0025): the stage stays, the liveness date
    // moves on, and the request is cleared by the database trigger.
    if (product === "smartselfie" && (profile?.stage === "verified_real" || profile?.stage === "id_confirmed")) {
      await admin.from("profiles").update({ liveness_verified_at: now }).eq("id", session.profile_id);
    }
    if (product === "biometric_kyc" && profile?.stage === "verified_real") {
      await admin
        .from("profiles")
        .update({ stage: "id_confirmed", id_confirmed_at: now })
        .eq("id", session.profile_id);
    }
  }

  // Trust Sentinel: one event per result, outcome only.
  await admin.rpc("emit_trust_event", {
    p_profile_id: session.profile_id,
    p_subject_id: null,
    p_kind: product === "smartselfie" ? "liveness_result" : "id_check_result",
    p_meta: { status: outcome.status, reason: outcome.code, environment: session.environment },
  });

  revalidatePath("/verify");
  return NextResponse.json({ ok: true });
}
