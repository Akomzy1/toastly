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
| `brand-the-stake.slim.html` | **Adopted brand mark ("The Stake") — binding.** Mark geometry, palette roles, lockups, do/don't |
| `brand-assets.slim.html` | **Production brand assets.** PWA icons, favicons, vector masters, social exports, splash |

Open the specific file for the page you are building. Building the Pricing page from the Home page's components is not fidelity.

## Design tokens

**`design-system.slim.html` is the authoritative token source.** It defines a fuller ramp (22 named steps) than any prose list — including `Green 100 #CCE1DE`, `Green 700 #002A24`, `Gold 100 #FFEFCC`, `Gold 800 #4C3500`, `Grey 100 #F2F2F2` and `Ink 800 #1E1C21`. **All ramp steps in that file are approved.** Encode the full ramp in `tailwind.config.ts` as named tokens; where this document and the file differ, the file wins.

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
2. **How It Works** said "5 free sessions a month on Starter." **Wrong** — it is **2**.
3. **Pricing** describes forfeited no-show coins going to a charity chosen by the other person. This was generated by the design tool and is **not yet a ratified product decision** — do not build charity disbursement without explicit confirmation.

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
