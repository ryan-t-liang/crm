# Kivisense CRM shadcn UI Rebuild — Phase 1 Browser Evidence

Date: 2026-09-06

Environment: disposable local MySQL + local Fastify + local `/crm_kivisense/` reverse-proxy simulation

Deployment status: **NOT DEPLOYED — WAITING FOR UI REVIEW**

## Test cases

| ID | Case | Result | Evidence |
| --- | --- | --- | --- |
| UI-01 | Super Admin login and management Dashboard | PASS | Six KPIs, Pipeline, matrix, execution health, lifecycle, and team table loaded from existing APIs |
| UI-02 | Sales RBAC | PASS | Personal Overview shown; management owner filter, team table, and system-management navigation hidden |
| UI-03 | Viewer RBAC | PASS | Personal Overview shown; system-management navigation hidden; no Dashboard mutation control exposed |
| UI-04 | Sidebar navigation and legacy handoff | PASS | Matrix A1 opened the legacy company list with high Fit/high Engagement filters; legacy Dashboard returned to React `#dashboard` |
| UI-05 | Period filter | PASS | shadcn Select opened; custom period revealed start/end date inputs |
| UI-06 | Responsive 1440 / 1280 / 1024 | PASS | Document width equalled viewport width at all three sizes; no horizontal overflow |
| UI-07 | Sidebar collapsed state | PASS | Icon rail rendered at 1440 and the main content expanded without overflow |
| UI-08 | `/crm_kivisense/` base path | PASS | Root, React JS/CSS chunks, logo, legacy entry, login, session cookie, list APIs, and analytics APIs resolved through the prefix |
| UI-09 | Browser console and server responses | PASS | Browser console was empty; expected unauthenticated `/auth/me` returned 401 before login; tested static/auth/business requests returned 200/304 after login; no 404/500 observed |

## Ordered screenshots

1. [Dashboard — 1440](01-dashboard-1440.png)
2. [Dashboard — 1280](02-dashboard-1280.png)
3. [Dashboard — 1024](03-dashboard-1024.png)
4. [Dashboard — sidebar collapsed at 1440](04-dashboard-sidebar-collapsed-1440.png)
5. [Dashboard — explicit `/crm_kivisense/` base-path run at 1280](05-dashboard-basepath-1280.png)

## Issue classification

- Functional defects found: none.
- Design-consistency defects found: none in the Phase 1 App Shell and Dashboard scope.
- Deferred coverage: unconverted CRM pages continue to use the preserved legacy entry and are intentionally outside Phase 1 visual migration.
- Admin-to-frontend product mapping: not applicable to this CRM Dashboard-only slice; no SKU/product publishing flow exists in scope.
- UAT verification: not run because the phase stop rule prohibits deployment before UI review.
