# Phase 2 — Issue log

Scope: local real Chrome, built React frontend, Fastify and isolated MySQL; comparison authority is the approved Phase 1 Dashboard and DESIGN_SYSTEM. All listed issues were found during this phase and retested. Historical failing screenshots/JSON are retained in `resolved/`, never represented as final passing evidence.

## Functional issues

| ID | Severity | Steps / expected | Actual / root cause | Fix and retest |
| --- | --- | --- | --- | --- |
| P2-F01 | P1 | Delete a disposable Lead/Contact/Company from its row menu; expect successful soft deletion | Empty DELETE request inherited `Content-Type: application/json`; Fastify rejected empty JSON with 400 | Set JSON header only when a body exists. New API unit test and all three browser row-deletion flows PASS; see `34-*` and file-job result JSON |
| P2-F02 | P1 | Upload then click file download; expect downloaded bytes | Anchor used a new-tab preview instead of a download | Explicit download attribute. TXT, PNG and actual WebM downloaded and byte-compared PASS; `32-contextual-attachments.png` |
| P2-F03 | P2 | Open company row actions immediately after navigation; expect stable menu | Redundant initial debounced keyword update refetched and remounted the table | Avoid no-op filter state update. Row deletion and create/edit flows PASS |
| P2-F04 | P2 | Use company-context contact picker; expect only that company's contacts | Existing Contact/Lead list APIs did not enforce the newly required organization query | Add optional validated organization filters and Contact source filter. Positive/negative backend integration and UI company selection PASS |
| P2-F05 | P2 | Upload files and surface a failed upload; preserve feedback and current form | Same-path refresh could replace children with skeletons, losing local feedback | Preserve existing data during same-path refresh; fresh paths still mask stale data. Upload/edit/delete regression PASS |

## Design consistency / accessibility issues

| ID | Severity | Source / expected | Actual | Fix and retest |
| --- | --- | --- | --- | --- |
| P2-D01 | P2 | Shared Field label should provide a clean accessible name | Required `*` became part of exact label matching | Decorative aria-hidden CSS marker; all real form locators and validation PASS |
| P2-D02 | P2 | Lead requirements remain a compact reading surface | Multiple large empty file dropzones consumed vertical space | Compact empty attachment rows, context maintained. Lead Detail screenshot inspected PASS |
| P2-D03 | P2 | Contact 360 left summary remains readable | Duplicate name and two-column narrow sidebar caused cramped email/website wrapping | Avatar-only entity identity; single-column side metadata. Contact/detail responsive screenshots inspected PASS |
| P2-D04 | P3 | Screenshots show settled dialog states | Initial capture caught transition fade | Wait for dialog visibility and transition settling. Role/Nurture/Lead form screenshots recaptured and inspected |

## Test harness corrections and coverage limits

- Exact names were corrected for Company row menu, Followup dialog and repeated local fixtures. Those selector timeouts do not prove a product defect; each affected scenario was rerun.
- The UAT harness initially matched the Dashboard breadcrumb as a second navigation link; it now scopes clicks to the actual main navigation. Its broad `导入` prefix also matched a contact named `导入联系人…` in a read-only row action label; exact action-name matching corrected this false positive. No role permission or product code was changed; the complete three-role rerun passed 27/27.
- Rapid consecutive browser suites hit the existing 180-request/minute limit (including static assets). Historical 429 outputs were not waived: suites were spaced and rerun without unexpected network failures. No rate-limit configuration was changed. This pass does not claim load/performance capacity.
- Expected unauthenticated `/api/v1/auth/me` 401 responses are separately listed in the authentication suite; any other unexpected HTTP failure fails the suite.
- Passed screenshots/checks are in current result JSON and `screenshot-manifest.json`; earlier failed attempts are not current status.
- Exhaustive file type/size permutations, keyboard-only coverage of every control, cross-browser testing and human Phase 2 visual acceptance remain outside this representative pass. Backend validation/security contracts and existing integration tests remain in force.

No unresolved P0/P1 product issue after the successful local reruns. UAT verification separately passed 27/27; see `uat/results.json` and `uat/artifact-parity.json`. This is not inferred from local PASS.
