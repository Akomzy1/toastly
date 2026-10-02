# Toastly — Verification Screens: Claude Design Prompt

Run in the same Claude Design session as the genotype screens. These are
**in-app** screens, in the register of `locked-inbox.html`, the five in-app
surfaces and the five genotype screens. Export each screen as its own HTML
file.

**Decisions settled (2 October 2026):** both consent texts are approved as
written below; the ID check offers NIN and BVN only (no Virtual NIN at
launch); the Smile ID overlay keeps its "Powered by Smile ID" footer.

---

## PROMPT

Continuing in the established Toastly design system and the **in-app**
register — design the verification flow. **Mobile-first at 360px, then
320px.** Touch targets at least 44px, text at least 12px. Existing tokens and
components only.

### What verification is here

Every member verifies before their profile becomes visible. Three steps, in
order:

1. **Phone** — a code by text message. *(Already designed elsewhere; show it
   only as a completed step in the overview.)*
2. **Verified Real** — a quick selfie proving a live person is present.
   Required. Passing it earns the "Verified Real" seal, the product's central
   trust signal.
3. **ID check** — optional, forever. NIN or BVN, checked against
   the official record and matched to a new selfie. Adds a second ring to the
   seal. Never presented as something missing.

The selfie camera itself is run by **Smile ID**, our verification provider,
in a full-screen overlay **you do not design**. Your screens come before it
and after it.

### Rules that govern every screen — non-negotiable

- **Calm and plain.** Verification is a trust step, not a security alarm. No
  warning triangles, no red, no "suspicious activity" language.
- **Honest about who sees what.** Every screen that leads to the camera says
  that Smile ID checks the selfie and that Toastly keeps only the result.
- **Never punitive about failure.** A failed check is "we couldn't confirm
  it", with a clear next step — never "rejected" or "failed verification" in
  the headline.
- **The ID check is optional and equal.** Skipping it has the same visual
  weight as starting it, and a member who never does it is never nagged.
- **Free, always.** No plan, price or upgrade appears anywhere in this flow.

### The Smile ID overlay — what you're designing around

- It opens full-screen over your page and takes over until the member
  finishes or closes it.
- Its only themeable values are **one accent colour** (used as a button
  ground with white text) and the "Powered by Smile ID" footer, which stays
  on: the privacy policy names Smile ID, so the overlay does too.
- **The accent must be teal `#00695C`, not amber.** Amber with white text
  fails contrast. So the overlay's buttons will be teal — design your own
  screens so the hand-off into a teal-buttoned overlay doesn't feel like a
  different product.
- Show the moment of hand-off: the "Start" button on your screen, and what
  your page looks like behind the overlay when the member returns.

### Screens

**1. Overview** — the verify page as the member returns to it. A three-step
progress view (phone, Verified Real, ID check — the third marked optional),
in four states: *phone done, Verified Real not started* · *Verified Real
being checked* · *Verified Real passed, ID check not started* · *both done*.
The passed state shows the Verified Real seal. Use the existing ring-stepper
idea (rings filling along a rule, borrowed from The Stake mark) if it fits.

**2. Before your selfie** — what's about to happen, the camera permission
explained before the browser asks, a surname field (*"Your surname — used
only to verify you, never shown to other members"*), and the consent, using
this copy:

> **Before your selfie**
>
> You'll take a quick selfie so we know you're a real person, here now.
> It's checked by Smile ID, our verification provider, who confirm it's a
> live person and not a photo or a screen.
>
> Toastly keeps only the result — that you passed, and when. Smile ID
> processes your images to run this check and protect against fraud, under
> contract with us.
>
> ☐ I agree to Smile ID checking my selfie to confirm I'm a real person.
>
> **[Start]** · Not now

"Start" is disabled until the box is ticked. "Not now" is a real, equal exit.

**3. Checking** — results arrive from Smile ID after a short wait, sometimes
longer. A calm in-progress state the member can leave: *"We're checking your
selfie. This usually takes a minute — you can leave this page and we'll show
the result here next time."* No spinner that implies something is stuck.

**4. Verified Real — every outcome**, as separate states:
- **Passed** — the seal, one warm line, and the next step: set up your
  profile, with the optional ID check offered quietly beneath.
- **Being reviewed by a person** — the check finished but needs a human look.
  *"A person on our team is taking a look. You don't need to do anything."*
- **Couldn't confirm** — with a plain reason and a retry, for: the selfie
  looked like a photo or a screen; the lighting or framing wasn't clear
  enough. One "Try again" button.
- **Something went wrong on our side** — a technical error, not the member's
  fault. "Try again".

**5. ID check** — choose **NIN** or **BVN** (two equal options); enter the
number (11 digits for either); confirm first name and surname
**as on the ID**; a one-line note that this needs *one more quick selfie*;
and the consent, using this copy:

> **Check your ID**
>
> We'll ask Smile ID to check your number against the official record and
> match it to a new selfie. Toastly keeps only whether it passed, and when —
> not your number, and not the name, photo, date of birth, phone number or
> address on the record.
>
> ☐ I agree to Smile ID checking my ID against the official record.
>
> **[Continue to selfie]** · Not now

**6. ID check — every outcome**: passed (the second ring added to the seal);
being reviewed by a person; couldn't confirm — *the number wasn't found*,
*the selfie didn't match the photo on record*, *the record has no photo to
match against (try a different ID type)*; and something went wrong.

---

Export six files: `verify-overview.html`, `verify-before-selfie.html`,
`verify-checking.html`, `verify-outcomes.html`, `verify-id-check.html`,
`verify-id-outcomes.html`. Do not change any existing screen.

---

*End of prompt.*
