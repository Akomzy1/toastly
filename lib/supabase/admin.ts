import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client.
 *
 * SERVER ONLY, and only where there is no signed-in member to act as —
 * today that means payment webhooks, which arrive from Paystack and Stripe
 * with no session and must resolve a payment reference to a member.
 *
 * This client BYPASSES row-level security. Every policy written across the
 * other eleven migrations is inert here, so each use must be narrow and
 * deliberate. Never import it into a page, a client component, or any action
 * that runs on behalf of a member — those have a session and should use it,
 * so that RLS still applies.
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
