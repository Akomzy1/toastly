"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { replyToAnswer } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/field";
import type { FeedCandidate } from "@/lib/feed";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="justify-self-start">
      {pending ? "Sending…" : label}
    </Button>
  );
}

/**
 * A match card.
 *
 * NOT IN THE PROTOTYPE — flagged. Home's prompt cards show the intended
 * shape (avatar, name, one prompt and its answer) but there is no in-app
 * feed card in the approved design.
 *
 * Three rules are structural here, not decorative:
 *   - answers sit ABOVE any photography, because members read intentions
 *     rather than score faces;
 *   - a reply must be attached to one specific answer — selecting an answer
 *     is what opens the composer, and there is no way to send without one;
 *   - there is no swipe gesture, no like button, no super-like, and no
 *     heart or flame anywhere.
 */
export function MatchCard({
  candidate,
  canSendText,
}: {
  candidate: FeedCandidate;
  canSendText: boolean;
}) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [state, action] = useFormState(replyToAnswer, null);

  const chosen = candidate.answers.find((a) => a.id === selected);

  return (
    <Card className="grid content-start gap-5 p-[26px]">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-h5 text-ink-900">{candidate.display_name}</h2>
        <Badge variant="verified">Verified Real</Badge>
        {candidate.stage === "id_confirmed" ? (
          <Badge variant="nin">NIN confirmed</Badge>
        ) : null}
        {candidate.city ? (
          <span className="text-nav text-grey-600">{candidate.city}</span>
        ) : null}
      </div>

      {/* Answers first. This ordering is the product. */}
      <ul className="grid list-none gap-3 p-0">
        {candidate.answers.map((a) => {
          const active = a.id === selected;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setSelected(active ? null : a.id)}
                aria-pressed={active}
                className={`grid w-full gap-1.5 rounded-lg border p-4 text-left transition-colors duration-200 ${
                  active
                    ? "border-green-500 bg-green-50"
                    : "border-ink-900/[.12] bg-white hover:border-green-500/50"
                }`}
              >
                <span className="text-caption font-semibold uppercase text-green-500">
                  {a.prompt}
                </span>
                <span className="text-ui text-ink-900">{a.answer}</span>
                <span className="text-caption tracking-normal text-grey-400">
                  {active ? "Replying to this" : "Reply to this answer"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {candidate.tags.length ? (
        <div className="flex flex-wrap gap-2">
          {candidate.tags.map((t) => (
            <Badge key={t} variant="optional">
              {t}
            </Badge>
          ))}
        </div>
      ) : null}

      {chosen ? (
        <form action={action} className="grid gap-4 border-t border-ink-900/[.12] pt-5">
          <input type="hidden" name="recipient_id" value={candidate.id} />
          <input type="hidden" name="prompt_answer_id" value={chosen.id} />

          <p className="text-caption uppercase text-grey-600">
            Replying to &ldquo;{chosen.prompt}&rdquo;
          </p>

          {canSendText ? (
            <Textarea
              name="body"
              rows={3}
              required
              maxLength={1000}
              placeholder="Say something about what they wrote…"
            />
          ) : (
            /* Starter: framed as what it is — a paid feature and a real
               alternative — never as an error or a blank state. */
            <Notice tone="locked" title="Free plan: invite them to a Gist">
              Sending text is part of Premium. On Starter your opening move is
              a Gist invite — a scheduled voice session, which is the
              conversation anyway.
            </Notice>
          )}

          {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
          {state?.ok ? <Notice tone="success">{state.ok}</Notice> : null}

          <Submit label={canSendText ? "Send reply" : "Invite to a Gist"} />
        </form>
      ) : null}
    </Card>
  );
}
