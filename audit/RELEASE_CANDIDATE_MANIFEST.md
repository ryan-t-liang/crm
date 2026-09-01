# Release Candidate Manifest

## Repository

- Root: `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm`
- Remote: `https://github.com/Hadalon/crm.git`
- Branch: `main`
- HEAD: `e6ec4b8ff1859548a6e1d21f571e0afd2874cf0b`
- Upstream: `origin/main`, ahead 0 / behind 0
- Review mode: working-tree release candidate; no `git add`, commit, push, reset, clean, restore, checkout or stash was executed.

## Working Tree Summary

- Before the review artifacts: 27 modified tracked + 37 untracked files.
- After the four permitted review/remediation artifacts: 27 modified tracked + 41 untracked files.
- Staged: 0.
- Deleted: 0.
- Renamed: 0.
- `git diff --stat`: 27 tracked files, 1,064 insertions, 609 deletions; untracked files are listed separately in `release_candidate_git_inventory.md`.
- `git diff e6ec4b8... --stat` produced no committed-range delta because HEAD equals the supplied baseline; the release candidate exists only in the working tree.

## INCLUDE — Required Delivery

### Migrations

- `backend/prisma/migrations/20260901010000_lead_sync_v2/migration.sql` — R1 Lead dispatch/status/attempt upgrade; low residual migration risk after fresh-chain pass.
- `backend/prisma/migrations/20260901020000_member_wechat_identity/migration.sql` — R2 scoped Identity/WeChat context; low residual migration risk.
- `backend/prisma/migrations/20260901030000_import_export_v2/migration.sql` — R3 job lifecycle fields; low residual migration risk.
- `backend/prisma/migrations/20260901040000_production_readiness/migration.sql` — R4 lease/audit fields; low residual migration risk.
- `backend/prisma/schema.prisma`, `backend/prisma/seed.ts` — final schema and seed alignment.

### Backend

- Lead/Gateway: `backend/src/leads/`, modified Sowind integration files and `backend/src/integrations/routes.ts`.
- Member/Identity/WeChat: `backend/src/customers/`, `backend/src/wechat/`.
- Import/Export: `backend/src/jobs/routes.ts`, `backend/src/jobs/formal-schema.ts`, `backend/src/jobs/import-export.service.ts`.
- Production closure: `backend/src/common/{audit,config,errors,permissions}.ts`, `backend/src/{app.ts,health/routes.ts,roles/routes.ts,auth/routes.ts}`.

### Frontend

- `frontend/js/app.js` — six-state mapping, Gateway wording, member Identity, metrics/error and formal Import/Export integration.

### Tests

- INCLUDE: all eight new Round test files plus modified `sowind.live.test.ts`, `sowind.payload.test.ts`.
- `backend/tests/import-export.integration.test.ts` now uses an unrelated R3 test-only synthetic fixture and passed its 13 integration cases.

### CI

- `.github/workflows/ci.yml` now uses an unrelated CI-only synthetic fixture and remains configured to run the complete MySQL 8.4 validation chain.

### Docs

- `.env.example`, `README.md`, `docs/API.md`, `docs/OPERATIONS.md`, `docs/HANDOFF.md`, `backend/Dockerfile`, root/backend `package.json`.

### Audit Evidence

- INCLUDE: `audit/remediation_round_1.md` through `audit/remediation_round_4.md`, the three RC review artifacts and `audit/RELEASE_CANDIDATE_SECURITY_REMEDIATION.md`.
- Historical pre-sync audit files remain `REVIEW_REQUIRED` and are not in the recommended current stage set.

### Config

- `.env.example` uses empty placeholders or explicit development placeholders; no production secret value was found there.
- `package.json` and `backend/package.json` add scripts only. No dependency version changed, so the unchanged `package-lock.json` is consistent.

## EXCLUDE — Do Not Commit

- `.env` and any runtime `.env.*`.
- `.DS_Store` at root, `.github/` and migration directories.
- root/backend `node_modules`, `backend/dist`, `coverage`, `*.log`.
- runtime import/export storage, failure CSV/XLSX files, `outputs/`, `docs/reference/` and browser/temp artifacts.
- No current ignored artifact is required by a source import or build.

## REVIEW_REQUIRED

- `audit/FINAL_HANDOFF_AUDIT.md`
- `audit/final_handoff_checklist.md`
- `audit/database_review.md`
- `audit/final_handoff_assessment.md`
- `audit/gap_report.md`
- `audit/handoff_checklist.md`
- `audit/repository_inventory.md`
- `audit/requirement_traceability_matrix.md`

These are valid point-in-time evidence but contain pre-remediation or pre-sync conclusions. Some also contain `/Users/ryan` or `/tmp` evidence paths. They are not runtime dependencies; including them without a historical label could confuse the handoff reader.

## SUSPICIOUS

None.

Previous finding is closed: the CI and R3 integration test no longer reuse the known initial credential. The replacement values are obviously synthetic Test/CI-only fixtures and satisfy the repository password-format checks.

## Security Scan

- High-confidence scan found no Private Key, AWS access key, GitHub token, Slack token or long Bearer token in modified/untracked files.
- Gateway, WeChat, Session, Integration and HMAC keyword hits were reviewed. Runtime code reads environment values; `.env.example` uses empty or explicit placeholder values; tests otherwise use clearly fake domains and fixtures.
- The previous known credential has zero occurrences across tracked and untracked repository files.
- Repository evidence cannot prove whether that value was ever active in a development, demo, test, customer or server environment. Status: `ROTATION RECOMMENDED IF EVER ACTIVE`; no real environment was contacted.
- `.env` is ignored and excluded. Its values were not copied into this audit.
- Email/phone-like data added by tests use `.test`, `.invalid`, `example.cn` or explicit demo fixtures. Existing `sowind.com` demo accounts remain gated by `SEED_DEMO_DATA=true`; this change set does not make them default data.
- Absolute local paths occur only in historical audit evidence, not runtime code, CI, product docs or active tests.
- `127.0.0.1`/localhost occurrences are limited to development config, CI MySQL, local runbook examples and fake test servers. `0.0.0.0` is the server bind address and is documented behind loopback-published Compose/Nginx.
- Live Gateway tests default to false and additionally require explicit authorization, access key, per-brand email and SKU. WeChat tests inject a fake adapter. `SEED_DEMO_DATA` defaults false.

## Round 1 Coverage

- Dispatch policy present: MINI_PROGRAM auto-Outbox; ADMIN_MANUAL and BATCH_IMPORT remain `NOT_SYNCED` without automatic executable Outbox.
- Lead Email required; Phone optional in schema, route, formal template/validator and payload builder.
- Formal statuses present: `NOT_SYNCED`, `SYNC_PENDING`, `SYNCING`, `GATEWAY_ACCEPTED`, `SYNC_FAILED`, `DEAD_LETTER`; no `CRM_CONFIRMED` was found.
- HTTP 202 maps to `GATEWAY_ACCEPTED`; UI says “Gateway 已受理”.
- Dead-letter updates Lead status.
- Attempt contains `triggered_by`, `gateway_ref`, sanitized `request_snapshot_json`.
- Migration and A–I unit/integration evidence present.
- Result: functional coverage PASS; security blocker is outside R1 business logic.

## Round 2 Coverage

- Canonical member service, shared schemas, CustomerIdentity service, WeChat adapter/context/routes and `/me/member` are all present.
- Phone resolve, brand-scoped identity, profile/journey/audit and Mini Program Lead auto-link are covered by tests.
- Migration `20260901020000_member_wechat_identity` is present and fresh-applied.
- Result: coverage PASS.

## Round 3 Coverage

- Formal schema is the shared source for XLSX template, validator and importer.
- Upload → Preflight → Execute, Member/Lead strategies, failure CSV and persistent history are present.
- Export implements `CURRENT_FILTER`, `SELECTED_IDS`, `ALL` and object-specific field allowlists.
- Formal template tests cover 21/22/20/21 columns and Lead Phone optional.
- Migration `20260901030000_import_export_v2` is present and fresh-applied.
- Result: coverage PASS; the 13-case integration file uses a synthetic test-only fixture.

## Round 4 Coverage

- Backend permission dependencies, server metrics, 422 fieldErrors/traceId, Audit user-agent/trace/redaction, Outbox lease/stale recovery, readiness and structured logging are present.
- Fake Gateway GP/UN × marketing false/true system cases are present and passed.
- CI includes MySQL 8.4, `npm ci`, Prisma generate/validate/migrate/seed, lint, unit, integration, build and frontend checks; live tests stay off.
- OPERATIONS/HANDOFF/README/API/.env.example are present.
- Result: coverage PASS; CI uses a synthetic CI-only fixture and live tests remain disabled.

## Migration Chain

- Ordered chain: `20260831000000_init` → R1 → R2 → R3 → R4.
- Init working-tree hash equals HEAD blob hash: `d9682c45a839f0920607c9ba7e1a3d955cc646f4`; the init migration was not modified.
- Four new migrations are incremental. Review found no `DROP TABLE`, `DROP DATABASE`, `TRUNCATE`, hard-coded secret or local absolute path.
- Fresh isolated MySQL 8.4: all five migrations applied and Seed succeeded.
- Existing-schema upgrade was not rerun in this RC command set; Round 1–4 reports contain prior isolated upgrade PASS evidence. This remains historical evidence, not a newly claimed production backup rehearsal.

## Tests / CI

| Check | Result |
| --- | --- |
| `npm run prisma:validate` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS: 33 passed, 49 skipped; integration/live suites are gated |
| `npm run test:integration` without gate | INCONCLUSIVE: exit 0 but all 45 DB tests skipped |
| Security-remediation Fresh DB + `RUN_DB_INTEGRATION_TESTS=true npm run test:integration` | PASS: 45/45; temporary schema removed |
| `npm run build` | PASS |
| `npm run test:frontend` | PASS |
| `git diff --check` | PASS |
| Real Gateway / real WeChat | NOT_RUN_NOT_AUTHORIZED / BLOCKED_BY_CREDENTIALS; not required for this Git RC review |

Historical note retained: the initial RC Review had one isolated-DB setup failure before schema creation due to local shell/SQL quoting and grants, followed by a corrected 45/45 PASS. This Security Remediation run created a new isolated MySQL 8.4 schema, applied all five migrations, seeded it, passed 45/45, and removed the temporary schema without touching existing CRM data.

## Documentation

- Required current docs are present: README, API, OPERATIONS, HANDOFF and `.env.example`.
- Historical audit documents are separated from current RC evidence.
- No runtime documentation contains a local absolute path.

## Release Blockers

None.

Previous security blocker: **CLOSED**. The known credential was replaced in both authorized files, secret scan passed, all five migrations applied on Fresh MySQL, and 45/45 integration tests passed. Credential rotation remains recommended only if that historical value was ever active outside the repository.

## Release Candidate Decision

**READY TO COMMIT**

Security blocker: CLOSED. Secret scan: PASS. Fresh Migration: PASS. Integration: 45/45 PASS. Build: PASS. All candidate paths remain classified, with no `SUSPICIOUS` item or release blocker. No staging, commit or push was performed.
