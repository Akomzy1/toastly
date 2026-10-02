# Mobile audit

Run 2026-10-02 13:28 UTC against `http://localhost:3000`. Viewports 320×568 and 360×640, device scale 2, touch.

Checks: **overflow** (scrollWidth > innerWidth), **targets** (every visible a/button/input/select/[role=button]/[role=tab] at least 44×44px), **text** (no visible text under 12px).

The in-app surfaces are measured through `/audit/*` harness routes that render the real components with mock data; those routes 404 unless `AUDIT_HARNESS=1`.

| Route | Width | Overflow | Targets ≥44px | Text ≥12px | Network idle | Screenshot |
|---|---|---|---|---|---|---|
| `/` | 320 | pass | pass | pass | pass | `mobile\home-320.png` |
| `/` | 360 | pass | pass | pass | pass | `mobile\home-360.png` |
| `/features` | 320 | pass | pass | pass | pass | `mobile\features-320.png` |
| `/features` | 360 | pass | pass | pass | pass | `mobile\features-360.png` |
| `/how-it-works` | 320 | pass | pass | pass | pass | `mobile\how-it-works-320.png` |
| `/how-it-works` | 360 | pass | pass | pass | pass | `mobile\how-it-works-360.png` |
| `/pricing` | 320 | pass | pass | pass | pass | `mobile\pricing-320.png` |
| `/pricing` | 360 | pass | pass | pass | pass | `mobile\pricing-360.png` |
| `/safety` | 320 | pass | pass | pass | pass | `mobile\safety-320.png` |
| `/safety` | 360 | pass | pass | pass | pass | `mobile\safety-360.png` |
| `/diaspora` | 320 | pass | pass | pass | pass | `mobile\diaspora-320.png` |
| `/diaspora` | 360 | pass | pass | pass | pass | `mobile\diaspora-360.png` |
| `/stories` | 320 | pass | pass | pass | pass | `mobile\stories-320.png` |
| `/stories` | 360 | pass | pass | pass | pass | `mobile\stories-360.png` |
| `/privacy` | 320 | pass | pass | pass | pass | `mobile\privacy-320.png` |
| `/privacy` | 360 | pass | pass | pass | pass | `mobile\privacy-360.png` |
| `/signup` | 320 | pass | pass | pass | pass | `mobile\signup-320.png` |
| `/signup` | 360 | pass | pass | pass | pass | `mobile\signup-360.png` |
| `/audit/locked-inbox` | 320 | pass | pass | pass | pass | `mobile\audit-locked-inbox-320.png` |
| `/audit/locked-inbox` | 360 | pass | pass | pass | pass | `mobile\audit-locked-inbox-360.png` |
| `/audit/city-picker` | 320 | pass | pass | pass | pass | `mobile\audit-city-picker-320.png` |
| `/audit/city-picker` | 360 | pass | pass | pass | pass | `mobile\audit-city-picker-360.png` |
| `/audit/time-zone` | 320 | pass | pass | pass | pass | `mobile\audit-time-zone-320.png` |
| `/audit/time-zone` | 360 | pass | pass | pass | pass | `mobile\audit-time-zone-360.png` |
| `/audit/feed-fallback` | 320 | pass | pass | pass | pass | `mobile\audit-feed-fallback-320.png` |
| `/audit/feed-fallback` | 360 | pass | pass | pass | pass | `mobile\audit-feed-fallback-360.png` |
| `/audit/both-clocks` | 320 | pass | pass | pass | pass | `mobile\audit-both-clocks-320.png` |
| `/audit/both-clocks` | 360 | pass | pass | pass | pass | `mobile\audit-both-clocks-360.png` |
| `/audit/date-spot` | 320 | pass | pass | pass | pass | `mobile\audit-date-spot-320.png` |
| `/audit/date-spot` | 360 | pass | pass | pass | pass | `mobile\audit-date-spot-360.png` |
| `/audit/genotype-consent` | 320 | pass | pass | pass | pass | `mobile\audit-genotype-consent-320.png` |
| `/audit/genotype-consent` | 360 | pass | pass | pass | pass | `mobile\audit-genotype-consent-360.png` |
| `/audit/genotype-entry` | 320 | pass | pass | pass | pass | `mobile\audit-genotype-entry-320.png` |
| `/audit/genotype-entry` | 360 | pass | pass | pass | pass | `mobile\audit-genotype-entry-360.png` |
| `/audit/genotype-visibility` | 320 | pass | pass | pass | pass | `mobile\audit-genotype-visibility-320.png` |
| `/audit/genotype-visibility` | 360 | pass | pass | pass | pass | `mobile\audit-genotype-visibility-360.png` |
| `/audit/genotype-settings` | 320 | pass | pass | pass | pass | `mobile\audit-genotype-settings-320.png` |
| `/audit/genotype-settings` | 360 | pass | pass | pass | pass | `mobile\audit-genotype-settings-360.png` |
| `/audit/genotype-delete` | 320 | pass | pass | pass | pass | `mobile\audit-genotype-delete-320.png` |
| `/audit/genotype-delete` | 360 | pass | pass | pass | pass | `mobile\audit-genotype-delete-360.png` |
| `/audit/genotype-display` | 320 | pass | pass | pass | pass | `mobile\audit-genotype-display-320.png` |
| `/audit/genotype-display` | 360 | pass | pass | pass | pass | `mobile\audit-genotype-display-360.png` |
| `/audit/account-data` | 320 | pass | pass | pass | pass | `mobile\audit-account-data-320.png` |
| `/audit/account-data` | 360 | pass | pass | pass | pass | `mobile\audit-account-data-360.png` |
| `/audit/account-delete` | 320 | pass | pass | pass | pass | `mobile\audit-account-delete-320.png` |
| `/audit/account-delete` | 360 | pass | pass | pass | pass | `mobile\audit-account-delete-360.png` |

## Failures

None.
