# Kivisense CRM 2.0 — Product Language and V1 Visual Audit

Date: 2026-09-08

Baseline branch: `codex/kivisense-crm-v2-v1-ui-rebuild`

Baseline commit: `89107ab34b88a9dd02ca7c68909b7aad78a50a66`

Scope: product-facing language and visual presentation only. The current React architecture, canonical object model, navigation, Lead → MQL → SQL → Opportunity lifecycle, Dashboard four-view structure, Workbench, Customer Operations disposition, import/export contracts, RBAC and persistence semantics are not redesign targets.

## 1. Sources inspected

- Current branch status and ten most recent commits.
- `docs/DESIGN_SYSTEM.md`, `docs/kivisense-crm-maintainer.md` and `docs/domain-language-glossary.md`.
- Current React application shell, shared CRM primitives, tables, forms, dialogs, Dashboard, Company, Contact, Marketing Lead, Opportunity, Workbench, Supplier, Accounts, Roles, Audit, scoring and import/export surfaces.
- Current product-language helpers and field dictionaries.
- Legacy V1 source in `frontend/styles/production.css` and the preserved legacy frontend structure.
- Existing 1440px browser evidence under `artifacts/ui-audit/`, `artifacts/ui-refactor-v4-after/` and `artifacts/uat-v4/`.

The user-owned `artifacts/ui-audit/` directory, its ZIP archive and capture script remain immutable inputs and will not be overwritten.

## 2. Product-language findings

### 2.1 Central dictionary is incomplete

`frontend-react/src/lib/product-language.ts` already centralizes audit actions, Marketing Lead sources/channels and activity labels, but lifecycle, stage, priority, score levels, object/job types and several status labels are still duplicated in page or domain files. This allows the same internal key to produce different Chinese wording.

Required consolidation:

- Marketing Lead status.
- Opportunity stage and priority.
- Company lifecycle and business relationship.
- Contact type.
- score/engagement/lead-temperature levels.
- activity source and event.
- audit action/module/target.
- import/export object, status and scope.
- account/task/common operational status.

### 2.2 Raw or mixed technical wording remains visible

Confirmed product-facing examples include:

- `Contact 360` in the Contact breadcrumb.
- `Phone` in Contact and Marketing Lead forms, search prompts, detail fields and table headers.
- raw audit-action guidance such as `CREATE_CONTACT` in the Audit filter.
- Company/Journey history paths that can render lifecycle enum values such as `TARGET`.
- Company scoring areas that can render level values such as `LOW`.
- scoring-rule categories and event codes shown without an explicit technical-context label.
- page-local maps that use `孵化中`, `无效 / 不跟进`, `已确认` or generic `负责人` inconsistently with the canonical glossary.
- import/export object, scope and task status maps duplicated inline.

The technical identifiers may remain in persistence, APIs, TypeScript types and explicit administrator technical detail. They must not be the primary label for ordinary business users.

### 2.3 Marketing Lead language gaps

- Create already hides initial status and direct score input, which must remain unchanged.
- Source is a readable select, but the central channel dictionary does not cover all approved stable channel codes and historical aliases.
- Status and score-level labels remain page-local.
- `Phone` and generic owner wording remain visible.
- Unknown historical values need a safe product fallback rather than raw `UPPER_SNAKE_CASE`.

### 2.4 Opportunity distinction

The main Opportunity pages already use 商机 and preserve 来源线索 where appropriate. The compatibility route `#leads` and `CrmLead` type remain internal. The cleanup must guard against reintroducing 线索阶段, 线索负责人, Lead Owner or Lead Detail on Opportunity surfaces.

### 2.5 Dashboard, Company, Contact and system gaps

- Dashboard business labels are mostly Chinese, but score-level maps and stage/source maps are distributed.
- Company uses 业务关系 and structured selectors, but score bands and Journey lifecycle changes can still expose raw values.
- Contact correctly supports 企业联系人 / 个人联系人 and hides the legacy CRM status; remaining `Phone` and `Contact 360` wording must be removed.
- Audit primary rows use mapped actions, but its filter instructs users to type raw action codes.
- Roles and scoring pages are administrator surfaces; raw keys may remain only when clearly presented as internal/technical information rather than the main business label.
- Existing error handling protects 5xx details, but field/business error mapping must remain the primary user feedback and raw framework/database errors must never surface.

## 3. V1 visual-language extraction

The V1 source of truth is not its old DOM or business IA. The reusable visual vocabulary in `frontend/styles/production.css` is:

| V1 characteristic | React restyle interpretation |
| --- | --- |
| Warm light canvas `#f3f1eb` | Use a light neutral page background behind white business surfaces |
| White rounded surfaces | Restore visible section/table/form panels without making every field a card |
| Stronger neutral borders | Increase section, toolbar, input and table separation |
| Restrained soft shadow | Use one shared low-elevation surface shadow and stronger floating shadow |
| Dark mature sidebar | Restore clear navigation hierarchy with a dark neutral rail and Emerald active indicator |
| Serif-style record/page titles | Use the V1 title treatment as a visual anchor while body/table text remains sans-serif |
| Warm table header and explicit hover | Improve scanning, selected-row state and primary/secondary field hierarchy |
| Grouped forms and stable footer | Give form sections tinted backgrounds, visible headers and stronger focus/error states |
| Semantic status palette | Green success/current, blue information, amber pending/risk, red error/lost and gray historical |
| Lucide icons in restrained containers | Add consistent object/section anchors without emoji or mixed icon libraries |

The Kivisense Emerald identity remains the primary/selected/current-stage color. V1's richer hierarchy is adopted; its legacy navigation, old field groupings, route structure and Lead/Opportunity ambiguity are not.

## 4. Visual diagnosis of the current React UI

- The application uses white as both page canvas and nearly every surface, so headers, business sections and tables visually merge.
- Borders and section headers are too light to establish a mature CRM hierarchy.
- Record headers, highlights and Stage Path are structurally correct but lack a strong object/state anchor.
- The sidebar hierarchy is correct but visually resembles a default component-library demo.
- Dashboard metrics and funnel cards are uniformly neutral, reducing the distinction between success, risk, pending and informational states.
- Forms are functionally grouped but still read as one large white dialog containing many visually equivalent inputs.
- Table header, hover and selected states are too subtle for high-frequency CRM scanning.

## 5. Implementation boundary

This round will:

1. Extend shared React tokens and shared primitives using the extracted V1 visual vocabulary.
2. Apply that vocabulary to the existing pages without changing their information architecture.
3. Consolidate product labels and remove confirmed raw/mixed wording.
4. Add a static product-language audit with an explicit allowlist and contextual technical exceptions.
5. Update the glossary and visual system documentation.
6. Run only the override's minimum checks: frontend build, backend type/build only if affected, one core-page browser smoke across the seven requested routes, and one focused review of changed language/form presentation.

This round will not modify database schema, migrations, lifecycle rules, import/export contracts, RBAC, backend domain behavior or Production.

## 6. Acceptance risk

The highest regression risks are visual rather than domain-level:

- Chinese labels clipping in filters, badges or tables.
- semantic colors being applied by text inference to the wrong state.
- dark-sidebar token overrides reducing contrast in collapsed mode.
- broad CSS selectors unintentionally restyling floating components.
- audit/scoring administrator screens losing access to technical detail.

The implementation will therefore favor shared component class names and explicit semantic variants over page-local CSS or mechanical global string replacement.
