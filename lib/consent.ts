/**
 * Verification consent wording — Toastly-Verification-Consent-Wording.md.
 *
 * Copied verbatim, one place, so every screen shows the same words and the
 * version recorded is the version shown. Change any text here and bump its
 * `version`: members who agreed to an earlier version are asked again,
 * because consents are stored with the version agreed to (0029).
 *
 * The one line in [brackets] waits on Smile ID's answer about its retention
 * purpose. It stays VISIBLE, brackets and all, until then (decided
 * 2026-10-05) — the gap is shown, not hidden. scripts/check-constraints.mjs
 * fails the build if it goes missing while the wording is unconfirmed.
 */

export type ConsentKind = "verification_selfie" | "replace_main_photo" | "id_check" | "reverify_selfie";

export type ConsentText = {
  kind: ConsentKind;
  version: string;
  title: string;
  /** Paragraphs. A paragraph may hold **bold** runs, rendered as <strong>. */
  body: string[];
  checkbox: string;
  primary: string;
  secondary: string;
};

export const CONSENT: Record<ConsentKind, ConsentText> = {
  verification_selfie: {
    kind: "verification_selfie",
    version: "2026-10-05",
    title: "Before your selfie",
    body: [
      "You'll take a short selfie video. It does two things: it confirms you're a real person, here now — and it checks that your main photo is really you.",
      "The check is run by Smile ID, our verification provider. **Toastly keeps only the result** — that you passed, and when — never your images.",
      "Smile ID keeps the images from this check for up to five years, under its own terms. [Purpose of retention, and any way to request earlier deletion — to be confirmed with Smile ID.]",
    ],
    checkbox: "I agree to Smile ID checking my selfie and comparing it with my main photo, as described above.",
    primary: "Start",
    secondary: "Not now",
  },
  replace_main_photo: {
    kind: "replace_main_photo",
    version: "2026-10-05",
    title: "Check your new main photo",
    body: [
      "Take a quick selfie so we can confirm your new main photo is really you. **Your current photo stays on your profile until the new one is confirmed.**",
      "The check is run by Smile ID. Toastly keeps only the result. Smile ID keeps the images for up to five years, under its own terms.",
    ],
    checkbox: "I agree to Smile ID comparing a new selfie with my new main photo.",
    primary: "Start",
    secondary: "Keep my current photo",
  },
  // A re-check a reviewer asked for. NOT in the wording document: built from
  // main's hosted-selfie consent (lib/verification-copy.ts, now retired), plus
  // what Authentication actually compares — flagged in SKILL.md for approval.
  reverify_selfie: {
    kind: "reverify_selfie",
    version: "2026-10-06",
    title: "Before your selfie",
    body: [
      "You'll take a quick selfie so we know you're a real person, here now — and the same person who verified this account.",
      "It's checked by Smile ID, our verification provider. **Toastly keeps only the result** — that you passed, and when — never your images.",
      "Smile ID keeps the images from this check for up to five years, under its own terms.",
    ],
    checkbox: "I agree to Smile ID checking my selfie against the one I verified with.",
    primary: "Start",
    secondary: "Not now",
  },
  id_check: {
    kind: "id_check",
    version: "2026-10-05",
    title: "Check your ID",
    body: [
      "We'll ask Smile ID to check your number against the official record and match it to a new selfie.",
      "**Toastly keeps only whether it passed, and when** — plus a one-way fingerprint of your number, so the same ID can't be used on more than one account. We can't turn the fingerprint back into your number. We don't keep the number itself, or the name, photo, date of birth, phone number or address on the record.",
      "Smile ID keeps the images and the check record for up to five years, under its own terms.",
    ],
    checkbox: "I agree to Smile ID checking my ID against the official record.",
    primary: "Continue to selfie",
    secondary: "Not now",
  },
};

/** Split a paragraph into plain and **bold** runs. */
export function boldRuns(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((t) => (t.startsWith("**") ? { text: t.slice(2, -2), bold: true } : { text: t, bold: false }));
}
