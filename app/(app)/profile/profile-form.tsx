"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveProfile } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { CityPicker, type PickerCity } from "@/components/app/city-picker";
import { TimeZoneField } from "@/components/app/time-zone-field";
import { COUNTRY_NAME } from "@/lib/countries";
import { HeightField } from "@/components/profile/height-field";
import { StarSignField } from "@/components/profile/star-sign-field";
import { OpenToChildrenPanel } from "@/components/profile/open-to-children-panel";
import { VisibilityRow } from "@/components/profile/visibility-row";
import {
  CHILDREN_OPTIONS,
  HISTORY_LABELS,
  INTENT_LABELS,
  WANTS_CHILDREN_LABELS,
  VISIBILITY_LABELS,
  type Profile,
  type ProfileHistory,
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
export function ProfileForm({
  profile,
  history,
  cities,
  starSign,
}: {
  profile: Profile;
  history: ProfileHistory;
  cities: PickerCity[];
  /** The member's own sign, from their date of birth (my_star_sign), for the preview. */
  starSign: string | null;
}) {
  const [state, action] = useFormState(saveProfile, null);
  const [children, setChildren] = React.useState<string>(history.children ?? "");
  const [historyVal, setHistoryVal] = React.useState<string>(history.history ?? "");
  const [wants, setWants] = React.useState<string>(history.wants_children ?? "");
  const country = profile.country_code || "NG";

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

        {/* Where you live is set at sign-up and changed in Settings, at most
            once every 30 days (where-you-live prototypes, 0027) — not here.
            Only members abroad choose a diaspora city; it is what the
            per-city opening keys off, so the picker offers the cities of the
            country they live in. Nigeria-based members never see it. */}
        {/* Both built against their own prototypes — city-picker.slim.html
            and time-zone.slim.html. */}
        {country !== "NG" ? (
          <div className="grid gap-2">
            <CityPicker
              cities={cities.filter((c) => c.country === (COUNTRY_NAME[country] ?? country))}
              defaultValue={profile.diaspora_city}
            />
            <span className="text-caption text-grey-600">
              Matching within a diaspora city opens one city at a time, as
              each has enough verified members to be worth opening. Until
              yours does, back-home matches carry on as normal.
            </span>
          </div>
        ) : null}

        <TimeZoneField defaultValue={profile.time_zone} />
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

        {/* Height and star sign (PRD §5.2; design/prototype/profile-fields.html):
            one grouped block of rows. Both are display-only — on the full
            profile, never on the card, never a filter, never a score term. */}
        <div className="overflow-hidden rounded-2xl border border-ink-900/[.12] bg-white">
          <HeightField defaultCm={profile.height_cm} />
          <StarSignField defaultOn={profile.show_star_sign} sign={starSign} />
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
              value={historyVal}
              onChange={(e) => setHistoryVal(e.target.value)}
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

          {/* 0044: a count only — never names, ages or details. Never
              filterable, never used in matching. */}
          <Label htmlFor="children">
            <span className="flex items-center gap-2">
              Children <Badge variant="optional">Optional</Badge>
            </span>
            <Select
              id="children"
              name="children"
              value={children}
              onChange={(e) => setChildren(e.target.value)}
            >
              <option value="">Not answered</option>
              {CHILDREN_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Label>
        </div>

        {/* The two-way children rule, said out loud where the answer is given
            (PRD §5.2). Only when a number of 1 or more is chosen. */}
        {["one", "two", "three_plus"].includes(children) ? (
          <Notice tone="info">
            If you add this, people who aren&rsquo;t open to dating someone with children won&rsquo;t be shown to you, and
            you won&rsquo;t be shown to them. You choose who sees your answer.
          </Notice>
        ) : null}

        {/* Children and relationship history share ONE choice (PRD §5.2;
            design/prototype/profile-fields.html), default "Revealed when we
            match". Enforced in the database (profile_for): "Only me" shows it to
            nobody, though the two-way rule above still uses a Children answer.
            Disabled until there is something to show — a Children answer other
            than "Prefer not to say", or a relationship history — so the choice
            for history is never out of reach. */}
        <div className="overflow-hidden rounded-2xl border border-ink-900/[.12] bg-white">
          <VisibilityRow
            name="history_visibility"
            defaultValue={history.visibility}
            disabled={!((children !== "" && children !== "prefer_not_to_say") || historyVal !== "")}
            ariaLabel="Who can see your children and relationship history answers"
            note="Also applies to relationship history."
          />
        </div>

        <div className="grid gap-3 border-t border-ink-900/10 pt-5">
          <Label htmlFor="wants_children">
            <span className="flex items-center gap-2">
              Do you want children? <Badge variant="optional">Optional</Badge>
            </span>
            <Select
              id="wants_children"
              name="wants_children"
              value={wants}
              onChange={(e) => setWants(e.target.value)}
            >
              <option value="">Not answered</option>
              {(["yes", "no", "open", "not_sure"] as const).map((w) => (
                <option key={w} value={w}>
                  {WANTS_CHILDREN_LABELS[w]}
                </option>
              ))}
            </Select>
          </Label>
          {/* Its own choice, default "On my profile" (PRD §5.2). Never on your
              match card. Paid plans can filter their own search by it, only
              when it's shown to everyone. */}
          <div className="overflow-hidden rounded-2xl border border-ink-900/[.12] bg-white">
            <VisibilityRow
              name="wants_children_visibility"
              defaultValue={history.wants_children_visibility}
              disabled={wants === ""}
              ariaLabel="Who can see your answer to do you want children"
            />
          </div>
        </div>
      </Card>

      {/* PRIVATE (PRD §5.2): the panel from design/prototype/profile-fields.html.
          Neither answer is selected until the member chooses; no answer = Yes. */}
      <OpenToChildrenPanel value={profile.open_to_children} />

      <Submit />
    </form>
  );
}
