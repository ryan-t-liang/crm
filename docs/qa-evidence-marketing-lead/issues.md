# Browser QA issue log

## MKT-UI-001 — Marketing Lead detail rendered blank

- Severity: P0
- Found in: local built application, list → Marketing Lead detail
- Expected: the selected Marketing Lead detail loads with actions, scores, tabs, and original inquiry.
- Actual: the page became blank and the console reported React error 310.
- Root cause: `useMemo` was called after list/detail conditional returns, changing Hook order when navigating within the persistent React shell.
- Fix: call the journey `useMemo` unconditionally and return an empty journey while detail data is absent.
- Retest: PASS from the original list entry and on direct detail refresh; the fresh automated browser run completed 23 checks with zero page/console errors.
- Evidence: `local/05-marketing-lead-detail-qualified-1440.png`, `local/results.json`.

## Test harness note — strict locator ambiguity

The first evidence run completed conversion but stopped because “来源线索” appeared as both a section heading and a field label. The selector was narrowed to the heading and the full scenario was rerun from a fresh Qualified fixture. Final product verdict is based only on the second run's `PASS` result.

## MKT-RBAC-002 — SALES scoring-rule page returned 403

- Severity: P0 for required SALES behavior recording.
- Found in: deployed UAT read-only three-role review.
- Expected: SALES can view enabled behavior labels but cannot manage rules or include disabled rules.
- Actual: the page requested `includeDisabled=false` and received 403.
- Root cause: `z.coerce.boolean()` treated the non-empty string `"false"` as `true`, invoking the management-only guard.
- Fix: parse only the literal query strings `true` and `false`, then transform them to a boolean.
- Regression: integration coverage asserts SALES receives 200 for `includeDisabled=false` and 403 for `includeDisabled=true`.
- UAT retest: pending the hotfix release; only the post-hotfix run may close this issue.
