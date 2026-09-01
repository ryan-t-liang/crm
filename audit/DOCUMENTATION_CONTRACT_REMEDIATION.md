# Documentation Contract Remediation

## Baseline

- Repository: `https://github.com/ryan-t-liang/crm.git`
- Branch: `main`
- Baseline SHA: `15b65c5cd225442a37aa8ea8f19d64b8b950e231`
- Audit source: `audit/FINAL_HANDOFF_AUDIT_V2.md`
- Remediation date: `2026-09-02` (Asia/Shanghai)

This remediation is limited to the five repository documentation and operations contract findings below. Code and the V2.0 requirement remain the sources of truth. No backend source, frontend, Prisma schema, migration, business logic, CI logic, RBAC, Auth, Import/Export, Lead, Member, Gateway, or Outbox Worker implementation was changed.

## Scope

| Finding | Result |
|---|---|
| DOC-01 — Outbox SQL uses obsolete physical columns | CLOSED |
| DOC-02 — Runbook documents Worker log fields that do not exist | CLOSED |
| DOC-03 — Deployment guide lists obsolete runtime statuses | CLOSED |
| DOC-04 — Gateway HTTP 202 uses the obsolete success status | CLOSED |
| DOC-05 — Gateway mapping incorrectly requires Lead Phone | CLOSED |

## DOC-01 Outbox SQL

### Before

`docs/OPERATIONS.md` queried `aggregate_id` and `available_at`. Those columns do not exist in the current `integration_outbox` table.

### After

The runbook now uses the actual Prisma-to-MySQL physical columns `entity_id` and `next_retry_at`, and includes only current physical columns and current Outbox statuses:

```sql
SELECT id, entity_id, status, attempts, next_retry_at,
       lock_owner, lease_until, last_http_status, last_error, updated_at
FROM integration_outbox
WHERE status IN ('PENDING','RETRY_WAITING','PROCESSING','DEAD_LETTER')
ORDER BY updated_at DESC;
```

### Fresh MySQL execution

- Database: disposable MySQL `8.4`
- Schema state: empty database, then all 5 repository migrations applied in order
- Seed: completed with `SEED_DEMO_DATA=false`
- `_prisma_migrations`: 5 applied migrations
- Documented `SELECT`: exit code 0, no syntax error, no unknown column

No destructive SQL or production database was used.

## DOC-02 Logging Contract

### Before

The runbook instructed operators to query `event=outbox.claimed`, `event=outbox.completed`, `event=outbox.retry_scheduled`, and `event=outbox.dead_letter`. The current Worker does not emit an `event` field or those values.

### After

`docs/OPERATIONS.md` now documents the actual Fastify/Pino structured log contract:

- `msg="outbox delivery started"`: `workerId`, `outboxId`, `leadId`, `brand`
- `msg="outbox delivery completed"`: `workerId`, `outboxId`, `leadId`, `status`, `durationMs`
- `msg="Sowind Gateway delivery requires operational attention"`: `leadId`, `brand`, `errorCode`
- `msg="recovered stale outbox leases"`: `workerId`, `recovered`

The runbook explains how to correlate a Lead, Outbox, Worker, retry, failure, and dead letter by these actual identifiers. It also distinguishes HTTP request `traceId` from asynchronous Worker correlation and does not claim that Worker logs contain a request `traceId`.

### Actual log evidence

A local Worker was executed against the disposable database with a Fake Gateway. Real structured JSON logs were captured and programmatically parsed for all required paths:

| Scenario | Verified log evidence |
|---|---|
| Accepted | start fields present; completion status `GATEWAY_ACCEPTED`; `durationMs` present |
| Retry | completion status `RETRY_WAITING` |
| Dead Letter | operational-attention fields present; completion status `DEAD_LETTER` |
| Stale Recovery | `workerId` and `recovered=1` present; recovered item subsequently delivered |

Parser result: 10 structured log rows inspected; Accepted, Retry, Dead Letter, Stale Recovery, and all documented fields passed. Test identifiers were synthetic. No secret, complete payload, or PII is included in this report.

## DOC-03 Runtime Status

`docs/DEPLOYMENT.md` now separates the two current runtime state machines.

### Lead Status

`NOT_SYNCED`, `SYNC_PENDING`, `SYNCING`, `GATEWAY_ACCEPTED`, `SYNC_FAILED`, `DEAD_LETTER`

Monitoring focuses on Lead `SYNC_FAILED` and `DEAD_LETTER`.

### Outbox Status

`PENDING`, `PROCESSING`, `RETRY_WAITING`, `SUCCEEDED`, `FAILED`, `DEAD_LETTER`

Monitoring distinguishes backlog (`PENDING`, `RETRY_WAITING`), execution (`PROCESSING`), and failure (`FAILED`, `DEAD_LETTER`). `FAILED_AUTH` and `FAILED_PERMANENT` were removed from current runtime guidance.

The documentation contract test parses `LeadSyncStatus` and `OutboxStatus` from `schema.prisma` and requires the documented sets to match exactly.

## DOC-04 Gateway 202

`docs/SOWIND_GATEWAY_MAPPING.md` now maps the only valid HTTP 202 response to `GATEWAY_ACCEPTED`.

The contract explicitly states that HTTP 202 means only that Sowind Gateway authenticated, validated, and stored/queued the request. It does not mean that an HQ CRM Contact was finally created, it is not `CRM_CONFIRMED`, and it is not proof of final HubSpot processing.

## DOC-05 Phone Contract

The Gateway mapping now distinguishes the two domains:

- Lead submission: Email required; Phone optional.
- Lead Phone present: normalize to E.164 before adding it to Gateway `fields`.
- Lead Phone omitted or blank: omit the Gateway `phone` field; do not send an empty string, `null`, or a fabricated number.
- Member registration: verified mobile required through the trusted WeChat context.

Verification evidence:

- Existing payload unit coverage confirms that an omitted Phone is not emitted and a present Phone is normalized to E.164.
- Fresh integration suite confirms that an Email-only Lead is created successfully with a null/omitted Phone.
- A local API request to Member self-registration without trusted WeChat identity context returned HTTP 401 with `WECHAT_CONTEXT_REQUIRED`; it did not register a Member.

## Repository-wide Documentation Scan

The current operational contract surfaces were scanned: `README.md`, `docs/API.md`, `docs/HANDOFF.md`, `docs/OPERATIONS.md`, `docs/DEPLOYMENT.md`, and `docs/SOWIND_GATEWAY_MAPPING.md`.

Results:

- No current runtime contract uses `GATEWAY_QUEUED`, `CRM_CONFIRMED`, `FAILED_AUTH`, or `FAILED_PERMANENT`.
- The current Outbox SQL uses `entity_id` and `next_retry_at`, not `aggregate_id` or `available_at`.
- Current Worker logging guidance does not require `event=outbox.*`.
- Current Lead documentation does not require Phone.
- `README.md`, `docs/API.md`, and `docs/HANDOFF.md` were already consistent and therefore were not changed.
- Historical audit files may retain obsolete terms when describing an old finding or migration. They were not rewritten because doing so would alter historical evidence.

## Documentation Contract Test

Added `backend/tests/documentation-contract.test.ts` without a new dependency or test framework. It is included automatically by `npm test` and checks:

1. Runbook SQL uses `entity_id` and `next_retry_at` and excludes the two obsolete columns.
2. Runbook logging uses real `msg` and identifier fields and excludes `event=outbox` guidance.
3. Deployment Lead and Outbox status sets exactly equal the Prisma enums.
4. Current documentation excludes obsolete runtime statuses.
5. Lead Phone optional and Member verified mobile required remain distinct.
6. HTTP 202 maps only to `GATEWAY_ACCEPTED` and is not documented as final CRM/HubSpot success.

Focused result: 6/6 tests passed.

## Validation

| Check | Result |
|---|---|
| `npm run prisma:validate` | PASS |
| Fresh MySQL 8.4 migration deploy (5 migrations) | PASS |
| Fresh MySQL seed (`SEED_DEMO_DATA=false`) | PASS |
| Documented Outbox SQL executed against Fresh MySQL | PASS |
| Actual Worker logs: Accepted / Retry / Dead Letter / Stale Recovery | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 39 passed, 49 skipped; includes 6 documentation contract tests |
| `RUN_DB_INTEGRATION_TESTS=true npm run test:integration` | PASS — 45/45 |
| `npm run build` | PASS |
| `npm run test:frontend` | PASS |
| `docker compose config` | PASS |
| `git diff --check` | PASS |

All database, Gateway, WeChat, and API test data used for this remediation was disposable or synthetic. No real Gateway, real WeChat, or Production environment was accessed.

## Diff Review

Authorized remediation files:

- `docs/OPERATIONS.md`
- `docs/DEPLOYMENT.md`
- `docs/SOWIND_GATEWAY_MAPPING.md`
- `backend/tests/documentation-contract.test.ts`
- `audit/DOCUMENTATION_CONTRACT_REMEDIATION.md`

No `backend/src/**`, frontend, Prisma schema, migration, CI, or business test file is part of the remediation diff. Pre-existing untracked historical audit artifacts are outside this remediation and must not be staged.

## Remaining Documentation Gaps

**NONE** for DOC-01 through DOC-05 at this remediation worktree.

Production deployment instructions, real credential setup, live Sowind Gateway verification, live WeChat verification, backup/restore drills, and production alert tuning remain environment handoff activities rather than repository documentation contract defects.

## Remaining Code Gaps

**NONE** within the Final Handoff Audit V2 scope.

## Decision

**READY TO RELEASE DOC FIX**

DOC-01 CLOSED. DOC-02 CLOSED. DOC-03 CLOSED. DOC-04 CLOSED. DOC-05 CLOSED. The release status becomes final only after this exact diff is committed, pushed normally to `main`, and the Hosted CI run for the resulting commit passes.
