import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PLANS, type PlanKey } from "@/lib/coins";
import { Checkout } from "./checkout";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

/**
 * Checkout — coins-checkout.slim.html. Coins apply first on a naira plan;
 * the rest is paid by card, transfer or USSD. A Diaspora plan is billed in
 * USD and never takes coins — refused in the database, said plainly here.
 */
export default async function CheckoutPage({ searchParams }: { searchParams: { plan?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const plan = (searchParams.plan && searchParams.plan in PLANS ? searchParams.plan : "premium") as PlanKey;
  const { data: quote } = plan === "diaspora" ? { data: null } : await supabase.rpc("coin_checkout_quote", { p_tier: plan });
  const q = quote as { coins_used: number; naira_left: number } | null;

  return <Checkout plan={plan} coinsUsed={q?.coins_used ?? 0} nairaLeft={q?.naira_left ?? null} />;
}
