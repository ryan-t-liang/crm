# Kivisense CRM 2.0 Journey & Form UX Refinement Report

## 1. Git Baseline

- Repository: `https://github.com/ryan-t-liang/crm.git`.
- Working branch: `codex/kivisense-crm-v2-v1-ui-rebuild`.
- Implementation base: `5381e7bc22f5fca6657dc80ce808cd44e5f5cbb3`.
- Backup branch: `backup/kivisense-crm-v2-before-journey-ux` at the same base commit.
- `main` remains at `ca877fe852bee4b6f3d23eb1df61efab71112215` and was not modified.
- Tag `Kivisense_CRM_v1` remains at `f5cc0ea7fb25f9c9d771ac5d19acc3966c0110da` and was not modified.

## 2. Domain Changes

- Contact is the Customer 360 master record.
- Lead is an opportunity associated to one immutable Contact.
- ContactFollowup and LeadFollowup are append-only business interactions.
- Lead current-state fields are read-only projections of the latest LeadFollowup.
- Customer Journey is a business-history read model, while Audit remains the system-operation record.
- Existing Contact 1:N Lead, RBAC, attachments, import/export and V1 visual structure were preserved.

## 3. Lead Current Snapshot

The Lead snapshot now consists of `latestProgress`, `lastFollowupAt`, `nextAction` and `nextFollowupAt`. These values are displayed prominently in Lead Detail but are absent from interactive create/edit payloads. Legacy import remains compatible with historical snapshot columns so existing files are not silently broken.

## 4. LeadFollowup Source of Truth

LeadFollowup adds `progress`, `nextAction` and `nextFollowupAt`. After an append, the service recalculates the actual latest interaction using `occurredAt`, `createdAt` and `id`; only that row may project progress/action/next-followup values onto Lead. A backdated entry updates history without rolling current snapshots backward.

## 5. Contact Customer 360

Contact Detail retains the V1 two-column layout and adds a four-item summary: active Leads, won Leads, most recent interaction and earliest next follow-up. Active counts exclude deleted, WON and LOST opportunities; the left column remains Contact/customer/system master data.

## 6. Customer Journey

The right-side tabs are Leads, Customer Journey, Notes and Audit. Journey offers All, Interaction, Lead and Milestone filters and orders events newest first. Deleted Leads remain clearly marked historical events but cannot be reopened as active opportunities.

## 7. Journey Event Sources

The aggregation endpoint combines Contact creation, ContactFollowup, Lead creation, LeadFollowup, audited Lead stage changes, WON/LOST milestones, contextual Lead attachments, Followup attachments and legacy Contact Meeting Minutes. The endpoint is `/api/v1/crm/contacts/:id/journey` and requires Contact view permission.

## 8. Contact Form IA

Contact edit uses three tabs: Basic Data, CRM Info and Notes. Validation badges identify errors per tab and automatically reveal the first invalid section. `nextFollowupAt` and Meeting Minutes are no longer editable master-data controls.

## 9. Lead Form IA

Lead edit uses exactly five tabs: Basic Information, Requirement Information, Solution & Quote, Team Collaboration and Milestones. Add Lead keeps the minimum required set—Contact, summary, stage, priority and sales owner—and supports Save & Continue Editing. Related Contact uses an accessible fuzzy-search combobox during creation and is immutable afterwards.

## 10. Attachment Context Pairing

- Requirement text ↔ `requirementFiles`.
- Image-requirement note ↔ `requirementImages`.
- Solution note ↔ `proposalFiles`.
- Quote note/amount/currency ↔ `quotationFiles`.
- Contact/Lead interaction content ↔ `followupAttachments`.

Followup attachments support validated images, videos and documents and render inside the corresponding timeline event.

## 11. Meeting Minutes Migration Strategy

No destructive conversion was run. Existing Contact `meetingMinutesFiles` records remain stored and appear in Customer Journey as “历史会议资料，未关联具体互动”. New meeting minutes are created as ContactFollowup content plus `followupAttachments`, establishing the correct interaction context going forward.

## 12. Soft Delete

Contact and Lead add `deletedAt` and `deletedByUserId`. Delete operations update those fields rather than removing rows, Followups, participants, attachments or files. Active list/detail/search/selectors/import duplicate matching/export and dashboard counts exclude deleted rows. Delete audit entries use `DELETE_CONTACT` and `DELETE_LEAD` with safe entity/id/actor/time metadata.

## 13. Contact Delete Protection

Contact deletion returns `CONTACT_HAS_ACTIVE_LEADS` with an active Lead count while any non-deleted Lead remains. The UI performs the same early guard and explains that associated opportunities must be deleted first. Once all Leads are soft-deleted, Contact deletion is permitted.

## 14. Database Migration

Migration `20260904190000_crm_journey_form_ux` contains only additive columns, indexes and foreign keys. It does not drop, rename, truncate or rewrite existing business data. Prisma validation passed and an isolated MySQL database reports all four migrations applied and up to date.

## 15. Field Dictionary Updates

[crm-2.0-field-dictionary.md](crm-2.0-field-dictionary.md) records the Followup-derived snapshot semantics, new `nextAction`, `imageRequirementNote`, `quotationNote`, followup attachment contracts, legacy Meeting Minutes behavior and UI placement. The canonical source coverage remains 31 Contact + 44 Lead headers.

## 16. Tests

| Gate | Result |
|---|---|
| Frontend syntax / interaction contracts | PASS — 102 assertions |
| Backend unit tests | PASS — 12 / 12 |
| MySQL core integration | PASS — 12 / 12 |
| MySQL import/export integration | PASS — 6 / 6 |
| TypeScript lint | PASS |
| Backend build | PASS |
| Prisma schema / migration status | PASS — 4 migrations up to date |
| Field dictionary | PASS — 31 Contact + 44 Lead headers |
| Browser checkpoints | PASS — 9 / 9 |
| `git diff --check` | PASS |

This provides at least 141 explicit checkpoints before counting compiler, build, Prisma and field-dictionary gates. Detailed evidence is in [crm-2.0-journey-form-ux-qa.md](crm-2.0-journey-form-ux-qa.md).

## 17. Browser Review

Actual browser flows covered Contact Journey, Contact three-tab edit, Add Contact Interaction, Lead Detail snapshot hierarchy, Lead five-tab edit, Add Lead Followup, Followup attachment timeline, Contact delete confirmation and Lead delete confirmation. The active-Lead Contact delete guard returned the expected message. Browser console result: 0 errors and 0 warnings.

## 18. Screenshots

Nine ordered 1440-wide screenshots are stored in [qa-evidence-journey](qa-evidence-journey/), with the exact state and dimensions recorded in [capture_manifest.csv](qa-evidence-journey/capture_manifest.csv).

## 19. Known Issues

No open local functional issue remains in the exercised scope. Two browser-review findings—initial navigation counts and deleted-Lead historical attachment download—were fixed and retested. UAT/browser behavior against the live deployment remains `NOT_RUN` because deployment is intentionally outside this review round.

## 20. Deployment Status

NOT DEPLOYED — WAITING FOR UI REVIEW

The existing UAT URL, Production, GitHub remote branch, `main` and the V1 tag were not changed during this round.

## 21. Verdict

READY FOR UI REVIEW
