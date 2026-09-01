# Remediation Round 2

**最终判定：PASS — ROUND 2 CLOSED**

## Scope

本轮仅关闭 `P0-04 Member / WeChat Identity Closure`：

- Customer / Brand Profile 的统一会员主流程
- CustomerIdentity 的正式启用与安全回填
- 微信手机号解析 Adapter、独立身份上下文与 `/me/member` API
- Member 注册、品牌资料编辑、Journey 与 Audit
- Mini Program Lead 的可信会员自动关联
- Round 1 Lead / Outbox 行为回归

本轮未改动 Import / Export / Excel 正式模板，未重新设计 UI，未改变 Fastify + Prisma + MySQL + Outbox 架构，也未调用真实 Sowind Gateway。

## Before

### Current Member Flow

修复前的真实代码流程如下：

1. `POST /api/v1/customers` 在 Customer Route 中直接通过 Prisma 创建 Customer。
2. 手机号使用现有 `normalizeMobile` 处理，并写入唯一字段 `mobile_normalized`。
3. Customer 创建后直接创建一个 `CustomerBrandProfile`。
4. GP / UN 依赖相同 `mobile_normalized` 查找 Customer，但创建、加品牌和编辑路径没有共享一套 canonical service。
5. OpenID 主要保存在 `customer_brand_profiles.open_id`。
6. UnionID 主要保存在 `customer_brand_profiles.union_id`。
7. `CustomerIdentity` 已有表和 scoped unique key，但未进入会员注册、编辑和识别的实际主流程。
8. Lead 仅在调用方显式传入 `customerId` 时关联 Customer；Mini Program 请求不能通过可信微信上下文自动关联。
9. 注册使用 `MEMBER_REGISTERED` Journey；Profile Update 未写 `PROFILE_UPDATE` Journey。
10. 没有正式 WeChat Adapter、手机号解析 API或与 Admin Session 隔离的小程序身份上下文。

主要风险：身份仍以 Brand Profile 旧字段为主、同一业务规则存在多条直接 Prisma 路径、跨品牌身份作用域不够清晰、Mini Program Lead 依赖前端提交 Customer ID。

## Architecture

| 模块 | 本轮后的职责 |
|---|---|
| Customer | 本地“人”主档；`mobile_normalized` 唯一，同一标准化手机号只创建一个 Customer。 |
| CustomerBrandProfile | 品牌关系与注册表资料；同一 Customer 可分别拥有 GP 与 UN Profile，唯一键保持 `customer_id + brand_id`。 |
| CustomerIdentity | 正式身份来源；记录 `customer_id + brand_id + identity_type + scope + value + verified_at + source`。 |
| WeChatClient | Production 实现从服务端环境读取品牌 AppID / AppSecret；测试通过依赖注入使用 Fake Client。 |
| WechatIdentityContext | 与 Admin Session 独立的短期上下文；只保存加盐哈希后的 context token，并限制品牌与过期时间。 |
| Canonical Member Service | Admin 和 WeChat 注册共用 Customer 复用、Profile 创建、Consent、Journey、Identity 与 Audit 逻辑。 |
| Lead | Mini Program 请求可从有效 WeChat Context 解析 Customer；不能识别时仍以 `customer_id = null` 创建 Lead 和 Outbox。 |

正式合并规则：

- 跨品牌强匹配只使用 `normalized mobile`。
- OpenID / UnionID 只在 `brand + identity_type + scope + value` 内识别和去重。
- 不以 Email 合并 Customer。
- 不以跨品牌相同 UnionID 无条件合并 Customer。
- Admin 手填的旧身份写入 CustomerIdentity 时 `verified_at = null`，不会伪装成微信已验证身份。

## Changes

### Canonical Member

- 新增 `backend/src/customers/service.ts`，集中实现 `registerCanonicalMember` 与 `updateCanonicalMemberProfile`。
- 新增 `backend/src/customers/schemas.ts`，Admin 与 WeChat Profile 共享字段、校验和类型；WeChat 注册不允许调用方传品牌、手机号或身份值。
- Admin 新建会员、增加品牌资料、编辑品牌资料全部复用 canonical service。
- 相同标准化手机号注册另一个品牌时复用 Customer，仅新增对应 Brand Profile。
- 重复注册同品牌时，Admin 返回 Conflict；WeChat 返回已有 Profile，不创建重复关系或重复 REGISTER Journey。
- 新注册写本地 Consent、`REGISTER` Journey 和 `MEMBER_REGISTER` Audit；不会创建 Sowind Outbox。
- Profile 更新写 `PROFILE_UPDATE` Journey 和 `MEMBER_PROFILE_UPDATE` Audit，且只更新目标品牌 Profile。

### Customer Identity

- 新增 `backend/src/customers/identity.service.ts`，CustomerIdentity 进入注册和身份识别主流程。
- 微信已验证流程可写 `VERIFIED_MOBILE`、`OPENID`、`UNIONID`；每条记录带品牌、App/Open Platform scope、来源和 verified timestamp。
- 相同 scoped identity 已绑定其他 Customer 时返回 HTTP 409 `IDENTITY_CONFLICT`，记录 Audit，保持原绑定不变，不自动 merge。
- Admin 旧字段使用 `LEGACY_APP:<brand>` / `LEGACY_OPEN_PLATFORM:<brand>` 作用域且保持未验证。
- 后台详情以 `Customer.identities` 为身份来源；前端按品牌分组并默认脱敏展示。旧 Profile 字段暂时保留兼容。

### WeChat

- 新增 `WechatClient` 接口与 `WechatApiClient` Production 实现。
- Production 实现从 Backend Environment 获取品牌 AppID / AppSecret，调用微信 access token 与手机号解析接口。
- 新增独立 `WechatIdentityContext`，不复用 Admin Session；context token 仅在创建响应中返回，数据库只存带服务端 Secret 的 SHA-256 哈希值。
- context 强制校验过期时间和品牌边界；`/me/member` 只返回当前品牌 Profile。
- `/me/member` 响应使用显式字段选择，不返回 Profile 旧 `open_id`、`union_id`、原始 registration snapshot 或 extra attributes。
- 新增 `IDENTITY_BIND`、`IDENTITY_CONFLICT`、`WECHAT_PHONE_RESOLVE_FAILURE` Audit；Audit 不含临时授权 code、Secret、access token 或完整 context token。

### Mini Program Lead

- `POST /api/integration/v1/leads` 保持 Round 1 的 HMAC、nonce、Local DB、`SYNC_PENDING` 与 Outbox 行为。
- Backend 可选读取 `x-wechat-context-token`，按当前品牌从可信上下文解析 Customer，并覆盖客户端传入的非可信 `customerId`。
- 识别失败、context 无效或会员不存在时降级为 `customer_id = null`，不阻止 Lead 和 Outbox 创建。
- 没有通过 Email 或跨品牌 UnionID 自动合并 Customer。

### Configuration / Frontend

- `.env.example` 新增 GP / UN AppID、AppSecret、Open Platform Scope 和 Context TTL，占位符不含真实 Secret。
- Fastify logger 对微信 context header、授权 code、Admin/WeChat/Sowind secrets 做 redact。
- Customer 详情的身份展示改为读取 CustomerIdentity，按 GP / UN 分组、显示 scope 并默认脱敏。
- 未进行 UI 重构。

## Migration

新增：

`backend/prisma/migrations/20260901020000_member_wechat_identity/migration.sql`

迁移内容：

1. 为 `customer_identities` 增加非空 `source`；已有 Identity 标记为 `LEGACY_IDENTITY_MIGRATION`。
2. 新建 `wechat_identity_contexts`，包含 token hash、brand、可选 customer、App/scope、标准化手机号、可选 OpenID/UnionID、verified/expiry/last-seen timestamp 和必要索引、外键。
3. 将 `customer_brand_profiles.open_id` 回填为 `OPENID + LEGACY_APP:<brand>` CustomerIdentity。
4. 将 `customer_brand_profiles.union_id` 回填为 `UNIONID + LEGACY_OPEN_PLATFORM:<brand>` CustomerIdentity。
5. 所有旧 Profile 身份回填记录保持 `verified_at = null`、`source = LEGACY_PROFILE_BACKFILL`，不会被认证流程信任。
6. 原位将 Journey `MEMBER_REGISTERED` 改为 `REGISTER`，不删除事件。
7. 保留 Profile 的 `open_id` / `union_id` 旧字段，避免破坏兼容读取。

未修改已冻结的 `20260831000000_init` 和 `20260901010000_lead_sync_v2` Migration，未删除任何现有数据。

### Upgrade DB 实测

| 检查项 | Round 2 前 | Round 2 后 | 结果 |
|---|---:|---:|---|
| Customers | 1 | 1 | PASS，无意外新增 |
| Brand Profiles | 2（GP + UN） | 2 | PASS，无重复 |
| CustomerIdentity | 1 | 5 | PASS，增加 4 条未验证旧身份回填 |
| Leads | 1 | 1 | PASS，无数据丢失 |
| Lead Sync Status | `GATEWAY_ACCEPTED` | `GATEWAY_ACCEPTED` | PASS，Round 1 状态未改变 |
| Journey | `MEMBER_REGISTERED` | `REGISTER` | PASS，原记录保留并对齐字典 |
| 已有 verified Identity | verified | verified | PASS，原绑定和时间保留 |
| WeChat Context Table | 无 | 有 | PASS |

升级后的数据库再次执行 Round 1 + Round 2 集成测试：22 / 22 PASS。

## API

### `POST /api/v1/wechat/phone/resolve`

- 输入：`brandCode`、临时手机号授权 `code`、可选 `appContext`。
- 成功：服务端解析并 normalize 手机号，创建短期微信身份上下文，返回标准化手机号、verified timestamp、context token 与过期时间。
- 未配置正式凭据：HTTP 503 `WECHAT_NOT_CONFIGURED`。
- scoped identity 冲突：HTTP 409 `IDENTITY_CONFLICT`。
- 路由限流：20 次 / 分钟。

### `GET /api/v1/me/member`

- 认证：`x-wechat-context-token` 或独立 Bearer context token。
- 已注册：`registered = true`，仅返回 context 所属品牌 Profile 与 Consent 摘要。
- 未注册：`registered = false`。
- 不使用 Admin Session，不跨品牌返回 Profile。

### `POST /api/v1/me/member`

- 使用微信 context 内的 verified mobile、品牌和 identity 注册。
- 新手机号创建 Customer + 当前品牌 Profile。
- 已有手机号新增另一品牌 Profile。
- 已有同品牌 Profile 返回已有记录，不重复创建。

### `PATCH /api/v1/me/member`

- 只编辑当前 context 品牌 Profile。
- 写 `PROFILE_UPDATE` Journey 与 `MEMBER_PROFILE_UPDATE` Audit。

### 现有 API 调整

- Admin Customer create / add-brand / profile-edit 复用 canonical member service；原有 RBAC guard 与 Brand Scope 保持。
- Mini Program Lead API 可使用同一微信 context 自动写 `lead.customer_id`，同时保持未知用户 Lead 的降级路径。

## Tests

### Round 2 A–L

| 用例 | 结果 | 验证 |
|---|---|---|
| A. 新手机号注册 GP | PASS | Customer 1、GP Profile 1、REGISTER Journey 1 |
| B. 同手机号再注册 UN | PASS | Customer 仍为 1、Profiles 为 2 |
| C. 重复注册同品牌 | PASS | 不产生第二个 Profile 或 REGISTER Journey |
| D. GP Profile Update | PASS | 写 PROFILE_UPDATE；UN Profile 未变化 |
| E. CustomerIdentity Bind | PASS | verified mobile / OpenID 按品牌与 App scope 绑定 |
| F. Identity Conflict | PASS | HTTP 409；原绑定不变；写 IDENTITY_CONFLICT Audit |
| G. WeChat phone resolve Fake Adapter | PASS | code 解析为标准化手机号；code / Secret 未持久化或写 Audit |
| H. GET /me/member | PASS | 已注册 true；未注册 false |
| I. GP / UN Profile isolation | PASS | GP context 不返回 UN Profile |
| J. MINI_PROGRAM Lead auto-link | PASS | 可信 context 自动写 customer_id，并创建 Outbox |
| K. Unknown user Lead | PASS | customer_id 为 null；Lead 与 Outbox 正常创建 |
| L. Member Registration | PASS | 不创建 Sowind Outbox，不调用 Gateway |

### WeChat Client Unit

- Production Client 的成功契约：PASS（mock fetch）。
- Provider error 不泄露 access token、Secret 或临时 code：PASS。

### 命令结果

| 命令 / 检查 | 结果 |
|---|---|
| `npm run prisma:validate` | PASS |
| Fresh DB 全部 Migration | PASS |
| Fresh DB Seed | PASS（2 brands、1 super admin、4 roles、19 permissions） |
| Existing Round 1 DB Upgrade | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS：25 passed；24 个 DB / live 测试按环境开关跳过 |
| DB + HTTP Integration | PASS：22 / 22 |
| `npm run build` | PASS |
| `node --check frontend/js/app.js` | PASS |
| `git diff --check` | PASS |
| Built server Start + `/api/health` | PASS：HTTP 200、database ok、version 1.15.0 |

## Round 1 Regression

**PASS**

Round 1 集成测试 A–I 全量重跑通过，包括：

- MINI_PROGRAM 自动创建 Outbox
- ADMIN_MANUAL 保持 `NOT_SYNCED` 且不自动调用 Gateway
- IMPORT 保持 `NOT_SYNCED` 且不自动调用 Gateway
- Admin manual sync 进入 `SYNC_PENDING` 后由 Worker 处理
- Email-only Lead 可创建
- Phone 仍为 optional；存在时正常标准化为 E.164 payload
- HTTP 202 仅映射 `GATEWAY_ACCEPTED`
- 429 / 503 / timeout 重试至 `DEAD_LETTER`
- 400 映射 `SYNC_FAILED` 且不盲目重试

Fresh DB 与 Upgrade DB 上均执行 Round 1 + Round 2 共 22 项集成测试，全部通过。

## Fresh DB

**PASS**

1. 在隔离 MySQL 8.4 空库依次执行 init → Round 1 → Round 2，3 个 Migration 全部成功。
2. Seed 成功：2 个品牌、1 个 Super Admin、4 个角色、19 个权限。
3. Build 和 Start 成功；`GET /api/health` 返回 HTTP 200 与 `database = ok`。
4. 使用 Fake WeChat Client 在该 Fresh DB 完成 Register GP、Register UN、Edit、Identity、Lead auto-link 与 unknown-user Lead 流程，12 / 12 PASS。
5. 同一 Fresh DB 的 Round 1 regression 10 / 10 PASS。

## Upgrade DB

**PASS**

1. 构造只含 init + Round 1 Migration 的现有数据库。
2. 预置 1 Customer、GP / UN 两个 Profile、Profile 旧 OpenID / UnionID、已有 verified Identity、1 条 `GATEWAY_ACCEPTED` Lead 和 1 条 `MEMBER_REGISTERED` Journey。
3. 单独执行 Round 2 Migration 成功。
4. Customer / Profile / Lead 数量不变；旧身份回填 4 条未验证 scoped Identity；既有 verified Identity 保留；Lead 状态不变；Journey 原位对齐为 REGISTER。
5. 升级库继续执行 22 项 Round 1 + Round 2 集成测试，全部 PASS。

## Security Review

**PASS（代码、配置与自动化验证范围）**

- 微信 AppSecret 只从 Backend Environment 读取；`.env.example` 仅有 placeholder。
- Frontend、Migration、数据库配置表和 Audit 中没有真实 AppSecret。
- logger 明确 redact Admin cookie / authorization、微信 context header、临时授权 code、Admin/WeChat/Sowind Secret。
- WeChat context token 只返回一次，数据库只持久化不可逆 hash。
- Fake Adapter 测试确认临时 code 和 Secret 不出现在 Audit。
- `/me/member` 不返回原始 OpenID / UnionID 或完整提交快照。
- Identity Conflict 不静默覆盖、不自动合并 Customer，且 Audit 不记录完整 identity value。
- Admin 手填 identity 为 unverified；旧 Profile backfill 也为 unverified。
- 真实 Sowind Gateway 未调用，未向 HQ 写测试 Lead。

真实微信 Live Test：**NOT_RUN / BLOCKED_BY_CREDENTIALS**。

- 当前环境未提供 GP / UN 正式 AppID、AppSecret 和可用微信授权 code。
- Built production adapter 已实测在无凭据时返回 HTTP 503 `WECHAT_NOT_CONFIGURED`，没有伪造成功。
- 正式凭据接入后仍需执行一次真实微信授权闭环测试。

## Remaining Gaps

以下均明确不属于 Round 2，本轮未处理：

- Import
- Export
- Excel Template 正式字段与校验
- RBAC dependency
- Metrics
- 422 fieldErrors
- 既有 Audit remaining gaps
- Sowind Gateway 4 个 live cases

外部 / 产品决策仍需确认：

- GP / UN 正式 AppID、AppSecret 与 Secret Manager 配置。
- 若正式流程需要 OpenID / UnionID，需确认小程序登录 code / session 的来源与 Open Platform 归属；当前手机号授权闭环可仅凭 verified mobile 工作，不假设两个品牌共享 UnionID。
- 真实微信 Live Test 待凭据和授权环境提供后执行。

## Result

**PASS — ROUND 2 CLOSED**

CustomerIdentity 已进入主流程；微信手机号解析和独立身份上下文契约完成；同手机号跨 GP / UN 只创建一个 Customer；Profile Update、Lead auto-link、unknown-user fallback、Identity conflict、Fresh DB、Upgrade DB、Round 1 regression、Build 与全部规定检查均通过。

Round 2 到此停止，不进入 Round 3。
