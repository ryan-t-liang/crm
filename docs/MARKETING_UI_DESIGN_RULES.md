# Marketing UI Design Rules — V3

本文件定义当前营销UI实现规则，不是测试或验收报告。继续使用React、Semi Design / Icons与Kivisense主题；不复制Plane / Linear或AGPL源码，不更换CRM基础库。

## 先创建对象，再配置业务

快速创建Activity → 进入详情 → 分别配置预约、抽奖和奖品。创建 / 编辑共享720px SideSheet，仅有活动名称、所属品牌、活动类型、线下场地、开始 / 结束时间、参与方式、启用抽奖、活动规则。时间同一行两列；活动类型 / 参与方式用Radio，启用抽奖用Switch。新建取消 / 创建活动，编辑取消 / 保存；没有草稿按钮、发布按钮、Steps、Wizard或发布检查页。

基础表单不带预约窗口 / 场次 / 容量、抽奖规则或奖品。详情配置按能力显示基本信息、预约设置、抽奖设置、奖品设置。预约与抽奖表单独立打开，不是伪装步骤的Tabs。已开始或有业务历史的活动保留原业务字段锁定，基础表单仍展示同样字段，不维护另一套编辑表单；名称和规则可编辑。

## 列表与操作

标准Data Table，不做卡片列表或KPI墙。八列：编号、名称、类型、场地、活动时间、状态、参与方式、操作。名称进入详情，无额外查看按钮。单行筛选：搜索名称 / 编号、类型、三状态、参与方式、授权品牌；窄容器内工具栏 / 表格内部滚动，不添加第二层卡片。

行操作编辑 + 图标更多；活动详情也只保留同样三个更多项：开始 / 暂停 / 结束。开始复用原启用 / 恢复逻辑及校验，尊重计划时间，不移动业务窗口；正常进行时不可重复开始。暂停只控制业务，不增加生命周期状态。结束有简单确认，沿用原停止新参与及保留中奖权益的语义。复制、删除、Audit和重置底层能力仍存在，不放进活动More。

业务状态只有待开始 / 进行中 / 已结束，采用低饱和小Tag；内部DRAFT / PUBLISHED / PAUSED / CANCELED合同保持不变。类型 / 参与方式显示中文，线上场地和缺值显示“—”。UUID保留用于关联路由，不直接作为活动编号展示。

## 信息层级与Surface

最多App Background → Main Content → Interactive / Elevated Surface三层。普通Form Section由16px标题、间距和细分隔线建立层次，不套Card。普通表格不套无意义大Card。Card只用于紧凑KPI、独立对象摘要或必要Alert；后台移除研发 / 原型限制常驻说明，真实边界留在模块与架构文档。

固定间距4 / 8 / 12 / 16 / 20 / 24 / 32 / 40；marketing.css定义对应局部tokens。Label到Input为8px，字段间20px，Section内部16–20px，Section之间32px，Header到Content24px，页面水平24–32px，Drawer padding24px。只修改既有marketing.css，不新建override / fix样式。

字号：Page Title24/32/600，Drawer Title20/28/600，Section Title16/24/600，Body与Table14/22，Label13/20/500，Help12/18。保持当前品牌色，克制边框 / 圆角；无需固定时间侧栏或多阶段Badge。

## 简单规则富文本

复用Semi已经依赖的Tiptap React / StarterKit同版本基础；显式声明两个直接依赖，不增加另一套UI库。只开放Bold、Italic、Ordered / Unordered List、Paragraph、Link、Line Break，白底、轻边框、简洁Semi工具栏；默认编辑内容区200px。

新编辑内容保存在ruleContent，并明确ruleContentFormat=html；旧未标记内容仍按纯文本展示。读取 / 输出严格HTML白名单，移除事件、任意属性、嵌入内容和不安全链接。规则只展示，不控制参与次数、抽奖、中奖概率或履约。旧description / cover只保留数据兼容，不恢复为表单字段，不无规则覆盖旧资料。

采用官方[StarterKit可裁剪扩展配置](https://tiptap.dev/docs/editor/extensions/functionality/starterkit)，关闭标题、代码块、引用、媒体等不需要能力。Semi的AIChatInput不是活动规则表单，不直接复用其AI技能 / 模板输入UI。

## 保留边界

Activity / Prize两个预约维度、Physical / Virtual、Flexible Identity、多渠道、权限 / 品牌隔离、机会 / 库存 / 代码分配 / 履约 / Audit集中动作继续保留。基础 / 预约 / 抽奖保存只合并对应字段到当前对象，不覆盖另一份配置。Sales / Member Store、Dashboard、Sowind SQL、后端与数据库不改。

V3按用户要求不执行测试、Browser QA、截图或验收，不修改既有测试 / QA脚本。旧readiness纯函数保留既有测试合同但不再由运营UI引用；五步组件、导航、检查页和对应CSS已删除。以正常静态类型检查支持代码实现，不把历史验收结果当作V3已验收。当前工作仅提交并普通推送产品原型分支，不改main / 部署 / Release；后续等待人工UI Review。
