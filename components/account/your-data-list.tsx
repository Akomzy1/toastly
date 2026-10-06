import { AppColumn, LinkList } from "@/components/app/app-band";
import { DownloadCard } from "@/components/account/download-card";

const REVEAL_LABEL: Record<string, string> = {
  verified_members: "Everyone who sees your profile",
  after_i_reply: "Only people you match with",
  after_gist: "Only after a Gist you both want to continue",
};

const HEADING = "mx-0.5 m-0 text-chip font-semibold uppercase tracking-[0.12em] text-green-500";

/**
 * Your data — design/prototype/your-data.slim.html: download, privacy
 * choices, delete, in one plain list. Delete sits at the same weight as
 * everything else. Ported from live-profile-and-prompt-14; replaces main's
 * invented Your data card.
 *
 * Deviation, flagged: the prototype's "Genotype visibility" row shows the
 * member's setting ("Only me"). This page is outside the genotype display
 * path, which nothing else may read (CLAUDE.md), so the row says where to set
 * it instead.
 */
export function YourDataList({ photoReveal, inNigeria, openToAbroad }: { photoReveal: string; inNigeria: boolean; openToAbroad: boolean }) {
  const privacy = [
    { href: "/safety-kit", label: "Photo visibility", sub: REVEAL_LABEL[photoReveal] ?? REVEAL_LABEL.verified_members },
    { href: "/profile/edit", label: "Genotype visibility", sub: "Set in Edit profile, if you add it" },
    // Members in Nigeria only, as in the prototype.
    ...(inNigeria
      ? [{ href: "/profile/preferences", label: "Open to people living abroad", sub: `${openToAbroad ? "On" : "Off"} · for members in Nigeria` }]
      : []),
  ];
  return (
    <AppColumn gap="gap-[26px]">
      <section aria-labelledby="yd-download" className="grid gap-2.5">
        <h2 id="yd-download" className={HEADING}>
          Download your data
        </h2>
        <DownloadCard />
      </section>
      <section aria-labelledby="yd-privacy" className="grid gap-2.5">
        <h2 id="yd-privacy" className={HEADING}>
          Your privacy choices
        </h2>
        <LinkList items={privacy} />
      </section>
      <section aria-labelledby="yd-delete" className="grid gap-2.5">
        <h2 id="yd-delete" className={HEADING}>
          Delete your account
        </h2>
        <LinkList items={[{ href: "/profile/data/delete", label: "Delete your account", sub: "See what's deleted and what's kept first" }]} />
      </section>
    </AppColumn>
  );
}
