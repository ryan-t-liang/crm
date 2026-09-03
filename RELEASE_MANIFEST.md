# Kivisense CRM 2.0 UAT Release Manifest

- Runtime: Node.js 22 or newer、MySQL 8.4
- Baseline migration: `20260904000000_kivisense_crm_v2_baseline`
- Frontend entry: `frontend/index.html`
- Application entry: `backend/dist/src/server.js`
- Target base path: `/crm_kivisense`
- Included secrets: none
- Included local database or storage: none

## Business Modules

- 客户联系人及追加式跟进
- 一个客户联系人关联多个线索
- 线索及追加式跟进
- 客户联系人和线索导入导出
- Session 登录、RBAC、账户、角色权限、审计日志

测试与部署结果以本次 UAT Deployment Report 为准。
