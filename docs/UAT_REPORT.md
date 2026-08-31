# Sowind CRM v1.15.0 UAT 报告

日期：2026-08-31（Asia/Shanghai）

## 自动化与静态检查

| 项目 | 结果 | 证据边界 |
|---|---|---|
| TypeScript Build | PASS | Backend 完整编译 |
| Prisma Validate | PASS | MySQL Schema 有效 |
| Gateway Unit/Contract | PASS | 19 项，含 Payload、202、错误分类、退避、限速、Secret Redaction |
| Gateway Live Test | SKIPPED | 2 项；开关为 false，未提供/使用真实 Key |
| npm Audit | PASS | 生产依赖 0 个已知漏洞 |
| Frontend JS Syntax | PASS | `node --check` |
| Docker Image Build/Smoke | PASS | Node 22 镜像构建完成，容器 `/api/health` 连接 MySQL 成功 |

## API UAT

| 场景 | 结果 |
|---|---|
| Health + MySQL | PASS，`status=ok/database=ok/version=1.15.0` |
| 超级管理员登录 | PASS |
| 首次登录强制改密 | PASS；其他业务 API 返回 `PASSWORD_CHANGE_REQUIRED` |
| 账号禁用 | PASS；返回 `ACCOUNT_DISABLED` |
| GP 账号查询 UN | PASS；列表只返回 GP，直接访问越权资源被拒绝/隐藏 |
| 无权限访问账号管理 | PASS；`PERMISSION_DENIED` |
| 模板手机号文本格式 | PASS；示例保留 `+8613812345678`，不显示科学计数法 |
| 模板必填标记 | PASS；必填列头为红色 `*` |
| 统一错误结构 | PASS；含 code/message/requestId |

## 浏览器可视化 UAT

| 场景 | 结果 |
|---|---|
| 登录页、登出、首次改密遮罩 | PASS |
| 会员/线索入口与真实数据库列表 | PASS |
| UN/GP 双品牌画像切换 | PASS |
| 线索详情与同步状态 | PASS |
| 超级管理员账号目录 | PASS；通过 UI 真实创建只读账号、选择 UN 范围并禁用；编辑/重置/状态按钮按权限显示 |
| 角色权限页 | PASS；系统超级管理员只读，运营角色权限通过 API 真实保存 |
| GP 运营账号 | PASS；仅 GP 品牌筛选和数据，无系统管理/导入导出 |
| 只读账号 | PASS；可查看授权品牌，无新增/导入/导出/同步/系统管理 |
| 浏览器 Console | PASS（已检查的会员详情回归无错误） |

## 模拟、未运行与 TBD

- 会员、线索、账号和审计使用本地 MySQL 真实持久化；Seed Demo 仅是开发测试数据，不是生产 Source of Truth。
- Gateway Outbox、Payload、重试和状态机已实现；真实 Gateway 调用未运行，因此真实网络、Key 权限、年度额度和最终 HQ 入库仍为 NOT RUN/TBD。
- HTTP 202 只标记“Gateway 已受理”，不虚构 HQ CRM 已处理完成。
- Gateway 规范未提供 HQ 回写进度，本系统不实现 Lead 跟进状态同步。
- 多 Worker 分布式限速/抢占、对象存储、集中日志、灾备演练属于上线环境增强项。
