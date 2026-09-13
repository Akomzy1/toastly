"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveProfile } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import {
  HISTORY_LABELS,
  INTENT_LABELS,
  POOL_LABELS,
  VISIBILITY_LABELS,
  type Profile,
} from "@/lib/types/profile";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save profile"}
    </Button>
  );
}

/** A visibility selector, attached to one optional field. */
function Visibility({
  name,
  value,
  options = ["public", "on_match", "private"] as const,
}: {
  name: string;
  value: string;
  options?: readonly ("public" | "on_match" | "private")[];
}) {
  return (
    <Label htmlFor={name} className="text-caption tracking-normal">
      Who can see this
      <Select id={name} name={name} defaultValue={value}>
        {options.map((o) => (
          <option key={o} value={o}>
            {VISIBILITY_LABELS[o]}
          </option>
        ))}
      </Select>
    </Label>
  );
}

/**
 * Profile form.
 *
 * NOT IN THE PROTOTYPE — flagged. No profile-editing screen exists in the
 * approved design; the field styling is the design system's, the layout is
 * not approved.
 *
 * Three rules are visible in the markup rather than buried:
 *   - every optional field is labelled Optional and carries its own
 *     visibility control, because they are display-only and never filters;
 *   - relationship history defaults to revealed-on-match, not public;
 *   - intent is collected but never required.
 */
export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useFormState(saveProfile, null);

  return (
    <form action={action} className="grid gap-6">
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="success">{state.ok}</Notice> : null}

      <Card className="grid gap-5 p-[26px]">
        <h2 className="text-h5 text-ink-900">About you</h2>

        <Label htmlFor="display_name">
          Name
          <Input
            id="display_name"
            name="display_name"
            defaultValue={profile.display_name}
            required
          />
        </Label>

        <Label htmlFor="city">
          City
          <Input
            id="city"
            name="city"
            defaultValue={profile.city ?? ""}
            placeholder="Lagos"
          />
        </Label>

        <Label htmlFor="bio">
          A little about you
          <Textarea
            id="bio"
            name="bio"
            rows={4}
            defaultValue={profile.bio ?? ""}
            maxLength={600}
          />
        </Label>

        <Label htmlFor="pool">
          Match me with
          <Select id="pool" name="pool" defaultValue={profile.pool}>
            {(["back_home", "diaspora", "both"] as const).map((p) => (
              <option key={p} value={p}>
                {POOL_LABELS[p]}
              </option>
            ))}
          </Select>
        </Label>
      </Card>

      <Card className="grid gap-5 p-[26px]">
        <div className="grid gap-1.5">
          <h2 className="text-h5 text-ink-900">What you&rsquo;re looking for</h2>
          <p className="text-ui text-grey-600">
            A spectrum, not a commitment. You can change it any time, and
            leaving it blank doesn&rsquo;t hold anything up.
          </p>
        </div>
        <Label htmlFor="intent">
          Intent
          <Select id="intent" name="intent" defaultValue={profile.intent ?? ""}>
            <option value="">Rather not say for now</option>
            {(
              ["casual", "open_to_serious", "serious", "marriage_minded"] as const
            ).map((i) => (
              <option key={i} value={i}>
                {INTENT_LABELS[i]}
              </option>
            ))}
          </Select>
        </Label>
      </Card>

      <Card className="grid gap-6 p-[26px]">
        <div className="grid gap-1.5">
          <h2 className="text-h5 text-ink-900">Yours to share</h2>
          <p className="text-ui text-grey-600">
            All optional, all display-only. None of these decide who sees you or
            who you see — leaving any of them blank costs you nothing.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="religion">
              <span className="flex items-center gap-2">
                Religion <Badge variant="optional">Optional</Badge>
              </span>
              <Input
                id="religion"
                name="religion"
                defaultValue={profile.religion ?? ""}
              />
            </Label>
            <Visibility
              name="religion_visibility"
              value={profile.religion_visibility}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tribe">
              <span className="flex items-center gap-2">
                Tribe <Badge variant="optional">Optional</Badge>
              </span>
              <Input id="tribe" name="tribe" defaultValue={profile.tribe ?? ""} />
            </Label>
            <Visibility name="tribe_visibility" value={profile.tribe_visibility} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="languages">
              <span className="flex items-center gap-2">
                Languages <Badge variant="optional">Optional</Badge>
              </span>
              <Input
                id="languages"
                name="languages"
                defaultValue={profile.languages.join(", ")}
                placeholder="Yoruba, English"
              />
            </Label>
            <Visibility
              name="languages_visibility"
              value={profile.languages_visibility}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="profession">
              <span className="flex items-center gap-2">
                Profession <Badge variant="optional">Optional</Badge>
              </span>
              <Input
                id="profession"
                name="profession"
                defaultValue={profile.profession ?? ""}
              />
            </Label>
            <Visibility
              name="profession_visibility"
              value={profile.profession_visibility}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="education">
              <span className="flex items-center gap-2">
                Education <Badge variant="optional">Optional</Badge>
              </span>
              <Input
                id="education"
                name="education"
                defaultValue={profile.education ?? ""}
              />
            </Label>
            <Visibility
              name="education_visibility"
              value={profile.education_visibility}
            />
          </div>
        </div>

        {/* A verified profession badge is a quiet secondary mark. It unlocks
            nothing, is never a prestige marker, and nobody is hidden or
            down-ranked for leaving these blank. */}
        <Notice tone="info">
          You can verify your profession later. It sits quietly next to Verified
          Real as an extra trust signal — it doesn&rsquo;t unlock anything, and
          nobody is hidden for leaving it out.
        </Notice>
      </Card>

      <Card className="grid gap-5 p-[26px]">
        <div className="grid gap-1.5">
          <h2 className="text-h5 text-ink-900">Your history</h2>
          <p className="text-ui text-grey-600">
            Single, divorced, widowed, raising kids — all welcome here. This
            stays private until you match, unless you choose otherwise.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Label htmlFor="history">
            <span className="flex items-center gap-2">
              Relationship history <Badge variant="optional">Optional</Badge>
            </span>
            <Select
              id="history"
              name="history"
              defaultValue={profile.history ?? ""}
            >
              <option value="">Rather not say</option>
              {(["single", "divorced", "widowed", "single_parent"] as const).map(
                (h) => (
                  <option key={h} value={h}>
                    {HISTORY_LABELS[h]}
                  </option>
                ),
              )}
            </Select>
          </Label>

          <Label htmlFor="has_children">
            <span className="flex items-center gap-2">
              Children <Badge variant="optional">Optional</Badge>
            </span>
            <Select
              id="has_children"
              name="has_children"
              defaultValue={
                profile.has_children === null
                  ? ""
                  : profile.has_children
                    ? "yes"
                    : "no"
              }
            >
              <option value="">Rather not say</option>
              <option value="yes">I have children</option>
              <option value="no">No children</option>
            </Select>
          </Label>
        </div>

        {/* Defaults to on_match. "public" is offered, never preselected. */}
        <Visibility
          name="history_visibility"
          value={profile.history_visibility}
        />
      </Card>

      <Submit />
    </form>
  );
}
