# Mobile audit

Run 2026-10-03 13:14 UTC against `http://localhost:3000`. Viewports 320×568 and 360×640, device scale 2, touch.

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
| `/login` | 320 | pass | pass | pass | pass | `mobile\login-320.png` |
| `/login` | 360 | pass | pass | pass | pass | `mobile\login-360.png` |
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
| `/audit/gist-call` | 320 | pass | pass | pass | pass | `mobile\audit-gist-call-320.png` |
| `/audit/gist-call` | 360 | pass | pass | pass | pass | `mobile\audit-gist-call-360.png` |
| `/audit/help/start` | 320 | pass | pass | pass | pass | `mobile\audit-help-start-320.png` |
| `/audit/help/start` | 360 | pass | pass | pass | pass | `mobile\audit-help-start-360.png` |
| `/audit/help/reply` | 320 | pass | pass | pass | pass | `mobile\audit-help-reply-320.png` |
| `/audit/help/reply` | 360 | pass | pass | pass | pass | `mobile\audit-help-reply-360.png` |
| `/audit/help/pidgin` | 320 | pass | pass | pass | pass | `mobile\audit-help-pidgin-320.png` |
| `/audit/help/pidgin` | 360 | pass | pass | pass | pass | `mobile\audit-help-pidgin-360.png` |
| `/audit/help/offer` | 320 | pass | pass | pass | pass | `mobile\audit-help-offer-320.png` |
| `/audit/help/offer` | 360 | pass | pass | pass | pass | `mobile\audit-help-offer-360.png` |
| `/audit/help/passed` | 320 | pass | pass | pass | pass | `mobile\audit-help-passed-320.png` |
| `/audit/help/passed` | 360 | pass | pass | pass | pass | `mobile\audit-help-passed-360.png` |
| `/audit/help/safety` | 320 | pass | pass | pass | pass | `mobile\audit-help-safety-320.png` |
| `/audit/help/safety` | 360 | pass | pass | pass | pass | `mobile\audit-help-safety-360.png` |
| `/audit/answer-mirror/before` | 320 | pass | pass | pass | pass | `mobile\audit-answer-mirror-before-320.png` |
| `/audit/answer-mirror/before` | 360 | pass | pass | pass | pass | `mobile\audit-answer-mirror-before-360.png` |
| `/audit/answer-mirror/great` | 320 | pass | pass | pass | pass | `mobile\audit-answer-mirror-great-320.png` |
| `/audit/answer-mirror/great` | 360 | pass | pass | pass | pass | `mobile\audit-answer-mirror-great-360.png` |
| `/audit/answer-mirror/specific` | 320 | pass | pass | pass | pass | `mobile\audit-answer-mirror-specific-320.png` |
| `/audit/answer-mirror/specific` | 360 | pass | pass | pass | pass | `mobile\audit-answer-mirror-specific-360.png` |
| `/audit/answer-mirror/detail` | 320 | pass | pass | pass | pass | `mobile\audit-answer-mirror-detail-320.png` |
| `/audit/answer-mirror/detail` | 360 | pass | pass | pass | pass | `mobile\audit-answer-mirror-detail-360.png` |
| `/audit/answer-mirror/short` | 320 | pass | pass | pass | pass | `mobile\audit-answer-mirror-short-320.png` |
| `/audit/answer-mirror/short` | 360 | pass | pass | pass | pass | `mobile\audit-answer-mirror-short-360.png` |
| `/audit/verify/start` | 320 | pass | pass | pass | pass | `mobile\audit-verify-start-320.png` |
| `/audit/verify/start` | 360 | pass | pass | pass | pass | `mobile\audit-verify-start-360.png` |
| `/audit/verify/before-selfie` | 320 | pass | pass | pass | pass | `mobile\audit-verify-before-selfie-320.png` |
| `/audit/verify/before-selfie` | 360 | pass | pass | pass | pass | `mobile\audit-verify-before-selfie-360.png` |
| `/audit/verify/checking` | 320 | pass | pass | pass | pass | `mobile\audit-verify-checking-320.png` |
| `/audit/verify/checking` | 360 | pass | pass | pass | pass | `mobile\audit-verify-checking-360.png` |
| `/audit/verify/review` | 320 | pass | pass | pass | pass | `mobile\audit-verify-review-320.png` |
| `/audit/verify/review` | 360 | pass | pass | pass | pass | `mobile\audit-verify-review-360.png` |
| `/audit/verify/retry-spoof` | 320 | pass | pass | pass | pass | `mobile\audit-verify-retry-spoof-320.png` |
| `/audit/verify/retry-spoof` | 360 | pass | pass | pass | pass | `mobile\audit-verify-retry-spoof-360.png` |
| `/audit/verify/retry-image` | 320 | pass | pass | pass | pass | `mobile\audit-verify-retry-image-320.png` |
| `/audit/verify/retry-image` | 360 | pass | pass | pass | pass | `mobile\audit-verify-retry-image-360.png` |
| `/audit/verify/retry-error` | 320 | pass | pass | pass | pass | `mobile\audit-verify-retry-error-320.png` |
| `/audit/verify/retry-error` | 360 | pass | pass | pass | pass | `mobile\audit-verify-retry-error-360.png` |
| `/audit/verify/passed` | 320 | pass | pass | pass | pass | `mobile\audit-verify-passed-320.png` |
| `/audit/verify/passed` | 360 | pass | pass | pass | pass | `mobile\audit-verify-passed-360.png` |
| `/audit/verify/id-form` | 320 | pass | pass | pass | pass | `mobile\audit-verify-id-form-320.png` |
| `/audit/verify/id-form` | 360 | pass | pass | pass | pass | `mobile\audit-verify-id-form-360.png` |
| `/audit/verify/id-checking` | 320 | pass | pass | pass | pass | `mobile\audit-verify-id-checking-320.png` |
| `/audit/verify/id-checking` | 360 | pass | pass | pass | pass | `mobile\audit-verify-id-checking-360.png` |
| `/audit/verify/id-review` | 320 | pass | pass | pass | pass | `mobile\audit-verify-id-review-320.png` |
| `/audit/verify/id-review` | 360 | pass | pass | pass | pass | `mobile\audit-verify-id-review-360.png` |
| `/audit/verify/id-not-found` | 320 | pass | pass | pass | pass | `mobile\audit-verify-id-not-found-320.png` |
| `/audit/verify/id-not-found` | 360 | pass | pass | pass | pass | `mobile\audit-verify-id-not-found-360.png` |
| `/audit/verify/id-face` | 320 | pass | pass | pass | pass | `mobile\audit-verify-id-face-320.png` |
| `/audit/verify/id-face` | 360 | pass | pass | pass | pass | `mobile\audit-verify-id-face-360.png` |
| `/audit/verify/id-used` | 320 | pass | pass | pass | pass | `mobile\audit-verify-id-used-320.png` |
| `/audit/verify/id-used` | 360 | pass | pass | pass | pass | `mobile\audit-verify-id-used-360.png` |
| `/audit/verify/id-error` | 320 | pass | pass | pass | pass | `mobile\audit-verify-id-error-320.png` |
| `/audit/verify/id-error` | 360 | pass | pass | pass | pass | `mobile\audit-verify-id-error-360.png` |
| `/audit/verify/both` | 320 | pass | pass | pass | pass | `mobile\audit-verify-both-320.png` |
| `/audit/verify/both` | 360 | pass | pass | pass | pass | `mobile\audit-verify-both-360.png` |

## Failures

None.
