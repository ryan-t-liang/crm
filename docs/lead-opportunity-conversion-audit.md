# Kivisense CRM 2.0 — Lead / Opportunity Conversion Current State Audit

**Audit date:** 2026-09-07

**Development branch:** `codex/kivisense-crm-v2-v1-ui-rebuild`

**Audited business-code baseline:** `cd95decd6e69a2d2a79dbf69e8db8ca40cfb88df`

**Repository HEAD at audit start:** `c78f7a7` (the business-code baseline plus QA documentation)

**Current readiness:** **BLOCKED for Marketing Lead → Opportunity conversion UAT**

## 1. Scope and method

This is a read-only current-state audit. It covers the Prisma schema and migrations, CRM Lead / Contact / Organization services and routes, import/export jobs, permissions, audit logs, customer journeys, analytics, the current React + shadcn UI, and retained legacy frontend assets.

The required `AGENTS.md`, `docs/kivisense-crm-maintainer.md`, and `docs/DESIGN_SYSTEM.md` were read before the audit. The following optional documents do not exist in the current repository:

- `docs/marketing-domain-model.md`
- `docs/marketing-kpi-dictionary.md`
- `docs/lead-scoring-rules.md`
- `docs/lead-conversion-contract.md`

No schema, migration, API, service, UI, permission, seed, or deployment file was changed as part of this audit.

## 2. Required audit answers

| Question | Current-state answer |
| --- | --- |
| Is there already a `MarketingLead`? | **No.** There is no Prisma model/table, migration, service, route, permission, UI type/page, import/export object, status history, activity model, score history, or conversion relation for `MarketingLead`. |
| Is the current `CrmLead` still displayed as “线索”? | **Yes.** Although its fields and lifecycle describe a sales opportunity, the active React UI, API errors, permissions, import/export templates, audit labels, journeys, analytics, and retained legacy UI all call it “线索”. |
| Which layers still use the old “线索” meaning? | **All existing CrmLead-facing layers.** The detailed inventory is in section 4. |
| Does the current Opportunity store duplicate Contact / Company fields? | **`CrmLead` itself does not persist `contactName`, `companyName`, `email`, or `phone` snapshots.** It owns a required `contactId` FK and reads person/company data through `Contact` and `Organization`. Export columns for those values are relation-derived. However, `Contact` still carries legacy-compatible company snapshots (`companyShortName`, `companyName`, `website`, `industry`, `country`, `city`, `region`) in addition to optional `organizationId`; these are **LEGACY_COMPATIBILITY**, not Opportunity-owned fields. `CrmLead.leadSource` is also an unstructured legacy Opportunity field whose meaning must not be mistaken for authoritative Marketing attribution. |
| What is missing from the conversion model? | **The complete conversion contract.** Missing pieces include the MarketingLead entity and histories, real conversion FKs, preview/matching APIs, one transactional and idempotent Convert command, converted-record rules, Marketing attribution, conversion journey events, conversion permissions, UI naming separation, and conversion analytics. |

## 3. Current domain model

### Organization

`Organization` is already the company master. It owns company name, normalized name, website/domain, industry, geography, ownership, roles, lifecycle, and fit data. `normalizedName` and `websiteDomain` are indexed and are useful foundations for explicit duplicate suggestions.

Gaps against the requested conversion contract:

- `country` is free text rather than an ISO 3166-1 alpha-2 `countryCode`.
- There is no `companySize` field.
- Existing duplicate-candidate behavior is not a Marketing Lead conversion preview contract.

### Contact

`Contact` is the person master and may optionally reference an `Organization`. It owns the live name, email, phone, WeChat, LinkedIn, title, and department values used by current Opportunity reads.

Gaps against the requested international-contact contract:

- There is no `whatsapp` field.
- The field is named `linkedin`, not `linkedinUrl`.
- `phone` is a free-form string; there is no persisted E.164 normalized value or country-code/local-number split.
- `contactName` is required, which is compatible with requiring a real name at conversion time, but no conversion UI currently collects a missing name.

### CrmLead (current sales Opportunity)

The current `CrmLead` has a required `contactId` FK and owns sales-pipeline data: requirement summary/detail, priority, `NEW → QUALIFIED → SOLUTION → QUOTATION → WON/LOST` status, owners and participants, sales progress, next action, classification, solution, proposal/quotation attachments, followups, tasks, milestones, quote, and won/closed dates.

This is functionally a sales **Opportunity**, despite the internal model/table and existing product copy using Lead/“线索”. Keeping the internal `CrmLead` model and `crm_leads` table is not a blocker; the user-visible name must later become “商机 / Opportunity”.

Current relationship behavior:

- `CrmLead.contactId` is required and `Contact.organizationId` is optional, so a company-less Opportunity is structurally possible through a company-less Contact.
- Contact and Organization values shown with a CrmLead are relation reads, not CrmLead snapshots.
- Direct Opportunity creation and import already work independently of a Marketing Lead; this path must remain valid with a future nullable `sourceMarketingLeadId`.
- The HTTP patch schema omits `contactId`, so an existing CrmLead cannot silently switch its person relation through the normal edit endpoint.

Missing Opportunity fields/relations required by the target contract include:

- nullable, real-FK `sourceMarketingLeadId` with a one-conversion uniqueness guarantee;
- explicit `requirementTags` and `productInterest`;
- a semantically explicit requirement context for `MarketingLead.inquiryType` when it is not equivalent to an existing project classification field.

## 4. Old “线索” semantic inventory

| Layer | Current implementation | Conversion-model impact |
| --- | --- | --- |
| Schema / internal types | `CrmLead`, `LeadFollowup`, `LeadStageHistory`, `LEAD` attachment entity type and `leadId` task relation represent the sales pipeline object. | Internal compatibility names may remain, but the new `MarketingLead` needs separate models/types and relations. |
| API | `/api/v1/crm/leads` is CRUD for the current sales object. Followups and attachments are also under `/crm/leads/:id/...`. Errors return “线索不存在/线索跟进不存在”. | Existing paths can remain compatibility endpoints, but product semantics and any new public contract must identify them as Opportunity. No `/marketing-leads`, preview, or convert endpoint exists. |
| Permissions / roles | `crm.lead.view/create/edit/delete/import/export` and `crm.lead_followup.*` are labeled “线索”. SALES/VIEWER role descriptions also use “线索”. | No `crm.marketing_lead.*` or `crm.marketing_lead.convert` authority exists; current permissions actually govern Opportunities. |
| React + shadcn UI | Sidebar, breadcrumb/title, list/detail, create/edit/delete dialogs, filters, Company 360, Contact 360, Customer Operations, Workbench relation text, empty states, journey links, dashboard cards, pipeline chart, import/export, and audit presentation use “线索”. | Two objects would be indistinguishable if MarketingLead were added without a complete naming pass. The current React UI remains the visual source of truth, but its CrmLead copy must become “商机”. |
| Retained legacy UI | `frontend/js/app.js`, `leads.js`, `contacts.js`, `crm-jobs.js`, `customer-operations.js`, and `field-definitions.js` also label CrmLead as “线索”. | These assets are semantic compatibility debt and must not reintroduce dual meanings even if they are not the primary rendered UI. |
| Import | Job object `CRM_LEAD`, route `/crm/imports/leads`, template `kivisense_crm_lead_import_template.xlsx`, worksheet “线索”, field label “线索状态”; direct import requires `contactId`. | This is an Opportunity import, not a Marketing Lead import. No Marketing Lead import exists. Direct Opportunity import should continue with `sourceMarketingLeadId = null`. |
| Export | Job object `CRM_LEAD`, `/crm/exports/leads`, filename `kivisense-crm-leads-*`, fields “线索编号” and “Leads 参与人员”. Contact exports contain “关联线索数量”. | These exports currently mean Opportunity. Person/company columns are joined at export time and are not duplicate CrmLead storage. |
| Audit | Actions/targets include `CREATE_CRM_LEAD`, `UPDATE_CRM_LEAD`, `DELETE_LEAD`, `CREATE_LEAD_FOLLOWUP`, `crm_lead`, and UI labels such as “创建线索”. | No `CONVERT_MARKETING_LEAD` event or conversion IDs/timestamp metadata exists. Existing actions should later display as Opportunity actions. |
| Contact / Company journey | Events are `LEAD_CREATED`, `LEAD_FOLLOWUP`, `LEAD_STAGE_CHANGED`, `LEAD_WON/LOST`, with titles such as “创建线索/线索跟进/线索成交”. | These are Opportunity lifecycle events. There is no high-level “Marketing Lead Converted” event and no links to both source Lead and Opportunity. |
| Analytics / dashboard | `activeLeads`, `newLeads`, `staleLeads`, pipeline, win rate, sales cycle, next-action coverage, and team active/stale lead metrics are all computed from `CrmLead`. | These are Opportunity KPIs and must display as 商机. There are no true Marketing Lead, MQL, SQL, Lead → Opportunity, conversion-time, or source-quality KPIs. |
| Scoring | Organization fit/engagement scoring exists; `nurtureConversion` infers that an Organization nurture preceded a CrmLead. | This is not Marketing Lead scoring or attribution. There is no Lead fit/engagement score history, MQL/SQL lifecycle, or FK-based source conversion calculation. |

## 5. Data ownership findings

### Already aligned

- Live person data is owned by `Contact` and read through the CrmLead relation.
- Live company-master data is owned by `Organization`; CrmLead reaches it through `Contact.organizationId`.
- CrmLead does not persist duplicate person/company snapshots.
- Sales requirement, progress, followup, task, file, stage, quote, and milestone data is owned by CrmLead.
- Current CrmLead create/update operations already use database transactions and append stage/audit records. These are reusable foundations, not a conversion implementation.

### Not yet representable

- Acquisition facts, original `inquiryContent`, inquiry type, source/channel/detail, UTM/referrer/landing-page data, technical metadata, consent, lead activity, score history, and MQL/SQL/Qualified history have no owner because `MarketingLead` does not exist.
- There is no immutable acquisition snapshot independent of future Contact/Organization changes.
- There is no relation proving which Marketing Lead created an Opportunity.
- `CrmLead.leadSource` is mutable free text. It cannot answer source attribution reliably and must not substitute for `sourceMarketingLeadId`.
- The current Opportunity relation summary does not select every Organization field (for example website); ownership is correct at schema level, but later Opportunity UI/API work must read the current Organization master where required.

## 6. Missing conversion contract by layer

1. **MarketingLead persistence** — entity fields, original inquiry preservation, company/person acquisition snapshots, lifecycle status including `CONVERTED`, owner, soft delete, activity, score history, MQL/SQL/Qualified history, consent, and future-compatible technical/acquisition metadata.
2. **Real relations** — nullable `CrmLead.sourceMarketingLeadId` plus MarketingLead `convertedOrganizationId`, `convertedContactId`, `convertedOpportunityId`, `convertedByUserId`, and `convertedAt`, all backed by FKs and appropriate indexes/unique constraints.
3. **Field ownership mapping** — explicit person → Contact, company → Organization, inquiry/requirement → Opportunity mappings and an explicit list of fields that stay only on MarketingLead. No current code enforces this boundary.
4. **Conversion preview** — no server-side duplicate/match preview exists for email, normalized international phone, WeChat/WhatsApp, normalized company domain, or exact normalized company name.
5. **Explicit match confirmation** — no shadcn Convert Dialog supports existing/create/none Organization and existing/create Contact choices, required Contact name correction, or editable Opportunity summary/draft.
6. **Single business command** — no `POST /api/v1/crm/marketing-leads/:id/convert` endpoint exists. There is no atomic Organization + Contact + Opportunity + Lead-history + audit transaction.
7. **Idempotency** — no Marketing Lead status guard, unique source relation, row-level serialization strategy, or retry response returning the already-created Opportunity.
8. **Converted-record policy** — no read-only enforcement, second-conversion prohibition, delete restriction, SUPER_ADMIN correction boundary, or behavior for a later soft-deleted Opportunity.
9. **Permissions** — no marketing-lead view/edit/delete/convert permissions or conditional checks for creating versus selecting Organization/Contact.
10. **Audit and journeys** — no `CONVERT_MARKETING_LEAD` metadata record and no conversion event on Marketing Lead, Contact, or Organization journeys.
11. **Attribution and analytics** — no FK-based source funnel, source quality, Lead → Opportunity rate, or created/qualified-to-converted duration calculation.
12. **UI naming separation** — current CrmLead copy has not been changed to 商机, and no Marketing Lead UI exists to own 线索.

## 7. Compatibility and migration constraints for the next phase

- Keep the internal `CrmLead` model and `crm_leads` table unless a separate cleanup is approved; renaming them is not required for correct product semantics.
- Use additive, non-destructive migrations. Do not reset, seed, truncate, or destructively remove compatibility fields in UAT.
- Add `sourceMarketingLeadId` as nullable so manually created/imported Opportunities remain valid.
- Treat the company fields retained on `Contact` as **LEGACY_COMPATIBILITY**. Do not copy them into CrmLead and do not destructively delete them in this phase.
- Treat `CrmLead.leadSource` as a legacy Opportunity-local field until a separate compatibility decision is made. Never use it as the authoritative Marketing source or copy Marketing UTM/technical/scoring fields into it.
- Preserve current Opportunity CRUD, followups, tasks, attachments, Company/Contact 360, Customer Operations, Workbench, dashboard, and Opportunity import/export behavior while separating product terminology.
- Implement conversion through one backend command; the browser must not orchestrate several independent create/update calls.

## 8. Current answers to the final acceptance questions

| Acceptance question | Current answer |
| --- | --- |
| Which Marketing Lead produced this Opportunity? | **Cannot answer.** No MarketingLead or source FK exists. |
| Where did that Lead originally come from? | **Cannot answer reliably.** Only mutable/free-text source fields on existing Contact/CrmLead are available. |
| What original inquiry did the customer submit? | **Cannot answer.** There is no immutable MarketingLead `inquiryContent`. |
| Does the original inquiry remain unchanged after conversion? | **Cannot guarantee.** There is no source Lead or conversion. |
| Is the latest email maintained by Contact? | **Yes for current CrmLead relation reads.** No email snapshot exists on CrmLead. |
| Is the latest company website maintained by Organization? | **Schema ownership is Organization, but current Opportunity relation output does not expose all Organization master fields.** No website snapshot exists on CrmLead. |
| Why are UTM, IP, user agent, and score history absent from Opportunity? | **The target ownership principle is valid, but it is not implemented because MarketingLead has no persistence.** |
| Does Lead → Opportunity attribution use a real FK? | **No.** |
| Can one Lead convert only once? | **No conversion invariant exists.** |
| Does a failed conversion roll back completely? | **No conversion transaction exists to test.** |

Because multiple mandatory acceptance answers are currently false or unanswerable, the conversion implementation is **BLOCKED** until the missing model, contract, transaction, permissions, attribution, UI semantics, and tests are implemented and verified.

## 9. Recommended implementation order after audit approval

1. Freeze the domain/field mapping in `docs/lead-conversion-contract.md`, including fields explicitly not copied.
2. Add MarketingLead persistence, histories, conversion FKs, nullable/unique Opportunity source relation, permissions, and additive migration.
3. Implement matching/preview and international normalization primitives with explicit user confirmation.
4. Implement the idempotent single-transaction conversion command and audit event.
5. Add the Convert Dialog, converted Lead/read-only state, Opportunity source block, and journey events using the current shadcn system.
6. Change every user-visible current-CrmLead label from 线索 to 商机 across the active UI and compatible surfaces.
7. Add Marketing Lead and conversion analytics based on real relations, then run mapping, rollback, permission, retry, ownership, analytics, and browser regression tests before any UAT deployment.

## 10. Audit change-control record

- Pre-change working tree: clean.
- Recovery branch created and pushed: `backup/kivisense-crm-v2-before-lead-conversion-model` at `c78f7a7`.
- `main`, Production, and tag `Kivisense_CRM_v1` were not modified.
- This document is the only planned repository change for the audit step.
