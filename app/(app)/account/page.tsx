import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppBand, AppColumn, LinkList } from "@/components/app/app-band";
import { DownloadCard } from "./download-card";

export const metadata: Metadata = {
  title: "Your data",
  robots: { index: false, follow: false },
};

const REVEAL_LABEL: Record<string, string> = {
  verified_members: "Everyone who sees your profile",
  after_i_reply: "Only people you match with",
  after_gist: "Only after a Gist you both want to continue",
};

/**
 * Your data — built against design/prototype/your-data.slim.html: download,
 * privacy choices, delete.
 *
 * ALWAYS OPEN: no plan, no live-profile guard (PRD §5.1.2).
 *
 * Deviation: the prototype's privacy rows also list "Genotype visibility".
 * That setting doesn't exist yet, so its row waits for it rather than
 * linking nowhere.
 */
export default async function AccountPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase.from("profiles").select("photo_reveal, country_code, open_to_abroad").eq("id", user.id).single();

  return (
    <>
      <AppBand title="Your data" sub="Settings" backHref="/profile" />
      <AppColumn gap="gap-[26px]">
        <section aria-labelledby="yd-download" className="grid gap-2.5">
          <h2 id="yd-download" className="mx-0.5 text-chip font-semibold uppercase tracking-[0.12em] text-green-500">
            Download your data
          </h2>
          <DownloadCard />
        </section>

        <section aria-labelledby="yd-privacy" className="grid gap-2.5">
          <h2 id="yd-privacy" className="mx-0.5 text-chip font-semibold uppercase tracking-[0.12em] text-green-500">
            Your privacy choices
          </h2>
          <LinkList
            items={[
              {
                href: "/safety-kit",
                label: "Photo visibility",
                sub: REVEAL_LABEL[me?.photo_reveal ?? "verified_members"],
              },
              // Members in Nigeria only, as in the prototype.
              ...(me?.country_code === "NG"
                ? [
                    {
                      href: "/preferences",
                      label: "Open to people living abroad",
                      sub: `${me.open_to_abroad ? "On" : "Off"} · for members in Nigeria`,
                    },
                  ]
                : []),
            ]}
          />
        </section>

        <section aria-labelledby="yd-delete" className="grid gap-2.5">
          <h2 id="yd-delete" className="mx-0.5 text-chip font-semibold uppercase tracking-[0.12em] text-green-500">
            Delete your account
          </h2>
          <LinkList
            items={[{ href: "/account/delete", label: "Delete your account", sub: "See what's deleted and what's kept first" }]}
          />
        </section>
      </AppColumn>
    </>
  );
}
