# Toastly — final review (Prompts 0–9)

Build complete through Prompt 9. `main` at `b476074`, working tree clean.
`npm run verify` passes: typecheck, lint, 44 product-constraint checks, build.
Every route audits at **0 failures, 0 warnings at 360px and 320px**, no
horizontal overflow.

---

## Decisions needed from you

1. **The locked inbox paywalls safety.** A Starter member being harassed sees
   "47 new messages" but cannot see who sent them, so cannot report or block
   without paying. Both CLAUDE.md rules are individually correct; together
   they gate safety. Options:
   - **(a)** "Block everyone in my locked inbox" — the server blocks the
     senders without ever revealing them. Catch: blocks are permanent, so
     innocent senders are caught too. *(My lean, with the permanence stated
     plainly on screen.)*
   - **(b)** Reveal sender identity, not content, for reporting only. Breaks
     the bare-count rule.
   - **(c)** Leave as is.
2. **Photo-reveal default.** PRD §5.1 names the control but sets no default.
   I used `verified_members`, which preserves current behaviour. A more
   private default is a product decision.
3. **PRD §5.4.** Your PRD update never arrived — §5.4 still read "5–7 min"
   while CLAUDE.md and build-prompts.md both cited it for 18. I wrote that
   section myself to your stated ruling. **Please confirm the wording.**
4. **Emergency numbers** (112, 767 Lagos, 999, 911) are marked
   VERIFY BEFORE LAUNCH in `lib/safety.ts`. A wrong number on a safety screen
   is worse than none.
5. **The real domain — settled.** `NEXT_PUBLIC_SITE_URL` is now
   `https://trytoastly.com`. Every canonical URL, OG image and sitemap entry is
   built from it.

---

## 1. Deviations from the prototype

| What | Why |
|---|---|
| Hero video compressed 3.0 MB → 637 KB | PRD §5.8 data-light; video kept, weight adapted. Reduced-motion and Save-Data get the poster |
| Diaspora time-zone block uses a stand-in photo | The prototype references `assets/img/diaspora-timezone.jpeg`, which is not in its own bundle |
| Footer/header/announcement targets padded to 44px | Prototype sizing failed the mobile bar |
| Two alt texts rewritten | The prototype's read "Placeholder…" — scaffolding, not copy |
| Scroll reveal starts visible | The original could leave sections permanently invisible if JS never ran |
| Image protection doesn't download until tapped | Stronger than a blur, and cheaper on a metered connection |
| Date-spot card omits the photo and the distance panel | `date_spots` stores no image and the Places lookup doesn't request one; profiles carry no coordinates or neighbourhood, so "4.2 km · Yaba" cannot be computed. Omitted rather than invented |
| Three prototype colours replaced with `green-550` | `#00332C` and `#0A4A42` (fallback band) and `#003F37` (city picker pool line) are not steps in the approved 23-step ramp. Using the nearest approved token rather than widening the palette |
| Both-clocks window picker not rendered | The prototype is a full "Propose a Gist" screen; no propose-a-time surface exists yet, so only the clock block has a home. Built so the rest drops in unchanged |

## 2. UI invented (not design-approved)

Auth screens and shell · in-app header · verification flow · profile editor ·
match card · Gist list and room · inbox list (the locked row itself follows
the prototype) · wallet · Couple Mode · safety kit.

Components: `Notice`, `Stepper`, `SafetyActions`, `ReportForm`,
`BlockButton`, `BlurredImage`, `ShareDate`, `SafetySettings`. The panic
button uses deep rose (`error`) as a button ground — a variant the design
system does not have.

All recorded in SKILL.md's gap list for the design pipeline.

## 3. PRD ↔ prototype conflicts and resolutions

| Conflict | Where | Resolution |
|---|---|---|
| Couple Mode sold as paid | Home (fixed upstream), Pricing, Features | Corrected — free on every tier |
| Charity destination for no-show coins | 5 pages, 8 occurrences | Removed; stake-credit ruling (PRD §5.5) |
| "5 free sessions" vs 2 | How It Works | Already fixed in the re-export |
| Incognito, filters, priority support, missing chat + incognito rows | Pricing | Corrected to PRD §7.1 |
| "No boosts" vs a PRD selling boosts | Pricing | Flagged → you ruled no boosts (§7.2) |
| 18 vs 5–7 minute Gist | Prototype vs build prompts | Flagged → you ruled 18 |

## 4. Entitlement checks near protected features

Verification, the 6-a-day feed, Couple Mode and the safety kit are each
guarded by a constraint check that fails if a tier read appears. The wallet
reads tier only to display the plan name.

One real accidental gate found — see Decision 1.

## 5. Mobile

17 routes at 360px and 320px: 0 failures, 0 warnings, no overflow.
Fixed: footer links (19px tall), dismiss button (24×24), header wordmark
(34px), mobile CTA (40px), auth wordmark (32px), "Terms" (41px wide).

**Two limits on that result:**

- App screens were measured only in their "Supabase isn't configured" state.
  The real feed, inbox and safety kit need a Supabase project with data.
- Chrome mobile emulation, not a real low-end Android handset.

---

## Public copy the build doesn't yet honour

- "Location can be blurred to a district" — no district control exists.
- "Photos load at low resolution until tapped" — no photo UI exists.
- "Pause, don't delete" — the column exists, no member-facing toggle.
- "Report from any screen" — match card and Gist room only.
- "Reviewed by a human within 24 hours" — no staff tooling.

Each needs building, or the copy softening.

## Not connected (launch blockers)

Liveness and NIN/BVN vendor · LiveKit calling · Paystack/Stripe webhooks
granting entitlements · moderation queue tooling · photo upload UI · image
message UI.

## Trust Sentinel — Phase 1 (instrumentation only)

`0009_trust_events.sql` is applied (18 September 2026) — all nine migrations
are live on the project.

Events are emitted by database triggers, not application code, so a signal is
captured whichever client wrote the row and no call site can forget one.
Captured: Gist invitations sent/declined/cancelled/completed, Couple Mode
requests, date requests, reports by category, verification re-checks, and
stake forfeits recorded per party. Payment-geography, phone-origin and IP
mismatches mirror straight off `integrity_reviews` — the same signals and the
same queue as pricing integrity, not a second pipeline.

There is no score, no threshold, no reviewer table, no restriction and no
agent. RLS is on with **no policies**: nothing may read these rows, including
the member they describe, since a readable trust log teaches a scammer which
behaviours count.

Two boundaries are structural rather than conventional — a CHECK rejects any
event metadata carrying message content, transcripts or audio, and any
carrying a protected attribute. A future caller cannot quietly start
attaching them.

**Three caveats for whoever builds Phase 2:**

- `gist_sessions` does not record *who* cancelled. The event attributes it to
  the proposer and marks `actor: unrecorded` — it must not be read as certain.
- `date_commitments` gained a nullable `created_by`. Nothing populates it yet,
  so events carry `actor: assumed` and attribute to `member_a`. Populate it
  when the date-request UI is built, or escalation velocity lands on the
  wrong person half the time.
- Two signals in §5.1.1 are **not** instrumented, listed with reasons in
  `lib/trust-events.ts`: profile-vs-Gist inconsistency (needs per-question
  outcomes the deck doesn't store, and its obvious inputs are protected
  attributes) and the off-platform-contact affordance (not built).

Three checks were added: no AI that writes/suggests/coaches messages;
trust events cannot carry content or protected attributes; and trust
instrumentation stays events-only. The last will need lifting in Phase 2 —
that is intended.

## Prompt 10 — diaspora matching pools

`0010_diaspora_pools.sql` is applied (18 September 2026) — ten migrations live.

Most of this existed already: `match_pool` shipped in 0001 and the feed
filtered on it in 0002. What was missing was the part that makes it true.

**A real bug, now fixed.** The old clause matched `p.country_code =
v_country`, which opened diaspora-to-diaspora **everywhere at once, by
country** — the exact thing PRD §5.6 says must not happen at launch ("not
switched on globally"). Two members in different UK cities were already
matching each other.

Added: a `diaspora_cities` table (22 US/UK/Canada metros, all seeded
**closed**), a structured `profiles.diaspora_city` for the flag to key off,
per-city gating in `build_daily_feed` requiring **both** members' cities to be
open, an automatic fall back to the back-home pool, and a `pool_changed`
Sentinel event. A city opens by flipping one boolean — no deploy.

The fallback is never silent: `pool_fallback_city()` drives a notice on the
feed naming the city and saying the count hasn't changed. The 6/day limit is
untouched, and a check now fails if anything makes the feed limit depend on
pool.

**Two things I did not decide for you:**

1. **Prompt 10 names the field values `back_home` / `my_diaspora` / `either`;
   the shipped enum is `back_home` / `diaspora` / `both`.** Same meaning, and
   `both` matches the Diaspora page's own copy ("or both at once"), so I kept
   the shipped names rather than churn an enum three migrations deep. Say if
   you want them renamed.
2. **"Diaspora tier entitlement gates access to both pools"** (Prompt 10) is
   ambiguous and touches a paywall boundary. Read strictly, a free Starter in
   London gets no feed at all — which collides with the 6-a-day-every-tier
   rule and with "never silently show an empty feed". I implemented pool
   choice as **free to everyone**, with the tier affecting ordering only.
   Confirm, or tell me to gate it.

Note for whoever runs it: the file contains `alter type trust_event_kind add
value 'pool_changed'`. Postgres allows this inside a transaction but the new
value can't be *used* in the same one — the trigger only reads it at run time,
so the script is safe as a single run. If your editor ever objects, run that
one line on its own.

## Prompt 11 — date spots and time-zone-aware scheduling

`0011_date_spots_and_scheduling.sql` is applied (18 September 2026) — eleven
migrations live.

**Date spots.** A lookup, not a directory (PRD §5.5 defers the curated one).
Suggestions appear only after a mutual "continue" — enforced by a trigger, not
by the action that writes them, because a suggestion appearing early would
disclose the other person's private answer. Public venues only: the category
enum has no bar, lounge, club or casino in it, and the provider mapping is an
allowlist, so a new Google type for a drinking venue can't arrive by default.
Accept, swap or ignore; nothing books, reminds or messages anyone.

**Scheduling.** `lib/scheduling.ts` computes windows inside 08:00–22:00 local
on **both** sides and returns null when a day has none, so the UI can offer
another day rather than showing an empty list. The Gist list now shows both
clocks when the pair is split across zones. The 18-minute box is untouched.

**Four limits, stated rather than papered over:**

1. **No midpoint.** PRD §5.5 asks for spots "roughly mid-point … given the
   users' stated neighbourhoods". There is no neighbourhood field and no
   coordinates — `profiles.city` is free text. The lookup anchors on a city:
   the shared one, or the Nigeria-based member's for a back-home pair, and the
   UI says which side it chose. True midpoint needs a field that doesn't exist.
2. **`GOOGLE_PLACES_API_KEY` is unset**, so the feature degrades to a notice
   telling the pair to agree somewhere public themselves. Google Cloud console
   → Credentials, enable "Places API (New)", restrict the key to it. Server-
   side only — a `NEXT_PUBLIC_` maps key is billable by anyone who finds it,
   and a check now fails if one appears.
3. **Time zone is a fixed list, not detected.** Reading the browser's zone
   during render disagrees with the server's and breaks hydration. Blank is
   allowed and shows one clock.
4. **No reminders.** Deliberate: a reminder is an agent speaking to a member
   about their private arrangement, which is the line CLAUDE.md draws.

Still not built from Prompt 11's text: biasing Lagos suggestions by
neighbourhood reachability (same missing field as 1).

## Prompt 12 — domain, icons, housekeeping

No migration. Four of the five items were already done; this pass verified
them rather than changing them.

**1. Domain.** `toastly.ng` survives in exactly one place: Prompt 12's own
instruction text in `build-prompts.md`. Zero occurrences in the frozen
prototype HTML, so **there is nothing to re-export from Claude Design** —
the prototypes never carried the domain.

**2. App icons — landed and wired.** The Stake artwork is in `public/icons/`
(`favicon.svg`, `favicon-32`, `icon-192`, `icon-512`, `icon-maskable-512`),
referenced from both `manifest.webmanifest` and `layout.tsx`. Installability
checks out statically: name, short name, start URL, standalone display,
192/512 icons, a maskable variant, theme colour, and a registered service
worker. The live Lighthouse run still needs a build served from outside
OneDrive.

**3. Stubbed connections.** Written up separately as `GO-LIVE.md`, since it's
a list someone fills in rather than reads. Two findings worth repeating here:
**nothing reads `RESEND_API_KEY`** — the app sends no email at all — and
**nothing reads the PostHog keys** — no analytics are collected anywhere.
Both were listed in `.env.example` as stack choices, which reads as "wired but
unconfigured" unless you check.

**4. WhatsApp residue.** None. The only hit is Prompt 12's own instruction.
`components/safety/share-date.tsx` still uses `wa.me` deep links, which is the
device's own share sheet and not the Business API — kept deliberately.

**5. Audit re-run — partial, and here's what's missing.** Constraint checks
(44), typecheck and lint all pass.
**The mobile audit was not re-run**: it needs a built app served from outside
OneDrive. Five surfaces built since Prompt 9 have therefore **never been
measured at 320/360px**:

- the diaspora city picker and time-zone select (profile)
- the pool-fallback notice (feed)
- both-clocks display (Gist list)
- the date-spot suggestions card (Gist session)

**These five are no longer invented UI.** Prototypes were exported for all of
them afterwards and each has been rebuilt against its own file —
`city-picker`, `time-zone`, `feed-fallback-notice`, `both-clocks` and
`date-spot` (all `.slim.html`). Behaviour is unchanged: the fallback still
shows six, the clocks still refuse a 3am slot, the date-spot card still
defaults to cafés and books nothing.

The prototypes *specify* the targets — 52px city rows, 48px inputs and
buttons, 44px dismiss and clear controls, two clock columns holding side by
side at 320px — and the build matches those numbers. **Specified is not
measured:** the audit still has to run before any of it is confirmed on a real
narrow viewport.

## Integrations wired, and four decisions implemented

`0012_blind_safety_pools_contacts.sql` is applied (18 September 2026) — twelve
migrations live.

**Resend, PostHog, SMS.** Email carries receipts, the re-verification notice
and an emergency-contact security notice. Analytics carries five funnel
events and nothing else. SMS routes +234 to Termii and everything else to
Twilio, for emergency-contact confirmation and panic alerts only.

**One correction to the brief.** Account verification codes are *already*
sent — by Supabase Auth, which mints the phone OTP and the email
confirmation. Adding Resend verification codes would have meant two competing
code systems for one account, so I didn't build it. What Resend carries is
what is genuinely ours.

**(a) Blind report and block.** `blind_report_locked()` and
`blind_block_locked()` take no member id and return nothing — a client that
could name or count senders has been told what the locked inbox exists to
withhold. Reviewers get ordinary `reports` rows with full identity. The block
form states before the button that blocking is permanent and may catch someone
harmless.

**(b) Pools follow the paid tier.** Free members abroad match back home; the
paid Diaspora tiers unlock diaspora-to-diaspora, still subject to the per-city
opening. The six is untouched on every tier, and `pool_restriction()` lets the
UI say why a choice isn't taking effect.

**(c) Photos visible by default.** No schema change was needed — 0007 already
defaulted to `verified_members`. The onboarding step offers the "only my
matches" alternative; the strictest "only after a Gist" stays in the safety
kit. The flagged assumption in 0007 is now ratified.

**(d) Emergency contact, confirmed by SMS.** **This reverses 0007's explicit
posture**, which stored no trusted-contact number at all. Stated plainly in
the migration. The code is stored as a peppered hash and expires; the member
gets an out-of-band email when the contact changes, because an attacker with a
live session could otherwise redirect panic alerts silently. Without an SMS
provider the flow refuses rather than storing a number it cannot reach.

**Inert by design:** the receipt and the `first_deposit`/`upgrade` events
resolve a charge by provider reference, and nothing writes `payments` rows
yet. Whoever builds the payment loop gets both by inserting the row first.

## No live profile, no access (PRD §5.1.2, part of Prompt 14)

`0013_live_profile_guard.sql` — **committed, deliberately NOT applied**: it
ships in the same release as Prompt 14's photo upload and face match, so
members can actually go live (decided 2026-10-05; GO-LIVE.md). Live = phone confirmed + Verified Real + four photos + a
main photo face-matched to the selfie. Computed by `profile_is_live()`, never
stored, so dropping below four photos or deleting the main photo hides the
profile and pauses access on the next query, and restoring them un-pauses it.

**Where it is enforced.** In the database, so a direct API call is refused
exactly like the app: row-level security on profiles, prompt answers, photos
(rows and files), the daily feed, replies, Gist sessions and outcomes,
threads, messages, date spots and date commitments; `assert_live()` in
`build_daily_feed()` and `unread_count()`; triggers that stop a Gist moving
forward or a date being created unless both people are live. In the app,
`requireLiveProfile()` on every feed, Gist, inbox and date page and server
action, so the member is told why instead of seeing an empty screen.

**Left open, deliberately:** verification, own profile and settings, own
photos, the safety kit, report, block and blind report. **Decided
2026-10-05:** Couple Mode also stays open while access is paused for profile
reasons — it closes only if the account is restricted or removed by review —
and so does the coin balance, with coins and plans still purchasable. Stakes
and dates stay blocked. There is no review-restriction state yet, so "closes
on restriction" has nothing to hook into until the review queue exists. The
`/wallet` route is now `/coins`, and "wallet" is banned from UI copy and
paths by a constraint check.

**Replacing the main photo.** `nominate_main_photo()` makes the new photo
pending; the matched one stays live and the pending one is visible only to
its owner. `record_main_photo_match()` (service role only) swaps it in on a
match, keeps it pending on a borderline result (human review, never
auto-rejection) and drops it on a mismatch. Smile ID is **not** wired — that
and the `verification_drift` Sentinel event are the rest of Prompt 14.

**Three holes closed, because each made the guard bypassable:**
- members could write their own `stage` (self-award Verified Real) — a trigger
  now refuses client writes to verification and live-state columns, and phone
  confirmation goes through `mark_phone_verified()`, which trusts Supabase
  Auth's OTP record. The dev-only liveness and ID stand-ins now write with the
  service-role client;
- `build_daily_feed()` built and returned any member's feed for any id;
- `settle_commitment()` was executable by any member, for any commitment —
  i.e. anyone could credit themselves coins.

**Fixed in passing:** `replies` had no insert policy, so every reply failed.
The new policy carries the live guard and only accepts answers the sender was
shown today.

**Two more bugs, fixed in `0014` with minimum-disclosure functions:**
- *One phone, one account never worked.* The duplicate check read a table
  members can't read, and the binding insert was silently refused, so no
  number was ever bound. Now `phone_in_use()` answers yes/no only, and
  `record_phone_verified()` (service role) binds the hash the server computes
  from the number Supabase Auth confirmed — never one the client supplies. An
  account already bound to another number is refused rather than rebound;
  changing number is a support action.
- *"Did both say continue?" was always false for members*, so date spots and
  the "after a Gist" photo reveal never opened. `gist_mutual_continue()` is
  now security definer and still returns one boolean: true only when both
  said yes. "Not answered" and "said no" give the same answer, outsiders and
  members who aren't live always get false.

`npm run test:db` (part of `npm run verify`) applies every migration to a
throwaway PostgreSQL and runs these rules as members — see
`scripts/db-test/`.

**Invented UI — flagged.** `components/app/profile-not-live.tsx`, the "not live
yet" / "access paused" screen, has no prototype. It reuses the approved
wording "goes live" and "Four photos to go live" and existing primitives only.
It says photo upload isn't available because **the photo-upload screens don't
exist yet** — until they do, no member can go live outside test data.

**Tested** against real PostgreSQL with each call made as the member (role
`authenticated` + JWT claims, as Supabase's API does), covering never-live,
dropped-to-three and main-removed members, live controls, restore, and the
replacement flow. Six new constraint checks, each proven to fail against a
planted violation.

## Docs synced to the 2026-10-05 drops

PRD.md, CLAUDE.md and the privacy policy adopted the latest drops whole after
proving every removed line was replaced by a ratified ruling. build-prompts.md
took the drop as its base but **kept the repo's prototype references** — the
drop was on a stale base and would have reverted nine lines to the old
`Toastly_*.html` export names, "ten" files and a 22-step ramp with the false
"fails at build time" claim. No SKILL.md drop existed; SKILL.md is
unchanged. All `(N).md` copies are deleted.

**Where the new docs now contradict code that already exists** — each needs
building, not a doc change:
- *Women abroad get Diaspora Plus, not Premium Plus.* `handle_new_user()`
  (0001) grants Premium Plus to every woman.
- *Coin balance replaces the locked stake credit* (Prompt 17). 0005's
  `stake_credit`, `withdrawable_balance()` and the coins screen's "refundable
  to your original payment method … can't be cashed out" copy all describe
  the superseded model; the "stake credits can never be withdrawable"
  constraint check enforces it.
- *No agent or integration may read profile fields to build an AriyaPlanner
  brief.* 0006's `couple_briefs` copies tribes, languages and home states
  from profiles at consent time.
- *Diaspora pools:* "Open to people living abroad" (default on) for
  Nigeria-based members, and an upgrade line rather than the fallback notice
  for non-Diaspora-plan members abroad — neither exists.
- *A staff screen for the single human-review queue is a launch blocker*
  (PRD §9). Not built.
- *Genotype* (PRD §5.2) — a full set of handling rules; not built.

**Design exports not yet in `design/prototype/`:** six zips at the repo
root hold ~45 newer screens — Gist invite flows, an app nav shell, coins and
date check-in screens, the review queue, diaspora pools, genotype — plus
seven loose exports (photos-upload, photos-main-check, verify-overview,
toastly-help, toastly-help-handoff, answer-mirror, genotype consent) and
updated Home / How It Works / Features. None are slimmed or wired yet.

## Environment

**OneDrive breaks the build.** It renames Next's output (`BUILD_ID` →
`BUILD_ID-Oludayo`), so `next start` fails with `UNKNOWN: unknown error,
read` and retrying never helps. The Prompt 9 mobile audit only ran once the
app was built outside OneDrive. Move the repo somewhere unsynced, or exclude
`.next` and `node_modules` from sync. README documents this.
