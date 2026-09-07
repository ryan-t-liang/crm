# Kivisense CRM 2.0 — Phase 3 Implementation Report

Date: 2026-09-08

Final verdict: **READY FOR HUMAN PRODUCT UAT**

Human review URL: <https://www.gridworks.cn/crm_kivisense/>

## 1. Release identity and safety boundary

| Item | Evidence |
| --- | --- |
| Current HEAD before implementation | `9acf2502231c0a2f407374a58b4090a61dd71b01` |
| Working branch | `codex/kivisense-crm-v2-v1-ui-rebuild` |
| Safety branch | `backup/kivisense-crm-before-product-ui-v4` |
| Main implementation commit | `0d28cef16b391c3f0bd17eabfbec194ec9721546` |
| Permission remediation commit | `082ef457138300cb05f6ce0123d41b10d3a5f732` |
| Deployed application commit | `82173ba7a39433cf8284ce4d8ca8eae9eb77b14d` |
| UAT image | `kivisense-crm-uat:82173ba7a394` / `sha256:f8a3625d686ab9d469cb095c51dda93ffae0ea1af15f5d41ea33d0b9b6f00a56` |
| Immutable release archive | `/srv/kivisense-crm-uat-releases/82173ba7a394.tar.gz` |
| Archive SHA-256 | `8f4de66a968cbaddd6e1147343e93ca34f47a5385754791c871f919c5d86eab2` |
| Pre-deployment backup | `/srv/kivisense-crm-backups/20260907T173853Z-pre-marketing-82173ba7a394` |

The implementation started from the live branch HEAD rather than an older chat-state assumption. Existing untracked BEFORE evidence in `artifacts/ui-audit/`, its ZIP archive, and its capture script were preserved and not overwritten. Production and the existing Test runtime were outside scope and were not changed.

## 2. Delivered product model

The ordinary product layer now has one unambiguous acquisition-to-sales flow:

`线索 → 自动评分 → 营销合格线索（MQL）→ 接受跟进 → 销售合格线索（SQL）→ 转为商机 → 成交 / 丢失`

- A new Marketing Lead is system-created as `NEW`; no initial-state selector or “开始孵化” action remains in ordinary UI.
- `NEW`, compatibility `NURTURING`, and `RECYCLED` records all accept activity scoring and automatic MQL evaluation.
- Users record business events, while scoring rules provide immutable Fit/Engagement delta snapshots.
- MQL acceptance is one human action. SQL conversion is one human action; no visible `QUALIFIED` confirmation step is required.
- Conversion stays transactional, retry-safe, idempotent, and does not fuzzy auto-merge Company or Contact records.
- Original Marketing Lead inquiry text remains source history. Opportunity requirement text may evolve without writing back to it.
- Opportunity is the sales aggregate. WON/LOST are the current sales endpoints; no Order, Contract, Invoice, Finance, Delivery, Procurement, or other premature ERP module was introduced.
- WON advances the linked Company lifecycle to CUSTOMER.
- Supplier remains a scoped `Organization + VENDOR` relationship, not a duplicate master.
- Legacy `CrmLead`, `/api/v1/crm/leads`, and `#leads` remain compatibility identifiers only; ordinary product language is 商机.

The current-system analysis is in [product-model-v4-audit.md](./product-model-v4-audit.md), and the binding language rules are in [domain-language-glossary.md](./domain-language-glossary.md).

## 3. Company, Contact and execution model

- Company now uses a centralized, searchable hierarchical industry taxonomy with custom fallback.
- Country uses ISO alpha-2 values; dependent state/province and city selectors retain custom-city fallback and preserve legacy free-text values.
- “公司角色” is presented as “业务关系”; customer lifecycle and customer relationship are safely synchronized without destructive history changes.
- Company logos use a uniform `object-contain` slot and preserve aspect ratio.
- Company Detail and Contact Detail expose copyable system IDs.
- Contact supports `BUSINESS` and `INDIVIDUAL`; existing records receive the additive safe default `BUSINESS`.
- Business Contact supports existing Company selection, quick Company creation, or an unconfirmed snapshot. Individual Contact does not require a Company.
- Legacy Contact stage remains available to compatibility imports/APIs but the ambiguous “CRM 状态” is removed from ordinary create/edit/detail/list UI.
- Company Smart Views replace the duplicated Customer Operations top-level module. Customer plans remain Company 360 context.
- My Workbench is a personal action center aggregating MQL acceptance, due/overdue/upcoming tasks, stale Opportunities, active Opportunities missing a next action, and eligible reconnect candidates.

## 4. Information architecture before / after

| Before | After |
| --- | --- |
| 客户运营 top-level module | Removed from navigation; capabilities moved to Company Smart Views, Company 360 and My Workbench |
| 客户运营 group contained My Workbench | 概览 contains 数据看板 and 我的工作台 |
| Five Dashboard tabs | Four business views: 管理概览, 营销与转化, 商机推进, 团队表现 |
| Separate 孵化与评分 tab | Compact scoring analysis inside 营销与转化 |
| Opportunity exposed through legacy Lead vocabulary | Ordinary UI consistently uses 商机, 商机阶段, 商机负责人 and 商机协作成员 |
| Contact generic CRM status | Compatibility-only persistence; Contact type is the explicit business distinction |
| Company free-text industry/address | Searchable hierarchical/dependent selectors with legacy/custom fallback |
| Mixed list control placement | Shared left search/filter and right import/export/columns/create toolbar pattern |
| No list selection workflow | Row checkbox, select page, selection action bar and Export Selected |
| Single ambiguous export action | Selected / filtered / all-current-permission scopes plus history, download and regeneration |
| Large generic record cards | Dense Record Header, highlights, Stage Path, compact sections, Timeline and system metadata |
| Company Files and Notes fragmentation | 资料 context |

The preserved BEFORE evidence is under `artifacts/ui-audit/`. The AFTER archive is under `artifacts/ui-refactor-v4-after/` and contains 15 screenshots at 1440, 1280 and 1024 widths.

## 5. Dashboard, lists, export and assignment

- Management Overview is limited to actionable, non-financial CRM measures.
- Marketing and conversion uses the `线索 → MQL → SQL → 商机` funnel with conversion rates and time measures.
- Opportunity pipeline includes stage summary, activity/risk measures, stale Opportunities and next-action coverage.
- Team Performance uses users/owners without inventing a Team entity. Marketing Lead ownership is `ownerUserId`; Opportunity ownership is `salesOwnerUserId` and is not incorrectly intersected with Company ownership.
- No revenue, amount, quote value, contract value, invoice or payment KPI is displayed.
- Company, Contact, Marketing Lead, Opportunity and Supplier use the same list-page interaction contract.
- Export jobs record scope/filter/requester/count/format/status/file/completion/expiry/error metadata. Downloaded XLSX contents and row counts were inspected.
- Assignment changes enqueue a transactional outbox event. Saving the same assignee does not enqueue a duplicate. SMTP failure updates the outbox but cannot roll back the CRM assignment.

## 6. Additive migrations

No historical table or column was dropped, renamed destructively, reset, truncated or reseeded.

| Migration | Purpose |
| --- | --- |
| `20260907160000_product_model_v4` | Contact type, structured Company taxonomy/location fields, export scope metadata and assignment-notification outbox |
| `20260907170000_core_delete_permissions` | Additively backfills Contact and Opportunity delete permissions for the existing SUPER_ADMIN and SALES roles |

UAT used `prisma migrate deploy`. The deployed database reports 9 completed, non-rolled-back migrations.

## 7. Verification results

The categories below are deliberately separate. A test is only marked PASS when its stated layer actually ran.

### 7.1 Unit test

- Frontend Vitest: **PASS — 15/15**.
- Backend unit test: **PASS — 17/17**.

### 7.2 API / integration test

- Database-backed integration suites: **PASS — 37/37**.
  - CRM core: 18/18.
  - Import/export: 10/10.
  - Marketing Lead → Opportunity and notification: 9/9.
- This was run with `RUN_DB_INTEGRATION_TESTS=true` against the dedicated local integration database; the default skipped mode is not counted as a pass.
- Frontend interaction contracts: **PASS**.
- Field dictionary contracts: **PASS — 31 Contact + 44 Opportunity-source headers**.
- Type/lint gates: **PASS**.
- Production frontend/backend build: **PASS**.

### 7.3 Local UI E2E write test

Evidence: `artifacts/ui-refactor-v4-after/results.json`

Run: `1788798302722`

Result: **PASS — 37 named checks, 26 browser-originated non-GET writes, 12 database evidence groups**.

Key creates, edits and transitions were initiated through the browser UI. The harness captured the actual HTTP response, queried persisted database state, reloaded the UI, and verified the post-reload result. It also downloaded and parsed real XLSX files.

### 7.4 Local UI visual regression

- **PASS — 15 screenshots**.
- Viewports: 1440×900, 1280×900 and 1024×900.
- Horizontal document overflow: **0** at all tested widths.
- Unexpected console errors: **0**.
- Unexpected network errors: **0**.
- SUPER_ADMIN mutation UI and VIEWER read-only UI were both captured.

### 7.5 UAT read-only smoke

Evidence: `artifacts/uat-v4/readonly/results.json`

Result: **PASS**.

- SUPER_ADMIN: four Dashboard views and all five object-list control sets verified.
- SALES: permission-scoped Dashboard and list controls verified.
- VIEWER: mutation controls hidden; no prohibited write occurred.
- 9 UAT screenshots, no horizontal document overflow at the 1440 viewport.
- Unexpected console errors: **0**.
- Unexpected network errors: **0**.

### 7.6 UAT write smoke

Evidence: `artifacts/uat-v4/latest-results.json` and `artifacts/uat-v4/run-1788802892886/`

Result: **PASS — 11 checks and 15 browser-originated non-GET writes**.

The controlled `UAT-V4-*` flow created and edited a Marketing Lead, changed its owner, recorded five real scoring activities, observed automatic MQL, accepted it as SQL in the SALES Workbench, converted SQL to Company + Contact + Opportunity, exported the selected row, downloaded and parsed the XLSX, and verified Export History. Browser result, HTTP response, database state and reloaded UI were checked. Unexpected console/network errors were 0.

Cleanup used the ordinary UI soft-delete actions. A final database query confirmed 0 active rows for the generated Marketing Lead, Opportunity, Contact and Company IDs.

### 7.7 RBAC test

- Backend permission authority: **PASS**.
- SUPER_ADMIN: **PASS**.
- SALES: **PASS**.
- VIEWER read-only behavior and hidden mutation controls: **PASS**.
- Contact and Opportunity delete permissions are migration-backed rather than seed-only.
- Import, export, batch assignment, conversion and Dashboard visibility remain permission-scoped; the UI does not substitute hard-coded role names for backend permission checks.

## 8. Required real UI write test matrix

| Required result | Status | Evidence level |
| --- | --- | --- |
| REAL UI WRITE TEST: Company Create | **PASS** | Local UI + HTTP + DB + reload |
| REAL UI WRITE TEST: Contact BUSINESS Create | **PASS** | Local UI + HTTP + DB + reload |
| REAL UI WRITE TEST: Contact INDIVIDUAL Create | **PASS** | Local UI + HTTP + DB + reload |
| REAL UI WRITE TEST: MarketingLead Create | **PASS** | Local and UAT UI + HTTP + DB + reload |
| REAL UI WRITE TEST: MarketingLead → MQL | **PASS** | Local and UAT UI activities + scoring history + DB + reload |
| REAL UI WRITE TEST: MQL → SQL | **PASS** | Local and UAT Workbench UI + HTTP + DB + reload |
| REAL UI WRITE TEST: SQL → Opportunity | **PASS** | Local and UAT conversion UI + HTTP + DB + reload |
| REAL UI WRITE TEST: Opportunity Stage | **PASS** | Local UI + HTTP + DB + reload; NEW/SOLUTION/LOST and WON checked |
| REAL UI WRITE TEST: Export Selected | **PASS** | Local and UAT UI + job DB + actual XLSX download/parse |
| REAL UI WRITE TEST: Export History | **PASS** | Local and UAT UI + DB + reload |
| REAL UI WRITE TEST: Assignment Notification | **PASS** | Local UI owner change + outbox DB; duplicate suppression; fake SMTP success/failure integration |

For the last row, “PASS” covers the assignment-notification product contract: transactional enqueue, asynchronous delivery handling, failure isolation and duplicate suppression. Delivery to a real UAT mailbox is separately **NOT TESTED**, because no explicit test mailbox configuration was supplied. The UAT outbox remained `PENDING`; this is not represented as a mailbox-delivery pass.

Additional local UI results include Company edit/taxonomy/location/logo/ID copy, Contact edit/company search/ID copy, Marketing Lead edit/activity/ID copy/no START_NURTURING, manual Opportunity create, attachment, follow-up, task, ID copy, LOST, WON with system date and Company CUSTOMER lifecycle, Export Filtered, Export All, Import preflight/execute, Supplier create/empty state/toolbar, Workbench aggregation and owner-correct Dashboard metrics.

## 9. Deployment and integrity evidence

Evidence: `artifacts/uat-v4/deployment/artifact-parity.json`

Result: **PASS**.

- `/api/health`: `ok`, database `ok`.
- `/api/ready`: `ready`, database `ok`.
- Deployed commit file equals `82173ba7a39433cf8284ce4d8ca8eae9eb77b14d`.
- 9 frontend runtime files are byte-identical across the local release, HTTPS response and running container.
- Immutable archive hash matches the uploaded archive.
- Backup integrity: application, database, attachments and Nginx archives all pass SHA-256 verification.
- Recorded legacy business-table counts are unchanged across backup, migration and activation.
- Protected Production/Test container image IDs and start timestamps are unchanged.

## 10. Known issues and explicit non-claims

1. **Real UAT mailbox delivery: NOT TESTED.** No explicit test mailbox/SMTP configuration was supplied. Transactional outbox creation, fake-transport success, failure persistence, retry state and duplicate suppression passed; UAT outbox delivery is pending.
2. **Host disk pressure.** The UAT host was at 97% filesystem use during final parity verification. A failed image-build cache was pruned without touching running images, databases, backups, Production or Test. Capacity should be monitored before a later release.
3. **Compatibility names remain internal.** `CrmLead`, `/api/v1/crm/leads`, `#leads`, historical Contact stage and legacy post-sales columns are intentionally retained to avoid a destructive migration. They are not new product concepts.
4. **Archive extraction metadata warning.** The macOS-created release archive may emit non-functional `LIBARCHIVE.xattr.com.apple.provenance` warnings on Linux extraction. Content hashes and runtime parity passed.

None of these items blocks human product UAT under the prompt's acceptance policy. Real corporate mailbox delivery must remain NOT TESTED until an explicitly authorized test mailbox configuration is available.

## 11. Human product UAT focus

Reviewers should use the deployed UAT URL and confirm the business experience, especially:

1. A new Lead naturally scores without “开始孵化”, becomes MQL automatically, needs one Sales acceptance, and converts from SQL in one action.
2. Opportunity language and Stage Path are unambiguous and contain no ordinary legacy Lead wording.
3. Company/Contact taxonomy, location, relationship/type, logo and copyable IDs feel understandable in real use.
4. Workbench answers “what should I do now”, while Dashboard answers “what is happening in the business”.
5. All five core lists have the same toolbar/selection/export behavior and Supplier says “暂无供应商”.
6. Dense record pages remain readable at 1440, 1280 and 1024 widths.

The resulting product follows the intended responsibility split: the system scores, recognizes, reminds, aggregates and preserves history; people judge, communicate, accept, advance, convert and close.
