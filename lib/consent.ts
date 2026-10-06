/**
 * Verification consent wording — Toastly-Verification-Consent-Wording.md.
 *
 * Copied verbatim, one place, so every screen shows the same words and the
 * version recorded is the version shown. Change any text here and bump its
 * `version`: members who agreed to an earlier version are asked again,
 * because consents are stored with the version agreed to (0029) and the
 * consent is shown, and recorded afresh, before every check.
 *
 * The one line in [brackets] waits on Smile ID's answer about its retention
 * purpose. It stays VISIBLE, brackets and all, until then (decided
 * 2026-10-05) — the gap is shown, not hidden. scripts/check-constraints.mjs
 * fails the build if it goes missing while the wording is unconfirmed.
 *
 * RETENTION SENTENCES — every "Smile ID keeps the images…" line below is
 * marked SMILE-RETENTION. Decided 6 October 2026: if Smile ID confirms it
 * uses images to improve its technology and we can't opt out, append
 * "Smile ID may also use them to improve its own technology." to each, and
 * bump the versions. The owner confirms first.
 */

export type ConsentKind = "verification_selfie" | "replace_main_photo" | "id_check" | "reverify_selfie" | "faith_display";

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
  // Screen 1. Updated 6 October 2026: the face is registered for re-checks.
  verification_selfie: {
    kind: "verification_selfie",
    version: "2026-10-06",
    title: "Before your selfie",
    body: [
      "You'll take a short selfie video. It does two things: it confirms you're a real person, here now — and it checks that your main photo is really you.",
      "The check is run by Smile ID, our verification provider. **Toastly keeps only the result** — that you passed, and when — never your images.",
      "Smile ID also registers your face against your Toastly account, so that if we ever ask you to re-check, it can confirm it's still you.",
      // SMILE-RETENTION: if Smile ID confirms it uses images to improve its technology and we can't opt out, append "Smile ID may also use them to improve its own technology."
      "Smile ID keeps the images from this check for up to five years, under its own terms. [Purpose of retention, and any way to request earlier deletion — to be confirmed with Smile ID.]",
    ],
    checkbox: "I agree to Smile ID checking my selfie, comparing it with my main photo and registering my face for later re-checks, as described above.",
    primary: "Start",
    secondary: "Not now",
  },
  // Screen 2. Unchanged.
  replace_main_photo: {
    kind: "replace_main_photo",
    version: "2026-10-05",
    title: "Check your new main photo",
    body: [
      "Take a quick selfie so we can confirm your new main photo is really you. **Your current photo stays on your profile until the new one is confirmed.**",
      // SMILE-RETENTION: if Smile ID confirms it uses images to improve its technology and we can't opt out, append "Smile ID may also use them to improve its own technology."
      "The check is run by Smile ID. Toastly keeps only the result. Smile ID keeps the images for up to five years, under its own terms.",
    ],
    checkbox: "I agree to Smile ID comparing a new selfie with my new main photo.",
    primary: "Start",
    secondary: "Keep my current photo",
  },
  // Screen 4 (decided 6 October 2026). Never says why the member was asked.
  reverify_selfie: {
    kind: "reverify_selfie",
    version: "2026-10-06b",
    title: "Quick re-check",
    body: [
      "We sometimes ask members to confirm it's still them. One selfie, about a minute.",
      // SMILE-RETENTION: if Smile ID confirms it uses images to improve its technology and we can't opt out, append "Smile ID may also use them to improve its own technology."
      "Smile ID compares it with the face registered when you verified. **Toastly keeps only the result.** Smile ID keeps the images for up to five years, under its own terms.",
    ],
    checkbox: "I agree to Smile ID checking that I'm a real person, here now, and the same person who verified this account.",
    primary: "Start",
    secondary: "Not now",
  },
  // Screen 3. Updated 6 October 2026: the selfie is matched to the face you
  // verified with, too.
  id_check: {
    kind: "id_check",
    version: "2026-10-06",
    title: "Check your ID",
    body: [
      "We'll ask Smile ID to check your number against the official record, and to match a new selfie to both the record and the face you verified with.",
      "**Toastly keeps only whether it passed, and when** — plus a one-way fingerprint of your number, so the same ID can't be used on more than one account. We can't turn the fingerprint back into your number. We don't keep the number itself, or the name, photo, date of birth, phone number or address on the record.",
      // SMILE-RETENTION: if Smile ID confirms it uses images to improve its technology and we can't opt out, append "Smile ID may also use them to improve its own technology."
      "Smile ID keeps the images and the check record for up to five years, under its own terms.",
    ],
    checkbox: "I agree to Smile ID checking my ID against the official record.",
    primary: "Continue to selfie",
    secondary: "Not now",
  },
  // Showing your faith (PRD §5.2.3; decided 6 October 2026): a one-line
  // consent the first time a member adds religion or denomination, recorded
  // in the same consents table with its own version. Not a Smile ID consent:
  // only the checkbox line is shown, inside the profile form.
  faith_display: {
    kind: "faith_display",
    version: "2026-10-06",
    title: "Your faith",
    body: [],
    checkbox: "I choose to show my faith on my profile. Toastly never uses it to decide who sees me.",
    primary: "Save profile",
    secondary: "Not now",
  },
};

/** Showing your faith — CONSENT.faith_display. */
export const FAITH_CONSENT = CONSENT.faith_display;

/** Split a paragraph into plain and **bold** runs. */
export function boldRuns(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((t) => (t.startsWith("**") ? { text: t.slice(2, -2), bold: true } : { text: t, bold: false }));
}
