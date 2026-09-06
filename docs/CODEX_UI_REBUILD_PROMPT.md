# Kivisense CRM 2.0 — shadcn UI Rebuild

基于当前分支最新代码继续开发。

本次只做 UI / Frontend Design System 重构，不重新定义 CRM 业务模型。

## 1. UI 技术基线

必须真正使用：

- React
- Tailwind CSS
- shadcn/ui
- Lucide Icons
- TanStack Table

核心视觉和页面结构参考：

https://ui.shadcn.com/blocks#dashboard-01

重点：

不要只是“模仿 shadcn 风格”。

如果当前前端不是 React / shadcn 架构，请先审计，并制定前端迁移方案。

允许重构前端壳层和组件体系。

禁止为了 UI 重构修改：

- CRM 核心 Domain
- Database Schema，除非绝对必要
- API Contract
- RBAC 业务规则
- Followup / Task / Journey / Scoring 逻辑

---

## 2. Frozen Business Domain

保持：

Organization = Company 360

Contact = Person 360

Lead = Opportunity

Followup = Business Interaction

Task = Next Action

Journey = Business History

Audit = System Operation History

Nurture = Customer Nurture Plan

Dashboard = Non-financial Customer / Pipeline / Execution Analytics

现有：

Company
Contact
Lead
Customer Operations
Workbench
Supplier
Task
Followup
Scoring
Lifecycle
Nurture
Reactivation
Attachments
Import / Export
RBAC
Audit

全部保留。

---

## 3. Design Direction

最终产品必须呈现：

Modern B2B SaaS CRM

关键词：

- Premium
- Quiet
- Dense
- Structured
- Fast
- Professional

必须最大限度复现 shadcn `dashboard-01` 的：

- Sidebar 结构
- Site Header
- Content rhythm
- KPI Card 气质
- Chart Container
- Data Table
- Border
- Typography
- Spacing
- Hover / Active states

但业务内容全部替换成 Kivisense CRM。

---

## 4. Brand

Kivisense：

#04E06E
#03C360

规则：

90% Neutral
10% Brand Accent

Brand Green 只用于：

- Primary Action
- Focus
- Selected
- Active Indicator
- 少量 Chart Highlight

禁止：

- 大面积绿色 Sidebar
- 大量绿色 Badge
- 彩色 Dashboard
- Marketing Gradient

---

## 5. UI Rules

Radius：

- Button/Input/Select 8px
- Card 10px
- Dialog/Drawer 12px

Spacing：

4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48

Typography：

- Page Title 24px
- Section 16–18px
- Body/Table 14px
- Secondary 13px
- Metadata 12px

原则：

Border First
Shadow Second

禁止：

- Card 套 Card
- 巨大圆角
- 巨大 Shadow
- 满屏 Badge
- 低代码式 Form
- 大块 Filter Panel

---

## 6. App Shell

优先完成统一：

- App Sidebar
- Sidebar Collapse
- Site Header
- Breadcrumb
- Page Header
- Main Content Shell
- Toolbar
- Dialog / Sheet
- Data Table Shell

导航：

Dashboard

客户管理
- 公司
- 客户联系人
- 线索

客户运营
- 客户运营
- 我的工作台

资源
- 供应商

系统管理
- 账户管理
- 角色与权限
- 审计日志

---

## 7. Dashboard

Dashboard 第一优先级。

布局尽量沿用 shadcn `dashboard-01`：

Section Cards
↓
Main Chart
↓
Business Table / Activity

第一排最多 6 个 KPI：

- 活跃公司
- 活跃线索
- 新增线索
- 待唤醒客户
- 逾期任务
- 停滞线索

禁止任何金额 KPI。

图表：

- neutral
- subtle grid
- restrained axis
- Kivisense Green 只作重点系列
- 禁止彩虹图表

---

## 8. CRM Tables

Company / Contact / Lead / Supplier / Tasks：

统一：

Page Header
Saved View / Tabs
Toolbar
Data Table
Pagination

Toolbar：

Search
Filter
Sort
Columns
Bulk Actions
View

高级 Filter 使用：

Popover / Sheet / Drawer

禁止大面积筛选表单。

Table：

- Row 40–44px
- Header 36–40px
- subtle divider
- restrained hover
- sticky header where useful
- metadata 用 muted text
- Badge 只给真正的状态

---

## 9. Detail / 360

Company 360：

- Summary Header
- Overview
- Contacts
- Leads
- Journey
- Tasks
- Files
- Notes
- Audit

Contact 360：

- Person Summary
- Company
- Related Leads
- Customer Journey
- Notes
- Audit

Lead Detail：

- Summary
- Stage
- Owner
- Latest Progress
- Next Action
- Related Company / Contact
- Requirement
- Attachments
- Followup Timeline

不要做字段墙。

---

## 10. Forms

保留现有业务 IA。

Contact：

3 Tabs

Lead：

5 Tabs

Company：

按业务模块组织。

规则：

- Tab / Section Navigation
- 同类字段放一起
- 文件必须紧邻对应文本
- 不一次铺开几十个字段
- Footer 统一 Save / Cancel
- 切 Tab 不丢失未保存状态

---

## 11. Implementation Order

1. Frontend architecture audit
2. shadcn installation / component foundation
3. Global tokens
4. App Shell
5. Dashboard
6. Table system
7. Company / Contact / Lead
8. Operations / Workbench / Supplier
9. Detail / Form / Attachment / Timeline
10. Login / System pages
11. Responsive review
12. Browser screenshots
13. Regression tests

---

## 12. Quality Gate

必须检查：

1440
1280
1024

不得出现：

document-level horizontal overflow。

必须截图：

Dashboard
Company List
Company 360
Contact List
Contact 360
Lead List
Lead Detail
Customer Operations
Workbench
Supplier
Create/Edit Form
Attachment
Login

最终 Verdict：

READY FOR UI REVIEW

或

BLOCKED

不要自动部署 Production。

最终效果必须明确表现为：

“真正使用 shadcn/ui 体系构建的 Kivisense CRM”

而不是：

“旧后台换了一层 CSS。”
