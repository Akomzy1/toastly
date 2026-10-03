import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/**
 * Your prompts — the way into the edit-answer screen.
 *
 * NOT IN THE PROTOTYPE — flagged. answer-mirror.slim.html designs the edit
 * screen itself, not the list that leads to it. Built from the profile
 * page's own cards and type; send it through the design pipeline.
 */
export async function PromptList() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: prompts }, { data: answers }] = await Promise.all([
    supabase.from("prompts").select("id, text").eq("active", true).order("sort_order"),
    supabase.from("prompt_answers").select("prompt_id, answer").eq("profile_id", user.id),
  ]);
  const answered = new Map((answers ?? []).map((a) => [a.prompt_id as number, a.answer as string]));

  return (
    <section aria-labelledby="prompts-heading" className="grid gap-3 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-4">
      <div className="grid gap-1">
        <h2 id="prompts-heading" className="m-0 font-serif text-[21px] font-bold leading-[1.25] text-ink-900">
          Your prompts
        </h2>
        <p className="m-0 text-nav leading-[1.55] text-grey-600">
          {answered.size} answered. Answer as many as you like — they&rsquo;re what people read first.
        </p>
      </div>
      <ul className="m-0 grid list-none gap-0 p-0">
        {(prompts ?? []).map((p) => {
          const answer = answered.get(p.id as number);
          return (
            <li key={p.id} className="border-t border-ink-900/[.08] first:border-t-0">
              <Link
                href={`/profile/prompts/${p.id}`}
                className="flex min-h-12 items-center justify-between gap-3 py-2.5 text-ink-900 no-underline"
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-ui font-semibold leading-snug">{p.text}</span>
                  {answer ? (
                    <span className="truncate text-nav text-grey-600">{answer}</span>
                  ) : null}
                </span>
                <span className="flex-shrink-0 text-nav font-semibold text-green-500">
                  {answer ? "Edit" : "Answer"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
