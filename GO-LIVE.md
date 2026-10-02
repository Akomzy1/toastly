# Toastly — go-live credentials checklist

Every integration that is stubbed, or reading an environment variable that is
empty. Fill these in and the listed behaviour changes; leave one out and the
stated fallback is what users get.

Set each value in **Vercel → Project → Settings → Environment Variables**
(Production and Preview), then redeploy. `.env.local` covers local work only.

Nothing here is a secret you should paste into a chat, a ticket, or a commit.

---

## 1. The database — connected

| Integration | Variables | Notes |
|---|---|---|
| Supabase (database, auth) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All sixteen migrations are applied (0016, Smile ID, and 0015, account lifecycle, both on 2 October 2026). pg_cron is enabled and the nightly purge of expired retention records is scheduled (job `toastly-purge-retention`, 03:17 UTC, set up 2 October 2026). 0013 (relationship history) and 0014 (genotype) both on 26 September 2026 — 0013 after the deploy that reads the new table, 0014 after Vault passed a store-and-read round trip and pgcrypto an encrypt-and-decrypt check. **Set in Vercel production** (confirmed 2 October 2026): signed-out visitors to `/feed` are sent to `/login`, and the data download asks for sign-in rather than reporting "not configured". |

**Still to do on Supabase:** add `https://www.trytoastly.com` (the host
production actually serves — see below) to Authentication → URL
Configuration (Site URL and Redirect URLs), or email sign-in links will point
at localhost.

**The bare domain redirects to www.** `trytoastly.com` answers every request
with a 308 redirect to `www.trytoastly.com`. Either make the bare domain the
primary in Vercel → Domains, or set `NEXT_PUBLIC_SITE_URL` to
`https://www.trytoastly.com` — today every canonical URL and sitemap entry
points at a redirect.

**Migration 0016 (Smile ID) is applied** (2 October 2026). Checked from
outside with the public anon key: `verification_sessions` reads empty under
RLS; `verified_id_hashes`, `blocked_id_hashes`, `id_number_hmac_key()` and
`emit_trust_event()` all refuse a client (42501). The service role reads the
Vault key. Members can no longer set their own verification stage.

---

## 1a. Smile ID — integrated, in sandbox

Verified Real (SmartSelfie) and the optional ID check (Biometric KYC: NIN,
Virtual NIN, BVN) run through Smile ID's hosted web flow. Tokens are minted on
the server; the result is decided only by the signed callback at
`/api/smile-id/callback`.

| Variable | Set to |
|---|---|
| `SMILE_ID_PARTNER_ID`, `SMILE_ID_API_KEY` | From the Smile ID portal. Server only. |
| `SMILE_ID_ENV` | `sandbox` until cut-over. |
| `SMILE_ID_CALLBACK_URL` | `https://www.trytoastly.com/api/smile-id/callback` — **www**. `.env.local` currently has the bare domain, which 308-redirects; Smile ID won't follow it. Sent with every job; the Smile ID portal has no field for it, only an optional allowlist (cut-over step 4). |
| `SMILE_ID_SANDBOX_TESTERS` | Optional. Emails allowed the test-identity picker on the live site while in sandbox. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required now** — the session route and callback write with it. |

### Production cut-over — in this order

1. **Confirm Smile ID's retention terms** for selfies and ID images (how long
   they keep them, and for what). Then decide the held consent sentence: set
   `SMILE_TERMS_CONFIRMED = true` in `lib/verification-copy.ts` only if
   "Smile ID processes your images to run this check and protect against
   fraud, under contract with us" is accurate, and update the constraint check
   that pins it to `false`. "Smile ID uses your images only to run this check"
   must not ship unless their terms say exactly that.
2. **Complete Smile ID's production onboarding** (KYB) and enable SmartSelfie
   and Biometric KYC for Nigeria — NIN, Virtual NIN and BVN — on the
   production partner account.
3. **Production keys in Vercel** (Production environment only):
   `SMILE_ID_API_KEY` (production key), `SMILE_ID_PARTNER_ID` (same ID unless
   Smile ID says otherwise), `SMILE_ID_ENV=production`,
   `SMILE_ID_CALLBACK_URL=https://www.trytoastly.com/api/smile-id/callback`.
   Remove `SMILE_ID_SANDBOX_TESTERS`. Keep Preview on sandbox keys.
4. **The callback URL travels with every job** (the session config sends
   `SMILE_ID_CALLBACK_URL`), so there is no portal field to fill. The portal
   only has an optional allowlist, under *Developer › Security Settings ›
   Callback URLs*: if allowlisting is enabled, register `www.trytoastly.com`
   for the **production** environment (sandbox is configured separately), or
   every job is refused at submission with `403 "You are not authorized to do
   that."`.
5. **Redeploy.** The test-identity picker disappears by itself
   (`SMILE_ID_ENV` is no longer `sandbox`).
6. **Revoke every verification earned in the sandbox.** Sandbox results are
   forced by test identities, so none of them proves anything. In the SQL
   editor:
   ```sql
   -- Who passed only in sandbox?
   select distinct profile_id from verification_sessions
    where environment = 'sandbox' and passed;
   -- Revert them (service role / SQL editor only):
   update profiles p set stage = 'phone_verified',
          liveness_verified_at = null, id_confirmed_at = null
    where exists (select 1 from verification_sessions s
                   where s.profile_id = p.id and s.environment = 'sandbox' and s.passed)
      and not exists (select 1 from verification_sessions s
                   where s.profile_id = p.id and s.environment = 'production' and s.passed);
   delete from verified_id_hashes h
    where exists (select 1 from verification_sessions s
                   where s.profile_id = h.profile_id and s.environment = 'sandbox' and s.passed);
   ```
7. **One real end-to-end run** on a phone, with your own face and ID, then
   confirm in the database that the session row holds only a job ID, status,
   reason code, pass/fail and timestamps.
8. **Optional hardening:** restrict `/api/smile-id/callback` to Smile ID's
   production callback IPs (13.51.0.119, 34.240.137.52, 51.20.27.3,
   52.213.46.74) with a Vercel firewall rule. Sandbox uses different IPs.

**Results that need a person (`attention`)** show the member "a person on
our team is taking a look" — but there is no staff review screen yet. Until
there is, check `verification_sessions` where `status = 'attention'` and
resolve in the Smile ID portal.

---

## 2. Required before launch

| Integration | Variables | What happens without it |
|---|---|---|
| Canonical domain | `NEXT_PUBLIC_SITE_URL` | Defaults to `https://trytoastly.com`. If the real origin differs, every canonical URL, OG image and sitemap entry is wrong in search results. |
| Phone hashing | `PHONE_HASH_PEPPER` | **Verification refuses to run in production.** Phone numbers are stored only as hashes, and the number space is small enough to brute-force, so an unpeppered hash is effectively reversible. Generate once: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Changing it later invalidates every existing phone identity. |
| Service role | `SUPABASE_SERVICE_ROLE_KEY` | **Verification can't start or finish without it** (Smile ID session and callback), and staff tooling can't read. **Server-side only — never `NEXT_PUBLIC_`.** |

---

## 3. Stubbed — code exists, the vendor does not

These are the launch blockers. Each one has a working screen and state
machine; the check itself is missing and deliberately not faked.

| Integration | Variables | Current behaviour |
|---|---|---|
| **Paystack** (NGN) | `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` | The webhook verifies the HMAC-SHA512 signature correctly and then **grants nothing** — no payment recorded, no coins credited, no subscription. Returns 503 while the key is unset. |
| **Stripe** (USD) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Same: signature and replay window verified, **no entitlement granted**. |
| **LiveKit** (Gist calls) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Tokens are minted server-side with camera withheld unless entitled. The **client transport is not wired**, so the session page shows a "Join session" button with nothing behind it once credentials are set. |

**Webhook URLs to register with each provider** — on `www`, because the bare
domain answers with a redirect and payment providers don't follow redirects
on webhooks:
`https://www.trytoastly.com/api/webhooks/paystack` ·
`https://www.trytoastly.com/api/webhooks/stripe`

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

- **The privacy policy is published** (2 October 2026). Before switching on
  any third-party processor in Vercel, add the country it processes data in
  to section 9 of `lib/privacy-content.ts`. A lawyer should still review
  the policy. `/terms` still has no page.
- **Supabase plan: Pro** (confirmed 2 October 2026). Daily backups are kept
  for 7 days, which is what the genotype consent copy and privacy policy
  promise: deleted values are out of every backup "within 7 days". That
  holds while point-in-time recovery is off (its default). Enabling it beyond
  7 days, or moving to Team (14) or Enterprise (up to 30), means changing
  `GENOTYPE_BACKUP_RETENTION_DAYS` and asking members to consent again.
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
