# Kivisense CRM Design

本文件是仓库中唯一的 UI 视觉与交互规范。它整理现有 CRM 已经采用的语言，不创造另一套设计系统。

## 事实来源

发生冲突时，按以下顺序判断：

1. 当前已经成熟并被接受的真实页面：Lead List / Detail、Deal List / Detail、Customer / Member List / Detail、AppShell、Sidebar、Header。
2. 这些页面实际使用的共享组件与样式：`AppShell.tsx`、`CrmUi.tsx`、`tokens.css`、`app.css`、`components.css`。
3. 当前 Kivisense Semi Theme 与 Semi Design 的组件行为。
4. 本文件对现有语言的总结。
5. 外部产品参考；它们只提供交互思路，不提供视觉标准。

若文档与真实页面不一致，以真实页面为准。若要有意改变成熟模式，应同时修改共享实现和本文件，不能在单个模块中悄悄建立新标准。

以下文件不是视觉规范：

- 模块需求、字段映射和业务规则；
- `*_ACCEPTANCE.md`、QA 证据、问题记录和历史截图；
- 过去某一轮的 UI 修正说明；
- 外部产品截图或描述。

## 当前视觉语言

Kivisense CRM 的实际特征是：

- 紧凑、平静、结构清楚、信息密度高；
- 浅灰画布、白色内容表面、轻边框、小圆角、克制阴影；
- 品牌绿色只用于重点、选中、状态和主要动作；
- 层级主要来自排版、对齐、边界和留白，不依赖装饰；
- 表格、工具栏、线性页签和信息侧栏承担主要信息组织；
- 状态标签低饱和、内容宽度自适应，不把所有字段做成 Tag；
- 不追求大标题、大留白、大圆角、渐变、玻璃效果或卡片墙。

颜色、字号、间距、圆角和响应式断点以当前共享 CSS 为准。新模块必须复用变量与共享类，不在文档或模块 CSS 中复制一套近似 token。

## 基础实现

- React 提供页面结构和行为。
- Semi Design、Semi Icons 与 Kivisense Semi Theme 是组件基础。
- `frontend-react/src/index.css` 只汇总正式样式。
- `frontend-react/src/styles/tokens.css` 定义品牌和 Semi token 映射。
- `app.css` 管理 AppShell、Sidebar、Topbar 与页面画布。
- `components.css` 管理共享列表、详情、表单、表格和状态结构。
- 模块 CSS 只处理该模块无法由共享结构表达的组合，不覆盖共享 Semi 外观。

不要引入第二个组件库，也不要创建 `override.css`、`fix.css`、`legacy.css` 或其他补丁式样式来源。

## AppShell

沿用当前 `AppShell`：

- 固定侧栏、紧凑 Topbar、面包屑、范围信息和用户入口；
- 侧栏使用分组导航、图标、计数与低强调选中态；
- 窄桌面自动折叠侧栏，页面内容不得产生 document 横向滚动；
- 模块只能增加合法导航项，不能重新定义 Shell 的尺寸、字体或色彩。

## 列表页

成熟列表页结构是：

`PageHeader → 可选的紧凑指标条 → data-surface → table-toolbar → Table`

- PageHeader 保持短标题、单行说明和一个明确的主要动作；
- 搜索与筛选集中在 toolbar，不用装饰卡片分散；
- 表格字段服务于识别、比较和行动；宽表在容器内部滚动；
- 主标识进入详情，常用操作直接显示，低频操作进入更多菜单；
- 分页、Loading、Empty、Error 和权限禁用使用现有共享状态；
- 指标条只在成熟页面已有或业务确实需要时使用，不把普通列表改造成 Dashboard。

## 详情页

成熟详情页结构是：

`DetailWorkspace → compact header → main record-tabs surface + optional information rail`

- 标题区呈现记录身份、必要状态和少量关键上下文；
- 主内容使用现有 line Tabs 与 `record-tabs` 表面；
- 右侧 `SideSection` / `DataList` 只放真实业务身份、关系和上下文；
- 主区和侧栏沿用 `detail-grid` 的现有宽度与响应式行为；
- 不建立无边界白页，也不为每组字段创建独立 Card；
- Card 用于真实内容边界，不是装饰。保留一个主工作表面和必要的信息卡，避免嵌套与碎片化。

## 创建与编辑

- 沿用成熟页面的右侧 SideSheet 表单和 `FormSideSheet` 行为；
- 创建与编辑尽量使用相同字段顺序和表单结构；
- 普通表单使用现有 `form-stack` 或 `form-grid`，保持一到两列；
- Header、关闭、滚动区和 Footer 不做模块级重新设计；
- 一个表单通常只有取消和一个主要提交动作；
- Modal 用于确认或短暂聚焦的只读内容，不替代成熟的创建/编辑模式；
- 业务复杂度由信息架构解决，不能默认引入步骤条、全屏向导或嵌套页面。

## 表格、状态与动作

- 使用 Semi Table 和现有行高、表头、Hover、边框及操作列；
- 状态优先使用现有 `StatusTag` 或相同的低饱和语义；
- 每个页面只突出一个主要动作；
- 常用次级操作使用普通或 borderless Button；
- 低频与危险操作进入 Dropdown，并在执行前确认真实后果；
- 图标按钮必须有可访问名称；信息卡编辑入口使用共享的小型编辑图标；
- 不把五个同权重按钮并排，不用颜色制造虚假优先级。

## 内容与文案

- 使用操作者能理解的自然业务语言；
- 页面不展示架构说明、数据库名、实现免责声明或测试术语，除非该页面本身就是技术管理工具；
- 空值、未知值和不可用状态必须明确，不能伪装为 0 或自动补值；
- 中英文混用以现有业务对象命名为准，不为视觉统一擅自重命名模型。

## 新 UI 的决策方式

开始修改前：

1. 找到最接近的成熟 Lead、Deal、Customer 或 Member 页面。
2. 比较它的共享组件、DOM 结构、样式类和交互状态。
3. 复用现有结构；只有业务差异才允许新增模块组合。
4. 检查 Loading、Empty、Error、权限、Hover、Focus、Selected、内部滚动和窄桌面状态。
5. 若找不到本地先例，先提出最小扩展，不以外部产品截图直接定义 Kivisense。

## 外部参考

外部产品只能作为 Interaction Reference，例如 Quick Create、record-first、抽屉使用时机或信息架构启发。不得写成“视觉应该像某产品”，不得用外部产品的间距、卡片、字体或色彩覆盖当前 CRM。

需要讨论外部参考时，只读取 [kivisense-admin-design/REFERENCES.md](../.agents/skills/kivisense-admin-design/REFERENCES.md)。默认不复制第三方源码；任何源码复用都必须另行核对精确文件与许可证。
