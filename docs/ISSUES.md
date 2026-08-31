# 已知问题与上线条件

| ID | 严重度 | 状态 | 说明 | 上线处理 |
|---|---|---|---|---|
| GW-LIVE-001 | High | BLOCKED_EXTERNAL | 未提供真实 Sowind accessKey，未运行真实 GP/UN Live Test | 获取受控 Key 和测试窗口后显式运行 Live Test，并核对 Gateway/HQ 记录 |
| GW-ACK-002 | Medium | TBD_CONTRACT | 规范只确认 202 queued，不提供 HQ 最终入库/处理回调 | UI 保持“Gateway 已受理”；未来需 HQ 合同后扩展 |
| WORKER-003 | Medium | OPEN | 当前限速器为单进程内存实现 | 生产先单 Worker；横向扩容前加入 Redis/DB 分布式限速和租约恢复 |
| STORAGE-004 | Medium | OPEN | 导入导出文件使用本地/挂载卷 | 多实例或云部署前改为受控对象存储并配置生命周期 |
| DR-005 | Medium | NOT_RUN | 尚未在目标生产基础设施执行备份恢复演练 | 上线前按 `DEPLOYMENT.md` 完成恢复演练并留存证据 |

这些条目不影响本地功能 UAT，但 GW-LIVE-001 与 DR-005 是正式上线前的外部/运维门槛。

