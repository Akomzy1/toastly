import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/ai/client";
import { AnswerEditor } from "@/components/profile/answer-editor";

export const metadata: Metadata = {
  title: "Edit answer",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function EditPromptAnswer({ params }: { params: { id: string } }) {
  const promptId = Number(params.id);
  if (!Number.isInteger(promptId) || promptId < 1) notFound();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: prompt }, { data: answer }] = await Promise.all([
    supabase.from("prompts").select("id, text").eq("id", promptId).eq("active", true).maybeSingle(),
    supabase
      .from("prompt_answers")
      .select("answer")
      .eq("profile_id", user.id)
      .eq("prompt_id", promptId)
      .maybeSingle(),
  ]);
  if (!prompt) notFound();

  return (
    <AnswerEditor
      promptId={prompt.id}
      promptText={prompt.text}
      initial={answer?.answer ?? ""}
      aiAvailable={aiConfigured()}
    />
  );
}
