# Marketing UI Design Rules — V4 CRM Style Revert

本文件是营销UI实现规则，不是测试或验收报告。绑定规范为仓库中的kivisense-admin-design Skill（含PATTERNS / ANTI_PATTERNS / BEST_PRACTICES / WORKFLOWS / REFERENCES与营销示例）及KIVISENSE_DESIGN_SYSTEM_V2.md。React、Semi Design / Icons与Kivisense主题继续使用，不复制外部AGPL应用源码，不更换CRM基础库。

## 先创建对象，再配置业务

List → Quick Create Modal → 创建Activity → Record Detail → 配置高级能力。创建 / 编辑共用760px居中Semi Modal，内容超高时仅Body滚动；Header / Title / Close / Padding / Footer / Button直接复用当前CRM的Semi默认样式，不另造Marketing Modal。核心字段为名称、品牌、线上 / 线下、线下场地、活动开始 / 结束、参与方式、抽奖开关、规则富文本。活动编号只读。编辑字段顺序相同；已有业务规则锁定继续生效。创建取消 / 创建活动，编辑取消 / 保存。

不恢复创建SideSheet、Steps、Wizard、说明 / 封面输入、发布检查页，不把预约窗口 / 场次 / 容量、次数 / 概率或奖品配置塞进创建。已创建对象的预约 / 抽奖配置继续使用单主题Focused Drawer，场次和奖品使用小型 / 中型Modal。

## 列表与Header

八列：活动编号、名称、类型、场地、活动时间、状态、参与方式、操作。名称进入详情，编辑 + 图标更多，无列表KPI。更多仅开始 / 暂停 / 结束，原时间与启用校验不变，不自行改写业务窗口。

三生命周期标签保持待开始 / 进行中 / 已结束，暂停只作为运营控制。线上场地为“—”，同日时间压缩，跨日保留两端日期。列表直接复用CRM PageHeader右侧新建操作及data-surface / table-toolbar / Semi Table。详情Header由DetailWorkspace提供，紧凑呈现编号 / 品牌、状态 / 类型 / 参与方式与活动时间 / 场地；编辑主操作、用户预览次操作、图标更多。原时间Popover改为右侧真实时间信息，不增加新业务字段。

详情使用Lead / Deal相同的detail-grid：主内容Card + 默认290px右侧信息栏，响应式行为沿用现有CRM。右侧复用SideSection / DataList展示活动信息、按能力显示的活动 / 预约 / 抽奖时间及奖品领奖时间，不展示后台职责等研发说明。

## 四个业务入口

一级Semi line Tabs固定：概览 / 活动设置 / 参与管理 / 中奖与核销。置于record-tabs主Card内，直接复用Lead / Deal的Tabs视觉，不重写一级Tabs选中状态。

二级为低权重文字导航，无浅蓝选中背景，不再堆叠第二套同权重Tabs。

- 活动设置：基本信息、预约设置（预约参与）、抽奖设置 / 奖品设置（启用抽奖）。
- 参与管理：参与用户、活动预约记录、抽奖记录。界面预约记录只查ACTIVITY，不混入PRIZE。直接参与且无历史活动预约时隐藏该入口。
- 中奖与核销：中奖记录、领奖预约（需要预约或有历史记录）、核销记录。领奖预约只查PRIZE，保留取消 / 爽约等历史。旧直接参与活动的bookings链接在只有领奖预约时适配到prize-bookings。

设置内容在主信息Card内左对齐、max-width1040px，紧凑Definition Grid复用form-grid间距，平面Section使用共用tab-panel-header。允许主Card，不为每两个字段新建Card或再次添加装饰性套层；表单仍按单主题编辑，不增加业务操作。

## 概览口径与明细

数字按业务分组，每组使用一张既有CRM chart-panel Summary Card，组内紧凑并列数字，不给每项数字单独套Card或建立更多Card层级；统计来源和明细集合不变。

- 活动表现：该活动全部Participation数；到场 / 完成 / 中奖人数复用原activityMetrics参与主体集合。
- 抽奖情况：抽奖人数、次数（包含未中奖）、中奖份数，复用原指标集合。
- 领奖情况：原award状态为待领取 / 待预约的权益、原状态为已预约 / 待领取的权益、原isAwardFulfilled成功的权益；前两项按当前状态互斥，已过期 / 待核对不冒充待领取。

“已领取 / 发放”对实体含原领取 / 体验完成，对虚拟仅表示平台侧内容生成 / 发放，不推断外部兑换 / 使用。指标按钮打开相同记录集合的只读明细，显示用户、记录内容和时间，而非只显示UUID。快照随对象 / 权限 / 数据 / 路由变化关闭，不产生写入。

直接参与不显示有效预约人数；未启用抽奖不显示抽奖组与中奖人数；没有配置奖品且无历史权益时不显示领奖组。中奖历史仍通过中奖记录可读，不由菜单重构删除。

## 相关记录和中文

参与主表仅用户、渠道、脱敏手机号、会员关联、参与状态、签到 / 完成、创建时间。完整身份和次数 / 凭证在轻量详情抽屉保留，敏感身份继续受现有权限控制。Flexible Identity不新增会员 / 手机号 / UnionID必填。

奖品表保留奖品、类型、领取方式、概率、配额、已中奖、剩余及原业务操作；容量 / 可继续中奖 / 兑换码信息移到奖品编辑摘要或专用代码入口。中奖记录与核销记录按业务字段扫描，后台保持只读核销记录，执行仍在Staff Surface。

普通中文使用实体 / 虚拟奖品、直接领取 / 预约领取 / 直接发放 / 预约使用、领奖预约、领取 / 使用完成。UI格式化原内部状态及错误 / Audit说明，不改存储内容、校验错误合同或核心状态机。研发限制只在文档，不放常驻页面说明。

## Style与保留边界

成熟Lead / Deal / Customer / Member页面决定视觉：AppShell / Sidebar / Top Header保持不变，页面继承crm-canvas背景，Card使用crm-surface / crm-border / crm-radius。直接复用page / detail-page / record-tabs / side-section / data-surface / table-toolbar / form-grid / rich-editor等既有组件与Class。表格Header / Row / Border / Hover / Action与EmptyBlock沿用CRM，不保留Marketing专属Semi Table Cell覆盖。字段间距12–20px，Card信息密度以现有组件为准，不重复32–48px留白。规则编辑器默认180px高，沿用CRM富文本外壳。只修改既有marketing.css的必要组合样式，移除专属背景、一级Tabs及Modal Chrome覆盖，不改全局Token，不建立override / fix文件。

规则编辑器沿用Tiptap基础和HTML白名单，旧未标记内容仍按纯文本展示。activityCode生成、品牌权限、规则锁定、机会 / 库存 / 代码分配、ACT / PRIZE容量、不可逆中奖权益、Staff核销与LocalStorage迁移均不变。Sales / Member Store、Dashboard、SQL、后端、数据库和依赖不改。

本轮CRM Style Revert按用户要求不运行测试、浏览器QA、截图或UI Gate，不增改测试 / QA脚本，不生成QA artifact。仅正常静态类型与Skill格式检查；历史验收不作为本轮验收。提交并普通推送当前产品原型分支，不改main / 部署 / Release，等待人工Review。
