---
name: toastly-prototype-fidelity
description: Use this skill whenever building, editing, or reviewing any UI/frontend code in the Toastly repository — pages, components, layouts, styling, Tailwind config, or design tokens. Also use it before writing any new page or component from a feature description, and whenever a task might require inventing a UI pattern not already present in the approved prototype. Triggers on any mention of pages, screens, components, layout, styling, tokens, or "build the frontend for X." This skill enforces that the approved prototype HTML files are the binding source of truth for Toastly's UI. Do not skip it by assuming general frontend best practice is sufficient — the structural and visual decisions here are already made and approved, not open choices.
---

# Toastly Prototype Fidelity

## Why this skill exists

Toastly's frontend was not left to engineering discretion. It went through a deliberate pipeline: competitive teardown (Tinder, Bumble, Hinge, Grindr, Badoo, MyPerson) → a written brand brief → a Relume sitemap → per-page prompts → a Claude Design system and page-by-page prototype → a pre-build audit against the PRD. The result represents approved, reasoned decisions. Building against generic "good frontend practice" instead of the actual prototype will silently drift the product away from choices made for specific competitive and brand reasons.

## The prototype files

Located in `/design/prototype/`:

| File | Covers |
|---|---|
| `design-system.slim.html` | **Read first.** Colour tokens, type scale, component specs |
| `home.slim.html` | Home / landing |
| `features.slim.html` | Features (six deep-dive sections) |
| `how-it-works.slim.html` | Six-step journey |
| `pricing.slim.html` | Nigeria (₦) and Diaspora ($) tracks, coins |
| `safety.slim.html` | Safety & trust |
| `diaspora.slim.html` | Diaspora — both matching pools |
| `stories.slim.html` | Testimonials, gallery, community |
| `locked-inbox.slim.html` | **In-app** locked inbox state (not marketing) |
| `city-picker.slim.html` | **In-app** — diaspora metro picker, grouped by country, search-as-you-type. 52px rows, 44px clear control |
| `time-zone.slim.html` | **In-app** — single-select time zone, pre-filled from the device and confirmable |
| `feed-fallback-notice.slim.html` | **In-app** — band above the feed when a city pool isn't open; the six are still shown |
| `both-clocks.slim.html` | **In-app** — Gist scheduling with both local times; offers tomorrow rather than a 3am slot |
| `date-spot.slim.html` | **In-app** — post-Gist venue suggestion; cafés and restaurants, books nothing |
| `genotype-consent.slim.html` | **In-app** — the separate permission step; Agree disabled until ticked, Not now at equal weight |
| `genotype-entry.slim.html` | **In-app** — six same-weight values, nothing preselected |
| `genotype-visibility.slim.html` | **In-app** — four options, "Only me" default and tagged |
| `genotype-display.slim.html` | **In-app** — one neutral fact chip, or nothing at all; never colour-coded |
| `genotype-settings.slim.html` | **In-app** — settings row, bottom-sheet delete, toast |
| `brand-the-stake.slim.html` | **Adopted brand mark ("The Stake") — binding.** Mark geometry, palette roles, lockups, do/don't |
| `brand-assets.slim.html` | **Production brand assets.** PWA icons, favicons, vector masters, social exports, splash |

Open the specific file for the page you are building. Building the Pricing page from the Home page's components is not fidelity.

## Design tokens

**`design-system.slim.html` is the authoritative token source.** It defines a fuller ramp (22 named steps) than any prose list — including `Green 100 #CCE1DE`, `Green 700 #002A24`, `Gold 100 #FFEFCC`, `Gold 800 #4C3500`, `Grey 100 #F2F2F2` and `Ink 800 #1E1C21`. **All ramp steps in that file are approved.** Encode the full ramp in `tailwind.config.ts` as named tokens; where this document and the file differ, the file wins.

`green-550 #00453C` is an approved 23rd ramp step — Verified Real badge text, a contrast fix at badge size.

Replace `theme.colors` rather than extending it, so no unapproved colour is reachable. Two different failure modes, both verified against this config: `@apply bg-blue-500` in CSS is a hard build error, but `bg-blue-500` as a class in markup emits **no CSS and fails silently** — the element just renders unstyled. Review markup classes by eye; the build will not catch them.

Core values:

- **Deep green (primary ground):** `#001F1B` · **Forest (secondary dark ground):** `#002A24` · **Teal:** `#00695C` · deeper `#005449`, lighter `#4C968C` · tint `#CCE1DE`
- **Amber (primary action):** `#FFB300` · hover `#FFC94C` · deep `#CC8F00` · tint `#FFEFCC` · shade `#4C3500`
- **Sand/champagne:** `#EBD9AE` · **Paper/cream (light ground):** `#F6F2EA` · tints `#FFF7E5`, `#E5F0EE`
- **Ink:** `#050309` · `#1E1C21` · **Muted:** `#504E52`, `#828184`, `#D9D9DA`, `#F2F2F2` · **White:** `#FFFFFF`
- **Accents:** `#9B1348` (deep rose), `#2F8F5B` (green)
- **Type:** `Aleo` (serif — headings/wordmark, fallback Georgia) + `Inter` (sans — body/UI)

Take the type scale, radii (6/10/12/16/999px) and section rhythm from the same file.

## Dark mode: none — do not build one

Toastly has **no dark theme.** The prototype uses dark *sections* on light pages, and the brand system treats deep green as a **ground**, not a mode. Any `.dark` values currently in the Tailwind config are provisional: leave them, do not extend them, do not test against them, and do not add `dark:` variants to components. If dark mode is ever wanted it goes through the design pipeline — it must never be inferred from section backgrounds.

## The brand mark: "The Stake" — fixed, do not redraw

`brand-the-stake.slim.html` is binding. Two overlapping coin rings above a line, derived from the coin-deposit mechanic — the overlap is two people meeting halfway, the line is the table they both showed up to.

- **Geometry (fixed):** 48-unit grid · rings radius 9.5, stroke 3, centres at x19 and x29 (10-unit offset, overlap one third of each ring) · line 32 wide × 2.4 tall, fully rounded, 4.5 below the rings, centred.
- **Palette roles:** on dark — sand `#EBD9AE` left ring, amber `#FFB300` right. On light — deep green `#001F1B` left, amber deep `#CC8F00` right.
- **Clear space:** one ring radius all sides. Wordmark sits one ring radius right of the mark, optically centred on the rings.
- **Scale:** line drops out below 24px; two rings alone at favicon size.
- **Shipped artwork already exists** — `public/icons/` (PWA icons + favicons) and `brand/stake/` (vector masters, lockups). Use those files; do not regenerate or resample them.
- **Never:** add a crown, star or sparkle · recolour a ring outside the palette or fill rings solid · set the wordmark in anything but Aleo Bold, or stack it above the mark · place the mark on photography without a solid ground.

## What "matching the prototype" means

- **Structure over decoration.** Section order, heading hierarchy and component boundaries carry through. Not "use the same colour" — "build the same page."
- **Tokens are shared, not per-component.** Define once; reference everywhere.
- **Distinct sections stay distinct.** The Home "Journey" section, the Features deep-dives (alternating image left/right, 4:3), and the Stories gallery each have their own treatment. Do not collapse any of them into a repeating icon-card grid — that generic pattern is exactly what the design was built to avoid.
- **Two-currency pricing stays separate.** The ₦ and $ tracks are tabbed/separated, never one blended table.
- **Diaspora keeps both matching cases visible** — "back home" and diaspora-to-diaspora, both named.
- **Copy tone is part of the design.** The coin-deposit feature is framed warmly ("showing up for each other"), never punitively. Carry this into any copy you write or edit.

## Known prototype ↔ PRD conflicts

A pre-build audit found these. **`PRD.md` wins on content; the prototype wins on layout and visuals.** If a corrected prototype has already been re-exported, verify before assuming:

1. **Home page** claimed Couple Mode + AriyaPlanner are "included on Premium Plus." **Wrong** — they are free on every tier including Starter, as `pricing.slim.html` correctly shows. Build the free version.
   **Pricing carries six further conflicts** beyond the charity item, found during build (not previously documented here): (a) Why-pay copy sells "Live video, Couple Mode and the AriyaPlanner handoff" as what Premium Plus buys — Couple Mode and the handoff are **free on every tier**; (b) Premium Plus features omit incognito, which it includes; (c) Diaspora ($15) shown without advanced filters, which it has; (d) priority support shown on Premium and Diaspora — it is **top tier of each track only**; (e) the comparison table has **no chat row**, omitting the defining Starter limitation (the receive-locked inbox) — a row was added, since CLAUDE.md requires the lock be framed transparently, never hidden; (f) no incognito row. **Note the earlier wording in this doc — that `pricing.slim.html` "correctly shows" free Couple Mode — is true of its tier cards only, not its Why-pay copy.** That imprecision let conflict (a) survive the Home re-export.
2. **How It Works** said "5 free sessions a month on Starter." **Wrong** — it is **2**.
3. **Pricing** describes forfeited no-show coins going to a charity chosen by the other person. **Now resolved — the charity mechanic is rejected.** The ratified rule (`PRD.md` §5.5) is that a forfeited stake becomes a **non-withdrawable stake credit for the user who showed up**, usable only as the deposit on a future date. **Omit the charity copy as well as the mechanic** — shipping the words without the pipeline is a public promise about where users' money goes. Build the deposit/stake copy, say nothing about the destination unless implementing the credit.

## Gaps: decided here, not transcribed

These are not in any prototype. They are recorded so they read as decisions
rather than as fidelity, and so they can go back through the design pipeline.

- ~~Footer link groupings~~ — **withdrawn, this was wrong.** The prototype
  *does* group the footer: Product (Features, How it works, Pricing,
  Diaspora), Trust (Safety & Trust, Verification process, Stories), then a
  "Planning a wedding?" AriyaPlanner block, with Privacy / Terms / Community
  guidelines on the bottom rule. The headings sit in the markup as `h2`s and
  were missed by a data-array search. Transcribed now.
- **Route paths** behind the nav and footer links.

**App-surface screens built in Prompt 3, none of which the prototype covers.**
The only in-app screen in the design is `locked-inbox.slim.html`, and that is
a component-state demo — a tab-bar badge and a list row — not a shell. These
were built from design-system tokens and should go through the design
pipeline before launch: sign-up, sign-in, the auth shell, the verification
flow (phone / liveness / optional NIN), the in-app header, and the profile
editor. Two new components came with them, also unapproved: a block-level
`Notice` (the system has field-level messages only) and a `Stepper`, drawn as
rings filling along a rule so it borrows the mark's own logic rather than
inventing a new one.

**Header "Sign in" — added by decision, not in the prototype** (2 October
2026). The approved header had no route to an account: both "Get verified"
actions pointed at Pricing. Now a quiet champagne "Sign in" text link sits
before "Get verified" on desktop and as the last row of the mobile menu, and
the amber buttons ("Join Toastly", mobile "Get verified") go to `/signup`.
The desktop "Get verified" text link still goes to `/verify`. Send the
header's signed-out and signed-in states through the design pipeline.

**In-app navigation — built against nav-*.slim.html** (replaces the in-app
shell flagged as invented). Bottom tab bar on phones (Today, Gists, Inbox,
Profile), the same four in the dark desktop header, the Safety pill on every
screen's band, and Profile as the hub. Deviations, flagged:
- Today's band subline reads "Refreshes daily", not "Refreshes 6:00 am": the
  six are rebuilt at midnight UTC (1:00 am in Lagos), so 6:00 am would be untrue.
- The hub's photo is a monogram, and "Edit profile and photos" reads "Edit
  profile", until photo upload exists (Prompt 14, parked).
- "Answer another prompt" under the hub's prompts, and the pages it and the
  hub lead to (/profile/prompts, /profile/data, /profile/edit), are not drawn.
- Today's page content is unchanged: the prototype's six-row list is a
  navigation demo, not a redesign of the match card.
- On the safety kit itself the band omits the Safety pill.

**Gist invites — built against gist-invite-*.slim.html and gists-list.slim.html
(prototypes 1–8), and Both Clocks' window picker.** Deviations, flagged:
- Monograms stand in for member photos: photo upload is part of Prompt 14
  (parked).
- Age and profession are omitted from the person rows: date of birth is
  private, and profession follows its owner's visibility setting.
- Copy changed by decision (a Gist counts when it connects, for both
  people): the received screen's "It's free to accept" gains, for Starters,
  "If the call happens, it counts as one of your 2 Gists this month"; the
  limit screen's "You can still accept Gist invites… always free" became
  "Invites others send you will still arrive, but you can't accept one
  until your Gists reset."
- "Photos match their selfie" reads "Passed a live selfie check" until the
  photo match ships (a constraint check holds it).
- "Amaka sees this answer… If she says yes" uses "they"; the message
  placeholder is generic.
- Not drawn, built from the same cards: the sender's "Waiting on …" state;
  confirming a picked time; waiting after "Start now"; declined and closed
  invites staying under "Waiting on them" for a week; one clock per row
  for a same-zone pair in the picker.
- The question deck now appears once the call is live (gist-accepted:
  "The questions open once you've both joined").

**Gist call — NOT IN THE PROTOTYPE.** No Gist room was designed. The call
card (join, timer, who's speaking, mute, leave, the "Add 18
minutes" offer) is built from the session page's existing cards, buttons
and the genotype callout style. Send it through the design pipeline.

**Toastly Help and Answer Mirror — built against their prototypes**
(`toastly-help`, `toastly-help-handoff`, `answer-mirror`). Not in them, and
so flagged:
- The "Toastly Help" button that opens the panel (the prototype says it
  opens from Settings, Verification and Payments but draws no trigger).
- The safety card shown when a member describes danger.
- The panel's frame: a right-hand sheet, full-width on phones.
- "Your prompts" on the profile page — the list that leads to the edit
  screen. The prototype designs the edit screen only.
- The edit screen's back chevron is omitted; Cancel returns to the profile.
- Answer Mirror has four labels, as the prototype draws, not the build
  prompt's five.

**Verification (Smile ID) — 1 of 6 prototypes received.** The verify page
now follows `verify-overview.slim.html`: the dark "Verification" band, the
ring stepper (which replaces the old `Stepper`), and its four states. The
other five screens specified in `design/prompts/verification-screens-prompt.md`
— before your selfie, checking, outcomes, ID check, ID outcomes — have not
been exported. They are built in `components/verify/verify-flow.tsx` from the
overview's own cards and buttons and the genotype consent checkbox, and are
**not design-approved**. Deviations from the received overview, flagged:
- No back chevron in the "Verification" band: the page has no meaningful
  back target, and the app header sits above it.
- Two stepper states the prototype doesn't draw: phone not yet confirmed
  (rule empty) and the ID check being checked (amber arc on a dashed ring,
  rule at 83.3%).
- The photo-visibility choice (decision (c)) sits under the passed states.
- The old "Verification is free" notice and "What we never do" card are
  gone — the overview has neither, and the prompt bars any mention of a plan
  in this flow.
- The ID check offers three equal options (NIN, Virtual NIN, BVN); the
  prompt drew two. Virtual NIN was added by a later instruction.
- A sandbox test-identity picker appears only while `SMILE_ID_ENV=sandbox`,
  and never on the live site unless the tester's email is allow-listed.

**App-surface screens built in Prompts 4–9, also outside the prototype.**
The match card (feed), the Gist session list and room, the inbox list, the
wallet, Couple Mode, and the safety kit at `/safety-kit` (`/safety` is the
marketing page). The inbox's locked row follows `locked-inbox.slim.html`; the
list around it does not. New components with them: `SafetyActions` (the
report/block disclosure), `ReportForm`, `BlockButton`, `BlurredImage`,
`ShareDate` (panic plus share-your-date) and `SafetySettings`. The panic
button uses the `error` token (`#9B1348`, deep rose) as a button ground — no
variant in the design system does, so treat it as an unapproved variant.

**Five of these gaps are now closed.** The diaspora city picker, the
time-zone field, the feed fallback band, the both-clocks display and the
date-spot card were built ahead of their designs and have since been exported
as prototypes — `city-picker`, `time-zone`, `feed-fallback-notice`,
`both-clocks` and `date-spot` (all `.slim.html`, listed in the table above).
Each has been rebuilt against its own file and is no longer invented UI. Three
deviations are recorded in `FINAL-REVIEW.md` §1: the date-spot photo and
distance panel are omitted for want of data, three prototype colours fall
outside the approved ramp and use `green-550`, and the both-clocks window
picker has no home until a propose-a-time screen exists.

**Genotype UI — now covered.** The five genotype screens were exported as
prototypes (listed above) and `components/genotype/` is built against them.
The rule that governs all five: **no value is ever shown in a different
colour, style or weight from another** — a coloured SS or a green AA is a
compatibility verdict by other means. Deviations are recorded in
`FINAL-REVIEW.md`.

**Deliberate deviation — the "Default" tag is 12px, not 11.5px.** The
visibility prototype sets the tag on "Only me" at 11.5px, below the 12px
minimum the mobile audit enforces for legible text on low-end Android. It
is rounded up to the `chip` token (12px), the same call already made for the
city picker's 11px "Pool not open" chip. Decided by the product owner,
2 October 2026. Do not restore 11.5px to match the prototype.

Deferred on purpose, to be built against the screen that needs them rather
than guessed in the abstract: toast/notification, modal, pagination,
skeleton/loading, empty states. None appear on a marketing page — they are
app-surface concerns for later prompts.

**Avatar shape — settled, do not re-derive.** The prototype never writes
`border-radius:50%`, so searching for it returns zero and wrongly suggests
rounded rectangles. It writes `999px`. Person avatars ARE circles, 44-52px.
Story and gallery photography is a separate shape: a 16px rounded rect at
4/3, 5/4, 1/1, 4/5, 16/10 or 16/11. **A 1:1 story tile is a rounded rect,
not a circle — never circle-crop it.**

## When the prototype doesn't cover something

1. **Never invent a component and ship it silently.** Flag it: "The prototype doesn't cover X — here's an approach consistent with the existing tokens, but it hasn't been design-approved."
2. **Extend from existing tokens and patterns**, not from shadcn/ui defaults.
3. **Record the gap** so it can go back through the design pipeline rather than accumulating undocumented one-offs.

## Common failure modes

- Falling back to a generic SaaS card-grid for feature lists — the exact weakness the design was benchmarked against (MyPerson.ng).
- Heart, flame or swipe-card iconography anywhere. There is no swipe mechanic; do not build swipe gestures.
- Accepting shadcn/ui default styling instead of adapting components to the prototype.
- Treating the prototype as inspiration. Small "close enough" deviations compound into a product that no longer matches what was designed.
- Missing that `locked-inbox.slim.html` is an **in-app** screen, not a marketing page — it has different layout rules.

## When prototype and technical constraint genuinely conflict

Some static patterns will not map cleanly to Next.js/React/PWA — an animation approach, or an image-heavy hero conflicting with the data-light requirement (`PRD.md` §5.8). **Preserve the visual and structural intent, adapt the implementation.** Never silently drop fidelity to simplify the code; state the tradeoff explicitly rather than deciding it unilaterally.

## Mobile is not optional

The majority of Nigerian traffic is mobile, on low-end Android. Every page must be verified at narrow viewports with adequate touch targets. A page that matches the prototype at desktop width but breaks on mobile has not met this skill's bar.
