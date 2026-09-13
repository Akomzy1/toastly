import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * Entitlement checks (tier gating, Gist caps, Starter chat asymmetry) must be
 * enforced server-side through this client — CLAUDE.md requires them at the
 * access-control layer, not in UI copy.
 */
/**
 * True when Supabase credentials are present.
 *
 * Callers should check this before creating a client on a route that would
 * otherwise 500 on a fresh clone. The marketing site needs no Supabase at
 * all; the app routes need it, and should say so plainly rather than
 * crashing with a library error.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component — refreshing sessions is handled
            // by middleware, so this can be safely ignored.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // See above.
          }
        },
      },
    },
  );
}
