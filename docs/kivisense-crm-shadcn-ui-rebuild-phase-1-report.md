# Kivisense CRM shadcn UI Rebuild — Phase 1 Report

Report date: 2026-09-06

Baseline: `b2d51b5b3372978de540f8ee046b7a9336755963`

Branch: `codex/kivisense-crm-v2-v1-ui-rebuild`

## 1. Documents Integrated

- Copied the supplied UI task specification to `docs/CODEX_UI_REBUILD_PROMPT.md`.
- Copied the supplied design system to `docs/DESIGN_SYSTEM.md`.
- Updated `AGENTS.md` so business rules, visual rules, and the active rebuild task resolve to the requested source-of-truth documents.
- Created pure-documentation commit `f18d7a9` before implementation.
- Created recovery branch `backup/kivisense-crm-v2-before-shadcn-ui` at baseline `b2d51b5`.

## 2. Frontend Architecture Audit

- Completed [ui-rebuild-architecture-audit.md](ui-rebuild-architecture-audit.md) before writing implementation code.
- Selected an incremental React SPA + Vite migration. Next.js was rejected because this authenticated internal SPA has no SSR/SEO requirement and must retain the existing Fastify runtime, same-origin cookie session, static hosting, and hash routing.
- Measured high legacy coupling: 67 `innerHTML` assignments, 426 ID-helper calls, 174 direct event bindings, and 60 RBAC annotations.
- Phase 1 therefore migrates only App Shell and Dashboard. Unconverted routes remain on the preserved `/legacy/` entry.
- No schema, migration, seed, API, attachment, RBAC, KPI, scoring, lifecycle, nurture, task, or reactivation business logic changed.

## 3. shadcn Foundation

- Added the `frontend-react` Vite workspace with React 19, TypeScript, Tailwind CSS 4, Lucide, TanStack Table, and Recharts.
- Installed actual shadcn registry source for Button, Card, Sidebar, Breadcrumb, Select, Dropdown Menu, Tooltip, Separator, Table, Badge, Avatar, Skeleton, Sheet, Input, Chart, and Alert.
- Implemented Kivisense tokens from `DESIGN_SYSTEM.md`: neutral surfaces, restrained emerald accent, border-first cards, 8px controls, 10px cards, and minimal shadow.
- Vite emits relative assets and stable `app.js` / `app.css` entry names; chunks are split across React, shadcn, table, and charts.
- Foundation follows the official [shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite) and uses the composition pattern documented by [dashboard-01](https://ui.shadcn.com/blocks#dashboard-01).

## 4. App Shell

- Implemented `SidebarProvider`, `AppSidebar`, `SidebarInset`, persistent expand/collapse, logo, grouped navigation, counts, role-sensitive navigation, top header, breadcrumb, identity menu, loading skeleton, and retry Alert.
- Existing backend remains the authentication and authorization authority.
- React checks `/api/v1/auth/me`; unauthenticated and forced-password flows hand off to the preserved legacy UI.
- Unconverted routes use base-path-aware `/legacy/#...` links. Legacy Dashboard navigation returns to the React `#dashboard` route.

## 5. Dashboard

- Rebuilt Dashboard in the requested information order: header and filters; six frozen KPI cards; Pipeline chart; Fit × Engagement and Execution Health/Lifecycle; management-only Team Execution table.
- Uses the existing management/self, matrix, and team analytics APIs without recalculation or renamed business meaning.
- Contains no financial metrics. A response guard rejects forbidden financial keys.
- Matrix cells hand off to the corresponding legacy company pool with Fit/Engagement filters preserved.
- Team Execution is implemented with TanStack Table.

## 6. Business Regression

- Source build: PASS (`npm run build`).
- TypeScript lint: PASS (`npm run lint`).
- React tests: 7/7 PASS.
- Backend unit tests: 15/15 PASS.
- Fresh disposable-database integrations after all six migrations and seed: 22/22 PASS.
- Legacy frontend interaction contracts: PASS.
- Field dictionary contracts: PASS (31 Contact + 44 Lead headers).
- Browser RBAC: Super Admin, Sales, and Viewer PASS.
- `/crm_kivisense/` browser simulation: static assets, legacy handoff, login cookie, list APIs, and analytics APIs PASS; console empty; no 404/500; no horizontal overflow.

One earlier integration attempt used the browser fixture database and produced a denominator mismatch from extra fixture companies. A fresh database eliminated the contamination and the full 22/22 suite passed; no product-code change was made for that result.

## 7. Screenshots

All captures use a 900px viewport height and real data from a disposable local database.

1. [Dashboard — 1440](qa-evidence-shadcn-phase1/01-dashboard-1440.png)
2. [Dashboard — 1280](qa-evidence-shadcn-phase1/02-dashboard-1280.png)
3. [Dashboard — 1024](qa-evidence-shadcn-phase1/03-dashboard-1024.png)
4. [Dashboard — sidebar collapsed at 1440](qa-evidence-shadcn-phase1/04-dashboard-sidebar-collapsed-1440.png)
5. [Dashboard — `/crm_kivisense/` prefix at 1280](qa-evidence-shadcn-phase1/05-dashboard-basepath-1280.png)

Detailed cases and classifications are in [phase-1-browser-evidence.md](qa-evidence-shadcn-phase1/phase-1-browser-evidence.md) and [issues.md](qa-evidence-shadcn-phase1/issues.md).

## 8. Known Issues

- Only App Shell and Dashboard are migrated by design. Company, Contact, Lead, Supplier, Operations, Workbench, account, role, audit, form, and attachment screens remain on the preserved legacy entry.
- The Dockerfile build was attempted twice but Docker Desktop timed out while resolving `node:22-bookworm-slim` metadata from Docker Hub, before any Dockerfile instruction ran. This is an external registry constraint, not a source build failure. The container build remains a mandatory pre-deployment rerun.
- UAT visual behavior is not claimed in this phase because deployment is intentionally prohibited until review.

## 9. Deployment

**NOT DEPLOYED — WAITING FOR UI REVIEW**

No UAT or Production runtime, database, migration state, seed data, Nginx configuration, or attachment storage was changed.

## 10. Verdict

**READY FOR UI REVIEW**

Phase 1 meets the App Shell, Dashboard, business-regression, RBAC, responsive, and `/crm_kivisense/` browser gates. UI review may begin from the recorded screenshots and source branch. Deployment must remain blocked until review approval and a successful Docker image build.
