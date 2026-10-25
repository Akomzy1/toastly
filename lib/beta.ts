/**
 * The founding-members beta (owner, 25 October 2026): 200 founding members,
 * Lagos only for now, 3 months of Premium free from public launch day.
 *
 * SERVER ONLY. No relative imports on purpose: the unit tests load this file
 * on its own and prove each rule against a deliberately broken copy.
 *
 * Two jobs:
 *
 *  1. The application form's server side (handleApply). The form is public —
 *     no sign-in — so everything is checked here and again by the table. A
 *     honeypot field, our own rate limit per address, one application per
 *     number, and a reply that never tells anyone whether a number applied.
 *
 *  2. The invite-only gate (checkBetaGate). With BETA_INVITE_ONLY=true a number
 *     is checked against the approved applications BEFORE any SMS is sent, and
 *     every refusal is the same words.
 *
 * What an application collects, and nothing else: first name, age, gender,
 * where they live, a +234 number, how they heard of us, and a consent tick. No
 * photos, ethnicity, religion, health or income.
 */

import { createHmac } from "node:crypto";

type Env = Record<string, string | undefined>;
/** Only these keys, only these values: nothing identifying can be passed to a log. */
export type LogMeta = Partial<Record<"reason" | "status" | "field", string | number>>;
export type Logger = (message: string, meta?: LogMeta) => void;

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/**
 * Shown at the phone step to anyone whose number isn't approved. ONE message
 * for every case — never applied, applied and waiting, waitlisted, declined —
 * so it can never be used to find out whether a number applied.
 */
export const BETA_INVITE_ONLY_MESSAGE = "Toastly is invite-only for now. Apply at trytoastly.com/beta.";

/** After a Lagos application (and after a honeypot hit, so a bot learns nothing). */
export const BETA_THANKS_LAGOS = "Thanks. We'll message you if you're chosen.";
/** After an application from outside Lagos. */
export const BETA_THANKS_ELSEWHERE = "Thanks. We're starting in Lagos. We'll let you know when we open where you live.";

// ---------------------------------------------------------------------------
// The choices
// ---------------------------------------------------------------------------

/** Woman or man — the app's two options (lib/gender-options.ts). */
export const BETA_GENDERS = ["woman", "man"] as const;

export const BETA_LOCATION_TYPES = [
  { code: "lagos", label: "Lagos" },
  { code: "elsewhere_nigeria", label: "Elsewhere in Nigeria" },
  { code: "outside_nigeria", label: "Outside Nigeria" },
] as const;

export const BETA_LAGOS_AREAS = [
  { code: "lekki", label: "Lekki" },
  { code: "victoria_island_ikoyi", label: "Victoria Island/Ikoyi" },
  { code: "ajah", label: "Ajah" },
  { code: "yaba", label: "Yaba" },
  { code: "surulere", label: "Surulere" },
  { code: "ikeja", label: "Ikeja" },
  { code: "ikorodu", label: "Ikorodu" },
  { code: "maryland", label: "Maryland" },
  { code: "festac", label: "Festac" },
  { code: "other_lagos", label: "Other Lagos" },
] as const;

/**
 * "How you heard about us". The owner asked for a select without listing the
 * options — these are a PROPOSAL, to be confirmed with the page design.
 * Codes only ever reach the database as ^[a-z_]{1,30}$.
 */
export const BETA_SOURCES = [
  { code: "instagram", label: "Instagram" },
  { code: "tiktok", label: "TikTok" },
  { code: "x", label: "X (Twitter)" },
  { code: "whatsapp", label: "WhatsApp" },
  { code: "friend", label: "A friend" },
  { code: "event", label: "An event" },
  { code: "search", label: "Searching online" },
  { code: "other", label: "Somewhere else" },
] as const;

// ---------------------------------------------------------------------------
// Keys: a number and an address are only ever stored as keyed one-way keys
// (the number also as itself, for staff to send the invitation, until it signs up).
// ---------------------------------------------------------------------------

export function betaPepper(env: Env): string | null {
  const pepper = env.PHONE_HASH_PEPPER ?? (env.VERCEL_ENV === "production" ? "" : "development-only");
  return pepper ? pepper : null;
}

/** The key an application is stored under, and the gate looks a number up by. */
export function betaPhoneKey(e164: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`beta-application:${e164}`).digest("hex");
}

export function betaIpKey(ip: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`beta-apply-ip:${ip}`).digest("hex");
}

/**
 * A Nigerian mobile number in the one form the rest of the app uses
 * (+234 and ten digits), from "0803 123 4567", "+234 803 123 4567" or
 * "2348031234567". Anything else — including every other country — is null.
 */
export function normaliseNigerianNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;
  const plain = digits.replace(/^\+/, "");
  // Nigerian mobile numbers: 070x, 080x, 081x, 090x, 091x after the 0 / 234.
  if (/^0[789][01]\d{8}$/.test(plain)) return `+234${plain.slice(1)}`;
  if (/^234[789][01]\d{8}$/.test(plain)) return `+${plain}`;
  return null;
}

// ---------------------------------------------------------------------------
// The application
// ---------------------------------------------------------------------------

export type StoredApplication = {
  first_name: string;
  age: number;
  gender: "woman" | "man";
  location_type: "lagos" | "elsewhere_nigeria" | "outside_nigeria";
  lagos_area: string | null;
  other_location: string | null;
  phone_e164: string;
  phone_key: string;
  source: string;
  consent: true;
};

export type FieldProblem =
  | "first_name"
  | "age"
  | "under_18"
  | "gender"
  | "location_type"
  | "lagos_area"
  | "other_location"
  | "phone"
  | "source"
  | "consent";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Letters as names are written in Nigeria and the countries people write from:
// Latin with accents, and the dotted and toned letters of Yoruba and Igbo
// (U+1E00-1EFF, combining marks U+0300-036F). Spelled as ranges rather than
// \p{L} because the build targets an ES level without the unicode flag.
const LETTER = "[A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F\\u1E00-\\u1EFF]";
const LETTERS = "A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F\\u0300-\\u036F\\u1E00-\\u1EFF";

/**
 * Check every field. Returns the row to store or the first problem — never
 * more than the field's name, so nothing a person typed is echoed or logged.
 */
export function validateApplication(
  input: unknown,
  pepper: string,
): { ok: true; row: StoredApplication } | { ok: false; field: FieldProblem } {
  if (!isObject(input)) return { ok: false, field: "first_name" };

  const first_name = text(input.first_name);
  if (first_name.length < 1 || first_name.length > 40 || !new RegExp(`^${LETTER}[${LETTERS} '’-]*$`).test(first_name)) {
    return { ok: false, field: "first_name" };
  }

  const ageRaw = typeof input.age === "number" ? input.age : Number(text(input.age));
  if (!Number.isInteger(ageRaw) || ageRaw > 99 || ageRaw < 0) return { ok: false, field: "age" };
  if (ageRaw < 18) return { ok: false, field: "under_18" };

  const gender = BETA_GENDERS.find((g) => g === input.gender);
  if (!gender) return { ok: false, field: "gender" };

  const where = BETA_LOCATION_TYPES.find((l) => l.code === input.location_type);
  if (!where) return { ok: false, field: "location_type" };

  let lagos_area: string | null = null;
  let other_location: string | null = null;
  if (where.code === "lagos") {
    const area = BETA_LAGOS_AREAS.find((a) => a.code === input.lagos_area);
    if (!area) return { ok: false, field: "lagos_area" };
    lagos_area = area.code;
  } else {
    other_location = text(input.other_location);
    if (other_location.length < 1 || other_location.length > 80 || !new RegExp(`^[${LETTERS}0-9 .,'’()-]+$`).test(other_location)) {
      return { ok: false, field: "other_location" };
    }
  }

  const phone_e164 = normaliseNigerianNumber(input.phone);
  if (!phone_e164) return { ok: false, field: "phone" };

  const source = BETA_SOURCES.find((s) => s.code === input.source);
  if (!source) return { ok: false, field: "source" };

  if (!(input.consent === true || input.consent === "true" || input.consent === "on")) {
    return { ok: false, field: "consent" };
  }

  return {
    ok: true,
    row: {
      first_name,
      age: ageRaw,
      gender,
      location_type: where.code,
      lagos_area,
      other_location,
      phone_e164,
      phone_key: betaPhoneKey(phone_e164, pepper),
      source: source.code,
      consent: true,
    },
  };
}

export type ApplyDeps = {
  env: Env;
  /** Counts this attempt against the address and says whether it may go on. */
  allowAddress: (ipKey: string) => Promise<boolean>;
  /** beta_apply(): 'stored', 'duplicate' (already applied) or 'not_open'. */
  store: (row: StoredApplication) => Promise<"stored" | "duplicate" | "not_open">;
  log: Logger;
};
export type ApplyResponse = { status: number; body: Record<string, unknown> };

/** The hidden field a person never fills in and a bot usually does. */
export const BETA_HONEYPOT_FIELD = "website";

/**
 * The form's server side. Order matters: a honeypot hit is answered like a
 * success and stored nowhere; the fields are checked; THEN the address is
 * counted (so a person correcting typos isn't locked out); then the row is
 * stored. A number that has already applied gets exactly the reply a new one
 * does — the form never says whether a number applied.
 */
export async function handleApply(input: unknown, ip: string | null, deps: ApplyDeps): Promise<ApplyResponse> {
  const { env, log } = deps;
  const thanks = (location: unknown) => ({
    status: 200,
    body: { ok: true, message: location === "lagos" ? BETA_THANKS_LAGOS : BETA_THANKS_ELSEWHERE },
  });

  if (isObject(input) && text(input[BETA_HONEYPOT_FIELD]) !== "") {
    log("application refused", { reason: "honeypot" });
    return thanks(input.location_type);
  }

  const pepper = betaPepper(env);
  if (!pepper) {
    log("application refused", { reason: "pepper not configured" });
    return { status: 500, body: { ok: false, error: "unavailable" } };
  }

  const checked = validateApplication(input, pepper);
  if (!checked.ok) {
    log("application refused", { reason: "invalid", field: checked.field });
    return { status: 400, body: { ok: false, error: "invalid", field: checked.field } };
  }

  try {
    if (!(await deps.allowAddress(betaIpKey(ip ?? "unknown", pepper)))) {
      log("application refused", { reason: "rate limited" });
      return { status: 429, body: { ok: false, error: "too_many" } };
    }
    const stored = await deps.store(checked.row);
    if (stored === "not_open") {
      log("application refused", { reason: "not open yet" });
      return { status: 409, body: { ok: false, error: "not_open" } };
    }
    log("application stored", { reason: stored });
    return thanks(checked.row.location_type);
  } catch {
    log("application refused", { reason: "store failed" });
    return { status: 500, body: { ok: false, error: "unavailable" } };
  }
}

// ---------------------------------------------------------------------------
// The invite-only gate
// ---------------------------------------------------------------------------

export function betaInviteOnly(env: Env): boolean {
  return env.BETA_INVITE_ONLY === "true";
}

export type GateDeps = {
  env: Env;
  /** beta_number_approved(): is this number's application approved? */
  isApproved: (phoneKey: string) => Promise<boolean>;
};
export type GateResult = { allowed: true } | { allowed: false; reason: "invite_only" | "unavailable" };

/**
 * May a code be sent to this number? Asked BEFORE any SMS is sent, so a number
 * that isn't approved costs nothing. Fails closed: if the check can't be made
 * (no pepper, the database is down) nothing is sent.
 *
 * "invite_only" is the one refusal a person is shown, in BETA_INVITE_ONLY_MESSAGE,
 * whatever the reason — never applied, waiting, waitlisted, declined.
 */
export async function checkBetaGate(e164: string, deps: GateDeps): Promise<GateResult> {
  if (!betaInviteOnly(deps.env)) return { allowed: true };
  const pepper = betaPepper(deps.env);
  if (!pepper) return { allowed: false, reason: "unavailable" };
  try {
    return (await deps.isApproved(betaPhoneKey(e164, pepper)))
      ? { allowed: true }
      : { allowed: false, reason: "invite_only" };
  } catch {
    return { allowed: false, reason: "unavailable" };
  }
}

// ---------------------------------------------------------------------------
// Staff: dates are typed and shown in Lagos time (UTC+1, no daylight saving)
// ---------------------------------------------------------------------------

/** "2026-10-27T00:00" (a datetime-local field, Lagos time) → an ISO instant, or null. */
export function lagosInputToIso(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const at = new Date(`${value}:00+01:00`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** An ISO instant → the value a datetime-local field shows, in Lagos time. */
export function isoToLagosInput(iso: unknown): string {
  if (typeof iso !== "string") return "";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : new Date(at.getTime() + 3600_000).toISOString().slice(0, 16);
}

export const BETA_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  waitlisted: "Waitlisted",
  declined: "Declined",
};

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export const FEEDBACK_CATEGORIES = [
  { code: "bug", label: "Bug" },
  { code: "idea", label: "Idea" },
  { code: "safety", label: "Safety" },
  { code: "other", label: "Other" },
] as const;

/** The page a piece of feedback was sent from: the path only, never the query. */
export function feedbackPage(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  const path = raw.split("#")[0].split("?")[0];
  return /^\/[A-Za-z0-9/_.[\]()-]{0,118}$/.test(path) && !path.startsWith("//") ? path : "/";
}
