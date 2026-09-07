# Marketing Lead → Opportunity Conversion Contract

## Domain boundary

- `MarketingLead` / 线索 owns acquisition identity snapshots, original inquiry, source, scoring, marketing lifecycle, and conversion attribution.
- `Organization` / 公司 owns the company master.
- `Contact` / 联系人 owns the person master and live contact details.
- `CrmLead` / 商机 owns the qualified sales opportunity and remains the internal Prisma/table name.

The conversion creates or resolves the company and contact, then creates exactly one opportunity linked by the real foreign key `CrmLead.sourceMarketingLeadId`. It never renames or destructively migrates the existing `crm_leads` table.

## Command

`POST /api/v1/crm/marketing-leads/:id/convert` is the only supported conversion command. The browser must not emulate conversion with separate company, contact, opportunity, and lead-update requests.

The request explicitly chooses:

- company: an existing record, a new record, or no company;
- contact: an existing record or a new record;
- opportunity: summary, owner, priority, initial stage, requirement detail, and optional conversion note.

Normal conversion requires `QUALIFIED`. Only `SUPER_ADMIN` may send `overrideQualification=true`; the override is recorded in status history and Audit.

## Backend matching and confirmation

`GET /api/v1/crm/marketing-leads/:id/conversion-preview` returns the lead summary, suggested company matches, suggested contact matches, and an opportunity draft.

Company precedence is normalized domain exact, normalized name exact, then a name-similar warning. Contact precedence is Email exact, normalized phone exact, normalized WhatsApp exact, WeChat exact, then name/company warnings. Every candidate has `autoMerge=false`; the user must confirm a choice.

## Transaction and idempotency

Conversion executes in one serializable database transaction:

1. validate data scope, permission, lifecycle state, and assignees;
2. resolve or create the Organization;
3. resolve or create the Contact;
4. create the `CrmLead` Opportunity with `sourceMarketingLeadId`;
5. update the Marketing Lead to `CONVERTED` with all converted entity IDs, actor, and timestamp;
6. append stage/status histories and conversion Audit;
7. commit.

Any failure rolls back every write. Unique constraints on both sides of the attribution relationship prevent one Marketing Lead from creating multiple converted opportunities. A repeated command returns the already-created IDs with `idempotent=true`.

## Ownership and copied fields

`inquiryContent` initializes `CrmLead.requirementDetail`; later opportunity edits do not mutate the original inquiry. The conversion may also initialize requirement context, product interest, and requirement tags because they describe the qualified project.

The opportunity does not copy contact name, Email, phone, company name, company website, UTM, IP, User Agent, Fit score, Engagement score, marketing lifecycle, or marketing activity. Live person and company data comes through Contact and Organization relations. Marketing history remains on Marketing Lead and its event/history tables.

## Attribution rule

P0 source-quality analytics group a converted opportunity by the Marketing Lead's current `source`. A permitted `SUPER_ADMIN` source correction therefore changes current-source attribution and is audited. Historical source-at-conversion snapshots and multi-touch attribution are deferred; they must be added as separate immutable attribution records rather than copied into `CrmLead`.

## Read-only behavior

Converted Marketing Leads remain visible and retain their complete marketing history. SALES users cannot edit, delete, add activity, or transition them. `SUPER_ADMIN` may make an audited correction to the lead master, but cannot create a second opportunity from it.

## Required permissions

- `crm.marketing_lead.view/create/edit/assign/qualify/convert/delete`
- `crm.marketing.activity.create`
- `crm.marketing.score_rule.view/manage`
- `crm.marketing.analytics.view`
- existing company, contact, and opportunity permissions required by the selected conversion choices

## Deferred tracking

UTM, landing page, referrer, visitor/session IDs, IP, User Agent, browser language, timezone, device, full Campaign, and full Consent models are deferred. No `rawMetadataJson` catch-all is stored on `MarketingLead`.
