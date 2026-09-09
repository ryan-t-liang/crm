# Semi Design migration final browser audit

This directory is the final, read-only browser evidence for the Kivisense CRM 2.0 Semi Design migration. The audited production build passes all 22 captured cases. No open functional or design-consistency defect was found in the rendered states covered by this pass.

The machine-readable measurements are in [runtime-audit.json](runtime-audit.json), the deterministic capture harness is in [capture.mjs](capture.mjs), and the issue record is in [issues.md](issues.md).

## Verdict

| Result | Count |
| --- | ---: |
| Cases | 22 |
| Passed | 22 |
| Failed | 0 |
| Blocked | 0 |

Verdict: **PASS** for the captured routes, viewports, and initial rendered states.

## Environment

- Base URL: `http://127.0.0.1:3000`
- Capture time: 2026-09-09 01:19:23 Asia/Shanghai (`2026-09-08T17:19:23.742Z`)
- Browser: Google Chrome through Playwright, headless
- Authenticated session: `Semi QA Admin`, role `SUPER_ADMIN`, 52 permissions
- Authenticated state: supplied explicitly through `QA_STORAGE_STATE`; cookie contents and the storage-state path are not emitted into evidence
- Login state: separate, isolated unauthenticated browser contexts
- Viewports: `1024x768` and `1440x900`
- Test mode: read-only first-render visual/runtime audit

### Audited build

| Artifact | Modified at (Asia/Shanghai) | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `frontend/react-build/index.html` | 2026-09-09 01:01:15 | 645 | `848769745339ae81bc87a26a3798c8c40e419fbd9e354849ddee652a900c869f` |
| `frontend/react-build/assets/app.js` | 2026-09-09 01:01:15 | 1,442,784 | `971bde2a42733e3237a3d378f8e15ff2b4e0b10fa75316a9e2d716215959e006` |
| `frontend/react-build/assets/app.css` | 2026-09-09 01:01:15 | 634,769 | `288d85f7a71a4d1de3b038b0fc81fd4cc4e25caf040f3c4d6fcf7f28850945a7` |

No frontend source file was newer than the audited JavaScript artifact when capture started.

## Cache-disabled methodology

The run was configured to exercise the current production artifacts instead of accepting a stale browser result:

1. Chrome DevTools Protocol `Network.setCacheDisabled` was enabled.
2. Requests carried `Cache-Control: no-cache` and `Pragma: no-cache`.
3. Service workers were blocked/bypassed for the capture contexts.
4. Each navigation used a unique `finalAudit` query value.
5. Authenticated and unauthenticated checks ran in separate browser contexts.
6. Every case captured a viewport PNG plus DOM geometry, overflow, console, page-error, HTTP-failure, and request-failure records.
7. Every visible `role="combobox"` control was checked for a resolvable `aria-label`, `aria-labelledby`, or explicit HTML label.

The harness deliberately has no default session path. Run it with a storage-state file kept outside committed evidence:

```bash
QA_STORAGE_STATE=/secure/path/browser-state.json \
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
node docs/qa-evidence-semi-migration-final/capture.mjs
```

If `QA_STORAGE_STATE` is missing or unreadable, the harness stops before browser startup with a clear error. The storage-state JSON contains an authenticated session and must not be committed.

## Where the Semi migration is visible

This migration changes the component foundation while preserving CRM information architecture and domain behavior. It is therefore expected that page names, business fields, record layouts, and Kivisense's restrained visual language remain recognizable. The implementation is nevertheless verifiably Semi-based:

- `frontend-react/package.json` declares `@douyinfe/semi-ui` and `@douyinfe/semi-icons` at `^2.103.0`.
- The shared CRM layer under `frontend-react/src/components/crm/` contains 12 modules. Its controls are backed by Semi Button, Input, TextArea, Select, DatePicker, Checkbox, Card, Tag, Avatar, Banner, Skeleton, Upload, Form, Modal, SideSheet, Tabs, Steps, Descriptions, Popover, Empty, Timeline, Dropdown, Pagination, and Table components.
- `frontend-react/src/components/crm/data-table.tsx` uses Semi `Table`, `Checkbox`, `Dropdown`, and `Pagination`, including column visibility, row selection, horizontal containment, and a fixed action column.
- The application shell uses Semi `Nav`, `Breadcrumb`, `Avatar`, `Button`, `Dropdown`, `Tag`, and Semi Icons. The sidebar switches from a labeled navigation panel at 1440px to an icon rail at 1024px.
- Dashboard, workbench, formal CRM list/detail pages, supplier, account, role, scoring-rule, audit, and login surfaces all render through the same CRM component and token layer.
- A static source scan found 14 files importing Semi UI and 19 files importing Semi Icons. It found zero formal runtime imports of `components/v1/ui`, `lucide-react`, `@tanstack/react-table`, or Radix UI.

The user-visible evidence includes the shared navigation/active states, Semi form controls, column controller, table selection and pagination, fixed row actions, status tags, empty states, detail tabs, role Collapse behavior, and consistent login controls. The migration is not intended to replace the approved Kivisense product language with Semi's demo styling.

## Automated runtime gate

| Check | Result |
| --- | ---: |
| Route/view combinations captured | 22 / 22 |
| Route load failures | 0 |
| Document-level horizontal overflow | 0 |
| Interactive overlap candidates | 0 |
| Header/region overlap candidates | 0 |
| Elements escaping the viewport | 0 |
| Automated clipped-text candidates | 0 |
| Visible comboboxes checked | 16 |
| Comboboxes without an accessible name | 0 |
| Unexpected console errors | 0 |
| Console warnings | 0 |
| Uncaught page errors | 0 |
| Unexpected HTTP responses >= 400 | 0 |
| Failed requests | 0 |
| Expected unauthenticated `/api/v1/auth/me` 401 responses | 2 |
| Expected browser resource-console messages for those 401 responses | 2 |

The two 401 responses are the expected unauthenticated session probe used to decide that the login page must be shown. They occurred once in each isolated login-page case and are not defects.

At 1024px, wide list tables are contained inside their table workspace and keep the action column fixed. Some non-primary columns require table-level horizontal scrolling; the document itself does not overflow.

## Case results

| ID | Module / state | Priority | Viewport | Context | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| SEMI-FINAL-001 | Dashboard | P0 | 1024x768 | Authenticated | PASS | [01](01-dashboard-1024x768.png) |
| SEMI-FINAL-002 | Workbench | P0 | 1024x768 | Authenticated | PASS | [02](02-workbench-1024x768.png) |
| SEMI-FINAL-003 | Organizations list | P0 | 1024x768 | Authenticated | PASS | [03](03-organizations-list-1024x768.png) |
| SEMI-FINAL-004 | Organization detail | P0 | 1024x768 | Authenticated | PASS | [04](04-organization-detail-1024x768.png) |
| SEMI-FINAL-005 | Contacts list | P0 | 1024x768 | Authenticated | PASS | [05](05-contacts-list-1024x768.png) |
| SEMI-FINAL-006 | Contact detail | P0 | 1024x768 | Authenticated | PASS | [06](06-contact-detail-1024x768.png) |
| SEMI-FINAL-007 | Marketing leads list | P0 | 1024x768 | Authenticated | PASS | [07](07-marketing-leads-list-1024x768.png) |
| SEMI-FINAL-008 | Marketing lead detail | P0 | 1024x768 | Authenticated | PASS | [08](08-marketing-lead-detail-1024x768.png) |
| SEMI-FINAL-009 | Opportunities list | P0 | 1024x768 | Authenticated | PASS | [09](09-opportunities-list-1024x768.png) |
| SEMI-FINAL-010 | Opportunity detail | P0 | 1024x768 | Authenticated | PASS | [10](10-opportunity-detail-1024x768.png) |
| SEMI-FINAL-011 | Suppliers | P1 | 1440x900 | Authenticated | PASS | [11](11-suppliers-1440x900.png) |
| SEMI-FINAL-012 | Suppliers | P1 | 1024x768 | Authenticated | PASS | [12](12-suppliers-1024x768.png) |
| SEMI-FINAL-013 | Account management | P1 | 1440x900 | Authenticated | PASS | [13](13-accounts-1440x900.png) |
| SEMI-FINAL-014 | Account management | P1 | 1024x768 | Authenticated | PASS | [14](14-accounts-1024x768.png) |
| SEMI-FINAL-015 | Roles and permissions | P1 | 1440x900 | Authenticated | PASS | [15](15-roles-1440x900.png) |
| SEMI-FINAL-016 | Roles and permissions | P1 | 1024x768 | Authenticated | PASS | [16](16-roles-1024x768.png) |
| SEMI-FINAL-017 | Scoring rules | P1 | 1440x900 | Authenticated | PASS | [17](17-scoring-rules-1440x900.png) |
| SEMI-FINAL-018 | Scoring rules | P1 | 1024x768 | Authenticated | PASS | [18](18-scoring-rules-1024x768.png) |
| SEMI-FINAL-019 | Audit log | P1 | 1440x900 | Authenticated | PASS | [19](19-audit-1440x900.png) |
| SEMI-FINAL-020 | Audit log | P1 | 1024x768 | Authenticated | PASS | [20](20-audit-1024x768.png) |
| SEMI-FINAL-021 | Login | P0 | 1440x900 | Unauthenticated | PASS | [21](21-login-1440x900.png) |
| SEMI-FINAL-022 | Login | P0 | 1024x768 | Unauthenticated | PASS | [22](22-login-1024x768.png) |

## Screenshot evidence

### Core CRM at 1024x768

1. Dashboard

   ![Dashboard at 1024x768](01-dashboard-1024x768.png)

2. Workbench

   ![Workbench at 1024x768](02-workbench-1024x768.png)

3. Organizations list

   ![Organizations list at 1024x768](03-organizations-list-1024x768.png)

4. Organization detail

   ![Organization detail at 1024x768](04-organization-detail-1024x768.png)

5. Contacts list

   ![Contacts list at 1024x768](05-contacts-list-1024x768.png)

6. Contact detail

   ![Contact detail at 1024x768](06-contact-detail-1024x768.png)

7. Marketing leads list

   ![Marketing leads list at 1024x768](07-marketing-leads-list-1024x768.png)

8. Marketing lead detail

   ![Marketing lead detail at 1024x768](08-marketing-lead-detail-1024x768.png)

9. Opportunities list

   ![Opportunities list at 1024x768](09-opportunities-list-1024x768.png)

10. Opportunity detail

    ![Opportunity detail at 1024x768](10-opportunity-detail-1024x768.png)

### System and authentication surfaces

11. Suppliers at 1440x900

    ![Suppliers at 1440x900](11-suppliers-1440x900.png)

12. Suppliers at 1024x768

    ![Suppliers at 1024x768](12-suppliers-1024x768.png)

13. Account management at 1440x900

    ![Account management at 1440x900](13-accounts-1440x900.png)

14. Account management at 1024x768

    ![Account management at 1024x768](14-accounts-1024x768.png)

15. Roles and permissions at 1440x900

    ![Roles and permissions at 1440x900](15-roles-1440x900.png)

16. Roles and permissions at 1024x768

    ![Roles and permissions at 1024x768](16-roles-1024x768.png)

17. Scoring rules at 1440x900

    ![Scoring rules at 1440x900](17-scoring-rules-1440x900.png)

18. Scoring rules at 1024x768

    ![Scoring rules at 1024x768](18-scoring-rules-1024x768.png)

19. Audit log at 1440x900

    ![Audit log at 1440x900](19-audit-1440x900.png)

20. Audit log at 1024x768

    ![Audit log at 1024x768](20-audit-1024x768.png)

21. Login at 1440x900

    ![Login at 1440x900](21-login-1440x900.png)

22. Login at 1024x768

    ![Login at 1024x768](22-login-1024x768.png)

## Manual visual review

- Dashboard composition is restored: the trend panel, metric selector, KPI row, chart, team panel, and funnel sections have visible hierarchy at 1024px.
- Workbench metrics, task queue, empty state, and action rail remain usable at 1024px.
- Core list and detail pages retain readable headers, actions, filters, tabs, metadata, status treatment, pagination, and fixed row actions.
- Contact detail uses the available relationship workspace and no longer wraps the email into an awkward fragment.
- Supplier, account, role, scoring-rule, and audit pages share the same Kivisense shell, spacing, table, status, and action language at both audited widths.
- The supplier empty state reads `暂无供应商` at both 1440px and 1024px; the earlier `暂无组织` wording was corrected before this final run.
- All 16 visible Semi Select/combobox instances exposed a resolvable accessible name after the shared Select adapter fix.
- The login form is centered, contained, and consistent with the product's typography, border, control, and primary-action treatment at both widths.
- No S1, S2, S3, or S4 defect remains open in the captured states.

## Corrections to the prior baseline

- Prior `VIS-001` (collapsed Dashboard composition): **fixed** in this build.
- Prior `VIS-002` and `VIS-003` (contact relationship-table width and narrow metadata wrapping): **fixed** in this build.
- Prior `VIS-004` (`公司` versus `组织`): **not applicable**. The approved current product term is `组织`, and the audited UI uses it consistently.
- `SEMI-FINAL-DEFECT-001` (supplier empty state said `暂无组织`): **fixed and retested** in this build at both audited widths.

## Coverage limits

- This was a read-only audit of the initial rendered state. It did not submit login, create/edit forms, imports, exports, uploads, deletes, follow-ups, permission changes, or scoring-rule mutations.
- It did not exhaustively exercise dropdowns, column toggles, modal/SideSheet placement, form validation, keyboard navigation, focus order, screen readers beyond the automated combobox-name check, or persistence after reload.
- The ten core CRM routes were captured at `1024x768`; the selected system and login routes were captured at both `1440x900` and `1024x768`. No viewport below 1024px was in scope.
- Only the available super-admin fixture was rendered. Role-specific visibility and denied states need a separate RBAC interaction pass.
- Table-level horizontal scrolling was visually assessed at its initial position but was not drag-tested across every wide column set.
- Geometry heuristics reduce the risk of missed overlap and clipping but do not replace interaction and accessibility testing.
- Performance, Web Vitals, localization variants, browser-engine compatibility, and high-zoom behavior were outside this pass.

Recommended next pass: targeted authenticated interaction coverage for create/edit validation, overlays, imports/exports, row selection, column visibility, RBAC variants, and mutation persistence.
