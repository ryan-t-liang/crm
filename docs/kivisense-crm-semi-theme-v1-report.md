# Kivisense CRM — Semi Theme V1 Color Consolidation

## Scope and baseline

- Baseline commit: `6b29674e74e1b77ddb8a63e2df069891f92e29ef`
- Branch: `codex/kivisense-crm-v2.0`
- Scope: color tokens, Semi theme mapping, semantic status colors, avatar colors, chart palette, radius consistency, and overlay elevation
- Explicitly unchanged: layout, sidebar width, detail ratios, columns, fields, routes, API, database, permissions, import/export behavior, forms, and business/domain logic

## Modified theme and component files

Primary theme implementation:

- `frontend-react/src/index.css`

Minimal hardcoded-color cleanup:

- `frontend-react/src/components/app-sidebar.tsx`
- `frontend-react/src/components/crm/cells.tsx`
- `frontend-react/src/components/crm/primitives.tsx`
- `frontend-react/src/components/crm/task-interactions.tsx`
- `frontend-react/src/components/section-cards.tsx`
- `frontend-react/src/components/site-header.tsx`
- `frontend-react/src/components/team-execution-table.tsx`
- `frontend-react/src/pages/dashboard-page.tsx`

## CRM tokens

Theme V1 establishes one active visual chain: Semi variables resolve into CRM tokens, and components consume those tokens.

- Brand: `--crm-primary`, hover, active, soft, softer
- Sidebar: background, hover, active, text, muted text, active text, border
- Surface: canvas, surface, subtle, hover, selected
- Text: primary, secondary, tertiary, disabled, inverse
- Structure: border, strong border, divider
- Semantic: success, info, warning, danger, purple and their backgrounds/borders
- Avatar: four low-saturation background/text pairs
- Chart: Emerald primary plus blue, purple, warm, and neutral secondary colors
- Interaction: tab text/active/indicator
- Shape/elevation: 6/8/10px radii, dropdown shadow, overlay shadow

Compatibility aliases such as `--crm-ink`, `--crm-line`, `--crm-green`, `--crm-gold`, `--crm-navy`, and `--crm-rose` now resolve into the same CRM semantic token system. No `--v1-*` token remains in production frontend source.

## Color consolidation result

- Semi default blue: Primary, hover, active, light, focus border, link, Tabs and Pagination are mapped to Emerald. A representative computed-style scan found no visible Semi `#0064FA` on the Organization workspace after the pagination fix.
- Amber/Gold decoration: removed from page-title lines, detail highlight accents, ordinary section accents, relationship-summary accents, Dashboard panel accents, and metric decorations.
- Lime: removed from selected-navigation icons, navigation badges, user/owner/team avatars, and the former high-saturation brand aliases used by ordinary components.
- Main workspace: reduced to canvas, white surface, subtle surface, and selected surface.
- Tables: neutral header, subtle divider, near-white hover, Emerald-soft selection.
- Tags: ordinary metadata is neutral. Success, Info, Warning, and Danger are reserved for actual state meaning.
- Metrics: neutral value/label presentation; color is no longer assigned per metric.
- Dashboard: the primary series and funnels use Emerald; secondary series use the bounded chart palette instead of a rainbow palette.

Colors intentionally retained:

- Blue: informational/Qualified states and a secondary chart series.
- Amber: warning, risk, pending/attention states, plus the reserved warm chart token.
- Red: lost, failed, overdue, errors, and destructive actions only.
- Purple: reserved for AI/special-category semantics and an Opportunity-specific secondary chart series.

## Hardcoded color audit

Production `frontend-react/src` currently contains 577 literal color occurrences and 324 unique literal values:

- 570 occurrences are in `index.css`. These include Theme V1 token declarations, semantic palettes, shadows, white/transparent values, and historical compatibility selectors that remain below the active final cascade to avoid a structural stylesheet rewrite in this color-only task.
- 7 occurrences are in TypeScript/TSX and are all the intentional Dashboard chart palette, chart grid/cursor, and white active-dot outline.
- Asset/logo colors were not changed.
- Third-party Semi CSS and dependencies were excluded from the application-source count.

All current visible color ownership is finalized by the Theme V1 cascade. The older compatibility declarations are not an additional runtime theme; removing them would be a separate stylesheet-decomposition task outside this layout-preserving scope.

## Validation

- Frontend TypeScript check: PASS
- Frontend lint: PASS
- Production frontend build: PASS
- Frontend unit tests: 15 PASS
- Existing frontend interaction contracts: PASS
- Browser visual/runtime audit: 20/20 PASS
- Document-level horizontal overflow: 0
- Console errors/warnings: 0/0
- Page errors: 0
- HTTP/request failures: 0/0
- Business writes during visual capture: 0

The build retains the previously documented third-party `lottie-web` direct-eval warning and large-chunk warning. Neither is introduced by this color consolidation.

## Visual evidence

- AFTER: `docs/qa-evidence-semi-theme-v1/`
- BEFORE: `docs/qa-evidence-semi-redesign-final/`
- Machine-readable AFTER audit: `docs/qa-evidence-semi-theme-v1/runtime-audit.json`

The AFTER set includes the requested Dashboard and Organization, Contact, Marketing Lead, and Opportunity list/detail pages at 1440x900, plus the same routes and Workbench at 1280x800.
