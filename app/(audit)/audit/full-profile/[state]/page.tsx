import { notFound } from "next/navigation";
import { requireAuditHarness } from "@/lib/audit-harness";
import { FullProfile } from "@/components/profile/full-profile";
import { backFor, type FullProfileView } from "@/lib/full-profile-view";

export const dynamic = "force-dynamic";

/**
 * Mobile-audit harness: another member's full profile
 * (full-profile-view.slim.html; PRD §5.2.4), with mock data — the prototype's
 * five states (A–E), the ID ring, a profile whose photos aren't revealed to
 * this viewer, and the menu, report and block panels.
 */
const ID = "00000000-0000-4000-8000-000000000001";
const PHOTOS = ["/img/safety/member-amaka.webp", "/img/home/member-ifeoma.webp", "/img/safety/member-zainab.webp", "/img/home/couple-chiamaka-emeka-2.webp", "/img/stories/couple-chiamaka-emeka-2.webp"]
  .map((url, i) => ({ id: `p${i}`, url }));
const ANSWERS = [
  { id: "a1", prompt: "A Sunday that feels like me…", answer: "Jollof at my aunty's in Surulere, a long call with my brother in Leeds, then choir practice I pretend not to enjoy." },
  { id: "a2", prompt: "The way to win me over is…", answer: "Remember the small thing I mentioned weeks ago. Bonus points if there's suya involved." },
  { id: "a3", prompt: "I'm weirdly good at…", answer: "Haggling at Balogun market. My mum taught me and I've never lost." },
];
const ROWS = {
  languages: { label: "Languages", value: "Igbo · English" },
  tribe: { label: "Tribe", value: "Igbo" },
  faith: { label: "Faith", value: "Christian · Pentecostal" },
  profession: { label: "Profession", value: "Product manager", verified: true },
  education: { label: "Education", value: "BSc, University of Lagos" },
  history: { label: "Relationship history", value: "Single" },
  // 0044: Children shows after a match by default; Wants children by default.
  children: { label: "Children", value: "1 child" },
  wants: { label: "Wants children", value: "Open to it" },
  genotype: { label: "Genotype", value: "AS" },
};

const BASE: FullProfileView = {
  id: ID,
  name: "Amaka",
  first: "Amaka",
  age: 29,
  city: "Victoria Island, Lagos",
  origin: "six",
  photos: PHOTOS,
  idChecked: false,
  intent: "Looking for a relationship",
  answers: ANSWERS,
  action: "reply",
  gistsLeft: null,
  details: [ROWS.languages, ROWS.tribe, ROWS.faith, ROWS.profession, ROWS.education, ROWS.wants],
  invite: null,
};

const STATES: Record<string, { view: Partial<FullProfileView>; panel?: "menu" | "report" | "reported" | "block" | "blocked" }> = {
  six: { view: {} },
  matched: { view: { origin: "matched", details: [...BASE.details, ROWS.history, ROWS.children, ROWS.genotype] } },
  hidden: { view: { details: [ROWS.languages, ROWS.faith] } },
  starter: { view: { action: "gist", gistsLeft: 1 } },
  invite: { view: { origin: "invite", action: "none", gistsLeft: 1, invite: { sessionId: ID, starter: true } } },
  "id-checked": { view: { idChecked: true } },
  "no-photos": { view: { photos: [], details: [] } },
  menu: { view: {}, panel: "menu" },
  report: { view: {}, panel: "report" },
  reported: { view: {}, panel: "reported" },
  block: { view: {}, panel: "block" },
  blocked: { view: {}, panel: "blocked" },
};

export default function AuditFullProfile({ params }: { params: { state: string } }) {
  requireAuditHarness();
  const s = STATES[params.state];
  if (!s) notFound();
  const view = { ...BASE, ...s.view };
  return (
    <div className="min-h-screen bg-paper">
      <FullProfile view={view} back={backFor(view)} preview={{ panel: s.panel, reported: "These photos aren't them" }} />
    </div>
  );
}
