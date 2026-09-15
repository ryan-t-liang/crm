# Kivisense CRM prototype architecture

The repository is intentionally frontend-only. `frontend-react/` contains the application; the root package delegates development, test, lint, and build commands to that workspace.

## Boundaries

- `src/mock/`: canonical demo dataset.
- `src/stores/`: React state, scoped selectors, LocalStorage persistence, and reset behavior.
- `src/types/`: product model contracts.
- `src/features/`: Lead, Deal, communication, customer, channel, catalog, work, and dashboard UI.
- `src/components/`: reusable CRM shell, tables, timelines, and detail workspace.
- `src/styles/`: Kivisense presentation on top of Semi Design.

The prototype must not contain a backend, database, server authentication, SMTP/IMAP integration, server-side RBAC, queues, migrations, or deployment infrastructure. Role and distributor isolation are product simulations enforced by scoped frontend selectors.

## Product model

The sales lifecycle is `Lead → Qualified → Deal → Won/Lost`. Deals reference a Product and optional Add-ons. Monetary data is intentionally absent. Activity is the shared history for leads, deals, contacts, and organizations.

## Persistence

The initial state is generated from `src/mock/demo-data.ts`. Mutations are written to browser LocalStorage. “Reset Demo Data” restores the canonical dataset.
