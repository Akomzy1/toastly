import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAuditHarness } from "@/lib/audit-harness";
import { BrandLockup } from "@/components/brand-mark";
import { DEFAULT_GENDER_OPTIONS } from "@/lib/gender-options";
import { SignUpForm } from "@/app/(auth)/signup/signup-form";
import { AboutYouForm } from "@/app/(app)/profile/about-you/about-you-form";
import { ScreenBand } from "@/components/app/screen-band";

export const dynamic = "force-dynamic";

/** The auth shell, as app/(auth)/layout.tsx draws it. */
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <div className="bg-green-800 px-5 py-5 md:px-10">
        <Link href="/" className="inline-flex min-h-11 items-center no-underline">
          <BrandLockup tone="dark" size={24} />
        </Link>
      </div>
      <main className="mx-auto grid max-w-[460px] gap-6 px-5 py-section-y">{children}</main>
    </div>
  );
}

const options = DEFAULT_GENDER_OPTIONS;

/** Mobile-audit harness: sign-up and "About you" (0036). */
const STATES: Record<string, () => React.ReactNode> = {
  signup: () => (
    <AuthShell>
      <SignUpForm options={options} />
    </AuthShell>
  ),
  "about-you": () => (
    <div className="min-h-screen bg-paper">
      <ScreenBand title="About you" sub="Who you are, and who you'd like to meet" back="/profile/preferences" />
      <AboutYouForm options={options} gender={null} seeking={[]} genderLocked={false} />
    </div>
  ),
  "about-you-locked": () => (
    <div className="min-h-screen bg-paper">
      <ScreenBand title="About you" sub="Who you are, and who you'd like to meet" back="/profile/preferences" />
      <AboutYouForm options={options} gender="woman" seeking={["man"]} genderLocked />
    </div>
  ),
};

export default function AuditSignUp({ params }: { params: { state: string } }) {
  requireAuditHarness();
  const render = STATES[params.state];
  if (!render) notFound();
  return render();
}
