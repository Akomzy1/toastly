# Toastly — final review (Prompts 0–9)

Phase 1 complete through Prompt 12. Work happens in `C:\dev\toastly`;
the OneDrive copy is stale.
`npm run verify` passes: typecheck, lint, 44 product-constraint checks, build.
The mobile audit passes: **26 route × width combinations, 0 failures** at
320×568 and 360×640 — see §5.

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

**Update, 26 September 2026:** the audit now covers 19 routes — the six
genotype states added — for 38 combinations: **36 pass; 2 fail**, both the
visibility screen's 11.5px "Default" tag, which is the prototype's own size
and awaits a decision (see the genotype section). The target check now
treats a checkbox or radio inside a label of at least 44×44px as meeting the
bar, because clicking the label activates it (HTML spec) and WCAG 2.5.8
measures the activating region. That removed exactly one finding — the
report form's "Also block" box — and nothing else.

**Re-run 18 September 2026 from `C:\dev\toastly`, outside OneDrive**, with
the Playwright audit in `scripts/mobile-audit.mjs` (`npm run audit:mobile`).
13 routes × 2 widths (320×568, 360×640) = **26 combinations, 0 failures**: no
horizontal overflow, every visible interactive element at least 44×44px, no
text under 12px, and the network settles on every page. Report in
`audit/MOBILE-AUDIT.md`; screenshots in `audit/mobile/` (gitignored,
regenerable).

The seven marketing pages are measured directly. The locked inbox and the
five newly designed surfaces sit behind auth, so they are measured through
`/audit/*` harness routes that render the real components with mock data.
Those routes 404 unless `AUDIT_HARNESS=1` is set on the server — verified in
the same run: without the flag, `GET /audit/city-picker` → 404.

**What the audit found, and what changed:**

- **A dead link on Stories.** "Share your story" pointed at `/stories/share`,
  which was never built. Next prefetches links, the prefetch of the 404 hung,
  and the page never reached network-idle — the first run reported it as a
  timeout. `stories.slim.html` points that button at Pricing, so it is now
  `/pricing`. If the product wants a real submission flow, that is a route to
  design, not a link to restore.
- **Three inline links measured 17px tall** — the announcement bar's "Learn
  more" (all seven pages), Home's "See how it works", and the fallback band's
  "Change your city". All three are links inside running text, which the
  prototypes draw exactly that way and WCAG 2.5.8 exempts. Rather than enlarge
  them visibly, each anchor gained vertical padding (13.5–14.5px): on a
  `display:inline` element that extends the hit area without touching the
  line box, and with no background it is invisible. The announcement link's
  hairline moved onto an inner span so it stays on the text rather than
  dropping with the padding. No layout changed; this is CSS-spec behaviour,
  not a visual approximation.
- **Nothing else.** Every surface rebuilt against the new prototypes passed
  first time on all three checks.

**Two limits on the result:**

- Chrome mobile emulation via Playwright, not a real low-end Android handset.
- Base state only. Controls that appear after interaction — the city picker's
  44px clear button, the locked row's upgrade panel — were not measured.

**Two fidelity notes from the screenshots — observations, not failures:**

- In the city picker at 320px, a region label wraps to a third line when the
  "Pool not open" chip is present ("DC ·" / "metro area"). The prototype says
  the row "holds its two lines"; whether its own render wraps there too is
  unverified.
- Stories' prototype carries a second CTA, "Already a member? Share yours"
  (→ Home), which the build never had. Recorded here, not added — outside
  this pass's scope.

---

## Public copy the build doesn't yet honour

- "Location can be blurred to a district" — no district control exists.
- "Photos load at low resolution until tapped" — no photo UI exists.
- "Pause, don't delete" — the column exists, no member-facing toggle.
- "Report from any screen" — match card and Gist room only.
- "Reviewed by a human within 24 hours" — no staff tooling.

Each needs building, or the copy softening.

## Not connected (launch blockers)

Smile ID production cut-over (integrated in sandbox — GO-LIVE §1a) · the
photo requirement (Prompt 14, parked; Phase 1 per PRD §9) · Paystack/Stripe
webhooks granting entitlements · moderation queue tooling · photo upload UI · image
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

**5. Audit re-run — now complete.** Constraint checks (44), typecheck and
lint all pass, and **the mobile audit has been run** from a build outside
OneDrive — 26 combinations, 0 failures. Details, findings and limits are in
§5 Mobile above. The five surfaces below were measured through the `/audit/*`
harness at both widths and passed every check first time.

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
side at 320px — and the audit has now **measured** them: pass on every check
at both widths, in Chrome mobile emulation.

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

## Genotype (PRD §5.2) — built against its prototypes, live

**Migration order matters.** `0013_relationship_history.sql` is the history
fix and has no Vault dependency — **applied 26 September 2026**, after the
deploy. `0014_genotype.sql` is genotype — **applied 26 September
2026**, after Vault passed a store-and-read round trip and pgcrypto an
encrypt-and-decrypt check. It checks for both, and for 0013, before creating
anything. Afterwards the `genotype_key` secret was confirmed present in Vault.
**Never delete or rotate it:** it is the only way to read stored genotypes. (The
genotype migration was 0013 in the earlier draft; it moved to 0014 so the
shared match definition could ship ahead of the Vault hold.)

**Built against `genotype-consent`, `-entry`, `-visibility`, `-display` and
`-settings` (`.slim.html`).** Consent in headed sections with "Agree"
disabled until ticked and "Not now" at equal weight; six same-weight values
with nothing preselected; four visibility options with a "Default" tag on
"Only me"; the display as one neutral fact chip ("Genotype: AS") with nothing
at all when not shared; a settings row with equal Edit and Delete, a bottom
sheet to confirm, and a "Genotype deleted" toast. Every value renders in the
same style — no colour-coding, which the prototype names as the most
important visual rule.

**How it's stored.** Two tables with RLS on and no policies; the value is
`pgp_sym_encrypt`ed with a key generated into Supabase Vault; every access
goes through a security-definer function; deletion removes the value and the
consent together with no tombstone. Reads are reciprocal — a value appears
only when both have chosen to share with each other — and "private", "not
entered" and "not shared back" are indistinguishable.

**Your decisions, applied.**

1. Consent copy approved and in place. **Backup retention could not be
   verified from here** — it depends on the Supabase plan: Free has no
   backups, Pro keeps 7 days, Team 14, Enterprise 30, and PITR 7/14/28. "7
   days" is right only on Pro without PITR; it is one constant,
   `GENOTYPE_BACKUP_RETENTION_DAYS`.
2. **Filter dropped.** CLAUDE.md and PRD.md now say "no filter of any kind";
   nothing was built.
3. Match definition stands — now one function, `are_matched()`, in 0013.
4. **Relationship history enforced** — see the next section.
5. **Consent version enforced in the database.** `record_genotype_consent()`
   accepts only the current wording; `set_genotype()` requires consent to it.
   Deleting is always allowed. A constraint check fails the build if the
   app's version and the database's drift.
6. Info link left empty; "What do genotypes mean?" renders once it's set.
7. Six harness routes put every genotype state into the mobile audit.

**Blocked: the privacy-policy link.** No `/privacy` page exists — the footer
and signup's "Privacy Policy" link already point to one that 404s — and no
data-rights contact address exists anywhere in the project. I would not put a
dead link inside a legal consent step. The line is written and renders the
moment `GENOTYPE_PRIVACY_URL` is set; its wording is new and needs your review.

**Decided: the "Default" tag is 12px**, rounded up from the visibility
prototype's 11.5px to meet the audit's 12px legibility floor. Recorded in
SKILL.md as a deliberate deviation. The mobile audit is now fully clean.

**Flagged, not decided:**
- The prototype places the chip on a match's profile card. Under the match
  definition, members in the daily six are rarely matched yet, so it will
  seldom appear there; it also renders on the Gist session and Couple Mode
  pages, where matched members actually meet.
- The chip's paper-pill style differs from the match card's dashed optional
  badges beside it. The display prototype draws every fact as a paper pill,
  which would mean restyling the card's other facts too — out of scope here.
- A shared "I don't know yet" has no designed chip state; it reads "Genotype:
  not known yet".
- Inline on the profile page there is no app-bar back chevron, so entry has
  a quiet "Cancel" and visibility a quiet "Back" — neither is in the
  prototype.
- A consent to an older wording still permits *display*; it blocks editing
  only. Say if an outdated consent should hide the value too.

## Relationship history — now enforced

`profiles` rows are readable by every verified member, so "Revealed when we
match" was enforced nowhere: anyone could read anyone's relationship history
through the API. `0013` moves `history`, `has_children` and the visibility
setting into `profile_history`, copies existing answers across, drops the
columns from `profiles`, and adds an RLS policy that applies the owner's
choice using the shared match definition. Two checks guard it: the table
must keep its policy, and no code may select history from `profiles` again.

No screen shows another member's history yet, so nothing visible changes —
the promise is now true at the database rather than by omission.

**Known residual, pre-existing since 0007:** a function used inside an RLS
policy must be callable by the member, and one that includes a block check
lets a determined member infer that they have been blocked. Photo reveal has
had the same property since 0007.

## Privacy policy and account lifecycle

**Published 2 October 2026.** Every placeholder is filled: effective date
2 October 2026; backups overwritten within 7 days (true on the project's Pro
plan, with point-in-time recovery off);
safety records 2 years; payment records 6 years; data requests answered
"within one month" (UK GDPR's calendar-month deadline, shorter than 30 days
in February). Section 9's countries were measured, not assumed: the database
host is in AWS eu-west-1 (Ireland) and functions run in Vercel's iad1
(Washington, D.C.). The publication gate stays in place: a placeholder added
later withdraws the page again.

**Update, later on 2 October 2026: production is now connected** — both
variables were set in Vercel and redeployed; `/feed` redirects signed-out
visitors to `/login`. The paragraph below records what was found first.

**Production was not connected to Supabase.** Found while measuring regions:
`www.trytoastly.com` has no `NEXT_PUBLIC_SUPABASE_URL` or
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, so every signed-in page shows "Supabase
isn't configured" and nobody can sign up on the live site. The migrations
have all run against the database; the deployed app simply isn't pointed at
it. Earlier notes calling genotype "live for members" meant the database
side only. Paystack and Stripe are also unconfigured in production (their
webhooks answer 503).

**Built so the policy is true** (migration `0015_account_lifecycle.sql`):

- **Age.** Signup asks for date of birth and refuses under-18s, in the form
  and in the database. The date lives in `profile_birthdates`, readable only
  by its owner. `profiles.date_of_birth` was readable by every verified member,
  so it was moved rather than used. The database copies the date out of the
  signup metadata and then removes it, so it doesn't ride in session tokens.
- **Deletion.** "Delete my account" on the profile page keeps only what
  section 8 says is kept, removes photos and message attachments from
  storage, then deletes the auth user. Every row cascades from there. Each step
  stops the next if it fails.
- **Retention.** Reports about a deleted account (no reporter identity, no
  free-text detail) are kept for 2 years and payment records for 6. If the
  account was removed for breaking the rules (an `actioned` report), its
  hashed phone number is blocked from verifying a new account for 2 years. A
  report alone never blocks anyone. Expired rows are purged nightly **only if
  pg_cron is enabled**.
- **Download.** "Download my data" returns a JSON file built as the member,
  so row-level security decides what's in it. A Starter member's file
  contains no locked messages. Safety-screening events are excluded by design
  and available on request.

**Text corrected to match the build and CLAUDE.md:** "Verified Real" is the
phone + liveness badge and NIN/BVN is the optional ID check; no reference
number is kept; no voice prompt answers; no per-question Gist record;
venues are searched near your city; the panic button's exact location goes
from the member's own phone, never through Toastly; usage is five product
events plus hosting logs; the safety team doesn't read messages; safety
screening uses no protected attribute but does compare payment, phone and
connection country; the strongest automatic step is re-verification, and no
machine removes an account; only necessary cookies; sign-in emails come from
Supabase; the Anthropic row is gone, since no AI feature exists.

**Still open:** a lawyer should review the policy, including the
UK-representative line; `/terms` still 404s; the consent step's privacy line
("Our privacy policy explains your rights over this information and how to
reach us about them.") did not bump the consent version — it adds a link, not
a term. Accounts created before 0015 have no date of birth on file.

## Smile ID verification — integrated, sandbox

Verified Real is Smile ID SmartSelfie (liveness only); the optional ID check
is Biometric KYC for Nigeria — NIN, Virtual NIN, BVN. Never Enhanced or Basic
KYC. Hosted v12 web flow; our own consent screen runs first, so Smile ID's
overlay shows only its camera.

- **Server only.** `/api/smile-id/session` mints a v3 token per attempt (five
  per product per day) and returns the overlay config. The API key never
  reaches the browser; a constraint check enforces it.
- **The callback is the only source of truth.** `/api/smile-id/callback`
  caps bodies at 1.5 MB, checks the HMAC signature (timing-safe, 10-minute
  freshness), matches the result to a pending session by an unguessable
  nonce, and takes the first result per session. Smile ID's signature covers
  the timestamp, not the body — so for the ID check the number Smile ID
  checked must also hash to the number the member entered.
- **Outcome only.** A session row holds the Smile job ID, status, reason code,
  pass/fail and timestamps. The callback never reads the record's name, date
  of birth, photo, phone, address or marital status (a check enforces the
  list). The ID number is never stored: a keyed HMAC is, key in Vault, so one
  ID verifies one account and a removed member's ID stays blocked for two
  years. Failed or abandoned sessions keep no hash.
- **Sentinel:** `liveness_result` / `id_check_result`, carrying status,
  reason and environment only.
- **A hole closed (0016):** members could previously write their own
  `stage`, `liveness_verified_at` and `id_confirmed_at` through the
  "own profile writable" policy, and could call `emit_trust_event` directly.
  Both now belong to the server.
- **Held:** no sentence about what Smile ID does with images ships until its
  retention terms are confirmed (`SMILE_TERMS_CONFIRMED`, pinned by a check).
- **Privacy policy** updated for the HMAC and for the name and email sent to
  Smile ID.
- **Screens:** the overview follows `verify-overview.slim.html`; the other
  five are built from it and are not design-approved (SKILL.md).

## Profiles read policy — fixed (0017)

The 0001 policy "verified members see other verified profiles" queried
`profiles` inside a policy on `profiles`. Postgres rejected every read of the
table by a member or visitor with `42P17` (infinite recursion). It surfaced on
the first real sign-up after production was connected: the verify page could
not read the member's stage and showed the phone step. 0017 moves the viewer
check into a security-definer function, `viewer_is_verified()`; visibility is
unchanged. A constraint check now fails if any policy reads its own table.

## Prompts 14–16 — photos (blocked), Toastly Help, Answer Mirror

**Prompt 14 is stopped at its own gate.** It requires the primary profile
photo to be matched against the member's enrolled liveness face, and says to
stop and report if Smile ID can't. It can't: SmartSelfie Authentication needs
a fresh selfie plus 6–8 liveness frames (`use_enrolled_image` only re-checks
the enrolled face against itself), and SmartSelfie Compare matches a *new*
selfie to a reference photo — REST and mobile SDKs only, not the hosted web
flow. Nothing from Prompt 14 is built; options are in the session report.
**Parked (3 October 2026)** pending Smile ID's answer to a written question
(photo-vs-enrolled-face matching, image-link lifetime, Compare in the web
flow). Resume from the build prompt when they reply; the photo prototypes
(`photos-upload`, `photos-main-check`) are already in the repo.

**Prompt 15 — Toastly Help** (`lib/concierge/`, `app/api/help/`,
`components/help/`), against `toastly-help` and `toastly-help-handoff`:
- Claude Haiku, stateless; turns stored in Supabase (0018), deleted after 30
  quiet days. Labelled as AI at the top of the panel every time.
- Five tools: three reads (verification status codes, plan, coin balance)
  run through the member's own session; a hand-off *proposal*; a safety
  escalation. The member's tap files the ticket, never the model. A
  constraint check pins the tool list and forbids writes.
- Safety: a keyword pre-check skips the model; the model can also escalate.
  Both show fixed safety copy (112, the safety kit) and offer a person.
- Live-tested: status-code explanation with the right action, a Pidgin
  reply, refund and appeal hand-offs, a ghost-writing refusal, the coin
  split, and a sextortion case the keyword check missed but the model
  escalated. Two wrong statements found in testing and fixed: it claimed to
  "see" a double charge, and called stake credit "date deposits".

**Prompt 16 — Answer Mirror** (`lib/answer-mirror.ts`, the edit-answer
screen at `/profile/prompts/[id]`), against `answer-mirror`:
- Structured output with one enum field; responses re-validated to exactly
  one known label; anything else rejected and logged by length only.
- Four labels, from the prototype (the build prompt's `reads_generic` folds
  into "Try being more specific" there).
- Live-tested on the prototype's four samples (all matched), a faith answer
  (judged like any other) and a prompt-injection attempt (ignored).
- The prompt editor didn't exist before; the prototype designs it, and it's
  built from that.

**Privacy policy** gains section 6a (How we use AI), the Anthropic row, the
AI legal-basis row, explicit consent for verification, and Toastly Help
retention. Held, because untrue today: the main-photo comparison and
AI safety-review summaries. The data export now includes verification
results and Toastly Help data.

## Gist voice calls — wired

The session page's dead "Join session" button is now a real call
(`components/gist/gist-call.tsx`, `app/api/gist/[id]/*`, 0019). Voice only:
live video is Phase 2. The server keeps the 18-minute clock; either person
can extend once; time-up closes the room for both via LiveKit's API.
Mic-denied, audio-blocked (tap to hear), reconnecting, leave and rejoin
are handled. A session proposed as video by an entitled member runs as
voice and says so. Tested end to end with two browsers (GO-LIVE §3b).

**Gist invites — built against eight new prototypes (3 October 2026).**
Before this, nobody could start a Gist: the feed's "Gist invite" saved a
reply row and no screen accepted anything. Now (0020, `components/gist/`):
reply to an answer (Starter / paid / at the limit), invite sent, the
three-group Gist list, received with Accept / Decline, after accepting
("Gist now?" when both are online, otherwise pick a time), the sender's
outcomes, and Both Clocks' window picker with the other person confirming.
Decisions applied: a Gist counts when the call connects, for both people
(PRD §7.1 — the prototype's "always free to accept" copy was changed to
match); invites close after 3 days; the seal line reads "Passed a live
selfie check" until the photo match ships; either person can extend once
(both-clocks.slim.html — replaces this morning's mutual extension).
"Online now" is a yes/no inside an accepted Gist; no last-seen time
leaves the database.

## Gist question deck — one card, both screens (0022)

The deck was a static list of all nine questions. Now one card at a time,
the same on both screens: either person taps Skip or Next after agreeing out
loud, the server moves the deck (0022, gist_deck_advance — two taps at once
move it one step), and the other phone updates over the call's data channel.
A reload or rejoin lands on the same card. Per question, only "answered" or
"skipped" is stored — never what was said (a constraint check holds it).
Toastly never asks the questions; the two people do.

First real two-account call (3 October 2026): connected and both heard each
other, after fixing a stray-whitespace LIVEKIT_API_SECRET in Vercel (now
trimmed in code) and a finished Gist blocking new invites (0021).

## Open: a Gist can count before its audio connects

The Starter cap counts a Gist from `started_at`, which gist_join sets when
the first person is issued a call token. If the browser then fails to reach
LiveKit (as on 3 October 2026, from a doubled `wss://` in LIVEKIT_URL), the
Gist still counts for both people. Fix when it matters: a LiveKit webhook
(participant_joined) that marks the call connected only once both are in
the room, and count from that instead.

## In-app navigation — built against its prototypes

The in-app shell had no navigation: a member who finished their profile had
nowhere to go. Now (`components/app/nav.tsx`, `screen-band.tsx`): a bottom
tab bar on phones — Today, Gists, Inbox, Profile — with the inbox's bare
unread count and a sand dot on Gists while an invite waits (cleared when
Gists is opened); the same four in the desktop header with Safety kit and
Sign out; a labelled Safety pill on every screen's band; Profile as the hub
leading to Coins (was Wallet — renamed in Prompt 17), Couple Mode, Safety
kit, Verification, Toastly Help and Your data. The profile form moved to
/profile/edit. The temporary "Go to today's six" button is gone.

## Prompt 17 — coin balance and dates

Replaces the future-stake-only credit. Built on branch
`prompt-17-coin-balance` and held until the legal check in PRD §11 (CBN
e-money licensing; UK consumer law on the no-refund terms) was confirmed by
the owner on 4 October 2026. Migration 0023 runs before the deploy: the new
pages call its functions.

- **Ledger (0023).** `coin_ledger` is append-only: a trigger refuses updates
  and deletes (except the account-deletion cascade), and members can't write
  it at all. Two buckets: purchased (stakeable) and promotional (spendable,
  never stakeable). A `txn_id` groups the rows of one outcome.
- **Dates.** Propose a time at an accepted spot (12 hours to 14 days ahead),
  stake 5–50 coins; the other person stakes to confirm. Check-in within 250 m
  of the venue, from 30 minutes before to 90 after; coordinates are passed to
  the check and never stored. Both attend: both stakes back. Neither: both
  back. One absent: provisional, a 24-hour window to say "I was there"
  (human review via `attendance_reviews` / `resolve_attendance_review`),
  then the attender gets their own stake back plus the absent member's.
  Toastly never keeps a coin. A scheduled job (`toastly-advance-dates`,
  every 10 minutes) and each page load move dates on.
- **Cancelling.** Free before the 12-hour cut-off. After it: ask to move it
  (both must ask; every coin returns) or cancel for safety (always free).
  There is no late non-safety cancel — a design choice, flagged.
- **Safety overrides everything.** A report filed by either person against
  the other cancels any open date with every stake returned; if the reporter
  was settled as a no-show in the last 7 days, their stake is restored,
  funded by reversing the award the reported member received. Six test
  scenarios assert the reporter never loses coins and Toastly neither keeps
  nor mints any.
- **Coins pay subscriptions.** `subscribe_with_coins` takes Premium (35
  coins) or Premium Plus (70) — one coin counts as ₦100 — and refuses every
  Diaspora plan in the database. Gift coins are spent first. If the balance
  is short, nothing is spent and the shortfall is shown; paying the rest by
  Paystack isn't wired.
- **Closed a pre-existing hole.** 0005's `settle_commitment` was callable by
  anonymous clients and could mint coins (confirmed by probe against
  production). 0023 drops it.
- **Tests.** `node --test scripts/sql-test/coin-balance.test.mjs`: 15 tests
  against every migration in a throwaway Postgres (PGlite), never the real
  database. Disabling safety, letting coins pay a Diaspora plan, removing the
  award row, or disabling the append-only guard each fails the matching test.
  Four new constraint checks (banned words, the subscription allow-list, no
  withdrawal/payout/send, append-only) each catch a planted violation.
- **Copy changed.** Pricing: "Coins are never refunded or paid out as cash"
  (was refundable to the original payment method); "bank transfer" became
  "bank"; the deposit line gained "in good time". Toastly Help's coin facts
  and its balance tool were rewritten to the new rules.

## Live payments — Paystack and Stripe (0024)

Decided 4 October 2026 (hybrid Naira billing; hosted checkout plus a "Your
plan" page; coins held while the card pays the rest).

- **The server sets every amount.** `price_list` holds every price;
  `payment_open` takes a sku and a mode, never an amount (a constraint check
  holds both the function signature and the checkout code). Settlement
  rejects an amount or currency that doesn't match what was opened.
- **Once only.** The webhook and the return page (which verifies with the
  provider server-to-server, never trusting the URL) both settle; the second
  is a no-op, and the receipt goes once.
- **Naira.** Card: a Paystack plan that renews monthly (plans created by the
  app on first use) and is stopped from the plan page. Bank or USSD: a
  30-day pass that extends from the current end, with an email three days
  before it ends (Vercel Cron, `CRON_SECRET`). Coins part-pay Premium or
  Premium Plus: held in the ledger at checkout, released if the payment
  fails or after an hour; a payment arriving after release re-takes the
  coins, or — if they've been spent — is credited as coins, never a plan
  nobody paid for and never cash.
- **Dollars.** Stripe Checkout subscriptions for Diaspora and Diaspora Plus
  (card, Apple Pay), and the dollar coin pack. Coins never pay a dollar plan.
- **Renewals.** Each paid period is its own time-limited grant (period end
  plus a day's grace), so stopping a renewal simply lets the paid period run
  out; a failed renewal shows as "didn't go through" and lapses at the end.
- **Pricing integrity.** A Naira payment on a card issued outside Nigeria,
  or a Naira checkout opened from outside Nigeria (Vercel's request country,
  two letters, never the IP), queues one manual review per signal and emits
  one Sentinel event per mismatch. Nothing blocks the payment or the member.
- **Live-key guard.** `sk_live_` keys are honoured only on the production
  deployment; anywhere else they read as not configured. `.env.local` holds
  live keys today, so local testing can't charge a real card.
- **Tests.** 12 PGlite tests for 0024 (packs, passes, part-payment and its
  release and late arrival, renewals, subscriptions and the hidden token,
  pricing signals, no payouts); 10 event-mapping tests with a fake database;
  4 signature and live-key tests. Four new constraint checks, each catching
  a planted violation.
- **Not done.** No refund flow in the app (a person refunds in the
  provider's dashboard); no plan-switch proration (stop the renewal, then
  subscribe to the other plan); profile country decides which track the
  plan page shows, and the server accepts either (signals catch arbitrage).

## Review queue, restrictions, track rules (0025)

Decided 4 October 2026 (the staff screen is a launch blocker).

- **Naira plans from abroad.** Any Naira plan — card, bank or USSD pass,
  part-coins, or coins in full — bought by a member whose profile country
  isn't Nigeria raises a `profile_country_mismatch` pricing review, from
  database triggers on `payments` and `entitlements`. Nothing is blocked.
- **Diaspora pools.** Correction to an earlier claim in this session:
  0012 already limits diaspora-to-diaspora matching to Diaspora plans. What
  was missing was telling the member — the pool choice now says it's a
  Diaspora-plan feature, and the feed shows its own notice (distinct from
  the city-not-open notice, which it takes precedence over).
- **Women's offer.** Diaspora Plus abroad, Premium Plus at home. Signup
  doesn't ask for a country, so it switches when the profile country
  changes, keeping the same end date.
- **The queue.** `review_items`, fed by triggers from every source, one item
  per source record, oldest first. Staff are accounts in `staff_members`;
  every staff function checks that in the database; members get a 404.
  Evidence per kind is the facts the rules allow (signals and country codes;
  report reason, the reporter's own note and whether the pair had a Gist or
  thread; check-in times; Smile ID result codes) — never message content,
  Gist audio, selfies or ID numbers. Actions: clear, ask to switch plan
  (pricing), request re-verification, restrict, lift restriction, remove,
  and attended / no-show for disputes. Every decision is written first to
  the append-only `staff_audit_log`.
- **Restrict:** no new six, out of everyone's six, and no new messages,
  replies, Gist invites, date proposals or stakes (database triggers).
  Safety kit, report, block, Help, verification and data stay. **Re-verify:**
  out of new feeds until a fresh selfie passes (the ID ring is kept; the
  Smile ID session route allows the selfie again). **Remove:** retention
  records and blocked phone/ID hashes as on account deletion, then the
  profile is deleted; the sign-in is banned in Auth first and deleted when
  retention ends. Members are told by email and in-app notice, with a
  reason category only.
- **Sentinel.** The queue has a Sentinel kind, but nothing creates one in
  Phase 1 (CLAUDE.md) — a constraint check holds it.
- **Tests.** 11 PGlite tests; six new constraint checks and a reworked
  blind-report check, each catching a planted violation.
- **Not done.** No photo-match items (Prompt 14 parked); no phone-origin
  signal (deferred); staff can't approve a borderline Smile ID check (Smile
  ID's own review decides it; staff can ask for a retake).

## Environment

**OneDrive breaks the build.** It renames Next's output (`BUILD_ID` →
`BUILD_ID-Oludayo`), so `next start` fails with `UNKNOWN: unknown error,
read` and retrying never helps. **The repo now lives at `C:\dev\toastly`**,
outside OneDrive; the build there produces a clean `BUILD_ID` and `next start`
is ready in two seconds. The OneDrive copy is stale from `800d235` onward and
should not be edited. README documents this.
