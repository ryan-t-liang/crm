# Kivisense CRM — Contact Visual Composition Refinement

基线：`codex/kivisense-crm-v2.0`，实施起点 `ac9a5c7e52959aca3eebde32339a78227d810005`。

本轮只调整正式 Contact List、Contact Detail、Contact Create/Edit 与相关共享 CRM Pattern 的视觉构图。没有修改 Theme 色盘、数据库、Schema、API、Router、RBAC、Contact 数据模型、关系模型、导入导出、搜索、筛选或分页语义，也没有修改 Organization、Marketing Lead、Opportunity 或后端业务逻辑。

## 1. 修改文件

- `frontend-react/src/pages/entities-page.tsx`
- `frontend-react/src/components/crm/contact-overview.tsx`
- `frontend-react/src/components/crm/interaction-patterns.tsx`
- `frontend-react/src/components/crm/entity-form.tsx`
- `frontend-react/src/components/crm/attachment-list.tsx`
- `frontend-react/src/index.css`
- `docs/qa-evidence-semi-interaction-contact-phase1/capture.mjs`
- `docs/qa-evidence-contact-visual-composition/`

## 2. 删除的 Grid

- Contact List 的四等分 KPI Grid 已删除，替换为无容器、无纵向分隔线的 `CRMInlineStats`。
- Contact Detail Header 下方的四等分 Metric Grid 已删除，替换为行内关系摘要。
- Contact Overview 的三列 Relationship Brief Grid 已删除。
- Contact Overview 的“活动 + 商机”双列 Dashboard Grid 已删除，改为纵向业务阅读流。

## 3. Border 与 Divider 收敛

- Contact Table 移除外层 border、radius 与 Card 容器表现；Table 本身及必要行分隔保留。
- Contact Detail 左右栏之间移除全高 Vertical Border，以固定侧栏宽度、28px gap 和 Section rhythm 分栏。
- 左栏由五个带分隔线区块收敛为三个无分隔线信息组。
- Overview Section 移除 Card 边框、圆角、Header surface 与双层容器。
- Contact Form 普通 Section 移除逐段 Divider，仅关联组织模块保留 subtle surface。
- Compact Attachment read mode 移除外层 border，并删除重复上传入口。

## 4. Contact List 构图

- 页面标题下改为自然行内统计；总量与“本页”口径在文案中明确区分。
- Views 继续使用 Semi line Tabs，无 segmented box 或外层 Card。
- Filter label 不再在 Contact toolbar 中显示；搜索、类型、负责人和更多筛选作为一行工作工具栏，窄宽度允许 wrap。
- 无筛选时不显示重置；有筛选时继续使用 closable Semi Tag 和“清除全部”。
- Table 视觉焦点回到 Avatar、姓名、Email、组织、职位、负责人和相对时间等 Entity Cell 层级。

## 5. Contact Detail 构图

- Header 聚焦 Avatar、姓名、组织、职位、Email、状态和主要操作；系统 ID 与审计时间继续收在 More Popover。
- Header 关系统计改为 Inline Metadata，无 Card、无 Vertical Divider。
- 主区保留双栏概念：桌面左侧 300–320px、右侧自适应；1024px 降为单列。
- 左栏收敛为“基本资料”“联系方式”“所属组织 / 业务关系”三个主要 Section。
- 空字段继续隐藏；空联系方式和空关联使用 compact、左对齐状态，不再使用居中大 Empty。

## 6. Overview 新信息流

Overview 顺序已改为：

1. 下一步：有任务时显示日期、行动与负责人；无任务时显示轻量安排入口。
2. 最近活动：使用简化活动列表，无 Activity Card 套 Card。
3. 关联商机：有记录时使用 `CRMRecordListItem`，无记录时使用 compact empty state。

## 7. SideSheet

- 保留 Semi SideSheet、单页滚动、两列字段布局与 Sticky Footer。
- Header 使用现有浅色 Semi SideSheet 结构，没有深绿色 Header 或额外 Card。
- 普通 Form Section 通过 28px 节奏分组，不再逐段绘制 Divider。
- 只有“关联组织”复杂交互模块使用 subtle surface panel。
- Footer 保留顶部 subtle border，并将取消与保存分置两端。

## 8. Shared CRM Pattern 更新

- 新增 `CRMInlineStats`，统一无容器的列表与详情行内摘要。
- `CRMEmptyState` 的 compact 模式改为真正的轻量横向构图，不再渲染 Semi 大图形空状态。
- `CRMFormSection` 增加可选 `className`，允许复杂交互模块使用明确而受控的 surface。
- Capture V2 增加可配置输出目录与 1024px Contact list/detail 验证，旧证据默认输出行为不变。

## 9. 仍保留的 Box / Card Pattern

Contact 中只保留必要结构：关联组织表单模块、下一步行动 subtle surface、组织关联 hover surface，以及 Table 自身行/表头结构。全局 CSS 中仍有供其他页面使用的旧 KPI、Summary、Overview Grid 规则，本轮未删除或改造其他业务页面；Contact 正式渲染路径已不再使用这些旧 Grid。

## 10. 验证结果

- TypeScript：PASS，`npm --workspace frontend-react run lint`。
- Lint：PASS，`npm run lint`，包含 frontend 与 backend TypeScript 检查。
- Build：PASS，`npm --workspace frontend-react run build`。仅保留第三方 `lottie-web` direct-eval 和既有大 chunk 警告。
- Tests：PASS，frontend 15/15；backend unit 17/17。需要外部数据库环境的 37 个 integration tests 按现有配置跳过，本轮无后端改动。
- Browser capture：PASS，14/14 状态；document horizontal overflow 0、console error 0、page error 0、HTTP failure 0。

## 11. Screenshot 位置

`docs/qa-evidence-contact-visual-composition/`

- 1440×900：Contact List、Detail Overview、关联商机、客户旅程、备注与附件、操作记录、Create、Edit。
- 1280×800：Contact List、Detail Overview、Create、Edit。
- 1024×768：Contact List、Detail Overview。
- `runtime-audit.json`：记录所有 viewport、document width、SideSheet 状态及浏览器错误集合。

## 12. Git diff summary

本轮差异仅覆盖 Contact 前端组合、共享 Pattern、样式和只读 QA 证据。`git diff --check` 通过；未修改 backend、Prisma、migration、API contract、权限、数据或部署文件。
