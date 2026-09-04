# Kivisense CRM 2.0 Field Alignment & Completion Report

## 1. Git

- Repository: `https://github.com/ryan-t-liang/crm.git`
- Working branch: `codex/kivisense-crm-v2-v1-ui-rebuild`
- Previously deployed commit: `ef37b4f1dd79e8f38094f66d83dc65b923a2b4f5`
- Field-aligned application commit: `6176970d139e494b0a608b9a99ea23f5574d034d`
- Backup branch: `backup/kivisense-crm-v2-before-field-alignment` at `1ea68316dba9108f68cb28ddeb08bd51ce0c16e8`
- `main` was not modified. Tag `Kivisense_CRM_v1` remains at `f5cc0eaa4cf567efcbd5dabd79294f5969c4b9d7`.
- The field-aligned application commit was pushed to the working branch before UAT deployment.

## 2. Excel Source Audit

- Source read from: `弥知科技Kivisense项目看板 - 表头.xlsx`.
- The available file name omits the requested `(1)` suffix, but all sheet names and audited headers match.
- SHA-256: `398254fe6c0735ca6759046f93418863b4f13546e36844d455df4fde37d19552`.
- `🚀客户CRM!A1:AE2`: **31 / 31** headers matched and classified.
- `Leadsbook 2025!A1:AR2`: **44 / 44** headers matched and classified.
- `销售工具内容管理` was inspected only as the future target of `A 销售内容关联`; no Sales Content module was created.

## 3. Field Dictionary

Canonical review document: [crm-2.0-field-dictionary.md](crm-2.0-field-dictionary.md).

The dictionary was created before business-code changes and is enforced by `npm run test:field-dictionary`. It also records fixed field types, extra existing/system fields, relation rules, attachment contracts, import/export rules, UI placement, and completion counts.

## 4. Contact Field Mapping

| # | Source | Target | Type | Final status |
|---:|---|---|---|---|
| 1 | 创建时间 | `createdAt` | SYSTEM_DATETIME | IMPLEMENTED |
| 2 | C客户联系人 | `contactName` | TEXT | IMPLEMENTED |
| 3 | C触达阶段 | `stage` | SELECT | IMPLEMENTED |
| 4 | C品牌名称/公司简称 | `companyShortName` | TEXT | IMPLEMENTED |
| 5 | C部门 | `department` | TEXT | IMPLEMENTED |
| 6 | C公司名称 | `companyName` | TEXT | IMPLEMENTED |
| 7 | C 职务Tittle | `title` | TEXT | IMPLEMENTED |
| 8 | F次回跟进日期 | `nextFollowupAt` | DATETIME | IMPLEMENTED |
| 9 | F跟进人员 | `ownerUserId` | USER | IMPLEMENTED |
| 10 | F 会议minutes文件 | `meetingMinutesFiles` | ATTACHMENT | IMPLEMENTED |
| 11 | F跟进注意 | `followupAttention` | LONG_TEXT | IMPLEMENTED |
| 12 | F备注/初次获取的信息 | `initialContext` | LONG_TEXT | IMPLEMENTED |
| 13 | A Leadsbook关联 | `leads` | RELATION | RELATION |
| 14 | C Linkedin | `linkedin` | URL | IMPLEMENTED |
| 15 | C website | `website` | URL | IMPLEMENTED |
| 16 | C 部门区域 | `region` | TEXT | IMPLEMENTED |
| 17 | C City城市 | `city` | TEXT | IMPLEMENTED |
| 18 | C email | `email` | EMAIL | IMPLEMENTED |
| 19 | C 电话 | `phone` | PHONE | IMPLEMENTED |
| 20 | C 微信（群聊中选择） | `wechat` | TEXT | IMPLEMENTED |
| 21 | C 客户行业 | `industry` | SELECT | IMPLEMENTED |
| 22 | C 客户来源 | `source` | SELECT | IMPLEMENTED |
| 23 | C 国家/城市 | `country` + `city` | TEXT | IMPLEMENTED / TRANSFORM |
| 24 | 创建人 | `createdByUserId` | SYSTEM_USER | IMPLEMENTED |
| 25 | 最后编辑时间 | `updatedAt` | SYSTEM_DATETIME | IMPLEMENTED |
| 26 | A 成本管理关联 | `costRelations` | RELATION | DEFERRED |
| 27 | A 项目评估关联 | `projectAssessmentRelations` | RELATION | DEFERRED |
| 28 | A 合同管理关联 | `contractRelations` | RELATION | DEFERRED |
| 29 | A 销售内容关联 | `salesContentRelations` | RELATION | DEFERRED |
| 30 | A 成本管理关联-----成本管理----(副本) | — | RELATION | DUPLICATE |
| 31 | A 成本管理关联-----成本管理----(副本) | — | RELATION | DUPLICATE |

## 5. Lead Field Mapping

| # | Source | Target | Type | Final status |
|---:|---|---|---|---|
| 1 | 创建时间 | `createdAt` | SYSTEM_DATETIME | IMPLEMENTED |
| 2 | R最近一次沟通 | `lastFollowupAt` | COMPUTED | COMPUTED |
| 3 | L 客户联系人 | `contactId` | RELATION | RELATION |
| 4 | R leads项目需求简述 | `requirementSummary` | TEXT | IMPLEMENTED |
| 5 | A公司名称 | `contact.companyName` | COMPUTED | COMPUTED |
| 6 | R 预计次回沟通日期 | `nextFollowupAt` | DATETIME | IMPLEMENTED |
| 7 | A品牌 | `contact.companyShortName` | COMPUTED | COMPUTED |
| 8 | A客户微信 于客户CRM表填写 | `contact.wechat` | COMPUTED | COMPUTED |
| 9 | R需求整理 | `requirementDetail` | LONG_TEXT | IMPLEMENTED |
| 10 | R需求/签署文件 | `requirementFiles` | ATTACHMENT | IMPLEMENTED |
| 11 | R图片需求 | `requirementImages` | IMAGE | IMPLEMENTED |
| 12 | R正式方案 | `proposalFiles` | ATTACHMENT | IMPLEMENTED |
| 13 | R最新进度 | `latestProgress` | LONG_TEXT | IMPLEMENTED |
| 14 | R重要性 | `priority` | SELECT | IMPLEMENTED |
| 15 | 客户来源 | `leadSource` | SELECT | IMPLEMENTED |
| 16 | R预计报价 | `estimatedQuote` + `currency` | CURRENCY | IMPLEMENTED |
| 17 | R报价单 | `quotationFiles` | ATTACHMENT | IMPLEMENTED |
| 18 | F销售对接人 | `salesOwnerUserId` | USER | IMPLEMENTED |
| 19 | F跟进对接人 | `followupOwnerUserId` | USER | IMPLEMENTED |
| 20 | F对接群（可添加外部群） | `collaborationGroups` | MULTI_TEXT | IMPLEMENTED |
| 21 | F日常跟进记录 | `followups[important=false]` | RELATION | RELATION |
| 22 | R重要跟进记录 | `followups[important=true]` | RELATION | RELATION |
| 23 | A成交日期 | `wonAt` | DATETIME | IMPLEMENTED |
| 24 | A跟进：交付跟进日期 | `deliveryFollowupAt` | DATETIME | IMPLEMENTED |
| 25 | A跟进：合同续约日期 | `contractRenewalAt` | DATETIME | IMPLEMENTED |
| 26 | 跟进节点3 | — | DATETIME | NEED_CONFIRMATION |
| 27 | 跟进节点4 | — | DATETIME | NEED_CONFIRMATION |
| 28 | 跟进节点3 1 | — | DATETIME | NEED_CONFIRMATION |
| 29 | 跟进节点4 1 | — | DATETIME | NEED_CONFIRMATION |
| 30 | 跟进节点5-合同到期 1 | — | DATETIME | NEED_CONFIRMATION |
| 31 | 收款日期 | `paymentReceivedAt` | DATETIME | IMPLEMENTED |
| 32 | R项目领域 | `projectDomain` | SELECT | IMPLEMENTED |
| 33 | R项目类型 | `projectType` | SELECT | IMPLEMENTED |
| 34 | 技术类型 | `technologyType` | MULTI_SELECT | IMPLEMENTED |
| 35 | 产品类型 | `productType` | SELECT | IMPLEMENTED |
| 36 | 产品名称 | `productName` | TEXT | IMPLEMENTED |
| 37 | 合同管理关联 | `contractRelations` | RELATION | DEFERRED |
| 38 | F跟单模式 | `followMode` | SELECT | IMPLEMENTED |
| 39 | R资源需求 | `resourceRequirement` | LONG_TEXT | IMPLEMENTED |
| 40 | R Leads参与人员 | `participantUserIds` | MULTI_USER | IMPLEMENTED |
| 41 | A成本关联 | `costRelations` | RELATION | DEFERRED |
| 42 | A 项目评估表关联 | `projectAssessmentRelations` | RELATION | DEFERRED |
| 43 | A成本关联-----成本管理----(副本) | — | RELATION | DUPLICATE |
| 44 | A成本关联-----成本管理----(副本) | — | RELATION | DUPLICATE |

## 6. Duplicate / Dirty Fields

The following four source columns were classified but did not enter the database or UI:

- Contact: both occurrences of `A 成本管理关联-----成本管理----(副本)`.
- Lead: both occurrences of `A成本关联-----成本管理----(副本)`.
- No `countryCity` duplicate was added. The legacy `C 国家/城市` import maps only unambiguous data to `country` and `city`; ambiguous data is reported for correction.

## 7. Need Confirmation Fields

The following five Lead headers remain outside the database and editable UI because their business meaning is not proven:

- `跟进节点3`
- `跟进节点4`
- `跟进节点3 1`
- `跟进节点4 1`
- `跟进节点5-合同到期 1`

They do not block the explicitly mapped fields. No `followupNode3`-style speculative columns were created.

## 8. Attachment System

- One generic `CrmAttachment` model is used for Contact, Contact Followup, Lead, and Lead Followup entity types.
- Business fields are separated by `entityType + entityId + fieldKey`.
- Implemented fields: `meetingMinutesFiles`, `requirementFiles`, `requirementImages`, `proposalFiles`, and `quotationFiles`.
- Binary content is stored under private `storage/crm-attachments/`; the database stores metadata only.
- UI supports upload, pending state, file list, view/preview, download, delete, name, type, size, uploader, and upload time.
- Limit is configured by `CRM_ATTACHMENT_MAX_BYTES`; UAT is explicitly set to 52,428,800 bytes per file.

## 9. Attachment Types

- Documents: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT.
- Images: JPG, JPEG, PNG, WEBP, GIF, including thumbnail preview.
- Videos: MP4, MOV, WEBM, with browser controls where supported.
- Extension, declared MIME, and file signature are validated together. Field category rules further restrict image-only and quotation fields.
- Each attachment field accepts at most 20 files. The UAT Nginx CRM location is set to `55m` to admit the configured 50 MB application limit.

## 10. Created By

- Contact and Lead expose `createdBy`, `createdAt`, and `updatedAt` in weak system-information cards.
- ContactFollowup and LeadFollowup display `createdBy` and `createdAt` in their timelines.
- None of these system fields is user-editable.
- UI create operations record the current user; imports record the import executor; uploads record the current user.

## 11. Multi User

- `R Leads参与人员` is implemented as `CrmLeadParticipant`, not a text list.
- Unique key: `(leadId, userId)`.
- The form supports selecting multiple active CRM users and the detail view shows their names.
- Duplicate IDs are deduplicated; disabled users cannot be newly assigned.

## 12. Select / Multi Select

- Stable CRM lifecycle values continue to use the existing code-level status, stage, and priority options.
- Unproven business enumerations use string storage plus custom-capable Select controls; no new Prisma enum was guessed.
- `technologyType` is a custom-capable MULTI_SELECT with normalized unique newline-delimited storage and matching import/export behavior.
- Extensible fields include Contact industry/source and Lead leadSource/projectDomain/projectType/productType/productName/followMode.

## 13. Contact UI Modules

- Existing Kivisense V1 two-column structure, header, navigation, card density, typography, and tabs were preserved.
- Left: Contact profile; Customer profile plus CRM fields; weak System Information.
- Right tabs: Leads, Followup records, Notes, Audit records.
- Meeting Minutes is a real multi-file control. `followupAttention` is separate from timeline content.
- List metrics are independent white rounded cards. Batch import, export, row delete, filters, and contained table scrolling are present.

## 14. Lead UI Modules

- Left: Lead overview; Related Contact read-only card; weak System Information.
- Right tabs: Requirement information, Followup records, Notes, Audit records.
- Requirement information is grouped into A. Requirement content, B. Project classification, and C. Solution and commercial.
- Add Lead uses an accessible fuzzy-search Contact combobox instead of a full unfiltered list.
- Edit Lead exposes participants, collaboration groups, follow mode, milestones, classifications, and four field-specific attachment controls.
- List metrics are independent white rounded cards. Batch import, export, row delete, filters, and contained table scrolling are present.

## 15. Database Migration

- Migration: `20260904160000_crm_field_alignment` after `20260904130000_crm_deletes_and_lead_attachments`.
- Clean MySQL migration and an explicit upgrade-preservation scenario both passed locally.
- UAT migration used `prisma migrate deploy`; no reset, truncate, or destructive database command was run.
- UAT now records all three migrations as successfully finished.
- Existing UAT counts remained 2 Contacts and 2 Leads before and after migration.
- Upgrade test confirmed preservation of Contact, Lead, `technologyType`, and legacy attachment metadata.

## 16. Import / Export

- Contact and Lead XLSX templates, preflight, execution, export, and UI entry points include the aligned fields.
- Imported Contact and Lead rows use the import executor as `createdBy`.
- Multi-value cells use a documented newline-separated format.
- Attachment cells accept an external URL or blank. A filename without file content yields `ATTACHMENT_FILE_NOT_AVAILABLE` and never creates a fake file.
- Exports contain filename plus authenticated download URL, or the external URL; binary content and `storageKey` are never exported.

## 17. Security

- Attachment endpoints require session, permission, entity existence, entity access, matching entity ID, and matching field key.
- Local storage keys are generated server-side; user filenames never become paths.
- Path traversal, unsupported extensions, MIME spoofing, oversize files, wrong field categories, and IDOR attempts are rejected.
- Upload, download, and delete actions write metadata-only audit events.
- Contact/Lead deletion is permission-controlled and cascades relevant followups/relations; stored attachment files are cleaned up.
- VIEWER retains view/download access but cannot create, edit, delete, import, export, or remove attachments.

## 18. Tests

| Gate | Result |
|---|---|
| Field dictionary contract | PASS — 31 Contact + 44 Lead headers |
| Prisma schema validation | PASS |
| TypeScript lint | PASS |
| Build | PASS |
| Unit suite | PASS — 9 / 9 |
| MySQL integration suite | PASS — 18 / 18 |
| Frontend syntax/interaction contracts | PASS |
| Migration clean install | PASS |
| Migration upgrade preservation | PASS |
| `git diff --check` | PASS |

The dedicated database run explicitly enabled the normally skipped integration suites. Attachment cases cover PDF, DOCX, JPG/PNG, MP4, invalid extension, MIME spoof, oversize, IDOR, deletion, audit, preview, and storage cleanup. Full case evidence is in [crm-2.0-qa-evidence.md](crm-2.0-qa-evidence.md); resolved issues are in [crm-2.0-qa-issues.md](crm-2.0-qa-issues.md).

## 19. Browser Review

- Actual browser flows exercised Contact Detail, Contact Edit, Meeting Minutes chooser, Lead Detail, Lead Edit, fuzzy Contact search, attachment metadata/preview/actions, participants, import dialogs, System Information, and role-restricted UI.
- Responsive review passed at 1440×900, 1280×800, and 1024×768.
- There was no document-level horizontal overflow; wide tables scroll inside their cards.
- Browser console after the exercised flows contained 0 errors and 0 warnings.
- Eleven ordered screenshots are stored in [qa-evidence](qa-evidence/).

## 20. UAT Deployment

- URL: `https://www.gridworks.cn/crm_kivisense/`
- Deployment date: 2026-09-04 (Asia/Shanghai).
- Deployed application commit/image: `6176970d139e494b0a608b9a99ea23f5574d034d` / `kivisense-crm-uat:6176970d139e`.
- Pre-deployment backup: `/srv/kivisense-crm-uat-backups/20260904_161139_pre_6176970d139e`.
- Backup contains database SQL, complete application directory, attachment storage, Nginx configuration, previous image identity, and SHA-256 manifest; all integrity checks passed.
- HTTPS page and `/api/health` return 200 with `database: ok`.
- Real UAT SUPER_ADMIN smoke passed login, identity, Contacts list, Leads list, users list, and logout, all HTTP 200; no credential value was logged.
- Unauthenticated Contacts access returns 401.
- Nginx syntax passed and only the CRM location changed from `10m` to `55m`.
- Production and `main` were not changed.
- Capacity note: the host had about 1.6 GB free after building the rollback-preserving image. No large test video was uploaded and no unrelated image/cache was deleted. Disk retention/monitoring should be handled before sustained attachment-volume testing.

## 21. Remaining Deferred Relations

- Cost Management: Contact and Lead relation definitions recorded; target module absent.
- Project Assessment: Contact and Lead relation definitions recorded; target module absent.
- Contract Management: Contact and Lead relation definitions recorded; target module absent.
- Sales Content: Contact relation recorded with future target `销售工具内容管理`; target module absent.

No fake text fields, empty selectors, or placeholder relation tables were created for these targets.

## 22. Final Field Coverage

Contact Source Fields: **31 / 31 classified**.

Lead Source Fields: **44 / 44 classified**.

| Entity | Implemented | Computed | Relation | Deferred | Duplicate | Need Confirmation | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Contact | 24 | 0 | 1 | 4 | 2 | 0 | 31 |
| Lead | 27 | 4 | 3 | 3 | 2 | 5 | 44 |
| **Total** | **51** | **4** | **4** | **7** | **4** | **5** | **75** |

All source headers that are neither Duplicate nor Need Confirmation have an explicit implemented, computed, relation, or intentionally deferred ownership.

## 23. Final Verdict

READY FOR FIELD UAT
