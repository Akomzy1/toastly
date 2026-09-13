# Toastly — Product Requirements Document (PRD)

## 1. Overview

**Product:** Toastly — a premium, verification-first dating-to-marriage platform for Nigerian Gen Z (Nigeria-domestic-led, with a diaspora bridge for Nigerians abroad).

**One-line positioning:** "For Nigerians who are done wasting time — verified people, real intentions, all the way to the aisle."

**Category framing:** Not a dating app competing on swipe volume. A relationship-lifecycle platform — match → courtship → introduction → wedding → owanbe — that graduates successful couples into **AriyaPlanner** (sibling product, same spine) for wedding planning. The dating surface is a near-zero-CAC acquisition engine for a higher-margin wedding/events business.

**Primary market:** Nigeria-domestic Gen Z (~20–30), Lagos-first, then Abuja/Port Harcourt/Ibadan.
**Secondary market:** Nigerian diaspora (US/UK/Canada) — both "back home" matching and diaspora-to-diaspora matching (two distinct pools, see §5.6).

**Non-goals at launch:** not a hookup app, not a swipe-volume play, not a public/live-streaming product at launch (see §9 phasing), not a general-purpose social app.

## 2. Problem Statement

- Nigerian dating apps suffer a structural trust deficit: catfishing and "Yahoo" romance-scam exposure (₦4.2B in estimated 2024 losses) make users wary of any new platform.
- Global incumbents (Tinder, Bumble) are in Gen Z-driven decline — 79% of Gen Z report dating-app burnout, 72% question profile authenticity — because they're built around swipe volume, not intentionality.
- Existing Nigerian dating apps are either low-quality/low-trust (NaijaCupid, Naijaplanet, Friendite) or a genuinely strong direct competitor (**MyPerson.ng** — verification, escrow-style anti-ghosting, live streaming, PWA) that nonetheless stops at the relationship: no product owns the outcome (marriage) or the wedding economy that follows.
- Nigerian courtship culture is explicitly marriage-oriented (family/societal pressure, transactional-dating stigma to overcome), but no platform is designed end-to-end for that arc.

## 3. Goals & Success Criteria

| Goal | Success signal |
|---|---|
| Establish trust as the core product | ≥40% of active users hold the "Verified Real" badge within month 1 of a city launch |
| Prove Lagos liquidity before expanding | Sufficient match density in Lagos before opening additional domestic cities |
| Diaspora carries near-term ARPU | Diaspora ARPU ≥5× domestic ARPU within 6 months |
| Funnel couples into AriyaPlanner | Track Couple Mode → engagement milestone → AriyaPlanner handoff conversion rate (baseline TBD from first cohort) |
| Avoid the "runs"/transactional reputation | Qualitative brand-sentiment tracking; intent-spectrum adoption rate as a proxy for serious-user share |

## 4. Users & Personas

- **Domestic Gen Z user (primary):** 20–30, Lagos-based, online-native (X/IG/TikTok/WhatsApp), price-sensitive, wary of scams, ranges from casually dating to marriage-minded.
- **Diaspora user — "back home":** Nigerian abroad (US/UK/Canada) seeking a partner based in Nigeria. Higher willingness to pay, USD-billed.
- **Diaspora user — diaspora-to-diaspora:** Nigerian abroad seeking a partner also abroad (same or different diaspora city). Requires its own liquidity per city (see §5.6).
- **Widowed / single-parent user:** Included, not excluded — real and sizable population, especially relevant to remarriage in Nigerian culture. Skews the real age range above the core Gen Z band; product does not hard-gate on age even though marketing focuses on Gen Z (see §5.3).
- **Graduated couple:** A Couple Mode pair who reaches an engagement milestone and is handed off to AriyaPlanner.

## 5. Core Features (MVP)

### 5.1 Verification & Trust
- Mandatory tiered verification: phone → selfie liveness → optional NIN/BVN for a **"Verified Real"** badge.
- Verification and core safety are **never paywalled**.
- Women's safety kit: photo-reveal control, share-your-date/panic feature, unsolicited-image blur, report/block.
- No phone number is ever required to talk, call, or Gist in-app (VoIP-based calling). Any number-sharing affordance (e.g., a "share contact" button) is withheld until a trust threshold (completed video Gist + mutual "continue," or Couple Mode entry) — but free-text chat is never scanned, blocked, or policed.

### 5.2 Matching Mechanic
- Prompt-based profiles (Hinge-style), not infinite swipe. Curated daily match feed.
- **Intent selector on a spectrum** (see §5.3) — filterable, never a signup gate.
- Optional display fields, all display-only and never matching gates: religion, tribe/ethnicity, language.
- **Optional relationship-history field** (single, divorced, widowed, single parent + optional "has children" flag) — **user-controlled visibility** (default private/revealed-on-match, not public on the feed card, given real stigma in Nigerian culture); optional filters for/against.

### 5.2.2 Professional layer — a feature, never a barrier (decided)

Toastly supports working professionals as a **served segment**, not a gated tier. The rule is explicit: **the professional layer is a feature for professional users, never a barrier for anyone else.**

- **Optional verified profession and education fields**, following the exact same pattern as religion, tribe, language and relationship history: optional, display-only, **user-controlled visibility**, and **never a matching gate**. A user without these fields is never down-ranked, hidden, or excluded from anyone's feed by default.
- **Verification is a trust-layer extension, not a status marker.** An optional "verified profession" badge sits alongside "Verified Real" as an *additional* signal — meaningful because it is expensive to fake and tedious to maintain, which makes it one of the sharpest available anti-scam signals in a market shaped by romance fraud. It must never be styled or worded as a prestige/elite marker.
- **Filters are opt-in and self-applied only.** A user may choose to filter their own search by profession or education; the platform must never silently exclude non-professional users from anyone's visibility.
- **Reach professionals through acquisition, not exclusion.** Professional targeting belongs in GTM — alumni networks, young-professional communities in Lekki and Wuse, Lagos corporate circles — not in product gating.

**Why this is strategically worth doing:** (1) it strengthens the anti-Yahoo trust layer, since scammers rarely have verifiable employers; (2) working professionals are the one domestic segment that can absorb ₦7,000/mo, which is the weakest assumption in the domestic revenue model; (3) profession carries real weight in Nigerian marriage culture at the introduction stage, so it fits the marriage track natively rather than as a bolt-on.

**Tensions to hold, not resolve by drifting:** professional framing must never read as class exclusivity — it would contradict §5.2.1's "welcome as a given, not permission granted" principle, and Nigerian "tush"/class signalling makes this a live risk. It also skews the real user age band upward again (professionals cluster 25–35), the second widening beyond the core Gen Z marketing wedge after §4.3's note on widowed users. Both are accepted deliberately, not drifted into.

### 5.2.1 Community standard: free to commit (decided)

**Toastly is open to single parents, divorced and widowed users — and closed to people who are currently married.** These are two halves of one positioning: real life comes with history, but the platform is for people who are actually free to build something.

- **Inclusivity is stated as a given, not as permission granted.** Copy must never read as "we allow single parents" — framing that implies the default is exclusion. Single, divorced, widowed, raising children: all normal, all welcome.
- **Married users are not welcome.** This directly targets the sponsor / side-chick / transactional dynamic ("runs" culture) the brand is built against, and is the single clearest expression of the intentionality positioning.
- **Enforcement reality — do not over-promise.** Marital status **cannot be reliably verified**: NIN and BVN do not expose it dependably, and liveness checks cannot detect it. This is enforceable as a **stated community standard plus report-and-remove**, not as a verification gate. Public copy must never imply Toastly *checks* marital status the way it checks identity — conflating the two would undermine trust in "Verified Real," which is genuinely verifiable. State it as a rule enforced on report, not a guarantee.
- Reporting a user as married must be a first-class report category, not buried under "other."

### 5.3 Intent Spectrum (critical constraint)
- Do not hard-gate on marriage at signup. Stated preference on a spectrum: *Just vibing → Getting to know people → Something serious → Marriage-minded.*
- Users filter on it; brand leans intentional without amputating top-of-funnel liquidity.

### 5.4 Gist — Structured Compatibility Sessions
- **Voice-first by default** (structured question deck, 5–7 min, mutual opt-in, double opt-in "continue?" exit, no dead air).
- **Live video as a premium upgrade**, gated at the upper pricing tier, not the base tier (see §7). Auto-degrades to audio on weak connections.
- No mic/camera activates until both parties opt in. Screenshot/screen-record blocking on the video tier.
- Session data feeds the AriyaPlanner warm brief (see §6).

### 5.5 Coin-Deposit Date-Commitment
- Both parties stake a small coin deposit ahead of a confirmed date; a no-show forfeits.
- **Where a forfeited coin goes (ratified):** it becomes a **stake credit for the person who showed up** — non-withdrawable, not cash, usable only as the deposit on a future date. Toastly does not keep it and does not pay it out.
  - *Why this and not the alternatives:* Toastly keeping it would give Toastly an interest in no-shows. Paying cash to the person who showed up invites bait-farming. A credit usable only as a future stake rewards the wronged party in the one currency that cannot be gamed — it simply puts them back in the game for free.
  - *Supersedes:* the Claude Design prototype's Pricing page described forfeited coins going to a charity chosen by the other person. **That was never ratified and is not to be built or displayed** — it would commit Toastly to charity partnerships, disbursement rails, receipts, an audit trail, and questions about holding and redirecting user funds in Nigeria, all at launch. Remove the copy as well as the mechanic: shipping the claim without the pipeline is a public promise about where users' money goes.
- Framed warmly ("showing up for each other"), never punitively (contrast with MyPerson's escrow/forfeit language).
- Paired with a **lightweight date-spot suggestion** (maps-API lookup of nearby public venues, not a curated directory at MVP) surfaced after a strong Gist — doubles as a soft safety signal (public-venue nudge).

### 5.6 Diaspora Matching (two pools, not one)
- **"Back home"** (abroad → Nigeria) — inherits Lagos liquidity, launches first.
- **Diaspora-to-diaspora** (abroad → abroad) — a genuinely separate liquidity problem per city; unlocked **per diaspora city** only once that city has enough verified users, not switched on globally at launch.
- Explicit location-intent filter so users choose which pool they're matched into.

### 5.7 Couple Mode & AriyaPlanner Handoff
- Opt-in shared space for mutually-confirmed exclusive couples: milestones, saved dates, shared "our story" timeline.
- Milestone triggers (first date logged, "official," anniversary, **engagement** — the primary handoff trigger).
- On engagement: one-tap start into AriyaPlanner with a pre-filled brief (tribes, languages, home states, location, aesthetic signals, budget cues already known from Gist/profile data).
- Couple data shared only with mutual consent, encrypted, never used to gate matching.

### 5.8 Data-Light / Distribution
- PWA-first, installable from browser, no app store required.
- Data-light mode for low-end Android and constrained connectivity.

## 6. AriyaPlanner Integration (strategic core, not a bolt-on)

- Toastly and AriyaPlanner share one spine: **Next.js 14 PWA + Supabase + Claude API + Paystack + WhatsApp Business Cloud API**.
- Toastly is the acquisition engine; AriyaPlanner is the LTV engine. A single graduated couple can trigger multiple AriyaPlanner Event Passes (introduction ceremony, traditional wedding, white wedding, anniversaries, diaspora-abroad wedding variant).
- **Sequencing honesty:** wedding revenue is long-tail (Nigerian courtship-to-wedding runs 1–4 years) — it is the LTV/moat story, not the launch P&L. Near-term revenue runs on domestic coins + diaspora subscriptions.
- Integration point: a shared identity/account layer enabling the warm handoff. This is a **later phase**, not part of Toastly's MVP scope — MVP should be built with the handoff *contract* in mind (what data Couple Mode captures, in what shape) even before the live integration exists.

## 7. Monetisation

| Layer | Mechanism | Notes |
|---|---|---|
| Domestic coins | ₦500–₦5,000 packs via Paystack/Flutterwave/USSD/bank transfer/OPay | Date stakes, unlocking the locked inbox, additional Gist sessions, unlock "who liked you." **No Boosts, no Super Likes** — see §7.2 |
| Domestic subscription | Premium ~₦3,500/mo; Premium Plus ~₦7,000/mo (unlocks live-video Gist, advanced filters, incognito) | Benchmarked directly against MyPerson's published pricing |
| Diaspora subscription | ~$15–30/mo via card/Apple Pay | Covers both back-home and diaspora-to-diaspora matching |
| AriyaPlanner wedding funnel | Multiple ₦50,000 Event Passes per graduated couple | LTV engine, not launch revenue |
| Trust | Free, always | Verification and safety features are never paywalled |
| Women's launch offer | **30 days free Premium Plus (decided)** | Not base Premium — Premium Plus includes live-video Gist and incognito, both carrying real safety value. Note: shorter than MyPerson's 90-day offer, so Toastly wins on tier but loses on the directly-comparable duration number — monitor whether 30 days is long enough to correct the gender ratio at launch |

### 7.1 Tier-by-tier package (corrected, authoritative)

The first Claude Design pass on the pricing page (below) got most of this right but made one structural error and filled in a few numbers that were never actually decided. This table is the corrected, binding version — it supersedes anything shown in generated design output where they conflict.

| Feature | Starter (Free) | Premium (₦3,500/mo) | Premium Plus (₦7,000/mo) |
|---|---|---|---|
| Verified Real profile | ✅ | ✅ (everything in Starter, plus:) | ✅ (everything in Premium, plus:) |
| Daily match feed | ✅ (6/day — **fixed, not a paid upgrade**) | ✅ (6/day — see note below) | ✅ (6/day) |
| Text chat | **Receive-locked (decided):** Starter users CAN receive messages from any match, and see only a bare count — **"1 new message" (or a running count for multiple)** — with **no sender name, no photo, and no text preview shown**. Message **content is fully blurred/locked until upgrade**. Starter cannot send free text at all. Framed transparently as a paid feature ("New message waiting — Premium unlocks your inbox"), never presented as a bug or hidden without explanation | ✅ Unlimited send + receive | ✅ Unlimited send + receive |
| Gist sessions (voice) | ✅ **2/month (decided)** — with chat removed, this is Starter's *only* interaction channel; 2/month means a Starter user gets at most 2 real conversations total per month across up to ~180 possible matches | ✅ Unlimited | ✅ Unlimited |
| Gist sessions (video) | ❌ | ❌ | ✅ Live-video Gist |
| Coin-deposit dates | ✅ | ✅ | ✅ |
| **Couple Mode + AriyaPlanner handoff** | ✅ **Free/universal — moved here, not tier-gated** | ✅ | ✅ |
| Advanced filters (tribe, religion, state, diaspora, intent) | ❌ | ✅ | ✅ |
| Incognito mode | ❌ | ❌ | ✅ |
| See-who-liked-you | Coin-purchasable à la carte | Coin-purchasable à la carte, or included at a to-be-decided level | Included |
| Priority support | ❌ | ❌ | ✅ ("from Lagos") |
| Read receipts | N/A on Starter (no chat to have receipts on) — **still flagged, not decided for paid tiers** | | |

**Flagged consequences of the Starter changes (implemented as decided, but worth tracking):** Starter's existing subheading — "Everything you need to meet someone properly" — is now inaccurate and should be rewritten, since a locked inbox and 2 conversations/month is a materially thinner free experience than that copy promises. The "reply to a specific prompt answer to start something" flow described earlier also needs re-scoping: a Starter user can't send an initial text reply, so their only outbound move is proposing one of their 2 monthly Gist sessions — inbound messages from other users (including paid-tier matches) arrive as a locked/blurred notification instead. This significantly raises the liquidity risk already flagged in §10 (chicken-and-egg liquidity); worth watching closely post-launch. The locked-inbox mechanic itself is a proven high-converting pattern (validated by direct founder experience with a comparable app), but it sits closer to a manipulative "dark pattern" than anything else in this product's design — the transparency requirement above (clearly label it as a paid feature, never hide it silently) is there specifically to keep it consistent with the trust-first brand rather than undermining it.

**Diaspora tier package (decided):**

| Feature | Diaspora ($15/mo) | Diaspora Plus ($30/mo) |
|---|---|---|
| Verified Real profile | ✅ | ✅ (everything in Diaspora, plus:) |
| Matching pools | Both — "back home" and diaspora-to-diaspora | Both |
| Gist sessions (voice) | ✅ **Unlimited (decided)** — see rationale below | ✅ Unlimited |
| Gist sessions (video) | ❌ | ✅ Live-video Gist |
| Time-zone aware scheduling | ✅ | ✅ |
| Advanced filters | ✅ | ✅ |
| Couple Mode + AriyaPlanner handoff | ✅ Free/universal, same as domestic | ✅ |
| Priority support | ❌ | ✅ |

**Rationale for unlimited voice Gist on Diaspora ($15), not a numeric cap:** the original "10/month" placeholder created a hidden pricing inconsistency worth catching — domestic Premium at ₦3,500/mo already gets unlimited voice Gist, and Diaspora at $15/mo is priced far above domestic Premium (~₦25,000+ equivalent), making it diaspora's *Premium* tier, not its *Starter* tier. Capping it below what domestic Premium gets meant a diaspora user would pay roughly 7x more for a strictly worse Gist allowance — undermining trust with exactly the users the ARPU model depends on most. Diaspora ($15) now has parity with domestic Premium on Gist; the only differentiation between Diaspora and Diaspora Plus is live video, consistent with the video-always-gated-at-top-tier rule used everywhere else.

### 7.2 No Boosts, no Super Likes (decided — corrects an earlier PRD error)

Earlier drafts of §7.1 listed Boosts and Super Likes as coin purchases. **That was a carry-over from the Tinder/Bumble/Badoo teardown and does not survive contact with Toastly's own mechanic.** With a fixed six-a-day feed, a Boost can only mean appearing in more people's six — which is buying attention, the precise thing the brand is built against. Super Likes are already denied by shipped copy on Home: *"no streaks, no 'you've been super-liked'."*

**Coins therefore have four honest jobs, none of which buy placement in anyone else's feed:**
1. Date stakes (the coin-deposit commitment)
2. Unlocking the locked Starter inbox
3. Additional Gist sessions beyond the tier allowance
4. Unlocking see-who-liked-you (the user's own data about themselves — it changes nothing in another user's feed)

**Shipped Pricing copy (ratified):** *"Nobody buys your place in the six… paying can improve how well those six are matched to you, it never buys you more of them."* This is now literally true. Paid tiers may improve **match quality and ordering within a user's own six**; nothing a user buys inserts them into another user's six.

**Corrections made to the first design pass:**
1. **Couple Mode + AriyaPlanner handoff must be free/universal, not locked behind Premium Plus / Diaspora Plus.** This is Toastly's core differentiator and its actual LTV engine (Part 4 of the strategy doc) — gating the entry point to the wedding funnel behind the top subscription tier means a couple who falls for each other on Starter or base Premium never reaches AriyaPlanner unless they happen to upgrade at exactly the right moment. If a paywall belongs anywhere near this feature, it goes on *enhanced* Couple Mode extras, never on the bridge itself.
2. **"6 matches a day" must not become "more matches for higher tiers."** The scarcity (6, once daily, gone if unused) is a stated brand principle, not a limitation to upsell against — Premium's "priority match feed" should mean better placement/visibility within the same 6, not a larger daily count. Confirm this explicitly in copy so it can't be read as "pay for more matches."
3. **Premium's card must state "Everything in Starter, plus:"** — as written, it's ambiguous whether subscribing to Premium keeps Verified Real, the daily feed, and coin-deposit dates, or replaces them.
4. **Session-cap numbers are now decided: Starter = 8/month, Diaspora = unlimited** (replacing the AI-generated "5/month" and "10/month" placeholders — see rationale above).
5. **Read receipts need a deliberate yes/no, not a default inclusion** — flagged as a possible tone mismatch, not rejected outright.

**Pricing-integrity requirement:** prevent diaspora users from registering as domestic to dodge diaspora pricing via **signal-stacking, not a wall** — payment-method geography (strongest, already in payment data), phone number origin, a light IP check at signup/payment only (not continuous tracking), NIN/BVN where used. Mismatches trigger **manual review, never auto-ban** (a dual-resident or visiting user must not be auto-flagged). Also narrow the incentive itself: price diaspora as a proportionate multiple of domestic, keep domestic Premium Plus genuinely valuable.

## 8. Design & Frontend Requirements

- **The build must match the approved prototype HTML/design system exactly** — see `CLAUDE.md` for the binding instruction. The prototype (generated via Relume sitemap → Claude Design) is the source of truth for layout, spacing, component structure, and visual tokens (color, type scale, motion). Engineering does not improvise new UI patterns not present in the prototype without an explicit design-change request.
- Visual direction: deep green/black/gold jewel-tone palette (not Tinder's flame gradient or MyPerson's pink), editorial serif/high-contrast display headline type + clean sans body, real/warm Nigerian photography, subtle motion (no swipe-card animation, no flame/heart clichés).
- Explicit benchmark: must read as more premium and considered than MyPerson.ng's current site.

## 9. Phasing

- **Phase 1 (launch):** Verification/trust layer, prompt-based matching, intent spectrum, voice Gist (default), coin-deposit date commitment, lightweight date-spot suggestion, Couple Mode (data capture only), women's safety kit, PWA, domestic coins + subscription, "back home" diaspora matching + diaspora subscription. Launch in Lagos only.
- **Phase 2:** 1:1 live video Gist (premium), hosted live-streaming/matchmaker channel (once verified liquidity exists — MyPerson already runs this live, so this should not be pushed indefinitely), diaspora-to-diaspora matching unlocked per qualifying city.
- **Later phase:** Live AriyaPlanner handoff integration (shared identity/account layer), fuller curated date-venue directory (if usage justifies content-ops investment), public/host matchmaker partnerships (bringing existing Facebook/TikTok matchmakers on as ambassadors).

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| "Runs"/transactional dating reputation | Intentionality-first brand, verified-only, no punitive framing on safety features |
| Yahoo/catfish/scam | Mandatory verification, structured Gist as a natural scam filter, re-verification on flags |
| Chicken-and-egg liquidity | City-by-city launch (Lagos first), women-first seeding (mirrors MyPerson's "women get 90 days free" — validated necessity, not optional) |
| Starter tier too restrictive to build liquidity (no chat, 2 Gist/month) | A deliberate tradeoff, not an oversight — monitor match-to-conversation conversion closely post-launch; be prepared to loosen the cap if it's suppressing volume rather than driving upgrades |
| Gender imbalance | 30 days free Premium Plus for women at launch (decided, see §7) — shorter than the competitor's 90-day equivalent, so watch female retention past day 30 closely and be prepared to extend if the ratio doesn't hold |
| Low domestic willingness-to-pay | Coins + diaspora cross-subsidy; do not assume subscription-only will work domestically |
| Diaspora-diaspora liquidity fragmentation | Per-city unlock, not global at launch |
| WhatsApp leakage | Own the relationship layer (Couple Mode), not the chat pipe; never police number-sharing in free text |
| Long lag to wedding revenue | Fund the business on dating + diaspora; AriyaPlanner is LTV upside, not launch P&L |
| Diaspora pricing arbitrage | Signal-stacking + manual review, not aggressive auto-enforcement |

## 11. Open Questions (not yet decided — do not assume answers)
- ~~Free-tier limit on voice Gist sessions~~ — **decided:** Starter = 8/month, Diaspora = unlimited (see §7.1).
- Handoff-conversion rate assumptions for the AriyaPlanner funnel (strategic thesis, not yet evidenced — validate with first cohort).
- Exact city-unlock threshold for diaspora-to-diaspora matching and for Phase 2 live-streaming.
