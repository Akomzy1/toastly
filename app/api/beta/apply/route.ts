import { NextResponse } from "next/server";
import { handleApply, type Logger } from "@/lib/beta";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The founding-members application (public, no sign-in). The only way a row
 * reaches beta_applications: the table has no policy for anyone, and the
 * insert function is the service role's. Every rule — the honeypot, the
 * fields, the rate limit per address, one application per number, the same
 * reply for a number that has applied — lives in lib/beta.ts, where it is
 * tested.
 */
const log: Logger = (message, meta) => {
  // Fixed keys only (reason, status, field): nothing a person typed fits.
  console.info(`[beta-apply] ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`);
};

const MAX_BODY = 4096;

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 413 });
  }
  let input: unknown = null;
  try {
    if ((request.headers.get("content-type") ?? "").includes("application/json")) {
      input = JSON.parse(raw);
    } else {
      input = Object.fromEntries(new URLSearchParams(raw));
    }
  } catch {
    input = null;
  }

  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0].trim() || null;

  const admin = createAdminClient();
  const res = await handleApply(input, ip, {
    env: process.env,
    log,
    allowAddress: async (ipKey) => {
      if (!admin) throw new Error("not configured");
      const { data, error } = await admin.rpc("beta_apply_allow", { p_ip_key: ipKey });
      if (error) throw new Error("limiter failed");
      return data === true;
    },
    store: async (row) => {
      if (!admin) throw new Error("not configured");
      const { data, error } = await admin.rpc("beta_apply", {
        p_first_name: row.first_name,
        p_age: row.age,
        p_gender: row.gender,
        p_location_type: row.location_type,
        p_lagos_area: row.lagos_area,
        p_other_location: row.other_location,
        p_phone_e164: row.phone_e164,
        p_phone_key: row.phone_key,
        p_source: row.source,
        p_consent: row.consent,
      });
      if (error) throw new Error("store failed");
      return data === "stored" || data === "duplicate" || data === "not_open" ? data : "duplicate";
    },
  });
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}
