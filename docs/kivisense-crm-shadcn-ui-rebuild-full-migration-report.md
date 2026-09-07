# Kivisense CRM 2.0 shadcn UI Rebuild — Full Migration Report

Date: 2026-09-07. Phase 2: Full CRM Migration.

## 1. Git

Core CRM screens now share the approved Phase 1 React app shell. Company, Contact, Lead, Operations, Workbench, Suppliers, Accounts, Roles, Audit and authentication no longer send ordinary navigation to `/legacy/`. Domain models, write APIs, scoring, lifecycle automation, KPI and RBAC contracts remain unchanged. Additive server-side list filters support correct company-scoped selection and entity audit views.

Baseline: `e832b98c7f9ea684ff485bed1b6e8f0dfa4b6ac0`; working branch: `codex/kivisense-crm-v2-v1-ui-rebuild`. The clean baseline was fetched and protected by the pushed branch `backup/kivisense-crm-v2-before-full-shadcn-migration`. Neither `main` nor `Kivisense_CRM_v1` was changed.

Implementation commit: `cd95decd6e69a2d2a79dbf69e8db8ca40cfb88df`, pushed to GitHub and deployed as the immutable UAT image. Subsequent changes in this branch are QA evidence/report/test-harness updates only; deployed frontend and backend source remain identical to this commit.

## 2. UI Source of Truth

The user-reviewed **Phase 1 Dashboard is the UI reference**, together with `DESIGN_SYSTEM.md`. Its page implementation, typography, cards, charts and KPI definitions are unchanged. Matrix links now open React company filters instead of legacy. Company screenshots were compared with Dashboard before Contact/Lead work continued. Earlier V1 styling instructions do not supersede the user's Phase 2 direction.

## 3. Shared Component System

Existing SidebarProvider, SidebarInset, SiteHeader, Button, Input, Select, DropdownMenu and tokens are reused. Added registry-based shadcn Tabs, Dialog, AlertDialog, Popover, Command, Checkbox, Textarea and Label, using the existing `cn` utility. Shared CRM components provide page/entity headers, compact summaries, TanStack tables, filters, async entity comboboxes, forms, timeline, attachments and import/export jobs. Hash navigation preserves the shell; session bootstrap is not repeated on every route.

## 4. Companies

`#organizations`: logo/name, role, lifecycle, Fit/Engagement, owner, contact/lead counts, recent interaction and next action; search and three common filters; additional score/state/industry filters in a popover. Column visibility, pagination and named row actions share the table system. Creation, editing, duplicate warning, soft deletion and import/export retain their contracts.

## 5. Company 360

`#organizations/:id`: entity header, compact summary, overview/contact/lead/journey/task/file/note/audit tabs. Overview presents profile, score breakdown, recent history, operational state and next action. Create-contact and create-lead retain company context; company interactions select a contact. Files and logo use authenticated attachment endpoints, never a new storage system.

## 6. Contacts

`#contacts`: same list shell and table primitives, search/stage/owner filters plus company/source/followup refinements. Company filtering is enforced server-side. Create/edit/import/export/delete remain permission-gated. Deletion names the record and explains that active linked leads must be handled first; the backend preserves the existing protection and soft-delete behavior.

## 7. Contact 360

`#contacts/:id`: left person/company summary, right linked leads, customer journey, notes and audit. Stage, owner, recent interaction and next followup are visible; the latter two use the authoritative journey summary. No first-level Contact Followup tab was reintroduced. Long email and website values use a single-column sidebar to avoid cramped wrapping.

## 8. Leads

`#leads`: requirement, company, contact, stage, priority, sales owner, progress and next-action context, with server filters and paging. Async fuzzy contact selection searches name/company/email/phone and commits an ID from the dropdown; company context constrains the results. Named row deletion uses AlertDialog, not browser confirm.

## 9. Lead Detail

`#leads/:id`: identity and owner header; compact latest-progress/next-action/next-followup/last-communication panel. Requirements and commercial context are readable sections, with basic information, team and milestones alongside. Text and its corresponding files remain adjacent, not hidden in a disconnected attachment page.

## 10. Followup

Append-only creation remains unchanged. The form includes communication method, time, owner, content, progress, importance, next action/date and attachments. Timeline entries show method, actor, time, progress and next action. Creating an interaction from a current task passes its ID: server completion and next-task generation are verified as one business loop. No history-edit or history-delete UI was introduced.

## 11. Customer Operations

`#operations`: priority, nurture, reactivation and dormant views. Existing Fit/Engagement bands and dormant states drive the views; no new scoring algorithm. Priority is high Fit/high Engagement, reactivation is high Fit/dormant, and dormant uses the existing dormant state. Row actions open the shared interaction/task/nurture/lead forms.

## 12. Workbench

`#workbench`: compact overdue/today/next-seven-days/high-priority summary and actionable task queue. Default owner is the current user; authorized team filters retain their scope. Complete, postpone one day and followup operate on existing task APIs. Counts use server totals with the existing date boundaries, not invented KPIs.

## 13. Tasks

Company, Contact and Lead targets share one task dialog and one queue component. Owner and priority are explicit; related entities link back to React details. SALES actions require ownership as well as permission. SUPER_ADMIN can manage other owners' tasks only with the applicable permission. Followup can close the current task and create the next; completion and postponement refresh the queue.

## 14. Nurture

Shared dialog preserves reason, objective, cadence, next topic/date, owner and status. Nurture list and company next-action context use the existing plan/task APIs. No automated outreach, new scheduler or altered nurture lifecycle was added.

## 15. Suppliers

`#suppliers` (with `#vendors` compatibility alias) uses the Company table filtered to supplier role and opens Company 360. This is a reusable view configuration, not a duplicate vendor model.

## 16. Accounts

`#accounts`: search/status/pagination, create and edit dialogs, enable/disable and reset-password confirmations. Roles come from the existing API. Self-disable is not offered. Local browser tests verify account state persistence and first-login password change following reset.

## 17. Roles

`#roles`: role summary and grouped permission dialog. System roles remain read-only; editable roles submit the existing permission contract. Browser verification saves SALES with the same permission set, testing persistence without changing the policy. No new permission keys or role semantics.

## 18. Audit

`#audit`: module/action filters, extra actor/target/date filters, pagination and detail dialog. Detail-page audit calls use additive `targetId` filtering on the server, not an incomplete client-filtered page. Audit remains append-only.

## 19. Forms

Contact has 3 tabs, Lead 5 tabs, Company 3 tabs. State remains mounted across tab changes; a single stable footer saves the complete payload. Client validation selects the first invalid tab; Lead/Contact also map server field details. Free-text dictionary values remain supported in comboboxes. Save IDs are retained when an attachment fails, so retry does not create a second business record. Unassigned owners remain unassigned when editing.

## 20. Attachments

Documents, images and videos use existing type/signature/size checks and authenticated URLs. File rows show name, type icon or image thumbnail, size, uploader and time, with preview/download/removal by permission. Drag/drop and file input are supported. Empty attachment blocks are compact. The download control explicitly downloads, and browser tests verify exact bytes for text, PNG and a real MediaRecorder WebM. Company Logo and company file uploads are also verified.

## 21. Import / Export

Organization, Contact and Lead support actual XLSX templates, upload/preflight, confirmation, execution, history/results and export downloads. Browser checks parse exported workbooks and assert the imported record is present. Exports explicitly cover permission-visible data; they do not claim to export the currently filtered list. Existing attachment URL/import warnings remain in the job result.

## 22. Legacy Migration Status

| Surface | Status | Normal entry |
| --- | --- | --- |
| Dashboard | MIGRATED — Phase 1 retained | `#dashboard` |
| Companies / Company 360 | MIGRATED | `#organizations[/id]` |
| Contacts / Contact 360 | MIGRATED | `#contacts[/id]` |
| Leads / Lead Detail | MIGRATED | `#leads[/id]` |
| Operations / Nurture | MIGRATED | `#operations` and shared dialogs |
| Workbench / Tasks | MIGRATED | `#workbench` and shared dialogs |
| Suppliers | MIGRATED | `#suppliers` |
| Accounts / Roles / Audit | MIGRATED | `#accounts`, `#roles`, `#audit` |
| Login / password change | MIGRATED | React session guard / `#security` |
| Explicit `/legacy/` URL | LEGACY FALLBACK | Retained only for rollback compatibility |

No core page has an automatic legacy handoff. Pure field-definition metadata is reused from the existing dictionary, not legacy page code or CSS. Legacy removal is intentionally deferred for a later, separately authorized cleanup.

## 23. Design Consistency Audit

Neutral borders/backgrounds dominate; emerald marks primary actions and selected navigation, not every metric. Shared button heights, radii, section spacing, tabs, table hover, dialogs and empty/loading/error patterns are consistent. Dense tables scroll inside their own container and keep row actions accessible; body horizontal overflow is not used to accommodate tables. Contact sidebar wrapping and large attachment empty states were corrected during visual review. Dashboard itself was not restyled.

## 24. RBAC

SUPER_ADMIN, SALES and VIEWER were exercised in separate local sessions. VIEWER has no visible create/edit/delete/import/export/task/followup/nurture/account actions; SALES has business navigation but no administration and no mutation controls for another owner's task. Server RBAC remains the authority. Existing backend integration tests include viewer rejections and cross-owner task checks; new filters have positive/negative company scope and audit permission tests.

## 25. Automated Tests

Latest local gates: production build PASS; TypeScript lint PASS; frontend 14/14 PASS plus legacy syntax/interaction contracts PASS; backend 38/38 PASS (15 CRM integration, 8 import/export integration, 15 unit); field dictionary PASS (31 Contact + 44 Lead source headers); Prisma generate and validate PASS. The databases `kivisense_phase2_qa` and `kivisense_phase2_regression` are disposable local databases. Existing schema migrations and seed were applied **only there**, never during UAT release. Command results are recorded in `qa-evidence-shadcn-phase2/automated-gates.json`.

New regression coverage checks all React route families, query sentinel omission, task ownership/permissions, error redaction, JSON POST headers, empty-body DELETE behavior, company-scoped Contact/Lead lookup and entity audit filters.

## 26. Browser Tests

Real installed Chrome, Playwright, actual built React assets and local Fastify/MySQL were used, not mocked screenshots. Suites and per-check outputs are under `scripts/phase2-*.mjs` and `docs/qa-evidence-shadcn-phase2/`. Create/edit/tab-state/association/next-action persistence, imports/exports, file bytes, deletion and account changes are checked against real API/UI state. Session tests distinguish expected unauthenticated `/auth/me` 401 from unexpected errors.

Six local browser suites pass **103 checks**, with zero unexpected console/network failures. These counts include screenshot/layout assertions and should not be confused with the separate 52 frontend/backend unit/integration tests. [Step-by-step browser evidence](qa-evidence-shadcn-phase2/evidence.md), [suite summary](qa-evidence-shadcn-phase2/suite-summary.json), [issue log](qa-evidence-shadcn-phase2/issues.md).

The original fast back-to-back runs hit the unchanged 180-request/minute server limit. Those were not counted as PASS; suites were spaced and rerun. Historical failed captures are retained under `resolved/` with the issue log. This is functional/visual UAT coverage, not a load test or exhaustive security assessment.

## 27. Responsive

1440, 1280 and 1024 px widths were measured for Dashboard; Company, Contact, Lead and Supplier lists; Company/Contact/Lead details; Operations, Workbench, Accounts, Roles and Audit. Body/document widths stay within viewport. Tables intentionally retain local horizontal scrolling and optional columns. Forms have bounded scrolling content and stable action footers. Mobile redesign was not added to this desktop phase.

## 28. Screenshots

Ordered actual screenshots, result JSON, a manifest and step-by-step evidence document are kept in `docs/qa-evidence-shadcn-phase2/`. Key groups: 01 Dashboard; 02–08 Company; 09–10 Contact; 11–16 Lead/Journey; 17–22 Operations/Tasks/Suppliers; 23–29 authentication/admin/RBAC; 30–34 imports/attachments/deletion; 35–36 Company form/files; 37 responsive matrix. Screenshots were taken after transitions settled, then representative pages and dialogs were visually inspected.

There are **77 current local screenshots**, excluding archived failures; the separate `uat/` directory contains real HTTPS post-deployment screenshots. [Screenshot manifest](qa-evidence-shadcn-phase2/screenshot-manifest.json) includes dimensions, hashes and source-case URLs.

## 29. UAT Deployment

Deployed [Kivisense CRM UAT](https://www.gridworks.cn/crm_kivisense/#dashboard) on 2026-09-07 at 12:38 Asia/Shanghai. Code: `cd95decd6e69a2d2a79dbf69e8db8ca40cfb88df`; image `kivisense-crm-uat:cd95decd6e69`; container image digest `sha256:3224852b6beb4237e45c5ca05d17100960d304504605057b2bd56db8bcf46c3f`. Runtime `/srv/kivisense-crm-uat`, Docker service `kivisense-crm-uat-backend-1`, loopback port 3202. Git archive SHA-256: `acafbf0dc5b9b87c62715cd0ab1807e9b15e11f0bffc12deea31faadc3906458`.

Backup: `/srv/kivisense-crm-backups/20260907T043400Z-pre-cd95decd6e69`. Application, database dump, attachment tree and Nginx archives all passed compression and SHA-256 checks. Node 22 Docker build and port 3203 preflight passed before UAT was recreated. Temporary preflight container was stopped automatically; the previous image `kivisense-crm-uat:e832b98c7f9e` remains available for rollback.

Health is `ready/database=ok`. Ten entry/legacy/build files have matching local, container and HTTPS SHA-256 values: [artifact parity](qa-evidence-shadcn-phase2/uat/artifact-parity.json). Business counts before/after are identical: 2 Companies, 2 Contacts, 2 Leads, 1 Contact Followup, 1 Lead Followup, 0 Tasks, 0 Attachments, 0 Nurture plans, 6 migration rows. **No migration, seed or reset was run on UAT.**

Nginx archive comparison passed; existing duplicate `gridworks.cn` server-name warning remains unchanged. Attachment tree contents match the backup byte-for-byte; only tracked `.gitkeep` mtimes changed during archive extraction. Production on 3200 and test on 3201 retain their exact image IDs and start times; neither was deployed or restarted. The host has about 3 GB free after building; no unrelated images/caches were pruned.

Post-deployment real Chrome verification: **27/27 PASS** across SUPER_ADMIN, SALES and VIEWER, including all permitted navigation, persistent shell, Company/Contact/Lead detail refresh and hidden VIEWER mutation controls. Zero unexpected console/network errors and zero attempted business writes. Only login/session/audit metadata changed as a normal consequence of authentication; no business fixtures were created online. [UAT browser results](qa-evidence-shadcn-phase2/uat/results.json).

For rollback, restore the backed-up UAT app/config and recreate only its backend using the retained previous image. Do not roll back the database for this UI-only release.

## 30. Known Issues

No unresolved P0/P1 product defect in completed local suites. Non-blocking constraints: legacy compatibility code remains; no advanced saved-view engine; exhaustive file-extension permutations, load testing and new human Phase 2 visual acceptance are outside this automated pass. The existing server has limited free disk space; future image retention should be managed separately, without deleting unrelated workloads. See the issue/evidence documents for resolved defects and exact tested cases.

## 31. Final Verdict

READY FOR FULL UI UAT

All requested core modules are migrated, local regression and live deployment checks pass, and recoverable UAT backups are retained. This means ready for the user's full Phase 2 acceptance review; it does not claim that the user has already visually approved Phase 2.
