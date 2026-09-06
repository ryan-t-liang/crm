# Kivisense CRM 2.0 Customer Operations & Management Expansion Report

Date: 2026-09-06  
Repository: `https://github.com/ryan-t-liang/crm.git`  
Branch: `codex/kivisense-crm-v2-v1-ui-rebuild`

## 1. Git Baseline

- Baseline verified before implementation: `e2c21142bcda513abc731b029b620a97e897b4b1`.
- Backup branch created and retained: `backup/kivisense-crm-v2-before-customer-ops` at the baseline commit.
- Existing Contact 360, Contact/Lead Journey, modular forms, attachments, import/export, RBAC, audit, soft delete, V1 UI, and field dictionary were preserved.
- Customer Operations implementation commits begin at `2ddd8668562e93ce6836c2ec93d595ca35c0e40b`. Follow-up commits add upgrade permissions, read-only UI enforcement, the complete operations controls, valid reactivation logic, and KPI definition alignment.
- `main`, Production, and the historical `Kivisense_CRM_v1` tag were not modified.

## 2. Domain Architecture

The expansion keeps the established `Contact 1:N Lead` boundary and adds a higher B2B company layer:

```text
Organization (Company 360; unified prospect/customer/vendor/partner master)
  └─ Contact (Person 360)
       └─ Lead (Opportunity)

Followup (Business Interaction) → current snapshot + next CrmTask
CrmTask (Next Action)           → execution KPI
Journey (Business History)      → aggregated read model
Audit (System History)          → independent security/change record
```

Lead still stores `contactId`, not `organizationId`; the company is derived through `Lead.contact.organization`. Supplier is a filtered Organization view, not a second company table.

## 3. Organization Model

Implemented `Organization`, `OrganizationRole`, `OrganizationNurture`, `OrganizationLifecycleHistory`, and Organization attachment support. The master includes name, short name, website/domain, industry, country/region/city, owner, lifecycle, manual Fit score/reason, note, creator/timestamps, and soft-delete metadata. Calculated service fields include contact/lead counts, won lead count, last interaction, next action, Engagement score/level/state/breakdown, dormant days, next task, and active logo.

Roles are exactly `PROSPECT`, `CUSTOMER`, `VENDOR`, and `PARTNER`; one Organization may hold multiple roles. No duplicate Customer/Vendor master and no unrequested `COMPETITOR` role were created.

## 4. Organization Migration

`20260905010000_customer_operations_management` is additive and non-destructive. It creates the new company/operations tables, adds `Contact.organizationId`, adds `Lead.closedAt`, and adds the required indexes. Backfill uses normalized exact company names only. It does not fuzzy-merge similar names such as Gucci, Gucci Beauty, and Gucci China. Ambiguous or absent legacy company strings remain unlinked and keep their compatibility values.

Once a Contact is linked, Organization becomes the displayed company source of truth; Contact company strings remain compatibility/import fields and cannot independently overwrite the linked Organization.

## 5. Company List

The first-class 公司 page uses the V1 quiet enterprise layout. Columns are Logo, company, roles, lifecycle, Fit, Engagement, owner, contact count, active lead count, last interaction, next action, updated time, and actions. Filters cover keyword, Role, Lifecycle, Owner, Industry, Fit level, Engagement level, and Engagement state.

Authorized users can act directly from each row: add interaction, create Lead, create Task, start Nurture, or open Company 360. If a company has multiple contacts, person-dependent actions route to Company 360 so the user explicitly chooses a Contact.

## 6. Company 360

Company 360 displays Logo/fallback initials, official and short name, industry, roles, lifecycle, owner, Fit score/reason, Engagement score, state, and transparent scoring breakdown. The non-financial summary shows contacts, active leads, latest interaction, and next action.

Right-side tabs are: Overview, Contacts, Leads, Customer Journey, Tasks, Files, Notes, and Audit. Contact rows enter Contact 360; Lead rows enter Lead detail. Organization Journey aggregates company creation, contacts, followups, leads, stage/lifecycle changes, attachments, nurture, and reactivation-relevant interactions without copying the underlying business records.

## 7. Contact / Company Integration

- Contact has nullable `organizationId` and remains usable for person-only or not-yet-confirmed records.
- Contact create/edit uses a searchable Organization selector.
- Quick Create stays inside the Contact form and requests only company name, short name, website, industry, country/region, and optional image Logo; default role is `PROSPECT`.
- Duplicate candidates are based on normalized exact name or website domain. The user may select an existing record or explicitly confirm a distinct company; the server never fuzzy-merges.
- Contact detail shows its linked company and provides a route to Company 360.
- Lead creation still requires Contact. If the Contact has no Organization, the user may continue, or quickly create/link a company without blocking Lead creation.

## 8. Vendor / Supplier View

供应商 is `OrganizationRole = VENDOR`. It uses the same company master and permissions. The first view contains Logo, company, contact count, Website, region, owner, latest interaction, note, and actions. Creating a vendor creates an Organization with VENDOR role; adding VENDOR to an existing CUSTOMER preserves a single record. Vendor quote, quality, delivery cycle, purchase order, and billing fields were not guessed or added.

## 9. Fit Score

Fit is manually maintained from 0–100 with a long-text reason. Bands are LOW 0–39, MEDIUM 40–69, and HIGH 70–100. The server validates boundaries; changes require `crm.organization.score.edit` and are audited. No invented industry, company-size, or budget weighting and no financial value are used.

## 10. Engagement Score

Engagement is calculated centrally by the backend and clamped to 0–100:

- Latest interaction: 0–7 days `+35`; 8–30 `+25`; 31–60 `+10`; older/none `+0`.
- Interaction count in the last 30 days: `+5` each, capped at `+20`.
- Active Lead: `+20`.
- Meeting in the last 30 days: `+10`.
- Explicit OPEN next-action Task: `+10`.
- Any overdue Task: `-10`.

Levels are LOW 0–39, MEDIUM 40–69, and HIGH 70–100. Followup, Lead, task, and Dashboard queries return the current calculation; no queue or cron infrastructure is required.

## 11. Scoring Explanation

The API returns `engagementBreakdown`, and Company 360 displays each component and signed point value alongside Fit reason. A manager can therefore distinguish recent activity, frequency, active opportunity, meeting, next action, and overdue penalty instead of seeing an unexplained total.

## 12. Lifecycle

Lifecycle values are `TARGET`, `CONTACTED`, `NURTURING`, `OPPORTUNITY`, `CUSTOMER`, and `DISQUALIFIED`. First active Lead may promote TARGET/CONTACTED/NURTURING to OPPORTUNITY; first WON Lead promotes to CUSTOMER. Active Nurture may promote TARGET/CONTACTED to NURTURING but cannot downgrade OPPORTUNITY. `DISQUALIFIED` is never automatically overwritten. All transitions append `OrganizationLifecycleHistory` for Journey.

## 13. Engagement State

Engagement state is computed, not manually stored: ACTIVE when an active Lead exists or an interaction falls within `CRM_ACTIVE_DAYS`; COOLING when the interaction age is between the active and dormant thresholds and there is no active Lead; DORMANT when it exceeds `CRM_DORMANT_DAYS` and there is no active Lead. Defaults are 30/60 days and come from environment configuration.

## 14. Nurture

`OrganizationNurture` records status (`ACTIVE`, `PAUSED`, `COMPLETED`), owner, reason, objective, cadence days, next touch, touch topic, start/end time, creator, and timestamps. Starting or updating an active plan maintains one NURTURE Task for the next touch. It does not pre-generate a year of tasks and does not send automated email or WeChat messages.

## 15. Reactivation

Reactivation is derived from Journey interactions, never stored as a permanent boolean. A new ContactFollowup or LeadFollowup counts only when the gap from the previous interaction is at least `CRM_DORMANT_DAYS`; for the first-ever interaction, the company itself must already be at least that old. A UAT-detected false positive for newly created companies was corrected and regression-tested.

## 16. CrmTask

`CrmTask` supports nullable Organization/Contact/Lead links with a server rule requiring at least one, plus title, description, owner, NORMAL/HIGH priority, due time, OPEN/DONE/CANCELED status, MANUAL/FOLLOWUP/NURTURE source, completion actor/time, creator, and timestamps. Tasks are never hard-deleted: cancellation preserves history, and completed tasks cannot be normally edited.

## 17. Followup → Task Loop

Lead and Contact followups accept next action and next followup time. When both are present, the transaction creates a linked FOLLOWUP Task. When a followup starts from a current Task, that Task is completed first and the next Task is created. A real local browser flow verified `Task → Followup → current DONE → next OPEN Task` and captured the before/after result.

## 18. My Workbench

我的工作台 is separate from Dashboard and answers what the salesperson should do now. It shows overdue, today, next seven days, and high-priority counts, followed by an overdue-first Task queue sorted by due time and priority. Cards show related company/contact/lead, title, due time, priority, owner, and business context, with authorized actions to complete, follow up, postpone, and open the related record.

## 19. Management Dashboard

Dashboard uses only non-financial customer health and execution indicators. It supports 7/30/90-day and custom date ranges, management owner filter, and Organization role filter. Components include six primary KPI cards, Fit × Engagement matrix, count-based Pipeline, execution-health metrics, lifecycle distribution, and (with management permission) team execution. SALES receives a self-scoped view. No amount, quote, revenue, forecast, payment, weighted value, or financial ranking is selected or returned by Analytics APIs.

## 20. KPI Definitions

1. **Active Organizations** — Definition: eligible PROSPECT/CUSTOMER company with an active Lead or interaction inside `CRM_ACTIVE_DAYS`. Numerator: qualifying Organization count. Denominator: N/A (count). Time Window: point-in-time rolling active threshold. Filters: not deleted, not DISQUALIFIED, owner and Organization role.
2. **Active Leads** — Definition: non-deleted Lead not WON/LOST. Numerator: qualifying Lead count. Denominator: N/A. Time Window: point in time. Filters: company owner/role scope through Contact → Organization.
3. **New Leads** — Definition: Lead created inside the selected report period. Numerator: qualifying Lead count. Denominator: N/A. Time Window: selected from/to. Filters: non-deleted and owner/role scope.
4. **Reactivation Candidates** — Definition: Fit ≥ 70 and current Engagement state DORMANT. Numerator: qualifying Organization count. Denominator: N/A. Time Window: point in time using configured dormant threshold. Filters: eligible company, owner/role.
5. **Overdue Tasks** — Definition: OPEN Task with `dueAt < now`. Numerator: qualifying Task count. Denominator: N/A. Time Window: point in time. Filters: tasks connected to scoped organizations/contacts/leads.
6. **Stale Leads** — Definition: active Lead whose latest followup, or creation time when never followed up, is older than `CRM_STALE_LEAD_DAYS`. Numerator: qualifying Lead count. Denominator: N/A. Time Window: rolling threshold, default 30 days. Filters: owner/role scope.
7. **Win Rate** — Definition: count-based close outcome. Numerator: Leads closed WON in the selected period. Denominator: Leads closed WON + LOST in the same period. Time Window: selected from/to using `closedAt`. Filters: owner/role scope; no amount weighting.
8. **Average Sales Cycle** — Definition: mean days from Lead creation to close. Numerator: sum of `createdAt → closedAt` days for WON/LOST Leads closed in period. Denominator: count of those closed Leads. Time Window: selected from/to by `closedAt`. Filters: owner/role scope.
9. **Next Action Coverage** — Definition: active Lead has non-empty `nextAction` and at least one linked OPEN Task. Numerator: covered active Leads. Denominator: all active Leads. Time Window: point in time. Filters: owner/role scope.
10. **Followup Completion Rate** — Definition: non-canceled Tasks due in the report period that are DONE. Numerator: DONE Tasks due in period. Denominator: all non-CANCELED Tasks due in period. Time Window: selected from/to by `dueAt`. Filters: scoped tasks. On-time is additionally counted when `completedAt <= dueAt`.
11. **Customer Coverage** — Definition: assigned PROSPECT/CUSTOMER Organizations with at least one business interaction in period. Numerator: distinct assigned Organizations touched in period. Denominator: all assigned eligible Organizations. Time Window: selected from/to. Filters: owner and Organization role; unassigned companies are excluded from the denominator.
12. **Active Nurture Organizations** — Definition: Organization with ACTIVE Nurture plan. Numerator: distinct active-nurture Organization count. Denominator: N/A. Time Window: point in time. Filters: owner/role scope.
13. **Nurture → Lead Conversion** — Definition: Organization receives a Lead after its Nurture start. Numerator: distinct qualifying Organizations. Denominator: distinct Organizations whose Nurture started in the selected period. Time Window: selected period through report end. Filters: owner/role scope.
14. **Reactivated Organizations / Rate** — Definition: an actually touched Organization whose prior interaction (or sufficiently old creation date for first interaction) is at least `CRM_DORMANT_DAYS` earlier. Numerator: qualifying reactivated Organizations. Denominator: dormant Organizations actually touched in the period. Time Window: selected from/to. Filters: owner/role scope; all dormant companies are not used as denominator.
15. **High-fit Untouched** — Definition: Fit ≥ 70, no active Lead, and no interaction inside `CRM_HIGH_FIT_UNTOUCHED_DAYS`. Numerator: qualifying Organization count. Denominator: N/A. Time Window: rolling threshold, default 30 days. Filters: owner/role scope.

## 21. Fit × Engagement Matrix

The backend returns one bounded 3×3 matrix of Organization counts. High-Fit cells are emphasized as A1 (HIGH/HIGH, priority followup), A2 (HIGH/MEDIUM, nurture), and A3 (HIGH/LOW, priority reactivation). Clicking a cell routes to Company List with Fit and Engagement filters applied. The matrix never carries monetary values.

## 22. Pipeline

Pipeline is count-based. NEW, QUALIFIED, SOLUTION, and QUOTATION show current active distribution; WON and LOST show Leads closed in the selected period. `LeadStageHistory` appends each status transition instead of parsing Audit text. `closedAt` is first set on entry to WON/LOST and cleared on reopen; existing `wonAt`, `estimatedQuote`, `currency`, and quotation files remain compatible but are not used by Dashboard.

## 23. Team Execution

Management-only team rows show Open Tasks, Done Tasks due in period, Overdue Tasks, on-time completion percentage, interactions in period, active Leads, stale Leads, and Leads with Next Action percentage. The last metric requires both next-action text and a linked OPEN Task. There is no revenue or deal-value ranking. Self Dashboard and management Dashboard are permission-separated rather than coupled to a hard-coded role name.

## 24. Analytics API

Implemented:

- `GET /api/v1/crm/analytics/management`
- `GET /api/v1/crm/analytics/self`
- `GET /api/v1/crm/analytics/fit-engagement-matrix`
- `GET /api/v1/crm/analytics/team`

All accept bounded date/owner/role filters as permitted. KPI logic is centralized in `CrmAnalyticsService`; the browser does not download full datasets to recompute metrics. Organization hydration and analytics use bounded/batched queries and indexes on organization/contact/lead/task/status/owner/time/deletion fields rather than per-row frontend calls.

## 25. RBAC

Added Organization, score, nurture, task, self Dashboard, and management Dashboard permissions. `20260906010000_customer_operations_permissions` makes these permissions available on existing upgraded UAT databases without seed/reset. Defaults: SUPER_ADMIN receives full new permissions; SALES receives self Dashboard and authorized company/nurture/task actions within task ownership rules; VIEWER receives read-only Organization/Task/self Dashboard access.

Backend route guards and task ownership checks are authoritative. Live UAT role review confirmed SUPER_ADMIN import/export/system access, SALES business actions without import/export/system administration, and VIEWER read-only actions. A live review finding where VIEWER still saw a task-create control was fixed; the UI now hides company, nurture, workbench, completion, and postponement mutations when permissions are absent.

## 26. Import / Export

Organization template/import/export supports name, short name, website, industry, country, region, city, roles, lifecycle, owner, Fit score/reason, and note. Logo import uses an external URL rather than binary XLSX data. Contact import supports `organizationId` or exact Organization name; ambiguous matches produce preflight feedback. Creating missing Organizations is an explicit option and defaults OFF. Existing Contact/Lead batch import, export, templates, progress, failure details, and permission controls remain intact.

## 27. Migration

- Clean install: all six migrations applied on MySQL 8.4, then seed completed; new permission counts were verified for SUPER_ADMIN, SALES, and VIEWER.
- Upgrade preservation: an existing pre-expansion database migrated without reset; Contact/Lead/followup/attachment data remained, deterministic company backfill linked exact matches, and legacy company strings plus existing quote data were preserved.
- UAT migration: all six migrations are applied; subsequent deployments report no pending migrations. No UAT seed or reset was run.
- Required indexes exist for normalized name/domain, lifecycle/Fit/owner/deleted time, Contact organization, Lead `closedAt`, task entity/owner/status/due time, stage history, lifecycle history, nurture, and attachments.

## 28. Tests

Final local gates:

- Prisma schema validation: PASS.
- Prisma Client generation: PASS.
- TypeScript lint: PASS.
- Production build: PASS.
- Unit + MySQL integration: **37/37 PASS** (15 unit, 14 core integration, 8 import/export integration).
- Field dictionary contract: PASS, 31 Contact + 44 Lead source headers.
- Frontend syntax and interaction contracts: PASS.
- Clean install and upgrade preservation: PASS.

Coverage includes unified company roles/duplicates/linking, Contact 1:N Lead, immutable Lead Contact relationship, stage/lifecycle/closed time, attachments and protected download, Fit/Engagement thresholds and breakdown, nurture/task generation, followup current-task completion and next-task creation, soft-delete protections, import/export boundaries, non-financial analytics, reactivation threshold correctness, assigned-company coverage denominator, and RBAC/ownership enforcement.

## 29. Browser Review

Required screens were exercised with real clicks at 1440, 1280, and 1024 widths. Document/body width matched viewport at all final checkpoints; wide tables scroll only inside their card. UAT additionally verified Contacts, linked Company detail, Leads, searchable Contact combobox, requirement text plus image/video/document attachments, three roles, custom Dashboard dates, final company filters/actions, and the corrected reactivation KPI.

Manual acceptance answers:

- A manager can identify active customer assets, active opportunities, reactivation candidates, overdue tasks, and stale Leads within the first KPI row; PASS.
- A salesperson can see who to contact, why, due/priority context, and execute followup/complete/postpone from Workbench; PASS.
- Company 360 exposes people, Leads, Journey, tasks, files, scores, and transparent investment signals; PASS.
- Dashboard and APIs contain no financial KPI or amount field; PASS.

## 30. Screenshots

Evidence directory: `docs/qa-evidence-customer-operations/`.

- 43 local browser screenshots cover all 14 required states across 1440/1280/1024 plus the post-followup next-task result.
- 16 live UAT screenshots cover Dashboard, Company, Company 360, Operations, Workbench, Supplier, Contact, Lead, attachments, VIEWER read-only behavior, final filters/actions, custom range, and corrected reactivation.
- Total: **59 PNG screenshots**.
- `capture_manifest.csv` records viewport, state, file, and overflow verification for every image.

## 31. Skill / Maintainer Guard

The repository has no supported project-level Codex Skill registration runtime, so no fake Skill package was created. `docs/kivisense-crm-maintainer.md` is the repository-native rule, and root `AGENTS.md` makes it mandatory. It fixes domain language, V1/field sources of truth, unified Organization rules, Followup/Task/Journey/Audit boundaries, no-financial Dashboard rules, migration/data-preservation gates, and required browser/testing gates.

## 32. Deferred Commercial Modules

Not developed in this phase: Project, Order, Contract, Cost, Finance, Invoice, Procurement, Automation, and AI. Accounting, General Ledger, Tax, Inventory, Warehouse, Payroll, Purchase Order, ERP Finance, dynamic/custom fields, formulas, low-code builders, workflow builders, email/WeChat campaigns, AI recommendations, AI scoring, and AI email generation also remain out of scope. Existing Lead quote/currency/files are preserved for compatibility only. Architecture leaves future commercial modules attachable to Organization/Lead without duplicating the company master.

## 33. UAT Deployment

Target: `https://www.gridworks.cn/crm_kivisense/` (hash routes such as `#dashboard`, `#organizations`, `#leads`).

Deployment used `/srv/kivisense-crm-uat`, an immutable commit archive, a commit-tagged Docker image, additive `prisma migrate deploy`, and the existing UAT database/storage. Before deployment, application, database, attachment storage, and Nginx were backed up to:

`/srv/kivisense-crm-backups/20260905T155930Z-pre-2ddd8668562e`

The backup manifest, archive/database compression, and SHA-256 checks passed. Runtime readiness returns `status=ready`, `database=ok`, release `Kivisense CRM 2.0`, version `2.0.0-uat`. Nginx configuration validation passed; its existing duplicate `gridworks.cn` server-name warning was unchanged. UAT data remained: 2 Contacts (2 linked), 2 Organizations/2 roles, 2 Leads (1 retained estimated quote), 1 Contact followup, 1 Lead followup, 0 attachments, 0 tasks, 2 stage-history rows, and 2 lifecycle-history rows.

The final GitHub/report commit is redeployed as the runtime provenance marker after this report is committed; application behavior is based on the tested business-code commits above. Production and `main` remain untouched.

## 34. Final Verdict

**READY FOR BUSINESS UAT**
