# Kivisense CRM 2.0 - Semi Design UI Foundation

Status: ACTIVE MIGRATION AUTHORITY

本文件定义当前正式 CRM 的 UI 技术底座、迁移范围与验收要求。它覆盖此前所有 V1-native component、Lucide、TanStack Table、shadcn、Radix 和“恢复旧版视觉”的实现指令，但不修改 `docs/kivisense-crm-maintainer.md` 与 `docs/DESIGN_SYSTEM.md` 中的业务模型、Canonical IA、生命周期、路由、RBAC、API、数据保护或安全规则。

维护指南中把 V1-native components 写成 UI source of truth 的历史说明，仅在视觉和前端组件实现层被本文件取代。维护指南的其余规则继续保持最高优先级。

## 1. 最终目标

正式 CRM 的组件关系是：

`Kivisense CRM -> Kivisense CRM Design System -> Semi Design -> React`

Semi Design 是唯一基础 UI Component Library。Kivisense CRM Design System 通过共享 tokens、layout、density、surface、typography、semantic color、data components 和 record components 形成最终产品体验。

迁移结果必须覆盖正式 CRM 页面，而不是 Design Lab、Demo 或孤立样例。最终视觉必须与 V1 有可感知差异，同时不能看起来像 Semi 官方默认 Demo、Ant-style Admin 或通用 Dashboard 模板。

## 2. 技术基础

必须使用：

- React
- `@douyinfe/semi-ui`
- `@douyinfe/semi-icons`
- `frontend-react/src/components/crm/` 共享 CRM 层
- CSS、CSS Modules 或现有必要的 utility class，用于 tokens、布局、密度与业务组合

Semi 负责其已提供的基础交互能力，包括 Button、Input、TextArea、Select、AutoComplete、Checkbox、Radio、Switch、Tag、Avatar、Dropdown、Tooltip、Popover、Modal、SideSheet、Tabs、Breadcrumb、Table、Pagination、DatePicker、Upload、Form、Toast、Notification、Banner、Empty、Skeleton、Spin、Progress、Timeline、Navigation、Descriptions、Divider 和其他适用控件。

Semi Icons 是正式 CRM 唯一图标体系。

共享适配器可以统一 props、业务语义和 Kivisense 外观，但不得隐藏另一套基础 UI 实现。正式页面不得继续直接创建互相不一致的 Button、Table、Dialog、Form 或 Overlay。

## 3. 禁止的旧 UI 基础

正式 CRM 源码不得：

- 引用 `frontend-react/src/components/v1/ui` 或 `@/components/v1/ui`
- 使用 Lucide 或其他并行图标体系
- 使用 TanStack Table
- 使用 shadcn 或 Radix UI 视觉/交互组件
- 使用 `data-slot` 换皮结构
- 在 Semi 有对应能力时用普通 DOM、Tailwind 或 CSS 手工模拟交互控件
- 为未来页面重新引入已删除的旧 UI 依赖

旧依赖只有在生产源码不再引用后才可从 manifest 和 lockfile 删除。依赖清理不得破坏用户的其他有效工作。

## 4. 历史 V1 的边界

`crm-Kivisense_CRM_v1.zip` 仅可用于理解历史 CRM 的业务密度与信息覆盖。它不是当前视觉、DOM、组件、palette、typography、radius、shadow、theme token 或 page composition 的权威来源。

不得恢复旧 DOM、旧路由、旧文案、旧枚举、旧数据模型或 Lead/Opportunity 歧义。不得将历史 stylesheet 全局粘贴到当前 React 应用，也不得用 Semi DOM 复刻 V1 外观。

## 5. 必须保留的当前产品

迁移是 UI 技术栈和产品视觉的重构，不是业务重写。必须保留：

- 当前 React 页面和 Router
- CRM Domain Model 与数据库结构
- Contact 1:N Opportunity
- `MarketingLead -> MQL -> SQL -> Opportunity` 生命周期
- Organization、Contact、Marketing Lead、Opportunity、Supplier
- Dashboard、Workbench、Task、Followup、Journey、Attachment、Import、Export 与 Audit
- API contracts、RBAC、权限判断和错误处理
- 真实数据、上传能力和关联关系

不得为了 UI 迁移修改数据库 Schema、重写 backend、用临时 Mock 替代真实数据或删除业务功能。

## 6. Canonical IA 与产品语言

导航固定为：

- 概览：数据看板、我的工作台
- 客户管理：组织、联系人、线索、商机
- 资源：供应商
- 系统：账户管理、角色与权限、评分规则、审计日志

`Organization` 在普通 UI 中是组织；它仍是统一承载公司、客户、潜客、供应商和合作伙伴关系的主数据。`MarketingLead` 是线索；兼容实体 `CrmLead` 在普通 UI 中始终是商机。不得新增 Reports、Activities 或客户运营顶级入口来满足旧提示词中的示例。

Dashboard 保持管理概览、营销与转化、商机推进、团队表现四个业务视图。我的工作台保持个人行动中心定位。业务定义、字段来源、生命周期动作、导入导出范围与 assignment feedback 继续遵循维护指南和 Design System 第 53 节。

## 7. Kivisense CRM 共享层

正式页面必须复用 `frontend-react/src/components/crm/`，至少统一以下能力：

- App Shell、Sidebar、Header 与导航状态
- PageHeader、PageToolbar、PageSection 与 DetailTabs
- DataTable、EntityCell、OwnerCell、DateCell、StatusCell 与 Pagination
- RecordHeader、RecordHighlights、StagePath、DetailSection 与 FieldGrid
- StatusTag、PriorityTag、StageTag 与语义颜色
- ActivityTimeline、AttachmentList、EmptyState、LoadingState 与 ErrorState
- Create/Edit SideSheet、Confirm Modal、Form sections 与 entity selectors
- Import/Export、Upload、Toast、Notification 与 permission-aware actions

共享层负责一致性，不得让 Organization、Contact、Marketing Lead 与 Opportunity 各自复制一套 Semi Table、表单或 overlay 配置。

## 8. 视觉与布局要求

产品气质是 Premium、Dense、Structured、Editorial、Warm、Professional、Data-rich 和 Calm。

Semi 提供交互能力；Kivisense tokens 决定 canvas、surface、text、border、semantic color、radius、focus、sidebar width、header height 与控件密度。不得把 Semi 默认主题直接当成最终设计。

页面必须：

- 在 1440x900 首屏提供充分业务信息，并在 1280x800 与 1024 宽度保持可用
- 使用紧凑且统一的 App Shell、Toolbar、Table 和 Detail composition
- 通过 typography、spacing、divider、surface 和 border 建立层级
- 让核心记录首屏清楚表达 identity、state、owner、relationships、recent activity 与 next action
- 让表格具备成熟 CRM 的 entity cell、selection、filter、actions 和 pagination

页面不得出现 card wall、大面积无效留白、巨大圆角、heavy shadow、glassmorphism、装饰性 gradient、彩色 badge wall 或 marketing landing page 构图。

## 9. 页面迁移范围

所有现有正式路由都必须使用同一 Semi foundation，包括：

- Login 与 password flow
- Dashboard 与 Workbench
- Organization list/detail/create/edit
- Contact list/detail/create/edit
- Marketing Lead list/detail/create/edit
- Opportunity list/detail/create/edit
- Supplier
- Accounts
- Roles and permissions
- Scoring rules
- Audit
- 所有正式 import/export、upload、filter、batch action 和 confirmation overlays

不存在的独立 Reports 或 Activities 路由不在本次迁移中虚构。

## 10. Table 与 Record 验收重点

核心列表使用统一 PageToolbar 和 Semi Table composition：搜索与主要筛选在左侧；import、export、columns 和唯一主要 create action 在右侧；支持 checkbox、select-page、contextual batch bar、row actions 和 Semi Pagination。

DataTable 迁移不能只是把旧 Table 标签替换成 Semi Table。Entity cell 必须清楚显示 primary/secondary identity；header、row height、hover、selected、empty、loading 和 pagination 状态必须统一。

核心详情页使用统一 Record Detail Template。桌面主布局建议左侧 30-34%，右侧 66-70%；内容随可用宽度合理重排，不能形成窄列堆字或右侧大面积空白。

Create/Edit 优先使用统一 Semi SideSheet 和 Semi Form。关系字段使用可搜索选择器并显示身份上下文；tab validation 必须定位错误字段；附件区域保留图片、文档和视频的真实上传、状态、预览和移除能力。

## 11. 功能保护

UI 迁移必须验证并保持 Login、Navigation、List、Search、Filter、Pagination、Detail、Create、Edit、Delete confirmation、Batch Actions、Import、Export、Upload、Permissions、Audit、Activity 与 Associations 的现有结果。

任何视觉或组件改造都不得弱化权限边界、软删除语义、审计记录、错误处理、真实 API 返回或数据持久化。

## 12. 必须执行的验收

代码验收：

1. 运行相关 TypeScript、production build、automated tests 与 frontend interaction checks，并分别报告结果。
2. 搜索所有生产源码，确认没有 `@/components/v1/ui`、Lucide、TanStack Table、shadcn、Radix UI 或 `data-slot` 残留。
3. 检查 manifest、lockfile 与 dependency graph，确认旧 UI 依赖未被生产代码使用；确认安全后再删除。

浏览器验收：

1. 在 1440x900、1280x800 和 1024 宽度检查所有正式路由。
2. 为核心 list/detail 页面和代表性的 Dashboard、form、dropdown、DatePicker、Modal、SideSheet、import/export 与 upload 状态保留截图证据。
3. 检查 `clientWidth` 与 `scrollWidth`，页面 shell 不得产生 document-level horizontal overflow；宽表只能在自身容器内滚动。
4. 检查 console errors、page errors、failed requests 与 HTTP 4xx/5xx；任何非预期错误都必须修复或明确记录。
5. 对关键 UI 写入记录可见结果、成功 HTTP response、数据库持久化和 reload 后结果。
6. 检查 sidebar collapse/expand、overlay 定位、键盘 focus、表单内容、图标与文本是否可见，并确认刷新后的状态符合产品约定。

Human visual review 是必要验收环节，但不能替代构建、自动化、浏览器、network 和 persistence 证据。页面能够打开或 build 成功，不能单独证明业务流程通过。

## 13. 完成标准

迁移完成时必须报告：

1. Git 基线与当前 branch
2. 安装和删除的 dependencies
3. 新增或修改的 CRM Design System 组件
4. 已迁移和未迁移页面
5. 旧 UI 残留审计
6. TypeScript、build 与各测试结果
7. 本地验证 URL
8. 关键截图
9. migration commit SHA

完成状态只有在正式页面统一使用 Semi foundation、功能验证通过、浏览器证据完整且视觉达到“明显区别于 V1、不是默认 Semi Demo”时才成立。

## 14. Git 安全

修改前检查 Git 状态并理解现有 diff。不得 force push、不得 `reset --hard` 到未知状态、不得覆盖未提交的有效修改。迁移应形成独立 commit，且只包含本次获准的变更。
