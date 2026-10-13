import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { PassedList } from "@/components/feed/passed-list";

export const metadata: Metadata = { title: "People you passed on", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Settings → "People you passed on" (PRD §5.2.5; design/prototype/not-for-me.html,
 * states E and F). Only the member's own passes, read through my_passes(): a
 * first name, a small main photo where the rules allow it, and when. Nobody
 * else can see this list, and the people on it are never told.
 */
export default async function PassedPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.rpc("my_passes");
  const list = (data ?? []) as { candidate_id: string; display_name: string; passed_at: string; photo_path?: string | null }[];

  // The photo, where the database returned a path (it does so only where this
  // member may see that person's photos — the same rule as the six). The file
  // is then signed under storage's own policy, which asks the same question.
  const paths = list.map((r) => r.photo_path).filter((p): p is string => !!p);
  const { data: signed } = paths.length ? await supabase.storage.from("profile-photos").createSignedUrls(paths, 60 * 30) : { data: [] };
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });
  const rows = list.map((r) => ({
    candidate_id: r.candidate_id,
    display_name: r.display_name,
    passed_on: fmt.format(new Date(r.passed_at)),
    photo_url: signed?.find((x) => x.path === r.photo_path)?.signedUrl ?? null,
  }));

  return (
    <>
      <ScreenBand title="People you passed on" sub="Settings" back="/profile/settings" />
      <div className="mx-auto grid w-full max-w-[680px] content-start gap-3 px-3.5 pb-24 pt-4">
        <PassedList rows={rows} />
      </div>
    </>
  );
}
