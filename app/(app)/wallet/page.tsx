import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, FeatureCard } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { COIN_PACKS, TIER_LABELS } from "@/lib/entitlements";
import type { Tier } from "@/lib/types/profile";

export const metadata: Metadata = {
  title: "Coins",
  robots: { index: false, follow: false },
};

/**
 * Wallet.
 *
 * NOT IN THE PROTOTYPE — flagged. Pricing shows the coin packs as marketing;
 * there is no in-app wallet screen in the approved design.
 *
 * Copy here stays warm: coins are a promise, not a fee, and a locked stake
 * credit is framed as something the member was given because somebody stood
 * them up — never as a punishment ledger.
 */
export default async function WalletPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tierRow } = await supabase.rpc("current_tier", {
    p_profile_id: user.id,
  });
  const tier = (tierRow as Tier | null) ?? "starter";

  const { data: balanceRow } = await supabase.rpc("coin_balance", {
    p_profile_id: user.id,
  });
  const { data: withdrawableRow } = await supabase.rpc("withdrawable_balance", {
    p_profile_id: user.id,
  });

  const balance = (balanceRow as number | null) ?? 0;
  const withdrawable = (withdrawableRow as number | null) ?? 0;
  const locked = Math.max(0, balance - withdrawable);

  const { data: entries } = await supabase
    .from("coin_ledger")
    .select("id, delta, kind, note, created_at, withdrawable")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Coins</h1>
        <p className="text-ui text-grey-600">
          Coins aren&rsquo;t a subscription and they aren&rsquo;t a fee. You
          stake a few when a date is confirmed, and they come straight back
          when you both turn up.
        </p>
      </div>

      <Card className="grid gap-4 p-[26px]">
        <div className="flex flex-wrap items-baseline gap-4">
          <span className="font-serif text-h2 text-ink-900">{balance}</span>
          <span className="text-ui text-grey-600">coins</span>
          <Badge variant="verified" className="ml-auto">
            {TIER_LABELS[tier]}
          </Badge>
        </div>

        {locked > 0 ? (
          /* A stake credit exists because somebody did not turn up. Framed as
             what it is — the member put back in the game for free — and never
             offered in a withdrawal flow, because it is not cash. */
          <Notice tone="info" title={`${locked} of those are stake credits`}>
            Somebody didn&rsquo;t show up for a date you kept. That stake came
            to you as credit towards a future date — it isn&rsquo;t cash and
            can&rsquo;t be cashed out, but it puts you back on a table for
            free.
          </Notice>
        ) : null}

        <p className="text-nav text-grey-600">
          {withdrawable} refundable to your original payment method on request.
          Unused coins never expire.
        </p>
      </Card>

      <div className="grid gap-3">
        <h2 className="text-h5 text-ink-900">Top up</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {COIN_PACKS.map((p) => (
            <FeatureCard key={p.id}>
              <span className="font-serif text-h4 text-green-500">
                {p.coins}
              </span>
              <h3 className="text-h5 text-ink-900">{p.price}</h3>
              <p className="text-ui text-grey-600">{p.note}</p>
              <Badge
                variant={p.currency === "NGN" ? "trackNgn" : "trackUsd"}
                className="justify-self-start"
              >
                {p.currency === "NGN" ? "₦ Paystack" : "$ Stripe"}
              </Badge>
            </FeatureCard>
          ))}
        </div>
        {/* Honest about what isn't wired, rather than a button that fails. */}
        <Notice tone="locked" title="Payments aren't connected yet">
          Paystack and Stripe credentials aren&rsquo;t set in this environment,
          so top-ups can&rsquo;t complete. The ledger, the stake rules and the
          entitlement grants all work.
        </Notice>
      </div>

      {entries?.length ? (
        <div className="grid gap-3">
          <h2 className="text-h5 text-ink-900">Recent</h2>
          <ul className="grid list-none gap-2 p-0">
            {entries.map((e) => (
              <li key={e.id}>
                <Card className="flex items-center justify-between gap-4 p-4">
                  <span className="grid gap-0.5">
                    <span className="text-ui text-ink-900">
                      {e.note ?? e.kind.replace(/_/g, " ")}
                    </span>
                    <span className="text-caption uppercase text-grey-400">
                      {new Date(e.created_at).toLocaleDateString()}
                      {!e.withdrawable ? " · credit" : ""}
                    </span>
                  </span>
                  <span
                    className={
                      e.delta > 0
                        ? "text-ui font-semibold text-success"
                        : "text-ui font-semibold text-ink-900"
                    }
                  >
                    {e.delta > 0 ? `+${e.delta}` : e.delta}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
