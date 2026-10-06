import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client.
 *
 * SERVER ONLY, and only where there is no signed-in member to act as —
 * payment webhooks, which arrive from Paystack and Stripe with no session
 * and must resolve a payment reference to a member — or where a write is
 * deliberately server-owned and the member has been checked first: binding
 * a confirmed phone number (record_phone_verified, 0028), stopping a plan's
 * renewal at the provider (lib/payments/stop-renewal.ts), the selfie checks
 * (app/(app)/verify/selfie-actions.ts), storing a profile photo once it has
 * been stripped of its metadata — members can't write to the bucket
 * themselves (app/(app)/profile/photos/actions.ts, 0029) — and the member's
 * own guarded rows in their data download (app/api/account/export, 0029).
 *
 * This client BYPASSES row-level security. Every policy in the migrations
 * is inert here, so each use must be narrow and deliberate. Never import it
 * into a page or a client component, and never use it for an ordinary
 * member read or write — those have a session and should use it, so that
 * RLS still applies.
 *
 * Returns null when the key is unset, so callers degrade instead of throwing.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
