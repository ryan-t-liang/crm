# Kivisense CRM Maintainer Guard

This repository has no project-level Codex Skill registration runtime. This document is the repository-native maintainer rule and is referenced by the root `AGENTS.md`.

## Domain language

- Contact = Person 360. A Contact is a person and may have many Leads.
- Organization = Company 360. It is the unified customer, prospect, vendor, and partner master.
- MarketingLead = 线索. It owns acquisition, original inquiry, scoring, marketing lifecycle, and conversion attribution.
- CrmLead = Opportunity / 商机. The technical Prisma/table name stays unchanged. An Opportunity belongs to exactly one Contact; its Organization is derived through that Contact.
- Followup = Business Interaction. Followups are append-only business history and drive current progress, next-action, last-interaction, and next-followup snapshots.
- Task = Next Action. Open, completed, and canceled tasks are the execution record and drive execution KPIs.
- Journey = Business History. It combines domain events into a human-readable customer timeline.
- Audit = System History. It records who changed the system and must not be presented as the business journey.

Do not create a second company or supplier master. `OrganizationRole` expresses `PROSPECT`, `CUSTOMER`, `VENDOR`, and `PARTNER`; the same Organization may hold several roles. Do not add a competitor role in this phase.

## Sources of truth

- The supplied `crm-Kivisense_CRM_v1.zip` is the UI source of truth. Its inline V1 styles take priority over the supplementary `frontend/styles/production.css`; current React pages must use the repository's V1-native components and native DOM/SVG only.
- `docs/crm-2.0-field-dictionary.md` is the field source of truth for Contact and Lead compatibility.
- Organization owns linked company name, website, industry, and location. Contact legacy company strings are compatibility snapshots only and must not remain the relationship key.
- Opportunity must retain `contactId`; do not replace Contact 1:N Opportunity with a direct Organization-only relationship.
- `MarketingLead.inquiryContent` is the independently stored source of truth for the original inquiry. Opportunity requirement details may start from it but must never write back to it; any authorized lead correction remains audited.
- Contact owns live person data, Organization owns live company data, and Opportunity must read those relations rather than copy their master fields.

## Marketing Lead and conversion rules

- Fit and Engagement are separate 0–100 dimensions. Bands are LOW 0–39, MEDIUM 40–69, and HIGH 70–100; do not present an ambiguous combined 200-point total.
- Scoring changes come from `LeadScoringRule`. Each activity stores its Fit/Engagement delta snapshots, so later rule edits never rewrite history.
- Automatic MQL evaluation applies from `NEW`, `NURTURING`, and `RECYCLED` when both configured thresholds pass. Nurturing is an ongoing scoring/engagement process, not an ordinary user action; never restore a “开始孵化” button.
- MQL → SQL is the explicit sales acceptance action. SQL converts directly to Opportunity in one command; `QUALIFIED` may remain only as an internal compatibility transition inside that command.
- Conversion is one serializable backend command. Matching is backend-owned, candidates are suggestions, and no fuzzy match may auto-merge.
- `CrmLead.sourceMarketingLeadId` is a real unique foreign key. One Marketing Lead may create at most one converted opportunity; retries return the existing conversion.
- Converted Marketing Leads remain as read-mostly marketing records. See `docs/lead-conversion-contract.md` for the complete contract and attribution rule.

## Product and navigation boundaries

- Ordinary UI exposes only Company / 公司, Contact / 联系人, MarketingLead / 线索, Opportunity / 商机, Task / 任务, Followup / 跟进记录, Customer Journey / 客户旅程, Supplier / 供应商, and AuditLog / 操作记录.
- `/api/v1/crm/leads`, `CrmLead`, and `#leads` are compatibility identifiers for Opportunity. Do not derive new user-facing “线索” language from them.
- Navigation is fixed to 概览 (数据看板, 我的工作台), 客户管理 (公司, 联系人, 线索, 商机), 资源 (供应商), and 系统. Do not restore 客户运营 as a top-level module.
- 我的工作台 is the personal action center. It must combine MQL acceptance, task time buckets, stale Opportunities, active Opportunities without a next action, and only rule-backed Company reconnect candidates.
- Dashboard is limited to 管理概览, 营销与转化, 商机推进, 团队表现. Owner attribution uses `MarketingLead.ownerUserId` and `CrmLead.salesOwnerUserId`; never intersect Opportunity ownership with Company ownership.

## Customer operations rules

- Fit is manually maintained from 0 to 100 with a reason. Bands are LOW 0–39, MEDIUM 40–69, and HIGH 70–100.
- Engagement is computed, clamped to 0–100, and returned with a transparent point breakdown. Threshold days must come from configuration.
- An active Opportunity advances a non-disqualified Organization to `OPPORTUNITY`; a Won Opportunity advances it to `CUSTOMER`. Never automatically reopen `DISQUALIFIED`.
- Nurture needs reason, objective, cadence, next touch, touch topic, owner, and status. An active nurture owns one next-touch task; do not materialize an unlimited future task series.
- Completing or canceling a Task preserves history. Do not hard-delete task history.
- A Followup with both a next action and next-followup time must create the next Task. When submitted from a current Task, complete that Task before creating the next one.

## Analytics and security

- Dashboard and analytics contain no financial metrics and must not select or return quote, amount, revenue, cost, contract, payment, invoice, or procurement values.
- Every KPI must document definition, numerator, denominator, time window, and filters.
- Marketing analytics must be calculated on the backend according to `docs/marketing-kpi-dictionary.md`; visitor counts remain explicitly unavailable until tracking exists.
- Team and management analytics must use bounded or aggregated queries; do not introduce per-user N+1 query loops.
- Keep management and self Dashboard permissions separate. Sales users may manage only tasks they own unless explicit management authority is granted.
- Attachment downloads remain authenticated and entity-scoped. Organization logo accepts images only and has one active file.
- Import never fuzzy-merges Organizations. Contact import may link by exact normalized Organization name; creating a missing Organization requires an explicit opt-in that defaults off.
- Core list exports use the existing job architecture with explicit `SELECTED`, `FILTERED`, or `ALL_CURRENT_PERMISSION` scope. The original permission boundary must be rechecked for history downloads and regeneration.
- Owner changes enqueue `AssignmentNotification` in the same database transaction. Only a real assignee change creates an outbox row; worker failure must not roll back the business update and duplicate notifications must be suppressed.
- SMTP or another transport is configuration, not business state. UI may confirm that assignment was saved, but may claim email delivery only after the outbox reaches `SENT`.

## Change and verification gates

1. Inspect current files, Git status, migration history, and runtime before editing. Preserve unrelated work.
2. Migrations must be additive and non-destructive. Verify both clean install and upgrade preservation; never reset or reseed a live UAT database.
3. Run Prisma validation/generation, TypeScript lint, unit tests, field-dictionary tests, frontend contracts, and DB integration tests.
4. Use a real browser for the required Customer Operations screens at 1440, 1280, and 1024 widths. The page shell must not overflow; wide tables may scroll only inside their card.
5. UAT deployment is allowed only after all P0 gates pass and browser review has no blocker. Back up database, application, attachments, and Nginx first. Never deploy this phase to Production or `main`.

## Deferred scope

Project, Order, Contract, Cost, Finance, Invoice, Procurement, general Automation, AI, custom-field engines, formulas, low-code builders, and workflow builders are deliberately not implemented in this phase.
