/**
 * Verification copy — shared by the flow and the audit harness.
 *
 * The ID types and the plain-language reasons. Every consent, and the
 * versions recorded with every agreement, are in lib/consent.ts
 * (Toastly-Verification-Consent-Wording.md).
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

/**
 * Every ID type the form knows. Which are OFFERED is decided on the server
 * (enabledIdTypes() in lib/smile-id.ts): Virtual NIN stays hidden until Smile
 * ID enables it for our account.
 */
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
  // The selfie wasn't the face registered at onboarding — the ID check's
  // selfie, or a re-check (decided 6 October 2026). After three in 24 hours
  // a person looks instead (0029, repeated_mismatch).
  not_same_person: "That selfie didn't match the face you verified with. Try again in good light, facing the camera.",
};

export const GENERIC_BLOCK = "We couldn't confirm it this time.";
export const GENERIC_ERROR = "Something went wrong on our side, not yours. Please try again.";
