import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DeleteFlow } from "./delete-flow";

export const metadata: Metadata = {
  title: "Delete your account",
  robots: { index: false, follow: false },
};

/**
 * Delete your account — design/prototype/account-delete.slim.html.
 *
 * Step 1 says what happens and, if the member has coins, shows the balance
 * and offers to use them first: deleting forfeits unspent coins (decided
 * 2026-10-05). Step 2 is the typed confirmation.
 *
 * ALWAYS OPEN: no plan, no live-profile guard.
 *
 * Not yet shown: the prototype's "Some safety records are kept until an open
 * review is settled." It needs the review and removal state, which comes
 * next in the build order.
 */
export default async function DeleteAccountPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: balance } = await supabase.rpc("coin_balance", { p_profile_id: user.id });

  return <DeleteFlow coins={(balance as number | null) ?? 0} reviewOpen={false} />;
}
