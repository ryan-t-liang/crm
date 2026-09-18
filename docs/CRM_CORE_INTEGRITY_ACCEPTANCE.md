# CRM Core Integrity Fix V1 — Acceptance

## Baseline and scope

- Verification date: 2026-09-18, Asia/Shanghai.
- Task: the complete supplied Core Integrity Fix V1, attachment `c6bea890-ef00-49de-85fe-0db0e41c8209/pasted-text.txt`.
- Branch: `codex/kivisense-product-prototype`.
- Base commit: `a9f979b19872d4e41099e6630cc46c258d26482b`.
- Initial tracked worktree was clean. The existing untracked `artifacts/` QA archive was preserved, not staged, deleted or overwritten. New QA runs use timestamped directories and isolated browser storage.
- Read the repository instructions, design system, prototype architecture, current Sales/Member stores, routes, Dashboard/Management, field mapping and all four tables in the original Sowind SQL before implementation.
- SQL SHA-256, before and after implementation: `757ef1d2b038cfc982e9a23a646fa36d274f8f89c1715a6a39152e1ddd3701a9`.
- Frontend-only incremental changes. No backend, database, SQL, seeded product data, dependency, CSS foundation, money field or Opportunity change. Marketing production source/state machines and Dashboard three-view IA are unchanged.

## Implementation self-check

Status: PASSED implementation self-check. Final unit/provider tests, Typecheck, project lint, build and all six final-build browser suites passed. Independent post-handoff review remains pending; this is not release approval.

### P1

1. Lead conversion validates live actor/scope, QUALIFIED state, empty forward link, absent existing reverse Deal, owner and relations; persists all four invariants atomically. A consistent repeat returns the same Deal without another activity/write. Corrupted links are refused, not repaired. CONVERTED is absent from ordinary edit choices and cannot be undone by an ordinary edit.
2. Shared storage reading/writing preserves exact damaged/unknown-version/structurally invalid raw values, blocks silent demo replacement, preserves valid older raw formatting and missing timestamps, checks intervening edits, and publishes memory only after a successful save. Failed storage access/quota is an explicit recovery state, not successful persistence.
3. Sales and Member actions check the live actor independently of UI controls. Distributor writes stay in their own scope; Viewer/unknown roles are read-only. Reset requires HQ and explicit page/topbar confirmation, rechecks the actor, and touches only its own namespace. Notes whitelist title/body so runtime extra fields cannot move a record to another scope.
4. HQ can create an independent SQL-field Purchase Intent snapshot through the lightweight form. Unique same-brand phone matches link a valid user; no/multiple matches keep user_id=NULL; ambiguity returns a warning without a fabricated HQ error. No Sales record, member or group is created/merged. New/edited intent has_watch cannot be NULL; historical NULL loads unchanged and can be explicitly corrected to 0/1/2.

### P2

1. One assignable-owner function serves Lead list/detail/conversion and Task controls; owner belongs to the record distributor, even for HQ. Task distributor follows its relation at creation and is fixed thereafter.
2. Probability is stage-derived: DISCOVERY20 / SOLUTION40 / QUOTATION60 / NEGOTIATION75 / WON100 / LOST0. WON/LOST cannot reopen or change terminal outcome through ordinary editing. Load does not silently repair old probability; explicit valid writes recompute it.
3. Dashboard/Management share authorized confirmed-conversion, outcome, ratio and win-rate functions. Exact unique bidirectional relationships are required across the complete authorized collection. Management is current stock; Dashboard retains created-in-period cohorts. Win rate is WON/(WON+LOST), zero denominator is `—`.
4. The shared member matcher reads user_profile.tel/tel_country_code through sowind-read first. Explicit SQL NULL never falls back; only absent original fields allow legacy read-only aliases. Country/phone normalization is comparison-only, brand and is_deleted=0 are required, and ambiguous IDs/profiles are not resolved by selecting a first record.

## Verification gates

| Gate | Actual result |
| --- | --- |
| Typecheck | PASS — `./node_modules/.bin/tsc -b frontend-react/tsconfig.json --pretty false` |
| Lint | PASS — `npm run lint`; the existing project lint is TypeScript build checking, not an additional ESLint gate |
| Tests | PASS — `npm run test`: 14 files, 340 passed, 0 failed, 0 skipped, 0 todo |
| New tests | 170, compared with the unchanged 170 baseline tests: Sales82, Member41, shared metrics16, storage/lifecycle27, date formatting4 |
| Machine-readable tests | PASS — `npm --workspace frontend-react run test -- --reporter=json --outputFile=../artifacts/prototype-qa/core-integrity-gates.B23OD0/vitest-final.json`; 340/340, no skipped tests |
| Build | PASS — `npm run build`; 3477 modules. Existing lottie-web direct-eval and >500kB chunk warnings remain, without disabling warnings |
| Served artifact | Local preview app.js exactly matches final dist SHA-256 `3e7bb6cb829b0d78d505618f3081b39c08190462229f9bf987724cc34b54a5dd` |
| Browser | PASS — six final-build suites, 79/79 check groups, 155 screenshots; 0 console/page errors, 0 failed responses/requests |
| Diff/scope | SQL hash unchanged; no dependency/CSS/mock/backend/domain changes. Final staged scope checked separately before commit |

The initial root test command forwarded JSON reporter flags incorrectly through the nested npm script: its tests still passed 340/340, but did not generate the JSON artifact. The corrected direct workspace command above was rerun successfully; no missing artifact is presented as evidence.

## Task scenario coverage

All rows below were exercised in real business-model tests and, where indicated, actual mounted React providers. Browser evidence is supplementary, not a replacement for direct action checks.

| Task cases | Verified invariant and evidence |
| --- | --- |
| 1 | QUALIFIED converts; crm-model + actual crm-store Provider |
| 2–3 | NEW/CONTACTED cannot convert; crm-model parameterized cases |
| 4–7 | A successful repeat cannot create another Deal, a corrupted converted record/forward link/existing reverse link is refused; crm-model + retained synchronous Provider callback |
| 8 | status/convertedDealId/sourceLeadId/distributorId all match; model, Provider and browser persisted-state assertions |
| 9–10 | Ordinary update cannot manufacture CONVERTED or undo it; model and browser read-only status/no editable choice |
| 11 | Valid Sales V1 and supported Member V2 load verbatim, missing dates remain absent; storage and mounted Provider tests. Member key suffix v1 is not schema version1 |
| 12–14 | Corrupt JSON/invalid shape/unknown version exact raw preserved, no automatic demo rewrite including StrictMode; pure storage + hook + Member Provider + browser reload |
| 15–16 | Explicit HQ reset recovers selected key only, Sales/Member/Marketing untouched counterparts; storage/Provider/browser assertions |
| 17–19 | Cross-distributor Lead update/Convert/Task blocked in business actions; model + live Provider |
| 20 | Viewer direct mutations/creation/reset rejected, not merely hidden buttons; model and both mounted Providers; isolated Viewer browser fixture |
| 21–22 | Distributor cannot reset Sales or Member, including retained HQ callbacks after actor switch; model + actual Providers |
| 23 | HQ resets allowed with page confirmation; Providers and browser confirmation/cancel/confirm, with other raw values unchanged |
| 24–26 | Zero/one/multiple phone candidates return NULL/correct user/NULL warning; member-integrity + Member Provider + browser creation |
| 27–29 | No cross-brand association, deleted/unknown-deletion users excluded, SQL profile phone wins over contradicting aliases; member-integrity + SQL-precedence browser fixture |
| 30 | Changing profile phone/has_watch leaves previous Intent snapshot untouched; member-integrity; Intent edit also leaves profiles unchanged |
| 31 | Creation appears at list/detail address and persists its own name/tel/SKU/source/time fields; member-integrity + Provider + browser form/detail |
| 32 | Narrowed brand context rejects out-of-brand creation; Store derives live HQ GP/UN access and rejects Distributor/Viewer, with no caller permission override; model + Providers |
| 33–35 | Shanghai options exclude Singapore/read-only owners, HQ cannot cross-assign; shared owner model + browser List/Detail option equality |
| 36–37 | Task owner/related record match fixed distributor; model + actual Provider + browser Task dropdown |
| 38–41 | All six stage probabilities, WON100/LOST0, terminal reopening/outcome switch refused, manual contradictory probability refused; model + Sales browser |
| 42–43 | Same population produces same Management/Dashboard confirmed result; missing reverse link, duplicate IDs/links, out-of-cohort conflicts excluded; shared metrics tests + Dashboard regression |
| 44–45 | WON/(WON+LOST), excluding open/unknown; zero denominator `—`, known zero numerator with nonzero denominator `0%`; shared metrics and Dashboard browser |

Additional checks: primary-ID collisions are refused instead of updating multiple scopes; quota failure commits neither memory nor storage; storage-policy access errors preserve data; another-tab events/intervening raw edits invalidate stale writes; missing Lead/Deal/Contact relation targets and invalid legacy date strings remain readable without rewriting original records; intent NULL new writes are refused in the model and actual Provider; Note runtime extra identity/scope fields are ignored.

## Browser execution and evidence

Target: local final build at `http://127.0.0.1:4174`. Real installed Chrome, headless, fresh isolated contexts, fictional fixtures. User browser/LocalStorage and remote deployment were not accessed or modified. CLI browser scenarios perform real forms/selects/dialogs/drag actions and assert final persisted records; fixture injection is only for otherwise unreachable damaged/legacy/read-only states.

| Suite | Final result | Local evidence directory |
| --- | --- | --- |
| Core Integrity | PASS — 11 groups, 36 screenshots | `artifacts/prototype-qa/2026-09-18T03-08-40.524Z-core-integrity` |
| Sales/general prototype | PASS — 27 groups, 31 screenshots | `artifacts/prototype-qa/2026-09-18T03-04-47.089Z-sales-regression` |
| Dashboard | PASS — 11 groups, 13 screenshots | `artifacts/prototype-qa/2026-09-18T03-04-47.088Z-dashboard-v1` |
| Marketing V2 | PASS — 18 groups, 26 screenshots | `artifacts/prototype-qa/2026-09-18T03-04-47.103Z-marketing-v2` |
| Marketing V2.1 | PASS — 7 groups, 16 screenshots | `artifacts/prototype-qa/2026-09-18T03-04-47.089Z-marketing-v21` |
| Marketing Final Acceptance | PASS — 5 groups, 33 screenshots | `artifacts/prototype-qa/2026-09-18T03-04-47.117Z-marketing-final` |

Core includes Lead → Qualified → Convert → persisted links → repeat blocked/count unchanged; Owner consistency; WON lock; HQ/Distributor/Viewer scopes; SQL phone matching and independent PI creation; corrupt Sales/Member reload and own-key confirmed reset; unknown versions; missing relations/legacy dates; all three Dashboard views at 1440×900, 1280×800 and 1024×768; and console/runtime/network checks. It also tests old intent NULL preserved before an explicit valid edit and no NULL choice on new SQL intents.

Sales covers 13 primary routes, create/convert, product/Add-on, Kanban, simulated email/comment/call/task/note/attachment, refresh and role scope. WON remains terminal; LOST is verified on a separate open Deal, not by weakening the terminal invariant. Dashboard covers exact filtered drilldowns, formula denominators, independent filters, legacy no-backfill, brand/group identity, HQ error classes, empty states and authorization. Marketing repeats Activity/booking/staff completion/Draw/Award/Code/Redemption/idempotence and V1 backup/version/reset scenarios; its original acceptance assertions remain in force. Existing Marketing suites additionally exercise 375/430 mobile surfaces; Core does not claim mobile coverage.

Ordered screenshots and Core `00-evidence.md`, `01-issues.md`, and each suite's results.json remain in the local archives. Initial failed harness runs are retained: wrong preview default port, outdated Semi accessible selectors, role-switch persistence timing and corrupt-fixture reload preconditions were corrected, then rerun. The newly added legacy-NULL browser case also required Semi's actual default accessible name/selector, waiting for its closing popup animation and then the exact final persisted has_watch=0 condition, rather than reading before its change callback completed. Those failed runs are not represented as passed. No business invariant was removed or relaxed to match product behavior. Final completed checks report no functional defect; touched-screen screenshots/overflow checks do not constitute a blanket design approval.

## Actual changed files (repo-relative)

```text
docs/CRM_CORE_INTEGRITY.md
docs/CRM_CORE_INTEGRITY_ACCEPTANCE.md
docs/DASHBOARD_METRICS.md
docs/PROTOTYPE_ARCHITECTURE.md
docs/SOWIND_MEMBER_FIELD_MAPPING.md
frontend-react/src/app/App.tsx
frontend-react/src/components/AppShell.tsx
frontend-react/src/features/channel/ManagementPages.tsx
frontend-react/src/features/communication/RecordTabs.tsx
frontend-react/src/features/customer/CustomerPages.tsx
frontend-react/src/features/dashboard/DashboardPage.tsx
frontend-react/src/features/dashboard/dashboard-model.ts
frontend-react/src/features/deals/DealsPage.tsx
frontend-react/src/features/leads/LeadsPage.tsx
frontend-react/src/features/member-operations/MemberOperationsPages.tsx
frontend-react/src/features/member-operations/member-model.ts
frontend-react/src/features/member-operations/sowind-read.ts
frontend-react/src/features/member-operations/member-integrity.test.ts
frontend-react/src/features/shared/sales-metrics.ts
frontend-react/src/features/shared/sales-metrics.test.ts
frontend-react/src/features/work/SettingsPage.tsx
frontend-react/src/features/work/TasksPage.tsx
frontend-react/src/stores/crm-model.ts
frontend-react/src/stores/crm-model.test.ts
frontend-react/src/stores/crm-store.tsx
frontend-react/src/stores/crm-store.test.tsx
frontend-react/src/stores/member-operations-store.tsx
frontend-react/src/stores/member-operations-store.test.tsx
frontend-react/src/stores/use-workspace-state.ts
frontend-react/src/stores/use-workspace-state.test.tsx
frontend-react/src/stores/workspace-storage.ts
frontend-react/src/stores/workspace-storage.test.ts
frontend-react/src/types/crm.ts
frontend-react/src/types/member-operations.ts
frontend-react/src/utils/format.ts
frontend-react/src/utils/format.test.ts
package.json
qa/core-integrity-browser-qa.mjs
qa/dashboard-browser-qa.mjs
qa/prototype-browser-qa.mjs
```

## Limits and follow-up decisions

- LocalStorage frontend prototype only. Demo actor switching is not login; frontend action guards are NOT backend authorization. Production must repeat checks server-side.
- A synchronous state reference and expected-raw/storage-event guard cover the tested browser cases; there is no production/distributed concurrency protection.
- No real HQ, WeChat, database, email, third-party services or live customer data were tested/called. Firefox/Safari and Core mobile scenarios were not run. No blanket visual redesign acceptance is claimed.
- Valid legacy data is not repaired automatically: missing dates stay unknown; conflicting conversion links stay pending verification; existing invalid intent NULL values remain visible until deliberate valid editing.
- Backend confirmation required for the agreed administrator phone auto-link rule versus SQL's “管理员创建时为空” comment. This is a recorded business-rule difference, not a claim of backend implementation.
- Undo Convert, Reopen Deal, new bulk imports and mini-program creation were deliberately not added. Any future creation entry must reuse the shared matcher. Dictionary/HQ cleanup policy remains subject to product/backend confirmation.
- Git handoff is an ordinary push of this branch only after gates complete; resulting commit/remote SHA are reported in the handoff, not embedded as a self-referential commit hash. No main write/merge/force-push, deployment or release is authorized here. Stop for independent review after handoff.
