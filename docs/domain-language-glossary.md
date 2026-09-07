# Kivisense CRM 2.0 Domain Language Glossary

Status: canonical product language for Product Model v4

This glossary governs ordinary UI, help text, tests, reports and new API documentation. Persistence and historical routes may retain compatibility names only where explicitly noted.

## Core objects

| Canonical English | Canonical Chinese | Persistence / compatibility | Usage rule |
| --- | --- | --- | --- |
| Company | 公司 | `Organization` | The unified company master. Do not create separate customer or supplier masters. |
| Contact | 联系人 | `Contact` | A person. Display 企业联系人 or 个人联系人 when type matters. |
| Marketing Lead | 线索 | `MarketingLead` | Acquisition, original inquiry, scoring and qualification record. |
| Opportunity | 商机 | `CrmLead`, `/api/v1/crm/leads`, `#leads` | Compatibility identifiers may remain internally; ordinary UI must always say 商机. |
| Task | 任务 | `CrmTask` | A time-bound next action owned by a user. |
| Followup | 跟进记录 | `ContactFollowup`, `LeadFollowup` | Append-only business interaction history. |
| Customer Journey | 客户旅程 | computed journey response | Human-readable domain history, distinct from system audit. |
| Audit Log | 操作记录 / 审计日志 | `AuditLog` | System accountability: who changed what and when. |
| Supplier | 供应商 | `Organization` + `VENDOR` | A scoped Company view, never a second master. |
| Customer Plan | 客户经营计划 | `OrganizationNurture` | Company-context operating plan; not a top-level module. |

## Lifecycle and qualification

| Internal key | Ordinary UI | Notes |
| --- | --- | --- |
| `NEW` Marketing Lead | 新线索 | Default creation state; nurturing begins naturally through follow-up and scoring. |
| `NURTURING` Marketing Lead | 培育中 | Compatibility state, not a user-facing “开始孵化” action. |
| `MQL` | 营销合格线索 | Automatically produced by Fit and Engagement thresholds. |
| `SQL` | 销售合格线索 | Produced when Sales accepts an MQL. |
| `QUALIFIED` Marketing Lead | internal compatibility only | Never require a second visible confirmation before conversion. |
| `CONVERTED` | 已转商机 | Read-mostly source record linked to the created Opportunity. |
| `RECYCLED` | 重新培育 | Side path that may later score back to MQL. |
| `DISQUALIFIED` | 不合格 | Terminal unless a future authorized workflow explicitly reopens it. |

Marketing Lead dimensions are **线索匹配度** (Fit) and **互动活跃度** (Engagement), each independently 0–100. Never display an ambiguous combined 200-point score.

Opportunity stage terminology:

| Internal key | Canonical Chinese |
| --- | --- |
| `NEW` | 新建 |
| `QUALIFIED` | 已确认 |
| `SOLUTION` | 方案 |
| `QUOTATION` | 报价 |
| `WON` | 成交 |
| `LOST` | 丢失 |

Use 商机阶段, 商机负责人, 商机跟进负责人, 商机协作成员 and 商机优先级. WON is the current CRM sales-chain endpoint; it does not mean an Order, Contract, Invoice, Finance or ERP module exists.

## Company and Contact language

- Company **客户阶段** is the lifecycle: 目标, 已触达, 客户经营中, 机会中, 客户, 不合格.
- Company **业务关系** is multi-valued: 潜在客户, 客户, 供应商, 合作伙伴.
- A CUSTOMER relationship and 客户 lifecycle are synchronized for ordinary edits; do not present them as contradictory statuses.
- Contact type is 企业联系人 or 个人联系人.
- The legacy `CrmContactStage` remains import/API compatibility only. Do not show a generic “CRM 状态” or ambiguous “触达阶段” in ordinary Contact forms, lists or details.
- System IDs are labeled 系统编号 and are visible/copyable on Company, Contact, Marketing Lead and Opportunity details.

## Navigation and analytics

- 数据看板 has four views: 管理概览, 营销与转化, 商机推进, 团队表现.
- 我的工作台 is a personal action center, not a Dashboard synonym.
- Customer Operations / 客户运营 is retired as a top-level navigation term. Its replacement is Company Smart Views + Company 360 + 我的工作台.
- The acquisition funnel is 线索 → MQL → SQL → 商机.
- Use 下一步行动覆盖率, 停滞商机, 新增线索, 新增商机, 成交商机 and 有下一步行动 %.
- Website visitor metrics must say that tracking is not connected; never invent Visitor counts.

## Import, export and assignment

- Export scopes: 所选记录, 当前筛选结果, 当前权限内全部记录.
- Export task states: 等待中, 处理中, 已完成, 失败.
- Assignment means 分配负责人. UI confirms the assignment save; email delivery is a separate notification-outbox state.
- Notification states are internal operational language: `PENDING`, `SENT`, `FAILED`. Ordinary users should not see raw enum keys.

## Prohibited ordinary UI terms

Do not use these to represent current product objects or actions:

- CrmLead, Lead Detail, Lead Stage or Lead Owner for Opportunity.
- 线索 or 销售线索 when the record is an Opportunity.
- 开始孵化 / `START_NURTURING`.
- 确认机会 as a separate visible Marketing Lead step after SQL.
- CRM 状态 for Contact.
- Customer Operations / 客户运营 as a top-level module.
- Raw enum, route, database or API identifiers as primary labels.
- Amount, revenue, cost, invoice, payment, procurement or contract-value metrics in the Dashboard.

## Compatibility rule

Compatibility names do not define product language. When code must retain `CrmLead`, `/crm/leads`, legacy Contact stage or historical post-sales columns, isolate them behind comments/adapters and translate at the UI and audit-label boundaries. New code must use Marketing Lead and Opportunity concepts explicitly and must not expand legacy ambiguity.
