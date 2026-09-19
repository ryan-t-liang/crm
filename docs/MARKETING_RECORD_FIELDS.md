# 活动详情记录口径

> 文档角色：字段映射与只读业务口径。它不定义通用页面结构、视觉 token 或组件样式。本文此前记录的“三入口、统一活动管理下拉、SideSheet 创建编辑和固定像素间距”已由当前 `MARKETING_ACTIVITY_MODULE.md` 取代；发生冲突时以该模块合同和 `DESIGN_SYSTEM.md` 为准。

本文件保留预约、Draw、Award、PRIZE预约和核销的字段映射，以及既有30条只读示意数据口径。当前详情入口为概览 / 活动设置 / 参与管理 / 中奖与核销；新建 / 编辑活动使用共享 Modal，场次奖品配置使用 Contextual Drawer。仍为纯前端展示，不新增SQL、后端、销售对象、金额字段或存储命名空间，也不清空或seed-merge已有LocalStorage。

## 页面字段来源

| 页面字段 | 前端来源 | 转换 / 缺失处理 | 本轮扩展 |
| --- | --- | --- | --- |
| 活动名称、品牌、类型、场地、时间、参与方式、开关、活动规则 | activity现有字段 | bookingEnabled映射预约 / 直接；线上地点空；规则沿用安全HTML / 旧文本展示 | 否 |
| 活动创建人 | activity.createdBy → 现有演示管理用户名称 | 集中动作只在新建 / 复制时记录actor.id；编辑不得改创建人；旧记录未记录，不用首次编辑Audit推断 | 是，可选前端元数据 |
| 活动创建时间 | activity.createdAt | 原时刻按上海时间展示；缺失显示—，不回填今天 | 否 |
| OpenID | participation.identity.openId / identities引用 | 保留微信应用上下文；常规列表脱敏，管理权限详情显示完整保存值；空值— | 否 |
| 姓名、手机号 | 现有participantDisplayName / participantIdentity读侧 | 活动identity快照优先，兼容现有会员引用；缺失不自动创建会员；列表手机号脱敏 | 否 |
| 性别 | participation.identity.gender | 可选MALE / FEMALE / UNDISCLOSED / null；未提供显示未记录；不从Sowind称谓或姓名推断 | 是，活动表单快照；不是Sowind字段 |
| 活动预约参与时段 | ACTIVITY booking.slotId → 当前活动slot | 只展示原开始 / 结束时间，不附加场次名称；缺失场次待核对 | 否 |
| 预约创建时间、取消时间 | booking.createdAt / canceledAt | 原时间；改约保留旧取消预约与新的BOOKED行 | 否 |
| 活动预约状态 | booking.status | BOOKED / NO_SHOW=待核销（未到场单独说明），CHECKED_IN / FULFILLED=已核销，CANCELED=已取消；INVALID独立附加说明 | 只读展示口径 |
| 抽奖参与 / 抽奖 / 核销时间 | participation.registeredAt / draw.occurredAt / award.fulfilledAt | 不把issuedAt当核销时间；无draw的行抽奖时间— | 否 |
| 抽奖场次与规则快照 | draw.sessionId / drawConfigVersion或probability snapshot | 预约参与记录当时使用的场次和轻量规则；旧缺失显示待核对，不用当前配置回填 | 是，场次级抽奖合同 |
| 本场分配、已中奖、剩余 | SessionPrize.allocatedQuantity / 对应Award计数 | 已中奖和剩余为派生值；剩余=分配−已中奖，不重复持久化 | 是，场次级抽奖合同 |
| 抽奖奖品、方式、地点、说明、有效期 | 原award冻结快照 | 不从可变pool覆盖历史内容；缺关联显示待核对 | 否 |
| 奖品配置有效期 | pool.claimStart / claimEnd | 原值，新增表格列 | 仅展示 |

## 抽奖阶段

| 值 | 中文 | 判断 |
| --- | --- | --- |
| 1 | 未抽奖 | 有参与记录，尚无draw或award；仅生成只读表格行，不生成业务记录 |
| 2 | 已抽奖 | 每次实际draw，包含未中奖；中奖未预约 / 未核销或异常；虚拟直接发放仍为2，注明未记录外部核销 |
| 3 | 已核销 | award无需预约，已有fulfilledAt且现有isAwardFulfilled成立 |
| 4 | 已预约 | award需要预约，对应PRIZE预约为BOOKED且原bookingStatus校验仍有效，尚在领奖有效期 |
| 5 | 已核销 | award需要预约，已有fulfilledAt且现有isAwardFulfilled成立 |

直接：1→2→3；预约：1→2→4→5。阶段是读侧投影，不替换原booking.status / award事实，不制造核销写入。取消或失效可从4回到2并附加真实原因；取消后重约回到4。相同“已核销”标签在筛选中区分两种业务值，详情显示数字值与流程。

每个draw分别展示，不按手机号 / 用户名折叠；同一人多个奖项的状态各自独立。缺draw的历史award单独保留并标来源待核对。仅抽奖表的预约型奖品行在查看旁提供预约记录，弹出只读Semi Modal；查询activityId + participationId + awardId，始终仅PRIZE。未预约显示空态，取消和重约历史保留，不跨活动、参与者、奖项或品牌扩大查询。活动预约表只有查看，不重复提供奖品预约入口。参与用户与独立核销记录入口移除，核销状态和时间保留在抽奖表；底层真实核销事实未删除或改写。

## 兼容边界

Sowind四表和会员/销售Store未改；可选gender不混入user_profile，不把salutation当性别。新createdBy不是后端字段。旧数据无新字段照常读取，schema仍为2且存储键不变。查看、筛选、历史抽屉不调用act、不写LocalStorage、不补建记录。HQ权限和活动品牌过滤沿用原入口，Staff仍是唯一核销执行页面。

## 直接可见的30条示意数据（2026-09-18 修正）

每个活动详情直接展示30位虚构参与者：活动预约30条（3待核销、24已核销、3已取消），抽奖表30行（6未抽奖、11已抽奖、3直接已核销、6已预约、4预约已核销）。24次虚构draw中4次未中奖、20份奖品。虚拟直接发放仍为已抽奖，不伪造外部兑换事实；未抽奖行没有伪造draw。两表各10条/页，可筛选与查看详情。

全部姓名标注“示意用户”，表格标注含30条虚构示意；身份、手机号、凭证和兑换码均为虚构，不引用会员，不创建customer / user / profile / intent。需预约的十份示意奖品均可查看该用户该奖品的预约，示意核销事实为DEMO_SEED来源。

src/mock/marketing-record-illustrations.ts创建独立命名空间的只读快照，只有详情中的两表及其查看/奖品预约弹窗使用合并后的dataState。示意场次、奖品、日期和历史是明确的展示夹具，不修改实际活动配置、真实业务状态、库存、统计或LocalStorage。页面打开时固定快照时刻，内部ID稳定；30条示意外的原有记录保留，所以总数可能大于30。已有与新浏览器都直接可见，不需加入示意、创建独立活动或重置；此前已保存的25条及用户修改不删除。

旧版14px标题、15px字段 / 按钮间距和20px模块间距不再作为本模块独立规范。当前Tabs、Card、状态标签、表格和响应式行为统一复用 `DESIGN_SYSTEM.md` 与成熟CRM页面，不改销售 / 会员页面或全局Token。

旧版Header统一“活动管理”下拉和所有入口复用SideSheet的结构已废止。当前活动列表使用编辑 + 更多（开始 / 暂停 / 结束）；活动创建 / 编辑使用共享Modal；完整配置进入活动设置；场次奖品管理使用Contextual Drawer。管理能力继续受角色、品牌、活动 / 场次状态和历史保护共同约束，不能仅靠按钮显隐绕过集中动作校验。

活动配置保存明确使用SAVE_ACTIVITY的basic / booking / lottery字段白名单，允许发布或有业务历史后的定向编辑。状态、publishedAt、createdBy、createdAt、规则版本和其他字段沿用旧活动，不重新发布，不修改任何业务集合；历史品牌不可换，已有预约的场次不得删除 / 换地点 / 改时间，容量不得低于有效预约数。未声明字段组的整对象保存仍保留旧锁定保护。

SAVE_ACTIVITY_PRIZE允许追加独立新奖品；既有业务记录奖品的实质规则和已分配兑换码仍受保护，中奖快照不重建。场次结束或Activity结束后，SessionPrize配置只读；进行中场次可以按模块合同调整未来Draw的概率和数量。启用奖品概率合计不得超过100%，小于100%的部分自动成为未中奖概率；奖品耗尽后的原概率区间也转为未中奖，不重新分配给其他奖品。
