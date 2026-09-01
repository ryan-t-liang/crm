# Sowind CRM 生产运维手册

本手册面向部署与值班人员。命令中的连接串、账号与 Secret 必须由受控环境或 Secret Manager 注入，禁止写入仓库、工单和日志。

## 1. Health 与 Readiness

- `GET /api/health`：检查应用进程和数据库连接。数据库不可达时返回非 2xx。
- `GET /api/ready`：检查数据库并返回 `integration` 与 `outbox` 摘要。Gateway 未配置会显示 `unconfigured/degraded`，不会让 CRM 本地功能整体不可用。
- 每次请求响应头包含 `x-trace-id`；错误响应正文也包含 `traceId`。

示例：`curl -fsS https://example.com/crm/api/ready`。

## 2. 数据库与 Migration

检查连接：使用只读账号执行 `SELECT 1`。检查迁移：`npm run prisma:migrate:deploy`，或在容器中运行同一命令。生产发布只允许追加式 Migration，不得编辑已经执行的 Migration。

发布前备份；发布后核对 `_prisma_migrations`、核心表数量及 `/api/ready`。推荐 MySQL 全量备份加 binlog/PITR，定期做恢复演练；备份加密并按公司策略保留。

## 3. Outbox Worker

结构化日志可按 `event=outbox.claimed|outbox.completed|outbox.retry_scheduled|outbox.dead_letter`、`outboxId`、`leadId`、`traceId` 查询。`PROCESSING` 使用 `lock_owner` 与 `lease_until`；租约过期后 Worker 自动回收，未过期任务不会被另一 Worker 抢占。

查询待处理与死信：

```sql
SELECT id, aggregate_id, status, attempts, available_at, lease_until, last_error
FROM integration_outbox
WHERE status IN ('PENDING','RETRY_WAITING','PROCESSING','DEAD_LETTER')
ORDER BY updated_at DESC;
```

查 Lead 同步尝试：在管理后台打开线索详情，或按 `lead_id/outbox_id` 查询 `integration_attempts`。应同时核对 `triggered_by`、`gateway_ref`、脱敏请求快照与响应摘要。

手工重新同步 Lead：仅通过管理后台“手动同步/重试同步”或受权限保护的 `POST /api/v1/leads/:id/sync`，不要直接修改 Outbox。`DEAD_LETTER` 不会自动重发，必须排除错误后人工重试。

## 4. Gateway 故障

- 401：确认 Key 是否已经轮换、品牌 Endpoint 是否匹配、时间同步是否正常；不要打印 Key。
- 429：保留 Outbox，等待 `Retry-After`/退避时间；不要手工高频重放。
- 503/timeout：确认外部服务与网络；Worker 会按幂等键重试，超过最大次数进入 `DEAD_LETTER`。
- HTTP 202 只表示 `GATEWAY_ACCEPTED`（Gateway 已受理/已提交），不代表 HQ CRM 已完成。

## 5. Import / Export Job

Import：在后台“导入记录”查看 `UPLOAD → PREFLIGHT → EXECUTE → COMPLETE/FAILED`、成功数、失败数和 Failure CSV。日志按 `importJobId` 查询。

Export：在“导出记录”查看 `exportJobId`、范围、字段、完成状态与下载。清理过期文件时，仅删除已过 `expires_at` 的存储对象并保留 Job/Audit；先做清单和备份，禁止递归清空整个 storage。

## 6. Secret Rotation

1. 在 Secret Manager 创建新版本。
2. 更新应用配置并滚动重启。
3. 验证登录、`/api/ready`、Gateway/WeChat 的获授权测试。
4. 撤销旧 Secret 并记录审计。

`SESSION_SECRET` 轮换会使现有 Session 失效；Gateway Key、WeChat AppSecret、Integration HMAC Secret 应分别轮换，不能复用。

## 7. 日志与敏感信息

生产 `LOG_LEVEL=info`。日志必须包含必要的 `traceId`、耗时、错误码以及业务资源 ID；不得包含密码/哈希、Cookie、Session Token、Gateway accessKey、WeChat AppSecret/access token/授权 code、完整 context token、HMAC Secret、Authorization 或未脱敏的完整请求体。

如发现泄露：立即隔离日志、轮换对应 Secret、评估访问范围并按公司事件响应流程处理。
