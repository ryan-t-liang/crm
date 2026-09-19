---
name: kivisense-admin-design
description: Apply the established Kivisense CRM visual and interaction language when creating, changing, or reviewing admin UI. Use for CRM lists, record details, forms, tables, drawers, navigation, dashboards, and shared UI. Current mature Kivisense pages are authoritative; external products are interaction references only.
---

# Kivisense Admin Design

Use this skill to preserve the CRM's existing design language, not to invent or expand a design system.

## Required source

Read [docs/DESIGN_SYSTEM.md](../../../docs/DESIGN_SYSTEM.md) before UI work. It is the only normative design document in this repository.

Then inspect the closest mature implementation:

- Lead List / Detail;
- Deal List / Detail;
- Customer / Member List / Detail;
- `AppShell.tsx`, `CrmUi.tsx`;
- `tokens.css`, `app.css`, `components.css`.

Rendered accepted pages and their current shared implementation outrank written summaries. Module specifications, acceptance reports, QA evidence and historical UI notes are not visual standards.

## Working method

1. Classify the surface as AppShell, list, detail, form, table, dashboard or feedback state.
2. Find the closest mature Kivisense page.
3. Reuse its shared component, class, density, action hierarchy and responsive behavior.
4. Add only the business-specific composition that the local pattern cannot express.

If no local pattern fits, propose the smallest shared extension. Do not derive a new visual language from an external product or a one-off module.

## Stable boundaries

- Semi Design, Semi Icons and the current Kivisense Semi Theme remain the component foundation.
- Use existing CRM tokens and shared styles; do not duplicate approximate values in module CSS.
- Preserve the established AppShell, list surface, detail workspace, table and feedback patterns.
- Use a Modal for simple record creation or editing, a Drawer / SideSheet for contextual complex work, and a full page for the complete record detail. Use a Wizard only for a genuinely ordered, dependent process.
- Keep enterprise density compact and readable.
- Preserve useful surface boundaries while avoiding decorative, nested or fragmented Cards.
- Use one clear primary action and move low-frequency operations into an existing secondary pattern.
- Keep developer prose, architecture notes and test language out of normal business screens.
- Do not change business models, routes, stores or permissions to satisfy a visual preference.
- Do not add a component, token, stylesheet or generalized rule unless the requested UI cannot be expressed with the current system.

## External references

Only read [REFERENCES.md](REFERENCES.md) when the user explicitly names an external product or when no local interaction precedent exists. Extract an interaction principle only; the final visual result must still match the mature Kivisense CRM.
