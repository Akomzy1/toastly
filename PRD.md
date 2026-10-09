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
- Mandatory verification before a profile goes live: **phone code → liveness selfie**. Passing the liveness selfie earns the **"Verified Real" seal** — the product's central trust signal, held by every visible member. *(Corrects an earlier definition that tied Verified Real to the NIN/BVN check; the shipped How It Works copy — "your seal goes live before your profile does" — and the designed verification screens both make the selfie the seal.)*
- **Optional ID check** — NIN, Virtual NIN or BVN via Smile ID Biometric KYC (number matched against the official record *and* to a new selfie) adds a **second ring** to the seal. Never presented as missing, never nagged. Toastly stores only the outcome.
- Verification and core safety are **never paywalled**.
- Women's safety kit: photo-reveal control, share-your-date/panic feature, unsolicited-image blur, report/block.
- No phone number is ever required to talk, call, or Gist in-app (VoIP-based calling). Any number-sharing affordance (e.g., a "share contact" button) is withheld until a trust threshold (completed video Gist + mutual "continue," or Couple Mode entry) — but free-text chat is never scanned, blocked, or policed.

### 5.1.2 Profile photos — minimum four, one face-matched (decided)

The liveness selfie proves a real person is behind the phone; it does **not** prove the profile photos are that person. Without a link between the two, a scammer passes liveness with their own face and then uploads a stolen photo set — a catfish wearing a Verified Real seal. Closing that gap is a launch requirement, not a Phase 2 signal.

- **Minimum 4 photos to go live** (maximum set in config, default 6). Hinge requires six, so four is not heavy-handed.
- **The primary photo must be a clear face photo that matches the liveness selfie**, checked automatically. No match → profile does not go live; borderline results go to human review, never auto-rejection.
- **The other three can be anything** — hobbies, places, food, moments. This keeps Toastly prompt-first rather than a face-rating app, and lets privacy-conscious members (women wary of exposure, single parents, widowed users) show one face rather than four.
- **Changing the primary photo re-runs the match.** A later mismatch is also a Trust Sentinel "verification drift" event (§5.1.1).
- **Biometric processing — covered by explicit consent.** The liveness consent covers comparing the selfie with the main profile photo. Toastly stores only the match outcome, never a face template.
- **No AI-generated or face-altering photos** of the member, stated in community rules; "these photos aren't them" is a first-class report category. No AI attractiveness scoring, ever.
- Photos are **compressed on the phone before upload** so four photos don't punish members on rationed data. The existing "show photos only to matches" setting still applies.
- Camera-roll or photo-library *scanning* (Tinder's Chemistry pattern) is **not** built — see §5.9 do-not-build list. Members upload what they choose; nothing else on their device is read.

### 5.1.1 Trust Sentinel — behavioural anti-scam agent (decided; Phase 1 signals, Phase 2 agent)

**What it is.** Verification today is a one-time gate — selfie liveness, optional NIN/BVN. A romance scammer passes that gate and then *behaves* like a scammer. The Trust Sentinel is an agent that watches behaviour over time and routes suspicious patterns to a **human review queue**. It turns "Verified Real" from a badge into a living system, and it is the one trust feature a competitor cannot copy quickly.

**Governing principle — agents in the infrastructure, never in the intimacy.** The Sentinel protects users; it never speaks for them, never coaches a conversation, never writes a message. That line is not negotiable and applies to every future agent in this product.

**Signals it uses — behavioural metadata only, never message content:**

| Signal | Why it matters |
|---|---|
| **Gist refusal pattern** — repeatedly declining or cancelling Gist while continuing to message | Scammers avoid live, structured, voice interaction. This is the strongest single signal and was already identified as a passive filter (§5.4); the Sentinel makes it active |
| **Escalation velocity** — unusually fast progression from match to Couple Mode requests, date requests, or off-platform contact affordances | Love-bombing cadence; genuine intent moves slower |
| **Profile-vs-Gist inconsistency** — self-reported profession, location or intent contradicted by Gist session outcomes (from the structured deck, not free speech) | Fabricated profiles are hard to sustain across an 18-minute structured conversation |
| **Report clustering** — multiple independent reports, especially in the "married" or "scam" first-class categories, within a short window | Corroboration across unrelated users |
| **Verification drift** — a verified selfie that no longer matches subsequent uploaded photos; NIN/BVN mismatch on re-check | Account handover or shared-account fraud |
| **Cross-tier arbitrage overlap** — payment-geography and phone-origin mismatches already captured for pricing integrity (§7) | Same signals, same queue; do not build two pipelines |
| **Coin-deposit no-show pattern** — repeated forfeits as the *absent* party | Correlates with accounts not operated in good faith |

**Signals it must never use:**
- **Message content.** The Sentinel does not read, parse, classify or score free-text chat. This extends the existing hard boundary in CLAUDE.md ("never scan chat for phone numbers") to *all* content analysis. Behaviour, not words.
- **Gist audio or transcripts.** Session *outcomes* from the structured deck (which questions were answered, the double-opt-in result) are usable. Raw audio and any transcript are not — and are not retained.
- **Protected attributes.** Tribe, religion, denomination, language, relationship history, profession, genotype and diaspora status are never inputs. A signal that would correlate with any of these (e.g. "diaspora accounts flagged more often") is a defect to be corrected, not a finding.

**Review-queue design:**
1. **Score, don't decide.** The Sentinel produces a confidence score and a plain-language reason ("declined 4 Gist invitations in 6 days while sending 40+ messages; 2 independent scam reports"). It never takes action on an account.
2. **Human review is mandatory.** A reviewer sees the reason, the signal history, and the account's verification record — never message content. Outcomes: clear, request re-verification, restrict (cannot initiate new matches pending re-verification), or remove.
3. **Never auto-ban.** Same rule as pricing-integrity signals. A false positive on a genuine user — a shy person who keeps postponing Gist — costs more trust than a delayed catch of a scammer. Restriction pending re-verification is the strongest automated step, and only above a high threshold.
4. **The flagged user is told something happened.** "We've asked you to re-verify" with a reason category — never silent shadow-restriction. Consistent with the transparency rule on the locked inbox: never present a restriction as a bug or an unexplained state.
5. **Audit trail.** Every score, every reviewer decision, every outcome — logged and reviewable. This is what makes the system defensible if challenged and improvable over time.
6. **Feedback loop.** Reviewer decisions retrain thresholds. The Sentinel gets better because humans correct it, not because it trusts itself more.

**Model use.** Continuous scoring is done by **deterministic rules plus a classical model** (e.g. gradient-boosted), not an LLM — an LLM is the wrong primary scorer for adaptive adversaries. Claude (Sonnet) writes the plain-language case summary for the human reviewer only. This is an infrastructure cost, never paywalled.

**Sentinel+ extensions (Phase 2, from the AI-agent research):**
- **Step-up re-liveness.** Above a high score, the account must pass a fresh Smile ID liveness check before its next Gist or date commitment. This answers real-time deepfake video — a video call alone no longer proves identity — and is the strongest automated step allowed (consistent with "restrict pending re-verification").
- **"Safety Check" — user-triggered, chat-free.** Any member, on any tier, can tap Safety Check on a match. A structured tap-through asks: have they asked for money, gift cards or crypto? refused to Gist on Toastly? claimed an emergency abroad? The agent returns plain-language guidance and offers to escalate to the review queue. **It never reads the conversation.**
- **Off-platform-contact signals come from UI events only** (e.g. use of a share-contact affordance), never from parsing message text.

**Success signal.** Scam-related reports per 1,000 active users falls after launch; false-positive rate on manual review stays below a threshold to be set from the first cohort (target: under 1 in 5 flags cleared as false positives, reviewed monthly). If the false-positive rate is high, loosen thresholds before adding signals.

**Phasing.** Phase 1 (MVP): capture every signal above as structured events — this is instrumentation and costs little. Phase 2: the scoring agent and review queue, once there is enough behavioural data to set thresholds from evidence rather than guesses. Building the agent before the data exists produces thresholds invented from nothing.

**What comes after (not now).** Two further agents follow the same infrastructure-not-intimacy line and are deferred until real session data exists: an adaptive Gist deck with a private per-person debrief (both-party consent, no transcript retention), and an autonomous AriyaPlanner handoff that assembles the wedding brief on engagement. Both are recorded in §11 as intent, not commitment.

### 5.2 Matching Mechanic
- Prompt-based profiles (Hinge-style), not infinite swipe. Curated daily match feed.
- **Intent selector on a spectrum** (see §5.3) — filterable, never a signup gate.
- Optional display fields, all display-only and never matching gates: religion, tribe/ethnicity, language.
- **Optional relationship-history field** (single, divorced, widowed, single parent + optional "has children" flag) — **user-controlled visibility** (default private/revealed-on-match, not public on the feed card, given real stigma in Nigerian culture); optional filters for/against.
- **Optional genotype field (decided)** — AA, AS, AC, SS, SC, or "I don't know yet". Included because genotype compatibility is a routine pre-marriage question in Nigerian families (two AS carriers risk an SS child), which makes it native to a dating-to-marriage product. **It is health data** — sensitive personal data under Nigeria's NDPA 2023 and special-category data under UK GDPR for diaspora users — so it is handled more strictly than any other optional field:
  - **Explicit consent at entry**, separate from general signup consent, stating what it is used for and who can see it. Deletable at any time, with deletion honoured fully.
  - **Private by default.** The user chooses to reveal it — to all matches, only after a Gist, or only in Couple Mode. Never shown on the public feed card by default. SS and SC individuals face real stigma; exposure must be their choice.
  - **Self-reported, never labelled verified.** No badge, no "confirmed" wording. Copy nudges users to confirm with a proper test if unsure.
  - **No automated compatibility verdict.** Toastly shows each person's stated genotype (where both have chosen to share) and links to plain-language information on what combinations mean. It does not label a pair "compatible" or "incompatible" — that is medical interpretation from self-reported data, and a wrong verdict in either direction causes real harm.
  - **No genotype filter (decided — corrects an earlier spec contradiction).** A filter was originally specified, but it cannot coexist with private-by-default: filtering the six-a-day feed would exclude members using health data they chose to keep hidden, and toggling it would let users infer private values. There is no search screen and none is planned. **Mutual reveal is the mechanism** — two people choose to share, then decide for themselves.
  - **Never an input to any model or agent** — not the Trust Sentinel, not matching, not any future agent.
  - **Excluded from the AriyaPlanner handoff brief.** Wedding planning does not need it; health data does not cross the product boundary.

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

### 5.2.3 Religion and denomination (decided)

Toastly is non-religious: faith is something members may show, never something the product sorts people by.

- **Religion (optional):** Christian, Muslim, Traditional, Spiritual but not religious, Not religious, Other (up to 30 characters), Prefer not to say.
- **Denomination (optional, new):** appears only after a member picks Christian or Muslim.
  - Christian: Catholic, Anglican, Methodist, Baptist, Presbyterian, Pentecostal, Orthodox, White-garment (Celestial, C&S, CAC), Non-denominational, Other (up to 30 characters).
  - Muslim: Sunni, Shia, Ahmadiyya, Other (up to 30 characters).
  - "Other" text is shown as typed and goes through the normal profile-text report flow. It is not pre-screened by a model.
- **One visibility setting covers both:** shown on the profile, or hidden. Hiding religion hides denomination. Default when first entered: shown. Never on the feed card; full profile only.
- **Consent:** the first time a member adds either field, record explicit consent with timestamp and wording version: "I choose to show my faith on my profile. Toastly never uses it to decide who sees me." Removing the field deletes the value. The consent record is then **marked withdrawn, with a timestamp — never deleted** — and kept as evidence of what was agreed and when; adding faith again asks again.
- **Filters:** every plan with advanced filters (Premium, Premium Plus, Diaspora, Diaspora Plus) may filter their own search by religion only (§5.2.4). There is no denomination filter, now or planned.
- **Never an input to anything else:** not the six-a-day selection (except the member's own religion filter, §5.2.4), not ranking, not the Trust Sentinel, not any AI model or agent payload, not PostHog (no property, no event value), not the AriyaPlanner handoff.

### 5.2.4 Self-applied filters and the full profile (decided)

**Self-applied filters.** Advanced filters are sold on the pricing page, so they exist at launch.
- **Plans:** Premium, Premium Plus, Diaspora and Diaspora Plus. Not Starter.
- **Filters at launch:** religion and tribe, multi-select each, with the note "Filters only change your own search. They never change who sees you."
- **A filter narrows only the filtering member's own six.** Nobody can see another member's filters, and a filter never changes who sees the member who set it.
- **Only shown values count.** A filter matches only values the other member has chosen to show; a hidden or empty value is never read. Each filter has "Include people who don't say", on by default.
- **Too few people: never widen silently.** Show those who match, up to six, with: "Only {n} people match your filters today. Widening them shows you more." plus a link to the filters.
- **Never filterable:** denomination, genotype, hidden relationship history, and anything not in the §7.1 advanced-filter list.
- **Storage and analytics:** filters are stored per member and deleted with the account. PostHog may get "filters changed", never which religion or tribe was chosen.

**The full profile** is the screen a member opens from a card in their six or from a match (a Claude Design pass for the whole screen comes first; nothing is built from a single row).
- **Who can open it — always two-way** (decided 7 October 2026). Members form a view of each other before deciding anything, so whenever one person can see the other, the reverse is true too. A member can open the full profile of:
  - **Your six:** anyone in their current six.
  - **Anyone who reaches out:** anyone who has replied to one of their prompt answers or invited them to a Gist, so they can decide with the same information the other person had about them.
  - **Matches and Gist partners:** both people, for as long as the match exists. A block ends it either way.
  - **No browse or search** of arbitrary profiles, and **no "who viewed you"** list or notification. Viewing a profile is never recorded anywhere the other member can read, and never announced.
- **Starter and the locked inbox.** A Starter member's inbox stays receive-locked (bare count, no sender) — that is the paid feature. So a text reply a Starter member can't read never opens its sender's profile for them; otherwise the profile would name who wrote. **A Gist invitation is different: on every plan, including Starter, the invited member always sees the inviter's full profile before accepting.** Nobody is asked to talk to someone they can't see; safety is never paywalled.
- **Enforced in the database**, not in the UI: who can open a profile is the access rule (migration 0032). Field visibility is enforced there too (decided 7 October 2026; migration 0033): other members read a profile only through one function that returns just the fields the owner shows that viewer — tribe, languages, religion and denomination, profession, education, relationship history, genotype, photos — and no member can select another member's profile row directly. Photos still follow the owner's reveal choice; when they aren't revealed to this viewer, the profile says "Photos appear once you match." "On match" fields count only a match the viewer can see, so a reply locked in a Starter inbox can never reveal itself.
- **What shows depends on the viewer:** each field renders per its own visibility rule for that viewer: relationship history only after a match unless the owner chose otherwise; genotype only where the owner chose to share with that viewer; faith only if shown. Hidden fields show nothing — no placeholder.
- It carries the photos, Verified Real seal, prompt answers (the thing a member replies to), intent and the details block. No field appears that the PRD doesn't define: "Children: Wants children" is not a PRD field and is not shown.

### 5.3 Intent Spectrum (critical constraint)
- Do not hard-gate on marriage at signup. Stated preference on a spectrum: *Just vibing → Getting to know people → Something serious → Marriage-minded.*
- Users filter on it; brand leans intentional without amputating top-of-funnel liquidity.

### 5.4 Gist — Structured Compatibility Sessions
- **Voice-first by default** (structured question deck, **18-minute time-box extendable once**, mutual opt-in, double opt-in "continue?" exit, no dead air).

**Session length — 18 minutes, extendable once (decided; corrects an earlier PRD-side error).** Earlier drafts and build Prompt 5 specified a 5–7 minute box. That figure was calibrated before Starter dropped to a handful of sessions a month (one, from 8 October 2026) and is incoherent with the product as built: at 7 minutes a free user gets a few minutes of conversation per month against ~180 possible matches, which cannot carry marriage intent, family expectations, money attitudes or japa plans. Three further reasons the longer box is correct: (a) the structured question deck — not brevity — is the real mitigation for dead air, so length stops being a risk once scaffolding exists; (b) shipped How It Works copy ("three of them tells you more than a month of texting") is only credible at 18 minutes; (c) a short timed call sits in speed-dating territory — MyPerson runs 60-second Spark dates — whereas 18 minutes extendable is the slow-dating position Toastly actually holds. **18 is already shipped in public copy on Home, How It Works and Features; those pages are correct and must not be edited down.** Data cost (~9–18 MB per session, ~9–18 MB/month at the Starter cap of one started Gist) is accepted, mitigated by voice-first default and auto-degrade to audio on weak connections.
- **Live video as a premium upgrade**, gated at the upper pricing tier, not the base tier (see §7). Auto-degrades to audio on weak connections.
- No mic/camera activates until both parties opt in. Screenshot/screen-record blocking on the video tier.
- Session data feeds the AriyaPlanner warm brief (see §6).

### 5.5 Coin-Deposit Date-Commitment
- Both parties stake a small coin deposit ahead of a confirmed date.

**The coin balance (decided — supersedes the earlier "future-stake-only credit" rule).** Every member has a **coin balance**. Stakes, forfeits and spending all move through it.

- **Both show up:** each stake returns to its owner's coin balance.
- **One doesn't show:** the absent member's stake moves to the coin balance of the member who showed up. Toastly keeps none of it.
- **Coins are spendable on any Toastly product**, including domestic subscriptions — so being stood up leaves you with something of real value, not just a token for another date.
- **Coins are never refunded or paid out as cash.** Purchase terms must say so clearly at the point of sale.

**Rules that keep it safe and legal:**
1. **It is a coin balance, never a "wallet".** A Nigerian product that holds value and moves it between users looks like e-money, which is CBN-licensed territory. The balance is **closed-loop**: coins are not money, cannot be withdrawn, cannot be sent between members by choice, and move between members **only** as the result of a stake outcome. The words "wallet", "escrow", "transfer" and "cash out" never appear in product copy. *(Legal confirmation required before launch — §11.)*
2. **Only purchased coins can be staked.** Any promotional or free coins sit in a separate, non-stakeable bucket. Otherwise one person with two accounts could stage no-shows and convert free coins into paid subscriptions.
3. **Coins are bought in the member's own currency.** Members in Nigeria buy coin packs in naira (card, transfer, USSD); members abroad buy them in **US dollars** (card or Apple Pay), as the Diaspora page already promises — nobody abroad is quoted in naira. A coin is the same coin once bought; only the purchase price differs by track.
4. **Coins pay domestic naira subscriptions only.** Diaspora subscriptions ($10/$20) must be paid in dollars. Letting naira-priced coins pay a dollar subscription would reopen the exact arbitrage §7's pricing-integrity rules close. Diaspora members can still use coins for stakes, extra Gists and other coin purchases. If a member abroad uses coins — however bought — on a naira plan, the pricing-integrity review signal is raised (§7); it is never blocked.
5. **Toastly never profits from a no-show.** Forfeited coins always go to the member who showed up.

**How attendance is decided (recommended default — overrule in §11 if needed):**
- Both members **check in at the venue in the app** during the date window, confirmed by location near the agreed spot. Location is used only for this check-in, with consent, and not retained beyond it.
- One checks in and the other doesn't → **provisional no-show**. The absent member can contest within **24 hours**; contested cases go to a person, never an automatic decision.
- **Cancelling in good time is always free** (cut-off configurable, default 12 hours before), and so is **rescheduling by mutual agreement**.
- **A safety cancellation never costs anything.** If a member pulls out because they feel unsafe, or reports the other person, their stake is returned in full. **The stake must never pressure anyone into meeting someone they're uneasy about.** This overrides every rule above.
- Repeated no-shows as the absent party are a Trust Sentinel signal (§5.1.1), not grounds for automatic action.

*History:* the prototype once described forfeited coins going to a charity — never ratified, never to be built or displayed. A later rule limited the credit to future date deposits; this section supersedes it.
- Framed warmly ("showing up for each other"), never punitively (contrast with MyPerson's escrow/forfeit language).
- Paired with a **lightweight date-spot suggestion** (maps-API lookup of nearby public venues, not a curated directory at MVP) surfaced after a strong Gist — doubles as a soft safety signal (public-venue nudge).

### 5.6 Diaspora Matching — who can match with whom (decided)

**The model: one Nigeria pool, which diaspora members can join.** "Back home" matching is not a separate pool. A member abroad who chooses **back home** or **either** appears in the Nigeria pool alongside Nigeria-based members, so matching runs both ways automatically. **Diaspora-to-diaspora** (abroad → abroad) is the only genuinely separate pool.

| Member | Matches with people in Nigeria | Matches with people abroad |
|---|---|---|
| Lives in Nigeria — any tier, free included | Yes | Yes — diaspora members who chose back home or either, unless they switch "Open to people living abroad" off (which also takes them out of those members' feeds) |
| Abroad — free (Starter) or a naira plan | Yes, via back home | **No** |
| Abroad — Diaspora or Diaspora Plus | Yes, via back home | Yes — diaspora-to-diaspora, city by city as each opens |

**Rules:**
- **Diaspora ↔ Nigeria is never paywalled.** Diaspora members' main draw is reaching home; Nigeria-based members never pay extra to meet someone abroad. Each person's normal tier rules still apply (a Starter still has one Gist of their own a month — accepting invitations is free — and no text).
- **Diaspora-to-diaspora requires an active Diaspora or Diaspora Plus plan.** This is the dollar plan's core benefit, and it is what makes paying in dollars worth it — the second half of the pricing-integrity approach in §7 ("narrow the incentive", alongside the review signals). A dual-resident or visitor on a naira plan still gets back home, which is the pool they most likely want. *(Decided earlier in the build and passed to Claude Code in chat but not recorded here, which let the code drift; recorded now.)*
- **Diaspora-to-diaspora also opens per diaspora city** only once that city has enough verified members — not globally at launch. When a paid member's city isn't open, the feed falls back to back home and says why (the feed-fallback notice). When a non-Diaspora-plan member abroad looks at diaspora-to-diaspora, it is shown honestly as a Diaspora-plan feature — a different message from the fallback notice.
- **Diaspora members choose their pool explicitly** — back home, my diaspora, or either — among the pools their plan allows.
- **Nigeria-based members get a setting: "Open to people living abroad"** — on by default, easy to switch off. Plenty of members want someone local and no long-distance or japa relationship. **It works both ways (decided 5 October 2026):** switched off, the member doesn't see members abroad and members abroad don't see them, so nobody abroad spends a Gist on someone who has said no to distance. It is still the member's own choice about their own matching; diaspora status must never be a ranking or scoring input.
- **Where a member lives is asked at sign-up, right after the phone code** (decided 5 October 2026): pre-selected from the phone's country code, always confirmed by the member; members abroad then choose their city. It changes in settings at most once every 30 days, and every change is logged. A paid plan runs to the end of its period, then renews on the new country's plans. Members who joined before the step existed are asked once, on their next visit.
- **Age range (decided 5 October 2026):** every member, free on every plan, sets the age range of their own six. It starts from a configurable range around the member's own age (four years below, five above, at least nine wide, on a scale of 18 to 70+). A member whose age isn't on record is never filtered out.
- **Diaspora location claims get extra scrutiny.** "I live abroad" is one of the oldest romance-scam cover stories (the oil-rig engineer, the soldier overseas, the customs fee). Profile country is checked against the phone's country code, the connection country at payment and the card's country, and mismatches go to the review queue as signals, never automatic action. The Safety Check (§5.1.1) asks *"Have they claimed an emergency abroad?"* Verified Real and the face-matched main photo do the heavy lifting; this is the backstop.

### 5.7 Couple Mode & AriyaPlanner Handoff
- Opt-in shared space for mutually-confirmed exclusive couples: milestones, saved dates, shared "our story" timeline.
- Milestone triggers (first date logged, "official," anniversary, **engagement** — the primary handoff trigger).
- On engagement: a **consent-gated** handoff into AriyaPlanner. **Each partner approves separately.** The brief is drafted only from fields the couple enters or explicitly chooses to copy across at handoff — city, rough date, guest-count band, budget band, and the ceremony formats they select (introduction, traditional, white wedding). **Nothing flows automatically from Toastly profiles**, because tribe, religion and similar fields are protected attributes that no agent may read (§5.9). Genotype is blocked at the schema level. *(Corrects an earlier "pre-filled from profile data" design.)*
- Couple data shared only with mutual consent, encrypted, never used to gate matching.

### 5.8 Data-Light / Distribution
- PWA-first, installable from browser, no app store required.
- Data-light mode for low-end Android and constrained connectivity.

### 5.9 AI agents — what Toastly builds, and what it refuses to (decided)

Source: the AI-agent research report (October 2026). The market is splitting: incumbents are putting AI *into* the conversation (Tinder Chemistry, Grindr's paid AI tier, Hinge's founder's Overtone), while users push back hard against AI-written messages ("chatfishing" — in one survey 65% of daters aged 21–35 said they'd be less likely to engage with someone who used AI to write their profile or messages). Toastly takes the opposite side: **agents make trust, logistics and the path to marriage effortless; every human moment stays unmediated.**

**Governing principles (apply to every agent):**
1. **Agents in the infrastructure, never in the intimacy.** No agent writes, suggests or rewrites messages or profile text, coaches a live conversation, or speaks for a member.
2. **Never reads private chats, never hears Gist audio.** Agents work from structured data, status codes and metadata.
3. **Protected attributes (tribe, religion, denomination, language, relationship history, profession, diaspora status) and genotype are never inputs** — blocked at the schema/feature-store level, not just in prompts.
4. **Always labelled as AI** at first contact (the EU AI Act Article 50 standard, used as the design bar everywhere). **No persona, no ongoing emotional chat** — task-scoped helpers only, which keeps Toastly clear of US companion-chatbot laws.
5. **Humans make consequential decisions.** No auto-bans; refunds, disputes and appeals go to people.
6. **Never paywalled** where an agent touches safety or verification.

**Vendor and architecture (decided):**
- **Claude only.** Do not add OpenAI as a second LLM vendor: its Agents API (public beta, Sept 2026) keeps session state only in the US and isn't eligible for zero data retention, its low-code Agent Builder is being retired, and a second vendor would double the DPIA and cross-border transfer work under Nigeria's GAID and UK GDPR. Revisit only if Claude clearly underperforms on Pidgin or Nigerian English in Toastly's own evals.
- **Stateless calls; state lives in Supabase.** No vendor-hosted agent sessions (neither OpenAI's Agents API nor Claude Managed Agents — both are stateful and not ZDR-eligible). Request zero data retention where eligible; redact before every call.
- **Toastly is not listed as an app inside ChatGPT.** ChatGPT apps must suit all audiences, OpenAI's review flags tools that ask for biometrics or government IDs, members' romantic disclosures would sit outside Toastly's processor agreement, and Premium can't be sold there. **Build MCP-native instead**, so a later read-only AriyaPlanner tool can serve both Claude and ChatGPT cheaply.
- Language: English and Pidgin for agent-facing UX; Yoruba, Igbo and Hausa as human-reviewed static copy only, never generated for anything safety-critical.

**The roadmap:**

| # | Agent | What the member experiences | Phase |
|---|---|---|---|
| 1 | **Verification & Support Concierge** | A labelled AI helper for liveness failures, ID-check options, payment problems, coin deposits and tier questions, in English or Pidgin. Sees status codes only — never selfies, ID numbers or chats. Hands refunds, disputes and appeals to a person. | **Now** |
| 2 | **Answer Mirror** | Private feedback on the member's own prompt answers ("specific enough", "add a detail only you could say"). **Feedback categories only — never suggested wording.** Toastly's public pledge: *Toastly AI will never write a word for you.* | **Now** |
| 3 | **Trust Sentinel+** | Behavioural scoring with step-up re-liveness and a user-triggered Safety Check (§5.1.1). | Phase 2 (pull forward if possible) |
| 4 | **Plan the Toast** | After both tap "let's meet": three time slots from structured availability and three vetted public venues; both pick by tapping; the agent handles the coin deposit, reminders, an optional share-my-date link and a "home safe?" check-in. Confirmations are system-authored ("Toastly scheduled…"), never written as either person. Extends the date-spot suggestion (§5.5). | Phase 2 |
| 5 | **Diaspora home windows** | Diaspora members set when they'll be back home (e.g. December); matches see it and can plan a first in-person meeting for that window. Uses location and time zone the member chose to share for scheduling — **diaspora status is never a ranking or scoring input.** | Phase 2 |
| 6 | **Adaptive Gist deck** | Both people opt in. The next card is chosen from a curated, human-written bank using only skip/extend/star metadata. Afterwards each person writes three private reflections, and the agent turns *their own words* into a personal note. Never infers anything about the other person; no audio, no transcript. | Phase 2 |
| 7 | **AriyaPlanner engagement brief** | Consent-gated per partner; drafted only from fields the couple enters or chooses to copy at handoff (§5.7). | Later |
| 8 | **Read-only AriyaPlanner MCP tool** | A no-login wedding budget and checklist tool, listable in Claude's connectors and the ChatGPT app directory as top-of-funnel. No personal data. | Later — experiment |

**Do not build** (each contradicts a rule above or has backfired elsewhere): AI openers, smart compose or reply suggestions; chat recaps, "smart inbox" or anything that reads messages; agent-to-agent dating; camera-roll or photo-library scanning; any paid AI tier that ranks visibility or predicts "who's into you"; an AI matchmaker "friend" persona; live AI on Gist (transcription, sentiment, chemistry scores); AI attractiveness scoring or AI-enhanced photos; automatic bans from a scam score.

## 6. AriyaPlanner Integration (strategic core, not a bolt-on)

- Toastly and AriyaPlanner share one spine: **Next.js 14 PWA + Supabase + Claude API + Paystack**. (WhatsApp Business Cloud API was considered for notifications and dropped — Meta's business verification process is unnecessary friction pre-launch; notifications run on Resend/email and in-app push instead. Revisit post-launch if a WhatsApp-native touchpoint becomes a real product need, not a nice-to-have.)
- Toastly is the acquisition engine; AriyaPlanner is the LTV engine. A single graduated couple can trigger multiple AriyaPlanner Event Passes (introduction ceremony, traditional wedding, white wedding, anniversaries, diaspora-abroad wedding variant).
- **Sequencing honesty:** wedding revenue is long-tail (Nigerian courtship-to-wedding runs 1–4 years) — it is the LTV/moat story, not the launch P&L. Near-term revenue runs on domestic coins + diaspora subscriptions.
- Integration point: a shared identity/account layer enabling the warm handoff. This is a **later phase**, not part of Toastly's MVP scope — MVP should be built with the handoff *contract* in mind (what data Couple Mode captures, in what shape) even before the live integration exists.

## 7. Monetisation

| Layer | Mechanism | Notes |
|---|---|---|
| Domestic coins | ₦500–₦5,000 packs via Paystack/Flutterwave/USSD/bank transfer/OPay | Date stakes, unlocking the locked inbox, additional Gist sessions, unlock "who liked you", paying domestic naira subscriptions. Held in a closed-loop coin balance, never refunded as cash (§5.5). **No Boosts, no Super Likes** — see §7.2 |
| Domestic subscription | Premium ~₦3,500/mo; Premium Plus ~₦7,000/mo (unlocks live-video Gist when it ships, advanced filters) | Benchmarked directly against MyPerson's published pricing |
| Diaspora subscription | $10–20/mo via card/Apple Pay | Covers both back-home and diaspora-to-diaspora matching |
| AriyaPlanner wedding funnel | Multiple ₦50,000 Event Passes per graduated couple | LTV engine, not launch revenue |
| Trust | Free, always | Verification and safety features are never paywalled |
| Women's launch offer | **30 days free Premium Plus (decided) — or 30 days free Diaspora Plus for women abroad**, so the offer matches their track and includes diaspora-to-diaspora matching. **Starts at go-live, not sign-up** (§7.3) | Not base Premium — Premium Plus includes live-video Gist once it ships (incognito is not built, decided 8 October 2026). Note: shorter than MyPerson's 90-day offer, so Toastly wins on tier but loses on the directly-comparable duration number — monitor whether 30 days is long enough to correct the gender ratio at launch |

### 7.1 Tier-by-tier package (corrected, authoritative)

The first Claude Design pass on the pricing page (below) got most of this right but made one structural error and filled in a few numbers that were never actually decided. This table is the corrected, binding version — it supersedes anything shown in generated design output where they conflict.

| Feature | Starter (Free) | Premium (₦3,500/mo) | Premium Plus (₦7,000/mo) |
|---|---|---|---|
| Verified Real profile | ✅ | ✅ (everything in Starter, plus:) | ✅ (everything in Premium, plus:) |
| Daily match feed | ✅ (6/day — **fixed, not a paid upgrade**) | ✅ (6/day — see note below) | ✅ (6/day) |
| Text chat | **Receive-locked (decided):** Starter users CAN receive messages from any match, and see only a bare count — **"1 new message" (or a running count for multiple)** — with **no sender name, no photo, and no text preview shown**. Message **content is fully blurred/locked until upgrade**. Starter cannot send free text at all. Framed transparently as a paid feature ("New message waiting — Premium unlocks your inbox"), never presented as a bug or hidden without explanation | ✅ Unlimited send + receive | ✅ Unlimited send + receive |
| Gist sessions (voice) | ✅ **1/month (decided 8 October 2026; was 2)** — with chat removed, this is Starter's *only* outbound channel. It counts only a Gist the member **started** and only when it **connects**; accepting an invitation is free and never counts, so a Starter can still talk to everyone who invites them. Coins can buy one extra | ✅ Unlimited | ✅ Unlimited |
| Gist sessions (video) | ❌ | ❌ | ✅ Live-video Gist — **Phase 2 (§9), not built yet; voice-only at launch. Listed only while `VIDEO_GIST_ENABLED` is on (decided 8 October 2026); off, Home, How It Works and Features say "Voice first. Live video is coming to Premium Plus."** |
| Coin-deposit dates | ✅ | ✅ | ✅ |
| **Couple Mode + AriyaPlanner handoff** | ✅ **Free/universal — moved here, not tier-gated** | ✅ | ✅ |
| Advanced filters (tribe, religion, state, diaspora, intent) — faith: religion only, never denomination (§5.2.3) | ❌ | ✅ | ✅ |
| Incognito mode | ❌ | ❌ | ~~✅~~ **Not built — not listed anywhere (decided 8 October 2026)** |
| See-who-liked-you | Coin-purchasable à la carte | Coin-purchasable à la carte, or included at a to-be-decided level | Included — **not built yet (no "like" exists to see). Listed only while `SEE_WHO_LIKED_ENABLED` is on (decided 8 October 2026)** |
| Priority support | ❌ | ❌ | ✅ ("from Lagos") |
| Read receipts | N/A on Starter (no chat to have receipts on) — **still flagged, not decided for paid tiers** | | |

**Flagged consequences of the Starter changes (implemented as decided, but worth tracking):** Starter's existing subheading — "Everything you need to meet someone properly" — is now inaccurate and should be rewritten, since a locked inbox and one started conversation a month is a materially thinner free experience than that copy promises. The "reply to a specific prompt answer to start something" flow described earlier also needs re-scoping: a Starter user can't send an initial text reply, so their only outbound move is proposing their one monthly Gist session — inbound messages from other users (including paid-tier matches) arrive as a locked/blurred notification instead. This significantly raises the liquidity risk already flagged in §10 (chicken-and-egg liquidity); worth watching closely post-launch. The locked-inbox mechanic itself is a proven high-converting pattern (validated by direct founder experience with a comparable app), but it sits closer to a manipulative "dark pattern" than anything else in this product's design — the transparency requirement above (clearly label it as a paid feature, never hide it silently) is there specifically to keep it consistent with the trust-first brand rather than undermining it.

**Diaspora tier package (decided):**

| Feature | Diaspora ($10/mo) | Diaspora Plus ($20/mo) |
|---|---|---|
| Verified Real profile | ✅ | ✅ (everything in Diaspora, plus:) |
| Matching pools | Both — "back home" and diaspora-to-diaspora | Both |
| Gist sessions (voice) | ✅ **Unlimited (decided)** — see rationale below | ✅ Unlimited |
| Gist sessions (video) | ❌ | ✅ Live-video Gist — **listed only while `VIDEO_GIST_ENABLED` is on** |
| Time-zone aware scheduling | ✅ | ✅ |
| Advanced filters | ✅ | ✅ |
| Couple Mode + AriyaPlanner handoff | ✅ Free/universal, same as domestic | ✅ |
| See-who-liked-you | Coin-purchasable | Included (decided 8 October 2026) — **listed only while `SEE_WHO_LIKED_ENABLED` is on** |
| Priority support | ❌ | ✅ |

**Plus plans at launch (decided 8 October 2026):** with live video in Phase 2 and incognito not built, Premium Plus and Diaspora Plus add only priority support over Premium and Diaspora (and see-who-liked-you once its flag is on). They stay at ₦7,000 and $20 as they are — not repriced or hidden.

**Rationale for unlimited voice Gist on Diaspora ($10), not a numeric cap:** the original "10/month" placeholder created a hidden pricing inconsistency worth catching — domestic Premium at ₦3,500/mo already gets unlimited voice Gist, and Diaspora at $10/mo (from 8 October 2026; was $15) is still priced well above domestic Premium at current exchange rates, making it diaspora's *Premium* tier, not its *Starter* tier. Capping it below what domestic Premium gets meant a diaspora user would pay several times more for a strictly worse Gist allowance — undermining trust with exactly the users the ARPU model depends on most. Diaspora ($10) now has parity with domestic Premium on Gist; the only differentiation between Diaspora and Diaspora Plus is live video, consistent with the video-always-gated-at-top-tier rule used everywhere else.

### 7.2 No Boosts, no Super Likes (decided — corrects an earlier PRD error)

Earlier drafts of §7.1 listed Boosts and Super Likes as coin purchases. **That was a carry-over from the Tinder/Bumble/Badoo teardown and does not survive contact with Toastly's own mechanic.** With a fixed six-a-day feed, a Boost can only mean appearing in more people's six — which is buying attention, the precise thing the brand is built against. Super Likes are already denied by shipped copy on Home: *"no streaks, no 'you've been super-liked'."*

**Coins therefore have five honest jobs, none of which buy placement in anyone else's feed:**
1. Date stakes (the coin-deposit commitment)
2. Unlocking the locked Starter inbox
3. Additional Gist sessions beyond the tier allowance
4. Unlocking see-who-liked-you (the user's own data about themselves — it changes nothing in another user's feed)
5. Paying for a **domestic naira subscription** (Premium or Premium Plus) — never a diaspora dollar subscription (§5.5)

**Shipped Pricing copy (ratified):** *"Nobody buys your place in the six… paying can improve how well those six are matched to you, it never buys you more of them."* This is now literally true. Paid tiers may improve **match quality and ordering within a user's own six**; nothing a user buys inserts them into another user's six.

**Corrections made to the first design pass:**
1. **Couple Mode + AriyaPlanner handoff must be free/universal, not locked behind Premium Plus / Diaspora Plus.** This is Toastly's core differentiator and its actual LTV engine (Part 4 of the strategy doc) — gating the entry point to the wedding funnel behind the top subscription tier means a couple who falls for each other on Starter or base Premium never reaches AriyaPlanner unless they happen to upgrade at exactly the right moment. If a paywall belongs anywhere near this feature, it goes on *enhanced* Couple Mode extras, never on the bridge itself.
2. **"6 matches a day" must not become "more matches for higher tiers."** The scarcity (6, once daily, gone if unused) is a stated brand principle, not a limitation to upsell against — Premium's "priority match feed" should mean better placement/visibility within the same 6, not a larger daily count. Confirm this explicitly in copy so it can't be read as "pay for more matches."
3. **Premium's card must state "Everything in Starter, plus:"** — as written, it's ambiguous whether subscribing to Premium keeps Verified Real, the daily feed, and coin-deposit dates, or replaces them.
4. **Session-cap numbers are now decided: Starter = 1 started Gist a month (8 October 2026; earlier 2, and before that the 8/5/10 placeholders, are superseded), Diaspora = unlimited** — see §7.1.
5. **Read receipts need a deliberate yes/no, not a default inclusion** — flagged as a possible tone mismatch, not rejected outright.

**Pricing-integrity requirement:** prevent diaspora users from registering as domestic to dodge diaspora pricing via **signal-stacking, not a wall** — payment-method geography (strongest, already in payment data), phone number origin, a light IP check at signup/payment only (not continuous tracking), NIN/BVN where used. Mismatches trigger **manual review, never auto-ban** (a dual-resident or visiting user must not be auto-flagged). Also narrow the incentive itself: price diaspora as a proportionate multiple of domestic, keep domestic Premium Plus genuinely valuable.

### 7.3 Onboarding and payment (decided 8 October 2026)

**Nobody pays to join, and nobody pays before going live.** The order, as built: the account form (first name, email, password, date of birth 18+, **woman or man**) → phone code → 4 photos → selfie (Verified Real and the main-photo match) → **at least one prompt answer** → the profile goes live. Country and city are set on the profile. (An earlier draft put the phone code first; the account form stays first — decided 8 October 2026.)

- **Woman or man (decided 8 October 2026):** every member is a woman or a man — nothing else. Asked at sign-up; locked once live (support changes it). **A man meets women and a woman meets men, only** — there is no separate "who you'd like to meet" question. Enforced in the database: two members are in each other's six, can reply, invite each other to a Gist or open each other's profile **only if one is a woman and the other a man**. Members who chose Non-binary or Prefer not to say before this are asked to choose woman or man and aren't live until they do; choosing then doesn't start the women's offer (it starts only at a first go-live).
- **One prompt answer before go-live (decided 8 October 2026):** a profile with no answer can't go live — the six is built from answers, and an empty profile gives nobody anything to reply to.

- **No plan screen, upgrade prompt or payment UI of any kind before go-live.** Plans, coins, checkout and coin-paid plans need a live profile — enforced in the database (a new checkout can't be opened, coins can't pay a plan) and on every route, not just hidden in the app.
- **At go-live — women:** women in Nigeria get 30 days of Premium Plus; women abroad get 30 days of Diaspora Plus. No card. **The 30 days start at go-live, not sign-up.** A notice three days before the end, in the app and by email. On day 30 she moves to the free plan. Never charged automatically.
- **At go-live — everyone else:** one plan screen with "Start free" as an equal choice. Nigeria: Starter / Premium ₦3,500 / Premium Plus ₦7,000. Abroad: free / Diaspora $10 / Diaspora Plus $20. One tap to skip.
- **After go-live, upgrade prompts appear only in context, at a limit:** a locked message, a reply attempt, the Gist cap reached, filters, the diaspora pool (video and see-who-liked-you once their flags are on). Each names the plan and its price, from config, and has "Not now". The Gist cap opens the in-app plan screen. **Never in front of a safety feature:** on the locked inbox, report and block come first and the upgrade sits apart, below them.
- **An extra Gist with coins (decided 8 October 2026):** at the Gist cap, the "You've used this month's Gist" screen shows the price with **[Use coins]** and **[Not now]**, and beneath: "Or get unlimited Gists with Premium · ₦3,500/mo" (abroad: "with Diaspora · $10/mo"), prices from config. The price is ₦1,000 in Nigeria and $3 abroad, in coins at the built pack rate, rounded to whole coins — **10 coins** (₦100 a coin) and **15 coins** ($0.20 a coin) — both in config (`plan_config.extra_gist_coins_ngn`, `extra_gist_coins_usd`). [Use coins] sends the invite marked as paid with coins; **the coins come off only when the call connects, once** — however often anyone rejoins — and **nothing is spent if it never connects**. Accepting an invitation stays free. Gift and bought coins can both pay (gift first); stakes still need bought coins. A Gist paid with coins doesn't use the month's free one.
- **Refunds (decided 8 October 2026):** Stripe and Paystack refunds are processed automatically. A refunded plan ends; coins held towards it come back as coins; unspent coins from a refunded purchase are removed; if some were already spent — or a refunded subscription still renews, or a refund is partial — staff get a case. **Coins are never refunded as cash.**
- **Protecting the offer:** gender can't be changed in the app once live (through support only); the offer is granted at most once per verified face and once per phone number; a confirmed false gender goes through the review queue, never automatic action — on a "Not who they say they are" report, a reviewer can correct the gender, which ends the offer. Audit-logged, and the member is told with a reason category.
- **Card country (decided 8 October 2026):** Stripe's card issuing country is read on every settlement and feeds the pricing-integrity review, as Paystack's already does. A review signal, never a block.
- **Launch switch.** Until launch day, payments stay closed behind one server-side flag (`LAUNCH_PAYMENTS_ENABLED`, off by default): no plan screen, checkout or coin purchase completes for anyone but an allow-list of staff and test accounts. Launch day is flipping it on; nothing else changes.

## 8. Design & Frontend Requirements

- **The build must match the approved prototype HTML/design system exactly** — see `CLAUDE.md` for the binding instruction. The prototype (generated via Relume sitemap → Claude Design) is the source of truth for layout, spacing, component structure, and visual tokens (color, type scale, motion). Engineering does not improvise new UI patterns not present in the prototype without an explicit design-change request.
- Visual direction: deep green/black/gold jewel-tone palette (not Tinder's flame gradient or MyPerson's pink), editorial serif/high-contrast display headline type + clean sans body, real/warm Nigerian photography, subtle motion (no swipe-card animation, no flame/heart clichés).
- Explicit benchmark: must read as more premium and considered than MyPerson.ng's current site.

## 9. Phasing

> **Build-sequence note:** the Claude Code build sequence (`build-prompts.md`) implements Phase 1 across Prompts 0–12. A post-build audit found Prompts 0–9 omitted three Phase 1 items — diaspora matching pools, date-spot suggestion, and time-zone-aware Gist scheduling — now covered by Prompts 10–11, with Prompt 12 handling the domain change to **trytoastly.com**, app icons, stubbed-integration checklist and WhatsApp removal. Live video Gist transport was built in Prompt 5 ahead of its Phase 2 slot; nothing is owed there beyond credentials.

- **Phase 1 (launch):** **A staff review screen for the single human-review queue — a launch blocker**, since pricing signals, Sentinel flags, borderline photo and selfie matches, blind reports, married-user reports and attendance disputes all end in "a person reviews it" (shows the reason and the evidence the rules allow, never message content; actions: clear, ask to switch plan, request re-verification, restrict, remove; every decision audit-logged), Verification/trust layer **including the four-photo minimum with face match (§5.1.2)**, **Verification & Support Concierge and Answer Mirror (§5.9)**, **Trust Sentinel signal instrumentation (events only, no agent — §5.1.1)**, prompt-based matching, intent spectrum, voice Gist (default), coin-deposit date commitment, lightweight date-spot suggestion, Couple Mode (data capture only), women's safety kit, PWA, domestic coins + subscription, "back home" diaspora matching + diaspora subscription. Launch in Lagos only.
- **Phase 2:** **Trust Sentinel+ — scoring, human review queue, step-up re-liveness and Safety Check (§5.1.1)**, **Plan the Toast, diaspora home windows and the adaptive Gist deck (§5.9)**, 1:1 live video Gist (premium), hosted live-streaming/matchmaker channel (once verified liquidity exists — MyPerson already runs this live, so this should not be pushed indefinitely), diaspora-to-diaspora matching unlocked per qualifying city.
- **Later phase:** Live AriyaPlanner handoff integration (shared identity/account layer) **with the consent-gated engagement-brief agent**, **a read-only AriyaPlanner MCP tool (§5.9)**, fuller curated date-venue directory (if usage justifies content-ops investment), public/host matchmaker partnerships (bringing existing Facebook/TikTok matchmakers on as ambassadors).

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| "Runs"/transactional dating reputation | Intentionality-first brand, verified-only, no punitive framing on safety features |
| Yahoo/catfish/scam | Mandatory verification, structured Gist as a natural scam filter, re-verification on flags |
| Chicken-and-egg liquidity | City-by-city launch (Lagos first), women-first seeding (mirrors MyPerson's "women get 90 days free" — validated necessity, not optional) |
| Starter tier too restrictive to build liquidity (no chat, 1 started Gist/month; accepting is free) | A deliberate tradeoff, not an oversight — monitor match-to-conversation conversion closely post-launch; be prepared to loosen the cap if it's suppressing volume rather than driving upgrades |
| Gender imbalance | 30 days free Premium Plus for women at launch — Diaspora Plus for women abroad (decided, see §7) — shorter than the competitor's 90-day equivalent, so watch female retention past day 30 closely and be prepared to extend if the ratio doesn't hold |
| Low domestic willingness-to-pay | Coins + diaspora cross-subsidy; do not assume subscription-only will work domestically |
| Diaspora-diaspora liquidity fragmentation | Per-city unlock, not global at launch |
| WhatsApp leakage | Own the relationship layer (Couple Mode), not the chat pipe; never police number-sharing in free text |
| Long lag to wedding revenue | Fund the business on dating + diaspora; AriyaPlanner is LTV upside, not launch P&L |
| Diaspora pricing arbitrage | Signal-stacking + manual review, not aggressive auto-enforcement |

## 11. Open Questions (not yet decided — do not assume answers)
- **Coin balance legal check (§5.5):** confirm with a Nigerian lawyer that a closed-loop, non-withdrawable coin balance moved only by stake outcomes falls outside CBN e-money and payment-service licensing; and confirm the no-refund terms are enforceable for UK diaspora buyers under consumer law.
- **Attendance method (§5.5):** venue check-in by location is the recommended default; the cancellation cut-off (default 12 hours) and the 24-hour contest window are configurable and not yet final.
- **AI-agent prerequisites (§5.9):** run Toastly's own Pidgin and Nigerian-English evals before relying on Claude for agent copy; request zero data retention from Anthropic; get counsel's view on whether any task-scoped agent could count as a "companion chatbot" under US state law before serving US diaspora members; complete a GAID DPIA for each agent before launch.
- **Plan the Toast depends on the share-your-date / panic design**, which is still unspecified (trigger, countdown, SMS-only vs link).
- **ID-number fingerprint:** whether to store a keyed hash of NIN/BVN to stop one ID verifying multiple accounts and removed members returning — recommended, not yet decided.
- **Face-match provider:** confirm Smile ID can compare an uploaded profile photo against the enrolled liveness face before adding any other biometric vendor.
- Trust Sentinel false-positive threshold — set from the first cohort's review outcomes, not pre-launch (§5.1.1).
- Two follow-on agents are recorded as **intent, not commitment**: an adaptive Gist deck with private per-person debrief (both-party consent, no transcript retention), and an autonomous AriyaPlanner handoff that drafts the wedding brief on engagement. Neither is scoped, costed or scheduled.
- ~~Free-tier limit on voice Gist sessions~~ — **decided:** Starter = 1 started Gist a month (accepting is free), Diaspora = unlimited (see §7.1).
- Handoff-conversion rate assumptions for the AriyaPlanner funnel (strategic thesis, not yet evidenced — validate with first cohort).
- Exact city-unlock threshold for diaspora-to-diaspora matching and for Phase 2 live-streaming.
