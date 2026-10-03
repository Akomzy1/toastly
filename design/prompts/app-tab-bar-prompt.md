# Toastly — In-app Navigation (Tab Bar): Claude Design Prompt

Run in the same Claude Design session as the verification, genotype and
Gist-invite screens. This is the **in-app** shell, in the register of
`locked-inbox.html` — whose single tab icon with an amber unread badge is
the only piece of in-app navigation designed so far. Export each screen as
its own HTML file.

**Why now (3 October 2026):** the in-app pages have no navigation. The header
holds only the wordmark and "Sign out", so a member who finishes setting up
their profile has nowhere to go. A temporary "Go to today's six" button sits
at the end of the profile page until this lands.

---

## PROMPT

Continuing in the established Toastly design system and the **in-app**
register — design the app's main navigation. **Mobile-first at 360px, then
320px, then desktop.** Touch targets at least 44px, text at least 12px.
Existing tokens and components only. No new colours.

### What the member needs to reach

Four everyday destinations, as a bottom tab bar on phones:

1. **Today** — today's six matches (the feed). The heart of the product.
2. **Gists** — invites for you, waiting on them, coming up (the screen in
   `gists-list.html`).
3. **Inbox** — messages. Uses the existing tab icon and amber badge from
   `locked-inbox.html`.
4. **Profile** — your profile, prompts, settings.

These are reached **from Profile**, not as tabs: Wallet (coins and date
deposits), Couple Mode, Safety kit, Verification, Toastly Help, Your data.
Show how Profile lists them — a quiet list, not a grid of icon cards.

**The Safety kit must be reachable in one tap from any screen** as well as
from Profile. It is never paywalled. Decide where it lives — for example a
small shield action in each screen's dark band — and show it on at least two
screens.

### Rules that govern the design — non-negotiable

- **The inbox badge is a bare count only.** "1", "3" — never a name, photo or
  preview. On Starter, messages are locked until upgrade; the badge must not
  reveal anything more than the count.
- **Calm, not compulsive.** No red dots, no flames, no hearts, no streaks, no
  counts on Today or Gists. Scarcity is the brand: six a day, for everyone.
  Gists may show a single quiet marker when an invite is waiting for you, if
  you think it's needed — it must never read as a nag.
- **No swipe.** Navigation is tapping only.
- **Active tab** is clear without colour alone (label weight or an underline
  as well as colour) for accessibility.
- **Installed PWA:** respect the phone's bottom safe area (home indicator).
- **Desktop:** the same four destinations in the existing dark header, not a
  bottom bar.

### Screens

**1. Tab bar on Today** — the active-tab state, with the Inbox badge showing
"2". Also show the Inbox tab with no badge.

**2. Tab bar on Gists** — Gists active, with and without the waiting-invite
marker (if you add one).

**3. Profile as the hub** — the list leading to Wallet, Couple Mode, Safety
kit, Verification, Toastly Help and Your data, under the existing profile
content. Replaces the temporary "Go to today's six" button.

**4. Safety kit, one tap away** — the always-available entry point shown on
two different screens.

**5. Desktop header** — the four destinations in the dark header, active
state shown.

---

Export five files: `nav-today.html`, `nav-gists.html`, `nav-profile-hub.html`,
`nav-safety-entry.html`, `nav-desktop.html`. Do not change any existing
screen.

---

*End of prompt.*
