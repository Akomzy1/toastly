import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { PassedList } from "@/components/feed/passed-list";

export const metadata: Metadata = { title: "People you passed on", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Settings → "People you passed on" (PRD §5.2.5). PLAIN VERSION, NOT IN THE
 * PROTOTYPE — flagged. Only the member's own passes: a name and a city, read
 * through my_passes(). Nobody else can see this list, and the people on it are
 * never told.
 */
export default async function PassedPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.rpc("my_passes");
  const rows = (data ?? []) as { candidate_id: string; display_name: string; city: string | null }[];

  return (
    <>
      <ScreenBand title="People you passed on" back="/profile/settings" />
      <div className="mx-auto grid w-full max-w-[680px] content-start gap-3 px-3.5 pb-6 pt-[18px]">
        <p className="m-0 text-ui text-grey-600">
          They won&rsquo;t appear in your six. They&rsquo;re never told, and passing isn&rsquo;t a block or a report. Bring
          someone back and they can appear again in a future six.
        </p>
        <PassedList rows={rows} />
      </div>
    </>
  );
}
