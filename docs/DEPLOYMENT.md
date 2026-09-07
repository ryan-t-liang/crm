# Kivisense CRM 2.0 部署

## 原则

- UAT 与生产使用不同数据库、Secret、文件目录和进程。
- 数据库迁移前先备份目标数据库。
- Nginx 修改前备份原配置；仅在 `nginx -t` 通过后 reload。
- `.env`、账号密码和数据库凭据不得提交到 Git。

## 构建和迁移

```bash
npm ci
npm run prisma:generate
npm run prisma:validate
npm run lint
npm run build
npm run prisma:migrate:deploy
npm run prisma:seed
```

CRM 2.0 基线迁移只用于空的新数据库。Customer Operations 与 Marketing Lead → Opportunity 扩展迁移均为增量、非破坏式迁移：升级已有 UAT 前仍必须先做数据库、应用、附件与 Nginx 四类备份，执行 `prisma migrate deploy`，禁止 reset、seed 或清空业务表。上面的 `prisma:seed` 只适用于新建本地/测试环境，不属于已有 UAT 的升级步骤。

## 子路径部署

部署到 `https://www.gridworks.cn/crm_kivisense/` 时：

```text
NODE_ENV=production
APP_BASE_PATH=/crm_kivisense
COOKIE_SECURE=true
TRUST_PROXY=true
CORS_ORIGIN=https://www.gridworks.cn
CRM_ATTACHMENT_MAX_BYTES=52428800
CRM_ACTIVE_DAYS=30
CRM_DORMANT_DAYS=60
CRM_STALE_LEAD_DAYS=30
CRM_HIGH_FIT_UNTOUCHED_DAYS=30
CRM_MQL_MIN_FIT_SCORE=40
CRM_MQL_MIN_ENGAGEMENT_SCORE=70
```

应用内部仍以 `/api/...` 注册路由，由 Nginx 将外部 `/crm_kivisense/...` 前缀去除后代理。浏览器端根据 `js/api.js` 的真实加载路径自动拼接前缀；Cookie Path 使用 `/crm_kivisense`。Nginx 的 `client_max_body_size` 必须大于 `CRM_ATTACHMENT_MAX_BYTES`，建议 UAT 配置为 `55m`。

## 发布检查

1. `/api/health` 与 `/api/ready` 返回数据库正常。
2. 登录、客户联系人、Marketing Lead、商机、附件和跟进主流程通过。
3. 超级管理员导入导出通过；销售无导入导出；只读用户不能写入。
4. HTML、JS、CSS、Logo 和 API 无 404/500/CORS/Cookie/Mixed Content 错误。
5. 联系人、Marketing Lead 和商机详情 Hash 路由刷新后仍可恢复。
6. Company 360、Supplier View、客户经营计划、任务闭环、我的工作台和非金额数据看板通过真实浏览器验收。
7. 在 1440、1280、1024 宽度下页面壳无横向溢出；宽表只在白色卡片内部滚动。
8. `/api/v1/crm/analytics/*` 的响应不包含金额、收入、成本、合同、付款、发票或采购字段。
9. Marketing Lead conversion preview、精确公司/联系人匹配、Qualified → Converted、商机来源区块和评分规则页面通过。
10. `/api/v1/crm/marketing/analytics/*` 按 KPI Dictionary 返回，Visitor 明确显示未接入而不是伪造数量。

## 已有 UAT 的迁移顺序

1. 记录当前 UAT commit、镜像、业务表行数和 Production/Test 容器指纹。
2. 分别备份应用、数据库、附件目录和 Nginx；生成并验证 SHA-256。
3. 从已测试并已推送的精确 Git SHA 构建不可变镜像。
4. 使用 UAT `.env` 在同一网络执行 `prisma migrate deploy`；不得执行 Seed、Reset 或 Truncate。
5. 验证 `_prisma_migrations` 新增目标迁移，既有业务表行数不减少。
6. 启动 UAT 后端并验证 `/api/health`、`/api/ready`、部署 SHA、静态资源及三角色只读浏览器回归。
7. 再次比较 Production/Test 容器指纹，确认未被重建或修改。
