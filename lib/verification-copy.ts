/**
 * Verification copy — shared by the flow and the audit harness.
 *
 * The consent texts follow design/prompts/verification-screens-prompt.md,
 * with one sentence HELD (see SMILE_TERMS_CONFIRMED).
 */

/**
 * HELD until Smile ID's retention and processing terms are confirmed. While
 * false, no sentence describing what Smile ID does with images after the check
 * is shown — neither "uses your images only to run this check" nor "processes
 * your images to run this check and protect against fraud". Flip to true only
 * once the wording below has been checked against Smile ID's terms.
 */
export const SMILE_TERMS_CONFIRMED = false;

export const SMILE_PROCESSING_SENTENCE =
  "Smile ID processes your images to run this check and protect against fraud, under contract with us.";

export const SELFIE_CONSENT = {
  title: "Before your selfie",
  intro:
    "You'll take a quick selfie so we know you're a real person, here now. It's checked by Smile ID, our verification provider, who confirm it's a live person and not a photo or a screen.",
  keeps: "Toastly keeps only the result — that you passed, and when.",
  checkbox: "I agree to Smile ID checking my selfie to confirm I'm a real person.",
  start: "Start",
  decline: "Not now",
  camera:
    "Your browser will ask to use your camera. Allow it, hold your phone at eye level, and find some light.",
} as const;

export const ID_CONSENT = {
  title: "Check your ID",
  intro:
    "We'll ask Smile ID to check your number against the official record and match it to a new selfie.",
  // Updated for the keyed HMAC (0016): "not your number" stays true, and the
  // fingerprint is said out loud rather than hidden.
  keeps:
    "Toastly keeps only whether it passed, and when — not your number, and not the name, photo, date of birth, phone number or address on the record. We keep a scrambled code made from your number, so the same ID can't verify two accounts.",
  checkbox: "I agree to Smile ID checking my ID against the official record.",
  start: "Continue to selfie",
  decline: "Not now",
  secondSelfie: "This needs one more quick selfie — Smile ID matches it to the photo on the record.",
} as const;

export const ID_TYPE_OPTIONS = [
  { value: "NIN_V2", label: "NIN", hint: "11 digits" },
  { value: "V_NIN", label: "Virtual NIN", hint: "16 letters and numbers, from the NIMC app" },
  { value: "BVN", label: "BVN", hint: "11 digits" },
] as const;

/** Plain-language reasons. Never "rejected", never a fraud score. */
export const REASON_COPY: Record<string, string> = {
  spoof_detected:
    "The selfie looked like a photo or a screen. Try again holding your phone yourself, in good light.",
  image_unavailable_or_invalid:
    "We couldn't get a clear enough picture. Try again somewhere brighter, with your face filling the frame.",
  face_verification_failed:
    "The selfie didn't match the photo on your ID record. Check it's your own number, then try again.",
  identifier_not_found:
    "That number wasn't found on the official record. Check it and try again, or try a different ID type.",
  invalid_id_number: "That number isn't in the right format. Check it and try again.",
  id_photo_unavailable:
    "Your record has no photo to match against. Try a different ID type.",
  id_already_used:
    "This ID is already verified on another Toastly account. If that wasn't you, email support@trytoastly.com.",
  id_mismatch:
    "The number that was checked wasn't the one you entered. Please start again.",
  high_risk: "We couldn't confirm it this time.",
};

export const GENERIC_BLOCK = "We couldn't confirm it this time.";
export const GENERIC_ERROR = "Something went wrong on our side, not yours. Please try again.";
