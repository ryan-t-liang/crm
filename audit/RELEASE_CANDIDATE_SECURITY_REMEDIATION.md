# Release Candidate Security Remediation

## Before

- Previous decision: `NOT READY TO COMMIT`.
- Only blocker: a previously designated CRM initial credential had been reused as plaintext in two required CI/test fixtures.
- Authorized scope: replace those two fixture values, rescan, rerun release validation, and update RC review evidence only.
- No business logic, schema, migration, Lead, Member/WeChat, Import/Export logic, Gateway, RBAC, UI or production password policy was changed.

## Files Changed

Security fixture changes:

1. `.github/workflows/ci.yml`
2. `backend/tests/import-export.integration.test.ts`

Review evidence updates:

1. `audit/release_candidate_git_inventory.md`
2. `audit/RELEASE_CANDIDATE_MANIFEST.md`
3. `audit/RELEASE_CANDIDATE_STAGE_PLAN.md`
4. `audit/RELEASE_CANDIDATE_SECURITY_REMEDIATION.md`

No `git add`, commit, push, reset, clean or restore was executed.

## Credential Replacement

- CI now uses a fixed, obviously synthetic CI-only fixture.
- R3 Import/Export integration tests use a distinct, obviously synthetic test-only fixture.
- Both fixtures satisfy uppercase, lowercase, digit, special-character and minimum-length checks.
- Neither value came from `.env`, Secret Manager, a production account, employee password, historical credential or external environment.
- The previous credential value is intentionally not reproduced in this report.
- Exact-value search across all tracked and untracked repository files: 0 occurrences.

## Secret Scan

- High-confidence scan: no Private Key, AWS key, GitHub token, Slack token or long Bearer token.
- Gateway accessKey, WeChat AppSecret, Session Secret, Integration/HMAC Secret and database keyword hits were reviewed as environment reads, empty placeholders, explicit development values or obvious Test/CI fixtures.
- `.env` remains ignored and `EXCLUDE`; its values were neither printed nor copied.
- Example/test emails use `.test`, `.invalid`, `example.cn` or `sowind.example`. Existing `sowind.com` demo accounts are pre-existing and remain behind `SEED_DEMO_DATA=true`.
- Local absolute paths occur only in Audit evidence. Runtime source, CI, active product documentation and tests contain no developer-machine absolute path.
- Result: PASS.

Credential rotation assessment: repository evidence cannot prove whether the historical initial value was ever enabled in development, demo, test, customer or server environments. `ROTATION RECOMMENDED IF EVER ACTIVE`. No external environment was contacted.

## Validation

| Check | Result |
| --- | --- |
| `npm run prisma:validate` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 33 passed; 45 DB integration and 4 live cases skipped by their explicit gates |
| Fresh isolated MySQL 8.4 | PASS |
| All 5 migrations | PASS |
| Seed with `SEED_DEMO_DATA=false` | PASS |
| `RUN_DB_INTEGRATION_TESTS=true npm run test:integration` | PASS — 45/45 |
| `npm run build` | PASS |
| `npm run test:frontend` | PASS |
| `git diff --check` | PASS |
| Real Gateway / WeChat | NOT_RUN_NOT_AUTHORIZED / BLOCKED_BY_CREDENTIALS; outside this remediation |

The isolated schema was removed after the successful run. Existing CRM data was not touched.

## Working Tree

- Final candidate inventory: 27 modified tracked files + 41 untracked files, including four permitted RC review/remediation artifacts.
- No staged, deleted or renamed file.
- The only non-Audit files changed by this remediation are the two authorized fixture locations.
- All 68 candidate paths are classified in `audit/release_candidate_git_inventory.md`.
- Ignored `.env`, dependencies, build output, `.DS_Store`, storage, logs, coverage and temporary artifacts remain excluded.

## Remaining Blockers

None.

The historical credential should still be rotated by an authorized operator if it was ever active outside the repository; this conditional operational recommendation is not a remaining Git release blocker after repository occurrences have been removed.

## Decision

**READY TO COMMIT**

- Security blocker: CLOSED
- Secret scan: PASS
- Fresh Migration: PASS
- Integration: 45/45 PASS
- Build: PASS

This remediation stops here. No staging, commit or push was performed.
