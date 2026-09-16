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

The member and brand operations workspace is an additive bounded module under `src/features/member-operations/`. It uses `src/types/member-operations.ts`, `src/mock/member-demo-data.ts`, and `src/stores/member-operations-store.tsx`; it does not extend or replace the sales contracts.

## Product model

The sales lifecycle is `Lead → Qualified → Deal → Won/Lost`. Deals reference a Product and optional Add-ons. Monetary data is intentionally absent. Activity is the shared history for leads, deals, contacts, and organizations.

Member operations mirrors the requested Sowind object boundary as four independent frontend collections: `customer`, brand identity `user`, `user_profile`, and `user_purchase_intent`. The UI composes `user + user_profile` for a brand-member detail instead of creating a Membership entity. A `user.customer_id` or `user_purchase_intent.user_id` may remain `null`. Purchase-intent contact fields stay as their own historical snapshot and are not derived live from `user_profile`. Member Purchase Intents are not Sales Leads and never enter Deal conversion or sales analytics automatically.

`docs/reference/sowind-schema.sql` was not present when this module was implemented. Types therefore include only fields explicitly named in the compatibility brief; complete SQL column, type, nullability, index, and constraint parity remains unverified. See `docs/SOWIND_MEMBER_FIELD_MAPPING.md`.

## Persistence

The initial state is generated from `src/mock/demo-data.ts`. Mutations are written to browser LocalStorage. “Reset Demo Data” restores the canonical dataset.

Sales remains under `kivisense-crm-prototype-v1`. Member operations uses the independent `kivisense-member-operations-v1` key with schema version 2. Each reset removes only its own workspace data, so existing sales data and member data cannot clear or scope one another.
