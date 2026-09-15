# Kivisense CRM prototype instructions

This repository is a frontend-only, high-fidelity CRM product prototype. It must not add a backend, database, server authentication, mail server, queue, migration, or deployment architecture.

Before frontend UI or UX changes, read `docs/DESIGN_SYSTEM.md` and `docs/PROTOTYPE_ARCHITECTURE.md`.

Semi Design, Semi Icons, the Kivisense Semi theme, React, and Recharts are the approved foundation. Do not introduce a competing component library. Product data belongs in `frontend-react/src/mock/`; user changes belong in the frontend store and LocalStorage.

The canonical sales flow is `Lead → Qualified → Convert to Deal → Won/Lost`. Do not create an Opportunity module and do not add price, value, revenue, discount, quotation amount, or transaction amount fields.

Before creating a custom UI component, check whether Semi Design provides an appropriate component. Prefer Semi tokens and theming, keep interaction patterns consistent, and use custom CSS only for product-specific composition.
