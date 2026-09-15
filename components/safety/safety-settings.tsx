"use client";

import { useFormState, useFormStatus } from "react-dom";
import { setImageBlur, setPhotoReveal } from "@/lib/safety-actions";
import { PHOTO_REVEAL_OPTIONS, type PhotoReveal } from "@/lib/safety";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
      {pending ? "Saving…" : label}
    </Button>
  );
}

/**
 * Photo reveal and image blur settings.
 *
 * NOT IN THE PROTOTYPE — flagged. Radio rows rather than a select, because
 * each option needs its consequence spelled out, and a 44px-tall row is a far
 * easier target on a small Android screen than a native dropdown.
 */
export function SafetySettings({
  photoReveal,
  blurImages,
}: {
  photoReveal: PhotoReveal;
  blurImages: boolean;
}) {
  const [revealState, revealAction] = useFormState(setPhotoReveal, null);
  const [blurState, blurAction] = useFormState(setImageBlur, null);

  return (
    <>
      <Card className="grid gap-5 p-[26px]">
        <div className="grid gap-1.5">
          <h2 className="text-h5 text-ink-900">Who sees your photos</h2>
          <p className="text-ui text-grey-600">
            Your prompt answers are always what people read first. This decides
            when your photos join them.
          </p>
        </div>

        <form action={revealAction} className="grid gap-4">
          <fieldset className="grid gap-2.5">
            <legend className="sr-only">Photo visibility</legend>
            {PHOTO_REVEAL_OPTIONS.map((o) => (
              <label
                key={o.value}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-ink-900/[.12] bg-white p-4 has-[:checked]:border-green-500 has-[:checked]:bg-green-50"
              >
                <input
                  type="radio"
                  name="photo_reveal"
                  value={o.value}
                  defaultChecked={o.value === photoReveal}
                  className="mt-1 h-4 w-4 flex-shrink-0 accent-green-500"
                />
                <span className="grid gap-0.5">
                  <span className="text-ui font-semibold text-ink-900">{o.label}</span>
                  <span className="text-nav text-grey-600">{o.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {revealState?.error ? <Notice tone="error">{revealState.error}</Notice> : null}
          {revealState?.ok ? <Notice tone="success">{revealState.ok}</Notice> : null}
          <Save label="Save photo setting" />
        </form>
      </Card>

      <Card className="grid gap-5 p-[26px]">
        <div className="grid gap-1.5">
          <h2 className="text-h5 text-ink-900">Images people send you</h2>
          <p className="text-ui text-grey-600">
            Hidden until you tap, and not even downloaded before then. We never
            look at what&rsquo;s in them.
          </p>
        </div>

        <form action={blurAction} className="grid gap-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-ui text-ink-900">
            <input
              type="checkbox"
              name="blur"
              defaultChecked={blurImages}
              className="h-4 w-4 flex-shrink-0 accent-green-500"
            />
            Hide images until I choose to see them
          </label>
          {blurState?.error ? <Notice tone="error">{blurState.error}</Notice> : null}
          {blurState?.ok ? <Notice tone="success">{blurState.ok}</Notice> : null}
          <Save label="Save image setting" />
        </form>
      </Card>
    </>
  );
}
