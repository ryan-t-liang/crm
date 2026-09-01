# Sowind CRM 交接清单

## A. 已完成的业务代码

- Fastify + Prisma + MySQL + Outbox 架构与 v1.14 视觉基线。
- 登录、强制改密、Session 撤销、RBAC 与品牌范围。
- Canonical Customer、双品牌 Profile、Identity、Consent、Journey、Audit。
- MINI_PROGRAM / ADMIN_MANUAL / BATCH_IMPORT Lead 分发策略和六种同步状态。
- Member/Lead 正式 XLSX 导入、导出、历史与失败文件。
- Gateway Adapter、可恢复 Outbox Worker、Fake Gateway 四系统场景和默认关闭的真实 Live Harness。
- Server-side metrics、统一错误契约、traceId、readiness、CI 与自动化回归。

## B. 公司部署时必须配置

- MySQL 8.4、数据库账号、备份和恢复策略。
- Secret Manager：`SESSION_SECRET`、`INITIAL_PASSWORD`、Gateway Key、WeChat Secrets、Integration HMAC Secret。
- 正式 Domain、TLS、Nginx、`APP_BASE_PATH` 与 `CORS_ORIGIN`。
- 持久化 Import/Export Storage、生命周期和访问权限。
- 日志收集、告警、监控平台与值班负责人。
- GP/UN Gateway URL、超时、Worker interval/lease/instance id。
- GP/UN WeChat AppID/AppSecret 与 context TTL。

全部变量以 `.env.example` 为清单；生产值不得提交 Git。

## C. 上线前必须执行的 UAT

1. 空库执行全部 Migration、Seed、Build、Start、登录和强制改密。
2. 验证 Super Admin、GP/UN Admin、Viewer 的权限与品牌隔离。
3. 验证 Member/Lead 新增、详情、指标、导入、导出、审计。
4. 获授权后执行 GP/UN × 营销同意/不同意四个真实 Gateway 场景。
5. 使用正式 GP/UN 微信凭据完成手机号解析、Profile Update 与 Lead auto-link。
6. 验证 `/api/health`、`/api/ready`、日志、告警、备份恢复与回滚。

## D. External Blockers

- 正式 Sowind Gateway accessKey 与写入授权。
- 正式 GP/UN WeChat AppID、AppSecret 与真实授权 code。
- 正式 Domain/TLS/Nginx、Production DB、Secret Manager、Storage、Backup 与 Monitoring 平台。

这些属于 `DEPLOYMENT / EXTERNAL SETUP`。没有凭据时 Live Test 必须保持 `BLOCKED_BY_CREDENTIALS` 或 `NOT_RUN_NOT_AUTHORIZED`，不得写成 PASS。
