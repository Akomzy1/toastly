import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SERVER ONLY. The launch switch (decided 8 October 2026).
 *
 * LAUNCH_PAYMENTS_ENABLED, off unless set to exactly "true". While it's off,
 * no plan screen, checkout or coin purchase can complete for anyone except
 * the allow-list: staff, and the emails in LAUNCH_TEST_ACCOUNTS
 * (comma-separated). Launch day is setting LAUNCH_PAYMENTS_ENABLED=true in
 * Vercel's Production environment and redeploying — nothing else changes.
 *
 * Every payment entry point calls paymentsOpenFor() on the server; a test
 * fails if one doesn't (scripts/launch-switch.test.mjs).
 */

export const PAYMENTS_CLOSED = "Plans and coins open at launch. Everything on Starter is yours to use until then.";

export function paymentsLaunched(): boolean {
  return process.env.LAUNCH_PAYMENTS_ENABLED === "true";
}

export function onLaunchAllowList(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.LAUNCH_TEST_ACCOUNTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/** Can this signed-in member pay right now? */
export async function paymentsOpenFor(
  supabase: SupabaseClient,
  user: { email?: string | null },
): Promise<boolean> {
  if (paymentsLaunched()) return true;
  if (onLaunchAllowList(user.email)) return true;
  const { data } = await supabase.rpc("is_staff");
  return data === true;
}
