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

CRM 2.0 基线迁移只用于空的新数据库。Customer Operations 扩展迁移是增量、非破坏式迁移：升级已有 UAT 前仍必须先做数据库、应用、附件与 Nginx 四类备份，执行 `prisma migrate deploy`，禁止 reset、seed 或清空业务表。

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
```

应用内部仍以 `/api/...` 注册路由，由 Nginx 将外部 `/crm_kivisense/...` 前缀去除后代理。浏览器端根据 `js/api.js` 的真实加载路径自动拼接前缀；Cookie Path 使用 `/crm_kivisense`。Nginx 的 `client_max_body_size` 必须大于 `CRM_ATTACHMENT_MAX_BYTES`，建议 UAT 配置为 `55m`。

## 发布检查

1. `/api/health` 与 `/api/ready` 返回数据库正常。
2. 登录、客户联系人、线索、附件和跟进主流程通过。
3. 超级管理员导入导出通过；销售无导入导出；只读用户不能写入。
4. HTML、JS、CSS、Logo 和 API 无 404/500/CORS/Cookie/Mixed Content 错误。
5. 联系人和线索详情 Hash 路由刷新后仍可恢复。
6. Company 360、Supplier View、孵化、任务闭环、我的工作台和非金额 Dashboard 通过真实浏览器验收。
7. 在 1440、1280、1024 宽度下页面壳无横向溢出；宽表只在白色卡片内部滚动。
8. `/api/v1/crm/analytics/*` 的响应不包含金额、收入、成本、合同、付款、发票或采购字段。
