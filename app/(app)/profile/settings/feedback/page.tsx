import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { FEEDBACK_CATEGORIES, feedbackPage } from "@/lib/beta";
import { FeedbackForm } from "./feedback-form";

/**
 * PLACEHOLDER — pending the Claude Design prototype (beta.html). The prototype
 * is the source of truth for this screen; restyle to it when it arrives and
 * delete this note. Until then: a plain form from existing components.
 *
 * Settings → Send feedback. Open to any signed-in member, live or not: a new
 * member who is stuck needs to be able to say so. The page the member came
 * from arrives as ?from= (the Beta label adds it) and is reduced to its path.
 */
export const metadata: Metadata = { title: "Send feedback", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function FeedbackPage({ searchParams }: { searchParams: { from?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const from = feedbackPage(searchParams.from ?? "/profile/settings");

  return (
    <>
      <ScreenBand title="Send feedback" back="/profile/settings" />
      <div className="mx-auto grid max-w-[680px] gap-4 px-4 py-6 lg:px-6">
        <FeedbackForm categories={FEEDBACK_CATEGORIES} from={from} />
      </div>
    </>
  );
}
