import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GetCoins } from "./get-coins";

export const metadata: Metadata = {
  title: "Get coins",
  robots: { index: false, follow: false },
};

/**
 * Get coins — coins-get.slim.html (naira) and coins-get-usd.slim.html
 * (members abroad). The currency follows where the member lives; nobody
 * abroad is quoted in naira (PRD §5.5 rule 3).
 */
export default async function GetCoinsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: me }, { data: balance }] = await Promise.all([
    supabase.from("profiles").select("country_code").eq("id", user.id).single(),
    supabase.rpc("coin_balance", { p_profile_id: user.id }),
  ]);
  return <GetCoins currency={me?.country_code === "NG" ? "NGN" : "USD"} balance={Math.max(Number(balance ?? 0), 0)} />;
}
