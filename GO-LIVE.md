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

## 0b. Staff review queue — LAUNCH BLOCKER (migration 0025)

One queue for every human-review item at `/staff`: pricing signals, reports
(married-user and blind reports marked), attendance disputes, borderline
selfie and ID checks; photo matches arrive with Prompt 14 and Sentinel flags
in Phase 2. Also in 0025: a Naira plan bought from a profile abroad (any
route, coins included) raises a pricing review, and the women's launch
offer is Diaspora Plus for members abroad.

1. ~~Run `supabase/migrations/0025_review_queue.sql`.~~ **Applied 4 October
   2026**; the owner is staff. Checked from outside: staff functions and
   tables refuse anonymous callers.
2. Make yourself staff (and anyone else who reviews), in the SQL editor:

   ```sql
   insert into staff_members (profile_id)
   select id from auth.users where email = 'you@example.com';
   ```

   Remove someone with `delete from staff_members where profile_id = …`.
3. Make sure **hello@trytoastly.com** is read by a person: the removal email
   tells members to reply to it, since a removed member can't use Toastly
   Help.

Restrict and remove act on the member's account; remove also bans their
sign-in in Supabase Auth (needs `SUPABASE_SERVICE_ROLE_KEY`, already set).
Every decision is in `staff_audit_log`, which nothing can edit.

---

## 0h. Religion and denomination (migration 0030) — NOT APPLIED, branch `faith-denomination`

Decided 6 October 2026 (PRD §5.2.3). Built on `faith-denomination`, stacked on
`port-live-profile` (0030 follows 0029). **Not merged; not applied anywhere
until staging exists** — then staging first, as in §0g, after 0029.

- Adds `denomination` (enum) and the 30-character "Other" texts for religion
  and denomination to `profiles`; one visibility (`religion_visibility`)
  covers both. A trigger enforces the lists, denomination only with
  Christian or Muslim, changing religion clearing denomination, and consent
  first (`consent_kind` gains `faith_display`).
- **Stored religion values are not changed.** Religion was free text before;
  the list is checked only when a member changes it. Count what's stored
  before release (read-only):

  ```sql
  select religion, religion_visibility, count(*) from profiles
   where religion is not null group by 1, 2 order by 3 desc;
  ```
- New guards: no trust event or AriyaPlanner brief can carry religion or
  denomination (`faith_meta_is_clean`).
- Consents gain `withdrawn_at`: removing faith withdraws its consent (kept as
  evidence, never deleted).

**0031 — self-applied filters** (PRD §5.2.4), same branch, after 0030:
`member_filters` (religion and tribe, each with "include people who don't
say"), owner-only; Premium, Premium Plus, Diaspora and Diaspora Plus can set
them. `build_daily_feed` applies the member's own filters to their own six
and tops a short six up to six if they widen them the same day — never more
than six a day. The pricing page now lists the filters that exist: religion
and tribe.

**0032 — who can open a full profile** (PRD §5.2.4, decided 7 October 2026),
branch `full-profile-access`, stacked on `faith-denomination`, after 0031.
**Not merged; not applied anywhere.** Replaces 0029's "any live member reads
any live profile" with `can_open_profile`: your current six; anyone who
replied to your answers or invited you to a Gist; matches and Gist partners,
both ways, until a block. The profile row, prompt answers and photos all
follow it. A Starter member can no longer list message threads (the count is
unchanged), and a text reply they can't read doesn't open its sender. What
members will notice: a Gist invite they sent that was declined or expired
shows "A member" instead of the name. Also in 0032, for the full-profile
screen (/members/[id]): `age_for` (an age, never the date of birth, only on
a profile the caller can open), `i_am_matched_with`, and relationship
history now needs the access rule too, with "on match" counting only a
match the viewer can see.

**0033 — fields for the viewer** (decided 7 October 2026), same branch,
after 0032. **Not applied anywhere; staging first, and nothing until
`.env.staging.local` is filled.** `profile_for(owner)` is the only read of
another member: it returns just the fields the owner shows this viewer.
Drops every policy that let a member select another member's row in
`profiles`, `profile_history` or `profile_photos` (each member keeps their
own). Genotype "all matches" now uses the viewer's match. **0033 and its
code must ship together**: after 0033, any code still reading another
member's `profiles` row directly gets nothing back (names fall back to
"this member"). Spot suggestions read both members' city and country with
the service key, after both said continue, to place the venue.

**0034 — threat reports first** (decided 7 October 2026), `release-1`,
after 0033. Reports filed as "Threatening or pressuring me"
(`threats_or_coercion`, from any surface, blind reports included) are marked
urgent and listed first in the review queue; waiting ones are moved up when
it runs. Report labels changed only — database values are unchanged.

## 0g. release-1 — the one release: staging, then production (0027 … 0034)

Decided 7 October 2026: **`release-1` is the only thing that goes to staging,
then production.** It combines, in dependency order, `country-age-two-way`
(0027), `port-live-profile` (0028, 0029), `faith-denomination` (0030, 0031)
and `full-profile-access` (0032, 0033), plus 0034 (threat reports first).
Migrations 0027 … 0034 run as one clean sequence; code and migrations ship
in the same release. `privacy-policy-update` is left out — it waits on the
UK representative. The older branches are superseded by `release-1`.

Decided 6 October 2026: **staging gates every merge.** A branch is merged
only after its migrations have run cleanly on the staging Supabase project
(`toastly-staging`), the app has run against it on a Vercel preview, and
the migrations have been applied to production. Production only gets
migrations that ran cleanly on staging. **Nothing touches production
without the owner's go-ahead.**

**Staging** (values in `.env.staging.local`, git-ignored; the `[P]` names
also go in Vercel → Environment Variables → **Preview**):

1. In the staging dashboard, enable the `pg_cron` extension. Vault needs
   nothing — 0014 and 0016 create their keys on first run.
2. Apply `supabase/migrations/0001` … `0034` in order to staging.
3. Deploy `release-1` as a Vercel preview pointed at staging, with Smile ID
   **sandbox** keys and `SMILE_ID_CALLBACK_URL` = the preview's
   `/api/smile-id/callback`. If previews are behind Vercel login, the
   callback can't arrive: turn protection off for Preview or use a bypass
   secret.
4. `SMILE_ENV_FILE=.env.staging.local npm run smile:sandbox -- selfie.jpg`.
5. On the preview, as a sandbox tester: sign up → phone → where you live →
   four photos → onboarding selfie (identity "clear") → the callback makes
   the profile live. Then, as staff, "Request re-verification" on that
   member → the member's re-check selfie → the callback clears the request.
   Then the optional ID check in the page (NIN or BVN, "clear" identity) →
   both halves clear → the second ring. Then replace the main photo →
   Authentication + Compare → matched. Callback URL carries the bypass
   secret (`?x-vercel-protection-bypass=…`).

   **What staging can't prove.** Sandbox verdicts follow the test identity's
   name, not the face: measured 6 October 2026, Authentication against an
   id that was **never enrolled also comes back clear**. So no sandbox run —
   script or preview — shows that the onboarding selfie registered the face.
   That needs one of: Smile ID confirming in writing that production
   Authentication fails for an unenrolled `user_id`; or, on production after
   release, the owner's own account — onboard, then a re-check (expect
   clear), and an Authentication against a random id (expect a refusal).

**What production holds** (read-only count, 7 October 2026): **one account —
the owner's** (staff; profile country GB; Verified Real reached through the
sandbox selfie on 2 October). No other members, photos, Gists, messages,
reports or dates; there is no waitlist anywhere in the code or the database.
One real payment: a **live Paystack charge of ₦1,000 on 4 October** for 10
coins, by the owner — its 10 purchased coins are in the ledger, and the
automatic pricing review it raised (a naira purchase from a GB profile) is
open in the queue. Production holds nothing but the owner's own test use,
but that payment and its coins are real money and the backup keeps them.
0029's reset will move the owner's account back to "phone verified": the
owner re-does the onboarding selfie after release.

### Rehearsal on staging — before any production step

Decided 7 October 2026. Needs `.env.staging.local` filled (every value is
still the placeholder written on 6 October), including `SUPABASE_DB_URL`,
plus a way to make a **staged production deployment** against staging: a
second Vercel project (`toastly-staging`, same repo) whose Production
environment holds the staging values, with "Auto-assign custom production
domains" off, and `VERCEL_TOKEN` for the CLI.

1. **Production's state.** Apply `0001` … `0026` to staging. Deploy `main`
   to the staging Vercel project and promote it. `node
   scripts/db/staging-seed.mjs --before` seeds four testers (one staff), a
   Gist invite and a report; sign-ins go to `backups/staging-testers.json`.
   Check sign-in works on `main`.
2. **Cutover step 1:** apply 0027, then 0028. Check `main` still works.
3. **Cutover step 2:** `vercel deploy --prod --skip-domain` of `release-1`
   on the staging project (staged, not promoted).
4. **Backup and restore check, then cutover step 3:**
   `node scripts/db/backup.mjs --env .env.staging.local --label staging`,
   `node scripts/db/restore-check.mjs --dump backups/staging-<time>.dump`
   (must print RESTORE CHECK PASSED), then apply 0029 … 0034 in order.
5. **Cutover step 4:** `vercel promote <staged url>`. Then
   `node scripts/db/staging-seed.mjs --after` (0029 resets the testers'
   Verified Real, as it will the owner's; this makes them live with four
   photos each).
6. **Check, as the testers:** sign in; today's six; a full profile (from the
   six; fields per visibility; Report and Block in ⋯); a Gist invite (the
   invitee opens the inviter's profile and accepts); the staff console
   (queue loads, the seeded report opens, a "Threatening or pressuring me"
   report lands first).
7. **Rollback rehearsal:** `node scripts/db/rollback.mjs --env
   .env.staging.local --dump backups/staging-<time>.dump` (dry run), then
   `--yes` (must print ROLLBACK PASSED), promote `main` again, check
   sign-in on `main`. Then re-apply 0029 … 0034 and promote `release-1` again
   to leave staging at the release.

Record here, for each step: start and end time, how long, and anything
that broke.

| Step | Started | Took | Result / what broke |
|---|---|---|---|
| 1. production's state on staging | | | |
| 2. 0027, 0028 | | | |
| 3. staged deploy of release-1 | | | |
| 4. backup + restore check | | | |
| 4. 0029 … 0034 | | | |
| 5. promote | | | |
| 6. checks | | | |
| 7. rollback + main | | | |

**Already proven locally** (`node scripts/db/rehearse-local.mjs`, PostgreSQL
17, 7 October 2026): a 0026-state database with seeded members → backup
(3.5 s) → restore check passed (63 tables, every row) → 0027 … 0034 (3.2 s)
→ rollback (7.1 s): public's schema identical to the backup — privileges
included — every table's rows identical, storage policies and the signup
trigger back → 0027 … 0034 applied cleanly again. It found and fixed three
things a plain `pg_restore` gets wrong: objects created after the backup
block the restore; a foreign key added after the backup blocks it; and
**every restored function comes back granted to anon and authenticated**
(Supabase's default privileges), re-opening functions the migrations had
closed — the rollback switches those defaults off for the restore and puts
them back. What local can't show — Supabase's roles (its `postgres` is not a
superuser), extensions, the app over HTTP — is what the staging rehearsal is
for.

### Production — each step only on the owner's go-ahead

1. Apply 0027, then 0028 (additive; today's `main` keeps working on them).
2. Build `release-1` as a production deployment **without promoting it**
   (staged production deploy; `main` stays live).
3. **Backup first, then 0029 … 0034.** 0029 retires the hosted selfie, 0030
   requires consent to change religion, 0032/0033 stop members reading
   other members' rows — all break today's `main` — while `release-1` needs
   them. Immediately before applying them:
   - put production's connection string in `.env.production.local`
     (git-ignored), as `SUPABASE_DB_URL` (Supabase → Connect → Session
     pooler);
   - `node scripts/db/backup.mjs --env .env.production.local --label production`
     — pg_dump of schema + data (public, auth, storage, cron) to
     `backups/` (git-ignored), with row counts, public's schema as text,
     and a manifest with the dump's sha256;
   - `node scripts/db/restore-check.mjs --dump backups/production-<time>.dump`
     — restores it into a throwaway local database and compares every
     table's rows. **Go on only if it prints RESTORE CHECK PASSED.**
   - then apply 0029, 0030, 0031, 0032, 0033, 0034 in order.
4. **Promote `release-1` at once**, then merge it into `main`. The window is
   the seconds between the last migration and the promotion.
5. Retire `country-age-two-way`, `port-live-profile`, `faith-denomination`,
   `full-profile-access` and the old `live-profile-and-prompt-14`.

### Rollback after step 3 — restore from the backup

Not by redeploying `main` alone: `main`'s code can't run on 0029 … 0034's
schema. The database goes back to the backup, and `main`'s deployment comes
back with it.

1. `node scripts/db/rollback.mjs --env .env.production.local --dump backups/production-<time>.dump`
   — a dry run: lists what it will set aside, drop and recreate. Changes
   nothing.
2. Same command with `--yes`. In **one transaction** (any error and nothing
   has changed): switches this role's default privileges off; sets aside the
   storage.objects policies and the auth.users signup trigger (they depend
   on public); drops the objects and foreign keys 0027 … 0034 added; restores
   public from the backup, clean — every table, function, type, policy,
   grant and row as at the backup; recreates the storage policies and the
   trigger from the backup; puts the default privileges back. Then it checks
   public's schema and every table's row count against the backup and
   prints **ROLLBACK PASSED** or **FAILED**.
3. In Vercel, promote the previous production deployment (`main`).
4. Check sign-in, today's six and `/staff` on `main`.

Anything written between the backup and the rollback is lost. auth, storage
files, cron and vault are not touched by 0027 … 0034 and are not restored.
Manual equivalent, if the script can't run: `pg_restore -l` the dump; drop
the storage.objects policies and the `on_auth_user_created` trigger; drop
public's foreign keys and every public object not in the listing; switch
off `alter default privileges … in schema public` grants for `postgres`;
`pg_restore --clean --if-exists -n public` then `pg_restore -L` the POLICY
storage objects and TRIGGER auth users entries; restore the default
privileges; compare `pg_dump --schema-only -n public` with the backup's
`.public-schema.sql`.
---

## 0f. Photos, the face match, no live profile no access (migration 0029) — NOT APPLIED

Run after 0028, **on staging first**, and only with a working Smile ID face
match end to end (the user's rule for these screens). **Never apply 0029 to
production before the code with the photo screens is live** (decided
6 October 2026): it ships in the same release, straight after the deploy —
see §0g for the order. In the minutes between, the new code fails closed:
guarded pages show "finish your profile" and nothing is exposed.

**What it does to everyone already on Toastly — plan for this.** From the
moment 0029 is applied, a profile is visible and can use the feed, Gists,
messages and dates only when it is LIVE: phone confirmed, Verified Real, not
restricted, at least four photos, and a main photo that matched a live
selfie. No member has photos yet (there was no upload screen), so **every
existing member becomes "not live"** and sees "Almost there — finish your
profile" until they add four photos and take one selfie. Couple Mode, coins,
the safety kit, Your data, settings and attendance on an arranged date stay
open. Consider telling members before it ships.

- **Smile ID** (`SMILE_ID_PARTNER_ID`, `SMILE_ID_API_KEY`, `SMILE_ID_ENV`,
  `SMILE_ID_CALLBACK_URL`): the onboarding selfie and the replace-main-photo
  check now use Smile ID's REST API (SmartSelfie Compare and Authentication)
  with a selfie captured in the page by Smile ID's own camera component
  (`@smileid/web-sdk`, pinned 12.1.0). Results come back on the one signed
  callback. Sandbox test: `npm run smile:sandbox -- selfie.jpg` (13/13 on
  6 October 2026: token; Compare accepted, enrolling, clear; Authentication
  against the enrolled face clear; a refusal's log line scrubbed; the ID
  check — Biometric KYC + Authentication of one capture — accepted for NIN
  and BVN; signature check). The sandbox clears a never-enrolled id too, so
  it can't prove enrolment works — §0g. Without keys: production refuses,
  development records a stand-in pass.
- **The hosted flow is retired entirely** (decided 6 October 2026): its v12
  web integration can't name the member's id, so it can neither register a
  face nor check against one. Verified Real comes only from the in-page
  onboarding selfie, which ENROLS the face under the member id; a re-check a
  reviewer asks for is an in-page Authentication against that face.
- **The ID check is in the page too.** One capture goes to Biometric KYC
  (`/v3/biometric_kyc`: the number on the official record, the selfie
  against its photo) AND to Authentication (the same selfie against the face
  registered at onboarding). `record_id_check` grants the second ring only
  when both are clear; a borderline half goes to a person as an ID review.
- **Three failed matches in 24 hours go to a person.** The third refused
  re-check, or the third refused ID-check selfie, becomes a review case
  (`route_repeated_mismatch`) instead of allowing another try; the member
  sees "a person is taking a look", never why. A reviewer's "clear" passes
  it; anything else (including "Request re-verification") lets them retry.
- **Virtual NIN is hidden** until Smile ID enables it for our account (it
  refused it in the sandbox: "ID type not enabled for this partner"). Turn
  it on with `SMILE_ID_VNIN_ENABLED=true` in Vercel, then redeploy — no code
  change.
- **Consent wording updated** (screens 1, 3 and the new screen 4, Quick
  re-check): versions bumped, so every member sees and agrees to the new
  wording at their next check.
- **0029 resets everyone Verified Real only through the hosted flow** (no
  passed onboarding selfie) back to "phone confirmed", and clears their
  liveness date. They take the onboarding selfie on their next visit — the
  same step as the four photos every existing member needs anyway. **Their
  hosted ID check is cleared too**: they redo it in the page after the new
  selfie. Their ID's fingerprint stays bound to them meanwhile, so no other
  account can use that ID. A late hosted result is closed and grants
  nothing. No Sentinel "drift" event is raised for the reset. **Consider
  telling these members first.**
  Count them on production before the release (read-only):

  ```sql
  select stage, count(*) from profiles
   where stage in ('verified_real', 'id_confirmed') group by stage;
  ```
- Server actions accept up to 4 MB (`next.config.mjs`): the selfie and its
  liveness frames pass through one, on to Smile ID, unstored.
- **Every image enters storage through the server, stripped** (decided
  6 October 2026): photos are compressed on the phone, then sent to a
  server action that removes EXIF and GPS location, XMP, ICC, thumbnails,
  comments and anything after the image (`lib/strip-image.ts`) before
  storing them. 0029 drops members' own upload policies on both image
  buckets (`profile-photos`, `message-attachments`), and another member can
  read only a registered photo file. Message images have no upload screen
  yet; when one is built it must upload through the server the same way (a
  constraint check enforces it).
- Files a reviewer's decision replaces are queued in `storage_deletions` and
  removed on the next Smile ID callback.
- Deleting an account now ends Couple Mode (the partner is un-paused — before,
  they stayed hidden) and returns every stake on a date not yet settled.

## 0e. Ported fixes and the AriyaPlanner brief rule (migration 0028) — NOT APPLIED

Run after 0027, on staging first. Apply it **before** deploying the code:
the phone step calls `phone_in_use` and `record_phone_verified`.

- **Phone binding needs `SUPABASE_SERVICE_ROLE_KEY`** server-side: the number
  is now bound by the server. Before 0028 no number was ever bound (the
  member's own write was refused), so existing members have no row in
  `phone_identities`; they are bound the next time they confirm a number.
- `build_daily_feed` refuses any id but the caller's; `gist_mutual_continue`
  is now true for members when both said yes (it was always false); text
  replies work (replies had no insert policy).
## 0d. Where you live, two-way "open to abroad", age range (migration 0027) — NOT APPLIED

1. Run `supabase/migrations/0027_country_age_two_way.sql` in the SQL editor
   **before** deploying the code that reads it — the app layout and `/verify`
   read `country_confirmed_at`, so the new code against an old database fails.
2. Every existing member is unconfirmed afterwards and is asked once, on
   their next visit (a sheet; not over the safety kit or Your data).
3. Country can then only change through `confirm_country` / `change_country`
   (members' direct writes are refused). A move between Nigeria and abroad
   stops a renewing plan at its period end through the provider; if the
   provider can't be reached, the subscription keeps `track_changed_at` set —
   check `select * from subscriptions where track_changed_at is not null and status = 'active'`.
4. The default age range lives in `match_config` (4 below, 5 above, 9 wide,
   18 to 70+); change it there, not in code.

## 0c. Diaspora rules, USD coins, console cases (migration 0026)

1. ~~Run `supabase/migrations/0026_diaspora_rules_console.sql`.~~ **Applied
   4 October 2026.** Checked from outside: four USD packs live, the $6 pack
   retired, every member numbered, the open case numbered with its timeline,
   and the console functions refuse anonymous callers.
2. Optional: give a senior reviewer their role —
   `update staff_members set role = 'Senior reviewer' where profile_id = …`.
3. Existing members are all recorded as living in Nigeria (no screen set a
   country until now). Members abroad should open Edit profile → "Where do
   you live?" — worth a line in the next email to members.

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
