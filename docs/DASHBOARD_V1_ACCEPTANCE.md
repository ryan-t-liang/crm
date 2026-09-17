# 数据概览 V1 验收记录

日期：2026-09-17。工作区基线 `cc8e492f4a2409c55f10b3a16199eedeb652ce32`，分支 `codex/kivisense-product-prototype`。本轮未 fetch 替换、部署、提交或推送；开始只有未跟踪的 `artifacts/`，原有证据保留。新增的营销任务已接入独立模块，但没有再次重做三视图。

## 来源与实际改动

完整读取 dashboard ZIP 的 CODEX_DASHBOARD_TASK.md、README 与 Sowind SQL，以及当前 AGENTS / DESIGN_SYSTEM / PROTOTYPE_ARCHITECTURE、页面 / 路由 / 类型 / 两个 Store。仓库根没有独立 CODEX_DASHBOARD_TASK.md；读取的是解压后的附件，不能说仓库原来存在。

SQL 从附件原样复制至被原有 Git 规则忽略的 `docs/reference/sowind-schema.sql`，附件与本地 SHA256 均为 `757ef1d2b038cfc982e9a23a646fa36d274f8f89c1715a6a39152e1ddd3701a9`。未改 SQL 或 backend/domain/database。

一个入口 / 三个 Tab；业务摘要与待关注记录；销售新增 / 当前进展 / 当前工作；会员规模 / 新增 / 关联 / HQ 异常。渠道 / 产品 / Add-on 放次级折叠区。新增只读统计层、企业时区分桶、缺失覆盖说明、同口径 SideSheet，修正生产 URL 直达的分销商读取边界。会员新增可选 SQL 只读字段与明确演示种子，旧加载 / 键 / 版本 / 重置 / 转换 / 跟进动作不改。

实现文件分组：

- `features/dashboard/{DashboardPage.tsx,dashboard-model.ts,dashboard-model.test.ts}`、`styles/dashboard.css`、`index.css`。
- `types/member-operations.ts`、`mock/member-demo-data.ts` 与其回归测试、`features/member-operations/sowind-read.ts` 及现有页面只读 SQL 展示。
- `app/App.tsx` 路由与读取边界；原 CRM / Member Store 无修改。
- `qa/dashboard-browser-qa.mjs`、既有销售 QA 的同口径修订与持久状态断言、根 QA 脚本；不再删除整个旧证据目录。
- `DASHBOARD_METRICS.md`、`SOWIND_MEMBER_FIELD_MAPPING.md`、架构及本记录。

## 已执行验证

项目 lint 为 TypeScript `tsc -b`，不是另一个 ESLint 检查。最终命令和浏览器证据共同列在 `MARKETING_ACTIVITY_ACCEPTANCE.md`，不只凭构建声明通过。

概览单元测试24项 PASS，含全部 Lead 状态、旧开放 Deal、逾期任务、转换引用 / 重复冲突、零分母、上海自然日/月/季度、自定义边界、连续周/月桶、HQ组合、NULL与无效品牌引用、有效删除范围 / 未来创建排除、集团去重、品牌 / 分销商与权限隔离、Add-on与商品分类、缺数据不伪装0、旧快照电话及模型未修改。

真实 Chrome 在本地产物预览运行。浏览器时区 Los Angeles，企业统计 Shanghai。最近完成证据：`../artifacts/prototype-qa/2026-09-17T04-13-06.792Z-dashboard-v1/results.json`（后续精确最终构建重跑见营销验收记录）。11个 checkpoint 组 PASS：

| 检查 | 已验证内容 |
| --- | --- |
| 页面与布局 | 三视图各1440×900 /1280×800 /1024×768，共9截图；document/workspace 无横向溢出 |
| 筛选 | 品牌不改变销售、分销商不改变会员；今天不改变当前开放 Deal；切 Tab 保留筛选 |
| 下钻 | 原 KPI 的 ID 全量匹配，抽屉分页不漏；转 Deal 分子 / 分母、产品表、图点与逐桶明细 |
| 集团 | 同一GP/UN集团不相加，抽屉为customer；单品牌隐藏交集结构 |
| 异常 | HQ 0无错 / 0有错 / 1无错 / 1有错 / 空白错误；跨品牌关联待核验 |
| 日期与空 | 缺端 / 倒置 / 未来校验；空期趋势 / 空明细，不静默换默认 |
| 旧数据 | 日期 / 删除状态全部缺失，明确暂不可统计与待补数量；用户编辑 / NULL / 旧字符串HQ引用刷新后不变 |
| 重置 | 销售 / 会员双向互不清空 |
| 权限 | 分销商不见会员指标 / Sowind来源；直达会员概览与其他分销商销售详情拒绝 |
| 运行 | Console / runtime错误0、失败请求0 |

全销售 / 会员浏览器回归27组 PASS，包含创建Lead→Qualified→Deal、产品/Add-on、邮件演示/评论/电话/任务/笔记/附件、刷新、Won/Lost实际存储、看板拖动实际存储、联系人、产品只读、角色与桌面尺寸。证据 `../artifacts/prototype-qa/2026-09-17T04-06-28.798Z-sales-regression/results.json`；最终重跑另见营销验收。

## 缺陷与重测

真实缺陷：Select命名未传递、趋势两条序列重合点点击被遮挡、Esc默认未关闭抽屉。分别采用支持的aria-labelledby、可点击共享分桶点、closeOnEsc 修复；已重测 PASS，不屏蔽错误断言。

早期脚本问题：分销商选项实际名称、未等异步渲染、旧数据注入后同hash未重载、抽屉关闭重复点击、拖放默认中心落在交互元素。均改测试定位 / 等待，不弱化持久状态断言。早期开发热更新期间出现React卸载警告，该运行保留 FAIL；稳定构建预览重测0错误 PASS。详细稳定缺陷编号见 `UI_ITERATION_ISSUES.md`。

## 未实现 / 未验证

没有可靠成交时间、状态历史，因此未做本期实际成交数、历史连续漏斗、曾Qualified、阶段时长、历史存量、同比环比。没有业务来源的活跃/复购/付费会员、ROI、待跟进意向、完整率、跨产品Add-on兴趣等不显示成0。营销模块不补这些指标、不混入现有总量。

仅本地虚构前端验证，未做生产真实数据、HQ接口、真实后端RBAC、多设备并发或线上部署检查；没有据此宣称线上已更新。现有账号无单品牌只读角色，该范围只在模型层验证。SQL生产时区、字典、手机号匹配与管理员创建规则需另行确认，不能由UI推断。
