# 部署与运维

## 发布前检查

```bash
npm ci
npm run prisma:validate
npm run build
npm test
npm audit --omit=dev
docker compose config
docker compose build backend
```

确认 `.env` 不在版本库或部署 ZIP；生产 Secret 使用 Secret Manager、CI Secret 或主机权限为 600 的环境文件。

## 生产环境变量

必须配置：`DATABASE_URL`、至少 32 位随机 `SESSION_SECRET`、`INITIAL_PASSWORD`、`CORS_ORIGIN`。Gateway 联调通过后再配置 `SOWIND_GATEWAY_ACCESS_KEY`。生产必须：

```text
NODE_ENV=production
COOKIE_SECURE=true
TRUST_PROXY=true          # 仅在受信任反向代理之后
SEED_DEMO_DATA=false
RUN_SOWIND_LIVE_TESTS=false
```

数据库、Session、初始密码、Gateway 和外部 HMAC Secret 应分别生成，不得复用。

## 首次部署

```bash
docker compose build backend
docker compose up -d mysql
docker compose run --rm backend npx prisma migrate deploy --schema backend/prisma/schema.prisma
docker compose run --rm backend node backend/dist/prisma/seed.js
docker compose up -d backend
curl -fsS http://127.0.0.1:3000/api/health
```

将 `deploy/nginx/sowind-crm.conf.example` 复制到 Nginx，并替换域名。TLS 证书由生产环境证书管理工具配置。

## 日常发布

1. 备份数据库和 `storage/`。
2. 构建新镜像并记录镜像 Digest。
3. 运行 `prisma migrate deploy`。
4. 重启 Backend，检查 `/api/health`。
5. 使用受控测试账号回归登录、品牌范围、会员、线索、导入导出和 Outbox。

数据库迁移是向前迁移；回滚应用镜像前必须确认旧应用兼容新 Schema。禁止在没有备份和评审的情况下手工回滚迁移。

## 备份

数据库：

```bash
docker compose exec -T mysql sh -c 'exec mysqldump --single-transaction --routines --triggers -uroot -p"$MYSQL_ROOT_PASSWORD" sowind_crm' > sowind_crm_$(date +%Y%m%d_%H%M%S).sql
```

文件：

```bash
tar -czf sowind_storage_$(date +%Y%m%d_%H%M%S).tgz storage
```

恢复会覆盖目标数据库，必须在隔离环境先演练、校验行数与登录/UAT，再安排正式恢复窗口。

## 监控与告警

- `/api/health` 非 200、数据库不可达。
- `integration_outbox` 的 `PENDING/RETRY_WAITING` 积压量和最老年龄。
- `DEAD_LETTER`、`FAILED_AUTH`、`FAILED_PERMANENT`。
- Gateway 429/503、超时、`annual_cap_reached`。
- 登录 401/429 激增、账号禁用/重置、角色权限变更。
- 导入失败率、磁盘和 MySQL 容量。

当前限速器为单进程内存实现。若横向扩容多个 Worker，必须改为数据库/Redis 分布式限速和安全抢占；在此之前建议单 Worker 部署。

## 故障处理

- Gateway Key 未配置：Worker 不启动，本地 Lead/Outbox 仍保留；配置 Key 后重启。
- 401：校验 Secret 来源和环境，禁止不断重试。
- 400：查看脱敏后的响应和 Payload 映射，修正数据后手动重试。
- 429/503/Timeout：由 Outbox 自动退避；不要从浏览器直发。
- Dead Letter：确认根因和 Payload 后，由有 `lead.sync` 权限的账号重新激活。
- 账号泄露：立即禁用或重置，系统会撤销 Session；再检查审计日志。

