import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { capture } from "@/lib/analytics";
import { combineOutcomes, onboardingOutcome, type StepResult } from "@/lib/face-match";
import {
  ID_NUMBER_PATTERN,
  hashIdNumber,
  isSmileStatus,
  smileConfig,
  verifySmileSignature,
  type SmileIdType,
  type SmileStatus,
} from "@/lib/smile-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Smile ID result webhook — THE ONLY SOURCE OF TRUTH for verification.
 *
 * Every check is submitted over REST from the page (0029; the hosted flow is
 * retired, decided 6 October 2026) and matched here on our own nonce.
 *
 * WHAT IS READ from the payload: status, reason, the job id and our own
 * session nonce. For the ID check, id_fields.id_number is read once, in
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
  step: "onboard" | "authenticate" | "compare" | "reverify";
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
 *   reverify      one Authentication a reviewer asked for: a pass clears the
 *                 request (0026's trigger, on the update below); attention
 *                 goes to a person as a selfie review
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
  } else if (s.step === "reverify") {
    if (passed) await admin.from("profiles").update({ liveness_verified_at: now }).eq("id", s.profile_id);
    await admin.rpc("emit_trust_event", {
      p_profile_id: s.profile_id,
      p_subject_id: null,
      p_kind: "liveness_result",
      p_meta: { status: r.status, reason: r.reason, step: "reverify" },
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

  // The hosted flow is retired — for Verified Real and for the ID check
  // (0029; decided 6 October 2026). A hosted result grants nothing: the
  // session is closed so it stops showing as "being checked".
  if (!session.step) {
    await admin
      .from("verification_sessions")
      .update({ status: "error", result_code: "hosted_flow_retired", passed: false, job_id: jobId, completed_at: new Date().toISOString() })
      .eq("id", session.id)
      .in("status", ["started", "submitted"]);
    return NextResponse.json({ ok: true, ignored: "hosted flow retired" });
  }

  // Every check is submitted over REST from the page and matched on the
  // same nonce, so all of them are handled here.
  if (session.environment !== cfg.env) return NextResponse.json({ ok: true, ignored: "environment mismatch" });
  const st = payload.status;
  if (!isSmileStatus(st)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const result = { status: st, reason: str(payload.reason, 64) };
  if (session.step === "id_kyc" || session.step === "id_auth") {
    return handleIdCheck(admin, session as IdSession, payload, result, jobId);
  }
  return handleFaceMatch(admin, session as FaceSession, result, jobId);
}

type IdSession = {
  id: string;
  profile_id: string;
  step: "id_kyc" | "id_auth";
  check_id: string | null;
  id_type: string | null;
  id_hash: string | null;
  environment: string;
};

/**
 * One half of the in-page ID check (decided 6 October 2026):
 *   id_kyc   Biometric KYC — the number on the official record, the selfie
 *            against its photo
 *   id_auth  Authentication — the same selfie against the face registered at
 *            onboarding
 * Whichever reports second asks the database for the ring, which it grants
 * only when both are clear (record_id_check). A borderline half reaches a
 * person as an ID review.
 */
async function handleIdCheck(admin: Admin, s: IdSession, payload: Record<string, unknown>, r: StepResult, jobId: string | null) {
  let status: SmileStatus = r.status;
  let code: string | null = r.reason ?? (status === "clear" ? "clear" : null);
  let keepHash = false;

  // The number Smile ID checked must be the number the member entered — the
  // signature doesn't cover the body, so this binds the result to the
  // session. The number lives only in this block; only its keyed hash, made
  // when the member submitted, is ever kept.
  if (s.step === "id_kyc" && (status === "clear" || status === "attention")) {
    const idFields = (payload.id_fields ?? {}) as Record<string, unknown>;
    const idType = s.id_type as SmileIdType | null;
    const checked = typeof idFields.id_number === "string" ? idFields.id_number.replace(/\s+/g, "") : "";
    const { data: key } = await admin.rpc("id_number_hmac_key");
    const readable = Boolean(idType && s.id_hash && typeof key === "string" && ID_NUMBER_PATTERN[idType].test(checked));
    if (readable && hashIdNumber(key as string, idType!, checked) !== s.id_hash) {
      status = "block";
      code = "id_mismatch";
    } else if (!readable && status === "clear") {
      status = "error";
      code = "id_unreadable";
    } else {
      // Clear, or borderline for a person to decide: the fingerprint waits
      // with the session until the ring is granted.
      keepHash = true;
    }
  }

  const { data: claimed } = await admin
    .from("verification_sessions")
    .update({
      status,
      result_code: code,
      passed: status === "clear",
      id_hash: keepHash ? s.id_hash : null,
      job_id: jobId,
      completed_at: new Date().toISOString(),
    })
    .eq("id", s.id)
    .in("status", ["started", "submitted"])
    .select("id");
  if (!claimed || claimed.length === 0) return NextResponse.json({ ok: true, ignored: "already decided" });

  await admin.rpc("emit_trust_event", {
    p_profile_id: s.profile_id,
    p_subject_id: null,
    p_kind: "id_check_result",
    p_meta: { status, reason: code, step: s.step, environment: s.environment },
  });

  if (s.check_id) {
    const { data: pair } = await admin.from("verification_sessions").select("step, status").eq("check_id", s.check_id);
    const done = (step: string) => pair?.some((p) => p.step === step && p.status !== "started" && p.status !== "submitted");
    if (done("id_kyc") && done("id_auth")) {
      const { error } = await admin.rpc("record_id_check", { p_check: s.check_id });
      if (error) return NextResponse.json({ error: "could not record" }, { status: 500 });
    }
  }

  revalidatePath("/verify");
  return NextResponse.json({ ok: true });
}
