/**
 * The safety kit (PRD §5.1).
 *
 * Every tool here is free for every member on every plan, always. This module
 * imports nothing about entitlements, and a constraint check fails if it
 * starts to — a safety feature gated through a shared helper is still gated.
 */

// ---------------------------------------------------------------------------
// Photo reveal
// ---------------------------------------------------------------------------

export type PhotoReveal = "verified_members" | "after_i_reply" | "after_gist";

export const PHOTO_REVEAL_OPTIONS: {
  value: PhotoReveal;
  label: string;
  hint: string;
}[] = [
  {
    value: "verified_members",
    label: "Any verified member who sees my profile",
    hint: "Your answers still sit above your photos on every card.",
  },
  {
    value: "after_i_reply",
    label: "Only people I've replied to or agreed to Gist with",
    hint: "Nobody unlocks your photos by messaging you — only by you engaging with them.",
  },
  {
    value: "after_gist",
    label: "Only after a Gist we both want to continue",
    hint: "The most private setting. They hear you before they see you.",
  },
];

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * Report reasons, mirroring the report_reason enum.
 *
 * "They're married" is a first-class reason, not buried under "Something
 * else" (PRD §5.2.1). Its wording never suggests Toastly verifies marital
 * status — nobody can, and implying otherwise would undermine the claim that
 * IS verifiable.
 */
export const REPORT_REASONS = [
  { value: "scam_or_fraud", label: "Scam or fraud" },
  { value: "asked_for_money", label: "Asked me for money" },
  { value: "threats_or_coercion", label: "Threats or pressure" },
  { value: "harassment", label: "Harassment" },
  { value: "fake_profile", label: "Not who they say they are" },
  { value: "user_is_married", label: "They're married" },
  { value: "underage", label: "They seem underage" },
  { value: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

// ---------------------------------------------------------------------------
// Emergency numbers
// ---------------------------------------------------------------------------

export type EmergencyNumber = { label: string; number: string };

/**
 * VERIFY BEFORE LAUNCH. These are the widely published numbers, but a safety
 * screen that lists a wrong emergency number is worse than one that lists
 * none, so each must be confirmed against an official source first.
 */
const EMERGENCY_NUMBERS: Record<string, EmergencyNumber[]> = {
  NG: [
    { label: "National emergency", number: "112" },
    { label: "Lagos State emergency", number: "767" },
  ],
  GB: [{ label: "Emergency", number: "999" }],
  US: [{ label: "Emergency", number: "911" }],
  CA: [{ label: "Emergency", number: "911" }],
};

/** An empty list means "use your local number" — never a guessed one. */
export function emergencyNumbersFor(countryCode: string): EmergencyNumber[] {
  return EMERGENCY_NUMBERS[countryCode.toUpperCase()] ?? [];
}

// ---------------------------------------------------------------------------
// Share-your-date and panic
// ---------------------------------------------------------------------------

/**
 * The date check-in message. Composed on the device; Toastly never sees it.
 *
 * Carries the match's FIRST NAME only — enough for a friend to act on, and no
 * more of someone else's details than a safety message needs.
 */
export function buildDateShareText(input: {
  me: string;
  match: string;
  place: string;
  when: string;
  checkIn?: string;
}): string {
  const lines = [
    `Toastly date check-in from ${input.me}.`,
    `I'm meeting ${input.match.trim()} at ${input.place.trim()}, ${input.when.trim()}.`,
  ];
  if (input.checkIn?.trim()) {
    lines.push(
      `If you haven't heard from me by ${input.checkIn.trim()}, please call me.`,
    );
  }
  return lines.join(" ");
}

export function buildPanicText(
  coords: { lat: number; lng: number } | null,
): string {
  const base = "I need help right now. Please call me.";
  if (!coords) return `${base} I couldn't share my location — ring me first.`;
  const lat = coords.lat.toFixed(5);
  const lng = coords.lng.toFixed(5);
  return `${base} I'm here: https://maps.google.com/?q=${lat},${lng}`;
}
