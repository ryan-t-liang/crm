# Kivisense CRM 2.0 Marketing Lead & Opportunity Implementation Report

**Report date:** 2026-09-07  
**Development branch:** `codex/kivisense-crm-v2-v1-ui-rebuild`  
**Deployed application commit:** `7f203799d9526b0ba50486db39913f4a10786f7d`  
**UAT:** `https://www.gridworks.cn/crm_kivisense/`  
**Verdict:** **READY FOR MARKETING UAT**

## 1. Audit Baseline

This implementation accepts the audit at commit `f457c48` and does not repeat or reinterpret it. The accepted baseline was: no MarketingLead domain existed; the existing internal `CrmLead` represented a sales Opportunity; person and company master data were already relation-owned; and conversion, source FK, preview, idempotency, audit, journey, permission, and attribution behavior were missing.

The implementation stayed on `codex/kivisense-crm-v2-v1-ui-rebuild`. The recovery branch `backup/kivisense-crm-v2-before-lead-conversion-model` was not recreated. `main`, Production, and the `Kivisense_CRM_v1` tag were not modified.

## 2. Domain Model

The implemented boundary is:

- `MarketingLead` / 线索: acquisition snapshot, original inquiry, activity, score, qualification history, and conversion references;
- `Organization` / 公司: current company master;
- `Contact` / 联系人: current person master and live communication fields;
- `CrmLead` / 商机: sales requirement and pipeline execution.

The internal Prisma model `CrmLead` and table `crm_leads` remain unchanged. Conversion resolves or creates an Organization and Contact, creates one CrmLead Opportunity, then links all records with real foreign keys.

## 3. Marketing Lead

The P0 `MarketingLead` model includes identity, company snapshot, inquiry, acquisition, lifecycle, scoring, conversion, creator, audit timestamps, and soft-delete fields. It supports `NEW`, `NURTURING`, `MQL`, `SQL`, `QUALIFIED`, `CONVERTED`, `RECYCLED`, and `DISQUALIFIED`.

The UI provides a first-level 线索 menu, searchable/filterable table, detail view, score summaries, activity and score histories, lifecycle actions, conversion action, import/export, and a converted-record source/target summary. Converted records remain visible and are read-only for normal users.

P1 tracking fields—UTM, landing page, referrer, visitor/session IDs, IP, User Agent, browser language, timezone, device, full Campaign, and full Consent—remain explicitly deferred. No `rawMetadataJson` shortcut was added.

## 4. International Lead Compatibility

MarketingLead and Contact support Email, international phone, WhatsApp, WeChat, and LinkedIn. The backend normalizes phone and WhatsApp values toward E.164 without assuming `+86`; normalized values are indexed and used for matching. `countryCode` is an ISO 3166-1 alpha-2 value such as `AE`, `US`, `GB`, or `CN`.

The Naderi / Dena overseas scenario is covered by database integration and browser flows, including international identity, English inquiry content, company resolution, lifecycle progression, and conversion attribution.

## 5. Lead Sources

The first source vocabulary supports `WEBSITE`, `FORM`, `CAMPAIGN`, `EVENT`, `EXHIBITION`, `REFERRAL`, `LINKEDIN`, `WECHAT`, `OUTBOUND`, `PARTNER`, `IMPORT`, `MANUAL`, and `OTHER`. Source is validated at the API boundary and stored as an extensible string. `sourceChannel` and `sourceDetail` remain extensible strings, so combinations such as Website / Organic Search / Google or Bing do not require a migration.

## 6. Activity Events

`LeadActivityEvent` stores the Marketing Lead, optional scoring rule, event type, event source, occurrence time, actor, note, and immutable Fit/Engagement delta snapshots. Supported event sources are WEB, CRM, SYSTEM, IMPORT, CAMPAIGN, and EVENT.

The 线索详情 “记录行为” action lets users choose a named business behavior rather than entering raw score increments. The service resolves the rule, enforces repeat/cooldown limits, creates the activity, updates the cached score, and appends `LeadScoreHistory` in one operation. Fine-grained PAGE_VIEW events stay on the Marketing Lead journey and are not copied into company/customer journeys.

## 7. Scoring Rules

`LeadScoringRule` implements code, name, category, FIT/ENGAGEMENT dimension, delta, repeatability, maximum occurrences, cooldown, enabled state, ordering, description, and timestamps. Fourteen requested default signals are data rows, not hard-coded score branches: PAGE_VIEW +1, KEY_CONTENT_VIEW +3, RETURN_VISIT +3, FILE_DOWNLOAD +5, FORM_SUBMIT +10, CUSTOMER_REPLY +5, WECHAT_ADDED +5, MEETING_BOOKED +10, MEETING_COMPLETED +15, EXPLICIT_INTEREST +15, EXPLICIT_REQUIREMENT +20, REQUEST_SOLUTION +20, NO_TIMING -5, and NO_INTEREST -20.

Fit and Engagement remain independent 0–100 scores with LOW 0–39, MEDIUM 40–69, and HIGH 70–100 levels. The UI does not present a misleading combined score out of 200. SUPER_ADMIN can manage and order rules; SALES can only view enabled behavior labels.

## 8. MQL

MQL evaluation uses configurable environment thresholds `CRM_MQL_MIN_FIT_SCORE` and `CRM_MQL_MIN_ENGAGEMENT_SCORE`; UAT defaults are 40 and 70. When an eligible NURTURING record crosses both thresholds, the backend changes it to MQL and writes `mqlAt`, status history, score history, and Audit evidence. Rule edits do not rewrite existing delta snapshots or historical scores.

## 9. SQL

MQL never becomes SQL automatically. SALES or SUPER_ADMIN must explicitly accept it with “接受为 SQL”. The transition records `sqlAt`; `firstSalesResponseAt` is set only when empty, preserving the first-response timestamp for KPI calculation. The SQL detail exposes the separate “确认机会” action, which sets `QUALIFIED` and `qualifiedAt` before normal conversion is allowed.

## 10. Recycle / Disqualify

Legal lifecycle actions are enforced by the backend, not just hidden in the UI. Recycle records `RECYCLED`, `recycledAt`, reason, history, and Audit. Disqualify records `DISQUALIFIED`, `disqualifiedAt`, the required reason, history, and Audit. Records may be returned to nurturing according to the allowed transition map; converted records cannot re-enter lifecycle processing.

## 11. Conversion Preview

`GET /api/v1/crm/marketing-leads/:id/conversion-preview` returns the lead summary, server-computed Organization candidates, Contact candidates, and an Opportunity draft. The browser does not download all companies or contacts to perform matching.

Company matching orders exact normalized domain, exact normalized company name, then name-similarity warnings. Contact matching orders exact Email, normalized phone, normalized WhatsApp, exact WeChat, then name/company warnings. Every result has `autoMerge=false`; the user must explicitly choose an existing record, create a record, or—where permitted—continue without an Organization.

## 12. Conversion Transaction

`POST /api/v1/crm/marketing-leads/:id/convert` is the only conversion command. It executes as one serializable transaction: validate scope/status/permissions and idempotency; resolve or create Organization; resolve or create Contact; create the Opportunity; set the source FK; mark the Marketing Lead converted; write status history and Audit; commit.

Any failure rolls back the complete operation. A retry returns the existing conversion IDs with `idempotent=true`; it does not create a second Opportunity. A SUPER_ADMIN qualification override must be explicit and is recorded. The frontend never orchestrates four independent create/update calls.

## 13. Organization Mapping

When “create company” is selected, the conversion initializes Organization master values from the Marketing Lead company snapshot: company name, normalized name, website/domain, company size, industry, country code, region, and city. When “use existing company” is selected, no Marketing Lead snapshot silently overwrites the master. Domain and exact normalized-name matches are suggestions only and never automatic merges.

## 14. Contact Mapping

When “create contact” is selected, full name, Email, phone plus normalized phone, WhatsApp plus normalized WhatsApp, WeChat, LinkedIn, title, department, and the resolved Organization relation initialize the Contact master. A valid name is required. When an existing Contact is selected, Marketing Lead identity snapshots do not overwrite the person master. Opportunity reads current person values through `contactId`, so later Contact Email updates are reflected without duplicating Email on the Opportunity.

## 15. Opportunity Mapping

The Opportunity receives only sales-owned fields: editable requirement summary, requirement detail initialized from the original inquiry, optional requirement context, product interest, requirement tags, priority, initial sales stage, owners, and conversion note. Its current person and company display is relation-derived from Contact and Organization.

The original `MarketingLead.inquiryContent` is not mutated by conversion or by later edits to `CrmLead.requirementDetail`. Manually created and imported Opportunities remain valid with a null Marketing Lead source.

## 16. Fields Not Copied

The following fields intentionally do not copy to Opportunity:

| Field | Reason |
| --- | --- |
| UTM | Acquisition metadata belongs to MarketingLead/future attribution records; P1 tracking is deferred. |
| IP | Technical collection metadata is not sales-pipeline data and is deferred for privacy and tracking design. |
| User Agent | Browser/device metadata is not Opportunity master data and is deferred. |
| Score | Fit and Engagement are Marketing Lead qualification signals; copying them would create stale sales snapshots. |
| Marketing Lifecycle | MQL/SQL/Qualified/Converted history remains in `LeadStatusHistory`; Opportunity has its own sales stages. |
| Marketing Activity | Page views, downloads, campaigns, and behavior deltas remain in `LeadActivityEvent` and `LeadScoreHistory`; only meaningful conversion milestones enter company/contact journeys. |

Contact name, Email, phone, company name, and website are also not copied. They are read from Contact and Organization, preserving one current master for each fact.

## 17. sourceMarketingLeadId

`CrmLead.sourceMarketingLeadId` is nullable for backward compatibility, unique for one-conversion enforcement, indexed through its unique constraint, and backed by a restrictive FK to `MarketingLead.id`. Converted records also retain `convertedOrganizationId`, `convertedContactId`, `convertedOpportunityId`, `convertedByUserId`, and `convertedAt`. The reciprocal unique Opportunity relation prevents a Marketing Lead from producing multiple converted Opportunities.

## 18. Marketing Attribution

P0 attribution uses the real `CrmLead.sourceMarketingLeadId` relation and groups conversions by the Marketing Lead's current `source`. An authorized source correction changes current-source reporting and is audited. Historical source-at-conversion snapshots and multi-touch attribution are deliberately deferred; they require immutable attribution records rather than duplicate fields on Opportunity.

Thus the product can navigate from Opportunity to the exact source Marketing Lead, its source/channel/detail, original inquiry, and conversion timestamp. It does not claim visitor or multi-touch data that the system does not collect.

## 19. Data Dashboard

The product label is now 数据看板 while route `#dashboard` and component compatibility names remain unchanged. The existing visual system was preserved. The five views are 管理概览, 营销漏斗, 孵化与评分, 商机推进, and 团队执行. Existing sales KPIs are relabeled 活跃商机、新增商机、停滞商机 rather than being presented as Marketing Leads.

Marketing analytics are calculated by backend endpoints with date, owner, and source filters. The frontend does not pull all Marketing Leads to calculate KPIs.

## 20. Marketing Funnel

The real funnel is Lead → MQL → SQL → Opportunity. It includes New Leads, MQL count/rate, MQL → SQL rate, SQL → Opportunity rate, Lead → Opportunity rate, average Lead → MQL time, MQL → SQL time, Lead → Opportunity time, and MQL response time. Visitor is explicitly shown as “未接入网站访客追踪”; no visitor count is fabricated.

All calculations follow the created-lead cohort and time/filter rules in `docs/marketing-kpi-dictionary.md`.

## 21. Scoring Analytics

孵化与评分 reports active, MQL, Hot/Warm/Cold, high-score untouched, and recycled Marketing Leads. It also provides the 3×3 independent Fit/Engagement distribution and top scoring signals from immutable activity snapshots. Thresholds, empty denominators, duration nullability, and active-record rules are defined in the KPI dictionary.

## 22. Source Quality

Source Quality reports Source, Lead Count, MQL, MQL Rate, SQL, SQL Rate, Opportunity Count, Lead → Opportunity Rate, and average conversion time. It uses MarketingLead source plus the real converted Opportunity FK and does not add monetary values. Soft-deleted leads are excluded; converted records remain in their creation cohort.

## 23. UI Naming Migration

All normal user-facing representations of the existing CrmLead now use 商机: sidebar, breadcrumbs, list/detail, buttons/dialogs, empty states, Company 360, Contact 360, customer journeys, Workbench, Customer Operations, import/export labels and files, Audit presentation, and 数据看板 sales metrics. The new MarketingLead alone uses 线索. Internal `CrmLead`, `crm_leads`, and compatibility `/crm/leads` API paths remain unchanged.

## 24. Company Nurture Naming

Organization nurture functionality remains, but its UI name is 客户经营计划. This distinguishes proactive long-term account maintenance from the Marketing Lead `NURTURING` lifecycle. No business behavior or stored plan data was removed.

## 25. RBAC

The implementation adds `crm.marketing_lead.view/create/edit/assign/qualify/convert/delete/import/export`, `crm.marketing.activity.create`, `crm.marketing.score_rule.view/manage`, and `crm.marketing.analytics.view`.

SUPER_ADMIN has management authority. SALES operates only within existing data scope and may view, record behavior, accept SQL, recycle, qualify, and convert, but cannot manage scoring rules. VIEWER has read-only Marketing Lead and enabled-rule access and no marketing analytics or write controls. Conversion additionally validates the Organization, Contact, and Opportunity permissions required by the user's explicit choices.

## 26. Import

Marketing Lead XLSX import/export is integrated into the existing job framework, template/download UI, permission model, progress/result handling, and error reporting. Import includes the requested identity, phone/WhatsApp/WeChat, company, title, country, source/detail, inquiry, owner, Fit score, and note fields. Normalization and API/domain validation are reused. Activity, score, and status histories are never imported as fabricated historical evidence.

Existing Opportunity import/export remains available and now presents 商机 filenames/labels; direct imports retain `sourceMarketingLeadId = null`.

## 27. Audit

Create, update, soft delete, activity entry, lifecycle transition, scoring-rule management, and conversion append structured Audit records. Conversion Audit identifies the Marketing Lead and resulting Organization, Contact, Opportunity, actor, status change, and override condition. Status, score, and event tables preserve operational history independently of mutable display fields.

Marketing Lead journeys show detailed marketing activity. Contact and Organization journeys receive only business-significant MQL, SQL, Marketing Lead Converted, and Opportunity Created events where relationally relevant; low-level web activity is not copied into customer journeys.

## 28. Migration

Migration `20260907010000_marketing_lead_opportunity_conversion` is additive. It creates MarketingLead, scoring/activity/score/status tables, the source FK and uniqueness constraints, international/company master additions, permissions, and required indexes. It does not rename or drop `CrmLead`, reset/seed/truncate UAT, or modify Production.

The first UAT release applied migration 6 → 7. The hotfix release detected all seven migrations and correctly reported “No pending migrations to apply.” Before, preflight, after-migration, and after-activation counts for eight existing business tables were identical. The new schema exists with zero fabricated Marketing Lead records.

## 29. Automated Tests

Final deterministic gates passed:

- frontend lint: PASS;
- backend lint: PASS;
- frontend unit: 14/14 PASS;
- backend unit: 15/15 PASS;
- database integration: 32/32 PASS against a fresh MySQL database built from all seven migrations;
- field dictionary contract: PASS;
- production build: PASS.

Coverage includes CRUD, duplicate detection, international phone normalization, rule and activity behavior, repeat/cooldown, score history, MQL, SQL, recycle/disqualify/qualified transitions, preview/matching, serializable conversion, idempotency, rollback, permission boundaries, attribution, analytics, ownership regression, UI terminology, and existing Opportunity behavior. The Naderi / Dena path verifies original-inquiry initialization and the real source FK.

## 30. Browser Review

The built application passed a real browser run with 23 checks, zero console/page errors, zero unexpected network failures, and no page-level horizontal overflow. Evidence includes all 17 requested states at 1440×1000 and core screens at 1280×1000 and 1024×1000.

Browser QA found and fixed one P0 React Hook-order defect on list → detail navigation. A complete fresh rerun passed after the fix. The first run's strict-locator harness stop is retained separately and is not counted as a product failure. Full evidence and issue records are under `docs/qa-evidence-marketing-lead/`.

## 31. UAT Deployment

The final application commit `7f203799d9526b0ba50486db39913f4a10786f7d` is deployed at `https://www.gridworks.cn/crm_kivisense/` in the dedicated UAT stack. `/api/health` and `/api/ready` report application and database healthy/ready for Kivisense CRM 2.0 version `2.0.0-uat`.

Before the hotfix activation, App, DB, Attachments, and Nginx were backed up to `/srv/kivisense-crm-backups/20260907T080926Z-pre-marketing-7f203799d952`, with SHA-256 checksums preserved in the repository evidence. The first release also had its own pre-release backup at `/srv/kivisense-crm-backups/20260907T075823Z-pre-marketing-92b68b5cf55f`.

Artifact parity is PASS: expected commit equals remote commit, and nine local/HTTPS/runtime files have exact matching SHA-256 hashes. Read-only UAT browser checks for SUPER_ADMIN, SALES, and VIEWER passed with correct analytics/write visibility, 14 enabled behavior labels, no overflow, and no unexpected network/page errors. Production and Test backend container image IDs/start times remained byte-for-byte identical before, during, and after deployment.

## 32. Known Issues

No open P0/P1 defect blocks Marketing UAT.

- `MKT-UI-001`: detail-page Hook-order blank screen—fixed and browser regression PASS.
- `MKT-RBAC-002`: SALES request with `includeDisabled=false` was incorrectly coerced to true—fixed, integration regression PASS, deployed UAT retest PASS.
- Visitor tracking is not implemented by design and is clearly marked unavailable.
- Historical source-at-conversion snapshots, multi-touch attribution, and P1 web/technical tracking remain documented future scope; P0 current-source attribution is implemented and auditable.
- UAT was validated without writing business fixtures to the shared environment; the complete write/conversion scenario was exercised locally against a disposable MySQL database. Marketing UAT may now create representative UAT data through the product.

## 33. Final Verdict

The system can reliably answer every required business acceptance question:

| ID | Question | Implemented answer |
| --- | --- | --- |
| A | Who is this new Lead? | MarketingLead identity and international communication fields. |
| B | Where did it come from? | Source, channel, detail, and first-touch fields. |
| C | What original inquiry was submitted? | Immutable-in-practice `MarketingLead.inquiryContent`, retained after conversion. |
| D | What happened recently? | Ordered `LeadActivityEvent` and Marketing Lead journey. |
| E | Why is Engagement this score? | Rule reference, immutable delta snapshot, and `LeadScoreHistory`. |
| F | Why did it enter MQL? | Configured Fit/Engagement thresholds plus score/status histories. |
| G | When did sales accept SQL? | `sqlAt` and first `firstSalesResponseAt`, with actor/history/Audit. |
| H | When was it confirmed as a real opportunity? | `qualifiedAt` and QUALIFIED status history. |
| I | Which Company did it convert to? | `convertedOrganizationId` FK and link. |
| J | Which Contact did it convert to? | `convertedContactId` FK and link. |
| K | Which Opportunity did it convert to? | `convertedOpportunityId` plus reciprocal source relation. |
| L | What was the Opportunity's original Source? | `CrmLead.sourceMarketingLeadId` → MarketingLead current source under the documented P0 rule. |
| M | How long did Lead → Opportunity take? | `convertedAt - createdAt`, exposed by funnel/source analytics. |
| N | Which Source converts most effectively? | Source Quality count, rates, and average conversion time. |
| O | Are marketing and sales histories separate? | Yes: MarketingLead event/score/status histories are separate from Opportunity stages/followups/tasks. |

All required deterministic, database, built-browser, artifact-parity, role-based UAT, backup, health, migration, and protected-environment checks passed. The final verdict is:

**READY FOR MARKETING UAT**
