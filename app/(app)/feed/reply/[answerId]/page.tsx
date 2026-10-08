import { STARTER_MONTHLY_GISTS, upgradeOffer } from "@/lib/plan-numbers";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMemberProfile } from "@/lib/member-profile";
import { ReplyScreen } from "@/components/gist/reply-screen";
import { canSendText } from "@/lib/feed";
import { resetDate } from "@/lib/gist-invites";
import type { Tier } from "@/lib/types/profile";
import { requireLiveProfile } from "@/lib/live-profile";
import { ProfileNotLive } from "@/components/app/profile-not-live";

export const metadata: Metadata = { title: "Reply", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Reply to one prompt answer from today's six. RLS only returns the answer
 * when its owner is in your feed today, so this page can't be used to reach
 * anyone else.
 */
export default async function ReplyPage({ params }: { params: { answerId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // No live profile, no access (PRD §5.1.2): checked before anything about
  // anyone else is read. The database refuses regardless (0029); this says why.
  const live = await requireLiveProfile(supabase);
  if (!live.live) return <ProfileNotLive status={live} />;

  const { data: row } = await supabase
    .from("prompt_answers")
    .select("id, answer, profile_id, prompts(text)")
    .eq("id", params.answerId)
    .maybeSingle();
  if (!row || row.profile_id === user.id) notFound();

  const [person, { data: tierRow }, { data: used }, { data: room }, { data: me }, { data: cfg }, { data: coins }] = await Promise.all([
    getMemberProfile(supabase, row.profile_id),
    supabase.rpc("current_tier", { p_profile_id: user.id }),
    supabase.rpc("voice_gists_this_month", { p_profile_id: user.id }),
    supabase.rpc("gist_has_room", { p_profile_id: user.id }),
    supabase.from("profiles").select("country_code").eq("id", user.id).maybeSingle(),
    supabase.rpc("extra_gist_price", { p_profile_id: user.id }),
    supabase.rpc("coin_balance", { p_profile_id: user.id }),
  ]);
  // ₦1,000 or $3 in coins, by the member's track — both in plan_config (0037).
  const extraPrice = typeof cfg === "number" && cfg > 0 ? cfg : null;
  const tier = (tierRow as Tier | null) ?? "starter";
  const paid = canSendText(tier);
  const prompt = (Array.isArray(row.prompts) ? row.prompts[0]?.text : (row.prompts as { text?: string } | null)?.text) ?? "";

  return (
    <ReplyScreen
      mode={paid ? "paid" : room === false ? "limit" : "starter"}
      answerId={row.id}
      recipientId={row.profile_id}
      name={person?.display_name ?? "this member"}
      city={person?.city ?? null}
      prompt={prompt}
      answer={row.answer}
      gistsLeft={paid ? null : Math.max(0, STARTER_MONTHLY_GISTS - ((used as number | null) ?? 0))}
      resetOn={resetDate()}
      offer={upgradeOffer((me?.country_code ?? "NG") !== "NG")}
      extraGist={extraPrice ? { coins: extraPrice, have: Math.max(0, Number(coins ?? 0)) } : null}
    />
  );
}
