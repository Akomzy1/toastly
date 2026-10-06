import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DeleteFlow } from "@/components/account/delete-flow";

export const metadata: Metadata = { title: "Delete your account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Delete your account — design/prototype/account-delete.slim.html.
 *
 * Step 1 says what happens and, if the member has coins, shows the balance
 * and offers to use them first: deleting forfeits unspent coins (decided
 * 5 October 2026). Step 2 is the typed confirmation.
 *
 * ALWAYS OPEN: no plan, no live-profile guard.
 *
 * "Some safety records are kept until an open review is settled." shows when
 * a review about the member is open: their phone and ID are then held on the
 * blocklist until a person settles it (0029).
 */
export default async function DeleteAccountPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: balance }, { data: reviewOpen }] = await Promise.all([
    supabase.rpc("coin_balance", { p_profile_id: user.id }),
    supabase.rpc("has_open_review"),
  ]);

  return <DeleteFlow coins={Math.max(0, (balance as number | null) ?? 0)} reviewOpen={reviewOpen === true} />;
}
