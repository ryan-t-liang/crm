# Kivisense CRM 2.0 — Full shadcn Migration Progress

Baseline: `e832b98c7f9ea684ff485bed1b6e8f0dfa4b6ac0`. Working tree was clean after fetching all remotes and tags.
Recovery branch: `backup/kivisense-crm-v2-before-full-shadcn-migration`, created locally and pushed to GitHub.

The user-approved Phase 1 Dashboard implementation is the primary visual reference, together with DESIGN_SYSTEM.md. Earlier V1 visual guidance and Phase 1-only stop rules are superseded by the current Phase 2 user instruction. Domain rules in the maintainer guide remain frozen.

Execution sequence: 2A Companies/Company 360; compare real screenshots to Dashboard before 2B Contacts; then 2C Leads; 2D Operations/Workbench/Tasks/Nurture/Suppliers; 2E Accounts/Roles/Audit/Login. Each slice requires build, lint, frontend and backend regression, browser, screenshots, console and network verification. No slice is considered migrated merely because its route renders.

Current status: Phases 2A–2E implemented; final integrated regression and UAT release verification in progress. See `kivisense-crm-shadcn-ui-rebuild-full-migration-report.md` for the authoritative final status. No Phase 2 deployment has been performed at this checkpoint.

Shared primitives use the installed shadcn registry and Radix behavior, following [official table composition](https://ui.shadcn.com/docs/components/radix/data-table). Existing business APIs, import/export and authenticated attachment boundaries are retained.
