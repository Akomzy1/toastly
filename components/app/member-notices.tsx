import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Notice } from "@/components/ui/notice";
import { reasonLabel } from "@/lib/review";
import { DismissNotice } from "./dismiss-notice";

/**
 * What a member is told after a staff decision (0025): restricted, asked to
 * re-verify, or asked to switch plan. A restriction gives its reason category
 * only — never the signal, the reporter or the evidence — and always a way to
 * reach a person. A re-check gives NO reason at all (decided 6 October 2026):
 * the reason is shown only when an account is restricted.
 *
 * NOT IN A PROTOTYPE — flagged in SKILL.md. Built from the in-app Notice.
 */
export async function MemberNotices() {
  const supabase = createClient();
  const [{ data: restriction }, { data: reverify }, { data: notices }] = await Promise.all([
    supabase.from("account_restrictions").select("reason_category").is("lifted_at", null).maybeSingle(),
    // Never the reason (decided 6 October 2026): the re-check is never
    // explained, so its reason category isn't even read here.
    supabase.from("reverification_requests").select("profile_id").maybeSingle(),
    supabase.from("member_notices").select("id, kind").is("dismissed_at", null).order("created_at", { ascending: false }),
  ]);
  return <MemberNoticesView restriction={restriction} reverify={reverify} notices={notices ?? []} />;
}

/** The display alone, so the mobile audit can render every state. */
export function MemberNoticesView({
  restriction,
  reverify,
  notices,
}: {
  restriction: { reason_category: string } | null;
  reverify: { profile_id: string } | null;
  notices: { id: string; kind: string }[];
}) {
  if (!restriction && !reverify && !notices.length) return null;

  return (
    <div className="mx-auto grid w-full max-w-[680px] gap-2.5 px-3.5 pt-3">
      {restriction ? (
        <Notice tone="error" title="Your account is restricted for now">
          A person on our team is looking into {reasonLabel(restriction.reason_category)}. Until then you won&rsquo;t appear
          in matches and can&rsquo;t start new conversations, Gists or dates. The safety kit, reporting, blocking,
          verification and your data all still work. To talk to a person, open Toastly Help from your profile.
        </Notice>
      ) : null}
      {reverify ? (
        <Notice tone="info" title="Quick re-check">
          We sometimes ask members to confirm it&rsquo;s still them. One selfie, about a minute. Until it&rsquo;s done
          you won&rsquo;t appear in new matches, but your conversations carry on.{" "}
          <Link href="/verify" className="mt-1 flex min-h-11 items-center font-semibold underline">
            Start the re-check
          </Link>
        </Notice>
      ) : null}
      {notices.map((n) =>
        n.kind === "switch_plan" ? (
          <Notice key={n.id} tone="info" title="About your plan">
            Your profile says you live outside Nigeria, and you&rsquo;re on a Naira plan. The Diaspora plan is the one for
            members abroad. Nothing has changed on your account — if you live in Nigeria, update your profile country;
            otherwise, please move to the Diaspora plan when your current one ends.
            <span className="mt-1 flex flex-wrap gap-x-4">
              <Link href="/profile/plan" className="flex min-h-11 items-center font-semibold underline">
                See your plan
              </Link>
              <DismissNotice id={n.id} />
            </span>
          </Notice>
        ) : n.kind === "offer_ending" ? (
          <Notice key={n.id} tone="info" title="Your free month ends in three days">
            Your 30 free days end soon. Nothing is charged — after that you&rsquo;re on Starter, which is free, and you
            keep your matches and verification.
            <span className="mt-1 flex flex-wrap gap-x-4">
              <Link href="/profile/plan" className="flex min-h-11 items-center font-semibold underline">
                See your plan
              </Link>
              <DismissNotice id={n.id} />
            </span>
          </Notice>
        ) : null,
      )}
    </div>
  );
}
