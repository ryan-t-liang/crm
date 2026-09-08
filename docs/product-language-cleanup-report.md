# Kivisense CRM 2.0 — Product Language and V1 Visual Cleanup Report

Date: 2026-09-08

Implementation commit: `4724c08e05b682e833542a8458f9691339e54edc`

Verdict: **READY FOR HUMAN UI REVIEW**

## Scope and counts

- Source review covered 15 product areas: application shell, Dashboard, Company, Contact, Marketing Lead, Opportunity, Workbench, Supplier, customer operations, scoring rules, accounts, roles, audit, import/export and shared error handling.
- Browser review covered the 7 override-required core routes plus the Marketing Lead create-form channel state at 1440 × 900.
- 12 confirmed raw-English product occurrences were corrected: `Contact 360` (1), `Phone` (8), `LinkedIn URL` (1), `Win Rate` (1) and `Pipeline` (1).
- 9 raw-enum or direct-code presentation paths were closed: Audit action filter, unknown Opportunity stage, generated event title, generated event summary, unknown source channel and four legacy dictionary fallbacks.
- 0 incorrect legacy Lead-as-Opportunity labels required replacement in the current main React pages. The review confirmed that Opportunity remains 商机 and that only the valid relationship labels 来源线索 / 查看原始线索 retain 线索.
- Repeated generic owner labels were replaced with object-specific terms such as 公司负责人、联系人负责人、线索负责人、商机负责人、任务负责人 and 跟进负责人.

## Product-language result

The centralized product dictionary now covers Marketing Lead source/channel/status, Opportunity stage, priority, Company lifecycle/business relation, Contact type, score/engagement state, Audit action/module/target and import/export object/status/scope. Persistence codes, API contracts and historical data were not changed.

The following approved names and abbreviations remain where they are meaningful: Kivisense, CRM, MQL, SQL, ID, URL, Email, WhatsApp, WeChat, LinkedIn, PDF and XLSX. API/HTTP and rule/event codes remain only in clearly identified administrator or technical contexts. `CrmLead` and enum keys remain internal implementation language.

Static guardrail: `node scripts/audit-product-language.mjs` — **PASS, 0 findings**.

## V1 visual-language result

The current React architecture and product structure now use the richer V1 visual vocabulary from `frontend/styles/production.css`: warm neutral canvas, white section surfaces, stronger borders and restrained shadows, dark mature sidebar, Emerald active/current states, serif display headings, grouped form areas, clearer tables and semantic status/accent colors. Legacy page code, routes, navigation and the old Lead/Opportunity model were not restored.

Shared work focused on `index.css`, application navigation/header, CRM primitives, data tables, forms, timeline, status/stage presentation and Dashboard cards/charts. The existing Company / Contact / Marketing Lead / Opportunity information architecture, Dashboard four-view model, Workbench, Customer Operations, import/export, assignment email, RBAC and persistence semantics remain unchanged.

## Verification

- Frontend production build: **PASS**.
- Backend build/typecheck: **PASS earlier in this round; backend source unchanged**.
- Static product-language audit: **PASS, 0 findings**.
- Local core-page smoke: Dashboard OPEN; Company OPEN; Contact OPEN; Marketing Lead OPEN; Opportunity OPEN; Workbench OPEN; Supplier OPEN.
- Local browser runtime: 0 console errors, 0 failed application requests, 0 business writes.
- Changed interaction: Marketing Lead create-form presentation and source-channel dropdown **PASS**. Save behavior was intentionally not submitted because this is a language/visual-only round.
- Existing functional business flows: **NOT RETESTED IN THIS LANGUAGE-ONLY ROUND**.

## Screenshots and UAT

The final UAT archive will contain 8 screenshots at 1440 × 900: Dashboard, Company list, Contact list, Marketing Lead list, Opportunity list, Workbench, Supplier list and Marketing Lead create-form source-channel options. Deployment-specific hashes and the exact deployed commit are recorded in `artifacts/product-language-audit/uat-smoke-results.json` after UAT activation.

## Known limitations

- The static scanner is deliberately curated rather than a blanket English-word ban; administrator technical detail remains available where it is operationally necessary.
- This round does not claim write-flow, email-delivery, responsive-matrix or full regression coverage.
- Human UAT remains the acceptance gate for visual richness, hierarchy and terminology preference.
