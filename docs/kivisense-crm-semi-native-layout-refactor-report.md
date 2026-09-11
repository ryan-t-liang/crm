# Kivisense CRM — Semi Native Layout Refactor 完成报告

日期：2026-09-11
基线：`codex/kivisense-crm-v2.0` / `d11bb7ae11032def327c11256df8561d9ae863b5`

## 结果

本轮已将正式 CRM 页面统一接入 Semi 原生应用骨架，并完成联系人、组织、线索、商机四个核心对象的列表与详情布局迁移。改动只涉及前端结构、布局样式和相应静态契约检查；未修改后端、API、数据库、路由语义、RBAC、字段、搜索/分页、导入导出或工作流状态语义。

## 新增共享布局

- `CRMAppShell`：以 Semi `Layout`、`Layout.Sider`、`Layout.Header`、`Layout.Content` 组成唯一正式应用骨架。
- `CRMPageContainer`：统一标准、列表、详情三种页面容器以及页面级 Breadcrumb 注册。
- `CRMListLayout`：统一列表页 Header、统计区和表格工作区。
- `CRMRecordLayout`：统一记录页 Header、摘要、阶段区、左侧资料栏和右侧工作区。
- `CRMRecordHeader`：统一对象身份、标题、副标题、标签和操作区；移除详情页重复的大型返回入口。

## 页面迁移范围

| 对象/页面 | 列表布局 | 详情布局 | 动态 Breadcrumb |
| --- | --- | --- | --- |
| 联系人 | 已迁移 | 已迁移 | 已显示联系人名称 |
| 组织 | 已迁移 | 已迁移 | 已显示组织名称 |
| 线索 | 已迁移 | 已迁移 | 已显示线索名称 |
| 商机 | 已迁移 | 已迁移 | 已显示商机名称 |
| 数据看板 | 不适用 | 不适用 | 已接入统一页面容器 |

所有登录后的正式路由均通过同一个 `CRMAppShell` 和顶部 Header。组织详情原先将操作按钮传送到全局 Header 的实现已移除，操作区现在位于受记录容器约束的 `CRMRecordHeader` 内。线索旅程使用共享的 Semi `Timeline` 模式呈现。

## 布局令牌

- 左侧导航：展开 `240px`，收起 `64px`。
- 顶部 Header：`56px`。
- 页面间距：桌面横向 `32px`、纵向 `24px`；1280 宽度横向 `24px`；较窄视口横向 `20px` / `16px`。
- 详情页最大宽度：`1480px`，超宽屏居中。
- 详情双栏：桌面 `320px + 32px gap + minmax(0, 1fr)`。
- 1280 布局：`300px + 24px gap + minmax(0, 1fr)`。
- 1100 以下：详情切换为单列自然流；右侧工作区维持 `min-width: 0`。
- 列表页保持可用宽度全宽，未套用详情页最大宽度。

## 兼容与依赖审计

- 正式 React 页面未发现 `@/components/v1/ui` 或旧 `@/components/ui` 引用。
- 未发现 Lucide、TanStack Table 或 Radix UI 前端依赖。
- 当前正式基础组件依赖为 `@douyinfe/semi-ui@2.103.0` 与 `@douyinfe/semi-icons@2.103.0`。
- 联系人、组织、线索、商机仍沿用原有数据请求、权限判断、筛选、分页、导入导出和表单逻辑。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | PASS（前端与后端 TypeScript） |
| `npm run build` | PASS（前端生产构建与后端构建） |
| `npm test` | PASS：前端 15 项、后端单元 17 项；37 项数据库集成测试按现有环境条件跳过 |
| `npm run test:frontend` | PASS：静态交互契约与前端 15 项测试 |
| Contact 布局浏览器审计 | PASS：8/8 截图，无页面横向溢出、控制台错误、页面错误或意外 HTTP 失败 |
| `git diff --check` | PASS |

构建仍会报告第三方 `lottie-web` 的 direct-eval 警告和主 bundle 大于 500 kB 的体积提示；两者均未阻止构建，也不属于本轮布局重构范围。

## Contact 截图证据

- `01-contact-list-1440x900.png`
- `02-contact-detail-overview-1440x900.png`
- `03-contact-list-1280x800.png`
- `04-contact-detail-overview-1280x800.png`
- `05-contact-list-1024x768.png`
- `06-contact-detail-overview-1024x768.png`
- `07-contact-list-2048x900.png`
- `08-contact-detail-overview-2048x900.png`
- `runtime-audit.json`：包含每个视口的 Semi Shell、页面宽度、详情列宽、间距、Breadcrumb 和溢出测量。

关键测量：1440 详情为 `320px / 32px`；1280 详情为 `300px / 24px`；1024 详情为单列；2048 详情容器限制为 `1480px`。四个视口的 `document.scrollWidth` 均等于 `clientWidth`。

## 变更边界

本轮没有修改后端、Prisma、数据库迁移、API 合约或生产部署配置。浏览器截图基于仓库自带静态 fixture，适合验证布局和交互结构；真实业务数据与人工验收仍应在部署环境中完成。
