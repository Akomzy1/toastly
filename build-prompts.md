# Toastly — Claude Code Build Prompt Sequence

Run these **in order**, one per session or one per major work block. **Phase 1 is Prompts 0–17** — 0–9 build the core, 10–12 close audit gaps, 13 (issued in chat) wires email, analytics and SMS, 14–16 add the photo requirement and the two launch AI agents, and 17 adds the coin balance and date attendance. Phase 2 items are listed at the end and are not to be started before launch. Each assumes `PRD.md`, `CLAUDE.md`, and `SKILL.md` are in the repo root, and the approved Claude Design prototype export is at `/design/prototype/`.

**Before running any of these:** confirm the sixteen prototype files are in `/design/prototype/`:

`design-system.slim.html` (read first — tokens), `home.slim.html`, `features.slim.html`, `how-it-works.slim.html`, `pricing.slim.html`, `safety.slim.html`, `diaspora.slim.html`, `stories.slim.html`, `locked-inbox.slim.html` (in-app, not marketing), `brand-the-stake.slim.html`, `brand-assets.slim.html` (icons, vector masters, social exports).

Five further **in-app** surfaces, exported after Prompts 10–12 were built: `city-picker.slim.html`, `time-zone.slim.html`, `feed-fallback-notice.slim.html`, `both-clocks.slim.html`, `date-spot.slim.html`. Each has its own layout rules, like the locked inbox — they are not marketing pages.

If they aren't there, stop — several of these prompts are meaningless without them, and Claude Code will otherwise invent UI that was never approved.

**Standing rule for every prompt below:** where the prototype and `PRD.md` disagree, **`PRD.md` wins on content, the prototype wins on layout and visuals** — and the discrepancy must be reported, never silently resolved. Three known conflicts are listed in `SKILL.md`.

---

## PROMPT 0 — Repo bootstrap & ground rules

Read `CLAUDE.md`, `SKILL.md`, and `PRD.md` in the repo root before doing anything else, and confirm back to me in a short summary: the stack, the hard constraint about the prototype, and the five or six product constraints you must not implement around (no swipe, voice-first Gist, Starter chat asymmetry, Couple Mode free on all tiers, fixed 6-a-day feed, no chat-content scanning).

Then scaffold the project: Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, Supabase client setup, PWA manifest and service worker configured for installability. Do not build any feature UI yet — scaffold only.

**Prototype alignment:** open `/design/prototype/design-system.slim.html` before writing any Tailwind config and encode its tokens in `tailwind.config.ts` as named values. Do not use Tailwind defaults or invent a palette. The tokens are:

- Deep green ground `#001F1B`; forest `#002A24`; teal `#00695C` (deeper `#005449`, lighter `#4C968C`, tint `#CCE1DE`)
- Amber action `#FFB300` (hover `#FFC94C`, deep `#CC8F00`, tint `#FFEFCC`, shade `#4C3500`)
- Sand `#EBD9AE`; paper `#F6F2EA` (tints `#FFF7E5`, `#E5F0EE`)
- Ink `#050309`, `#1E1C21`; muted `#504E52`, `#828184`, `#D9D9DA`, `#F2F2F2`; white `#FFFFFF`
- Accents `#9B1348` (deep rose), `#2F8F5B` (green)
- Type: **Aleo** serif for headings/wordmark (fallback Georgia), **Inter** sans for body/UI

**The design-system file defines the full ramp (23 steps — the 23rd, `green-550 #00453C`, was ratified after the export) — all of it is approved.** Encode the whole ramp, and **replace `theme.colors` rather than extending it**, so no unapproved colour is reachable — note that `@apply` of one is a build error, but an unapproved class in markup silently emits nothing rather than failing. **Do not build a dark theme:** deep green is a ground, not a mode; leave any `.dark` values provisional and add no `dark:` variants.

Also read `/design/prototype/brand-the-stake.slim.html` — the adopted brand mark, with fixed geometry and assigned palette roles. Treat it as binding alongside the design system.

Extract the type scale, spacing rhythm and border-radius conventions from the same file. If anything is ambiguous, ask rather than guessing.

---

## PROMPT 1 — Design system & shared components

Using the tokens established in Prompt 0 and the approved prototype at `/design/prototype/` as the binding reference, build the shared component library: buttons (all variants present in the prototype), cards, badges (including the recurring "Verified Real" trust mark), navigation, footer, form inputs, the pricing table component, and the FAQ/accordion component.

**Prototype alignment is a hard requirement here** — these components must match the prototype's visual and structural design, not a generic shadcn/ui default restyled. Where shadcn/ui provides a base primitive, adapt it to match the prototype rather than accepting its default appearance. If the prototype shows a component pattern that shadcn/ui doesn't cover, build it from scratch to match.

Flag explicitly (do not silently invent) any component the prototype doesn't cover but that later pages will clearly need.

---

## PROMPT 2 — Marketing site pages

Build the public marketing pages, each against its own prototype file: Home (`home.slim.html`), Features (`features.slim.html`), How It Works (`how-it-works.slim.html`), Pricing (`pricing.slim.html`), Safety & Trust (`safety.slim.html`), Diaspora (`diaspora.slim.html`), Stories (`stories.slim.html`). Open the file for the page you are building — do not infer one page's layout from another's.

**Alignment requirements — check each against the prototype before considering the page done:**
- Section order, heading hierarchy, and layout rhythm must match the prototype. Do not substitute a repeating icon-card grid for the prototype's varied section layouts — that generic pattern was explicitly designed against.
- The Home page's **"Journey" section** (Match → Gist → Couple Mode → AriyaPlanner handoff) has its own distinct visual treatment in the prototype. Preserve it — do not collapse it into a standard feature list.
- The **Pricing page** must keep the Naira and Diaspora-USD tracks visually separate, exactly as in the prototype, and the tier contents must match `PRD.md` §7.1 (not any older mockup): Starter = 2 Gist/month, receive-locked chat, Couple Mode included; Premium = unlimited Gist; Premium Plus = live video + incognito; Diaspora ($15) = unlimited voice Gist; Diaspora Plus ($30) = + live video.
- If the prototype's pricing content contradicts `PRD.md` §7.1, **PRD.md wins on content, prototype wins on layout/visuals** — flag the discrepancy to me rather than silently picking one.

Implement SEO fundamentals as you go: semantic heading hierarchy, per-page title/meta description, descriptive alt text, clean URLs. Add schema.org markup (Organization, SoftwareApplication, FAQPage) and an `llms.txt` at the root.

---

## PROMPT 3 — Auth, profiles & verification

Build Supabase auth, the user profile model, and the tiered verification flow: phone → selfie liveness → optional NIN/BVN for the "Verified Real" badge.

**Constraints from `CLAUDE.md` that apply directly here:**
- Verification is **never paywalled** — no tier check anywhere in this flow.
- Profile fields for religion, tribe/ethnicity, language, and relationship history (single/divorced/widowed/single-parent + optional "has children") are **optional, display-only, and must never silently exclude a user from being shown to others**. They may power opt-in filters the user applies to their own search only.
- The relationship-history field defaults to **private/revealed-on-match**, not public on the feed card.
- The intent selector (casual → marriage-minded) is collected but **never blocks signup**.

Match the prototype's form styling (`design-system.slim.html` for inputs, `safety.slim.html` for verification content) and flag any screen the prototype doesn't cover.

- **Optional verified profession and education fields** (`PRD.md` §5.2.2) follow the same rules: optional, display-only, user-controlled visibility, never a gate. Do not down-rank or hide users who leave them blank. Any "verified profession" badge is a quiet secondary mark subordinate to "Verified Real" — it unlocks nothing and must not use prestige iconography.
- **Community standard (`PRD.md` §5.2.1):** "user is married" must be a **first-class report category**. Never build or imply a marital-status verification check — it is enforced by report-and-remove only.

---

## PROMPT 4 — Matching & the daily feed

Build the matching system: prompt-based profiles and the curated daily feed of **exactly 6 matches per day, identical across every tier**.

**Hard constraints:**
- **No swipe mechanic.** Do not build swipe-card gesture components or swipe iconography.
- The 6/day count is **fixed and not upgradeable** — paid tiers may get better placement/ordering within the same 6, never a larger count. Do not build an entitlement check that increases match volume by tier.
- Users respond by replying to a **specific prompt answer**, not by a generic like/hi. Note: on Starter this outbound reply is limited to proposing a Gist (see Prompt 5), since Starter cannot send free text.
- Unused daily matches expire — no saved deck, no backlog, no infinite scroll.

---

## PROMPT 5 — Gist sessions (voice-first, video premium)

Build the Gist compatibility-session feature on a single WebRTC provider (LiveKit, Daily, or Agora — pick one, use it consistently).

**Requirements:**
- **Voice is the default and free-tier path.** Live video is entitled to Premium Plus and Diaspora Plus only — enforce at the entitlement/access-control layer, not just UI.
- Mutual opt-in before any mic/camera activates. **18-minute time-box, extendable once** (PRD §5.4 — an earlier 5–7 minute figure in this document was wrong and is superseded; 18 is shipped in public copy on Home, How It Works and Features). Shared structured question deck, escalating playful → real. Private double-opt-in "continue?" at the end.
- **Never route through a carrier number or expose either party's real phone number** — VoIP only.
- Auto-degrade video to audio on weak connections rather than freezing.
- Screenshot/screen-record blocking on the video tier (best effort).
- **Entitlement caps:** Starter = 2 voice sessions/month. Premium, Premium Plus, Diaspora, Diaspora Plus = unlimited voice. Do not implement any older cap numbers found in earlier drafts or mockups.
- Capture structured session outcomes in a shape reusable later for the AriyaPlanner brief (see Prompt 8) — but do not build the integration itself.

---

## PROMPT 6 — Messaging & the locked inbox

Build messaging with the **asymmetric Starter entitlement** — this is easy to get wrong, so implement it exactly as specified:

- Starter users **cannot send** free text messages.
- Starter users **can receive** messages from any match. The message is stored, and its existence is surfaced to the recipient as a **bare count only — "1 new message" / "3 new messages"**. No sender name, no avatar, no initials, no text preview or snippet, not even blurred.
- Message **content must be locked at the API layer, not just hidden in the UI** — a Starter user's client must never receive the message body or sender identity in a response payload.
- Tapping a locked message opens an honest upgrade prompt ("New message waiting — Premium unlocks your inbox") with a one-tap path to upgrade. Never render it as an error, a broken state, or an unexplained blank. No countdown timers or fake scarcity.
- Paid tiers: unlimited send and receive.
- **Never scan, parse, or flag free-text message content for phone numbers or contact info.** This is a hard privacy boundary — do not add content moderation for this purpose.

Build this against `/design/prototype/locked-inbox.slim.html` — note it is an **in-app** screen, not a marketing page, so its layout rules differ from the seven marketing pages.

---

## PROMPT 7 — Coin economy, payments & entitlements

Build the payment and entitlement layer:
- **Paystack** for NGN (cards/Verve, bank transfer, USSD, mobile money) and coin pack purchases (₦500–₦5,000).
- **Stripe** for USD diaspora subscriptions ($15 / $30) via card and Apple Pay.
- Subscription tiers per `PRD.md` §7.1. Entitlement checks must be centralised — one source of truth for "what can this user do," not scattered per-feature conditionals.
- **Women's launch offer:** automatic 30-day **Premium Plus** entitlement granted at signup for users identifying as women, no payment method required. Implement as a real entitlement grant, not a coupon the user must apply. Do not downgrade it to base Premium.
- **Coin-deposit date commitment:** both parties stake a small deposit on a confirmed date; no-show forfeits. All user-facing copy must be warm ("showing up for each other"), never punitive ("forfeit", "penalty").
- **Pricing-integrity signals** (payment-method geography, phone origin, light IP check at signup and payment only) feed a **manual review queue**. Do not build auto-suspension, auto-ban, or auto-lockout on these signals.

---

## PROMPT 8 — Couple Mode & AriyaPlanner handoff data model

Build Couple Mode: an opt-in shared space for mutually-confirmed exclusive couples — milestones, saved dates, shared "our story" timeline.

**Critical entitlement rule:** Couple Mode and the AriyaPlanner handoff are **free and available on every tier, including Starter**. Do not gate this behind any subscription. If you find a mockup or older document showing it as a Premium Plus feature, that is a known corrected error (`PRD.md` §7.1) — do not follow it.

Capture, in a structured and exportable shape: tribes, languages, home states, location (Nigeria vs diaspora city), aesthetic signals, and budget cues. Milestone triggers include first date logged, "official", anniversary, and **engagement** (the primary handoff trigger).

**Do not build the live AriyaPlanner integration** — it is explicitly out of MVP scope. Build the data model and the handoff *contract* only. Ask before writing any cross-product integration code.

Couple data is shared only with mutual consent, encrypted, and never used to gate matching.

---

## PROMPT 9 — Safety, moderation & final review

Build the safety kit — photo-reveal control, share-your-date/panic, unsolicited-image blur, report/block — and confirm **none of it is paywalled at any tier**, including via a shared component that's gated for unrelated reasons.

Then run a final review pass against `SKILL.md` and report:
1. Any page or component where the implementation deviates from `/design/prototype/`, and why.
2. Any UI you invented because the prototype didn't cover it.
3. Any place where `PRD.md` and the prototype conflicted and how you resolved it.
4. Any entitlement check that could accidentally gate verification, safety, Couple Mode, or the 6-a-day feed.
5. Mobile/responsive verification: confirm every page works at narrow viewports on low-end Android, with adequate touch targets and no layout breakage — the majority of traffic is mobile.

---

## PROMPT 10 — Diaspora matching pools (Phase 1 gap)

Prompts 0–9 sold a diaspora tier with no matching logic behind it. Build it now, against `PRD.md` §5.6 and the Diaspora page (`diaspora.slim.html`) for the user-facing copy.

**Two pools, not one:**
- **"Back home"** — a diaspora user matched into the Nigeria-based pool. This inherits domestic liquidity and launches first.
- **Diaspora-to-diaspora** — a diaspora user matched within their own diaspora city or across diaspora cities. This needs its own liquidity per city and is **feature-flagged per city**, off by default at launch.

**Requirements:**
- Add a **location-intent** field to the profile: `back_home`, `my_diaspora`, or `either`. Diaspora users must set it; Nigeria-based users see no such choice. It is filterable and changeable; it is never a signup gate.
- The six-a-day feed respects the pool. A `back_home` user's six come from Nigeria-based verified profiles; a `my_diaspora` user's six come from the diaspora pool *only if their city's flag is on* — if the flag is off, fall back to `back_home` and tell the user plainly ("Matching within [city] isn't open yet — showing you back-home matches for now"). Never silently show an empty feed.
- Diaspora city is a structured field (not free text) so the per-city flag can key off it. Seed the list with US, UK, Canada metros; make it extensible.
- Per-city flags live in config/DB, not code, so a city can be opened without a deploy.
- The **6/day count does not change** by pool — same scarcity rule.
- Diaspora tier entitlement (Prompt 7) gates access to both pools; a Starter user in the UK is still a Starter user and cannot match at all beyond Starter rules.
- Emit Sentinel events for pool selection changes (a user flipping pools rapidly is a weak but real signal — PRD §5.1.1).

**Prototype alignment:** the Diaspora page names both pools explicitly. Any in-app copy about pools must match that framing; do not invent a third pool or collapse the two into one.

---

## PROMPT 11 — Date-spot suggestion + time-zone-aware Gist scheduling (Phase 1 gap)

Two features promised in the PRD and, for the second, already in public copy on the Diaspora page — neither built.

**Date-spot suggestion (`PRD.md` §5.5):**
- After a Gist ends with a mutual "continue", offer both users a **date-spot suggestion**: a maps-API lookup of nearby public venues (cafés, restaurants — never bars/lounges as the default category). Use one provider (Google Places or equivalent); do not build a curated venue database — that is explicitly deferred.
- Suggest spots roughly **mid-point** between the two users where both are in the same city; for back-home matches where one party is abroad, suggest near the Nigeria-based user and note it.
- Surface it as a suggestion the users can accept, swap, or ignore — never an automatic booking. This is a soft safety signal (public venue) and pairs with the coin-deposit flow: accept a spot → propose a time → both stake.
- Lagos-specific: bias toward areas reachable for both given the users' stated neighbourhoods; do not attempt live traffic estimation in MVP.
- Copy stays warm, per the deposit rule — "showing up for each other", never "forfeit".

**Time-zone-aware Gist scheduling:**
- Every user has a resolved time zone (from device, confirmable in settings). For a cross-time-zone pair, the scheduling UI shows **both local times side by side** and proposes windows that fall within reasonable waking hours for both (roughly 08:00–22:00 local each side).
- The 18-minute box and extend-once rule are unchanged.
- If no mutual waking-hours window exists on a given day, say so and offer the next day — never offer a 3am slot silently.
- This is a scheduling aid, not an agent: it proposes windows, it does not book, remind on its own behalf, or message anyone (CLAUDE.md's infrastructure-not-intimacy rule).

---

## PROMPT 12 — Domain, icons and housekeeping pass (Phase 1 gap)

Three things drifted during the build. Fix them in one pass and report each.

**1. Domain is now `trytoastly.com`, not `toastly.ng`.** Find and replace across the codebase: `next.config`, environment templates, `site.webmanifest`, canonical/OG tags, `llms.txt`, schema.org markup, email footers and transactional templates (Resend), sitemap, robots. Do **not** edit the prototype HTML files — they are frozen design reference — but do report every place `toastly.ng` still appears in them so the copy can be re-exported from Claude Design. Brand name stays "Toastly"; only the domain changes.

**2. App icons.** Check `public/icons/`. If The Stake artwork (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, favicon) has landed, wire it into the manifest and verify PWA installability passes. If it has not landed, say so plainly and leave the placeholder — do not generate an icon (SKILL.md).

**3. Stubbed connections.** Produce a single checklist of every integration that is currently stubbed or reading from an empty env var — LiveKit, liveness provider, Paystack, Stripe, Resend, Supabase production, Google Places (from Prompt 11), PostHog — with the exact env var names each needs. This is the go-live credentials list; it should be complete enough that someone can fill it in without reading code.

**4. Remove any remaining WhatsApp residue.** `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, and any client code — WhatsApp was dropped from the stack (PRD §6, CLAUDE.md).

**5. Re-run the Prompt 9 audit** after the above and report: deviations from the prototype, invented UI, PRD-vs-prototype conflicts, any entitlement check that could gate verification, safety, Couple Mode or the 6-a-day feed, and mobile verification at narrow viewports.

---

## PROMPT 14 — Profile photos: four minimum, one face-matched (Phase 1)

Read PRD §5.1.2 and the new CLAUDE.md photo rule first. *(Prompt 13 — Resend, PostHog and SMS wiring — was issued directly in chat.)*

- A profile cannot go live with fewer than **4 photos**; max from config, default 6.
- **No live profile, no access** — enforce on the server in every feed, profile-view, invite, message and date route: a member who isn't live can't see or reach anyone. Allow only verification, photo upload, Toastly Help, settings, data export and deletion. Falling below 4 photos or removing the main photo hides the profile and pauses access; replacing the main photo keeps the old matched photo live until the new one passes. Add a constraint check for the guard.
- The **primary photo must be a face photo that matches the member's liveness selfie.** Check Smile ID's docs for comparing an uploaded photo against the enrolled liveness face. **If Smile ID can't, stop and report options before building** — do not add a new biometric vendor.
- Borderline results go to the human review queue, never auto-rejection. Changing the primary photo re-runs the match; a mismatch emits a Sentinel `verification_drift` event.
- Store only the match outcome, never a face template. Compress client-side before upload.
- Add **"these photos aren't them"** as a first-class report category.
- The other three photos have no face requirement. The "show photos only to matches" setting still applies.
- Extend the liveness consent to cover comparing the selfie with the main profile photo — but **hold the final consent wording** until Smile ID's retention terms are confirmed.
- Build the photo-upload screens against their prototype once it exists; flag them as invented UI until then. Add them to the mobile audit.

---

## PROMPT 15 — Verification & Support Concierge (Phase 1)

Read PRD §5.9 and the CLAUDE.md agent rules first.

- An in-app help panel, **labelled as AI at first contact** ("Toastly Help — an AI assistant. A person handles refunds, disputes and appeals."). No persona name, no small talk beyond the task.
- Scope: why a liveness check failed (from Smile ID **status codes only**), ID-check options, payment problems, coin deposits, tier questions, how features work. English and Pidgin.
- **Tools: read-only** — verification status code, subscription status, coin balance — plus `create_support_ticket`. No tool that moves money, changes an account or reads chats.
- Model: Claude Haiku via stateless calls; conversation state in Supabase. Build each request payload from an **allow-list** of permitted fields — never protected attributes, genotype, messages, Gist data, selfies or ID numbers.
- If a member raises distress or a safety emergency, stop the task, surface safety resources and hand to a person.
- Retain support transcripts for a short, disclosed period (default 30 days, configurable). PostHog gets event metadata only.
- Free on every tier. Add a constraint check that fails the build if the concierge's tool list includes any write action on money or accounts.

---

## PROMPT 16 — Answer Mirror (Phase 1)

Read PRD §5.9 first.

- When a member edits a profile prompt answer, an optional "Get feedback" action returns private feedback **from a fixed enum only** — e.g. `great_answer`, `be_more_specific`, `add_a_personal_detail`, `too_short`, `reads_generic`. Map each value to fixed, human-written UI copy.
- **Never return suggested wording.** Enforce with structured output; reject and log any response containing free text beyond the enum. Add a constraint check for this.
- Operates only on the member's own draft answer. Never comments on faith, tribe or other protected topics.
- Claude Haiku, stateless. Show the pledge in the UI: *"Toastly AI will never write a word for you."*
- Feedback UI is invented — flag it until a prototype exists.

---

## PROMPT 17 — Coin balance and date attendance (Phase 1)

Read PRD §5.5 and the CLAUDE.md coin-balance and attendance rules first. This replaces the earlier "stake credit usable only as a future deposit" mechanic.

**Coin balance**
- A per-member coin balance backed by an **append-only ledger** — every movement is a ledger row; the balance is derived, never edited directly.
- Two buckets: **purchased** (stakeable) and **promotional** (not stakeable). Stakes draw only from purchased coins.
- Stake outcomes are **single atomic transactions**: both attend → each stake returns to its owner; one absent → that stake moves to the attending member. Toastly keeps nothing.
- Coins can pay **Premium and Premium Plus (naira) only**. At checkout, coins apply first and Paystack covers any remainder. Diaspora dollar subscriptions cannot be paid with coins — enforce on the server, not just the UI.
- No withdrawal, payout, refund-to-cash or member-to-member send flow, anywhere. Add a constraint check that fails the build if UI copy contains "wallet", "escrow", "transfer" or "cash out".

**Attendance**
- During the date window, each member taps **"I'm here"**, confirmed by location within a set radius of the agreed venue. Ask for location only at that moment, with plain consent copy; keep only the check-in result, not the coordinates.
- One checks in, the other doesn't → provisional no-show, with a **24-hour window** to contest. Contested cases go to the human review queue; nothing moves until it's resolved.
- Cancelling before the cut-off (config, default 12 hours) and mutually agreed rescheduling return both stakes.
- **Safety cancellation and safety reports return the reporter's stake in full, always, and override every other rule.** Add a test proving a member who reports or cancels for safety can never lose coins.
- Emit Sentinel events for no-shows (as the absent party), contests and outcomes — outcome only.

**Copy** stays warm: "showing up for each other". A member who was stood up sees: *"They didn't make it — their coins are now in your balance."* Never "forfeit", "penalty" or "fine".

The coin-balance screen, check-in, contest and outcome screens are invented UI — flag them until prototypes exist, and add them to the mobile audit. **Do not ship to production until the legal check in PRD §11 is confirmed.**

---

## PHASE 2 — not yet due; do not run until Phase 1 is live and there is real usage data

None should be started before launch.

- **P2-A · Trust Sentinel+** (PRD §5.1.1). Scoring by deterministic rules plus a classical model, Claude Sonnet for reviewer summaries only; human review queue; **step-up re-liveness** above a high threshold before the next Gist or date commitment; a user-triggered, chat-free **Safety Check** on any match. Off-platform-contact signals from UI events only. All six CLAUDE.md Sentinel constraints apply.
- **P2-B · Hosted live-streaming / matchmaker channel.** Verified participants only; Gist question deck; no virtual gifts or paid attention of any kind.
- **P2-C · Diaspora-to-diaspora per-city activation.** Flip the Prompt 10 flags as each city reaches a verified-user threshold.
- **P2-D · Live video Gist transport.** Built in Prompt 5; credentials only.
- **P2-E · Plan the Toast** (PRD §5.9 #4). Three slots from structured availability, three vetted public venues, both pick by tapping; coin deposit, reminders, optional share-my-date link, "home safe?" check-in; system-authored confirmations only. **Blocked on the share-your-date / panic design**, which is still unspecified.
- **P2-F · Diaspora home windows** (PRD §5.9 #5). Member-entered travel windows visible to matches; diaspora status never a ranking or scoring input.
- **P2-G · Adaptive Gist deck** (PRD §5.9 #6). Both opt in; curated card bank; skip/extend/star metadata only; private self-authored reflections; no audio, no transcript, no inference about the other person.

## LATER — correctly not scoped

Live AriyaPlanner handoff integration with the **consent-gated engagement-brief agent** (PRD §5.7, §5.9 #7) · a **read-only AriyaPlanner MCP tool** (§5.9 #8) · curated/partnered venue directory · Facebook/TikTok matchmaker partnerships.

---

*End of sequence. Phase 1 = Prompts 0–17 (Prompt 13 issued in chat).*
