# Kivisense CRM 2.0

Kivisense 公司内部客户关系管理系统。系统以“客户联系人一对多线索”为核心关系，提供客户联系人、线索、跟进、导入导出、账户、角色权限和审计能力。

## 业务范围

- 客户联系人：维护联系人、公司、地区、联系方式、触达阶段、负责人和下一次跟进时间。
- 线索：关联一个已有客户联系人，维护项目需求、项目属性、方案、报价、负责人和下一次跟进时间。
- 跟进：客户联系人和线索均使用追加式跟进记录。
- 自动关联：线索从所属客户联系人实时读取姓名、公司、邮箱和电话；这些信息不在线索中重复保存或编辑。
- 数据管理：超级管理员可导入、导出客户联系人和线索；销售人员默认没有导入导出权限。
- 系统管理：超级管理员管理账号、角色权限和审计日志。

当前版本仅包含上述 Kivisense 内部 CRM 业务范围。

## 技术架构

```text
浏览器
  -> Fastify 静态前端与内部 API
  -> Prisma
  -> MySQL 8
```

- 前端：原生 HTML、CSS 和 ES Modules。
- 后端：Node.js 22、Fastify 5、TypeScript。
- 数据库：MySQL 8、Prisma 6。
- 认证：服务端 Session Cookie。
- 权限：数据库角色与权限映射，所有内部 API 由服务端强制校验。

## 本地启动

1. 复制 `.env.example` 为 `.env`，替换其中的开发环境密码和 Secret。
2. 启动数据库：`docker compose up -d mysql`。
3. 安装依赖：`npm ci`。
4. 生成 Prisma Client：`npm run prisma:generate`。
5. 部署数据库迁移：`npm run prisma:migrate:deploy`。
6. 初始化角色、权限和超级管理员：`npm run prisma:seed`。
7. 启动应用：`npm run dev`。

默认地址为 `http://127.0.0.1:3000/`。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `NODE_ENV` | `development`、`test` 或 `production` |
| `DATABASE_URL` | MySQL 连接地址 |
| `SESSION_SECRET` | 至少 32 个字符的 Session Secret |
| `INITIAL_PASSWORD` | Seed 使用的初始密码，至少 12 个字符 |
| `SUPER_ADMIN_ACCOUNT` | 初始超级管理员登录账号 |
| `SUPER_ADMIN_NAME` | 初始超级管理员姓名 |
| `APP_BASE_PATH` | 子路径部署前缀，例如 `/crm_kivisense` |
| `COOKIE_SECURE` | HTTPS 环境应设为 `true` |
| `CORS_ORIGIN` | 允许的浏览器 Origin |
| `TRUST_PROXY` | 通过可信反向代理部署时设为 `true` |
| `STORAGE_DIR` | 导入导出文件存储目录 |
| `PORT` | 后端监听端口 |

生产或 UAT Secret 不得提交到 Git。

## 验证

```bash
npm run prisma:validate
npm run lint
npm run build
npm test
npm run test:integration
npm run test:frontend
```

数据库集成测试必须使用独立测试数据库，禁止连接生产数据库。

## 子路径部署

应用支持部署到 `/crm_kivisense/`。运行环境设置：

```text
APP_BASE_PATH=/crm_kivisense
COOKIE_SECURE=true
TRUST_PROXY=true
CORS_ORIGIN=https://www.gridworks.cn
```

Nginx 应仅代理该路径到应用监听端口，并保留完整 URI。应用会根据前端脚本地址推导资源和内部 API 的基础路径，Session Cookie Path 与 `APP_BASE_PATH` 保持一致。
