# Kivisense CRM prototype architecture

This repository is intentionally frontend-only. `frontend-react/` contains the application; the root package delegates development, test, lint, and build commands to that workspace.

This document defines technical and product boundaries. It is not a UI specification. Visual and interaction decisions belong only to [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## Source boundaries

- `src/mock/`: canonical demo datasets and explicitly identified presentation fixtures.
- `src/stores/`: React state, scoped selectors, LocalStorage persistence, reset and recovery behavior.
- `src/types/`: product model contracts.
- `src/features/`: product modules and their UI composition.
- `src/components/`: shared CRM shell and reusable application components.
- `src/styles/`: Kivisense presentation on top of Semi Design.

The prototype must not add a backend, database, server authentication, SMTP/IMAP integration, server-side RBAC, queues, migrations, or deployment infrastructure. Role, distributor and brand isolation are frontend product simulations enforced by scoped stores and actions.

## Sales

The canonical sales lifecycle is:

`Lead → Qualified → Convert to Deal → Won/Lost`

Deals reference a Product and optional Add-ons. Monetary data is intentionally absent. Activity is the shared history for Leads, Deals, Contacts and Organizations.

Sales uses the `kivisense-crm-prototype-v1` LocalStorage namespace. Valid existing records are not seed-merged or date-backfilled.

## Member and brand operations

Member operations is an additive bounded module under `src/features/member-operations/`. It uses:

- `src/types/member-operations.ts`;
- `src/mock/member-demo-data.ts`;
- `src/stores/member-operations-store.tsx`.

It mirrors four Sowind collections: `customer`, brand identity `user`, `user_profile`, and `user_purchase_intent`. The UI composes `user + user_profile`; it does not create a Membership entity.

`user.customer_id` and `user_purchase_intent.user_id` may remain `null`. Purchase-intent contact fields are independent historical snapshots and are not derived live from `user_profile`. Purchase Intents are not Sales Leads and never enter Deal conversion or sales analytics automatically.

Member operations uses the independent `kivisense-member-operations-v1` namespace. Its reset does not touch sales or marketing data.

## Dashboard

`#dashboard`, `#dashboard/sales`, and `#dashboard/members` share the read-only query layer in `features/dashboard/dashboard-model.ts`.

The query order is:

1. authority scope;
2. business-specific filters;
3. a fixed Shanghai-time snapshot;
4. metrics, buckets and drilldown records from the same selected data.

Current stock, created-in-period cohorts and the current results of those cohorts remain separate. The Dashboard does not infer a historical funnel or actual-close events that the data does not contain.

## Marketing activities

Marketing is an independent frontend bounded context implemented by:

- `src/types/marketing.ts`;
- `src/mock/marketing-demo-data.ts`;
- `src/features/marketing/`;
- `src/stores/marketing-store.tsx`.

It does not add SQL tables and does not replace sales or member models. Marketing may reference existing member identities, but participation, bookings, chances, draws, awards, redemptions and audits remain marketing-owned records.

All writes pass through validated marketing actions and one persistence commit. Activity and prize bookings remain distinct. Award contents and assigned codes are immutable historical facts. Copying an activity creates fresh configuration identities without copying business records or allocated codes.

Activity-owned PickupSchedule configurations share pickup-slot capacity across explicitly linked prizes. They reuse MarketingSlot and PRIZE bookings; they are not a cross-activity scheduling service. Pickup actions validate changes on the same cloned marketing state before its single persistence commit. Legacy private prize slots are exposed through deterministic read-only schedule IDs, materialized only on an explicit configuration write. Historical bookings, awards and draw snapshots are not migrated in place.

Demonstration records are created only by the initial/reset seed. Activity detail selectors never inject fictional bookings or draws into an existing activity; a new empty activity remains empty.

The marketing store retains `kivisense-marketing-prototype-v1` with schema version 2. Safe V1 conversion preserves the exact source string at `kivisense-marketing-prototype-v1:backup-v1`; unknown, corrupt or conflicting data is preserved rather than silently replaced. Marketing reset changes only the primary marketing namespace.

Frontend role, randomness, capacity and persistence checks demonstrate product behavior. They are not production concurrency, security or backend guarantees.

Detailed marketing field and business contracts remain in `MARKETING_ACTIVITY_MODULE.md` and `MARKETING_RECORD_FIELDS.md`. Their page descriptions and historical acceptance notes do not define the Design System.

## Routing and display-only compatibility

Products belongs to SALES after Organizations and retains its existing routes and HQ-only write permissions.

All brand display names are Kivisense. The raw `gp` / `un` codes remain in stored data, permissions and scope logic. `utils/brand-display.ts` owns display-only mapping.

Direct detail routes apply the same visible authority boundaries as their parent lists. Legacy marketing routes may resolve to current records, but compatibility routing does not create new business objects or rewrite stored history.

## Persistence and reset invariants

Each workspace owns its LocalStorage namespace and resets only that namespace. Loaders preserve unknown or damaged data and surface recovery errors rather than manufacturing empty state.

Successful actions persist before publishing new React state. Store actions enforce actor and scope checks independently of whether a UI control is visible.
