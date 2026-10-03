import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuditHarness } from "@/lib/audit-harness";
import { AppHeader, AppTabBar } from "@/components/app/nav";
import { ScreenBand } from "@/components/app/screen-band";
import { ProfileHub } from "@/components/profile/profile-hub";
import { GistListView, type GistGroup } from "@/components/gist/gists-list-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit · Navigation", robots: { index: false, follow: false } };

/** Mobile-audit harness: nav-*.slim.html states with fixed counts. */
const GROUPS: GistGroup[] = [
  { title: "Invites for you", rows: [{ id: "1", name: "Kelechi Obi", status: "Invited you · 2 hours ago", whose: "Your answer", prompt: "The way to win me over is…", answer: "Remember the small thing I mentioned weeks ago.", teal: false, invite: true }], empty: "No invites right now." },
  { title: "Waiting on them", rows: [], empty: "Nothing waiting on a reply." },
  { title: "Coming up", rows: [], empty: "Nothing booked yet." },
];

function Shell({ children, active, inbox, invite }: { children: React.ReactNode; active: "today" | "gists" | "inbox" | "profile"; inbox: number; invite: boolean }) {
  return (
    <div className="min-h-screen bg-paper">
      <AppHeader counts={{ inbox, invite }} active={active} />
      <main className="pb-[calc(58px+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
      <AppTabBar counts={{ inbox, invite }} active={active} />
    </div>
  );
}

const SIX = ["Amaka Eze · Lagos", "Kelechi Obi · Abuja", "Zainab Bello · Kaduna", "Tobi Adeyemi · Ibadan", "Ifeoma Nwosu · Enugu", "Ifeanyi Okoro · Port Harcourt"];

const STATES: Record<string, () => React.ReactElement> = {
  today: () => (
    <Shell active="today" inbox={2} invite={false}>
      <ScreenBand title="Today's six" sub="Refreshes daily" />
      <ul className="mx-auto grid max-w-[640px] list-none gap-3 px-3.5 pb-6 pt-4">
        {SIX.map((p) => (
          <li key={p} className="rounded-[14px] border border-ink-900/10 bg-white p-3 text-ui font-semibold text-ink-900">
            {p}
          </li>
        ))}
      </ul>
    </Shell>
  ),
  "today-no-badge": () => (
    <Shell active="today" inbox={0} invite={false}>
      <ScreenBand title="Today's six" sub="Refreshes daily" />
    </Shell>
  ),
  gists: () => (
    <Shell active="gists" inbox={2} invite>
      <GistListView groups={GROUPS} />
    </Shell>
  ),
  profile: () => (
    <Shell active="profile" inbox={0} invite={false}>
      <ScreenBand title="Profile" sub="You, as others see you" />
      <ProfileHub
        name="Adaeze Okafor, 29"
        meta="Yaba, Lagos · Starter"
        verified
        prompts={[
          { id: 1, prompt: "The way to win me over is…", answer: "Remember the small thing I mentioned weeks ago. Bonus points if there's suya involved." },
          { id: 2, prompt: "I'm weirdly good at…", answer: "Haggling at Balogun market. My mum taught me and I've never lost." },
        ]}
      />
    </Shell>
  ),
};

export default function AuditNav({ params }: { params: { state: string } }) {
  requireAuditHarness();
  const render = STATES[params.state];
  if (!render) notFound();
  return render();
}
