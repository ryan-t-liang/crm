# Kivisense CRM Phase 3 Local Real UI E2E

- Run ID: 1788798302722
- Target: http://127.0.0.1:3311
- Browser: Chromium / Chrome
- Viewports: 1440x900, 1280x900, 1024x900
- Unexpected console errors: 0
- Unexpected HTTP 4xx/5xx: 0

## Results

- PASS: UI 登录
- PASS: 公司 Smart Views
- PASS: Company Create
- PASS: Company Edit
- PASS: Company Industry / Location Selector
- PASS: Company Logo object-contain
- PASS: Company ID Copy
- PASS: Contact BUSINESS Create
- PASS: Contact Edit
- PASS: Contact Fuzzy Company Linking
- PASS: Contact ID Copy
- PASS: Contact INDIVIDUAL Create
- PASS: MarketingLead Create
- PASS: MarketingLead Edit
- PASS: MarketingLead → MQL
- PASS: MarketingLead ID Copy
- PASS: No START_NURTURING UI
- PASS: MQL → SQL
- PASS: SQL → Opportunity
- PASS: Opportunity Create manually
- PASS: Opportunity Attachment
- PASS: Opportunity Stage
- PASS: Opportunity Followup + Task
- PASS: Opportunity ID Copy
- PASS: Assignment Notification
- PASS: Opportunity WON system date + Company CUSTOMER
- PASS: Export Filtered
- PASS: Export All
- PASS: Export Selected
- PASS: Export History
- PASS: Import
- PASS: Supplier Create
- PASS: Supplier Empty State + Toolbar
- PASS: Dashboard 4 Views + Owner Metrics
- PASS: Workbench Aggregation
- PASS: RBAC VIEWER read-only controls hidden
- PASS: Unexpected console/network errors = 0

## Three-layer evidence

Every critical write above is paired in results.json with the originating browser HTTP response and a direct database snapshot; the flow then reloads the record UI before PASS.

## Files

- company-detail-1440: artifacts/ui-refactor-v4-after/screenshots/01-company-detail-1440.png
- contact-business-detail-1440: artifacts/ui-refactor-v4-after/screenshots/02-contact-business-detail-1440.png
- marketing-lead-mql-detail-1440: artifacts/ui-refactor-v4-after/screenshots/03-marketing-lead-mql-detail-1440.png
- workbench-mql-1440: artifacts/ui-refactor-v4-after/screenshots/04-workbench-mql-1440.png
- opportunity-detail-1440: artifacts/ui-refactor-v4-after/screenshots/05-opportunity-detail-1440.png
- export-history-1440: artifacts/ui-refactor-v4-after/screenshots/06-export-history-1440.png
- supplier-empty-toolbar-1440: artifacts/ui-refactor-v4-after/screenshots/07-supplier-empty-toolbar-1440.png
- dashboard-team-1440: artifacts/ui-refactor-v4-after/screenshots/08-dashboard-team-1440.png
- company-list-1280: artifacts/ui-refactor-v4-after/screenshots/09-company-list-1280.png
- opportunity-detail-1280: artifacts/ui-refactor-v4-after/screenshots/10-opportunity-detail-1280.png
- dashboard-1280: artifacts/ui-refactor-v4-after/screenshots/11-dashboard-1280.png
- company-list-1024: artifacts/ui-refactor-v4-after/screenshots/12-company-list-1024.png
- opportunity-detail-1024: artifacts/ui-refactor-v4-after/screenshots/13-opportunity-detail-1024.png
- dashboard-1024: artifacts/ui-refactor-v4-after/screenshots/14-dashboard-1024.png
- viewer-read-only-1440: artifacts/ui-refactor-v4-after/screenshots/15-viewer-read-only-1440.png
- downloads/contacts-all_current_permission-1788798302722.xlsx (7645 bytes; SHA-256 79762cd86fdd851da044d4a53cfc657c494140f8349e2b2072906b42f6033959)
- downloads/contacts-filtered-1788798302722.xlsx (7645 bytes; SHA-256 ac705e79de705f1f99d4270cbba7fc7fd894b823a79e0621f653be81ff69cd7c)
- downloads/contacts-import-1788798302722.xlsx (9214 bytes; SHA-256 71a63c4c0ac9f4dd384a2a15a1323c1eb8c1724ea65f73f993a2139caf248760)
- downloads/contacts-selected-1788798302722.xlsx (7530 bytes; SHA-256 52019f4ddcb349d37b06b83675412d0ea938afea1d67f81b8bfd20fbb01e736b)
- downloads/contacts-template-1788798302722.xlsx (23020 bytes; SHA-256 ff5926073253ef2550224b8b92ce22ba1b2940f69cfe902358bf5c66d52e66c0)
