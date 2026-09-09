# Kivisense CRM Design System v2.0

Status: ACTIVE SEMI UI FOUNDATION

Purpose:

本文件定义 Kivisense CRM 的长期 UI / UX Design Language。

所有新增页面、组件、重构和 Codex 开发都必须遵循本文件。

业务 Domain 规则由：

docs/kivisense-crm-maintainer.md

负责。

视觉与交互规则由：

docs/DESIGN_SYSTEM.md

负责。

---

# 1. Design Philosophy

Kivisense CRM 是：

Desktop-first B2B Productivity Product。

不是：

Marketing Website
Mobile Lifestyle App
Traditional Admin Template
Low-code Builder

核心气质：

Calm
Dense
Structured
Fast
Premium

中文：

克制
紧凑
有结构
高效率
高级但不过度设计

---

# 2. Primary UI Reference

Primary Reference：

当前 Kivisense CRM 2.0 的产品模型、Canonical IA 与正式业务页面。

视觉方向：

- App Shell
- Sidebar
- Header
- Section Cards
- Charts
- Data Table
- Spacing
- Typography
- Border
- Interaction Density

用户提供的 `crm-Kivisense_CRM_v1.zip` 仅作为历史业务密度参考，不是视觉、组件结构、DOM、主题或 token 的权威来源。

Semi Design 提供基础交互能力，Kivisense CRM Design System 决定最终视觉。成品必须与 V1 有可感知差异，同时不能呈现为 Semi 官方默认 Demo、通用 Dashboard 模板或其他 SaaS 产品的复制品。

---

# 3. Technical Foundation

Required UI Stack：

- React
- `@douyinfe/semi-ui`
- `@douyinfe/semi-icons`
- CSS / existing layout utilities

正式 CRM 页面的基础交互组件必须来自 Semi Design。Semi Icons 是唯一图标体系。

共享适配器、组合组件和业务组件必须位于 `frontend-react/src/components/crm/`。

禁止：

- 正式 CRM 页面引用 `frontend-react/src/components/v1/ui` 或 `@/components/v1/ui`
- Lucide
- TanStack Table
- shadcn 或 Radix UI 组件
- 在 Semi 已提供相应能力时，用 Tailwind / CSS 和普通 `div` 重造 Button、Select、Dialog、SideSheet、Table 等交互控件

自定义应主要发生在：

- Composition
- Tokens
- Layout
- Business Components
- Semi Theme Tokens

而不是重新造基础交互组件。Semi 决定交互行为与可访问性基础，Kivisense tokens 和 CRM composition 决定信息层级、密度与视觉表达。

---

# 4. Brand Personality

Kivisense CRM 应该让用户感觉：

专业，但不古板。

现代，但不浮夸。

数据很多，但很好读。

功能很多，但不会感觉复杂。

销售能够快速执行。

老板能够快速判断。

---

# 5. Color System

## Neutral

Background:

#FFFFFF

Subtle Background:

#FAFAFA

Foreground:

#111111

Secondary:

#737373

Muted:

#A3A3A3

Border:

#E8E8E8

Subtle Border:

#F0F0F0

---

## Brand Green

Kivisense Logo：

Brand 500
#04E06E

Brand 600
#03C360

辅助：

Brand 50
#F0FDF5

Brand 100
#DCFCE8

Brand 200
#BBF7D0

Brand 700
#079451

Brand 800
#087A46

Brand 900
#075F39

---

# 6. Brand Usage

整体：

90% Neutral

10% Kivisense Emerald

Brand Green 用于：

- Primary CTA
- Focus Ring
- Checkbox / Radio
- Selected State
- Active Indicator
- Key Chart Series
- Small Positive Indicators

禁止：

- 整个 Sidebar 绿色
- 整页绿色 Header
- 所有 Status 都绿色
- 大面积 Brand Background

高饱和品牌色的价值来自：

稀缺使用。

---

# 7. Typography

Font Stack：

中文：

PingFang SC
system-ui

英文 / Number：

Inter
Geist
system-ui

---

Page Title：

24px
600

Section Title：

16–18px
600

Card Title：

14–16px
500–600

Body：

14px
400

Table：

14px

Secondary：

13px

Metadata：

12px

---

原则：

不要整个系统全部 Semibold。

层级依赖：

Size
Weight
Color
Spacing

共同建立。

---

# 8. Spacing

全站 spacing rhythm：

4
8
12
16
20
24
32
40
48

禁止随机：

13
17
22
27

等非体系 spacing。

页面常规 padding：

24px

大屏可略增。

但不要形成 Marketing Site 式大留白。

---

# 9. Radius

Button：

8px

Input：

8px

Select：

8px

Dropdown：

8px

Card：

10px

Dialog：

12px

Drawer：

12px

禁止全站：

16px+
20px+
24px+

巨大圆角。

---

# 10. Shadow

原则：

Border First
Shadow Second

普通：

Card
Table
Section

无 Shadow 或极轻 Shadow。

明显 Shadow 仅用于：

Dialog
Dropdown
Popover
Drawer
Floating UI

---

# 11. App Shell

Desktop Sidebar：

232–248px

Collapsed：

56–64px

Main Content：

充分利用横向空间。

结构：

Sidebar
+
SidebarInset
+
SiteHeader
+
MainContent

Header 高度：

约 48–56px

不要做巨大 Top Nav。

---

# 12. Sidebar

Sidebar 应：

Quiet
Compact
Clear

一级菜单有明确 Icon。

Icon：

Semi Icons

16–18px。

分组标题：

12px
Muted

Active：

Neutral Dark

或者：

Brand-50 + small green indicator。

禁止：

大绿色 Active Block。

---

# 13. Navigation IA

- 概览：数据看板、我的工作台
- 客户管理：组织、联系人、线索、商机
- 资源：供应商
- 系统：账户管理、角色与权限、评分规则、审计日志

客户运营不是顶级入口。不存在的独立 Reports 或 Activities 路由不得为了视觉迁移而创建。

---

# 14. Page Header

统一：

Title
Description（必要时）
Context
Primary Action

Example：

公司

管理客户、潜在客户、供应商和合作伙伴。

                     + 新建公司

Description 不应每页都有。

简单页面：

只保留 Title + Action。

---

# 15. Buttons

Hierarchy：

Primary

Secondary

Outline

Ghost

Destructive

---

每个 Page：

原则上只有一个明显 Primary CTA。

例如：

+ 新建客户

其余：

Filter
Export
Columns

使用：

Outline / Ghost。

禁止：

四五个绿色按钮同时出现。

---

# 16. KPI Card

视觉基准：共享 CRM Metric 组件与 Kivisense Semi theme tokens。

结构：

Label

Primary Metric

Optional delta / state

Short supporting context

---

不要：

巨大 Icon

复杂插图

多个背景色

大量说明文字。

Card 高度尽量一致。

Metric 才是视觉焦点。

---

# 17. Dashboard Layout

推荐：

Page Header

↓

KPI Row

↓

Primary Analytics

↓

Secondary Analytics / Matrix

↓

Operational Table

---

Dashboard 首屏：

最多 6 个 KPI。

Kivisense 第一版：

活跃公司

活跃线索

新增线索

待唤醒客户

逾期任务

停滞线索

不展示财务金额。

---

# 18. Charts

图表必须：

Quiet
Readable

Axis：

Muted

Grid：

Very subtle

Tooltip：

Compact

Legend：

Minimal

Brand Green：

主重点系列。

Secondary series：

Neutral gray scale。

禁止：

彩虹配色。

禁止：

3D Chart

Gauge

Gradient overload。

---

# 19. Table Is First-Class UI

CRM 核心 Page：

Table 是主要工作区域。

结构：

Page Header

Saved Views

Toolbar

Data Table

Pagination

不要：

Page Title

↓

巨大 Filter Form

↓

Cards

↓

终于出现 Table。

---

# 20. Table Toolbar

统一支持：

Search

Filter

Sort

Columns

View

Bulk Actions

Primary CTA

Filter 默认：

Popover

Dropdown

Sheet

不要默认占据一大片页面。

---

# 21. Table Style

Row：

40–44px

Header：

36–40px

Background：

White

Divider：

Subtle

Hover：

Very subtle

Selected：

Clear but quiet

Sticky Header：

大型列表优先。

Metadata：

Muted Text。

---

# 22. Badge

Badge 只用于：

Status

Stage

Priority

Risk

Role（必要时）

不要用于：

Owner

Company

Contact

Date

普通 Category

所有东西都变 Badge 会造成视觉噪音。

Badge：

Small
Muted
Low Saturation

---

# 23. Avatar / Logo

Company：

优先 Logo。

无 Logo：

Initial Fallback。

Contact：

Avatar 可选。

没有头像：

姓名 Initial。

尺寸：

List：

24–28px

Detail：

40–48px

不要巨大 Profile Avatar。

---

# 24. Company List

首要信息：

Logo

Company

Lifecycle

Fit

Engagement

Owner

Contacts

Active Leads

Last Interaction

Next Action

Updated

Row Action。

禁止金额。

---

# 25. Company 360

Header：

Logo

Company Name

Role

Lifecycle

Owner

Fit

Engagement

Quick Actions

---

Summary：

Contacts

Active Leads

Latest Interaction

Next Action

---

Tabs：

Overview

Contacts

Leads

Journey

Tasks

Files

Notes

Audit

---

页面目标：

5–10 秒理解：

这家公司是谁？

关系怎么样？

有多少人？

有哪些机会？

最近发生了什么？

下一步是什么？

---

# 26. Contact 360

Header：

Contact Name

Title

Company

Stage

Owner

Contact Methods

Quick Actions

---

右侧核心：

Leads

Customer Journey

Notes

Audit

Contact 页面强调：

Person Relationship。

Company 页面强调：

Organization Relationship。

---

# 27. Lead Detail

Header：

Requirement Summary

Company

Contact

Stage

Priority

Owner

---

必须优先展示：

Latest Progress

Next Action

Next Followup

---

业务 Section：

Requirement

Solution

Quote Context

Project Classification

Team

Milestones

Attachments

Followup Timeline

Audit

---

不要让用户打开 Lead 后先看到：

createdAt

system ID

技术字段。

---

# 28. Customer Journey

Timeline 视觉：

Quiet。

每条：

Date

Event Type

Title

Summary

Actor

Related Record

Attachments

---

不要做：

巨大圆点

粗线

五颜六色 Timeline。

Journey 是业务历史。

Audit 是系统记录。

视觉也必须区分。

---

# 29. Forms

Forms 原则：

Grouped

Compact

Contextual

---

Contact：

3 Tabs

Lead：

5 Tabs

Company：

按业务 Section。

---

Tab 是：

同一个 Form 的 Section Navigation。

切换：

不丢 unsaved state。

保存：

统一 Footer。

Validation：

显示 Error Badge。

Save：

自动定位第一个 Error Tab。

---

# 30. Form Layout

Desktop：

优先两列。

单字段很长：

Full width。

Text Area：

Full width。

File Section：

通常 Full width。

避免：

所有字段都一行一个 Input。

也避免：

四列过密布局。

---

# 31. Contextual Attachments

附件不能孤立。

Example：

需求整理

[ Textarea ]

需求文件

[ Upload ]


图片需求说明

[ Textarea ]

图片参考

[ Image Upload ]


方案说明

[ Textarea ]

正式方案

[ Upload ]

---

附件 item：

File icon / thumbnail

File name

Type

Size

Uploader

Uploaded time

Actions

---

不要：

每个文件一个巨大 Card。

---

# 32. Tasks / Workbench

Workbench 是：

Execution Surface。

不是 Analytics Dashboard。

顶部：

Overdue

Today

Next 7 Days

High Priority

---

下面：

Task Queue。

每条强调：

What

Who

When

Why

Next Action

---

操作：

Complete

Followup

Postpone

Open Record

必须能直接执行。

---

# 33. Customer Operations

这不是普通 Company List。

应体现运营池：

重点跟进

孵化

待唤醒

沉睡

---

每条 Company 应快速表达：

Company

Fit

Engagement

Lifecycle

Owner

Last Interaction

Dormant Days

Next Touch

Active Lead

Actions

---

页面重点：

识别下一批应该联系谁。

---

# 34. Dialog

Dialog 用于：

Create

Delete confirm

Small edit

Quick actions

---

不要塞超长 Form。

长 Form 使用：

Full Page

或：

Large Sheet / Drawer。

---

# 35. Drawer / Sheet

适合：

Advanced Filter

Quick Detail

Quick Create

Bulk Action

Secondary Form

---

宽度：

根据内容。

不要默认占屏幕 90%。

---

# 36. Empty State

结构：

Small icon

Title

One short description

Optional CTA

禁止：

巨大 Illustration。

Example：

暂无线索

该客户目前还没有关联线索。

+ 创建线索

---

# 37. Loading

优先：

Skeleton。

保持和最终 layout 一致。

不要：

全页中央 Spinner

作为主要 loading pattern。

---

# 38. Error

明确：

What happened

What user can do

Retry

不要显示：

Raw Stack

Raw API Error

Database Error

---

# 39. Permission State

无权限：

隐藏 mutation action。

不要：

全部显示但 disabled。

如果用户进入无权限页面：

使用统一 No Permission State。

---

# 40. Destructive Action

删除：

进入 More Menu。

颜色：

仅 Destructive Item 使用红。

删除确认：

明确显示 Entity。

Example：

删除联系人“Anne Yang”？

这是一个可恢复的软删除操作。

---

# 41. Search

全局 Search：

未来可以扩。

当前页面 Search：

Toolbar Inline Search。

Search Input：

不宜超过 280–320px。

---

# 42. Filter

简单 Filter：

Dropdown。

复杂：

Popover / Sheet。

Active filter：

用轻量 Chip 表达。

支持：

Clear All。

不要：

每个筛选都永久占页面。

---

# 43. Saved Views

列表类页面未来推荐：

All

Mine

Active

Dormant

etc.

Tabs 应：

简洁

低视觉重量。

不是巨大 Segment Control。

---

# 44. Motion

允许：

150–220ms

Button feedback

Popover

Dropdown

Drawer

Dialog

Hover

禁止：

Bounce

Large scale

Flashy motion

CRM 是 Productivity Tool。

---

# 45. Responsive

Primary：

1440

1280

1024

Desktop First。

1024：

Sidebar 可以 collapse。

Table：

内部 scroll。

禁止：

Document horizontal overflow。

---

# 46. Accessibility

必须：

Keyboard accessible

Visible focus

Dialog focus trap

ARIA labels

Color contrast

Input label

Error association

不要因为追求高级感牺牲可访问性。

---

# 47. Login

使用与正式 CRM 一致的 Semi Form、Kivisense tokens 和品牌语言。

Kivisense Logo

Minimal Form

Subtle Background

No giant illustration unless necessary

---

# 48. System Pages

Accounts

Roles

Audit

必须仍像同一个 Kivisense 产品。

不能出现：

CRM 页面现代

系统页面突然变传统 Admin。

---

# 49. UI Anti-patterns

绝对禁止：

传统 Ant Design Admin Feel

大面积蓝色 / 绿色

Gradient Dashboard

Card Wall

16px+ Global Radius

Heavy Shadow

Colorful Badge Wall

Emoji Icons

Mixed Icon Libraries

Huge Empty Illustration

Filter Form Wall

Infinite Nested Navigation

Low-code Form Look

Marketing Landing Page whitespace

---

# 50. Codex Implementation Rule

每次新增页面：

先查：

DESIGN_SYSTEM.md

再实现。

不得：

为了单独页面新增随机 Design Token。

如果现有 Design System 无法覆盖：

优先扩展 shared token / component。

禁止 page-local 视觉规则不断累积。

---

# 51. Visual Acceptance

最终页面必须同时满足：

1. 第一眼像现代 SaaS Product
2. 第二眼明确是 CRM
3. 长时间使用不会疲劳
4. 数据很多仍然有秩序
5. 绿色具有品牌识别，但不喧宾夺主
6. 不像国产后台模板
7. 不像低代码平台
8. 不像通用 Dashboard Demo 换 Logo
9. 整套产品有统一 Kivisense identity

---

# 52. Final Principle

Kivisense CRM 的高级感不来自：

More decoration。

而来自：

Less noise
Better hierarchy
Better spacing
Better components
Better interaction
Better information architecture

最终公式：

Semi Design primitives

+

Kivisense CRM components and tokens

+

B2B CRM information density

=

Kivisense CRM Design Language

---

# 53. Canonical product-model and dense-enterprise rules

This section supersedes earlier examples wherever product-model language or information architecture conflicts. Its product model, canonical information architecture, lifecycle, RBAC, API, import/export, assignment and verification rules remain active. Its visual and component-foundation language is governed by the Semi foundation in this document and `docs/CODEX_UI_REBUILD_PROMPT.md`.

## 53.1 Canonical information architecture

- 概览: 数据看板, 我的工作台
- 客户管理: 组织, 联系人, 线索, 商机
- 资源: 供应商
- 系统: 账户管理, 角色与权限, 评分规则, 审计日志

客户运营 is not a top-level destination. Organization views, Organization detail and 我的工作台 absorb its current capabilities. The compatibility route may remain, but new navigation and new product copy must not recreate the removed module.

## 53.2 Canonical object language

- `MarketingLead` is 线索. Fit and Engagement are 线索匹配度 and 互动活跃度.
- `CrmLead` is persistence compatibility for Opportunity and is always 商机 in ordinary UI.
- `Organization` is 组织; it is the unified company master, and Supplier is an Organization with the 供应商 business relationship.
- Organization lifecycle is 客户阶段. Organization roles are 业务关系 and may be multi-valued.
- Contact is 联系人 and must state 企业联系人 or 个人联系人. The legacy Contact stage must not appear as a generic “CRM 状态”.

Do not expose internal compatibility names such as CrmLead, Lead Owner, Lead Stage, `START_NURTURING`, enum keys, or route keys to ordinary users.

## 53.3 Lifecycle interaction

New Marketing Leads enter NEW and participate in nurturing through ordinary scoring activity; nurturing is not a button or a required explicit state transition. Scoring may promote NEW, NURTURING and RECYCLED records to MQL. A salesperson accepts MQL to SQL, then converts SQL directly to an Opportunity. Any QUALIFIED compatibility transition is internal. WON is the current CRM sales-chain terminal and does not create Order, Contract, ERP, Finance or Procurement UI.

## 53.4 Dense list standard

Every core list uses one `PageToolbar` composition:

1. Optional low-weight Smart Views.
2. Search on the left, followed by compact primary filters and a “更多筛选” disclosure.
3. Import, export, column visibility and the single primary create action on the right, permission permitting.
4. A leading checkbox column, select-page behavior and a contextual batch bar.
5. Batch owner assignment and “导出所选”; no batch delete.
6. Explicit empty state for the active scope, including “暂无供应商” for Supplier.

Export must make scope visible: 所选记录, 当前筛选结果, or 当前权限内全部记录. Export is job-based and exposes estimate, status, row count, download, history and regeneration. Import and export errors stay inside the task dialog rather than becoming a global page failure.

## 53.5 Dense record standard

Record pages compose `RecordHeader`, `RecordHighlights`, `StagePath` where applicable, compact `DetailTabs`, `DetailSection`/`FieldGrid`, `ActivityTimeline`, `AttachmentList`, and `SystemIdField`/`CopyValue`. The first viewport must answer identity, state, owner, recent activity, next action and relationships without a decorative card wall.

System IDs are secondary but visible and copyable on Company, Contact, Marketing Lead and Opportunity records. Company logos use an image-only upload contract and `object-fit: contain`; never crop or stretch a business mark.

## 53.6 Forms and selectors

- Industry uses a centrally maintained category and sub-industry taxonomy, with an explicit custom escape hatch.
- Country/region/city use dependent searchable selectors backed by centralized reference data; preserve legacy text values for compatibility.
- Entity relationships use fuzzy-search comboboxes with visible identity context, while backend exact-match rules remain authoritative.
- Required errors attach to fields. If an invalid field is on another tab, focus that tab and field.
- Attachment areas accept the field-specific image, video and document types and keep explanatory text adjacent to the relevant business field.

## 53.7 Dashboard and workbench

The Dashboard has exactly four business views: 管理概览, 营销与转化, 商机推进, 团队表现. Financial amounts are prohibited. Owner attribution uses Marketing Lead owner and Opportunity sales owner independently of Company owner. Website visitor tracking remains explicitly unavailable until a real source exists.

我的工作台 is a personal action center, not an analytics dashboard. It aggregates new MQL acceptance, today/overdue/next-seven-day tasks, stale Opportunities, active Opportunities without a next action, and only rule-backed Company reconnect candidates.

## 53.8 Assignment feedback

Owner changes save the business record first and enqueue one transactional outbox notification only when the assignee actually changes. UI feedback confirms assignment; it must not falsely claim that email delivery already succeeded. Delivery failures are retried and never roll back the assignment.

## 53.9 Verification standard

Do not merge “tests passed” into a single claim. Report unit, API/database integration, local real-UI write E2E, responsive visual review, RBAC, UAT read-only, UAT controlled write, deployment provenance and notification-transport evidence separately.

Every critical UI write requires: visible browser result, successful HTTP response, persisted database state and a reload check. Browser gates require 1440, 1280 and 1024 widths, no document-level horizontal overflow, and zero unexpected console errors or HTTP 4xx/5xx. The pre-refactor `artifacts/ui-audit/` archive is immutable; new evidence belongs in a separate AFTER directory.

---

# 54. Semi Design implementation and acceptance override

This section supersedes every earlier V1 visual-source, component-foundation, icon-family, technical-stack and browser-testing instruction. It does not change the canonical product model, information architecture, routes, lifecycle, RBAC, API contracts, import/export flows, assignment rules or data-preservation requirements in section 53 and `docs/kivisense-crm-maintainer.md`.

## 54.1 Component authority

- `@douyinfe/semi-ui` is the only base UI component library for formal CRM pages.
- `@douyinfe/semi-icons` is the only icon family.
- `frontend-react/src/components/crm/` is the shared layer for theme adapters, composition primitives and CRM business components.
- Formal CRM pages must not import `frontend-react/src/components/v1/ui`, `@/components/v1/ui`, Lucide, TanStack Table, shadcn or Radix UI.
- CSS, CSS Modules and existing utility classes may implement tokens, layout, density and business composition. They must not recreate an interactive primitive that Semi provides.
- The historical V1 archive may be consulted only for business-density context. It cannot determine the current DOM, component implementation, palette, typography, theme tokens or page composition.

## 54.2 Product visual standard

The supported composition is:

`Current product model + canonical IA + Kivisense CRM Design System + Semi Design primitives`.

The migration must change the complete product surface, including App Shell, navigation, toolbars, data tables, record headers, detail layouts, forms, overlays, upload, feedback, empty/loading/error states, Dashboard and system pages. Replacing only Button and Input is not a completed migration.

Semi supplies interaction behavior and accessibility. Kivisense tokens and shared CRM components supply hierarchy, density, surfaces, borders, semantic color and brand identity. The result must be visibly distinguishable from V1 and must not look like a default Semi demo, an Ant-style admin template or a generic dashboard with Kivisense colors.

Core lists share one mature CRM table composition with search, compact filters, column controls, import/export, row actions, selection, contextual batch actions and pagination. Core records share one detail composition that exposes identity, state, owner, relationships, recent activity and next action in the first viewport. Pages use available width deliberately and avoid card walls, oversized whitespace, heavy shadows, large-radius surfaces and decorative gradients.

## 54.3 Required verification

1. Run the relevant TypeScript, production build, automated test and frontend interaction checks, and report each result separately.
2. Audit production source and the dependency graph for `components/v1/ui`, Lucide, TanStack Table, shadcn and Radix UI residue.
3. Inspect formal CRM routes in a real browser at 1440x900, 1280x800 and 1024-wide viewports. Capture reviewable screenshots for the core list/detail routes and representative Dashboard, form and overlay states.
4. At every viewport, check the shell and document for horizontal overflow, while allowing wide tables to scroll inside their own table surface.
5. Check browser console errors and failed network responses. Unexpected console errors or HTTP 4xx/5xx responses fail the browser gate.
6. Verify navigation, list, search, filter, pagination, detail, create, edit, delete confirmation, batch actions, import/export overlays, upload, permissions, audit, activity and associations in proportion to the migration surface.
7. For every critical UI write, record the visible result, successful HTTP response, persisted database state and reload result.

Human visual review remains required, but it does not replace the automated, browser, network and persistence evidence above. A successful build alone is not evidence that a page, interaction or business flow passed.
