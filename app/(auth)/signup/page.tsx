import { createClient } from "@/lib/supabase/server";
import { getGenderOptions } from "@/lib/gender-options";
import { paymentsLaunched } from "@/lib/launch";
import { SignUpForm } from "./signup-form";
import { WaitlistForm } from "./waitlist-form";

export const dynamic = "force-dynamic";

/**
 * Sign-up. While the launch switch is off (lib/launch.ts), the public sees
 * the waitlist instead (decided 8 October 2026); allow-listed test accounts
 * reach the form at /signup?tester=1, and the action checks the email
 * against the allow-list on the server.
 */
export default async function SignUpPage({ searchParams }: { searchParams: { tester?: string } }) {
  const options = await getGenderOptions(createClient());
  if (!paymentsLaunched() && searchParams.tester !== "1") return <WaitlistForm options={options} />;
  return <SignUpForm options={options} tester={!paymentsLaunched()} />;
}
