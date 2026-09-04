# CRM 2.0 Field Dictionary

## 1. Scope and source

- Business source of truth: `弥知科技Kivisense项目看板 - 表头.xlsx`
- Source file SHA-256: `398254fe6c0735ca6759046f93418863b4f13546e36844d455df4fde37d19552`
- The available file name omits the `(1)` suffix from the request. Its three sheet names, all 31 Contact headers, and all 44 Lead headers match the requested source exactly.
- Audited ranges: `🚀客户CRM!A1:AE2` and `Leadsbook 2025!A1:AR2`.
- `销售工具内容管理` is used only to identify the future target of `A 销售内容关联`. No Sales Content module is added in CRM 2.0.
- `Current CRM Status` records the implementation state at the start of field-alignment work on commit `1ea68316dba9108f68cb28ddeb08bd51ce0c16e8`.

This document is the only field dictionary for the CRM 2.0 alignment work. A source header may map to a computed value, a relation, a transformation, or no database field. Source columns are not copied mechanically into database columns.

## 2. Fixed field type system

| Field Type | CRM 2.0 meaning |
|---|---|
| TEXT | Single-line text |
| MULTI_TEXT | Multiple independent text values |
| LONG_TEXT | Multi-line business text |
| EMAIL | Email address |
| PHONE | Phone number stored as text |
| URL | HTTP or HTTPS URL |
| NUMBER | Numeric value |
| CURRENCY | Decimal amount plus a separate ISO currency code |
| DATE | Calendar date |
| DATETIME | Timezone-aware date and time |
| BOOLEAN | True or false |
| SELECT | Single code-level option with extensible string storage where the complete option set is not proven |
| MULTI_SELECT | Multiple code-level options with extensible string storage |
| USER | Relation to one active CRM user |
| MULTI_USER | Relation to multiple active CRM users |
| ATTACHMENT | Generic private attachment metadata and binary storage |
| IMAGE | Image attachment with thumbnail preview |
| VIDEO | Video attachment with browser preview when supported |
| RELATION | Relation to another business entity |
| SYSTEM_USER | Automatically recorded user relation; never user-editable |
| SYSTEM_DATETIME | Automatically recorded date and time; never user-editable |
| COMPUTED | Read-only value derived from authoritative related records |

CRM 2.0 does not add a field-definition database, custom-fields JSON, a formula engine, a low-code engine, or a dynamic-field engine.

## 3. Contact source mapping

| # | Source Sheet | Source Header | Entity | Module | Field Key | Business Label | Field Type | Required | Multiple | Editable | Stored / Computed / Relation | Current CRM Status | Implementation Decision | Notes |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 🚀客户CRM | 创建时间 | Contact | System | createdAt | 创建时间 | SYSTEM_DATETIME | System | No | No | Stored | EXISTING | Keep and show in weak system-information block | Generated automatically |
| 2 | 🚀客户CRM | C客户联系人 | Contact | Contact profile | contactName | 客户联系人 | TEXT | Yes | No | Yes | Stored | EXISTING | Keep | Primary Contact display name |
| 3 | 🚀客户CRM | C触达阶段 | Contact | CRM | stage | 触达阶段 | SELECT | Yes | No | Yes | Stored | EXISTING | Keep current codes and V1 labels | INITIAL, ONE_TO_ONE, SOLUTION, CONVENTION |
| 4 | 🚀客户CRM | C品牌名称/公司简称 | Contact | Customer profile | companyShortName | 公司简称 | TEXT | No | No | Yes | Stored | EXISTING | Keep | Customer-owned brand or company short name; not Kivisense brand scope |
| 5 | 🚀客户CRM | C部门 | Contact | Contact profile | department | 部门 | TEXT | No | No | Yes | Stored | EXISTING | Keep |  |
| 6 | 🚀客户CRM | C公司名称 | Contact | Customer profile | companyName | 公司完整名称 | TEXT | No | No | Yes | Stored | EXISTING | Keep |  |
| 7 | 🚀客户CRM | C 职务Tittle | Contact | Contact profile | title | 职位 | TEXT | No | No | Yes | Stored | EXISTING | Keep | Source spelling retained only in Source Header |
| 8 | 🚀客户CRM | F次回跟进日期 | Contact | CRM | nextFollowupAt | 下次跟进 | DATETIME | No | No | Yes | Stored | EXISTING | Keep | Timezone-aware input and display |
| 9 | 🚀客户CRM | F跟进人员 | Contact | CRM | ownerUserId | 跟进人员 | USER | No | No | Yes | Relation | EXISTING | Keep and use the label 跟进人员 consistently | Only active users can be newly assigned |
| 10 | 🚀客户CRM | F 会议minutes文件 | Contact | CRM | meetingMinutesFiles | Meeting Minutes 文件 | ATTACHMENT | No | Yes | Yes | Relation | MISSING | Implement with CrmAttachment and fieldKey `meetingMinutesFiles` | Real upload; never a file-name text field |
| 11 | 🚀客户CRM | F跟进注意 | Contact | CRM | followupAttention | 跟进注意 | LONG_TEXT | No | No | Yes | Stored | MISSING | Add Contact field and V1 form/detail placement | Long-lived attention note; not timeline followup content |
| 12 | 🚀客户CRM | F备注/初次获取的信息 | Contact | CRM | initialContext | 初始信息 | LONG_TEXT | No | No | Yes | Stored | EXISTING | Keep |  |
| 13 | 🚀客户CRM | A Leadsbook关联 | Contact | Relations | leads | 关联线索 | RELATION | No | Yes | No | Relation | RELATION | Keep Contact 1:N Lead | Managed from Lead.contactId, not edited as text |
| 14 | 🚀客户CRM | C Linkedin | Contact | Contact profile | linkedin | LinkedIn | URL | No | No | Yes | Stored | EXISTING | Keep and validate HTTP or HTTPS |  |
| 15 | 🚀客户CRM | C website | Contact | Customer profile | website | Website | URL | No | No | Yes | Stored | EXISTING | Keep and validate HTTP or HTTPS |  |
| 16 | 🚀客户CRM | C 部门区域 | Contact | Customer profile | region | 区域 | TEXT | No | No | Yes | Stored | EXISTING | Keep string storage | May become a custom-capable Select when options are confirmed |
| 17 | 🚀客户CRM | C City城市 | Contact | Customer profile | city | 城市 | TEXT | No | No | Yes | Stored | EXISTING | Keep |  |
| 18 | 🚀客户CRM | C email | Contact | Contact profile | email | Email | EMAIL | No | No | Yes | Stored | EXISTING | Keep and validate | Normalize to lowercase |
| 19 | 🚀客户CRM | C 电话 | Contact | Contact profile | phone | Phone | PHONE | No | No | Yes | Stored | EXISTING | Keep as text | Do not coerce to number |
| 20 | 🚀客户CRM | C 微信（群聊中选择） | Contact | Contact profile | wechat | 微信 | TEXT | No | No | Yes | Stored | EXISTING | Keep | No WeChat API integration |
| 21 | 🚀客户CRM | C 客户行业 | Contact | Customer profile | industry | 行业 | SELECT | No | No | Yes | Stored | TYPE_MISMATCH | Keep string storage; add code-level custom-capable Select | Complete enumeration is not proven by Excel |
| 22 | 🚀客户CRM | C 客户来源 | Contact | CRM | source | 来源 | SELECT | No | No | Yes | Stored | TYPE_MISMATCH | Keep string storage; add code-level custom-capable Select | Complete enumeration is not proven by Excel |
| 23 | 🚀客户CRM | C 国家/城市 | Contact | Customer profile | country + city | 国家 / 城市 | TEXT | No | No | Yes | Stored | TYPE_MISMATCH | TRANSFORM / LEGACY_COMPOSITE; never add `countryCity` | Split only when unambiguous; otherwise preserve source in import warning and require manual correction |
| 24 | 🚀客户CRM | 创建人 | Contact | System | createdByUserId | 创建人 | SYSTEM_USER | System | No | No | Relation | TYPE_MISMATCH | Keep stored relation and expose it in Contact Detail | Backend exists; required detail UI is incomplete at baseline |
| 25 | 🚀客户CRM | 最后编辑时间 | Contact | System | updatedAt | 最后编辑时间 | SYSTEM_DATETIME | System | No | No | Stored | EXISTING | Keep and show in weak system-information block | Updated automatically |
| 26 | 🚀客户CRM | A 成本管理关联 | Contact | Deferred relations | costRelations | 成本管理关联 | RELATION | No | Yes | No | Relation | DEFERRED | Record only; do not add DB field or editable text UI | Target module is absent |
| 27 | 🚀客户CRM | A 项目评估关联 | Contact | Deferred relations | projectAssessmentRelations | 项目评估关联 | RELATION | No | Yes | No | Relation | DEFERRED | Record only; do not add DB field or editable text UI | Target module is absent |
| 28 | 🚀客户CRM | A 合同管理关联 | Contact | Deferred relations | contractRelations | 合同管理关联 | RELATION | No | Yes | No | Relation | DEFERRED | Record only; do not add DB field or editable text UI | Target module is absent |
| 29 | 🚀客户CRM | A 销售内容关联 | Contact | Deferred relations | salesContentRelations | 销售内容关联 | RELATION | No | Yes | No | Relation | DEFERRED | Record only; do not add DB field or editable text UI | Future target is 销售工具内容管理 |
| 30 | 🚀客户CRM | A 成本管理关联-----成本管理----(副本) | Contact | Data cleanup | — | 成本管理关联副本 1 | RELATION | No | Yes | No | Relation | DUPLICATE | Do not create DB field or UI | Duplicate source column |
| 31 | 🚀客户CRM | A 成本管理关联-----成本管理----(副本) | Contact | Data cleanup | — | 成本管理关联副本 2 | RELATION | No | Yes | No | Relation | DUPLICATE | Do not create DB field or UI | Second occurrence of the same duplicate source header |

### Contact baseline classification

| Status | Count |
|---|---:|
| EXISTING | 18 |
| MISSING | 2 |
| TYPE_MISMATCH | 4 |
| COMPUTED | 0 |
| RELATION | 1 |
| DEFERRED | 4 |
| DUPLICATE | 2 |
| NEED_CONFIRMATION | 0 |
| **Total** | **31** |

## 4. Lead source mapping

| # | Source Sheet | Source Header | Entity | Module | Field Key | Business Label | Field Type | Required | Multiple | Editable | Stored / Computed / Relation | Current CRM Status | Implementation Decision | Notes |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Leadsbook 2025 | 创建时间 | Lead | System | createdAt | 创建时间 | SYSTEM_DATETIME | System | No | No | Stored | EXISTING | Keep and show in weak system-information block | Generated automatically |
| 2 | Leadsbook 2025 | R最近一次沟通 | Lead | Followup | lastFollowupAt | 最近沟通 | COMPUTED | No | No | No | Computed | COMPUTED | Derive from `LeadFollowup.max(occurredAt)` | Baseline stores a maintained cache; API/UI must treat it as read-only |
| 3 | Leadsbook 2025 | L 客户联系人 | Lead | Relation | contactId | 关联联系人 | RELATION | Yes | No | Yes | Relation | RELATION | Keep required Contact relation and searchable selector | Contact 1:N Lead |
| 4 | Leadsbook 2025 | R leads项目需求简述 | Lead | Requirement | requirementSummary | 项目需求简述 | TEXT | Yes | No | Yes | Stored | EXISTING | Keep |  |
| 5 | Leadsbook 2025 | A公司名称 | Lead | Related Contact | contact.companyName | 公司名称 | COMPUTED | No | No | No | Computed | COMPUTED | Read from Contact | Never duplicate on Lead |
| 6 | Leadsbook 2025 | R 预计次回沟通日期 | Lead | Overview | nextFollowupAt | 下次跟进 | DATETIME | No | No | Yes | Stored | EXISTING | Keep | Timezone-aware input and display |
| 7 | Leadsbook 2025 | A品牌 | Lead | Related Contact | contact.companyShortName | 品牌 / 公司简称 | COMPUTED | No | No | No | Computed | COMPUTED | Read from Contact | Never duplicate on Lead; not Kivisense brand scope |
| 8 | Leadsbook 2025 | A客户微信 于客户CRM表填写 | Lead | Related Contact | contact.wechat | 客户微信 | COMPUTED | No | No | No | Computed | COMPUTED | Read from Contact | Never duplicate on Lead |
| 9 | Leadsbook 2025 | R需求整理 | Lead | Requirement | requirementDetail | 需求整理 | LONG_TEXT | No | No | Yes | Stored | EXISTING | Keep |  |
| 10 | Leadsbook 2025 | R需求/签署文件 | Lead | Requirement | requirementFiles | 需求 / 签署文件 | ATTACHMENT | No | Yes | Yes | Relation | TYPE_MISMATCH | Replace lead-level generic attachment semantics with CrmAttachment fieldKey `requirementFiles` | Existing attachment has no fieldKey |
| 11 | Leadsbook 2025 | R图片需求 | Lead | Requirement | requirementImages | 图片需求 | IMAGE | No | Yes | Yes | Relation | TYPE_MISMATCH | Use CrmAttachment fieldKey `requirementImages`; accept image MIME only | Existing attachment kind is not tied to this business field |
| 12 | Leadsbook 2025 | R正式方案 | Lead | Solution and commercial | proposalFiles | 正式方案文件 | ATTACHMENT | No | Yes | Yes | Relation | TYPE_MISMATCH | Use CrmAttachment fieldKey `proposalFiles` | `solution` text is an extra explanation field and is not a proposal file |
| 13 | Leadsbook 2025 | R最新进度 | Lead | Solution and commercial | latestProgress | 最新进度 | LONG_TEXT | No | No | Yes | Stored | EXISTING | Keep |  |
| 14 | Leadsbook 2025 | R重要性 | Lead | Overview | priority | 优先级 | SELECT | Yes | No | Yes | Stored | EXISTING | Keep current priority codes and labels |  |
| 15 | Leadsbook 2025 | 客户来源 | Lead | Requirement | leadSource | 客户来源 | SELECT | No | No | Yes | Stored | MISSING | Add extensible string field and custom-capable Select | Do not create a database enum |
| 16 | Leadsbook 2025 | R预计报价 | Lead | Solution and commercial | estimatedQuote | 预计报价 | CURRENCY | No | No | Yes | Stored | EXISTING | Keep Decimal plus `currency` helper | Amount requires currency when present |
| 17 | Leadsbook 2025 | R报价单 | Lead | Solution and commercial | quotationFiles | 报价单 | ATTACHMENT | No | Yes | Yes | Relation | TYPE_MISMATCH | Use CrmAttachment fieldKey `quotationFiles` | Existing attachment has no business-field distinction |
| 18 | Leadsbook 2025 | F销售对接人 | Lead | Overview | salesOwnerUserId | 销售对接人 | USER | No | No | Yes | Relation | EXISTING | Keep | Only active users can be newly assigned |
| 19 | Leadsbook 2025 | F跟进对接人 | Lead | Overview | followupOwnerUserId | 跟进对接人 | USER | No | No | Yes | Relation | EXISTING | Keep | Only active users can be newly assigned |
| 20 | Leadsbook 2025 | F对接群（可添加外部群） | Lead | Overview | collaborationGroups | 对接群 | MULTI_TEXT | No | Yes | Yes | Stored | MISSING | Add normalized multi-text representation | Store group names, descriptions, or links; no WeChat API |
| 21 | Leadsbook 2025 | F日常跟进记录 | LeadFollowup | Timeline | followups[important=false] | 日常跟进记录 | RELATION | No | Yes | Yes | Relation | RELATION | Keep LeadFollowup timeline | Do not add a Lead long-text field |
| 22 | Leadsbook 2025 | R重要跟进记录 | LeadFollowup | Timeline | followups[important=true] | 重要跟进记录 | RELATION | No | Yes | Yes | Relation | RELATION | Keep LeadFollowup timeline with `important=true` | Do not add a Lead long-text field |
| 23 | Leadsbook 2025 | A成交日期 | Lead | Milestones | wonAt | 成交日期 | DATETIME | No | No | Limited | Stored | MISSING | Add nullable field; set only on first transition to WON, while allowing explicit import | Later WON edits must not overwrite it |
| 24 | Leadsbook 2025 | A跟进：交付跟进日期 | Lead | Milestones | deliveryFollowupAt | 交付跟进日期 | DATETIME | No | No | Yes | Stored | MISSING | Add field |  |
| 25 | Leadsbook 2025 | A跟进：合同续约日期 | Lead | Milestones | contractRenewalAt | 合同续约日期 | DATETIME | No | No | Yes | Stored | MISSING | Add field |  |
| 26 | Leadsbook 2025 | 跟进节点3 | Lead | Unresolved legacy | — | 跟进节点3 | DATETIME | No | No | No | Unresolved | NEED_CONFIRMATION | Do not create DB field or UI | Header does not prove business meaning |
| 27 | Leadsbook 2025 | 跟进节点4 | Lead | Unresolved legacy | — | 跟进节点4 | DATETIME | No | No | No | Unresolved | NEED_CONFIRMATION | Do not create DB field or UI | Header does not prove business meaning |
| 28 | Leadsbook 2025 | 跟进节点3 1 | Lead | Unresolved legacy | — | 跟进节点3 1 | DATETIME | No | No | No | Unresolved | NEED_CONFIRMATION | Do not create DB field or UI | Likely historical copy, but not confirmed |
| 29 | Leadsbook 2025 | 跟进节点4 1 | Lead | Unresolved legacy | — | 跟进节点4 1 | DATETIME | No | No | No | Unresolved | NEED_CONFIRMATION | Do not create DB field or UI | Likely historical copy, but not confirmed |
| 30 | Leadsbook 2025 | 跟进节点5-合同到期 1 | Lead | Unresolved legacy | — | 跟进节点5-合同到期 1 | DATETIME | No | No | No | Unresolved | NEED_CONFIRMATION | Do not create DB field or UI | Contract-expiry meaning is plausible but not proven |
| 31 | Leadsbook 2025 | 收款日期 | Lead | Milestones | paymentReceivedAt | 收款日期 | DATETIME | No | No | Yes | Stored | MISSING | Add field |  |
| 32 | Leadsbook 2025 | R项目领域 | Lead | Project classification | projectDomain | 项目领域 | SELECT | No | No | Yes | Stored | TYPE_MISMATCH | Keep string storage; change UI to custom-capable Select | Do not create a database enum |
| 33 | Leadsbook 2025 | R项目类型 | Lead | Project classification | projectType | 项目类型 | SELECT | No | No | Yes | Stored | TYPE_MISMATCH | Keep string storage; change UI to custom-capable Select | Do not create a database enum |
| 34 | Leadsbook 2025 | 技术类型 | Lead | Project classification | technologyType | 技术类型 | MULTI_SELECT | No | Yes | Yes | Stored | TYPE_MISMATCH | Store unique newline-delimited values in TEXT and use a custom-capable multi-select | Import and export use the same documented newline-separated format |
| 35 | Leadsbook 2025 | 产品类型 | Lead | Project classification | productType | 产品类型 | SELECT | No | No | Yes | Stored | TYPE_MISMATCH | Keep string storage; change UI to custom-capable Select | Do not create a database enum |
| 36 | Leadsbook 2025 | 产品名称 | Lead | Project classification | productName | 产品名称 | TEXT | No | No | Yes | Stored | EXISTING | Keep text storage; UI may offer suggestions with custom value |  |
| 37 | Leadsbook 2025 | 合同管理关联 | Lead | Deferred relations | contractRelations | 合同管理关联 | RELATION | No | Yes | No | Relation | DEFERRED | Record only; do not add DB field or editable text UI | Target module is absent |
| 38 | Leadsbook 2025 | F跟单模式 | Lead | Overview | followMode | 跟单模式 | SELECT | No | No | Yes | Stored | MISSING | Add extensible string field and custom-capable Select | Do not guess a complete option set or create a database enum |
| 39 | Leadsbook 2025 | R资源需求 | Lead | Project classification | resourceRequirement | 资源需求 | LONG_TEXT | No | No | Yes | Stored | EXISTING | Keep |  |
| 40 | Leadsbook 2025 | R Leads参与人员 | Lead | Overview | participantUserIds | Leads 参与人员 | MULTI_USER | No | Yes | Yes | Relation | MISSING | Add CrmLeadParticipant relation with unique leadId + userId | Disabled users cannot be newly added |
| 41 | Leadsbook 2025 | A成本关联 | Lead | Deferred relations | costRelations | 成本关联 | RELATION | No | Yes | No | Relation | DEFERRED | Record only; do not add DB field or editable text UI | Target module is absent |
| 42 | Leadsbook 2025 | A 项目评估表关联 | Lead | Deferred relations | projectAssessmentRelations | 项目评估表关联 | RELATION | No | Yes | No | Relation | DEFERRED | Record only; do not add DB field or editable text UI | Target module is absent |
| 43 | Leadsbook 2025 | A成本关联-----成本管理----(副本) | Lead | Data cleanup | — | 成本关联副本 1 | RELATION | No | Yes | No | Relation | DUPLICATE | Do not create DB field or UI | Duplicate source column |
| 44 | Leadsbook 2025 | A成本关联-----成本管理----(副本) | Lead | Data cleanup | — | 成本关联副本 2 | RELATION | No | Yes | No | Relation | DUPLICATE | Do not create DB field or UI | Second occurrence of the same duplicate source header |

### Lead baseline classification

| Status | Count |
|---|---:|
| EXISTING | 11 |
| MISSING | 8 |
| TYPE_MISMATCH | 8 |
| COMPUTED | 4 |
| RELATION | 3 |
| DEFERRED | 3 |
| DUPLICATE | 2 |
| NEED_CONFIRMATION | 5 |
| **Total** | **44** |

## 5. Required system and retained extra fields

These fields are not additional Excel source columns. They are required system fields or useful CRM 2.0 fields retained alongside the source mapping. `Classification` is separate from `Current CRM Status`; `EXTRA_EXISTING` is not used as a Current CRM Status value.

| Entity | Field Key | Business Label | Field Type | Editable | Stored / Computed / Relation | Current CRM Status | Classification | Decision |
|---|---|---|---|---|---|---|---|---|
| Contact | id | Contact ID | TEXT | No | Stored | EXISTING | SYSTEM | Keep |
| Contact | country | 国家 | TEXT | Yes | Stored | EXISTING | EXTRA_EXISTING / TRANSFORM_TARGET | Keep as the explicit country target for legacy composite data |
| Contact | remark | 备注 | LONG_TEXT | Yes | Stored | EXISTING | EXTRA_EXISTING | Keep because the V1 Notes workflow has business value |
| Lead | id | Lead ID | TEXT | No | Stored | EXISTING | SYSTEM | Keep |
| Lead | status | 线索阶段 | SELECT | Yes | Stored | EXISTING | EXTRA_EXISTING | Keep current CRM lifecycle field |
| Lead | currency | 币种 | SELECT | Yes | Stored | EXISTING | EXTRA_EXISTING / TECHNICAL_HELPER | Keep; required when estimatedQuote is present |
| Lead | solution | 方案说明 | LONG_TEXT | Yes | Stored | EXISTING | EXTRA_EXISTING | Keep as text explanation; never treat it as `proposalFiles` |
| Lead | remark | 备注 | LONG_TEXT | Yes | Stored | EXISTING | EXTRA_EXISTING | Keep because the V1 Notes workflow has business value |
| Lead | createdByUserId | 创建人 | SYSTEM_USER | No | Relation | EXISTING | SYSTEM | Keep and expose in Lead Detail |
| Lead | updatedAt | 最后编辑时间 | SYSTEM_DATETIME | No | Stored | EXISTING | SYSTEM | Keep and expose in Lead Detail |
| ContactFollowup | createdByUserId | 创建人 | SYSTEM_USER | No | Relation | EXISTING | SYSTEM | Keep and display on timeline |
| ContactFollowup | createdAt | 创建时间 | SYSTEM_DATETIME | No | Stored | EXISTING | SYSTEM | Keep and display on timeline |
| LeadFollowup | createdByUserId | 创建人 | SYSTEM_USER | No | Relation | EXISTING | SYSTEM | Keep and display on timeline |
| LeadFollowup | createdAt | 创建时间 | SYSTEM_DATETIME | No | Stored | EXISTING | SYSTEM | Keep and display on timeline |

## 6. Storage and relation rules

1. Contact-to-Lead remains `Contact 1:N Lead`; `Lead.contactId` is the only stored link.
2. Company name, company short name, and WeChat on a Lead are read from its Contact and are never duplicated into Lead columns.
3. Followup content remains in ContactFollowup or LeadFollowup timelines. Contact `followupAttention` is a separate long-lived note.
4. Attachment business fields use one generic `CrmAttachment` model distinguished by `entityType`, `entityId`, and `fieldKey`. Binary content is private storage; the database holds metadata only.
5. Lead participants use `CrmLeadParticipant` with a unique `(leadId, userId)` key. They are never stored as comma-separated names.
6. Deferred relations do not become string fields, fake selectors, or empty target tables in this round.
7. Duplicate and NEED_CONFIRMATION columns do not enter the database or editable UI.

## 7. Attachment field contract

| Entity Type | Field Key | Accepted category | Multiple |
|---|---|---|---|
| CONTACT | meetingMinutesFiles | Document, image, or video | Yes |
| LEAD | requirementFiles | Document, image, or video | Yes |
| LEAD | requirementImages | Image only | Yes |
| LEAD | proposalFiles | Document, image, or video | Yes |
| LEAD | quotationFiles | Document or image | Yes |

The generic attachment metadata contract is: `id`, `entityType`, `entityId`, `fieldKey`, `storageType`, `originalName`, `mimeType`, `fileSize`, `storageKey`, `externalUrl`, `uploadedByUserId`, and `createdAt`. Local files use generated storage keys under private `storage/crm-attachments/`; user file names never become server paths. Allowed extensions and MIME values are checked together. The per-file limit comes from `CRM_ATTACHMENT_MAX_BYTES` and defaults to 50 MB for UAT.

## 8. Import and export rules

- Imports set `createdByUserId` to the import executor for Contact and Lead.
- Attachment cells may be blank or contain an accessible external URL. A plain file name without file content produces `ATTACHMENT_FILE_NOT_AVAILABLE`; it does not create a fake uploaded attachment.
- Legacy `C 国家/城市` values are not split by guessing. Unambiguous values may map to `country` and `city`; ambiguous values require correction.
- Exports contain attachment file names plus authenticated download URLs, or external URLs. They never contain binary data or `storageKey`.
- Multi-value cells use a documented newline-separated format.

## 9. UI placement rules

- Keep the Kivisense CRM V1 header, sidebar, cards, tabs, density, typography, and two-column detail layout.
- Contact left column: Contact profile card, Customer profile card (including CRM fields), then weak system information. Right tabs: Leads, Followup records, Notes, Audit records.
- Lead left column: Lead overview, Related Contact, then weak system information. Right tabs: Requirement information, Followup records, Notes, Audit records.
- Lead Requirement tab is divided into Requirement content, Project classification, and Solution and commercial sections.
- No Dashboard, wizard, large replacement Drawer, sidebar redesign, header redesign, dynamic fields, or CRM 2.1 feature is in scope.

## 10. Coverage gate

- Contact source fields: **31 / 31 classified**.
- Lead source fields: **44 / 44 classified**.
- Duplicate fields: **4**, excluded from database and UI.
- Need-confirmation fields: **5**, excluded from database and UI until business meaning is confirmed.
- Deferred relation fields: **7**, documented without fake storage or UI.

Any later CRM 2.0 schema, validation, frontend field definition, import/export mapping, and UI implementation must trace to this dictionary. A new fixed field or a changed mapping requires updating this document in the same change.

## 11. Completion classification

The baseline `Current CRM Status` values above are retained as audit evidence. After this alignment change, all non-deferred, non-duplicate, and non-confirmation source fields are implemented, computed, or backed by an explicit relation.

| Entity | Implemented | Computed | Relation | Deferred | Duplicate | Need Confirmation | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Contact | 24 | 0 | 1 | 4 | 2 | 0 | 31 |
| Lead | 27 | 4 | 3 | 3 | 2 | 5 | 44 |
| **Total** | **51** | **4** | **4** | **7** | **4** | **5** | **75** |

`Implemented` combines baseline `EXISTING`, `MISSING`, and `TYPE_MISMATCH` rows after their documented implementation decisions have been completed. Deferred, duplicate, and need-confirmation rows intentionally do not become fake database fields.
