import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteAccountForm } from "./delete-form";

export const metadata: Metadata = {
  title: "Your data",
  robots: { index: false, follow: false },
};

/**
 * Your data — download it, or delete your account (privacy policy §8, §10).
 *
 * INVENTED UI — flagged. The nav export's profile hub lists this as "Your
 * data · See, download or delete what we hold", but no screen for it has
 * been designed. Built from existing primitives only.
 *
 * ALWAYS OPEN: no tier, no live-profile guard. Leaving, and taking your data
 * with you, are never conditional on anything.
 */
export default async function AccountPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Your data</h1>
        <p className="text-ui text-grey-600">
          See, download or delete what we hold. You can do both of these at any
          time, on any plan.
        </p>
      </div>

      <Card className="grid gap-4 p-[26px]">
        <h2 className="text-h5 text-ink-900">Download your data</h2>
        <p className="text-ui text-grey-600">
          One file with your profile, answers, photos, Gist history, messages
          you can read, dates, coins and payments, and the reports you&rsquo;ve
          filed. Photo links in it work for 24 hours.
        </p>
        <Button asChild variant="outline" className="justify-self-start">
          {/* A plain link, not client navigation: the route answers with a file. */}
          <a href="/account/export" download>
            Download my data
          </a>
        </Button>
      </Card>

      <Card className="grid gap-4 p-[26px]">
        <h2 className="text-h5 text-ink-900">Delete your account</h2>
        <div className="grid gap-2 text-ui text-grey-600">
          <p>
            Your profile, photos, answers, Gists, messages and everything else
            about you are deleted straight away. Anyone you&rsquo;re in Couple
            Mode with is un-paused, and any date with coins staked is called
            off with every stake returned.
          </p>
          {/* The durations stay out of this copy until the privacy policy's
              bracketed [6] years and [2] years are confirmed. */}
          <p>
            Two things are kept, without your name on them, because the law or
            members&rsquo; safety needs them: payment records, for as long as
            tax law requires; and reports, for a limited time — see our privacy
            policy.
          </p>
          <p>
            If you have coins left, email{" "}
            <a href="mailto:support@trytoastly.com" className="text-green-500">
              support@trytoastly.com
            </a>{" "}
            before you delete.
          </p>
        </div>
        <DeleteAccountForm />
      </Card>
    </div>
  );
}
