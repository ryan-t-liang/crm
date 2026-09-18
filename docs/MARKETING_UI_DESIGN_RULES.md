# Marketing UI Design Rules — V5 活动记录工作区

本文件是营销UI实现规则，不是测试或验收报告。绑定规范为仓库中的kivisense-admin-design Skill（含PATTERNS / ANTI_PATTERNS / BEST_PRACTICES / WORKFLOWS / REFERENCES与营销示例）及KIVISENSE_DESIGN_SYSTEM_V2.md。React、Semi Design / Icons与Kivisense主题继续使用，不复制外部AGPL应用源码，不更换CRM基础库。

## 先创建对象，再配置业务

List → Quick Create SideSheet → 创建Activity → Record Detail → 配置高级能力。创建 / 编辑共用680px右侧Semi SideSheet（FormSideSheet），宽度不超过视口，内容超高时仅Body滚动；Header / Title / Close / Padding / Footer / Button直接复用当前CRM的Semi侧边表单样式，不另造Marketing弹窗。核心字段为名称、品牌、线上 / 线下、线下场地、活动开始 / 结束、参与方式、抽奖开关、规则富文本。活动编号只读。编辑字段顺序相同；已有业务规则锁定继续生效。创建取消 / 创建活动，编辑取消 / 保存。

不新增Steps、Wizard、说明 / 封面输入、发布检查页，不把预约窗口 / 场次 / 容量、次数 / 概率或奖品配置塞进创建。已创建对象的预约 / 抽奖配置继续使用单主题Focused Drawer，场次、奖品、配额、兑换码导入与链接编辑均使用右侧SideSheet。

## 列表与Header

八列：活动编号、名称、类型、场地、活动时间、状态、参与方式、操作。名称进入详情，编辑 + 图标更多，无列表KPI。更多仅开始 / 暂停 / 结束，原时间与启用校验不变，不自行改写业务窗口。

三生命周期标签保持待开始 / 进行中 / 已结束，暂停只作为运营控制。线上场地为“—”，同日时间压缩，跨日保留两端日期。列表直接复用CRM PageHeader右侧新建操作及data-surface / table-toolbar / Semi Table。详情Header由DetailWorkspace提供，紧凑呈现编号 / 品牌、状态 / 类型 / 参与方式与活动时间 / 场地；编辑主操作、图标更多；不再提供用户流程预览。原时间Popover改为右侧真实时间信息，不增加新业务字段。

详情使用Lead / Deal相同的detail-grid：主内容Card + 默认290px右侧信息栏，响应式行为沿用现有CRM。右侧复用SideSection / DataList展示活动信息、按能力显示的活动 / 预约 / 抽奖时间及奖品领奖时间，不展示后台职责等研发说明。

## 三个记录入口与右侧配置

本轮用户指定的信息架构取代V4四入口和概览Summary：一级Semi line Tabs固定为活动预约记录 / 奖品设置 / 抽奖记录。置于既有record-tabs主Card内，无概览、活动设置或同权重二级Tabs。三个入口一直存在；直接参与显示无需预约空态，未启用抽奖显示提示但不隐藏历史记录。

左侧仅运营记录和奖品配置。右侧活动信息完整对应新建表单，包含名称、编号、创建人 / 时间、品牌、类型、地点、活动时间、参与方式、抽奖开关与规则；编辑活动仍使用同一680px侧边表单。预约 / 抽奖配置在右侧各有摘要和原Focused Edit入口，保留发布 / 已有业务记录锁定。管理场次是单主题SideSheet，不把场次配置堆回记录表。

Header显示活动名称，状态 / 品牌 / 类型 / 参与方式 / 创建人 / 地点使用克制Tag，编号和活动时间独立成行。活动详情范围内文字块间距15px、模块20px、操作按钮15px；不改全局Token或Semi表格Cell / 一级Tabs主题，原detail-grid响应式规则保持。

## 记录字段与业务状态

活动预约只查ACTIVITY：OpenID、姓名、手机号、性别、活动名称、参与时段、创建时间、状态、查看。显示状态为待核销 / 已核销 / 已取消；CHECKED_IN与FULFILLED映射已核销，NO_SHOW和INVALID以附加说明保留，不冒充取消或已核销。完整身份在现有管理权限下的只读详情展示，常规列表继续脱敏。

奖品设置保留奖品 / 奖项、类型、独立领取方式、概率、总配额、已中奖、剩余与原操作，新增领取有效期。奖品快照和历史中奖权益不跟随配置修改而变化。

抽奖表合并只读展示：未发生draw的参与者、每次draw（含NONE）、关联award快照和独立PRIZE预约。未抽奖行不产生伪造draw、不扣机会，不按用户名或手机号合并多人 / 多次记录。字段含OpenID、姓名、手机号、性别、奖品 / 结果、领取方式、阶段状态、参与 / 抽奖 / 核销时间与查看。

阶段值独立保留1未抽奖、2已抽奖、3已核销（直接领取）、4已预约、5已核销（预约领取）。3 / 5的Tag中文一致，状态筛选与详情保留值和业务流程差别。虚拟直接发放不是外部核销，仍为2并注明已发放；未中奖也是2。取消、爽约、失效、过期、资料缺失使用附加说明，不改原运营状态合同。详见MARKETING_RECORD_FIELDS.md。

仅抽奖表的需预约权益在查看旁增加预约记录，按当前activity + participation + award过滤PRIZE历史，保留取消 / 改约记录和未预约空态；不混入ACTIVITY。按用户本轮要求使用只读Semi Modal展示该用户该奖品的预约；所有新建 / 编辑仍为SideSheet。活动预约表不重复放奖品预约入口，参与用户和独立核销记录按钮移除，核销状态与时间合并在抽奖表。旧participants / redemptions等leaf route仅适配到对应三个页签，不再打开单独记录集合，底层核销事实及独立Staff Surface不变。

一级页签下不重复渲染同名标题，奖品设置直接展示表格与适用的轻量操作。管理场次与字段块间距20px。用户本轮明确要求可读字号，因此活动范围内的页签和右侧卡片标题统一16px，右侧字段标签 / 值14px，不调整全局或其他模块。两张记录表均直接显示30条独立命名空间的虚构示意；不要求点击加入示意或重置旧数据，不写实际Store / 库存 / Dashboard。具体夹具与原数据保留边界见MARKETING_RECORD_FIELDS.md。

## Style与保留边界

成熟Lead / Deal / Customer / Member页面决定视觉：AppShell / Sidebar / Top Header保持不变，页面继承crm-canvas背景，Card使用crm-surface / crm-border / crm-radius。直接复用page / detail-page / record-tabs / side-section / data-surface / table-toolbar / form-grid / rich-editor等既有组件与Class。表格Header / Row / Border / Hover / Action与EmptyBlock沿用CRM，不保留Marketing专属Semi Table Cell覆盖。字段间距12–20px，Card信息密度以现有组件为准，不重复32–48px留白。规则编辑器默认180px高，沿用CRM富文本外壳。只修改既有marketing.css的必要组合样式，移除专属背景、一级Tabs及Modal Chrome覆盖，不改全局Token，不建立override / fix文件。

规则编辑器沿用Tiptap基础和HTML白名单，旧未标记内容仍按纯文本展示。activityCode生成、品牌权限、规则锁定、机会 / 库存 / 代码分配、ACT / PRIZE容量、不可逆中奖权益、Staff核销与LocalStorage迁移均不变。Sales / Member Store、Dashboard、SQL、后端、数据库和依赖不改。

前一轮CRM Style Revert的免测试 / 等待Review约束只适用于该轮。本轮按新增要求统一侧边表单、品牌显示与导航，移除用户流程预览；执行现有类型检查、回归测试与构建，按授权同步当前分支和发布，不改main。品牌名统一Kivisense，gp/un仅作为原始数据范围编码保留，不合并记录或权限。历史预览链接只展示活动后台详情，不再呈现用户报名 / 抽奖操作。
