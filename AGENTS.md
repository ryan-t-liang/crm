# Kivisense CRM repository instructions

## Required reading

- Before changing CRM domain behavior, data models, migrations, RBAC, analytics, import/export, API contracts, or frontend information architecture, read and follow [`docs/kivisense-crm-maintainer.md`](docs/kivisense-crm-maintainer.md).
- Before any CRM frontend, UI, or UX change, read and follow [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).
- Before a large-scale UI rebuild or frontend architecture migration, also read and follow [`docs/CODEX_UI_REBUILD_PROMPT.md`](docs/CODEX_UI_REBUILD_PROMPT.md).

## Sources of truth and priority

1. CRM business and domain rules: [`docs/kivisense-crm-maintainer.md`](docs/kivisense-crm-maintainer.md).
2. Visual design, components, layout, interaction, and UI/UX rules: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).
3. The scope and execution order for the current UI rebuild: [`docs/CODEX_UI_REBUILD_PROMPT.md`](docs/CODEX_UI_REBUILD_PROMPT.md).

The rebuild prompt may direct implementation work, but it must not weaken the maintainer guide's domain boundaries, data-preservation rules, security constraints, or verification gates. The design system supersedes older visual guidance when the two conflict, but it does not supersede business rules.

These instructions are mandatory for every file in this repository. More specific `AGENTS.md` files may add constraints but must not weaken these sources of truth.
