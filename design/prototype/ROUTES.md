# Prototype → route map

Every prototype in this folder, the route or component it governs, and where
the build stands. Updated 2026-10-05, when the seven design zips (46 screens)
were slimmed in. Read the `.slim.html`; the bundled `.html` beside it is the
original export.

**Status:** **Built** — implemented against this file. **Update** — the route
exists but this newer export changes it. **Not built** — no route yet.

## Marketing (newer exports replaced the tracked files)

| Prototype | Route | Status |
|---|---|---|
| `home` | `/` | **Update.** Newest export (`home-diaspora-offer` in the zip) adds "AI, on your side", the women-abroad Diaspora Plus offer and plan-aware pool copy. |
| `features` | `/features` | **Update.** Adds section 09 "AI, on your side". It describes Toastly Help and Answer Mirror, which aren't built (Prompts 15–16): public copy the build doesn't yet honour. |
| `diaspora` | `/diaspora` | **Update.** Pools now say which plan opens what (`diaspora-pools` in the zip). |
| `pricing` | `/pricing` | **Update.** Women abroad get Diaspora Plus (`pricing-offer` in the zip). |
| `how-it-works`, `safety`, `stories` | as named | Built. The 2026-10-02 How It Works re-export has no visible change and wasn't taken. |

## Going live, photos, verification

| Prototype | Route / component | Status |
|---|---|---|
| `profile-not-live` | `components/app/profile-not-live.tsx` (in place of feed, Gists, inbox) | **Built** |
| `profile-access-paused` | same component, paused state | **Built** |
| `photos-upload` | `/photos` | **Built** |
| `photos-main-check` | `/photos` — a first main photo not confirmed | **Built** |
| `photo-replace-main` | `/photos` — replacing a matched main photo | **Built** |
| `verify-overview` | `/verify` | Partly. Predates the reorder (photos before the selfie) and marks its own ring stepper "not yet design-approved"; the existing stepper stays. |

## Your data

| Prototype | Route | Status |
|---|---|---|
| `your-data` | `/account` | **Built.** Genotype and "Open to people living abroad" rows wait for those settings. |
| `account-delete` | `/account/delete`, `/goodbye` | **Built.** The "open review" line waits for the review state. |

## Review console (staff)

| Prototype | Route | Status |
|---|---|---|
| `review-queue` | `/review` | **Built** |
| `review-case` | `/review/[id]` | **Built.** Photo and selfie checks get Confirm match / Not a match in place of the generic five actions (flagged). |
| `review-history` | `/review/history` | **Built** |

## Not built yet

| Prototype(s) | Where it goes | Scheduled |
|---|---|---|
| `nav-today`, `nav-gists`, `nav-profile-hub`, `nav-safety-entry`, `nav-desktop` | The app shell (`app/(app)/layout.tsx`): tab bar, profile hub, desktop header | Not in the current build order — **gap** |
| `gist-invite-starter`, `-paid`, `-limit`, `-sent`, `-received`, `gist-accepted`, `gist-invite-outcomes`, `gists-list` | `/feed` reply flow, `/gist`, `/gist/[id]` — replace the invented UI there | Not in the current build order — **gap** |
| `coins-balance`, `coins-get`, `coins-get-usd`, `coins-checkout` | `/coins` and checkout | Prompt 17 |
| `date-stake-confirm`, `date-checkin`, `date-cancel`, `date-outcomes` | Dates (new routes) | Prompt 17 |
| `open-to-abroad` | Match preferences, members in Nigeria | "Open to people living abroad" |
| `pool-choice` | Match preferences, members abroad (today a select in `/profile`) | With the diaspora items |
| `genotype-consent`, `-entry`, `-visibility`, `-display`, `-settings` | Profile and settings | Not scheduled — **gap** |
| `toastly-help`, `toastly-help-handoff` | Toastly Help (Prompt 15) | Not scheduled — **gap** |
| `answer-mirror` | Prompt-answer feedback (Prompt 16) | Not scheduled — **gap** |

## Screens the product needs that no prototype covers

- **The selfie capture itself** — Smile ID's in-browser camera, onboarding and replacement. Its UI comes from the vendor SDK; how Toastly frames it isn't designed.
- **"Before your selfie" and "Check your ID" consents.** The wording is final; the layout borrows `photo-replace-main`'s consent block.
- **Telling a member their account is restricted or removed**, with a reason category (CLAUDE.md). Built as invented UI (`components/app/standing-notice.tsx`) — needs a design.
- **Staff sign-in and access** for the review screen.
- Long-standing, from earlier prompts: sign-up / sign-in, the profile editor, the feed match card, the Couple Mode screen and the in-app safety kit.

## Prototype conflicts

- `nav-profile-hub` labels the coins entry **"Wallet"**. "Wallet" is banned from UI copy (decided 2026-10-05); build it as "Coins".
- `profile-not-live` and `profile-access-paused` list **Toastly Help**, which doesn't exist yet; the row is left out until it does.
- `verify-overview` shows the selfie before photos; the decided order is photos first, then one selfie.
