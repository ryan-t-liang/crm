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

The Dashboard V1 attachment supplies `docs/reference/sowind-schema.sql`. It has now been read and copied unchanged to the local reference directory (ignored by Git). Dashboard types expose SQL timestamps, `user.is_deleted`, intent merchandise fields and JSON `hq_ref` without rewriting existing data. Legacy aliases/extensions remain explicitly identified in `docs/SOWIND_MEMBER_FIELD_MAPPING.md`; these partial frontend display contracts do not claim complete database integration.

## Dashboard V1

One navigation entry retains `#dashboard` (business summary), with `#dashboard/sales` and `#dashboard/members` as secondary tabs. `features/dashboard/dashboard-model.ts` is the shared read-only query layer: authority first, independent business filters second, one fixed Shanghai-time snapshot for KPIs, buckets and drilldown records. Read-only Semi SideSheets consume the same selected record arrays; no unfiltered list redirection. Date presets/custom selection stay mounted across dashboard tabs, and closing a drawer preserves filters. Role/query/data changes dismiss existing drawers.

Current stock, created-in-period cohorts and those cohorts' current results are separate. No historical funnel or actual-close event metrics are inferred. The App route adds read-only distributor checks for direct Lead/Deal/Contact/Organization detail URLs. Business mutations and both store loaders/storage keys/reset implementations are unchanged. See `DASHBOARD_METRICS.md` and `DASHBOARD_V1_ACCEPTANCE.md`.

## Marketing activities — Refinement V2

One member-and-brand navigation entry uses `#marketing`, now an activity list rather than four top-level work areas. Activity details own configuration, prizes, reservations and readonly participation/draw/award/redemption data. Existing `activity.pool` contains owned `ActivityPrize` records with independent PHYSICAL/VIRTUAL types, fulfillment rules and optional code allocations; there is no global prize master collection. `src/types/marketing.ts`, `src/mock/marketing-demo-data.ts`, `src/features/marketing/` and `src/stores/marketing-store.tsx` remain an independent frontend bounded context, not SQL tables or a replacement sales/member model. The provider references existing members; all writes use one validated marketing action and one persistence commit. Explicitly CRM-linked participations preserve the reliable customer or brand-user boundary; optional external/anonymous observations use stable internal IDs without inventing CRM associations. ACT/PRIZE bookings, chances, draws (including NONE), immutable award contents, quota, separate redemption business facts and audit records remain explicitly linked. Copy creates fresh configurations without business records or codes. Reservation-based winning is capped by remaining seats minus outstanding unreserved promises, not quota alone.

Activity detail uses four primary areas (overview, configuration, participation records, prize fulfillment) with scoped secondary tabs; previous leaf routes remain compatible. The Semi SideSheet editor uses five vertical steps, operational readiness rows and real step-jump actions. Optional `ruleContent` is separate display content, never parsed into chance/probability/booking rules. Older missing fields are interpreted without automatic storage writes.

Activity participation uses existing `bookingEnabled` as RESERVATION/DIRECT compatibility mapping. Prize `fulfillmentMode` is independently DIRECT/RESERVATION, including virtual reservation-based fulfillment; legacy methods remain readable. All four activity/prize combinations retain ACT/PRIZE booking separation, completion-issued chances, immutable award/code allocation and reservation promises. Virtual DIRECT issuance does not create a staff claim; virtual RESERVATION preserves its allocated content but issues only after a valid prize booking and claim.

New participations have stable internal participant IDs and optional external observations (member, UnionID, OpenID+AppID, phone+country code, external/anonymous/session identifiers). No external identifier or name is globally required or treated as a natural-person uniqueness key. OpenID needs its app context; ambiguous or weak matching never automatically merges participations/customers. Later explicit member association retains the participation and its history. Channels are WECHAT_MINIPROGRAM/WECHAT_H5/WEB_H5/QR_H5/STAFF/OTHER; missing legacy channels display OTHER. Ordinary lists mask identities, while scoped readonly detail can show the saved identity.

The user preview and independent `#redemption/<credential>` staff surface share that same state; the latter renders outside the CRM AppShell, including the compatible legacy redemption URL. Preview exposes explicit fictional identity scenarios without creating member-store records. CRM contains no staff workbench or verification writes; the member marketing tab remains readonly. Existing sales/member store implementations, resets and Dashboard queries are unchanged.

Marketing retains `kivisense-marketing-prototype-v1` but upgrades the schema to 2. Safe V1 conversion first preserves the exact raw string at `kivisense-marketing-prototype-v1:backup-v1`; conflicting backups or intervening edits block overwrite. Only a missing namespace initializes, unknown/corrupt contents are preserved, and confirmed marketing reset changes only the primary marketing key, never backups/sales/members. Browser quota failure commits no result/cost/stock. Frontend role/randomness/capacity checks and synchronous local commits are demonstrations, not production concurrency/security or backend migrations. See `MARKETING_ACTIVITY_MODULE.md` and `MARKETING_ACTIVITY_ACCEPTANCE.md`.

## Existing persistence

The initial state is generated from `src/mock/demo-data.ts`. Mutations are written to browser LocalStorage. “Reset Demo Data” restores the canonical dataset.

Sales remains under `kivisense-crm-prototype-v1` with schema version1. Member operations uses the independent `kivisense-member-operations-v1` key with schema version2. Core Integrity V1 preserves damaged/unknown-version data and blocks automatic overwrite, persists before publishing successful state, and limits confirmed resets to HQ administrators. Each reset replaces only its own workspace key; it never deletes another workspace or performs backend migration. Valid old records are not seed-merged or date-backfilled. Store actions enforce lightweight live actor/distributor/brand checks independently of UI visibility. See `CRM_CORE_INTEGRITY.md` for invariants and known frontend-only limitations.
