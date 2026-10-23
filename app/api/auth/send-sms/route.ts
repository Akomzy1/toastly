import { NextResponse } from "next/server";
import { handleSendSms, type Logger } from "@/lib/sms-codes";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Supabase Auth's "Send SMS" hook (Authentication → Hooks). Supabase makes the
 * code; this delivers it — through Termii for +234 numbers — and nothing more.
 * All the rules (the approved wording, channel "dnd", no number or code in a
 * log, no real SMS outside production) live in lib/sms-codes.ts, where they
 * are tested.
 *
 * Called by Supabase with no session; every request is checked against the
 * hook secret first.
 */
const log: Logger = (message, meta) => {
  // Fixed keys only (provider, reason, status, mode): nothing identifying fits.
  console.info(`[send-sms] ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`);
};

export async function POST(request: Request) {
  const raw = await request.text();
  const admin = createAdminClient();
  const res = await handleSendSms(raw, request.headers, {
    env: process.env,
    fetchImpl: fetch,
    log,
    allow: async (key) => {
      if (!admin) throw new Error("not configured");
      const { data, error } = await admin.rpc("sms_code_allow", { p_phone_key: key });
      if (error) throw new Error("limiter failed");
      return data === true;
    },
  });
  return NextResponse.json(res.body, { status: res.status });
}
