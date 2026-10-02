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
| Supabase (database, auth) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All fourteen migrations are applied. 0013 (relationship history) and 0014 (genotype) both on 26 September 2026 — 0013 after the deploy that reads the new table, 0014 after Vault passed a store-and-read round trip and pgcrypto an encrypt-and-decrypt check. Without these, every signed-in page shows a "Supabase isn't configured" notice and the marketing site is unaffected. |

**Still to do on Supabase even though it works:** add
`https://trytoastly.com` to Authentication → URL Configuration (Site URL and
Redirect URLs), or email sign-in links will point at localhost.

---

## 2. Required before launch

| Integration | Variables | What happens without it |
|---|---|---|
| Canonical domain | `NEXT_PUBLIC_SITE_URL` | Defaults to `https://trytoastly.com`. If the real origin differs, every canonical URL, OG image and sitemap entry is wrong in search results. |
| Phone hashing | `PHONE_HASH_PEPPER` | **Verification refuses to run in production.** Phone numbers are stored only as hashes, and the number space is small enough to brute-force, so an unpeppered hash is effectively reversible. Generate once: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Changing it later invalidates every existing phone identity. |
| Staff tooling | `SUPABASE_SERVICE_ROLE_KEY` | The integrity review queue and report triage can't read. **Server-side only — never `NEXT_PUBLIC_`.** |

---

## 3. Stubbed — code exists, the vendor does not

These are the launch blockers. Each one has a working screen and state
machine; the check itself is missing and deliberately not faked.

| Integration | Variables | Current behaviour |
|---|---|---|
| **Liveness capture** — Smile ID | `SMILE_ID_PARTNER_ID`, `SMILE_ID_API_KEY`, `SMILE_ID_ENVIRONMENT` | Vendor chosen, **integration not written**. `recordLiveness` refuses in production with "Liveness checks aren't connected yet"; in development it marks the profile Verified Real without checking anything. This gates the "Verified Real" badge, which is the product's central claim. |
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

- **A privacy policy page.** `/privacy` does not exist, yet the footer and
  the signup page link to it. The genotype consent step also needs it, with
  a data-rights contact address — none exists in the project yet.
- **Backup retention on the Supabase plan.** The genotype consent copy says
  deleted values leave encrypted backups "within 7 days". That is true only
  on Pro without PITR; change `GENOTYPE_BACKUP_RETENTION_DAYS` if not.
- **Emergency numbers** (112, 767 Lagos, 999, 911) are marked
  VERIFY BEFORE LAUNCH in `lib/safety.ts`. A wrong number on a safety screen
  is worse than no number.
- **PWA installability** has been verified statically — name, short name,
  start URL, standalone display, 192/512 icons, a maskable icon and a theme
  colour are all present and the service worker registers. The live Lighthouse
  check has not been run.

---

## 7. Dependency advisories — unresolved, and why

`npm audit` reports 5 findings (4 high, 1 critical). **All five are `next`
itself** plus `postcss` nested under it. Installed `next` is `14.2.35`, which
is the newest 14.2.x that exists; the vulnerable range is
`9.3.4-canary.0 – 16.3.0-preview.10`, so no 14.x or 15.x release fixes them.
The only fix npm offers is `next@16.3.5` — a major upgrade, ruled out for this
pass.

| Package | Ships to users? | Verdict |
|---|---|---|
| `next` 14.2.35 | **Yes** — the server and client runtime | **Real.** 24 advisories, including unauthenticated RCE on Windows-hosted servers (GHSA-p293-qw3h-jr36), RCE in the Image Optimization API when AVIF is processed (GHSA-2xp9-vwfh-vxw4), cache poisoning, SSRF and DoS. Unfixable without Next 16. |
| `postcss` ≤8.5.22 (under `next/node_modules`) | No — build-time CSS processing | Dev/build-only. Resolves with the same upgrade. |
| `@playwright/test` (added for the mobile audit) | No — devDependency | Not in the report. |

**Interim mitigations that need no upgrade — decisions, not applied:**

1. **Remove `image/avif` from `images.formats` in `next.config.mjs`.** The AVIF
   advisory is patched only in 15.5.24 and 16.3.3 and triggers "when AVIF files
   are optimized"; the config opts into AVIF output. Cost: marginally larger
   images on AVIF-capable browsers, against PRD §5.8's data-light rule — which
   is why it is a decision rather than a change.
2. **Production is Vercel (Linux).** The Windows RCE applies to Windows-hosted
   servers — local development, not the deployment.
3. **`images.remotePatterns` is unset**, so the optimizer only processes files
   under `public/`, none of which are AVIF.

**The Next 16 upgrade is a piece of work in its own right** and should be
scheduled before launch — it is the only thing that clears the report.
