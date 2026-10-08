import { createClient } from "@/lib/supabase/server";
import { getGenderOptions } from "@/lib/gender-options";
import { SignUpForm } from "./signup-form";

export const dynamic = "force-dynamic";

/**
 * Sign-up. Open to everyone; payments stay behind the launch switch
 * (lib/launch.ts). Gender and who you'd like to meet come from config (0036).
 */
export default async function SignUpPage() {
  const options = await getGenderOptions(createClient());
  return <SignUpForm options={options} />;
}
