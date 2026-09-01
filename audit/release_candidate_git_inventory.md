# Sowind CRM Release Candidate Git Inventory

- Review date: `2026-09-01`
- Repository root: `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm`
- Branch: `main`
- HEAD / upstream: `e6ec4b8ff1859548a6e1d21f571e0afd2874cf0b` / `origin/main`
- Remote: `https://github.com/Hadalon/crm.git`
- Baseline before this review: 27 modified tracked files + 37 untracked files; no staged, deleted or renamed files.
- Final inventory after adding the four permitted review/remediation artifacts: 27 modified tracked files + 41 untracked files.
- Classification vocabulary: `INCLUDE` / `EXCLUDE` / `REVIEW_REQUIRED` / `SUSPICIOUS`.

## A. Modified Tracked Files

| Full path | Git | Round | Purpose | Classification / RC action |
| --- | --- | --- | --- | --- |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/.env.example` | M | R2/R4 | WeChat、lease、日志和 Live Harness 的空占位配置 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/README.md` | M | R4 | 启动、验证、Live Harness 与交接入口 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/Dockerfile` | M | R4 | 使用 lockfile 的可重复安装 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/package.json` | M | R4 | 标准 integration script | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/prisma/schema.prisma` | M | R1–R4 | 六态 Lead、Identity、Import/Export、Audit、lease 数据模型 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/prisma/seed.ts` | M | R1–R3 | Phone optional、正式模板 schema、Identity/Journey demo 对齐 | INCLUDE；demo 数据受 `SEED_DEMO_DATA=true` 门禁 |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/app.ts` | M | R2/R4 | WeChat route、trace、redaction、logger | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/auth/routes.ts` | M | R4 | Audit context 对齐 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/common/audit.ts` | M | R4 | 递归脱敏、user agent、traceId | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/common/config.ts` | M | R2/R4 | LOG_LEVEL、WeChat、worker lease 配置 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/common/errors.ts` | M | R4 | 422 `fieldErrors` 与 traceId 错误合同 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/customers/routes.ts` | M | R2/R4 | canonical member service 与服务端 metrics | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/health/routes.ts` | M | R4 | `/api/ready` 和 outbox/integration 摘要 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/integrations/routes.ts` | M | R1/R2 | MINI_PROGRAM 归一与可信 WeChat context 关联 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/integrations/sowind/sowind.outbox.ts` | M | R1/R4 | 触发来源、人工重试与 lease 清理 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/integrations/sowind/sowind.payload-builder.ts` | M | R1 | Phone optional payload | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/integrations/sowind/sowind.types.ts` | M | R1 | Trigger/response 类型 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/integrations/sowind/sowind.worker.ts` | M | R1/R4 | 六态、202、retry/dead-letter、attempt、原子 claim/lease | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/jobs/routes.ts` | M | R3 | 正式 Import/Export APIs、scope、download | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/leads/routes.ts` | M | R1/R4 | 管理端来源强制、同步入口与完整 metrics | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/leads/service.ts` | M | R1/R2 | canonical Lead dispatch 与微信会员关联 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/roles/routes.ts` | M | R4 | Backend 权限依赖归一 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/tests/sowind.live.test.ts` | M | R4 | 默认关闭、显式授权的真实 Gateway 系统路径 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/tests/sowind.payload.test.ts` | M | R1 | Phone present/absent payload | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/docs/API.md` | M | R1/R4 | 六态、202、metrics、422/trace 合同 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/frontend/js/app.js` | M | R1–R4 | 状态映射、Identity、Import/Export、metrics/error 展示 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/package.json` | M | R4 | root integration/frontend scripts | INCLUDE |

## B. New Untracked Files

| Full path | Git | Round | Purpose | Classification / RC action |
| --- | --- | --- | --- | --- |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/.github/workflows/ci.yml` | ?? | R4 / Security Remediation | MySQL 8.4 CI 全验证链；已改用无关的 CI-only synthetic fixture | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/FINAL_HANDOFF_AUDIT.md` | ?? | Historical | 远端未同步时的最终审计 | REVIEW_REQUIRED；point-in-time 结论和本机路径，不可当作当前 RC 结论 |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/database_review.md` | ?? | Historical | 修复前数据库审计 | REVIEW_REQUIRED |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/final_handoff_assessment.md` | ?? | Historical | 修复前交付判断 | REVIEW_REQUIRED |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/final_handoff_checklist.md` | ?? | Historical | 远端未同步检查表 | REVIEW_REQUIRED |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/gap_report.md` | ?? | Historical | 修复前 gap 基线 | REVIEW_REQUIRED |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/handoff_checklist.md` | ?? | Historical | 修复前 handoff checklist | REVIEW_REQUIRED |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/remediation_round_1.md` | ?? | R1 | Round 1 修复与测试证据 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/remediation_round_2.md` | ?? | R2 | Round 2 修复与测试证据 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/remediation_round_3.md` | ?? | R3 | Round 3 修复与测试证据 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/remediation_round_4.md` | ?? | R4 | Round 4 修复与测试证据 | INCLUDE；其中 `/tmp` 仅为历史测试证据 |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/repository_inventory.md` | ?? | Historical | 修复前 repository inventory | REVIEW_REQUIRED；含本机和临时路径 |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/requirement_traceability_matrix.md` | ?? | Historical | 修复前需求追踪矩阵 | REVIEW_REQUIRED |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/release_candidate_git_inventory.md` | ?? | RC Review | 本文件，完整 Git 清单 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/RELEASE_CANDIDATE_MANIFEST.md` | ?? | RC Review | RC 覆盖、风险、测试与决策 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/RELEASE_CANDIDATE_STAGE_PLAN.md` | ?? | RC Review | 明确暂存计划；未实际执行 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/audit/RELEASE_CANDIDATE_SECURITY_REMEDIATION.md` | ?? | Security Remediation | 凭据替换、复扫与回归证据 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/prisma/migrations/20260901010000_lead_sync_v2/migration.sql` | ?? | R1 | Lead 六态、Phone optional、Attempt 审计升级 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/prisma/migrations/20260901020000_member_wechat_identity/migration.sql` | ?? | R2 | scoped Identity 与 WeChat context | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/prisma/migrations/20260901030000_import_export_v2/migration.sql` | ?? | R3 | Import/Export lifecycle | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/prisma/migrations/20260901040000_production_readiness/migration.sql` | ?? | R4 | Outbox lease 与 Audit trace 字段 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/common/permissions.ts` | ?? | R4 | RBAC parent/child dependency map | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/customers/identity.service.ts` | ?? | R2 | scoped identity bind/conflict | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/customers/schemas.ts` | ?? | R2 | Admin/WeChat shared member schema | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/customers/service.ts` | ?? | R2 | canonical member service | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/jobs/formal-schema.ts` | ?? | R3 | 四模板和 Validator 单一合同 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/jobs/import-export.service.ts` | ?? | R3 | Preflight/Execute、Failure CSV、模板服务 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/wechat/context.ts` | ?? | R2 | 独立短期身份上下文 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/wechat/routes.ts` | ?? | R2 | phone resolve 与 `/me/member` | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/wechat/wechat.client.ts` | ?? | R2 | Production/Fake WeChat adapter | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/src/wechat/wechat.types.ts` | ?? | R2 | WeChat adapter types | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/tests/import-export.integration.test.ts` | ?? | R3 / Security Remediation | 13 个正式 Import/Export 集成用例；已改用无关的 R3 test-only synthetic fixture | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/tests/import-export.template.test.ts` | ?? | R3 | 4 份 XLSX 合同 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/tests/lead.dispatch-policy.test.ts` | ?? | R1 | 三来源 dispatch 单元测试 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/tests/lead.remediation.integration.test.ts` | ?? | R1 | A–I Lead/Worker 集成用例 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/tests/member.remediation.integration.test.ts` | ?? | R2 | A–L Member/WeChat 用例 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/tests/production-readiness.integration.test.ts` | ?? | R4 | RBAC/metrics/errors/audit/worker/Gateway system cases | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/tests/production-readiness.unit.test.ts` | ?? | R4 | dependency/redaction/schema unit tests | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/backend/tests/wechat.client.test.ts` | ?? | R2 | WeChat adapter unit tests | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/docs/HANDOFF.md` | ?? | R4 | 公司交接清单 | INCLUDE |
| `/Users/ryan/Documents/Codex/2026-08-26/gp-un-unified-crm-lead-productization/sowind-crm/docs/OPERATIONS.md` | ?? | R4 | 生产运维手册 | INCLUDE |

## C. Deleted Files

None.

## D. Renamed Files

None.

## E. Ignored / Runtime-only Material

| Path or rule | Current observation | Classification |
| --- | --- | --- |
| `.env`, `.env.*` except `.env.example` | `.env` exists and is ignored；仅核对键名，未把值写入审查文件 | EXCLUDE |
| `.DS_Store` | root、`.github/`、migration 目录均存在 ignored metadata | EXCLUDE |
| `node_modules/`, `backend/node_modules/` | ignored dependencies | EXCLUDE |
| `backend/dist/` | validation build generated ignored output | EXCLUDE |
| `storage/imports/*`, `storage/exports/*` | runtime import/export files；仅 `.gitkeep` 可跟踪 | EXCLUDE |
| `*.log`, `coverage/`, `outputs/`, `docs/reference/` | logs、coverage、旧产物与外部参考 | EXCLUDE |

`.gitignore` covers the required secret, dependency, build, storage, log, coverage, output, reference and macOS metadata classes. No ignored runtime file is recommended for staging.

## F. Suspicious / Release Blocking

None.

Previous blocker: a known initial credential had been reused in the CI and R3 integration-test fixture. Both occurrences were replaced with unrelated synthetic Test/CI-only values. The old value now has zero occurrences across tracked and untracked repository files. Whether it was ever active outside the repository cannot be proved here; rotation remains recommended if ever active.

## Inventory Decision

All modified and untracked paths have been classified. Secret scan and complete validation are clear, with no remaining `SUSPICIOUS` path or release blocker. The current working tree is **READY TO COMMIT**.
