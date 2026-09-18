"use client";

import { useFormState, useFormStatus } from "react-dom";
import { setPhotoReveal } from "@/lib/safety-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import type { PhotoReveal } from "@/lib/safety";

/**
 * The photo choice, offered during onboarding — decision (c).
 *
 * NOT IN THE PROTOTYPE — flagged.
 *
 * Photos are visible by default: 'verified_members' is the stored default and
 * this screen doesn't change it unless the member asks. The toggle maps to
 * 'after_i_reply', which means the member engaged — not the viewer, since
 * letting a viewer unlock photos by messaging would let anyone unlock anyone.
 *
 * Offered to everyone, not only women. The full three-way control, including
 * the strictest "only after a Gist" setting, stays in the safety kit.
 */
function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
      {pending ? "Saving…" : "Save photo setting"}
    </Button>
  );
}

export function PhotosStep({ current }: { current: PhotoReveal }) {
  const [state, action] = useFormState(setPhotoReveal, null);
  const matchesOnly = current === "after_i_reply" || current === "after_gist";

  return (
    <Card className="grid gap-5 p-[26px]">
      <div className="grid gap-1.5">
        <h2 className="text-h5 text-ink-900">Who sees your photos</h2>
        <p className="text-ui text-grey-600">
          Your answers are what people read first either way. This just decides
          when your photos join them — and you can change it any time.
        </p>
      </div>

      <form action={action} className="grid gap-4">
        <fieldset className="grid gap-2.5">
          <legend className="sr-only">Photo visibility</legend>

          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-ink-900/[.12] bg-white p-4 has-[:checked]:border-green-500 has-[:checked]:bg-green-50">
            <input
              type="radio"
              name="photo_reveal"
              value="verified_members"
              defaultChecked={!matchesOnly}
              className="mt-1 h-4 w-4 flex-shrink-0 accent-green-500"
            />
            <span className="grid gap-0.5">
              <span className="text-ui font-semibold text-ink-900">
                Any verified member
              </span>
              <span className="text-nav text-grey-600">
                The default. Only verified people can see anyone&rsquo;s photos.
              </span>
            </span>
          </label>

          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-ink-900/[.12] bg-white p-4 has-[:checked]:border-green-500 has-[:checked]:bg-green-50">
            <input
              type="radio"
              name="photo_reveal"
              value="after_i_reply"
              defaultChecked={matchesOnly}
              className="mt-1 h-4 w-4 flex-shrink-0 accent-green-500"
            />
            <span className="grid gap-0.5">
              <span className="text-ui font-semibold text-ink-900">
                Only my matches
              </span>
              <span className="text-nav text-grey-600">
                People you&rsquo;ve replied to or agreed to Gist with. Nobody
                unlocks your photos by messaging you.
              </span>
            </span>
          </label>
        </fieldset>

        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
        {state?.ok ? <Notice tone="success">{state.ok}</Notice> : null}
        <Save />
      </form>
    </Card>
  );
}
