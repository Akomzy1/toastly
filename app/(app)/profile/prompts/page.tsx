import type { Metadata } from "next";
import { ScreenBand } from "@/components/app/screen-band";
import { PromptList } from "@/components/profile/prompt-list";

export const metadata: Metadata = { title: "Your prompts", robots: { index: false, follow: false } };

/** Every prompt, answered or not — reached from Profile's "Answer another prompt". */
export default function PromptsPage() {
  return (
    <>
      <ScreenBand title="Your prompts" sub="What people read first" back="/profile" />
      <div className="mx-auto grid max-w-[720px] gap-6 px-5 pb-section-y pt-5 lg:pt-4">
        <PromptList />
      </div>
    </>
  );
}
