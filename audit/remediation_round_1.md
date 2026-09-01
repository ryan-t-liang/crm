# Sowind CRM Repository Remediation Round 1

- Date: 2026-09-01
- Baseline commit: `e6ec4b8ff1859548a6e1d21f571e0afd2874cf0b`
- Scope: `P0-01`、`P0-02`、`P0-03`、`P1-01`
- Result: **PASS — Round 1 目标已完成**
- Boundary: 未处理 Member/WeChat，未改变 Import/Export 业务流程，未重构管理后台，未改变 Fastify + Prisma + MySQL + Outbox 架构。

## Before

| Issue | 修复前状态 |
| --- | --- |
| P0-01 | 所有 `PURCHASE_INTENT` Lead 创建后都会进入待发送状态并产生可执行 Outbox；后台手动新增与批量导入可能自动发送 Gateway。 |
| P0-02 | Lead Phone 在 API、数据库、模板和 Payload 中均按必填处理，Email-only Lead 无法创建。 |
| P0-03 | Lead 使用旧状态集合；HTTP 202 被表达成过度完成语义；Outbox 进入 `DEAD_LETTER` 时 Lead 仍可能停留在普通失败状态。 |
| P1-01 | Integration Attempt 缺少 `triggered_by`、独立 `gateway_ref` 和脱敏 request snapshot，无法还原每次投递的触发来源与请求证据。 |

## Change

### 1. Lead Source Dispatch Policy

- `MINI_PROGRAM` + `USER_SUBMITTED/EXTERNAL_API` + `PURCHASE_INTENT`：创建 Lead 后写入 `SYNC_PENDING`，自动创建 `triggered_by=AUTO` 的 Outbox。
- 后台 `/api/v1/leads`：服务端强制归一为 `ADMIN_MANUAL / ADMIN_MANUAL`，写入 `NOT_SYNCED`，不创建 Outbox。客户端不能通过伪造 Source 绕过规则。
- Import：`BATCH_IMPORT` 写入 `NOT_SYNCED`，不创建 Outbox，不自动调用 Gateway。
- 后台手动同步：统一使用现有 Outbox 与幂等契约，Lead 进入 `SYNC_PENDING`，Outbox 记录 `triggered_by=ADMIN`。
- Worker 重试：第二次及后续 Attempt 记录 `triggered_by=RETRY_JOB`。

### 2. Lead Phone Optional

- `Lead.phone` 改为 nullable。
- Lead API 接受省略、`null` 或空字符串 Phone；有值时仍执行手机号标准化。
- Gateway Payload 在 Phone 缺失时不发送 Phone 字段；有值时输出正常 E.164 值。
- Lead Form Definition、导入模板说明和 Validator 调整为 Phone 选填；会员手机号规则未改动。

### 3. V2.0 Lead Sync Status

正式 Lead 状态仅保留：

- `NOT_SYNCED`
- `SYNC_PENDING`
- `SYNCING`
- `GATEWAY_ACCEPTED`
- `SYNC_FAILED`
- `DEAD_LETTER`

Worker 取得 Outbox 后先写 `SYNCING`。只有 Gateway 返回 HTTP 202、`status=queued` 且提供 `ref` 时，Lead 才写入 `GATEWAY_ACCEPTED`。429、503 和 timeout 按策略重试；达到最大次数后 Outbox 与 Lead 同步进入 `DEAD_LETTER`。HTTP 400 写入 `SYNC_FAILED`，不盲目重试。

代码和 UI 未引入 `CRM_CONFIRMED`。前端对 `GATEWAY_ACCEPTED` 统一显示“Gateway 已受理”，不显示“CRM 同步成功”或“HQ CRM 已完成”。

### 4. Integration Attempt Audit

每次 Attempt 现在记录：

- `triggered_by`：`AUTO` / `ADMIN` / `RETRY_JOB`
- `gateway_ref`
- `request_snapshot_json`
- 原有 endpoint、brand、HTTP status、response、error、开始/结束时间和 duration

Request snapshot 来自不含运行时 `accessKey` 的 Outbox business payload，并再次经过敏感字段递归脱敏；测试明确验证 snapshot 不含 `accessKey` 和 Gateway key。

## Migration

新增：

`backend/prisma/migrations/20260901010000_lead_sync_v2/migration.sql`

迁移采用非破坏式升级：

1. 临时将旧 Lead sync enum 放宽为字符串。
2. 按以下映射保留并转换现有数据：

| 旧值 | 新值 |
| --- | --- |
| `NOT_SYNCED` | `NOT_SYNCED` |
| `PENDING` | `SYNC_PENDING` |
| `GATEWAY_QUEUED` | `GATEWAY_ACCEPTED` |
| `SUCCEEDED` | `GATEWAY_ACCEPTED` |
| `FAILED_VALIDATION` / `FAILED_AUTH` / `FAILED` | `SYNC_FAILED` |
| `FAILED_PERMANENT` | `DEAD_LETTER` |

3. 若现有 Outbox 已为 `DEAD_LETTER`，对应 Lead 强制对齐为 `DEAD_LETTER`。
4. 将 `leads.phone` 改为 nullable，不删除或重写已有手机号。
5. 为 Outbox/Attempt 增加触发来源和审计字段，并从现有 Outbox payload、Lead gateway ref 回填可用历史证据。
6. 将已存在的 Lead Form Definition 中 Phone `required` 更新为 `false`；不修改 Member Form Definition。

### Migration test result

- Fresh DB：空 MySQL 数据库依次应用初始化迁移和 Round 1 迁移，随后 Seed 成功；**PASS**。
- Upgrade existing DB：在初始化 schema 上预置旧状态、已有手机号、旧 Outbox、旧 Attempt 和 Phone 必填的 Lead Form Definition，再应用 Round 1 迁移；记录数和业务数据保留，状态/审计字段/表单规则按预期转换；**PASS**。
- 代表性旧数据验证：`PENDING → SYNC_PENDING`、`GATEWAY_QUEUED → GATEWAY_ACCEPTED`、Outbox `DEAD_LETTER → Lead DEAD_LETTER`、`FAILED_PERMANENT → DEAD_LETTER`；**PASS**。
- 说明：升级测试使用隔离 MySQL 中构造的现有 V1 schema 与数据，不是生产数据库备份恢复演练。

## Tests

### Required commands

| Check | Result |
| --- | --- |
| `npm run prisma:validate` | PASS |
| Fresh DB `prisma migrate deploy` | PASS |
| Upgrade existing DB `prisma migrate deploy` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 23 passed，12 skipped；其中 10 个 DB case 由独立 integration 命令执行，2 个真实 Gateway live case 未启用 |
| DB integration suite | PASS — 10/10；Fresh DB 与 upgraded DB 均通过 |
| `npm run build` | PASS |
| `node --check frontend/js/app.js` | PASS |
| `git diff --check` | PASS |

### A–I acceptance cases

| Case | Result | Evidence |
| --- | --- | --- |
| A. MINI_PROGRAM Lead 自动生成 Outbox | PASS | API integration：`SYNC_PENDING`、Outbox `PENDING`、`triggered_by=AUTO` |
| B. ADMIN_MANUAL Lead 不自动调用 Gateway | PASS | 即使请求伪造 mini-program Source，服务端仍归一为 `ADMIN_MANUAL / NOT_SYNCED`，Outbox count=0 |
| C. IMPORT Lead 不自动调用 Gateway | PASS | Canonical service integration：`BATCH_IMPORT / NOT_SYNCED`，Outbox count=0 |
| D. Admin manual sync 进入 Worker | PASS | 手动同步后 `SYNC_PENDING`；Worker 202 后 `GATEWAY_ACCEPTED`；Attempt `triggered_by=ADMIN` |
| E. Email-only Lead | PASS | HTTP 201；数据库 Phone 为 `NULL` |
| F. Phone present | PASS | Payload unit test：正常 E.164 Phone 字段 |
| G. Gateway 202 | PASS | 只映射为 `GATEWAY_ACCEPTED`，保留 Gateway ref |
| H. 429/503/timeout | PASS | 各自重试至 5 次；首次 `AUTO`、后续 `RETRY_JOB`；Lead/Outbox 均为 `DEAD_LETTER` |
| I. HTTP 400 | PASS | Lead `SYNC_FAILED`、Outbox `FAILED`、仅 1 次 Attempt |

### Fresh Lead API UAT

使用 Fresh DB 和已构建服务，通过真实 HTTP（非 `app.inject`）完成：

1. 登录并完成初始密码变更：HTTP 200。
2. POST Email-only 后台 Lead，并故意提交 `MINI_PROGRAM / EXTERNAL_API`：HTTP 201；响应被安全归一为 `ADMIN_MANUAL / ADMIN_MANUAL`，Phone=`null`，状态=`NOT_SYNCED`。
3. 数据库验证：自动 Outbox count=0。
4. POST 单条手动同步：HTTP 200；Lead=`SYNC_PENDING`，Outbox=`PENDING`，`triggered_by=ADMIN`，Attempt count=0（Worker 尚未消费）。
5. Worker 的 202/重试/死信/400 路径由隔离 DB integration suite 使用可控 Gateway response 完成，不对真实 Sowind Gateway 产生写入。

Result：**PASS**。

## Result

| Issue | Result |
| --- | --- |
| P0-01 | CLOSED |
| P0-02 | CLOSED |
| P0-03 | CLOSED |
| P1-01 | CLOSED |

Round 1 在要求的架构和页面边界内完成。未继续处理 Round 2。

## Remaining Gaps

- 真实 Sowind Gateway live case 仍为 `NOT_RUN`：本轮使用可控 HTTP response 验证 202/400/429/503/timeout，避免向真实外部系统写入。生产接入前仍需使用正式凭据执行获批的联调。
- 生产数据库备份恢复与迁移演练仍为 `NOT_RUN`：本轮验证的是隔离 MySQL 上的 Fresh 与代表性 existing-schema upgrade。
- 原 Repository Delivery Readiness Audit 中除 `P0-01`、`P0-02`、`P0-03`、`P1-01` 外的项目保持原状态；本轮没有处理 Member/WeChat、Import/Export 业务能力、后台重设计或 Round 2 项目。
- `audit/` 中已有 Audit 文件是修复前的 point-in-time evidence；本文件是 Round 1 后的增量结论，不回写历史证据。
