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

CRM 2.0 基线迁移只用于空的新数据库。不要对包含其他系统数据的数据库运行该迁移。

## 子路径部署

部署到 `https://www.gridworks.cn/crm_kivisense/` 时：

```text
NODE_ENV=production
APP_BASE_PATH=/crm_kivisense
COOKIE_SECURE=true
TRUST_PROXY=true
CORS_ORIGIN=https://www.gridworks.cn
MAX_ATTACHMENT_BYTES=104857600
```

应用内部仍以 `/api/...` 注册路由，由 Nginx 将外部 `/crm_kivisense/...` 前缀去除后代理。浏览器端根据 `js/api.js` 的真实加载路径自动拼接前缀；Cookie Path 使用 `/crm_kivisense`。

## 发布检查

1. `/api/health` 与 `/api/ready` 返回数据库正常。
2. 登录、客户联系人、线索、附件和跟进主流程通过。
3. 超级管理员导入导出通过；销售无导入导出；只读用户不能写入。
4. HTML、JS、CSS、Logo 和 API 无 404/500/CORS/Cookie/Mixed Content 错误。
5. 联系人和线索详情 Hash 路由刷新后仍可恢复。
