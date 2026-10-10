import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Tonight on Toastly" (Home hero). SERVER ONLY.
 *
 * Live counts from home_live_stats() (0043), or null — and the card is not
 * rendered — until the platform has 500 Verified Real members
 * (site_config 'tonight_min_verified_members'). Never a typed-in figure: a
 * constraint check keeps numbers out of this card.
 */
export type TonightStat = { label: string; value: string };

export async function getTonightStats(): Promise<TonightStat[] | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.rpc("home_live_stats");
  if (error || !data) return null;
  const s = data as { verified_members: number; gists_this_week: number; couples: number };
  const n = (v: number) => Number(v).toLocaleString("en-NG");
  return [
    { label: "Verified members", value: n(s.verified_members) },
    { label: "Gist sessions this week", value: n(s.gists_this_week) },
    { label: "Couples in Couple Mode", value: n(s.couples) },
  ];
}
