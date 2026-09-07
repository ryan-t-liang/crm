# Marketing KPI Dictionary

This dictionary is the calculation contract for `GET /api/v1/crm/marketing/analytics/*`. All time-based reports use a created-lead cohort: a lead belongs to a report when `MarketingLead.createdAt` is within the inclusive `[from, to]` interval and `deletedAt IS NULL`. Later lifecycle events count only when their timestamp is not later than `to`.

Common filters:

- `from`, `to`: timezone-aware inclusive cohort boundary. Defaults to the 30 days ending now.
- `ownerUserId`: `MarketingLead.ownerUserId`. SALES users are always constrained to their own data scope.
- `source`: `MarketingLead.source`.
- Soft-deleted leads are excluded. Converted leads remain in the cohort.
- Percentages are `0` when the denominator is zero. Durations are `null` when no qualifying records exist and are rounded to one decimal hour.

## Funnel KPIs

| KPI | Definition | Numerator | Denominator | Timestamp basis | Source tables | Edge cases |
| --- | --- | --- | --- | --- | --- | --- |
| Visitor | Website visitors before lead creation | Not calculated | Not calculated | Not available | None | Returned as `visitorTracking=false` with “未接入网站访客追踪”; no visitor count is fabricated. |
| Lead | Marketing leads created in the cohort | Cohort lead count | Not applicable | `MarketingLead.createdAt` | `marketing_leads` | Includes every lifecycle status, including converted and disqualified, unless soft-deleted. |
| New Leads | Same measure as Lead for the selected cohort | Cohort lead count | Not applicable | `MarketingLead.createdAt` | `marketing_leads` | The word “new” refers to creation during the period, not current `NEW` status. |
| MQL Count | Cohort leads that reached MQL by report end | Leads with `mqlAt <= to` | Not applicable | `MarketingLead.mqlAt` | `marketing_leads` | A recycled or converted lead still counts if it previously reached MQL. |
| MQL Rate | Share of cohort leads that reached MQL | MQL Count | Lead count | `createdAt`, `mqlAt` | `marketing_leads` | Zero denominator returns 0%. |
| MQL to SQL Rate | Share of MQL leads that reached SQL | Leads with `sqlAt <= to` | MQL Count | `mqlAt`, `sqlAt` | `marketing_leads` | SQL records without `mqlAt` count in the numerator but make a data-quality anomaly visible through numerator/denominator values. |
| SQL to Opportunity Rate | Share of SQL leads converted to an opportunity | Leads with `convertedAt <= to` and non-null `convertedOpportunityId` | SQL Count | `sqlAt`, `convertedAt` | `marketing_leads`, `crm_leads` through FK | Conversion without an opportunity FK is not counted. |
| Lead to Opportunity Rate | Share of the cohort converted to an opportunity | Opportunity Count | Lead count | `createdAt`, `convertedAt` | `marketing_leads`, `crm_leads` through FK | Zero denominator returns 0%. |
| Avg Lead to MQL Time | Mean hours from lead creation to first MQL | Sum of `mqlAt-createdAt` for MQL leads | MQL leads with `mqlAt` | `createdAt`, `mqlAt` | `marketing_leads` | Negative durations are clamped to zero; no records returns `null`. |
| Avg MQL to SQL Time | Mean hours from MQL to SQL | Sum of `sqlAt-mqlAt` | SQL leads with both timestamps | `mqlAt`, `sqlAt` | `marketing_leads` | SQL records without `mqlAt` are excluded; no records returns `null`. |
| Avg Lead to Opportunity Time | Mean hours from lead creation to conversion | Sum of `convertedAt-createdAt` | Converted leads with an opportunity FK | `createdAt`, `convertedAt` | `marketing_leads`, `crm_leads` through FK | No conversions returns `null`. |
| MQL Response Time | Mean hours from MQL to first sales acceptance | Sum of `firstSalesResponseAt-mqlAt` | Leads with both timestamps and response by `to` | `mqlAt`, `firstSalesResponseAt` | `marketing_leads` | `firstSalesResponseAt` is first set on Accept SQL and is never overwritten; no qualifying records returns `null`. |

## Scoring and Nurture KPIs

All measures below use the same created-lead cohort. “Active” excludes current `CONVERTED` and `DISQUALIFIED` statuses.

| KPI | Definition | Numerator | Denominator | Timestamp basis | Source tables | Edge cases |
| --- | --- | --- | --- | --- | --- | --- |
| Active Leads | Cohort leads still eligible for marketing or sales work | Active lead count | Not applicable | Current status at query time | `marketing_leads` | Soft-deleted, converted and disqualified leads are excluded. |
| MQL | Active leads currently in MQL | Active records with status `MQL` | Not applicable | Current status | `marketing_leads` | Leads that reached MQL but later changed status are not current MQL. |
| Hot / Warm / Cold Leads | Operational temperature derived from Fit and Engagement | Active count per configured deterministic temperature class | Active Leads for contextual display | Current cached scores | `marketing_leads` | Not a sum of Fit and Engagement; the API exposes separate scores and levels. |
| High-score Untouched | High Fit or Engagement leads with no recent activity | Active leads where either score is at least 70 and `lastActivityAt` is absent or older than the configured boundary | Active Leads for contextual display | `lastActivityAt`, report `to` | `marketing_leads` | Boundary uses `CRM_HIGH_FIT_UNTOUCHED_DAYS`; a never-touched lead qualifies. |
| Recycled Leads | Active leads currently returned to marketing nurture | Active records with status `RECYCLED` | Not applicable | Current status | `marketing_leads` | Historical recycle events are not counted if the lead later changes status. |
| Score Distribution | 3x3 matrix of independent Fit and Engagement levels | Active count in each Fit/Engagement bucket | Active Leads for contextual display | Current cached scores | `marketing_leads` | LOW 0-39, MEDIUM 40-69, HIGH 70-100. |
| Top Scoring Signals | Most frequent activity signal types in the cohort | Activity count and immutable delta snapshot sums by `eventType` | Not applicable | Activity `occurredAt <= to`; lead cohort by creation | `lead_activity_events`, `marketing_leads` | Rule edits do not rewrite event snapshots. Top 10 only; activities after `to` are excluded. |

## Lead Source Quality

One row is returned per `MarketingLead.source` in the selected cohort.

| Metric | Definition | Numerator | Denominator | Timestamp basis | Source tables | Edge cases |
| --- | --- | --- | --- | --- | --- | --- |
| Lead Count | Cohort size for a source | Leads for source | Not applicable | `createdAt` | `marketing_leads` | Sources with zero cohort leads do not produce a row. |
| MQL | Leads for the source that reached MQL | Leads with `mqlAt <= to` | Not applicable | `mqlAt` | `marketing_leads` | Historical achievement is retained across later statuses. |
| MQL Rate | Source conversion to MQL | Source MQL Count | Source Lead Count | `createdAt`, `mqlAt` | `marketing_leads` | Zero denominator returns 0%. |
| SQL | Leads for the source that reached SQL | Leads with `sqlAt <= to` | Not applicable | `sqlAt` | `marketing_leads` | Historical achievement is retained across later statuses. |
| SQL Rate | Source conversion to SQL | Source SQL Count | Source Lead Count | `createdAt`, `sqlAt` | `marketing_leads` | This is Lead-to-SQL, not MQL-to-SQL. |
| Opportunity Count | Leads for the source converted to an opportunity | Converted leads with non-null opportunity FK | Not applicable | `convertedAt` | `marketing_leads`, `crm_leads` through FK | No monetary fields are used. |
| Lead to Opportunity Rate | Source conversion to opportunity | Source Opportunity Count | Source Lead Count | `createdAt`, `convertedAt` | `marketing_leads`, `crm_leads` through FK | Zero denominator returns 0%. |
| Avg Conversion Time | Mean hours from lead creation to opportunity conversion for a source | Sum of `convertedAt-createdAt` | Source converted leads | `createdAt`, `convertedAt` | `marketing_leads`, `crm_leads` through FK | No conversions returns `null`; negative durations are clamped to zero. |

## Attribution rule

Opportunity attribution is resolved through the immutable relational link `CrmLead.sourceMarketingLeadId`. The report groups a conversion by the Marketing Lead's current `source`. Source changes are audited but this P0 model does not keep a separate source-history table, so historical reports can change when an authorized user corrects the lead source. This limitation is explicit and no marketing fields, score histories or web metadata are copied onto the opportunity.
