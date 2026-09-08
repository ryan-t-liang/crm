# Kivisense CRM 2.0 Domain Language Glossary

Status: canonical product language for Product Model v4 and Product Language Audit v1

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
| `MQL` | 营销合格（MQL） | Automatically produced by Fit and Engagement thresholds. |
| `SQL` | 销售合格（SQL） | Produced when Sales accepts an MQL. |
| `QUALIFIED` Marketing Lead | internal compatibility only | Never require a second visible confirmation before conversion. |
| `CONVERTED` | 已转商机 | Read-mostly source record linked to the created Opportunity. |
| `RECYCLED` | 重新培育 | Side path that may later score back to MQL. |
| `DISQUALIFIED` | 无效线索 | Terminal unless a future authorized workflow explicitly reopens it. |

Marketing Lead dimensions are **线索匹配度** (Fit) and **互动活跃度** (Engagement), each independently 0–100. Never display an ambiguous combined 200-point score.

Opportunity stage terminology:

| Internal key | Canonical Chinese |
| --- | --- |
| `NEW` | 新建 |
| `QUALIFIED` | 已验证 |
| `SOLUTION` | 方案 |
| `QUOTATION` | 报价 |
| `WON` | 成交 |
| `LOST` | 丢失 |

Use 商机阶段, 商机负责人, 商机跟进负责人, 商机协作成员 and 商机优先级. WON is the current CRM sales-chain endpoint; it does not mean an Order, Contract, Invoice, Finance or ERP module exists.

## Company and Contact language

- Company **客户阶段** is the lifecycle: 目标客户, 已触达, 持续经营, 机会中, 客户, 不适合.
- Company **业务关系** is multi-valued: 潜在客户, 客户, 供应商, 合作伙伴.
- A CUSTOMER relationship and 客户 lifecycle are synchronized for ordinary edits; do not present them as contradictory statuses.
- Contact type is 企业联系人 or 个人联系人.
- The legacy `CrmContactStage` remains import/API compatibility only. Do not show a generic “CRM 状态” or ambiguous “触达阶段” in ordinary Contact forms, lists or details.
- Record identifiers are labeled 公司 ID, 联系人 ID, 线索 ID and 商机 ID, and are visible/copyable on the matching details.

## Acquisition and operational labels

| Internal code family | Product examples | Rule |
| --- | --- | --- |
| Marketing Lead source | 手工录入, 官网, 表单, 营销活动, 市场活动, 展会, 推荐, 主动拓客, 合作伙伴, 批量导入, 其他 | Selects submit the stable code and display only the product label. |
| Source channel | 自然搜索, 付费搜索, 直接访问, 社交媒体, 微信公众号, LinkedIn, 付费媒体, 邮件营销, 展会, 推荐, 合作伙伴, 主动拓客, 其他 | 来源渠道 is a controlled selector; 来源详情 remains free-form business text such as Google or 上海进博会. |
| Score level | 低, 中, 高 | Context label must say 线索匹配度, 客户匹配度 or 互动活跃度; never Fit or Engagement. |
| Export scope | 已选记录, 当前筛选结果, 当前权限内全部记录 | Never expose persistence scope keys. |
| Job state | 等待处理, 处理中, 已完成, 失败, 已过期 | Import/export history uses product labels, not raw task codes. |

`frontend-react/src/lib/product-language.ts` is the single product-language dictionary. Page-local translations for these families are prohibited. Unknown historical codes resolve to 其他, 其他阶段 or 未知状态 in ordinary UI rather than displaying `UPPER_SNAKE_CASE`.

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
- Contact 360, Phone, Fit Score, Engagement Score, Manual and raw audit-action codes.
- Amount, revenue, cost, invoice, payment, procurement or contract-value metrics in the Dashboard.

## Compatibility rule

Compatibility names do not define product language. When code must retain `CrmLead`, `/crm/leads`, legacy Contact stage or historical post-sales columns, isolate them behind comments/adapters and translate at the UI and audit-label boundaries. New code must use Marketing Lead and Opportunity concepts explicitly and must not expand legacy ambiguity.

Administrator screens may show a technical code only when the surrounding label explicitly says 技术代码 or 管理员. Raw API messages, stack traces, database errors and framework validation messages never belong in product UI.
