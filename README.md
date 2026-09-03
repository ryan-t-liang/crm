# CRM_v1

## 当前状态

- 会员、品牌会员画像、线索、账号、角色权限、审计、导入导出均读取真实 API/数据库。
- GP 芝柏表与 UN 雅典表按 `brands` 配置和 `user_brand_access` 关系授权，不使用 `GP_UN`/`ALL` 组合枚举。
- 创建线索时，Lead、Consent、Journey、Outbox 与 Audit 在同一数据库事务中落库。
- Sowind Gateway Key 只在发送请求前于内存中注入；前端、Outbox、Audit、源码和日志均不保存 Key。
- HTTP 202 `queued + ref` 才表示 Gateway 已受理，不表示 HQ CRM 已完成处理。
- 真实 Gateway 测试默认关闭，本次未使用真实 accessKey 发起请求。
- Role 权限依赖由服务端强制归一化；列表指标由服务端按完整 Brand Scope 计算。
- API 字段校验统一为 HTTP 422 + `fieldErrors`，错误响应与日志通过 `traceId` 关联。
- Outbox 使用 lease 与原子 claim 支持崩溃恢复；`/api/ready` 提供数据库与集成运行摘要。
- 会员业务编号统一为 `SW` + 8 位数字；数据库内部 CUID 继续只用于关系关联，不作为对外会员编号。
- 本轮冻结包含会员/线索表单中文化、字段级中文校验、品牌资料编辑、列表选择、侧边栏交互与 v1.14.0 视觉一致性修复。

## 正式交付状态

`Kivisense_CRM_v1` 是本次开发交接的冻结版本标识；交接、部署和回滚均应固定到该 Git Tag，不应仅跟随可继续变化的 `main` 分支。

- Repository：`https://github.com/ryan-t-liang/crm.git`
- Branch：`main`
- Frozen Release / Git Tag：`Kivisense_CRM_v1`
- Internal SemVer：`1.15.0`
- 历史 V3 最终审计基线 SHA：`e02f5c50d91dfda162afcef6a8aa2f3372e43647`
- Final Verdict：`B — HANDOFF READY WITH SETUP`
- Hosted CI：以 `Kivisense_CRM_v1` Tag 对应的 GitHub Actions 结果为准
- Migration：Fresh MySQL 8.4 6/6 PASS；现有数据库 Upgrade PASS
- Unit：40 passed / 50 skipped（本地，无数据库与 Live Test）
- Documentation Contract：6/6 PASS
- Integration：46/46 PASS（本地隔离 Gateway）
- Frontend Interaction Contract：PASS
- Docker：PASS

V3 审计结论为：GitHub Repository 可以正式交接给公司开发。上述 SHA 是历史已审计基线；`Kivisense_CRM_v1` 在该基线上追加了已确认的界面、交互、校验和会员编号修复，因此最终交付代码应以冻结 Tag 为准。Production 环境、真实 Gateway / WeChat 凭据及获授权 Live UAT 仍由接手团队完成。

当前 Repository 的核心 CRM 实现已经完成。公司开发接手后不需要继续修改 Customer / Member、Brand Profile、WeChat Identity、Lead、Gateway / Outbox / Retry、Import / Export、RBAC / Brand Scope、Authentication / Session、Audit / Metrics / Error Contract，以及 Database Schema / Migration。后续工作属于：Production Setup → Credentials → Deploy → Authorized Live UAT → Go-live。

正式接手请从 [docs/HANDOFF.md](docs/HANDOFF.md) 开始。

## 技术栈

- Node.js 22+
- Fastify 5 + TypeScript
- Prisma 6 + MySQL 8.4
- 原生 HTML/CSS/JavaScript 前端
- ExcelJS 导入导出
- Vitest

## 目录

```text
frontend/                  v1.14 视觉语言 + 真实 API 接入
backend/src/              API、认证、RBAC、业务与 Gateway 模块
backend/prisma/           Schema、迁移和 Seed
backend/tests/            Gateway 契约测试与显式 Live Test
deploy/nginx/             Nginx 反向代理示例
docs/                     API、部署、Gateway 映射与 UAT 文档
storage/                  本地导入导出文件（不入 Git/ZIP 数据）
```

## 本地启动

1. 创建配置：

   ```bash
   cp .env.example .env
   ```

2. 至少设置 `SESSION_SECRET`、`INITIAL_PASSWORD`、数据库密码。`INITIAL_PASSWORD` 不应写入源码；生产环境请通过 Secret Manager 或受控环境变量注入。

3. 安装、启动数据库并初始化：

   ```bash
   npm ci
   docker compose up -d mysql
   npm run prisma:generate
   npm run prisma:migrate:deploy
   npm run build
   npm run prisma:seed
   ```

4. 启动：

   ```bash
   npm start
   ```

5. 打开 `http://127.0.0.1:3000`。健康检查为 `GET /api/health`，部署就绪检查为 `GET /api/ready`。

Seed 创建的账号首次登录必须使用环境变量中的统一初始密码，并立即修改。`SEED_DEMO_DATA=false` 时不会创建演示会员和线索。

## Docker 部署

```bash
cp .env.example .env
# 修改 .env，生产环境必须 COOKIE_SECURE=true、CORS_ORIGIN=https://实际域名
# 若通过 https://实际域名/crm 部署，同时设置 APP_BASE_PATH=/crm
docker compose build backend
docker compose up -d mysql
docker compose run --rm backend npm --workspace backend exec -- prisma migrate deploy --schema prisma/schema.prisma
docker compose run --rm backend node backend/dist/prisma/seed.js
docker compose up -d backend
curl -fsS http://127.0.0.1:3000/api/health
```

首次 Seed 后应将日常发布流程改为“迁移 + 启动”，不需要每次运行 Seed。更完整的发布、回滚与备份说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 常用命令

```bash
npm ci
npm run prisma:generate
npm run prisma:validate
npm run prisma:migrate:deploy
npm run prisma:seed
npm run lint
npm run build
npm test
npm run test:integration
npm run test:frontend
npm audit --omit=dev
docker compose config
```

显式真实 Gateway 测试：

```bash
RUN_SOWIND_LIVE_TESTS=true \
SOWIND_LIVE_TEST_AUTHORIZED=true \
SOWIND_GATEWAY_ACCESS_KEY='从 Secret Manager 注入' \
SOWIND_LIVE_GP_EMAIL='获授权测试邮箱' \
SOWIND_LIVE_UN_EMAIL='获授权测试邮箱' \
SOWIND_LIVE_GP_SKU='真实 GP SKU' \
SOWIND_LIVE_UN_SKU='真实 UN SKU' \
npm test
```

此命令会向 GP 和 UN 真实 Endpoint 提交测试线索；只有获得业务和运维授权后才能运行。
Live Harness 必须连接已完成 Migration/Seed、且没有任何可执行 Outbox 的独立 UAT 数据库；它会走 Integration API、DB、Outbox、Worker 和真实 Gateway，并在该 UAT 数据库保留 Attempt/Audit 证据。不要指向生产库或日常测试库。

## 安全约束

- Session Cookie：HttpOnly、SameSite=Strict，生产环境 Secure。
- 密码：Argon2id；首次登录强制改密；重置/禁用撤销现有 Session。
- 登录与 API 均有频率限制；写 API 校验 Origin；所有输入使用 Zod 校验。
- 日志对 Cookie、密码、Session Secret 与 Gateway Key 做脱敏。
- 外部小程序接口使用 Client ID、时间戳、Nonce、Canonical JSON SHA-256 与 HMAC-SHA256；浏览器不会直接调用 Gateway。
- `.env`、本地存储、Node Modules、构建上下文中的秘密均被排除。

## 文档

- [正式技术交接清单](docs/HANDOFF.md)
- [部署、升级与回滚](docs/DEPLOYMENT.md)
- [生产运维与 Outbox 排障](docs/OPERATIONS.md)
- [API Contract](docs/API.md)
- [Sowind Gateway / HQ 数据映射](docs/SOWIND_GATEWAY_MAPPING.md)
- [UAT 报告](docs/UAT_REPORT.md)
- [实现与范围报告](docs/IMPLEMENTATION_REPORT.md)
- [多品牌产品化与线索模块设计说明](docs/多品牌产品化与线索模块设计说明.md)
