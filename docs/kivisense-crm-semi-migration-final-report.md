# Kivisense CRM 2.0 Semi Design migration

## Baseline and scope

- Baseline commit: `6669ea9388413ada12dfd1d9cfe23d597d19f1d4` (`refine organization detail composition`).
- Branch: `codex/kivisense-crm-v2.0`.
- Scope: formal CRM React pages only. The migration preserves the router, API contracts, database schema, RBAC, uploads, audit history, lifecycle rules, and existing business data.
- No Design Lab or mock-data replacement is part of this delivery.

## Dependency migration

Added:

- `@douyinfe/semi-ui@^2.103.0`
- `@douyinfe/semi-icons@^2.103.0`

Removed from the frontend manifest:

- `lucide-react`
- `@tanstack/react-table`

The production source contains no import of `components/v1/ui`, Lucide, TanStack Table, Radix UI, or `data-slot`-based shadcn structures.

## Shared CRM foundation

The shared layer under `frontend-react/src/components/crm/` now provides:

- Kivisense tokens and Semi-backed controls
- shell state and navigation composition
- page headers, toolbars, metrics, detail scaffolds, record headers, sections, tabs, status presentation, empty/loading/error states
- Semi Table composition with selection, filters, column visibility, actions, and pagination
- entity, owner, date, relationship-count, and next-action cells
- create/edit SideSheets, confirmation Modals, searchable entity selection, date/file inputs
- contact, organization, marketing-lead, and opportunity overview compositions
- timeline, attachments, tasks, follow-ups, import/export, and audit components

## Migrated formal routes

- Login and password flow
- Dashboard and Workbench
- Organization list/detail/create/edit
- Contact list/detail/create/edit
- Marketing Lead list/detail/create/edit and conversion UI
- Opportunity list/detail/create/edit
- Supplier list/detail
- Accounts, roles and permissions, scoring rules, audit, and account security
- Import/export, upload, filters, batch actions, dropdowns, and confirmation overlays

Standalone Reports, Activities, and generic Settings routes do not exist in the canonical application and were not invented for this migration.


## Verification status

Automated checks completed during migration:

- TypeScript check: PASS
- frontend and backend production build: PASS
- frontend unit tests: 15 PASS
- backend unit tests: 17 PASS
- frontend interaction contracts: PASS
- isolated-database backend integration tests: 37 PASS
- exact-build browser interaction regression: 20/20 PASS, 31 screenshots, 12 critical writes checked through visible UI, HTTP response, persisted API state, and reload
- exact-build browser visual/runtime audit: 22/22 PASS, with no document-level horizontal overflow, unexpected console errors, page errors, HTTP failures, request failures, overlap candidates, or unnamed visible comboboxes

The repository owner elected to perform any additional acceptance testing manually. No further automated gate is required for this commit.

## Browser evidence

- Core 1440x900 and 1280x800 list/detail evidence: `docs/qa-evidence-semi-redesign-final/`
- Responsive, system, authentication, overlay, import/export, upload, permission, and interaction evidence: `docs/qa-evidence-semi-migration-final/`
- Recorded local verification URL: `http://127.0.0.1:3100`

The local URL is an execution-time address, not a permanently running service.

## Legacy cleanup classification

Deleted:

- `frontend-react/src/components/v1/ui.tsx`

Retained and still valid:

- Tailwind as a layout and spacing utility
- `frontend/` legacy assets required by the existing server packaging and rollback boundary
- historical audit and migration reports under `docs/`

Ignored as generated/local material:

- built frontend and backend artifacts
- local imports, exports, and CRM attachments
- intermediate Semi migration screenshot iterations

Only the two final Semi evidence sets are intended for version control. Historical documents mentioning shadcn describe earlier repository states and are not production runtime dependencies.

## Known non-blocking notes

- The bundled frontend is large and Vite reports a chunk-size warning.
- Semi's transitive `lottie-web` package triggers the bundler's direct-`eval` warning.
- `frontend-react/src/index.css` intentionally retains compatibility selectors while the final Semi visual layer overrides them. A later stylesheet modularization may reduce maintenance cost, but is not required for functional migration acceptance.
