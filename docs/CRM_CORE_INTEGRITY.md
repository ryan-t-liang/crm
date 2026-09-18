# CRM Core Integrity V1

Scope: incremental frontend-only corrections on `codex/kivisense-product-prototype`. Marketing configuration/state machines and the Dashboard three-view information architecture are frozen. No backend, SQL, database model, money, Opportunity, deployment or main changes.

## Lead state machine and conversion

Ordinary edits allow NEW, CONTACTED, NURTURING, QUALIFIED and UNQUALIFIED. CONVERTED is created only by Convert to Deal, never a manual dropdown choice. A converted Lead cannot return to an ordinary state; Undo Convert is not implemented.

The business action requires an existing in-scope QUALIFIED Lead, empty convertedDealId and no existing Deal.sourceLeadId referencing it. It validates organization/contact/distributor, owner, active newly-selected product/Add-ons, initial stage and expected-close date. On success the one synchronous persisted commit establishes:

```
Lead.status = CONVERTED
Lead.convertedDealId = Deal.id
Deal.sourceLeadId = Lead.id
Lead.distributorId = Deal.distributorId
```

Repeating a successful, consistent conversion returns its existing Deal, without another Deal or activity. Conflicting legacy relationships fail with a business error and are not automatically repaired. Every action reads the live state/actor reference; retained callbacks cannot bypass a subsequent role switch or duplicate a synchronous conversion before React rerenders.

## Write scope and resets

HQ_ADMIN writes across the existing distributor scope. DISTRIBUTOR_MANAGER and DISTRIBUTOR_SALES write only their own distributor. VIEWER is an explicitly supported read-only role value (tested with an isolated fixture, not an added seeded account); unknown roles fail closed. Organization/contact creation, Lead writes/conversion, Deal writes, Task writes, communication, notes, attachments and product management validate in the business layer, independently of page visibility. No standalone addDeal/updateContact action exists, so this iteration does not invent one.

Member writes derive the current CRM actor: existing HQ_ADMIN has GP/UN access, distributors/viewers have none. Brand filtering is a query preference, not authorization. Model contexts also support narrowed HQ brand access for regression fixtures; the Store never accepts caller-supplied permission overrides. Sales/member data collections and keys remain separate.

Only HQ_ADMIN may reset Sales or Member. Settings and topbar hide reset entries for other roles and require explicit confirmation. The reset action rechecks the live actor, including a role switch after opening a confirmation. Marketing reset behavior is unchanged. These are frontend product-simulation checks, NOT server authorization. Demo-user switching is deliberately available; LocalStorage can be edited by its user.

## LocalStorage recovery

Keys and schema versions are retained: Sales `kivisense-crm-prototype-v1` / version1; Member `kivisense-member-operations-v1` / version2. The Member key suffix is not its schema version. Valid existing data is loaded verbatim, without seed merging, date backfill or mount-time rewriting.

Only a missing namespace initializes a seed. Damaged JSON, unknown versions and invalid required structures preserve the exact original string, expose a recovery issue and block regular commits. Recovery uses empty business collections, never replacement demo facts/zero statistics. Render-critical validation allows missing legacy creation dates; those remain unknown in period statistics. Recovery UI hides unknown counts and offers confirmed administrator reset in Settings. If Sales is unreadable, the shell uses seed demo actor/catalog metadata solely to make prototype recovery possible, not as recovered user business data or production identity.

Persistence occurs before publishing React state and the synchronous state reference. Save/quota failure commits no successful in-memory action and deletes nothing. Expected-raw comparison rejects an intervening local edit; storage events invalidate another tab's stale view. Reload is required before regular actions resume. Explicit reset overwrites only the selected key after confirmation; it does not remove it first, touch other keys or delete backups. This simple browser guard is NOT production concurrency control.

## Owner/distributor and Deal probability

`getAssignableOwnersForDistributor` serves Lead list/detail/conversion and Task controls. Owners must exist, have a writable role, and belong to the record's distributor—even for HQ. Task distributor is fixed; its owner and related record must remain in that distributor. Newly selected relation changes adjust form defaults; Store validation remains authoritative.

Probability is stage-derived, not manually editable: DISCOVERY20, SOLUTION40, QUOTATION60, NEGOTIATION75, WON100, LOST0. Ordinary stage editing cannot change a WON/LOST terminal stage (including switching one terminal outcome into another). Reopen is not implemented. Loading legacy data does not rewrite it; a valid explicit Deal write applies the stage-derived probability. Existing unchanged catalog references stay editable after their product/Add-on is disabled; new selections must be active/enabled.

## Purchase Intent creation and phone association

The lightweight HQ form creates an independent `user_purchase_intent` snapshot. SQL fields include brand, names, tel/tel_country_code, email, product_sku/model, numeric has_watch/accepts_marketing, personal_data_consent and supported existing optional fields. New rows use source2, hq_sync_status0, hq_ref/errorNULL and explicit current created_at/updated_at. No membership/customer is created or merged; no Sales Lead/Deal is created. Prototype string IDs and legacy name/phone/country_code aliases remain display adapters, not SQL schema changes. Intent areas_of_interest/favorite_series are compatibility-only legacy display fields, not SQL intent fields.

`matchPurchaseIntentMember` reads `sowind-read` (user_profile.tel and tel_country_code first, preserving explicit NULL; legacy aliases fall back only when SQL fields are absent). Comparison trims basic punctuation/separators and normalizes +86/0086/86. It requires the current brand and explicitly active user.is_deleted0; deleted, unknown deletion status, invalid brands and malformed ambiguous identities are not valid candidates.

- Zero candidates: create with user_idNULL.
- Exactly one valid candidate: link that user_id.
- Multiple candidates: create with user_idNULL and return an explicit pending-review warning; do not store it as a fabricated HQ synchronization failure.

The Intent's names, phone and product stay its own snapshot. Editing a profile does not overwrite an Intent, and editing an Intent does not overwrite profiles. Consent is not copied across brands. NULL is not globally rewritten to empty text or boolean; profile enums0/1/NULL differ from intent0/1/2. Legacy Intent NULL choices are preserved on load and displayed as readonly unknown values, never automatically corrected. New Intent enum writes require0/1/2: an explicit has_watch edit can correct legacy NULL to a valid value, but cannot write NULL or restore NULL afterwards. Unknown dictionaries retain raw codes with “字典待配置”. Import/mini-program entry points are not implemented here; future creation must reuse the same matching function.

Pending backend confirmation: SQL's `user_id` comment says administrator creation is unlinked, while the confirmed prototype rule attempts phone association. This iteration demonstrates the requested rule; it does not claim backend support or call real HQ/WeChat services.

## Shared metrics

`features/shared/sales-metrics.ts` supplies authorization, confirmedLeadConversion/confirmedConversions, dealOutcome, ratio and winRate. Conversion requires CONVERTED, an existing exactly matching reverse sourceLeadId, same distributor and unique IDs/forward/reverse relations across the full authorized dataset. A date or distributor filter cannot hide a conflicting authorized relationship. Management uses the shared current-stock query; Dashboard retains its created-in-period cohort. Both label their temporal basis.

Win rate is WON/(WON+LOST); open/unknown outcomes do not enter its denominator. Zero denominator displays “—”. Known future-created records are excluded from current stock; missing dates stay unfilled. Created cohorts, current stock and current outcomes of a created cohort remain distinct. See `DASHBOARD_METRICS.md` and `CRM_CORE_INTEGRITY_ACCEPTANCE.md`.
