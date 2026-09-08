# Kivisense CRM 2.0 — V1 Native UI Foundation

基于当前分支最新代码继续开发。

本文件覆盖此前所有外部 UI Kit、Dashboard Demo、Dense Enterprise、Attio、Linear 和 Salesforce 视觉方向。

## 1. 唯一视觉来源

用户提供的 `crm-Kivisense_CRM_v1.zip` 是唯一视觉 Source of Truth。

视觉参考优先级：

1. `frontend/index.html` 中的 V1 inline style。
2. `frontend/js/app.js` 的 V1 DOM/class 组合，仅用于理解视觉结构。
3. `frontend/styles/production.css` 的补充规则。

不允许把其他产品或 UI 组件库作为第二视觉来源。

## 2. 组件技术基线

保留：

- React
- Tailwind CSS
- Lucide Icons
- TanStack Table
- Recharts

所有基础 UI 必须由：

`frontend-react/src/components/v1/`

直接实现。

必须使用 V1 原生组件实现：

- App Shell
- Sidebar
- Header / Breadcrumb
- Button / Input / Textarea / Checkbox / Select
- Card / Panel / KPI
- Table / Pagination / Toolbar
- Tabs
- Dropdown / Popover / Combobox
- Dialog / Delete Confirm
- Badge / Avatar / Skeleton / Alert
- Chart Container / Tooltip

禁止：

- `frontend-react/src/components/ui/`
- 外部 UI 组件体系的生成代码
- 用外部组件的 DOM 骨架套 V1 CSS
- `data-slot` 选择器换皮
- V1 与任何通用 UI Kit 的混合视觉
- 为未来开发重新引入已删除的 UI 组件依赖

依赖图中不得出现：

- `radix-ui`
- `cmdk`
- `class-variance-authority`
- `tailwind-merge`
- `tw-animate-css`

## 3. 保留当前产品

这是组件层和视觉层替换，不是产品回滚。

必须保留当前：

- React 页面与路由
- CRM Domain Model
- Contact 1:N Opportunity
- MarketingLead → MQL → SQL → Opportunity 生命周期
- Company / Contact / Marketing Lead / Opportunity / Supplier
- Dashboard / Workbench / Task / Followup / Journey
- Attachment / Import / Export
- API Contract
- RBAC
- 数据结构与数据库

禁止恢复旧版业务文案、旧路由、旧枚举、旧数据库、旧 API 或 legacy 页面入口。

## 4. V1 视觉语言

- Canvas：`#f3f1eb`
- White Surface：`#ffffff`
- Warm Surface：`#faf9f5`
- Ink：`#171717`
- Muted：`#666666`
- Line：`#e5e5e2` / `#d7d7d3`
- Dark Rail：`#0b0b0b`
- Kivisense Green：`#04e06e` / `#03c360`
- V1 Gold：`#a9854b`
- V1 Navy：`#30465c`
- V1 Rose：`#9b5d61`
- Panel radius：`15px`
- Card radius：`13px`
- Control radius：`8–9px`
- Display heading：Georgia / Songti
- Body / Form / Table：sans-serif

页面必须呈现 V1 的暖灰画布、白色业务面板、深色侧栏、清晰边界、克制阴影、成熟业务密度和可识别的标题层级。

## 5. 组件与页面规则

- 页面使用 V1 App Shell，不得出现通用 Dashboard 模板骨架。
- 一个完整业务模块可以使用一个面板；字段不能各自变成卡片。
- KPI 使用 V1 独立指标卡，不做默认统计卡墙。
- 列表必须使用 V1 Toolbar + Table Window + Pagination。
- 表单保持现有字段与业务分组，但外壳、页签、Footer 和控件全部使用 V1 组件。
- 搜索联系人等关系字段使用 V1 模糊搜索下拉。
- 附件字段紧邻相关文字字段，支持图片、视频和文档。
- Dialog 是 V1 窗口，不得保留外部 UI Kit 的标题、留白或关闭按钮结构。
- 删除入口保持权限控制和确认窗口，不修改软删除语义。

## 6. 验收条件

代码验收必须同时满足：

1. `frontend-react/src/components/ui` 不存在。
2. 所有前端业务代码只引用 `@/components/v1/ui` 或业务组件。
3. 包依赖和 lockfile 中不存在已禁止的 UI 依赖。
4. 源码和构建产物中不存在 `data-slot` 换皮结构。
5. Frontend production build 通过。
6. 当前业务逻辑、API、RBAC 和数据结构没有被改动。

本轮按照用户指定的恢复策略，不运行 Playwright、Puppeteer、截图采集、浏览器 smoke 或 E2E。最终视觉由 Human Review 验收。

最终判断只有：

- `READY FOR HUMAN V1 UI REVIEW`
- `BLOCKED`

最终效果必须是：

“Kivisense CRM V1 的原生 UI 体系承载当前 CRM 2.0 产品。”

不得再出现：

“这是通用 UI Kit，只是换成了 V1 的颜色。”
