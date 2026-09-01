# Remediation Round 4

## Final Result

**PASS — ROUND 4 CLOSED**

Round 4 的代码、Migration、自动化测试、CI、运维/交接文档和浏览器 UAT 已完成。真实 Sowind Gateway 与真实 WeChat Live Case 因没有外部凭据及本轮写入授权，保持 `NOT_RUN_NOT_AUTHORIZED / BLOCKED_BY_CREDENTIALS`；Fake Gateway 四个完整系统场景全部通过。

本报告不是 Final Repository Delivery Readiness Audit，也不宣布最终 A/B/C Verdict。

## Scope

本轮只处理：RBAC 权限依赖、服务端指标、API 422 错误合同、Trace/Audit 缺口、Outbox Worker 恢复与并发、Integration Suite、CI、最低生产可观测性、Gateway 四个系统场景、默认关闭的 Live Harness 及生产交接文档。

Round 1 的 Lead 分发/同步状态，Round 2 的 Member/WeChat Identity，Round 3 的 Import/Export/XLSX 合同保持冻结；没有重构 Fastify + Prisma + MySQL + Outbox 架构，没有重新设计管理后台。

## Before Matrix

| Gap | Current Implementation | Required | Planned Change |
| --- | --- | --- | --- |
| RBAC dependency | Guard 已生效，但 Role 保存可形成 child=true、parent=false | Backend 强制归一；父恢复不自动恢复子 | 增加统一 dependency map，前后端共同行为 |
| Member metrics | Frontend 可能从当前页/有限集合推算 | Backend 完整结果集 + Brand Scope | Customers list 返回 `metrics` |
| Lead metrics | Frontend 临时统计 | Backend 按六种正式 sync status 统计 | Leads list 返回 `metrics` |
| Error contract | 各路由 400/错误详情表现不一致 | 422 + fieldErrors + traceId | 统一 Fastify error handler 与 Frontend mapping |
| Audit | 缺 user agent / trace，redaction 范围不足 | 补字段、关联与敏感字段递归脱敏 | Migration + audit helper |
| Worker recovery | `PROCESSING` 崩溃后可能永久停留 | lease、stale recovery、原子 claim | 扩展 Outbox 最小锁合同 |
| Integration | 前三轮有分散 DB suites，缺生产收口覆盖 | Auth/RBAC/Metrics/Error/Audit/Worker/System E2E | 新增 Round 4 integration suite |
| CI | 没有完整隔离 MySQL pipeline | PR/Push 自动 Migration、Test、Build | 新增 GitHub Actions MySQL 8.4 workflow |
| Observability | 缺统一 LOG_LEVEL/readiness/runbook | structured logs、trace、health/readiness | 配置、日志与 OPERATIONS |
| Gateway four | Builder/Payload 检查为主 | API→DB→Consent/Journey→Outbox→Worker→Fake HTTP→Attempt/Audit | 四个 system cases |
| Live harness | Builder→Client，不是系统路径 | API→DB→Outbox→Worker→Real Gateway；默认关闭 | 重写 Live Harness 并增加三重门禁 |

## RBAC Dependency

正式依赖由 `backend/src/common/permissions.ts` 定义并在 `PATCH /api/v1/roles/:id/permissions` 服务端执行：

- `customer.view` → `customer.edit/import/export`
- `lead.view` → `lead.edit/import/export`
- `account.view` → `account.create/edit/disable/reset`
- `roles.view` → `roles.configure`

父权限关闭时子权限持久化为 false；恢复父权限只恢复父权限，不恢复历史子权限。Frontend 同步关闭/禁用子开关。系统角色保持只读。

| Case | 结果 |
| --- | --- |
| RB-A/B：customer child 无 parent | PASS，全部归一为 false |
| RB-C：parent 恢复 | PASS，children 保持 false |
| RB-D/E/F：lead/account/roles dependency | PASS，Backend integration 覆盖 |
| RB-G：Viewer 写 API | PASS，403（Round 3 regression） |
| RB-H：UN Admin 跨 GP | PASS，403/安全型 404（Round 3 regression） |

## Server-side Metrics

`GET /api/v1/customers` 返回 `memberTotal`、`dualBrandMembers`、`marketingCoverage.numerator/denominator/percentage`。`GET /api/v1/leads` 返回 `leadTotal`、六种状态计数、`pending`、`gatewayAccepted`、`syncExceptions`。

测试使用 `pageSize=1` 和超出一页的数据验证指标仍按全量计算；Super Admin、GP-only、UN-only 分别核对。单品牌账号 `dualBrandMembers=0`，无法推断另一品牌关系。Lead 对六种状态分别造数，Super Admin 看到每种 2 条，GP/UN 账号各只看到每种 1 条。

## API Error Contract

统一响应：`{ error: { code, message, fieldErrors? }, traceId }`。Zod 字段错误为 HTTP 422，字段项包含 `field/code/message`。400/401/403/404/409/422 语义已写入 `docs/API.md`；跨品牌单条私有资源和 Failure File 可使用防枚举 404，已明确标为 Security-safe Exception。

ERR-A 缺 Email、ERR-B invalid enum、ERR-C processingConsent=false 均通过真实 HTTP 422 + 对应字段路径。ERR-D 未登录 401、ERR-E Viewer 写 403、ERR-F Brand Scope、ERR-G Identity conflict 409、ERR-H 不存在资源 404 由 Round 2/3 与 Round 4 suites 共同覆盖。可选 Lead birthday/phone 的空字符串回归已增加，避免错误 422。

## Trace ID

请求 ID 使用合法入站 `x-request-id` 或 UUID 生成，同时作为 `x-trace-id` 响应头、错误正文 `traceId`、结构化完成日志与 Audit correlation。Frontend 显示字段错误；不返回 Stack、SQL、Secret 或内部路径。

## Audit Closure

Round 4 Migration 增加 `audit_logs.user_agent` 与 `trace_id`。Audit helper 统一写 operator、action、module、target、IP、user agent、trace；旧 `request_id` 可回填 trace。

递归 redaction 覆盖 password/hash、Gateway Key、AppSecret、access token、authorization code、Cookie、HMAC/signature 等。应用仅提供 Audit Create/Read，无 Update/Delete。动作字典沿用现有命名，例如 `CREATE_USER/UPDATE_USER/DISABLE_USER/ENABLE_USER`、`UPDATE_ROLE_PERMISSIONS`、`MEMBER_REGISTER/MEMBER_PROFILE_UPDATE/CREATE_NOTE`、`IDENTITY_BIND/IDENTITY_CONFLICT`、`CREATE_LEAD/UPDATE_LEAD/MANUAL_SYNC_REQUESTED/GATEWAY_RETRY_SCHEDULED`、Import/Export 六类动作；强制改密单独记录 `PASSWORD_FORCE_CHANGE`。

自动测试确认 user agent、traceId 与安全 details 保留，敏感值全部为 `[REDACTED]`。浏览器审计页可见 Trace 与 user agent。

## Worker Recovery

`integration_outbox` 新增 `lock_owner`、`lease_until` 和 status/lease 索引。Worker 启动/tick 时回收过期 `PROCESSING`，写回 retryable 状态与 `GATEWAY_STALE_RECOVERED`；未过期 lease 不抢占。claim 使用条件更新，两个 Worker 并发只允许一个成功。完成、失败、重试都会清理 lock/lease；`DEAD_LETTER` 不自动重发。

WK-A 正常 claim、WK-B stale recovery、WK-C live lease、WK-D 双 Worker、WK-E 重启重试、WK-F dead letter 均由 Round 1 + Round 4 integration 覆盖。

## Integration Testing

Repository 内自动化由以下组成：

- Unit/template：33 passed；真实 Live 4 cases 默认 skip。
- DB Integration：45/45（Round 1 10、Round 2 12、Round 3 13、Round 4 10）。
- Round 4 新增 Auth 完整链：Login、强制改密、Logout、Reset、Disable、Enable、Session Revocation。
- 测试运行于隔离 MySQL，使用显式 `TEST_DATABASE_URL`，不依赖浏览器 LocalStorage 或开发者旧账号状态。

## CI

`.github/workflows/ci.yml` 在 Push/PR 使用 MySQL 8.4，依次执行 `npm ci`、Prisma generate/validate/migrate/seed、lint、unit、integration、build、frontend syntax。CI 只使用 fake integration credentials，`RUN_SOWIND_LIVE_TESTS=false`；不写真实 Gateway/WeChat Secret。

本地等价流程 PASS；Hosted GitHub Actions 的实际 Run 留待代码推送后由 Final Audit 核对，不在本报告虚构远端 PASS。

## Observability

- `LOG_LEVEL` 支持 error/warn/info/debug（生产默认 info；底层 logger 也兼容 fatal/trace/silent）。
- request/worker 日志包含 traceId、route、status、duration、leadId/outboxId/attempt 等必要 ID。
- 保留 `/api/health`；新增 `/api/ready` 检查 DB，并独立显示 Gateway/WeChat configured 状态和 Outbox processing/retry/dead/oldest。
- Gateway 未配置显示 degraded/unconfigured，不让 CRM 本地功能整体 unhealthy。
- `docs/OPERATIONS.md` 覆盖 16 项排查、备份、轮换与敏感日志禁令。

## Gateway Four System Cases

| Case | 系统路径 | 结果 |
| --- | --- | --- |
| SYS-GP-NO-MKT | Integration API→DB→Consent/Journey→Outbox→2 Workers→Fake HTTP 202→Attempt/Audit | PASS；communications 不存在 |
| SYS-GP-MKT | 同上 | PASS；subscriptionTypeId=370626181 |
| SYS-UN-NO-MKT | 同上 | PASS；communications 不存在 |
| SYS-UN-MKT | 同上 | PASS；subscriptionTypeId=5186585 |

四场景同时验证 Brand、真实测试 SKU、normalized Email、Phone optional、processing consent、pageName/pageUri、business unit、Gateway ref、`GATEWAY_ACCEPTED`、request snapshot 和 Audit。两个 Worker 并发时每条 Gateway call=1。

## Gateway Live Harness

`backend/tests/sowind.live.test.ts` 已改为完整 `Integration API → DB → Outbox → Worker → Real Gateway → IntegrationAttempt/Audit` 四场景，不再是 Builder→Client。

安全门禁：`RUN_SOWIND_LIVE_TESTS=true`、`SOWIND_LIVE_TEST_AUTHORIZED=true`、Gateway Key、GP/UN 独立测试 Email、GP/UN 真实 SKU、已迁移/Seed 且没有可执行 Outbox 的独立 UAT DB，缺一即不运行或失败关闭。

本轮状态：**NOT_RUN_NOT_AUTHORIZED / BLOCKED_BY_CREDENTIALS**。没有真实外部写入，不能写 PASS。

## Fresh DB

PASS。隔离 MySQL 8.4 `sowind_r4_fresh` 与最终 Clean Clone 空库均从 0 依次执行 5 个 Migration：init → Round 1 → Round 2 → Round 3 → `20260901040000_production_readiness`；Seed、Build、Start、45 个 Integration Cases 均通过。

Round 4 Migration 只追加 Audit/Outbox 字段和索引，不删除业务数据。

## Upgrade DB

PASS。`sowind_r4_upgrade_contract` 从 Round 3 schema/data 升级，Customer/Profile/Identity/Lead/Outbox/Attempt/Audit/Import/Export 数量升级前后保持；旧 Audit `request_id` 回填 `trace_id`，旧 PROCESSING Outbox 获得 lease，Lead sync status 与业务记录不改变。没有修改过去四个 Migration。

## Clean Clone

PASS。最终代码在 `/tmp/sowind-r4-final-clean.kR1NYd/clone` 由本地 Git snapshot 执行真正 `git clone`；未复制 `.git`、`node_modules`、`.env`、`backend/dist`、storage 数据。使用全新临时 MySQL 8.4：`npm ci`、generate、5 migrations、seed、build、start、login、强制改密、health、ready、customers API 全通过。

## Docker

PASS。`docker compose config` 通过；`docker build --no-cache -f backend/Dockerfile -t sowind-crm:r4-final .` 通过，最终 manifest list 为 `sha256:3a5dec59e0f382e2089f36e397609a4de2e551352444e93d5960912dcf0b3dcd`。

## Browser UAT

使用真实浏览器和本地 MySQL/API 验证：

| 项目 | 结果 |
| --- | --- |
| Member metrics | PASS：1/1/100%，与 Seed 全量一致 |
| Lead metrics | PASS：2 total、2 pending、0 accepted、0 exception |
| Role dependency | PASS：parent off 后 children unchecked+disabled；parent on 后 children 仍 unchecked |
| Validation field error | PASS：101 字符 firstname 返回并显示 HTTP 422 字段路径；可选空 birthday 修复后不再误报 |
| Audit detail | PASS：Trace 与 browser user agent 可见；密码相关 detail 已脱敏 |
| Import / Export | PASS：真实权限下导入三阶段与导出范围/字段对话框可用；完整写入/下载由 Integration Suite 覆盖 |
| Console | PASS：0 critical error |

## Round 1 Regression

PASS：10/10。MINI_PROGRAM auto Outbox、ADMIN_MANUAL/BATCH_IMPORT no auto、Email-only、optional Phone/E.164、202→GATEWAY_ACCEPTED、429/503/timeout retry/dead-letter、400 no blind retry 全部保持。

## Round 2 Regression

PASS：12/12。1 Customer + 2 Profiles、Identity、WeChat adapter contract、`/me/member`、PROFILE_UPDATE、Lead auto-link 和 Member no Gateway 保持。真实 WeChat Live：`BLOCKED_BY_CREDENTIALS`。

## Round 3 Regression

PASS：13/13 Integration + 4/4 Template。Upload→Preflight→Execute、Conflict/Unmatched、Failure CSV、History、四份 21/22/20/21 XLSX、CURRENT_FILTER/SELECTED_IDS/ALL/field allowlist 保持。

## Production Configuration

`.env.example` 覆盖 DB、Port、Session/Initial Password、Base Path、CORS/Proxy、Gateway URLs/Key/timeout/rate/worker interval+lease+instance、GP/UN WeChat AppID/AppSecret/Open Platform scope/context TTL、integration HMAC client、storage、LOG_LEVEL 及 Live Harness 门禁变量。

README 已补 Local、Migration、Seed、Build/Start、Docker、Base Path、Gateway/WeChat、Health/Ready、Storage、Live UAT；`docs/OPERATIONS.md` 与 `docs/HANDOFF.md` 分别提供 Runbook 和 A/B/C/D 交接清单。

## External Blockers

- 正式 Sowind Gateway Secret 与写入授权。
- 正式 GP/UN WeChat AppID/AppSecret 与真实授权 code。
- 正式 Domain、TLS、Nginx、Production DB、Secret Manager、Storage、Backup 与 Monitoring 平台。

以上均为 **DEPLOYMENT / EXTERNAL SETUP**，不是当前代码缺口。

## Remaining Gaps

- Real Sowind Gateway 四个 Live Case：`NOT_RUN_NOT_AUTHORIZED / BLOCKED_BY_CREDENTIALS`。
- Real GP/UN WeChat Live：`BLOCKED_BY_CREDENTIALS`。
- GitHub Hosted CI、Production domain/TLS/DB/backup/monitoring 和获授权 Final Production UAT：等待外部环境配置与下一轮独立核验。
- 本轮没有执行 Final Repository Delivery Readiness Audit；最终 A/B/C Verdict 仍待独立 Final Audit。

当前没有已知的 CRM Business Logic、Database Contract、API Contract、Permission、Import/Export 或 Gateway Adapter 代码缺口。

## Handoff Candidate Assessment

**YES — READY FOR FINAL HANDOFF AUDIT**
