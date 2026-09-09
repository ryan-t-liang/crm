# Kivisense CRM — Semi Interaction Pattern Phase 1 完成报告

基线：`codex/kivisense-crm-v2.0`，实施起点 `8ef73bd0671b10c521055fcba241cee42a03ca2a`。

本轮仅调整 Contact List、Contact Detail、Contact Create/Edit 及其可复用前端 Pattern。没有修改数据库、后端、API Contract、Router、RBAC、搜索/筛选语义、导入导出契约或持久化数据。

## 1. 修改的文件

- `frontend-react/src/components/crm/interaction-patterns.tsx`：新增 CRM Interaction Pattern 层。
- `frontend-react/src/pages/entities-page.tsx`：将 Contact 列表与详情组合迁移到新 Pattern；Opportunity 分支保持原结构。
- `frontend-react/src/components/crm/entity-form.tsx`：Contact Create/Edit 改为同一套单页 SideSheet；Opportunity 表单保持原流程。
- `frontend-react/src/components/crm/data-table.tsx`：增加扁平列表模式和可配置空状态说明。
- `frontend-react/src/components/crm/timeline.tsx`：客户旅程改用 Semi Timeline Pattern。
- `frontend-react/src/components/crm/attachment-list.tsx`：增加 Contact 详情的渐进式紧凑上传模式。
- `frontend-react/src/index.css`：补充 Contact Interaction Pattern 的布局样式。
- `frontend-react/src/lib/crm.ts`、`frontend/js/field-definitions.js`：将后端既有的 Contact WhatsApp 字段补入前端类型和表单字段定义；没有改变 API 或对象模型。
- `docs/qa-evidence-semi-interaction-contact-phase1/`：保存截图脚本、12 张页面截图与运行时审计结果。

## 2. 新增的 CRM Pattern Components

新增并已在 Contact 使用：`CRMPageHeader`、`CRMListPage`、`CRMFilterBar`、`CRMEntityCell`、`CRMRecordHeader`、`CRMDescriptions`、`CRMAssociationCard`、`CRMRecordTabs`、`CRMActivityTimeline`、`CRMRecordListItem`、`CRMFormSideSheet`、`CRMFormSection`、`CRMEmptyState`、`CRMSystemInfoPopover`、`CRMActionMenu`。

这些组件仅依赖通用数据和 ReactNode，可继续用于 Organization、Lead、Opportunity、Account 和 System Pages。

## 3. 移除的旧 Contact UI

- 移除 Views、Filter、Table 共用大型圆角外壳的表现。
- 移除无筛选状态下常驻的重置按钮。
- 移除 Detail Header 中突出的系统 ID 与时间信息。
- 移除只读附件区默认展示的大型上传区。
- 移除 Contact Create/Edit 的三 Tab 表单、深色自定义 Header 与嵌套 Form Card。
- 普通只读字段为空时不再批量显示 `—`。

## 4. Contact List

- 使用紧凑指标组、Semi line Tabs、工作型 FilterBar 和独立 Semi Table。
- 已应用筛选显示可关闭 Tag，并只在有筛选时显示“清除全部”。
- 联系人使用 Avatar + 姓名 + Email 的 `CRMEntityCell`；组织名称可点击，职位作为次级文本，无组织显示“未关联组织”。
- 手机、商机数、负责人、最近互动、更新时间与权限感知操作菜单保持密集排布；最近互动保留完整时间 Tooltip。
- 列设置继续使用当前基于 Semi 的显示/隐藏能力，没有增加拖拽。

## 5. Contact Detail

- Header 聚焦 Avatar、姓名、职位、组织、联系人类型与触达阶段；新增商机保持 Primary Action。
- 系统 ID、创建/更新时间、创建/更新人收入口径统一的 More Popover，ID 可复制；删除动作也收进辅助区域。
- 左栏改为按值显示的 `CRMDescriptions`，其他联系方式整组为空时显示解释和添加入口。
- Organization 改为可导航的 `CRMAssociationCard`，不再作为一串数据库式字段。
- 右侧使用 Semi Tabs；关联商机使用紧凑 Record List；客户旅程使用 Semi Timeline；附件采用渐进式上传。
- 保留当前真实业务 Tab 与 Audit 权限判断。

说明：当前 Contact 的 `/leads` 兼容端点承载的是 Opportunity 关系。本轮没有虚构 Contact → MarketingLead 关联或“新增线索”动作，因此界面明确使用“商机”语言。

## 6. Contact Create/Edit

- Create 和 Edit 共用 `CRMFormSideSheet`，宽度 684px，单页滚动，固定 Footer。
- 按基本信息、联系方式、关联组织、业务信息、备注与附件分区，不使用 Tabs 或 Section Card。
- 两列优先；长文本和组织选择保持单列。
- 关联组织使用 Semi RadioGroup，保留关联已有组织、新建组织、组织暂未确认和个人联系人现有业务规则。
- 保留原保存 API、校验、字段错误定位、附件上传和权限行为；补回后端既有 WhatsApp 字段。

## 7. Semi 使用情况

新增交互层使用 Semi 的 Table、Tabs、SideSheet、Form、Descriptions、Timeline、Empty、Dropdown、Tooltip、Tag、Avatar、Popover、Typography、Pagination、Checkbox、AutoComplete、RadioGroup、Input 和 Upload。没有引入 shadcn、Radix、Lucide 或 TanStack Table。

## 8. 仍保留的旧 custom interaction

保留了现有 `DetailScaffold`、`SummaryStrip`、`Section`、`ContactOverview`、`FilterControl`、`EntityCombobox` 和 UI adapter。这些承担现有布局、数据组合或 Semi 适配，不是新造的平行交互库。Opportunity 页面未被本轮顺带迁移。

## 9. TypeScript 结果

PASS：`npm --workspace frontend-react run lint`。

## 10. Lint 结果

PASS：`npm run lint`，包含 frontend TypeScript project build 与 backend TypeScript noEmit。

## 11. Build 结果

PASS：`npm --workspace frontend-react run build`。Vite 输出成功；仅保留第三方 `lottie-web` direct eval 和既有大 chunk 警告。

## 12. Tests

- PASS：`npm run test:frontend`，frontend interaction contracts 通过，Vitest 3 files / 15 tests 通过。
- PASS：`npm test`，frontend 3 files / 15 tests 与 backend 1 file / 17 tests 通过。
- NOT RUN：backend 3 个需要外部环境条件的 integration suites，共 37 个 integration tests，按现有测试配置跳过；本轮无后端改动。
- PASS：本地构建连接现有 UAT 数据的只读浏览器验证，共 12 个状态；未提交表单、未修改业务数据。

## 13. Screenshot 输出位置

目录：`docs/qa-evidence-semi-interaction-contact-phase1/`

- 1440×900：Contact List、Detail Overview、关联商机、客户旅程、备注与附件、操作记录、Create、Edit。
- 1280×800：Contact List、Detail Overview、Create、Edit。
- `runtime-audit.json`：12/12 capture，document horizontal overflow 0，console error 0，page error 0，HTTP failure 0。

## 14. Git diff summary

本轮为 Contact 前端 Interaction Pattern 的独立改动，主要增量集中在一个可复用 Pattern 文件、Contact 页面组合和精简 CSS。提交前已执行 `git diff --check`，无 whitespace error。
