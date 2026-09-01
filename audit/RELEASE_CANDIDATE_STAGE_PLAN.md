# Sowind CRM Release Candidate Stage Plan

## Current Decision

**READY TO COMMIT**

No `git add`, commit or push was executed. The commands below are the final recommendation for an authorized operator after reviewing this remediation evidence.

## Cleared Security Conditions

1. CI and R3 integration fixtures are unrelated synthetic Test/CI-only values.
2. The old known credential has zero tracked/untracked repository occurrences.
3. Secret scan, Prisma validation, lint, unit, Fresh 5-migration chain, Seed, 45/45 integration, build, frontend and `git diff --check` passed.
4. No path remains `SUSPICIOUS` or unclassified.
5. Rotation is recommended if the historical value was ever active; repository evidence cannot prove external activation.

## Exact Suggested Stage Paths

Never use `git add .`. Stage the reviewed delivery with exact paths:

```bash
git add .env.example
git add README.md
git add backend/Dockerfile
git add backend/package.json
git add backend/prisma/schema.prisma
git add backend/prisma/seed.ts
git add backend/prisma/migrations/20260901010000_lead_sync_v2/migration.sql
git add backend/prisma/migrations/20260901020000_member_wechat_identity/migration.sql
git add backend/prisma/migrations/20260901030000_import_export_v2/migration.sql
git add backend/prisma/migrations/20260901040000_production_readiness/migration.sql
git add backend/src/app.ts
git add backend/src/auth/routes.ts
git add backend/src/common/audit.ts
git add backend/src/common/config.ts
git add backend/src/common/errors.ts
git add backend/src/common/permissions.ts
git add backend/src/customers/routes.ts
git add backend/src/customers/identity.service.ts
git add backend/src/customers/schemas.ts
git add backend/src/customers/service.ts
git add backend/src/health/routes.ts
git add backend/src/integrations/routes.ts
git add backend/src/integrations/sowind/sowind.outbox.ts
git add backend/src/integrations/sowind/sowind.payload-builder.ts
git add backend/src/integrations/sowind/sowind.types.ts
git add backend/src/integrations/sowind/sowind.worker.ts
git add backend/src/jobs/routes.ts
git add backend/src/jobs/formal-schema.ts
git add backend/src/jobs/import-export.service.ts
git add backend/src/leads/routes.ts
git add backend/src/leads/service.ts
git add backend/src/roles/routes.ts
git add backend/src/wechat/context.ts
git add backend/src/wechat/routes.ts
git add backend/src/wechat/wechat.client.ts
git add backend/src/wechat/wechat.types.ts
git add backend/tests/import-export.integration.test.ts
git add backend/tests/import-export.template.test.ts
git add backend/tests/lead.dispatch-policy.test.ts
git add backend/tests/lead.remediation.integration.test.ts
git add backend/tests/member.remediation.integration.test.ts
git add backend/tests/production-readiness.integration.test.ts
git add backend/tests/production-readiness.unit.test.ts
git add backend/tests/sowind.live.test.ts
git add backend/tests/sowind.payload.test.ts
git add backend/tests/wechat.client.test.ts
git add docs/API.md
git add docs/HANDOFF.md
git add docs/OPERATIONS.md
git add frontend/js/app.js
git add package.json
git add .github/workflows/ci.yml
git add audit/remediation_round_1.md
git add audit/remediation_round_2.md
git add audit/remediation_round_3.md
git add audit/remediation_round_4.md
git add audit/release_candidate_git_inventory.md
git add audit/RELEASE_CANDIDATE_MANIFEST.md
git add audit/RELEASE_CANDIDATE_STAGE_PLAN.md
git add audit/RELEASE_CANDIDATE_SECURITY_REMEDIATION.md
```

## Hold / Do Not Stage Without Explicit Historical-Evidence Decision

```text
audit/FINAL_HANDOFF_AUDIT.md
audit/database_review.md
audit/final_handoff_assessment.md
audit/final_handoff_checklist.md
audit/gap_report.md
audit/handoff_checklist.md
audit/repository_inventory.md
audit/requirement_traceability_matrix.md
```

These reports remain useful historical evidence, but their pre-remediation/pre-sync conclusions and local evidence paths require a deliberate handoff decision. They are not needed for compilation or runtime.

## Never Stage

```text
.env
.env.* (except .env.example)
.DS_Store
node_modules/
backend/node_modules/
backend/dist/
storage/imports/*
storage/exports/*
*.log
coverage/
outputs/
docs/reference/
temporary XLSX/CSV/failure files
browser screenshots and cache
```

## Post-stage Verification

After exact staging is performed by an authorized operator:

```bash
git status --short
git diff --cached --stat
git diff --cached --name-status
git diff --cached --check
```

Confirm that the four new migrations, every imported source file, all Round tests, CI and current docs are staged; confirm that no ignored/runtime or `REVIEW_REQUIRED` path entered the index accidentally.

## Commit Plan

Use one release commit rather than splitting migrations from their required code/tests. Suggested message:

```text
feat: complete GP UN CRM V2 backend and handoff readiness
```

Do not push until a fresh staged-diff review confirms the release manifest.
