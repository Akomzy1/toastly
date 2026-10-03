import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadInvite, sinceLabel } from "@/lib/gist-invites";
import { canSendText } from "@/lib/feed";
import { InviteSentView } from "@/components/gist/invite-sent-view";
import type { Tier } from "@/lib/types/profile";

export const metadata: Metadata = { title: "Invite sent", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Invite sent — gist-invite-sent.slim.html (prototype 4). */
export default async function InviteSent({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ctx = await loadInvite(supabase, params.id, user.id);
  if (!ctx || !ctx.iAmProposer) notFound();
  const { data: tierRow } = await supabase.rpc("current_tier", { p_profile_id: user.id });
  const starter = !canSendText((tierRow as Tier | null) ?? "starter");

  return (
    <InviteSentView
      otherName={ctx.other.name}
      starter={starter}
      since={sinceLabel(ctx.createdAt, ctx.me.zone)}
      answer={ctx.answer}
    />
  );
}
