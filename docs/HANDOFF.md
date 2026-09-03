# Kivisense CRM 技术交接说明

本文是公司开发、部署与运维人员接手 Sowind CRM 的正式入口。它说明当前交付边界、正式运行合同和接手顺序；具体部署命令、运维排障、API 与 Gateway Payload 细节继续以文末链接的专项文档为准。

## 1. 交付信息

| 项目 | 交付值 |
|---|---|
| Repository | `https://github.com/ryan-t-liang/crm.git` |
| Branch | `main` |
| Frozen Release / Git Tag | `Kivisense_CRM_v1` |
| Internal SemVer | `1.15.0` |
| Historical V3 Audited Baseline SHA | `e02f5c50d91dfda162afcef6a8aa2f3372e43647` |
| Final Verdict | `B — HANDOFF READY WITH SETUP` |
| Hosted CI | 以冻结 Tag 对应的 GitHub Actions 结果为准 |

V3 最终审计结论是：GitHub Repository 可以正式交接给公司开发。上述 SHA 是历史 V3 已审计基线；冻结 Tag 在该基线上追加了已确认的界面、交互、校验和会员编号修复。公司部署必须固定 `Kivisense_CRM_v1`，并记录 Tag 解析出的 Commit SHA 和镜像 Digest。

Verdict 为 B 的原因是 Production 环境、真实外部凭据和获授权 Live UAT 尚待公司完成，不是因为 Repository 存在待修复的 Code Gap 或 Documentation Gap。

## 2. 当前交付状态

| 检查项 | 结果 |
|---|---|
| Fresh Remote Clone | PASS |
| MySQL 8.4 | PASS |
| Migration | Fresh MySQL 8.4 6/6 PASS；现有数据库 Upgrade PASS |
| Seed（`SEED_DEMO_DATA=false`） | PASS |
| Unit | 40 passed / 50 skipped（本地，无数据库与 Live Test） |
| Documentation Contract | 6/6 PASS |
| Frontend Interaction Contract | PASS |
| Integration | 46/46 PASS（本地隔离 Gateway） |
| Hosted CI | 以冻结 Tag 对应的 GitHub Actions 结果为准 |
| Docker Compose / no-cache image build | PASS |
| `/api/health` / `/api/ready` | PASS |
| Remaining Code Gaps | `NONE` |
| Remaining Documentation Gaps | `NONE` |

Unit 中跳过的 50 项为显式隔离的 Integration / Live Test；数据库 Integration Suite 已单独通过 46/46。验证只使用 Fake / Local Integration，没有向真实 Sowind Gateway 或 GP / UN WeChat 发起请求。

## 3. 公司开发接手范围

核心 CRM 已完成，公司开发无需继续修改以下实现：

- Customer / Member、Brand Profile 与 CustomerIdentity。
- WeChat Member Context、手机号授权、会员注册、Profile Update 与身份冲突处理。
- Lead、Lead Sync、Gateway Payload、Gateway Outbox、Retry / Dead Letter 与 Integration Attempt。
- Import、Export、XLSX Template、Conflict Strategy、Failure CSV 与 History。
- RBAC、Brand Scope、Authentication、Session、Audit、Metrics 与 Error Contract。
- Database Schema、现有 Migration 与 CI 验证链路。

下一阶段只应推进 Production Setup → Credentials → Deploy → Authorized Live UAT → Go-live。若业务提出新的需求或外部系统合同发生变化，应作为新的受控变更评审，不能混入交接部署工作。

## 4. 技术栈

- Node.js 22+
- Fastify 5 + TypeScript
- Prisma 6 + MySQL 8.4
- 原生 HTML / CSS / JavaScript 前端
- ExcelJS
- Vitest
- Docker + Docker Compose

## 5. Database / Migration

生产数据库使用 MySQL 8.4。当前 Migration 必须按 Repository 顺序由 Prisma Deploy 执行：

1. `20260831000000_init`
2. `20260901010000_lead_sync_v2`
3. `20260901020000_member_wechat_identity`
4. `20260901030000_import_export_v2`
5. `20260901040000_production_readiness`
6. `20260902010000_customer_number_format`

第 6 条 Migration 新增并发安全的会员编号序列，并将既有 `customers.customer_no` 更新为 `SW` + 8 位数字。它不删除 Customer 或关联业务记录，内部 `customers.id` 及所有外键关系保持不变；升级前仍必须按标准流程完成数据库备份。

部署使用：

```bash
npm run prisma:generate
npm run prisma:validate
npm run prisma:migrate:deploy
```

首次部署的 Seed 按 [DEPLOYMENT.md](DEPLOYMENT.md) 执行；日常发布不重复运行 Seed。不得修改已经执行的历史 Migration，也不得在 Production 使用 `prisma migrate dev`。发布前先备份，发布后核对 `_prisma_migrations`、核心数据和 Readiness。

## 6. Production Environment Requirements

公司在部署前必须准备：

- MySQL 8.4，以及应用专用的 Least Privilege DB User。
- 公司 Secret Manager 和受控的配置发布流程。
- 正式 Domain、TLS 证书和 Nginx 反向代理。
- 与部署路径一致的 `APP_BASE_PATH`、`CORS_ORIGIN` 和 Trusted Proxy 配置。
- 私有、持久化的 Import / Export Storage，以及权限、容量和生命周期策略。
- Central Logs、Monitoring、Alert 与明确的 On-call Owner。
- 数据库全量 Backup、binlog / PITR、文件备份和定期 Restore Drill。
- 固定的 Deployment Commit、Docker Image Digest、发布与回滚记录。

不要直接将 MySQL 或应用容器端口暴露到公网。完整部署与回滚步骤见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 7. Secrets / Environment

`.env.example` 是唯一环境变量模板。复制后由部署系统注入真实值，任何真实 Secret 都不得进入 Git、镜像、前端、工单或日志。

至少需要由公司配置：

- Session Secret：`SESSION_SECRET`
- Initial Admin Password：`INITIAL_PASSWORD`
- Integration HMAC Secret：`INTEGRATION_CLIENT_SECRET`
- Sowind Gateway Access Key：`SOWIND_GATEWAY_ACCESS_KEY`
- GP WeChat：`WECHAT_GP_APP_ID` / `WECHAT_GP_APP_SECRET`
- UN WeChat：`WECHAT_UN_APP_ID` / `WECHAT_UN_APP_SECRET`

Gateway、WeChat、Session 与 Integration Secret 必须相互独立，并按公司策略轮换。生产环境还必须审查 Cookie、CORS、Proxy、Storage 和 Live Test 开关；不要把示例值当成生产默认值。

## 8. Sowind Gateway

Gateway Access Key 仅允许保存在 Server-side Secret 配置中。Outbox 不保存 Key；Gateway Client 只在发送前于内存注入，浏览器不能直连 Gateway。

有效 HTTP 202 只映射为 Lead 状态 `GATEWAY_ACCEPTED`，表示 Gateway 已完成鉴权、校验并将请求存储 / 排队。它不表示 HQ CRM Contact 已最终创建，不表示 CRM 已最终确认，也不表示 HubSpot 最终处理成功。界面和运维话术应使用“Gateway 已受理 / 已提交”。

品牌 Endpoint、字段、Consent 与 Payload 规则见 [SOWIND_GATEWAY_MAPPING.md](SOWIND_GATEWAY_MAPPING.md)。真实调用仅可在获得 Gateway 写入授权、批准测试数据和 UAT 窗口后执行。

## 9. Lead 同步规则

### Source Dispatch Policy

- `MINI_PROGRAM`：Local DB → `SYNC_PENDING` → 自动创建可执行 Outbox。
- `ADMIN_MANUAL`：Local DB → `NOT_SYNCED`；不自动调用 Gateway。
- `BATCH_IMPORT`：Local DB → `NOT_SYNCED`；不自动调用 Gateway。
- Admin Manual Sync：`SYNC_PENDING` → Outbox / Worker，复用同一幂等、Attempt 与审计链路。

### Lead 与 Member Phone

- Lead：Email Required，Phone Optional。
- Lead Phone 有值时标准化为 E.164；缺省或空白时 Gateway Payload 完全省略 `phone` field。
- Member：Verified Mobile Required，必须来自可信 WeChat Context。

Lead 表单规则与 Member 注册规则是不同合同，不能互相套用。

### 正式运行状态

Lead Status：

- `NOT_SYNCED`
- `SYNC_PENDING`
- `SYNCING`
- `GATEWAY_ACCEPTED`
- `SYNC_FAILED`
- `DEAD_LETTER`

Outbox Status：

- `PENDING`
- `PROCESSING`
- `RETRY_WAITING`
- `SUCCEEDED`
- `FAILED`
- `DEAD_LETTER`

Worker 的重试、租约、Dead Letter、日志字段和人工重试方法见 [OPERATIONS.md](OPERATIONS.md)。

## 10. Import / Export

Import 执行链路是 Upload → Preflight → Execute，支持 Member、Lead、Conflict Strategy、Failure CSV 和 History。Preflight 只做校验预览，Execute 才落库；导入数据仍受品牌表单、字段校验和权限合同约束。

Export 支持 `CURRENT_FILTER`、`SELECTED_IDS`、`ALL` 和 Field Allowlist。筛选、记录 ID、导出字段、Brand Scope 与 Permission 全部由 Backend 校验；生成文件是 Private Authenticated File，不允许通过静态公网 URL 绕过 Session 下载。

操作与排障方法见 [OPERATIONS.md](OPERATIONS.md)，API 路径见 [API.md](API.md)。

## 11. RBAC / Brand Scope

权限必须由 Backend Enforce。用户对品牌数据的访问范围由 `user_brand_access` 控制，并在查询、指标、详情、写入、同步、导入、导出和私有文件下载时统一校验。

Frontend 隐藏菜单或按钮只改善体验，不能作为安全机制。跨品牌私有资源可能返回 Security-safe 404 以防止资源枚举，具体响应合同见 [API.md](API.md)。

## 12. Health / Ready

部署完成后检查：

- `GET /api/health`：应用进程和数据库连接。
- `GET /api/ready`：数据库、Integration 与 Outbox 运行摘要。

在 Gateway / WeChat 尚未配置时，相应 Integration 可以显示 `unconfigured`，而 Local CRM 仍可保持 `ready`。这表示本地核心功能可用，不代表外部集成已通过 Production UAT。Health / Ready 监控与日志关联方法见 [OPERATIONS.md](OPERATIONS.md)。

## 13. Production UAT

以下检查必须在公司提供正式环境、凭据、授权测试身份和 Live UAT 窗口后执行。

### Real Gateway

- GP × marketing false
- GP × marketing true
- UN × marketing false
- UN × marketing true
- 核对 HTTP 202 `ref`、Lead / Outbox 状态、Integration Attempt、Audit 和脱敏日志。
- 在获授权环境验证 400、429、503、Timeout、Retry 与 Dead Letter 运维链路。

### Real WeChat

- GP phone authorization
- UN phone authorization
- Member registration
- Profile update
- Identity conflict
- `/me/member`
- Lead auto-link

### Production Acceptance

- Login、强制改密、Logout、Reset、Disable 与 Session 撤销。
- RBAC、GP / UN Brand Scope 与跨品牌访问拒绝。
- Private Storage、Import / Export、Failure CSV、下载权限与过期策略。
- Database Backup / Restore、binlog / PITR、Rollback 演练。
- Central Logs、Dashboard、Alert、Trace / Business ID 关联与 On-call 响应。

没有真实凭据或授权时，上述项目必须保持 Not Run / Blocked，不得用 Fake Gateway 或本地测试结果替代 Live PASS。

## 14. Go-live Checklist

- [ ] 1. Clone Repository。
- [ ] 2. Checkout 并校验冻结 Tag `Kivisense_CRM_v1`，记录其 Commit SHA。
- [ ] 3. Provision MySQL 8.4 与 Least Privilege DB User。
- [ ] 4. Configure Secret Manager。
- [ ] 5. 从 `.env.example` 创建并评审 Production Environment。
- [ ] 6. Backup Target DB / Storage。
- [ ] 7. Run 6 Migrations。
- [ ] 8. First Deployment Seed。
- [ ] 9. Configure Domain / TLS / Nginx / Base Path / CORS / Proxy。
- [ ] 10. Configure Persistent Private Storage。
- [ ] 11. Configure Logs / Monitoring / Alerts / On-call。
- [ ] 12. Configure Backup / binlog / PITR 并完成 Restore Drill。
- [ ] 13. Build Pinned Docker Image。
- [ ] 14. Record Image Digest 与 Release Metadata。
- [ ] 15. Deploy。
- [ ] 16. Verify Health / Ready。
- [ ] 17. Inject Gateway Credentials 并确认写入授权。
- [ ] 18. Inject GP / UN WeChat Credentials 与批准测试身份。
- [ ] 19. Execute Authorized Live UAT。
- [ ] 20. Obtain Business / Operations Acceptance。
- [ ] 21. Go-live，并保留发布、验证和回滚证据。

## 15. 运维入口

- 部署、升级、回滚与备份：[DEPLOYMENT.md](DEPLOYMENT.md)
- Worker / Outbox、Gateway 故障与值班排障：[OPERATIONS.md](OPERATIONS.md)
- API Contract：[API.md](API.md)
- Gateway Payload / HQ 数据映射：[SOWIND_GATEWAY_MAPPING.md](SOWIND_GATEWAY_MAPPING.md)

## 16. 未完成事项

下列事项需要由公司在目标环境完成：

| 分类 | 待完成事项 |
|---|---|
| Deployment Setup | Production MySQL、Least Privilege DB User、Domain / TLS / Nginx、Private Storage、Central Logs、Monitoring、Alert、Backup、binlog / PITR 与 Restore Drill |
| External Credentials | Production Secrets、Sowind Gateway Credentials、Gateway Write Authorization、GP / UN WeChat Credentials 与批准测试身份 |
| Production UAT | Authorized Live Gateway / WeChat UAT、Auth / RBAC / Storage / Import / Export / Recovery 验收、Business Go-live Approval |

这些事项不是 Remaining Code Gap 或 Remaining Documentation Gap。公司完成环境配置和凭据注入后，应依次执行部署、Health / Ready、Authorized Live UAT、业务验收与 Go-live；任何新的业务需求或外部合同变化应进入独立变更流程。
