# Toastly — go-live credentials checklist

Every integration that is stubbed, or reading an environment variable that is
empty. Fill these in and the listed behaviour changes; leave one out and the
stated fallback is what users get.

Set each value in **Vercel → Project → Settings → Environment Variables**
(Production and Preview), then redeploy. `.env.local` covers local work only.

Nothing here is a secret you should paste into a chat, a ticket, or a commit.

---

## 0. Prompt 17, coin balance (migration 0023)

**The legal check in PRD §11 is confirmed** (owner, 4 October 2026: CBN
e-money licensing; UK consumer law on the no-refund terms). Ship in this
order:

1. Run `supabase/migrations/0023_coin_balance.sql` in the SQL editor. It
   schedules pg_cron job `toastly-advance-dates` (every 10 minutes) and drops
   the open `settle_commitment` function.
2. Merge the branch and let Vercel deploy. `/wallet` redirects to `/coins`.
3. The privacy policy's effective date is set to 4 October 2026 for the
   "Dates and coins" and check-in location lines.

Done: 0023 applied and Prompt 17 deployed (4 October 2026). Buying coins
and paying the rest of a plan by card arrive with live payments (§0a).

---

## 0a. Live payments — Paystack (₦) and Stripe ($) (migration 0024)

Decided 4 October 2026: Naira plans are hybrid (card renews monthly and is
stopped in the app; bank or USSD buys a 30-day pass); diaspora plans are
monthly Stripe subscriptions; coins can part-pay Premium or Premium Plus
(held at checkout, card pays the rest, released after an hour if
abandoned). Checkout is hosted by Paystack and Stripe.

**Live keys only work on the production deployment.** On a laptop or a
preview, a `sk_live_` key reads as "not configured", so testing can never
charge a real card. Test in test mode first.

**Test mode first (on a Vercel preview):**

1. In Paystack and Stripe, switch the dashboard to **Test mode** and copy
   the test keys.
2. Vercel → Settings → Environment Variables, scope **Preview** only:
   `PAYSTACK_SECRET_KEY` (sk_test_…), `PAYSTACK_PUBLIC_KEY` (pk_test_…),
   `STRIPE_SECRET_KEY` (sk_test_…), `STRIPE_WEBHOOK_SECRET` (whsec_… from
   the test-mode endpoint below). Put the same test keys in `.env.local`
   for local work (the live ones there are ignored off production anyway).
3. Register the test webhooks against the preview URL (Paystack test
   webhook URL; Stripe test endpoint), pay with Paystack's test card
   `4084 0840 8408 4081` and Stripe's `4242 4242 4242 4242`.

**Production, in this order:**

1. ~~Run `supabase/migrations/0024_payments_live.sql`.~~ **Applied 4 October
   2026** and checked from outside: prices readable, every payment function
   and table refuses anonymous callers. pg_cron job `toastly-release-holds`
   runs every 15 minutes.
2. Vercel → Production: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`,
   `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET` (the live endpoint's
   `whsec_…`), and `CRON_SECRET` (any long random string — Vercel Cron sends
   it to the reminder job).
3. **Paystack** → Settings → API Keys & Webhooks → Live webhook URL:
   `https://www.trytoastly.com/api/webhooks/paystack`. Plans ("Toastly
   Premium", "Toastly Premium Plus") are created by the app on first use.
4. **Stripe** → Developers → Webhooks → Add endpoint
   `https://www.trytoastly.com/api/webhooks/stripe` with events:
   `checkout.session.completed`, `checkout.session.expired`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`. Prices
   (`toastly_diaspora_monthly`, `toastly_diaspora_plus_monthly`) are created
   by the app on first use. Apple Pay works on Stripe's hosted checkout.
5. Redeploy. The daily reminder job (`vercel.json`, 08:00 UTC) emails members
   three days before a pass or a stopped card plan ends.

**Still to note:** refunds and disputes are handled by a person in each
provider's dashboard; marking a payment refunded in the database is a staff
step (there is no refund flow in the app, by design — coins never become
cash).

---

## 1. The database — connected

| Integration | Variables | Notes |
|---|---|---|
| Supabase (database, auth) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All twenty-two migrations are applied (0022, Gist deck, 0021, finished Gists no longer block invites, 0020, Gist invites, 0019, Gist clock, 0018, AI agents, and 0017, the profiles read-policy fix, on 3 October 2026; 0016, Smile ID, and 0015, account lifecycle, on 2 October 2026). Until 0017, every member read of `profiles` failed with `42P17` (infinite recursion in the 0001 policy), so the verify page showed everyone the phone step. pg_cron is enabled and the nightly purge of expired retention records is scheduled (job `toastly-purge-retention`, 03:17 UTC, set up 2 October 2026). 0013 (relationship history) and 0014 (genotype) both on 26 September 2026 — 0013 after the deploy that reads the new table, 0014 after Vault passed a store-and-read round trip and pgcrypto an encrypt-and-decrypt check. **Set in Vercel production** (confirmed 2 October 2026): signed-out visitors to `/feed` are sent to `/login`, and the data download asks for sign-in rather than reporting "not configured". |

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
| Phone codes (Supabase Auth SMS) | Set in **Supabase → Authentication → Providers → Phone**, not in Vercel | **No member can confirm a phone, so nobody can reach Verified Real.** Supabase Auth sends the code itself; our `TERMII_*` / `TWILIO_*` variables cover emergency contacts only. Twilio is supported natively; Termii would need a Supabase "Send SMS" hook (not built). The phone step now says "We couldn't send a code right now" instead of showing Supabase's raw error. |
| Phone hashing | `PHONE_HASH_PEPPER` | **The phone step refuses to run in production** ("Phone verification isn't available right now" — before 2 October 2026 it crashed the page). Phone numbers are stored only as hashes, and the number space is small enough to brute-force, so an unpeppered hash is effectively reversible. Generate once: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Changing it later invalidates every existing phone identity. |
| Service role | `SUPABASE_SERVICE_ROLE_KEY` | **Verification can't start or finish without it** (Smile ID session and callback), and staff tooling can't read. **Server-side only — never `NEXT_PUBLIC_`.** |

---

## 3. Stubbed — code exists, the vendor does not

These are the launch blockers. Each one has a working screen and state
machine; the check itself is missing and deliberately not faked.

| Integration | Variables | Current behaviour |
|---|---|---|
| **Paystack** (NGN) | `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` | **Wired (0024)** — see §0a. Checkout, card renewals, 30-day passes, coin part-payment, webhook and return-page settlement. Off (with an in-app notice) while the key is unset, or a live key off production. |
| **Stripe** (USD) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **Wired (0024)** — see §0a. Diaspora subscriptions and the dollar coin pack. |
| **Vercel Cron** | `CRON_SECRET` | Plan-ending reminder emails (daily). Refuses every request while unset. |

**Webhook URLs to register with each provider** — on `www`, because the bare
domain answers with a redirect and payment providers don't follow redirects
on webhooks:
`https://www.trytoastly.com/api/webhooks/paystack` ·
`https://www.trytoastly.com/api/webhooks/stripe`

---

## 3b. Gist voice calls — wired (LiveKit)

Voice Gist runs over LiveKit (Phase 1). Live video stays Phase 2 (P2-D):
every token withholds camera rights, and nothing in the call asks for a
camera. Tested on 3 October 2026 with two headless browsers against the
real LiveKit project: both connected, both heard each other, the camera
was refused by the token, and a server-side room close disconnected both.

- **`LIVEKIT_URL`** must be `wss://<project>.livekit.cloud` — one scheme.
  `.env.local` had `wss://wss://…`, which never resolves; fixed there on
  3 October 2026. **Check the value in Vercel**: if it has the same typo,
  production calls fail with "could not establish signal connection".
- **Migration 0019 (Gist clock) is applied** (3 October 2026): `gist_join`,
  `gist_extend` and `gist_finish` exist and refuse anonymous callers; the
  new timing columns are in place.
- **Delete any hand-verified test accounts before launch** (Supabase →
  Authentication → Users). The sandbox revoke step (§1a) only catches
  accounts verified through a Smile ID sandbox selfie; an account set to
  `verified_real` in the SQL editor has no session row and would slip
  through. `tokunboakomolede+test@gmail.com` was deleted through the in-app
  Delete account flow on 3 October 2026 (confirmed: one account, one profile
  left). **Still to handle:** `tokunboakomolede@gmail.com` had its phone
  marked confirmed by hand — delete it at launch, or verify it properly once
  SMS is connected.
- **Migration 0020 (Gist invites) is applied** (3 October 2026): `gist_invite`,
  `gist_has_room` and `gist_answer` exist and refuse anonymous callers; the
  new columns are in place. It changed how Starter Gists are counted (on
  connect, both people) and added the 3-day invite expiry to the nightly job.
- **How the 18 minutes is enforced:** the server starts the clock on first
  join; when it runs out, either browser asks the server to close the room,
  and the server refuses until the time is genuinely up. One honest client
  is enough. Two modified clients could stay connected — closing that
  needs a server-side timer (LiveKit webhooks or a scheduled job), not built.
- **Extension:** either person can add 18 minutes, once — as the approved
  Both Clocks prototype says ("Either of you can extend it once"). 0019
  briefly made it mutual; 0020 corrects that.

---

## 3a. AI agents — Toastly Help and Answer Mirror (Prompts 15, 16)

**Migration 0018 (AI agents) is applied** (3 October 2026). It adds the
Toastly Help conversation, message and ticket tables, the 30-day retention
setting, and the agent rate-limit counter, and extends the nightly purge.
Checked with the public key: the support tables return no rows to a visitor;
`agent_requests` and `retention_config` refuse clients (42501); the server
reads `support_transcripts = 30` days.

| Variable | Notes |
|---|---|
| `ANTHROPIC_API_KEY` | Set in `.env.local`; **set it in Vercel too** (server only). Without it, Answer Mirror's button is hidden and Toastly Help offers a person instead of answering. Live-tested on 3 October 2026 with Claude Haiku. |
| `SUPPORT_INBOX` | Optional; defaults to `support@trytoastly.com`. Each hand-off emails it the reference and category — **only if Resend is configured** (section 4). Without Resend, hand-offs still land in `support_tickets`, and someone has to look. |

**Before launch:**
- **Ask Anthropic for zero data retention** on the API organisation (PRD §5.9:
  "request zero data retention where eligible"). Haiku is eligible.
- **Staff need a way to read hand-offs.** There is no staff screen: tickets
  are rows in `support_tickets`, readable in the Supabase table editor. The
  member is told "You'll get a reply by email", so someone must answer
  within the 30-day retention window, after which their words are cleared.
- **Run evals in Pidgin and Nigerian English** before relying on the
  assistant at volume. PRD §5.9 makes that the condition for staying
  Claude-only.

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
