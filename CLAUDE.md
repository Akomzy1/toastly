# CLAUDE.md — Toastly

This file governs how Claude Code (and any Claude-based agent) works in this repository. Read this before making changes. If an instruction here conflicts with a general default, this file wins for this repo.

## Project Summary

Toastly is a premium, verification-first dating-to-marriage platform for Nigerian Gen Z (Nigeria-domestic-led, diaspora bridge secondary). It is the acquisition-layer sibling product to **AriyaPlanner** — the two share one technical spine and a strategic funnel (dating → marriage → wedding planning). Full product context lives in `PRD.md` in this repo root — read it before implementing any feature you don't already understand; do not guess at product intent from code alone.

## Tech Stack (matches AriyaPlanner — shared spine, do not diverge)

- **Framework:** Next.js 14 (App Router), PWA-first — must be installable from the browser with no app-store dependency
- **Database/Auth:** Supabase
- **AI:** Claude API (use tiered model selection — Haiku for cheap/high-volume tasks, Sonnet for general logic, Opus only where genuinely needed — do not default to the most expensive model everywhere)
- **Payments:** Paystack (NGN domestic) + Stripe (USD diaspora) — see `PRD.md` §7 for the pricing-integrity/anti-arbitrage requirements; payment-geography signals used there must be implemented as part of the payment flow, not bolted on separately
- **Messaging:** WhatsApp Business Cloud API (WhatsApp-native touchpoints where relevant — e.g., notifications, not in-app chat replacement)
- **Realtime/video:** WebRTC-based provider (LiveKit/Daily/Agora — pick one and use consistently; do not mix providers) for Gist voice/video sessions. VoIP-based — **never** route calls through a carrier number or expose either party's real phone number as part of the calling mechanism.
- **UI:** shadcn/ui + Tailwind
- **Analytics:** PostHog
- **Hosting:** Vercel
- **Transactional email:** Resend

## HARD CONSTRAINT: The approved prototype HTML is the source of truth for UI

**The build must match the approved prototype exactly.** The prototype was produced via a defined pipeline (Relume sitemap → page-level prompts → Claude Design system + page generation) and represents deliberate, already-approved design decisions — palette, typography, layout rhythm, component structure, motion — benchmarked explicitly against a named competitor (MyPerson.ng) to be more premium and editorial, not another generic dating-app template.

Concretely, this means:

- **Locate the prototype files** before building any page or component. They should live under `/design/prototype/` (or wherever they've been placed in this repo — check there first; if missing, stop and ask rather than inventing a design).
- **Do not improvise new UI patterns, layouts, or components not present in the prototype.** If a feature needs a UI element the prototype doesn't cover, flag it explicitly and ask for direction rather than freelancing a "reasonable-looking" component that wasn't design-approved.
- **Match structure, not just visuals.** Section order, spacing rhythm, and component hierarchy from the prototype HTML should carry through to the implementation — this isn't "use these colors," it's "build this exact page."
- **Preserve the design-system tokens** (color palette — deep green/black/gold jewel tones; typography scale — editorial serif/display headline + clean sans body; motion — subtle, no swipe-card/flame/heart clichés) as reusable Tailwind config / design tokens, not one-off inline styles per page, so consistency holds as new pages are added beyond the original prototype set.
- **If the prototype and this file's stack requirements conflict** (e.g., a static prototype pattern that doesn't map cleanly to Next.js/React), preserve the prototype's visual and structural intent while adapting the implementation — don't silently drop fidelity to make the code simpler.
- **Any deviation from the prototype must be called out explicitly** in your response before you build it — never silently ship something that looks different from what was approved.

## Product Constraints That Are Also Engineering Constraints

These aren't just product decisions — they have direct technical implications. Do not implement around them.

- **No swipe mechanic.** Prompt-based, feed-style matching only. Don't build swipe-card gesture components.
- **Voice-first Gist by default; video is gated to the upper pricing tier**, not the base paid tier. Enforce this at the entitlement/access-control layer, not just in UI copy.
- **Couple Mode and the AriyaPlanner handoff must be entitled to every tier, including Starter (free) — never gated behind Premium or Premium Plus.** This is the platform's core LTV mechanism (PRD §6). Do not implement this as a paid feature under any circumstances without an explicit product decision to change it; a generated design mockup once gated this incorrectly (see PRD §7.1) — treat that as a corrected error, not a reference implementation.
- **No Boosts and no Super Likes exist in this product (PRD §7.2).** Do not build them, do not add them to the coin store, and do not implement any purchase that inserts a user into another user's feed or raises their visibility to others. Coins buy only: date stakes, inbox unlocks, additional Gist sessions, and see-who-liked-you (the user's own data). Paid tiers may improve match **quality and ordering within a user's own six** — never their placement in someone else's. Shipped copy depends on this: *"Nobody buys your place in the six."*
- **The daily match feed is fixed at 6/day for every tier, including paid ones.** Do not implement or expose a "more matches for higher tiers" upgrade path — scarcity is a stated brand principle (PRD §5.2), not a monetisable limitation. A paid tier may improve placement/visibility within the same 6, never the count.
- **Chat entitlement is asymmetric on Starter (decided) — get this exactly right, it's easy to implement wrong:** Starter users CANNOT send free text messages. Starter users CAN receive messages sent to them by any match (including paid-tier senders) — the message must be stored and its existence surfaced as a **bare count only ("1 new message" / "3 new messages") — no sender name, no photo, no text preview or snippet of any kind.** Message **content must remain fully locked at the API and UI level** until the recipient upgrades — do not leak sender identity or any part of the message body to a Starter user under any circumstances. Do not implement this as "Starter can't participate in chat at all" (that would block receipt entirely, which is wrong) and do not implement it as full chat access or a partial-preview version (richer previews were explicitly considered and rejected in favor of the bare count). The unlock-to-read UI must clearly label this as a paid feature (e.g., "New message waiting — Premium unlocks your inbox") — never present a locked message as an error, bug, or unexplained blank state.
- **Gist session caps: Starter (free) = 2 voice Gist sessions/month — this is Starter's only outbound conversation channel, since sending free text is disabled.** Diaspora ($15/mo) = unlimited voice sessions, at parity with domestic Premium. Do not implement the earlier "5/month"/"8/month"/"10/month" numbers that appeared in prior drafts or a generated design mockup — those are superseded (see PRD §7.1 for the current authoritative numbers and the pricing-parity rationale on Diaspora).
- **Women get 30 days free Premium Plus at launch (decided).** This is a full Premium Plus entitlement — including live-video Gist and incognito, not just base Premium — granted automatically on signup for users identifying as women, for 30 days, with no payment method required. (Earlier drafts said 90 days — that is superseded; use 30.) Implement as a real entitlement grant at signup, not a discount/coupon code the user has to apply. Do not silently downgrade this to base Premium as a "simpler" implementation — the tier choice is deliberate (see PRD §7).
- **No phone number required anywhere in the core call/chat flow.** Calling is VoIP through the app. Do not build a "call via phone number" bridge feature as part of MVP. A "share contact" affordance may exist, but only surfaced after a defined trust threshold (completed video Gist + mutual continue, or Couple Mode entry) — see PRD §5.1.
- **Never scan, parse, or flag free-text chat content for phone numbers or contact info.** This is a hard privacy/trust boundary, not a soft preference — do not add message-content moderation for this purpose even if it seems like an easy win.
- **Religion, tribe/ethnicity, language, and relationship-history (single/divorced/widowed/single-parent) fields are all optional, display-only, and must never function as hard matching filters that exclude a user from being shown to others by default.** They may be used as opt-in filters a user applies to their own search, never as a silent default exclusion.
- **Professional layer is a feature, never a barrier (PRD §5.2.2):** optional verified profession and education fields follow the same rules as religion/tribe/language/relationship-history — optional, display-only, user-controlled visibility, **never a hard matching gate**. Do not down-rank, hide, or exclude users who leave these fields empty. An optional "verified profession" badge may sit alongside "Verified Real" as an additional trust signal, but must never be implemented or styled as a prestige/elite marker, and must never unlock features or tiers. Profession filters are opt-in and applied by a user to their own search only.
- **Community standard — "free to commit" (PRD §5.2.1):** single parents, divorced and widowed users are explicitly welcome; **currently married users are not.** Two engineering implications: (1) "user is married" must be a **first-class report category**, not bucketed under "other"; (2) **never build or imply a marital-status verification check** — it cannot be reliably verified via NIN, BVN, or liveness, so it is enforced by report-and-remove only. Do not add a "verified single" badge, do not surface marital status as a verified attribute, and do not write UI copy suggesting Toastly checks it — conflating this with "Verified Real" would undermine a claim that *is* genuinely verifiable.
- **Relationship-history field defaults to private/revealed-on-match visibility, not public on the feed card.** Do not default this to public without an explicit product decision to change it.
- **Intent field (casual → marriage-minded) must never be a signup gate.** It's a filterable spectrum value, collected but never blocking.
- **Diaspora matching has two distinct pools** — "back home" and diaspora-to-diaspora — with an explicit user-facing choice of which pool to be matched into. Diaspora-to-diaspora matching should be feature-flaggable per city, not a single global on/off switch, since it unlocks per-city per the phasing in PRD §9.
- **Coin-deposit forfeit destination (ratified, PRD §5.5):** a forfeited no-show stake becomes a **non-withdrawable stake credit for the user who showed up**, spendable only as the deposit on a future date. Toastly neither retains it as revenue nor pays it out as cash or withdrawable balance. **Do not build charity disbursement** — the prototype's charity copy was never ratified; omit both the mechanic and the copy. Never expose this credit in a withdrawal, payout, or cash-balance flow.
- **Pricing-integrity signals** (payment geography, phone origin, light IP check at signup/payment) feed a **manual review queue**, never an automatic ban or lockout. Do not build auto-suspension logic on these signals.
- **Coin-deposit date-commitment copy/UX must be framed warmly** ("showing up for each other"), not punitively ("forfeit," "penalty") — this is a copy/UX constraint, not just a backend mechanic detail.
- **Verification and safety features (report/block, panic/share-your-date, photo-reveal control) are never paywalled.** Do not gate any of these behind a subscription tier or coin cost, even accidentally via a shared component that's paywalled for unrelated reasons.

## AriyaPlanner Integration Boundary

The live handoff integration (shared identity/account layer with AriyaPlanner) is **out of scope for MVP** — do not build it speculatively. However, **Couple Mode's data model should be designed with the eventual handoff in mind**: capture tribes, languages, home states, location, aesthetic signals, and budget cues in a structured shape that could reasonably be exported/shared later, even though nothing consumes it yet. Ask before building any cross-product integration code.

## What to Do When Something Is Ambiguous

- If the PRD, this file, and the prototype disagree, or a requirement is missing entirely: stop and ask rather than guessing. This is a real product with deliberate, carefully-reasoned constraints (see PRD §11 for known open questions) — don't paper over gaps with a plausible-sounding default.
- Do not silently expand scope (e.g., building the public matchmaker/live-streaming layer, or diaspora-to-diaspora matching globally) ahead of the phasing defined in PRD §9.
