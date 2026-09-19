# Kivisense CRM prototype instructions

This repository is a frontend-only, high-fidelity CRM product prototype. It must not add a backend, database, server authentication, mail server, queue, migration, or deployment architecture.

Before frontend UI or UX changes, read `docs/DESIGN_SYSTEM.md`, inspect the closest mature Lead, Deal, Customer or Member page, and read `docs/PROTOTYPE_ARCHITECTURE.md` for product boundaries.

For admin UI work, use `.agents/skills/kivisense-admin-design/SKILL.md`. `docs/DESIGN_SYSTEM.md` is the only normative design document; module specifications, acceptance reports, QA evidence and historical UI notes are not visual standards. Read the skill's `REFERENCES.md` only when an external product is explicitly requested or no local interaction precedent exists.

Semi Design, Semi Icons, the Kivisense Semi theme, React, and Recharts are the approved foundation. Do not introduce a competing component library. Product data belongs in `frontend-react/src/mock/`; user changes belong in the frontend store and LocalStorage.

The canonical sales flow is `Lead → Qualified → Convert to Deal → Won/Lost`. Do not create an Opportunity module and do not add price, value, revenue, discount, quotation amount, or transaction amount fields.

Before creating a custom UI component, check whether Semi Design provides an appropriate component. Prefer Semi tokens and theming, keep interaction patterns consistent, and use custom CSS only for product-specific composition.

## GitHub handoff

The user requested GitHub synchronization after each completed implementation iteration. Unless the latest task explicitly says otherwise, run the relevant verification gates, commit only that iteration's changes, and push the current working branch to `origin`. Verify the remote branch matches the resulting commit before reporting success. If verification fails or the remote branch has diverged, resolve safely or report the blocker; do not force-push or bypass failed checks.

Preserve unrelated staged, unstaged, and untracked work, including local QA archives. This handoff does not authorize modifying or overwriting `main`, merging branches, or force-pushing; those actions require an explicit request.

## Prototype publishing

The user authorized publishing after each completed implementation iteration. Unless the latest task explicitly says not to publish, synchronize the current branch to GitHub, build that exact commit, and publish the frontend static output to the existing `https://gridworks.cn/mockup/kivisensecrm/` target. Keep a recoverable previous version before replacing the prototype, verify the deployed commit and assets, and report any blocker instead of bypassing failed checks. Do not publish unrelated work, modify `main`, add deployment architecture, or change any other service. If the current task prohibits tests or browser QA, respect that boundary and distinguish build/deployment verification from functional QA.
