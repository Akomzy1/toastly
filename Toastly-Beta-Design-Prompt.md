# Toastly — founding-members beta: screens to design

For Claude Design. The build is ready for these screens (migration 0050, `lib/beta.ts`,
`POST /api/beta/apply`, the staff functions, `submit_beta_feedback`). **No UI has been built
for any of them** — none is in `design/prototype/`, and the build does not invent UI. Please
design them in the approved Toastly system (deep green / black / gold, editorial serif
headline + clean sans body, subtle motion, no swipe / flame / heart clichés), then drop the
HTML into `design/prototype/` and the build will follow it exactly.

Decisions already made (owner, 25 October 2026): 200 founding members, Lagos only for now,
3 months of Premium free from the day Toastly opens to everyone, applications open 27 October.

**Hard rules for every screen below**

- A founding member is never marked anywhere. No badge, label, ribbon or "founder" styling on
  any member-facing screen, and nothing that reads as a prestige or elite marker.
- The invite-only message is one sentence, whatever the reason: *"Toastly is invite-only for
  now. Apply at trytoastly.com/beta."* Never design a state that tells someone their number
  applied, is waiting, was waitlisted or was declined.
- No export button, no "message applicants" button anywhere on the staff screens.

---

## 1. `/beta` — the application page (public, no sign-in)

A marketing-side page (same header and footer as Home / How It Works).

**Copy (exact)**

- Heading: *Join the Toastly founding members beta.*
- Body: *Toastly is a verified dating-to-marriage app for Nigerians. We're opening to 200
  founding members in Lagos first. Everyone is verified with a selfie check before they appear.
  Applying doesn't guarantee a place.*
- Perk line: *Founding members get 3 months of Premium free from the day Toastly opens to
  everyone. It doesn't stack with other offers.*
- Consent tick: *I agree Toastly can use these answers to choose beta members.*
- After submit, Lagos: *Thanks. We'll message you if you're chosen.*
- After submit, anywhere else: *Thanks. We're starting in Lagos. We'll let you know when we open
  where you live.*

**Fields, in order**

1. First name (text).
2. Age (number, 18+).
3. Gender — Woman / Man (the app's two options).
4. "Where do you live?" — Lagos / Elsewhere in Nigeria / Outside Nigeria.
   - If **Lagos**: a select — Lekki, Victoria Island/Ikoyi, Ajah, Yaba, Surulere, Ikeja,
     Ikorodu, Maryland, Festac, Other Lagos.
   - If **Elsewhere in Nigeria** or **Outside Nigeria**: free text, "the state or country".
5. Phone number — Nigerian (+234) only, because the sign-in code only works for Nigerian numbers
   for now. Say so in a hint.
6. "How did you hear about us?" — select. Proposed options (please confirm or change):
   Instagram, TikTok, X (Twitter), WhatsApp, A friend, An event, Searching online, Somewhere else.
7. Consent tick (above).
8. A **hidden honeypot field** named `website` — invisible, off-screen, `tabindex=-1`,
   `autocomplete=off`. It is not part of the visual design.

**States to design**: empty; the two "where do you live" branches; field errors (name, age under
18, phone not a Nigerian number, consent missing — one line each, warm, specific); submitting;
success (Lagos) and success (elsewhere) — a calm confirmation, not a celebration; "too many
tries, try again in an hour"; "applications aren't open yet" (they open 27 October); "something
went wrong, try again". Mobile first.

Collect nothing else: no photos, ethnicity, religion, health or income, and no email.

## 2. The phone step when a number isn't invited

The existing verify phone step (`verify-overview` / phone step) needs one error state for the
sentence above — shown inline where the other phone errors show. It is the same for every
unapproved number. A link to `/beta` is welcome inside it.

## 3. Staff — beta approvals (behind the existing staff console)

Built like the review console (`review-queue` / `review-case` patterns): a list, filters, and a
detail-light table. A new "Beta" area of the console.

- **Counts strip**: by status (pending / approved / waitlisted / declined), by gender (with the
  approved split against the target — default 55% women / 45% men — as a gentle progress, not a
  block), by Lagos area, and places left of the cap (default 200).
- **Waitlisted elsewhere**: its own small panel, separate from the Lagos list — the demand
  signal for opening other places (Elsewhere in Nigeria / Outside Nigeria counts).
- **List**: first name, age, gender, area (or the place they typed), how they heard, applied
  date, status, wave. Filters: status, gender, Lagos area. Select rows; batch actions **Approve
  (with a wave number)**, **Waitlist**, **Decline**; also per-row.
- Only an **approved, not-yet-signed-up** application shows the phone number (so the owner can
  send the invitation by hand on WhatsApp). Make it easy to read and copy. Nothing else shows a
  number.
- Errors come back as sentences from the database ("That would go over the cap of 200…", "The
  beta is open to Lagos only for now…") — leave room to show them.
- **Settings panel** (staff-editable): total cap, target women %, applications open date, and
  "beta closes at" (empty = the beta is open).
- A read-only "founding members so far" count and, once set, the public launch date.
- No export. No messaging.

## 4. The "Beta" label in the app header

A small, quiet "Beta" mark beside the Toastly logo in the in-app header (`nav-*` prototypes), on
mobile and desktop. Not a founding-member marker — every member sees it, it says the product is
in beta.

## 5. Settings → "Send feedback"

In the member Settings. A text area, a category (Bug / Idea / Safety / Other), and — not shown as
a field — the page the member was on. States: empty, sending, sent ("thank you"), the daily limit
("That's plenty for today — thank you. Try again tomorrow."), error. When **Safety** is chosen,
show a short line that for anything urgent they should use Report or Toastly Help, which are
faster — feedback is read by the team but not watched live.

## 6. Staff — beta feedback

A simple list in the staff console: time, category, page, the member's short label, and the
text. Filter by category. Read only.
