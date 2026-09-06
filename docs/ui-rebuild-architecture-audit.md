# Kivisense CRM 2.0 Frontend Architecture Audit

Status: COMPLETE — approved implementation direction for Phase 1  
Audited baseline: `b2d51b5b3372978de540f8ee046b7a9336755963`  
Audit date: 2026-09-06  
Scope: frontend architecture only; no CRM domain, database, API, RBAC, KPI, scoring, journey, task, nurture, lifecycle, or reactivation change

## Executive decision

Use an incremental **React SPA + Vite** migration with Tailwind CSS, shadcn/ui, Lucide, TanStack Table, and Recharts.

Do not introduce Next.js. The application is an authenticated internal SPA served by an existing Fastify process, has no server-rendering or public SEO requirement, and already depends on same-origin cookies and APIs. Next.js would add a second server/runtime and routing layer without solving a current product requirement.

The first migration slice contains only the new App Shell and Dashboard. Existing pages remain available from a preserved legacy entry until their replacement pages have passed build, automated, browser, RBAC, base-path, and responsive gates.

## 1. Current frontend entry

- `frontend/index.html` is the only document entry.
- It contains the complete static shell, SVG sprite, navigation, all view mount nodes, account/security drawers, login UI, confirmation dialog, and toast.
- `frontend/js/app.js` is the module entry and initializes Contacts, Leads, Followups, import/export, Customer Operations, Dashboard, Workbench, Supplier, Accounts, Roles, and Audit.
- Fastify serves `frontend/` with `@fastify/static`; non-API misses fall back to `index.html`.
- There is no frontend compilation step and no current React, Vite, Tailwind, shadcn/ui, Lucide, or TanStack dependency.

## 2. Routing

- Routing is a custom hash router in `frontend/js/app.js`.
- Supported route families include `dashboard`, `organizations[/id]`, `contacts[/id]`, `leads[/id]`, `operations`, `workbench`, `vendors`, `accounts`, `roles`, and `audit`.
- Navigation mutates `location.hash`; a global `hashchange` listener selects the corresponding DOM view and calls its loader.
- Hash routing is important to the current Nginx deployment because the server receives only the document path, not the client-side route.

## 3. Authentication and session handling

- The backend owns authentication. `/api/v1/auth/login`, `/me`, `/logout`, and `/change-password` are unchanged migration boundaries.
- The browser uses the HTTP-only `kivisense_crm_sid` cookie with `credentials: "same-origin"`.
- Cookie path is driven by backend `APP_BASE_PATH`, which is `/crm_kivisense` in UAT.
- The existing login, forced-password-change, personal settings, and logout flows are DOM-controlled in `frontend/js/app.js`.
- Phase 1 must reuse this backend contract. Login itself remains a later migration phase.

## 4. API client

- `frontend/js/api.js` derives the external base path from its own module URL and prefixes all API and attachment paths.
- It centralizes JSON headers, same-origin credentials, typed error details, authentication events, date conversion, friendly error copy, and busy-button state.
- Feature modules call this client directly and render the response through string templates.
- The React migration needs an equivalent thin adapter, not a new backend-for-frontend and not changed endpoint contracts.

## 5. RBAC UI

- Backend guards remain authoritative.
- Frontend visibility is annotation-based: `data-crm-permission` and `data-crm-any-permission` are hidden after `/api/v1/auth/me` resolves.
- Route permission checks and the role-sensitive default route live in `frontend/js/app.js`.
- The current frontend has 60 permission annotations. React navigation must filter items from the same permission list and must never replace backend enforcement.

## 6. List pages

- Contact, Lead, Company, Supplier, Customer Operations, and task views are imperative render functions.
- Lists write large HTML strings into known nodes, then query their descendants to bind events.
- Pagination, filters, row actions, import/export, permission visibility, empty/error/loading states, and list counts are page-local rather than shared components.
- There is no shared DataTable abstraction. TanStack Table should be introduced when the list-page phase begins, not by prematurely rewriting the current lists in Phase 1.

## 7. Detail pages and forms

- Contact, Lead, and Organization details use the same render-then-bind pattern.
- Contact and Lead forms preserve the required 3-tab and 5-tab business information architecture.
- Long-lived module state, current entity state, temporary attachment state, dialog nodes, and DOM IDs are coupled.
- Existing detail/form pages must remain intact until shared React `EntityHeader`, `DetailTabs`, form sections, timeline, metadata, and attachment components are ready and independently verified.

## 8. Attachment UI

- Attachments are authenticated and entity-scoped; download URLs are constructed through the current base-path-aware helper.
- Contact meeting-minutes, Lead contextual attachments, Followup attachments, Organization files, and Organization logo have different allowed fields and backend rules.
- File inputs, upload sequencing, deletion, and attachment rendering are page-specific.
- Phase 1 does not migrate or change attachment behavior.

## 9. Dashboard

- `frontend/js/customer-operations.js` renders Dashboard filters, six KPIs, Fit × Engagement, Pipeline, execution-health metrics, lifecycle distribution, and management-only team execution.
- It calls the existing non-financial analytics APIs for management/self scope, matrix, and team data.
- KPI definitions are backend-owned and frozen. A React Dashboard may only recompose these response fields; it must not recalculate or rename their business meaning.

## 10. Existing CSS

- `frontend/styles/production.css` is one 1,198-line global stylesheet with approximately 938 class-selector declarations.
- It styles the shell, all pages, data management, forms, dialogs, responsive behavior, Customer Operations, and Dashboard.
- CSS selectors and markup class names are tightly coupled. A page-local CSS replacement risks breaking unrelated legacy screens.
- The React slice therefore uses scoped Tailwind/shadcn tokens and its own root. Legacy CSS remains loaded only by the preserved legacy entry.

## 11. Measured DOM/UI coupling

- 67 direct `innerHTML` assignments.
- 426 ID lookup call sites through the `$()` helper.
- 174 direct event-listener bindings.
- Six direct hash-routing references.
- 60 RBAC annotations in markup/templates.

This confirms that a whole-system JSX conversion in one change would be a high-risk rewrite. Component boundaries must be introduced one vertical slice at a time.

## 12. Build and deployment pipeline

- Root npm currently delegates build, lint, and tests to the Fastify backend and adds static frontend contract scripts.
- `backend/Dockerfile` installs the root/backend workspace, generates Prisma, compiles TypeScript, then copies `frontend/` unchanged into the runtime image.
- The React workspace must build before the runtime image copies `frontend/`.
- Generated assets must remain in the static frontend root and must use relative asset URLs so both `/` locally and `/crm_kivisense/` remotely work.

## 13. Docker

- The runtime remains one Fastify container plus MySQL.
- React does not require a second runtime container.
- Docker should compile the Vite workspace in the existing build stage, then copy only built static assets together with the preserved legacy entry.
- No database image, volume, migration, seed, environment, or backend process topology change is needed.

## 14. `/crm_kivisense/` base path and Nginx

- Nginx redirects `/crm_kivisense` to `/crm_kivisense/` and strips the prefix when proxying to Fastify.
- Backend APIs remain registered under `/api/...` internally.
- `APP_BASE_PATH=/crm_kivisense` controls the session-cookie path.
- Vite must emit relative asset paths (`base: "./"`). The React API adapter must infer `/crm_kivisense` from the current document path and keep same-origin credentials.
- Nginx configuration does not need to change.

## 15. Safe React migration answer

### A. What is the current frontend structure?

A native HTML/CSS/ES-module SPA with a custom hash router, imperative string-template rendering, direct DOM event binding, a same-origin API helper, and Fastify static hosting.

### B. Which business logic is strongly coupled to DOM/UI?

Route dispatch, RBAC visibility, selected filters/tabs, entity form state, attachment staging, modal lifecycle, table row actions, followup actions, and list refresh behavior are all coupled to DOM IDs and render-generated selectors. Backend domain logic is not coupled and can remain unchanged.

### C. Can it migrate safely to React?

Yes, through vertical slices. It is not safe as a Big Bang rewrite. The App Shell + Dashboard is the lowest-risk first slice because Dashboard is read-only, its APIs are already aggregated, and it does not own attachment or mutation workflows.

### D. React SPA, Next.js, or another approach?

Choose React SPA + Vite. It matches the existing independent frontend/Fastify backend, preserves static hosting and hash routing, produces no new server runtime, and supports the required shadcn/ui stack. Do not use Next.js for this system unless a future requirement introduces SSR, server components, public SEO, or a separately operated web tier.

### E. How does it remain compatible with Fastify?

Fastify continues to serve static files and every existing API. React uses the same JSON endpoints, HTTP-only cookie, CSRF origin checks, multipart endpoints, and authenticated attachment URLs. No backend API contract changes are needed.

### F. How is `/crm_kivisense/` preserved?

Use relative Vite assets, a base-path-aware API adapter, hash routes, and the existing Fastify/Nginx arrangement. Add automated assertions for generated asset URLs and browser checks for HTML, JS, CSS, API, logo, and attachment paths.

### G. How are hash routes kept or migrated?

Keep hashes during the incremental migration. The React root owns `#dashboard`; all unconverted routes are handed to the preserved legacy entry. Convert route families one by one later. A history-router migration is unnecessary and would create avoidable Nginx and refresh risk.

### H. How are UAT data and backend APIs kept unchanged?

Phase 1 changes no Prisma schema, migration, seed, service, route, analytics definition, permissions, or UAT runtime. Validation uses a disposable local database/browser fixture. Deployment is explicitly blocked until visual review.

### I. How can the migration be rolled back?

The pre-rebuild branch `backup/kivisense-crm-v2-before-shadcn-ui` points to `b2d51b5`. During migration, the legacy HTML, JS, and CSS remain in the repository and in the built artifact. Reverting the UI commits or restoring the root legacy entry returns the previous frontend without a database rollback. No UAT deployment occurs in Phase 1.

## 16. Phase 1 implementation boundary

Implement now:

- Vite React workspace and static build integration.
- Tailwind and shadcn/ui foundation components required by App Shell and Dashboard.
- Kivisense design tokens.
- shadcn-style Sidebar, SidebarProvider, SidebarInset, Site Header, breadcrumb, identity menu, skeleton/loading, error/retry, cards, chart, matrix, and management table.
- Existing Dashboard API filters and responses.
- A handoff to the preserved legacy entry for every unconverted route.

Do not implement now:

- Company, Contact, Lead, Supplier, Operations, Workbench, forms, attachments, login, account, role, or audit page rewrites.
- Backend/domain/schema/API/RBAC/KPI/scoring/nurture/lifecycle/reactivation changes.
- UAT or Production deployment.

## 17. Phase gates

1. Vite build and TypeScript lint pass.
2. Existing backend, frontend-contract, field-dictionary, and database tests pass.
3. Dashboard loads real frozen analytics data for management and self permissions.
4. Sidebar expands/collapses and persists its state.
5. Legacy navigation handoff works.
6. No document-level horizontal overflow at 1440, 1280, or 1024.
7. Browser console has no error and required static/API requests have no 404/500.
8. Required Phase 1 screenshots are captured.
9. Deployment remains `NOT DEPLOYED — WAITING FOR UI REVIEW`.
