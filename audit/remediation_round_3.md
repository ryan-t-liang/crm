# Remediation Round 3

## Scope

本轮仅关闭：

- P0-05：Member / Lead 正式导入流程。
- P0-06：四份正式 XLSX Template 合同。
- P0-07：Member / Lead Export Scope 与字段选择。

本轮没有修改已冻结的 Member / WeChat 架构、Lead Source Dispatch Policy、Lead Sync Status、Gateway Payload Builder 或管理后台整体视觉。没有执行真实 Sowind Gateway 写入，也没有扩大微信 Live Test 授权。

## Before

修改前的真实流程审计结果如下：

| 流程 | 修改前真实行为 | 结论 |
| --- | --- | --- |
| Current Member Import Flow | 上传 XLSX 后，单一请求内解析并直接写 Customer / Brand Profile；只有 `SKIP / UPDATE` 粗粒度策略。 | 有真实 DB 写入，但不是 Upload → Preflight → Execute 两阶段。 |
| Current Lead Import Flow | 上传 XLSX 后直接调用 Canonical Lead Service 写 Lead；Phone 被 `required()` 强制；无正式 member match、unmatched strategy、Lead No conflict 或 possible duplicate。 | 有真实 DB 写入，但违反 Phone optional 和正式导入策略。 |
| Current Export Flow | Backend 从 DB 查询并生成真实 XLSX，Brand Scope 基础限制已存在；请求只支持 `brandCode`。 | Backend 有真实导出，Frontend 只有“一键全量导出”；缺 CURRENT_FILTER、SELECTED_IDS、ALL 和 fields allowlist。 |
| Current Template Generation Flow | Backend 用活动 FormDefinition 的通用 `schemaJson.fields` 生成 XLSX。 | 有 ExcelJS、红色 `*`、Phone Text 格式和 Freeze Row；四份模板的列数、Header、必填规则与 V2.0 不一致，Template / Validator / Importer 不是同一正式合同。 |
| Import UI | 三步外观存在，但 Step 2 只是“服务端校验与导入”处理中；上传请求已写正式业务表。History 只存在当前浏览器会话。 | UI 有，Backend 状态机和预检 API 没有。 |
| Import Job / Export Job | 已有 `ImportJob`、`ImportJobRow`、`ExportJob`，并写 MySQL。 | 可复用，但缺 hash、mapping、preflight/result、策略、失败文件、scope、fields 和 expiry 等合同字段。 |

依据：`audit/gap_report.md` 的 P0-05 / P0-06 / P0-07、`audit/handoff_checklist.md` 以及修改前 `backend/src/jobs/routes.ts`、`frontend/js/app.js`。

## Architecture

导入链路统一为：

```text
Formal Import Schema
  → Backend ExcelJS Template
  → Upload + SHA-256 file hash
  → Header Mapping + Validator + Preflight Rows
  → ImportJob(PREFLIGHT_READY)
  → 用户确认 Conflict / Unmatched Strategy
  → POST /api/v1/imports/{jobId}/execute
  → Transactional DB Write
  → ImportJob Result + Failure CSV + History + Audit
```

上传与 Preflight 只写 `ImportJob / ImportJobRow / AuditLog`，不写正式 Customer、Brand Profile 或 Lead。只有 Execute 修改业务数据。

导出链路统一为：

```text
Export Request
  → Scope(CURRENT_FILTER / SELECTED_IDS / ALL)
  → Backend Permission + Brand Scope
  → Object-specific Field Allowlist
  → 重新查询完整 DB 结果集
  → ExcelJS XLSX
  → ExportJob + authenticated private download
```

`CURRENT_FILTER` 传递查询条件并由 Backend 重新查询完整结果集，不等于当前分页。`SELECTED_IDS` 会重新校验 ID、权限和品牌范围。`ALL` 只包含当前账号可访问的品牌范围。

## Changes

- 新增 `backend/src/jobs/formal-schema.ts`，作为四份 Template、Importer 与 Validator 的单一字段源。
- 新增 `backend/src/jobs/import-export.service.ts`，负责 Template、Parse、Normalize、Preflight、Execute、Failure CSV 与 file hash。
- 重构 `backend/src/jobs/routes.ts`：
  - `GET /api/v1/templates/{customers|leads}`
  - `POST /api/v1/imports/{customers|leads}`（Upload + Preflight）
  - `POST /api/v1/imports/{jobId}/execute`
  - `GET /api/v1/imports/history`
  - `GET /api/v1/imports/{jobId}`
  - `GET /api/v1/imports/{jobId}/failures`
  - `POST /api/v1/exports/{members|customers|leads}`
  - `GET /api/v1/exports/{jobId}/download`
- Frontend 沿用原视觉，接入真实“上传数据 → 数据检查 → 导入完成”、Mapping、预检指标、ALL / IMPORTABLE / CONFLICT / ERROR、策略选择、真实 History、Failure CSV 与导出范围/字段选择。
- 相同 file hash 默认返回 `IMPORT_FILE_DUPLICATE`；用户必须通过明确“确认重新上传同一文件”操作才可带 `allowDuplicate=true` 重跑。每次 Job 仍保留独立 hash、操作者与审计轨迹。
- 导入历史返回真实 `operatorName`，不再只显示当前浏览器会话。
- 新增 Audit：`IMPORT_UPLOAD`、`IMPORT_PREFLIGHT`、`IMPORT_EXECUTE`、`IMPORT_FAILURE_DOWNLOAD`、`EXPORT_CREATE`、`EXPORT_DOWNLOAD`。

## Migration

新增非破坏迁移：

`backend/prisma/migrations/20260901030000_import_export_v2/migration.sql`

主要变更：

- 扩展 `JobStatus`：`UPLOADED`、`PREFLIGHT_READY`、`READY_TO_EXECUTE`、`COMPLETED_WITH_ERRORS`。
- `ImportJob` 增加 file hash、mapping/result JSON、unmatched strategy、importable/created/updated counts、failure path、preflight/processing timestamps 和索引。
- `ImportJobRow` 增加 conflict type、normalized data、warnings 和 resolved Customer/Profile/Lead IDs。
- `ExportJob` 增加 scope、filter snapshot、selected count、requested/effective fields、brand scope、expiresAt。
- 历史 `PARTIAL` Job 非破坏映射为 `COMPLETED_WITH_ERRORS`；未删除任何旧列或业务记录。

Fresh DB 与 Round 2 Existing DB 均显示 4 个 Migration 全部 applied、schema up to date。

## Formal Templates

| 文件 | 对象 | 品牌 | 列数 | Lead Phone | Member Phone | 结果 |
| --- | --- | --- | ---: | --- | --- | --- |
| `member_GP_import_template.xlsx` | Member | GP | 21 | 不适用 | 必填，Text | PASS |
| `member_UN_import_template.xlsx` | Member | UN | 22 | 不适用 | 必填，Text | PASS |
| `lead_GP_purchase-intent_template.xlsx` | Lead | GP | 20 | 选填，Text | 不适用 | PASS |
| `lead_UN_purchase-intent_template.xlsx` | Lead | UN | 21 | 选填，Text | 不适用 | PASS |

四份文件均由 Fresh DB 运行中的 HTTP API 真实下载，响应 filename 与上表完全一致。程序化检查已验证：Header 顺序、必填 `*`、红色 `FFD32F2F`、示例行、Sheet name、`填写说明` Sheet、Phone `@` Text Format、Freeze First Row、Autofilter 和列数。macOS Quick Look 视觉检查确认中文 Header 与红色 `*` 可见。

## Member Import

- Preflight 指标：Total、Importable、New Customer、New Brand Profile、Existing Profile Conflict、File Duplicate、Error。
- 每行记录 row number、status、conflict type、errors/warnings、normalized identifiers 和 resolved IDs。
- normalized mobile 为 Customer 强匹配键；同手机号跨 GP / UN 复用 1 Customer 并创建独立 Brand Profile。
- 正式策略：`SKIP`、`FILL_EMPTY`、`OVERWRITE`。
- OpenID / UnionID 以 `BATCH_IMPORT`、Import scope、`verifiedAt=null` 写入；identity scope conflict 直接行错误，不抢绑。
- Consent 以 `BATCH_IMPORT` 和 import policy/evidence 语义追加，不伪造微信现场授权时间。

## Lead Import

- Preflight 指标：Total、Importable、New Lead、Matched Member、Unmatched Member、Existing Lead Conflict、Possible Duplicate、Error。
- Email 必填；Phone 选填。只有合法 Phone 才能作为 Customer 强匹配依据。
- 正式冲突策略：`SKIP`、`UPDATE_EXISTING`。
- 正式未匹配策略：`IMPORT_LEAD_ONLY`、`CREATE_MEMBER`；后者没有合法 Phone 时返回 `PHONE_REQUIRED_FOR_MEMBER`，不会伪造 Customer。
- 文件内 Lead No 重复为 ERROR；数据库 Lead No 已存在为 CONFLICT。
- 无 Lead No 的 possible duplicate 使用安全 fallback，Phone 为 null 时不会把不相关记录批量误判为同一条。
- 所有 Import Lead 均为 `source=BATCH_IMPORT`、`submissionMode=BATCH_IMPORT`、`syncStatus=NOT_SYNCED`；Execute 不创建 Gateway Outbox。

Fresh HTTP UAT 的 GP Lead 结果：`BATCH_IMPORT / BATCH_IMPORT / NOT_SYNCED`，手机号保持 E.164，Outbox count = 0。

## Import History

- `GET /api/v1/imports/history` 返回持久化 Job，而非本次浏览器会话数组。
- 返回 job、object type、brand、subtype、file、operatorName、计数、时间和状态。
- Backend 根据 permission 与 brand scope 过滤；UN Brand Admin 无法读取 GP Job。

## Failure CSV

- 失败或预检错误会生成真实 CSV。
- 至少包含 `original_row_number`、`business_identifier`、`error_code`、`error_message` 及原字段。
- 下载必须持有有效 Session、相应 import permission 和品牌权限；跨品牌访问返回 404，不暴露资源存在性。

## Export

- Member 与 Lead 均支持 `CURRENT_FILTER`、`SELECTED_IDS`、`ALL` 和 `fields`。
- `CURRENT_FILTER` 由 Backend 对全数据库重新应用查询条件。
- `SELECTED_IDS` 重新查询并验证全部 ID；越权集合整体拒绝。
- `ALL` 仅导出当前用户可访问的品牌范围。
- 字段来自 object-specific allowlist；`passwordHash` 等非法/敏感字段返回 `INVALID_EXPORT_FIELDS`。
- XLSX 行数与 ExportJob `rowCount` 程序化比对一致。
- 文件使用私有 storage path、24 小时 `expiresAt` 和鉴权下载 URL；没有永久公开 URL。

## Security / Brand Scope

- Import、Template、History、Failure CSV、Export create 与 Export download 均由 Backend Guard 强制 permission / brand scope。
- UN Brand Admin：GP Template 403、GP Export 403、GP Import Job / Failure File 不可见、`ALL` XLSX 不含 GP 数据。
- Viewer：Import API 403、Export API 403。
- SELECTED_IDS 中存在越权 ID：整体 403。
- Audit 仅记录文件名、hash、计数、策略、范围与字段等必要元数据，不记录 password、Secret、AccessKey 或完整敏感文件内容。

## Tests

### Member Import

| Case | 验证 | 结果 |
| --- | --- | --- |
| MI-A | 全新手机号 → NEW_CUSTOMER | PASS |
| MI-B | 已有 Customer、无当前 Profile → NEW_BRAND_PROFILE | PASS |
| MI-C | Existing Profile + SKIP 不改变 | PASS |
| MI-D | FILL_EMPTY 只补空字段 | PASS |
| MI-E | OVERWRITE 只覆盖允许字段 | PASS |
| MI-F | 文件内 normalized mobile + brand 重复 → ERROR | PASS |
| MI-G | Identity scoped conflict 不抢绑 | PASS |
| MI-H | OpenID / UnionID import 为 unverified | PASS |
| MI-I | Consent source / evidence 保持 BATCH_IMPORT 语义 | PASS |
| MI-J | Failure CSV 包含原行号和原因；跨品牌不可下载 | PASS |

### Lead Import

| Case | 验证 | 结果 |
| --- | --- | --- |
| LI-A | 新 Lead + Phone 匹配 Member | PASS |
| LI-B | 新 Lead + 无 Member + IMPORT_LEAD_ONLY | PASS |
| LI-C | 新 Lead + 无 Member + CREATE_MEMBER | PASS |
| LI-D | CREATE_MEMBER 无合法 Phone 时拒绝伪造会员 | PASS |
| LI-E | Existing Lead + SKIP 保持原值 | PASS |
| LI-F | Existing Lead + UPDATE_EXISTING 保留 lead_id 并更新允许字段 | PASS |
| LI-G | 文件内 Lead No 重复 → ERROR | PASS |
| LI-H | 数据库 Lead No → EXISTING_LEAD conflict | PASS |
| LI-I | Possible Duplicate 只提示，不自动合并 | PASS |
| LI-J | Email-only Lead 可导入 | PASS |
| LI-K | 所有 Import Lead → NOT_SYNCED | PASS |
| LI-L | 所有 Import Lead → Gateway Outbox count 0 | PASS |

### Export

| Case | 验证 | 结果 |
| --- | --- | --- |
| EX-A | Member CURRENT_FILTER | PASS |
| EX-B | Member SELECTED_IDS | PASS |
| EX-C | Member ALL | PASS |
| EX-D | Lead CURRENT_FILTER | PASS |
| EX-E | Lead SELECTED_IDS | PASS |
| EX-F | Lead ALL | PASS |
| EX-G | Field Selection | PASS |
| EX-H | 非法 / 敏感字段拒绝 | PASS |
| EX-I | UN Admin ALL 无 GP 数据 | PASS |
| EX-J | Viewer / no-export permission → 403 | PASS |
| EX-K | Download 鉴权 | PASS |
| EX-L | Job rowCount 与 XLSX 实际数据行一致 | PASS |

### Template Tests

| Template Test | 结果 |
| --- | --- |
| Member GP = 21 columns | PASS |
| Member UN = 22 columns | PASS |
| Lead GP = 20 columns | PASS |
| Lead UN = 21 columns | PASS |
| Header order / Required red `*` / Phone text / Example / Sheet / Freeze / Filter | PASS |
| Lead Phone 无 `*`、Member Phone 有 `*` | PASS |

### Commands and UAT

| Check | 结果 |
| --- | --- |
| `npm run prisma:validate` | PASS |
| Fresh DB full migration + seed | PASS |
| Existing DB upgrade migration | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS：29 passed；DB suites 与 live suites在普通单元命令中按环境 skip，随后独立执行 |
| Fresh DB Integration | PASS：35/35 |
| Upgrade DB Integration | PASS：35/35 |
| HTTP API Member Import / Lead Import / Export / 4 Templates | PASS |
| Browser UAT：Member 三阶段导入、重复文件确认、Lead 策略、Export | PASS；console error = 0 |
| Template XLSX programmatic validation | PASS |
| `npm run build` | PASS |
| `node --check frontend/js/app.js` | PASS |
| `git diff --check` | PASS |
| Real Sowind Gateway write | NOT_RUN：本轮明确禁止 |
| Real WeChat Live Test | NOT_RUN / BLOCKED_BY_CREDENTIALS：保持 Round 2 状态 |

## Round 1 Regression

PASS。

- `tests/lead.remediation.integration.test.ts`：10/10。
- MINI_PROGRAM 自动 Outbox、ADMIN_MANUAL / BATCH_IMPORT 不自动 Outbox、Email-only、Phone E.164、HTTP 202 → GATEWAY_ACCEPTED、retry/dead-letter、400 no blind retry 均保持通过。
- 本轮没有修改 Gateway Payload Builder 或正式 Lead Sync Status。

## Round 2 Regression

PASS。

- `tests/member.remediation.integration.test.ts`：12/12。
- 1 Customer + 2 Brand Profiles、Identity、`/me/member`、PROFILE_UPDATE、Lead auto-link、unknown-user Lead、Member registration no Gateway 均保持通过。
- WeChat live 仍为 `BLOCKED_BY_CREDENTIALS`，没有扩大授权或虚构结果。

## Fresh DB

PASS。

- MySQL 8.4 隔离库：`sowind_r3_fresh`。
- 从 0 依次应用 `20260831000000_init`、Round 1、Round 2、Round 3，共 4 个 Migration。
- Seed、Build、Start、Health、Member Import、Lead Import、Export、四份 Template 均通过。
- Fresh Browser UAT：UN Member 导入成功 1/1；列表从 0 刷新为 1；GP Lead 导入成功 1/1；Lead 为 NOT_SYNCED 且 Outbox 0；Member Export 下载成功 1 行。

## Upgrade DB

PASS。

- 隔离库：`sowind_r3_upgrade`。
- 先应用 init + Round 1 + Round 2，并预置 Customer、Profile、Identity、Lead、Outbox、Attempt、旧 ImportJob、旧 ExportJob 各 1 条。
- 应用 Round 3 后，上述 8 类记录全部保留。
- 代表性 Lead `R3-UP-LEAD` 的 `GATEWAY_ACCEPTED` 未改变；Identity 未改变；Outbox `SUCCEEDED` / attempts=1 未改变；旧 Import / Export Job 仍为 `COMPLETED`。
- 当前 schema up to date；Upgrade DB 35/35 integration regression 通过。

## Remaining Gaps

以下明确留到 Round 4 / Final Audit，本轮未处理：

- RBAC parent/child dependency。
- Server-side Metrics。
- 422 fieldErrors。
- Audit remaining gaps。
- Integration Test coverage / CI strengthening。
- Production observability。
- Gateway Four System / Live Cases。

另外，真实 WeChat Live Test 继续为 `BLOCKED_BY_CREDENTIALS`；真实 Sowind Gateway 写入为 `NOT_RUN`，均不是本轮授权范围。

## Result

PASS — ROUND 3 CLOSED
