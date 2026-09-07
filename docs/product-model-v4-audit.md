# Kivisense CRM 2.0 — Product Model v4 Current-System Audit

Date: 2026-09-07
Baseline branch: `codex/kivisense-crm-v2-v1-ui-rebuild`
Baseline commit: `9acf2502231c0a2f407374a58b4090a61dd71b01`
Safety branch: `backup/kivisense-crm-before-product-ui-v4`

## 1. Audit scope and evidence

This audit is based on the current repository, Prisma schema and migrations, Fastify routes/services, React routes/components, current tests, the preserved `artifacts/ui-audit/` browser archive, `DESIGN_SYSTEM_v1.2.md`, and `CODEX_UI_REFACTOR_PROMPT_v3.md`. The pre-refactor archive is evidence and must not be overwritten.

Audited product areas:

- Company / Organization, Contact, Marketing Lead, Opportunity (`CrmLead` compatibility persistence), Task, Followup, Customer Journey, AuditLog, Supplier.
- Marketing qualification, conversion, assignment, import/export, analytics, workbench, navigation, RBAC, attachments, and detail/list/form UI.
- Additive migration and UAT deployment constraints.

## 2. Canonical domain map

| Product object | Current persistence/API | Current visible language | v4 disposition |
| --- | --- | --- | --- |
| Company | `Organization`, `/crm/organizations` | 公司 | Keep; add structured industry/location and Smart Views. |
| Contact | `Contact`, `/crm/contacts` | 客户联系人 / 联系人 | Keep; add `ContactType`; hide legacy `stage` from ordinary UI. |
| Marketing Lead | `MarketingLead`, `/crm/marketing-leads` | 线索 | Keep; correct qualification lifecycle and form. |
| Opportunity | `CrmLead`, `/crm/leads` | Mostly 商机 | Keep storage/routes as compatibility layer; all user language must be 商机. |
| Task | `CrmTask`, `/crm/tasks` | 任务 | Keep; assignment notification applies. |
| Followup | `ContactFollowup`, `LeadFollowup` | 互动 / 商机跟进 | Keep. |
| Customer Journey | Computed service response | 客户旅程 | Keep; surface in relevant record context. |
| Supplier | `Organization` + `VENDOR` role | 供应商 | Correct model already; keep as resource view. |
| Customer plan | `OrganizationNurture` | 孵化 / 客户经营计划 mixed | Standardize to 客户经营计划 and embed in Company 360. |
| Audit | `AuditLog` | 操作记录 / 审计日志 | Keep. |

There is no Order or ERP aggregate. A WON Opportunity only advances the associated Company lifecycle to `CUSTOMER`.

## 3. Current product-model findings

### 3.1 Marketing Lead lifecycle

Current state:

- Status enum contains `NEW`, `NURTURING`, `MQL`, `SQL`, `QUALIFIED`, `CONVERTED`, `RECYCLED`, and `DISQUALIFIED`.
- Create accepts both `NEW` and `NURTURING`, exposes Fit score, and does not run automatic MQL evaluation.
- Automatic MQL promotion only runs while status is `NURTURING`.
- The transition API and UI expose `START_NURTURING`, `ACCEPT_SQL`, `RECYCLE`, `QUALIFY`, and `DISQUALIFY`.
- Conversion accepts only `QUALIFIED` for ordinary users, despite the required single SQL-to-Opportunity action.
- Conversion itself is already serializable, idempotent, and linked by unique `sourceMarketingLeadId` / `convertedOpportunityId`.
- Exact company/contact matching exists. Similar company-name matches are warnings rather than automatic merges, which is compatible with v4.
- Converted records are protected from ordinary mutation and removal.

Required correction:

- New records default to `NEW`; ordinary create has no status and no Fit/Engagement controls.
- Scoring can promote `NEW`, `NURTURING`, and `RECYCLED` to MQL.
- Remove ordinary “开始孵化” and explicit “确认机会”. MQL acceptance records `sqlAt` and `firstSalesResponseAt`; SQL converts to Opportunity in one action, with any `QUALIFIED` compatibility transition internal to the same transaction.
- MQL and SQL may recycle or disqualify. Converted remains read-only.

### 3.2 Opportunity boundary

Current state:

- `CrmLead` is the Opportunity aggregate and correctly owns the opportunity stages `NEW`, `QUALIFIED`, `SOLUTION`, `QUOTATION`, `WON`, and `LOST`.
- The model still retains delivery, renewal, and payment timestamps. They are currently present in schemas/import/export and ordinary forms/detail content.
- WON already advances the linked Company to `CUSTOMER`.
- Detail currently has separate content, followups, notes, and audit tabs and uses a legacy-style header/summary structure.

Required correction:

- Preserve database columns and compatibility contracts, but remove `deliveryFollowupAt`, `contractRenewalAt`, and `paymentReceivedAt` from ordinary create/edit/detail UI.
- Build the dense record page: record header, highlights, Stage Path, and exactly `需求与方案 / 跟进记录 / 操作记录`; merge notes into the contextual section; show source Marketing Lead compactly.

### 3.3 Company and Supplier

Current state:

- Company name, industry, country, region, and city are free text. `countryCode` exists, but no centrally managed industry/location code fields exist.
- Roles and lifecycle are independent, so contradictory `PROSPECT` plus `CUSTOMER` states can be shown to ordinary users.
- Supplier is correctly an Organization with `VENDOR` role.
- `OrganizationNurture` already supports create/edit/pause/complete and creates a task, but is exposed through a top-level customer-operations page.

Required correction:

- Add non-destructive structured fields while preserving legacy text values: industry taxonomy code/custom label and ISO country/region/city codes/custom city.
- Use centralized taxonomy/location sources and dependent searchable selectors.
- Treat Company lifecycle as customer stage and roles as business relationships. Ordinary forms must safely synchronize Customer role/lifecycle and avoid contradictory presentation.
- Company list becomes Smart Views: all, mine, priority, opportunity, customer, reactivation, dormant.
- Move customer plans into Company 360 and remove Customer Operations from top-level navigation without deleting routes or data.

### 3.4 Contact

Current state:

- Contact may link to a Company or retain a company snapshot; the current API already permits a null `organizationId`.
- `CrmContactStage` is required by persistence and exposed as “CRM 状态/触达阶段” in create, edit, list filter, and detail.
- Contact has no business/individual distinction.

Required correction:

- Add `ContactType` (`BUSINESS`, `INDIVIDUAL`) with a safe `BUSINESS` default for existing rows.
- Business contacts support existing Company, quick create, or unconfirmed company snapshot. Individual contacts do not require Company.
- Preserve legacy stage for import/API compatibility but remove it from ordinary create/edit/detail/list surfaces.

### 3.5 Assignment notifications

Current state:

- Owner validation and audit records exist on Company, Contact, Marketing Lead, Opportunity, and Task updates.
- There is no centralized notification service, outbox, delivery status, SMTP configuration, or retry model.

Required correction:

- Add an additive transactional assignment outbox with `PENDING/SENT/FAILED`, attempts, last error, and sent timestamp.
- Enqueue only when the assigned user actually changes for Marketing Lead owner, Opportunity sales/followup owners, Task owner, and optionally Company/Contact.
- Sending is asynchronous/best-effort; delivery failure can never roll back the assignment.

### 3.6 Import/export and batch operations

Current state:

- Import and export exist for Company, Contact, Marketing Lead, and Opportunity.
- `ExportJob` already stores request/scope/filter/selected count/status/file metadata, but the endpoint only accepts `{}` and exports all rows synchronously with `scope: ALL`.
- Export history and download endpoints exist; regeneration does not.
- Shared tables have column visibility but no row selection or selection batch action bar.

Required correction:

- Extend the existing job architecture rather than introducing a parallel export system.
- Accept `SELECTED`, `FILTERED`, and `ALL_CURRENT_PERMISSION`, preview/request counts, XLSX format, history, download, and regeneration.
- Apply current permission/sales scope to exported rows.
- Add row checkboxes, select-page behavior, Export Selected, and permission-aware batch owner assignment. Do not add batch delete.

### 3.7 Analytics and workbench

Current state:

- Dashboard has five visible tabs because marketing funnel and scoring are separate.
- Management KPIs are opportunity-centric but use legacy internal names.
- Team Opportunity ownership is filtered by `salesOwnerUserId`, then incorrectly intersected with contacts whose Company owner is the same user.
- Marketing funnel already cohorts by Marketing Lead milestone timestamps and owner.
- Workbench is a standalone Customer Operations group item and primarily shows tasks.

Required correction:

- Four dashboard tabs: 管理概览, 营销与转化, 商机推进, 团队表现.
- Marketing funnel is Lead → MQL → SQL → Opportunity; scoring becomes secondary content in the same tab.
- Team attribution uses `MarketingLead.ownerUserId` and `CrmLead.salesOwnerUserId` independently of Company ownership.
- Move Workbench to Overview and aggregate MQL acceptance, today/overdue/next-seven-day tasks, stale opportunities, active opportunities without next action, and real high-value reconnect candidates.

## 4. Information-architecture and UI findings

Current navigation has a separate “客户运营” group with “客户运营” and “我的工作台”. Target navigation is:

- 概览: 数据看板, 我的工作台
- 客户管理: 公司, 联系人, 线索, 商机
- 资源: 供应商
- 系统: 账户管理, 角色与权限, 评分规则, 审计日志

The React shell still uses an inset sidebar variant and many pages behave as rounded full-page containers. Shared primitives exist, but the required dense v4 vocabulary is incomplete. Lists do not yet share the required left/right toolbar contract. Detail tabs are fragmented and permanent wide side structures remain in some Contact/Company contexts.

Required reusable primitives: `RecordHeader`, `RecordHighlights`, `StagePath`, `DetailTabs`, `DetailSection`, `FieldGrid`, `RelatedTable`, `ActivityTimeline`, `AttachmentList`, `CompactEmptyState`, `MetricStrip`, `PageToolbar`, `RecordActions`, `SectionHeader`, and `SystemIdField`/`CopyValue`.

## 5. RBAC findings

Backend guards are the authority and current routes use permission keys. Sales scoping is present for Marketing Lead routes. Mutation controls are mostly hidden in the frontend. Gaps:

- New batch assignment routes require explicit existing assign permissions and record-level scope checks.
- Export scopes must not widen record visibility.
- Regeneration must validate the same object export permission and ownership/access to the original job.
- Manual Fit override must remain limited to scoring/admin permission contexts.

## 6. Migration and data-preservation plan

All changes must be additive:

1. Add Contact type and structured Company taxonomy/location columns with defaults/nullability that preserve every current row.
2. Add assignment notification enum/table and indexes; do not rewrite existing ownership history.
3. Retain `CrmLead`, legacy Contact stage, post-sales Opportunity columns, legacy routes, customer-operations endpoints, and existing attachments.
4. Never reset, truncate, seed, or delete UAT data. Use Prisma migrations only after backup and preflight.
5. Keep current XLSX columns accepted. New columns may be appended; old exports remain readable.

## 7. Verification gaps at audit time

At this audit checkpoint, no v4 code has been deployed or claimed as passing. The following are `NOT TESTED` until implementation:

- Unit and API/integration coverage for corrected lifecycle, exact matching, idempotent SQL conversion, export scopes, batch assignment, notification outbox, structured location, and contact types.
- Local real-browser write flows with UI + HTTP + DB + reload verification.
- Local visual coverage at 1440, 1280, and 1024.
- UAT read-only, UAT controlled write smoke, RBAC matrix, notification delivery, console/network error checks, and deployment provenance.

## 8. Implementation sequence and acceptance gates

1. Additive schema migration and compatibility types.
2. Domain services: lifecycle/conversion, taxonomy/location, owner-change outbox, export scopes/batch assignment, analytics/workbench.
3. Navigation and shared dense primitives.
4. Company/Contact/Marketing Lead/Opportunity list/form/detail refactors.
5. Dashboard and Workbench consolidation.
6. Unit/API gates, then real local browser write and responsive visual evidence.
7. Preserve before archive; write after archive to `artifacts/ui-refactor-v4-after/`.
8. Backup UAT app/database/attachments/Nginx; deploy immutable commit; migrate without reset/seed; run UAT read/write/RBAC gates.
9. Update maintainer guide, design system v1.3, glossary, implementation report, evidence index, commit, and push.

Deployment is blocked until local gates pass. Production/Main are explicitly out of scope.
