# Toastly — Claude Code Build Prompt Sequence

Run these **in order**, one per session or one per major work block. Each assumes `PRD.md`, `CLAUDE.md`, and `SKILL.md` are in the repo root, and the approved Claude Design prototype export is at `/design/prototype/`.

**Before running any of these:** confirm the eleven prototype files are in `/design/prototype/`:

`design-system.slim.html` (read first — tokens), `home.slim.html`, `features.slim.html`, `how-it-works.slim.html`, `pricing.slim.html`, `safety.slim.html`, `diaspora.slim.html`, `stories.slim.html`, `locked-inbox.slim.html` (in-app, not marketing), `brand-the-stake.slim.html`, `brand-assets.slim.html` (icons, vector masters, social exports).

If they aren't there, stop — several of these prompts are meaningless without them, and Claude Code will otherwise invent UI that was never approved.

**Standing rule for every prompt below:** where the prototype and `PRD.md` disagree, **`PRD.md` wins on content, the prototype wins on layout and visuals** — and the discrepancy must be reported, never silently resolved. Three known conflicts are listed in `SKILL.md`.

---

## PROMPT 0 — Repo bootstrap & ground rules

Read `CLAUDE.md`, `SKILL.md`, and `PRD.md` in the repo root before doing anything else, and confirm back to me in a short summary: the stack, the hard constraint about the prototype, and the five or six product constraints you must not implement around (no swipe, voice-first Gist, Starter chat asymmetry, Couple Mode free on all tiers, fixed 6-a-day feed, no chat-content scanning).

Then scaffold the project: Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, Supabase client setup, PWA manifest and service worker configured for installability. Do not build any feature UI yet — scaffold only.

**Prototype alignment:** open `/design/prototype/design-system.slim.html` before writing any Tailwind config and encode its tokens in `tailwind.config.ts` as named values. Do not use Tailwind defaults or invent a palette. The tokens are:

- Deep green surface `#001F1B`; teal `#00695C` (deeper `#005449`, lighter `#4C968C`)
- Amber CTA `#FFB300` (hover `#FFC94C`, dark `#CC8F00`)
- Champagne `#EBD9AE`; cream surface `#F6F2EA` (tints `#FFF7E5`, `#E5F0EE`)
- Ink `#050309`; muted `#504E52`, `#828184`, `#D9D9DA`; white `#FFFFFF`
- Accents `#9B1348` (deep rose), `#2F8F5B` (green)
- Type: **Aleo** serif for headings (fallback Georgia), **Inter** sans for body/UI

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
- Mutual opt-in before any mic/camera activates. 5–7 minute time-box. Shared structured question deck, escalating playful → real. Private double-opt-in "continue?" at the end.
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

*End of sequence.*
