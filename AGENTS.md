# Kivisense CRM repository instructions

## Required reading

- Before changing CRM domain behavior, data models, migrations, RBAC, analytics, import/export, API contracts, or frontend information architecture, read and follow [`docs/kivisense-crm-maintainer.md`](docs/kivisense-crm-maintainer.md).
- Before any CRM frontend, UI, or UX change, read and follow [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).
- Before a large-scale UI rebuild or frontend architecture migration, also read and follow [`docs/CODEX_UI_REBUILD_PROMPT.md`](docs/CODEX_UI_REBUILD_PROMPT.md).

## Sources of truth and priority

1. CRM business and domain rules: [`docs/kivisense-crm-maintainer.md`](docs/kivisense-crm-maintainer.md).
2. The approved frontend component foundation and current migration scope: [`docs/CODEX_UI_REBUILD_PROMPT.md`](docs/CODEX_UI_REBUILD_PROMPT.md).
3. Visual design, tokens, layout, interaction, and UI/UX rules: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

Semi Design is the only base component library for formal CRM pages. Semi Icons is the only icon family, and `frontend-react/src/components/crm/` is the shared CRM component layer. Formal CRM pages must not use `frontend-react/src/components/v1/ui`, Lucide, TanStack Table, shadcn, or Radix UI.

For current visible product language, `Organization` is labeled `组织`. This supersedes the older `Company / 公司` UI label only; Organization remains the same unified company, customer, prospect, vendor, and partner master, and no domain relationship or API contract changes.

The rebuild prompt may direct implementation work, but it must not weaken the maintainer guide's domain boundaries, data-preservation rules, security constraints, lifecycle rules, canonical information architecture, or verification gates. The maintainer guide's historical statement that V1-native components are the UI source of truth is superseded only for frontend component and visual implementation by the current Semi foundation. The design system and rebuild prompt supersede older V1 visual and component guidance, but they do not supersede business rules.

These instructions are mandatory for every file in this repository. More specific `AGENTS.md` files may add constraints but must not weaken these sources of truth.
