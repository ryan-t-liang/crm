# Phase 2 — Browser Evidence

Real browser, real local business APIs, isolated test data. No mutation suite runs on UAT. All screenshot URLs use local QA; their entity IDs identify the test record created or opened during that scenario, not a production record. Run mutation suites individually, at least one minute apart, to respect the unchanged server request/login limits.

## Scenario map

Company creation and company-scoped contact selection → Contact 360 → create a linked Lead → requirement text/files → followup → current task completion and next task → Contact/Company journey. IDs and exact URL transitions are in each result JSON. File-job tests additionally create an Organization → Contact → Lead from real XLSX imports, verify exported rows, upload/download matching bytes, then soft-delete only those disposable records.

1. Company: list/filter; inspect overview/journey/tasks; create task and company-scoped contact; separately validate Company form, edit, Logo and files.
2. Contact: create from company selector; switch tabs and save; open 360; edit and verify persistence.
3. Lead: fuzzy-search contact email; create text plus attachment; edit; add followup and next action; assert task persistence and journey event.
4. Operations: inspect four pools; create task and nurture; postpone, record followup, verify current task completed/new task created, then complete it; open Supplier as Company.
5. System: login; create/edit/disable/enable/reset disposable account; inspect/save unchanged role policy; inspect audit; first-login change password; SALES/VIEWER navigation and hidden actions.
6. Jobs/files/deletion: download templates, preview/execute imports, parse exports; text/PNG/WebM upload/download byte comparison; named file and row deletion.
7. Responsive: three widths, detailed measurements in manifest and results. Table-internal scrolling is intentional.

## Results

| Suite | Checks | Result |
| --- | ---: | --- |
| [phase2a-browser-results.json](phase2a-browser-results.json) | 12 | PASS |
| [phase2bc-browser-results.json](phase2bc-browser-results.json) | 15 | PASS |
| [phase2d-browser-results.json](phase2d-browser-results.json) | 11 | PASS |
| [phase2e-browser-results.json](phase2e-browser-results.json) | 14 | PASS |
| [phase2-files-jobs-delete-results.json](phase2-files-jobs-delete-results.json) | 21 | PASS |
| [phase2-responsive-company-results.json](phase2-responsive-company-results.json) | 30 | PASS |

## Ordered screenshots

Screenshots capture actual intermediate states; some include deliberately triggered validation feedback. The manifest records dimensions, hashes and scenario URLs. See [issues](issues.md) for historical failed runs and their retests.

### 01-dashboard-1440

![01-dashboard-1440](01-dashboard-1440.png)

### 02-company-list-1024

![02-company-list-1024](02-company-list-1024.png)

### 02-company-list-1280

![02-company-list-1280](02-company-list-1280.png)

### 02-company-list-1440

![02-company-list-1440](02-company-list-1440.png)

### 03-company-filter-high-fit

![03-company-filter-high-fit](03-company-filter-high-fit.png)

### 04-company-360-overview

![04-company-360-overview](04-company-360-overview.png)

### 05-company-journey

![05-company-journey](05-company-journey.png)

### 06-company-tasks

![06-company-tasks](06-company-tasks.png)

### 07-company-task-dialog

![07-company-task-dialog](07-company-task-dialog.png)

### 08-company-contact-form

![08-company-contact-form](08-company-contact-form.png)

### 09-contact-list-1024

![09-contact-list-1024](09-contact-list-1024.png)

### 09-contact-list-1280

![09-contact-list-1280](09-contact-list-1280.png)

### 09-contact-list-1440

![09-contact-list-1440](09-contact-list-1440.png)

### 10-contact-360

![10-contact-360](10-contact-360.png)

### 11-lead-list-1024

![11-lead-list-1024](11-lead-list-1024.png)

### 11-lead-list-1280

![11-lead-list-1280](11-lead-list-1280.png)

### 11-lead-list-1440

![11-lead-list-1440](11-lead-list-1440.png)

### 12-lead-create-combobox

![12-lead-create-combobox](12-lead-create-combobox.png)

### 13-lead-detail

![13-lead-detail](13-lead-detail.png)

### 14-lead-edit

![14-lead-edit](14-lead-edit.png)

### 15-lead-followup

![15-lead-followup](15-lead-followup.png)

### 16-contact-journey

![16-contact-journey](16-contact-journey.png)

### 17-customer-operations

![17-customer-operations](17-customer-operations.png)

### 18-reactivation

![18-reactivation](18-reactivation.png)

### 19-nurture

![19-nurture](19-nurture.png)

### 20-nurture-pool

![20-nurture-pool](20-nurture-pool.png)

### 21-workbench

![21-workbench](21-workbench.png)

### 22-suppliers-1024

![22-suppliers-1024](22-suppliers-1024.png)

### 22-suppliers-1280

![22-suppliers-1280](22-suppliers-1280.png)

### 22-suppliers-1440

![22-suppliers-1440](22-suppliers-1440.png)

### 23-login

![23-login](23-login.png)

### 24-accounts

![24-accounts](24-accounts.png)

### 25-roles

![25-roles](25-roles.png)

### 26-role-permissions

![26-role-permissions](26-role-permissions.png)

### 27-audit

![27-audit](27-audit.png)

### 28-force-password

![28-force-password](28-force-password.png)

### 29-sales-permission-surface

![29-sales-permission-surface](29-sales-permission-surface.png)

### 29-viewer-permission-surface

![29-viewer-permission-surface](29-viewer-permission-surface.png)

### 30-contacts-import-preview

![30-contacts-import-preview](30-contacts-import-preview.png)

### 30-leads-import-preview

![30-leads-import-preview](30-leads-import-preview.png)

### 30-organizations-import-preview

![30-organizations-import-preview](30-organizations-import-preview.png)

### 31-contacts-import-result

![31-contacts-import-result](31-contacts-import-result.png)

### 31-leads-import-result

![31-leads-import-result](31-leads-import-result.png)

### 31-organizations-import-result

![31-organizations-import-result](31-organizations-import-result.png)

### 32-contextual-attachments

![32-contextual-attachments](32-contextual-attachments.png)

### 34-contacts-delete-confirm

![34-contacts-delete-confirm](34-contacts-delete-confirm.png)

### 34-leads-delete-confirm

![34-leads-delete-confirm](34-leads-delete-confirm.png)

### 34-organizations-delete-confirm

![34-organizations-delete-confirm](34-organizations-delete-confirm.png)

### 35-company-form-notes-logo

![35-company-form-notes-logo](35-company-form-notes-logo.png)

### 36-company-files

![36-company-files](36-company-files.png)

### 37-accounts-1024

![37-accounts-1024](37-accounts-1024.png)

### 37-accounts-1280

![37-accounts-1280](37-accounts-1280.png)

### 37-accounts-1440

![37-accounts-1440](37-accounts-1440.png)

### 37-audit-1024

![37-audit-1024](37-audit-1024.png)

### 37-audit-1280

![37-audit-1280](37-audit-1280.png)

### 37-audit-1440

![37-audit-1440](37-audit-1440.png)

### 37-contacts-1024

![37-contacts-1024](37-contacts-1024.png)

### 37-contacts-1280

![37-contacts-1280](37-contacts-1280.png)

### 37-contacts-1440

![37-contacts-1440](37-contacts-1440.png)

### 37-dashboard-1024

![37-dashboard-1024](37-dashboard-1024.png)

### 37-dashboard-1280

![37-dashboard-1280](37-dashboard-1280.png)

### 37-dashboard-1440

![37-dashboard-1440](37-dashboard-1440.png)

### 37-leads-1024

![37-leads-1024](37-leads-1024.png)

### 37-leads-1280

![37-leads-1280](37-leads-1280.png)

### 37-leads-1440

![37-leads-1440](37-leads-1440.png)

### 37-operations-1024

![37-operations-1024](37-operations-1024.png)

### 37-operations-1280

![37-operations-1280](37-operations-1280.png)

### 37-operations-1440

![37-operations-1440](37-operations-1440.png)

### 37-organizations-1024

![37-organizations-1024](37-organizations-1024.png)

### 37-organizations-1280

![37-organizations-1280](37-organizations-1280.png)

### 37-organizations-1440

![37-organizations-1440](37-organizations-1440.png)

### 37-roles-1024

![37-roles-1024](37-roles-1024.png)

### 37-roles-1280

![37-roles-1280](37-roles-1280.png)

### 37-roles-1440

![37-roles-1440](37-roles-1440.png)

### 37-workbench-1024

![37-workbench-1024](37-workbench-1024.png)

### 37-workbench-1280

![37-workbench-1280](37-workbench-1280.png)

### 37-workbench-1440

![37-workbench-1440](37-workbench-1440.png)
