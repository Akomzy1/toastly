# Toastly — go-live credentials checklist

Every integration that is stubbed, or reading an environment variable that is
empty. Fill these in and the listed behaviour changes; leave one out and the
stated fallback is what users get.

Set each value in **Vercel → Project → Settings → Environment Variables**
(Production and Preview), then redeploy. `.env.local` covers local work only.

Nothing here is a secret you should paste into a chat, a ticket, or a commit.

---

## 1. Already working

| Integration | Variables | Notes |
|---|---|---|
| Supabase (database, auth) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Migrations 0001–0012 are applied. Without these, every signed-in page shows a "Supabase isn't configured" notice and the marketing site is unaffected. |

**Held migrations — do not apply on their own.** `0013_live_profile_guard`,
`0014_phone_identity_and_mutual_continue` and `0015_profile_photos_face_match`
are committed but deliberately NOT applied (decided 2026-10-05). 0013 means
nobody can see anyone until their profile is live, and a profile can only go
live through Prompt 14's photo upload and face match. Apply all three in the
**same release** as the photo screens **and a working Smile ID face match**
(capture included, below), or every member is locked out. 0014 needs `SUPABASE_SERVICE_ROLE_KEY` server-side: phone confirmation
now binds the number through the service role.

**Still to do on Supabase even though it works:** add
`https://trytoastly.com` to Authentication → URL Configuration (Site URL and
Redirect URLs), or email sign-in links will point at localhost.

---

## 2. Required before launch

| Integration | Variables | What happens without it |
|---|---|---|
| Canonical domain | `NEXT_PUBLIC_SITE_URL` | Defaults to `https://trytoastly.com`. If the real origin differs, every canonical URL, OG image and sitemap entry is wrong in search results. |
| Phone hashing | `PHONE_HASH_PEPPER` | **Verification refuses to run in production.** Phone numbers are stored only as hashes, and the number space is small enough to brute-force, so an unpeppered hash is effectively reversible. Generate once: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Changing it later invalidates every existing phone identity. |
| Staff tooling and phone binding | `SUPABASE_SERVICE_ROLE_KEY` | The integrity review queue and report triage can't read, and (from 0014) phone confirmation can't complete. **Server-side only — never `NEXT_PUBLIC_`.** |

---

## 3. Stubbed — code exists, the vendor does not

These are the launch blockers. Each one has a working screen and state
machine; the check itself is missing and deliberately not faked.

| Integration | Variables | Current behaviour |
|---|---|---|
| **Liveness capture** — Smile ID | `SMILE_ID_PARTNER_ID`, `SMILE_ID_API_KEY`, `SMILE_ID_ENVIRONMENT` | Vendor chosen, **integration not written**. `recordLiveness` refuses in production with "Liveness checks aren't connected yet"; in development it marks the profile Verified Real without checking anything. This gates the "Verified Real" badge, which is the product's central claim. |
| **Main-photo face match** — Smile ID | same three variables, plus the webhook `https://trytoastly.com/api/webhooks/smile-id` registered with Smile ID | **Server side written, capture not.** Each main photo is checked with a fresh selfie: SmartSelfie Authentication (same person as enrolled) + Compare (selfie vs photo, as PORTRAIT); `lib/smile-id.ts`, the webhook and `0015` are built against the v3 docs but untested against the sandbox — the webhook body is documented only by example. Missing: Smile ID's web selfie capture (the same SDK liveness needs), and Verified Real enrolling each member with Smile ID under their profile id, which Authentication checks against. Without credentials the photo screen says checks aren't connected; in development a stand-in records a match. **The consent wording is held** until Smile ID's image retention (documented as 5 years) is confirmed. |
| **NIN / BVN** — Smile ID | same three variables | Same vendor, same account. `submitIdNumber` refuses in production. The number itself is never stored, only the fact of a pass. Optional forever, so this blocks the second ring, not sign-up. |
| **Paystack** (NGN) | `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` | The webhook verifies the HMAC-SHA512 signature correctly and then **grants nothing** — no payment recorded, no coins credited, no subscription. Returns 503 while the key is unset. |
| **Stripe** (USD) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Same: signature and replay window verified, **no entitlement granted**. |
| **LiveKit** (Gist calls) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Tokens are minted server-side with camera withheld unless entitled. The **client transport is not wired**, so the session page shows a "Join session" button with nothing behind it once credentials are set. |

**Webhook URLs to register with each provider:**
`https://trytoastly.com/api/webhooks/paystack` ·
`https://trytoastly.com/api/webhooks/stripe`

---

## 4. Optional — the feature degrades honestly without it

| Integration | Variables | Without it |
|---|---|---|
| Google Places | `GOOGLE_PLACES_API_KEY` | Date-spot suggestions show "not connected yet" and the pair is told to agree somewhere public themselves. Everything else in the Gist and stake flow works. Enable **Places API (New)** and restrict the key to it. **Server-side only** — a browser-visible maps key is billable by anyone who finds it. |
| Resend (email) | `RESEND_API_KEY`, `EMAIL_FROM` | Receipts, the re-verification notice and the emergency-contact security notice silently don't send. **Account verification codes are unaffected** — Supabase Auth sends the phone OTP and email confirmation, not us. `EMAIL_FROM` must be a verified sender domain. |
| PostHog (analytics) | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | The five funnel events aren't recorded: signup, verification complete, first Gist, first deposit, upgrade. Nothing else changes. Trust Sentinel events never go here — Supabase is their system of record. |
| **Termii** (SMS, +234) | `TERMII_API_KEY`, `TERMII_SENDER_ID` | **A member cannot add an emergency contact at all** — the flow refuses rather than storing a number it can't confirm. Share-your-date still works; it sends from the member's own phone. The sender ID must be registered with Termii before it delivers. |
| **Twilio** (SMS, everywhere else) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Same, for non-Nigerian numbers. **Never used for calling** — Gist runs on LiveKit and no member's real number is ever routed or exposed. |

---

## 5. Not wired at all

Nothing in the codebase reads these. Setting them changes nothing today.

| Service | Variables | Reality |
|---|---|---|
| Claude API | `ANTHROPIC_API_KEY` | No AI feature exists. The Trust Sentinel's Phase 1 is instrumentation only; the scoring agent is Phase 2. |

---

## 6. Not a credential, but on the same list

- **Emergency numbers** (112, 767 Lagos, 999, 911) are marked
  VERIFY BEFORE LAUNCH in `lib/safety.ts`. A wrong number on a safety screen
  is worse than no number.
- **PWA installability** has been verified statically — name, short name,
  start URL, standalone display, 192/512 icons, a maskable icon and a theme
  colour are all present and the service worker registers. The live Lighthouse
  check still needs a build served from **outside OneDrive**, which renames
  Next's output and breaks `next start`.
