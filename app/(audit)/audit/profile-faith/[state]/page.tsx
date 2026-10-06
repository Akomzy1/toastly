import { notFound } from "next/navigation";
import { requireAuditHarness } from "@/lib/audit-harness";
import { ProfileForm } from "@/app/(app)/profile/profile-form";
import type { Profile, ProfileHistory } from "@/lib/types/profile";

export const dynamic = "force-dynamic";

/**
 * Mobile-audit harness: the profile form's religion and denomination fields
 * (PRD §5.2.3), with mock data — Christian with a denomination, Muslim with
 * an "Other" denomination, religion "Other", a religion stored before the
 * option list, and hidden.
 */
const BASE: Profile = {
  id: "00000000-0000-0000-0000-0000000000f1",
  created_at: "2026-10-01T09:00:00Z",
  updated_at: "2026-10-06T09:00:00Z",
  display_name: "Adaeze",
  city: "Lagos",
  country_code: "NG",
  bio: null,
  gender: null,
  intent: null,
  pool: "back_home",
  diaspora_city: null,
  time_zone: "Africa/Lagos",
  religion: null,
  religion_other: null,
  denomination: null,
  denomination_other: null,
  tribe: null,
  languages: [],
  profession: null,
  education: null,
  religion_visibility: "public",
  tribe_visibility: "public",
  languages_visibility: "public",
  profession_visibility: "public",
  education_visibility: "public",
  stage: "verified_real",
  phone_verified_at: "2026-10-01T09:00:00Z",
  liveness_verified_at: "2026-10-01T09:10:00Z",
  id_confirmed_at: null,
  profession_verified_at: null,
  paused: false,
};

const STATES: Record<string, Partial<Profile>> = {
  empty: {},
  christian: { religion: "Christian", denomination: "pentecostal" },
  "muslim-other": { religion: "Muslim", denomination: "other", denomination_other: "Tijaniyya" },
  "religion-other": { religion: "Other", religion_other: "Eckankar" },
  legacy: { religion: "Christianity (RCCG)" },
  hidden: { religion: "Christian", denomination: "white_garment", religion_visibility: "private" },
};

const HISTORY: ProfileHistory = { history: null, has_children: null, visibility: "on_match" };

export default function AuditProfileFaith({ params }: { params: { state: string } }) {
  requireAuditHarness();
  const s = STATES[params.state];
  if (!s) notFound();
  return (
    <div className="mx-auto grid max-w-[720px] gap-6 px-5 py-6">
      <ProfileForm profile={{ ...BASE, ...s }} history={HISTORY} cities={[]} faithConsented />
    </div>
  );
}
