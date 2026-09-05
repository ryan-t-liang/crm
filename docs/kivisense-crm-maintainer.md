# Kivisense CRM Maintainer Guard

This repository has no project-level Codex Skill registration runtime. This document is the repository-native maintainer rule and is referenced by the root `AGENTS.md`.

## Domain language

- Contact = Person 360. A Contact is a person and may have many Leads.
- Organization = Company 360. It is the unified customer, prospect, vendor, and partner master.
- Lead = Opportunity. A Lead belongs to exactly one Contact; its Organization is derived through that Contact.
- Followup = Business Interaction. Followups are append-only business history and drive current progress, next-action, last-interaction, and next-followup snapshots.
- Task = Next Action. Open, completed, and canceled tasks are the execution record and drive execution KPIs.
- Journey = Business History. It combines domain events into a human-readable customer timeline.
- Audit = System History. It records who changed the system and must not be presented as the business journey.

Do not create a second company or supplier master. `OrganizationRole` expresses `PROSPECT`, `CUSTOMER`, `VENDOR`, and `PARTNER`; the same Organization may hold several roles. Do not add a competitor role in this phase.

## Sources of truth

- The existing V1 visual language in `frontend/styles/production.css` is the UI source of truth: quiet, dense, white rounded cards, restrained status color, and native DOM/SVG only.
- `docs/crm-2.0-field-dictionary.md` is the field source of truth for Contact and Lead compatibility.
- Organization owns linked company name, website, industry, and location. Contact legacy company strings are compatibility snapshots only and must not remain the relationship key.
- Lead must retain `contactId`; do not replace Contact 1:N Lead with a direct Organization-only Lead.

## Customer operations rules

- Fit is manually maintained from 0 to 100 with a reason. Bands are LOW 0–39, MEDIUM 40–69, and HIGH 70–100.
- Engagement is computed, clamped to 0–100, and returned with a transparent point breakdown. Threshold days must come from configuration.
- An active Lead advances a non-disqualified Organization to `OPPORTUNITY`; a Won Lead advances it to `CUSTOMER`. Never automatically reopen `DISQUALIFIED`.
- Nurture needs reason, objective, cadence, next touch, touch topic, owner, and status. An active nurture owns one next-touch task; do not materialize an unlimited future task series.
- Completing or canceling a Task preserves history. Do not hard-delete task history.
- A Followup with both a next action and next-followup time must create the next Task. When submitted from a current Task, complete that Task before creating the next one.

## Analytics and security

- Dashboard and analytics contain no financial metrics and must not select or return quote, amount, revenue, cost, contract, payment, invoice, or procurement values.
- Every KPI must document definition, numerator, denominator, time window, and filters.
- Team and management analytics must use bounded or aggregated queries; do not introduce per-user N+1 query loops.
- Keep management and self Dashboard permissions separate. Sales users may manage only tasks they own unless explicit management authority is granted.
- Attachment downloads remain authenticated and entity-scoped. Organization logo accepts images only and has one active file.
- Import never fuzzy-merges Organizations. Contact import may link by exact normalized Organization name; creating a missing Organization requires an explicit opt-in that defaults off.

## Change and verification gates

1. Inspect current files, Git status, migration history, and runtime before editing. Preserve unrelated work.
2. Migrations must be additive and non-destructive. Verify both clean install and upgrade preservation; never reset or reseed a live UAT database.
3. Run Prisma validation/generation, TypeScript lint, unit tests, field-dictionary tests, frontend contracts, and DB integration tests.
4. Use a real browser for the required Customer Operations screens at 1440, 1280, and 1024 widths. The page shell must not overflow; wide tables may scroll only inside their card.
5. UAT deployment is allowed only after all P0 gates pass and browser review has no blocker. Back up database, application, attachments, and Nginx first. Never deploy this phase to Production or `main`.

## Deferred scope

Project, Order, Contract, Cost, Finance, Invoice, Procurement, general Automation, AI, custom-field engines, formulas, low-code builders, and workflow builders are deliberately not implemented in this phase.
