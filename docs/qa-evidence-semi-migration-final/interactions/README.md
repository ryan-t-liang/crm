# Semi Migration Final Interaction Regression

- Verdict: **PASS**
- Run: 2026-09-08T19:54:54.244Z
- Browser: Google Chrome via Playwright
- Cases: 20/20 passed
- Screenshots: 31
- Critical writes verified: 12
- QA login fixture: `QA Semi Login 8897213438` / `VIEWER` (login account and passwords omitted; final status DISABLED)
- QA contact: `QA-Semi-Contact-8897213438` (isolated record, soft-deleted after dependent scenarios)
- Imported QA contact: `QA-Semi-Import-0909134217` (one-row controlled XLSX, soft-deleted after persistence checks)
- Historical QA contact residuals: 0 (only records blocked from safe cleanup are retained)

No cookies, passwords, login accounts, authorization headers, storage-state contents, or request bodies are stored in this evidence. Only records with the reserved QA prefixes were mutated; existing business records were untouched.

## Re-run Prerequisites

Set `QA_PASSWORD` to the local server's configured initial password, `QA_STORAGE_STATE` to a temporary authenticated SUPER_ADMIN Playwright state outside this evidence directory, and `QA_IMPORT_FILE` to the controlled one-row contact XLSX. The harness reads runtime credentials and storage state without copying them into its output.

## Coverage

| ID | Scenario | Result | Assertions | Evidence |
| --- | --- | --- | ---: | --- |
| LOGIN-ERROR | 登录错误状态 | PASS | 2 | 01-login-error.png |
| LOGIN-SUCCESS | 登录成功并建立会话 | PASS | 4 | 02-login-success-password-gate.png |
| VIEWER-RBAC | VIEWER 强制改密与只读权限 | PASS | 14 | 03-viewer-contact-read-only.png |
| SIDEBAR-PERSISTENCE | Semi Navigation 侧栏折叠持久化 | PASS | 5 | 04-sidebar-collapsed.png |
| NAVIGATION | Semi Navigation 路由切换 | PASS | 3 | 05-navigation-contacts.png |
| LIST-CONTROLS | 列表搜索、筛选与分页 | PASS | 6 | 06-contacts-page-2.png, 07-contacts-filter-search.png |
| CONTACT-CREATE | 联系人 SideSheet 与 EntityCombobox 清除 | PASS | 10 | 08-contact-combobox-cleared-validation.png, 09-contact-created-list.png |
| CONTACT-EDIT | 联系人编辑 SideSheet 持久化 | PASS | 3 | 10-contact-edit-persisted.png |
| DATE-UPLOAD | Semi DatePicker 与 Upload 跟进持久化 | PASS | 11 | 11-followup-datepicker-open.png, 12-followup-date-file-ready.png, 13-followup-visible-journey.png, 14-followup-reload-persisted.png |
| DETAIL-TABS | Semi Tabs 详情切换 | PASS | 2 | 15-contact-detail-tabs.png |
| ROW-ACTION-MODAL | 行操作 Dropdown 与确认 Modal | PASS | 4 | 16-row-dropdown-delete-modal.png |
| BATCH-ASSIGN | Semi Table 批量分配与持久化 | PASS | 8 | 17-contact-batch-assigned-viewer.png |
| IMPORT-COMPLETE | Semi Upload 完整导入与持久化 | PASS | 14 | 18-import-sidesheet-file-selected.png, 19-import-preflight-ready.png, 20-import-execute-completed.png, 21-import-contact-visible-list.png |
| EXPORT-SIDESHEET | 导出 SideSheet、任务与重载持久化 | PASS | 6 | 22-export-sidesheet-estimate.png, 23-export-completed.png, 24-export-history-reload.png |
| ROLE-PERMISSIONS | 角色权限 SideSheet | PASS | 2 | 25-role-permission-sidesheet.png |
| AUDIT-COLLAPSE | 审计详情 Semi Collapse | PASS | 3 | 26-audit-collapse-expanded.png |
| RESPONSIVE-RUNTIME | 核心页面响应式溢出与运行时检查 | PASS | 6 | 27-opportunity-detail-1024.png |
| IMPORTED-CONTACT-DELETE | 导入联系人真实软删除 | PASS | 6 | 28-imported-contact-delete-confirmation.png, 29-imported-contact-deleted-after-reload.png |
| QA-CONTACT-DELETE | 本轮联系人真实软删除 | PASS | 6 | 30-qa-contact-delete-confirmation.png, 31-qa-contact-deleted-after-reload.png |
| FIXTURE-CLEANUP | QA 账号停用与夹具清理核验 | PASS | 5 | - |

## Verification Model

Critical writes were checked at four levels: visible UI state, successful HTTP response, persisted API state, and state after a page reload. The interaction run directly exercised Semi Navigation, Table, Pagination, Select, SideSheet, AutoComplete, DatePicker, Upload, Tabs, Dropdown, Modal, Checkbox, and Collapse. It also verifies sidebar persistence, first-login password change, VIEWER read-only RBAC, real batch assignment and restoration, full import preflight/execute, export history, and soft-delete filtering.

This report verifies the runtime component migration and interactions. Visual distinctiveness from the legacy layout is evaluated separately from whether Semi owns the underlying controls. Machine-readable details, including sanitized network diagnostics and build fingerprints, are in `results.json`. The complementary 22-route visual audit is in the parent directory's `README.md` and `runtime-audit.json`.
