# 活动详情记录口径

本轮基于73ef802，纯前端增量展示，不新增SQL、后端、销售对象、金额字段或存储命名空间。三入口：活动预约记录 / 奖品设置 / 抽奖记录；活动核心信息与编辑在右侧。未清空或seed-merge已有LocalStorage。

## 页面字段来源

| 页面字段 | 前端来源 | 转换 / 缺失处理 | 本轮扩展 |
| --- | --- | --- | --- |
| 活动名称、品牌、类型、场地、时间、参与方式、开关、活动规则 | activity现有字段 | bookingEnabled映射预约 / 直接；线上地点空；规则沿用安全HTML / 旧文本展示 | 否 |
| 活动创建人 | activity.createdBy → 现有演示管理用户名称 | 集中动作只在新建 / 复制时记录actor.id；编辑不得改创建人；旧记录未记录，不用首次编辑Audit推断 | 是，可选前端元数据 |
| 活动创建时间 | activity.createdAt | 原时刻按上海时间展示；缺失显示—，不回填今天 | 否 |
| OpenID | participation.identity.openId / identities引用 | 保留微信应用上下文；常规列表脱敏，管理权限详情显示完整保存值；空值— | 否 |
| 姓名、手机号 | 现有participantDisplayName / participantIdentity读侧 | 活动identity快照优先，兼容现有会员引用；缺失不自动创建会员；列表手机号脱敏 | 否 |
| 性别 | participation.identity.gender | 可选MALE / FEMALE / UNDISCLOSED / null；未提供显示未记录；不从Sowind称谓或姓名推断 | 是，活动表单快照；不是Sowind字段 |
| 活动预约参与时段 | ACTIVITY booking.slotId → 当前活动slot | 名称与原开始 / 结束时间，缺失场次待核对 | 否 |
| 预约创建时间、取消时间 | booking.createdAt / canceledAt | 原时间；改约保留旧取消预约与新的BOOKED行 | 否 |
| 活动预约状态 | booking.status | BOOKED / NO_SHOW=待核销（未到场单独说明），CHECKED_IN / FULFILLED=已核销，CANCELED=已取消；INVALID独立附加说明 | 只读展示口径 |
| 抽奖参与 / 抽奖 / 核销时间 | participation.registeredAt / draw.occurredAt / award.fulfilledAt | 不把issuedAt当核销时间；无draw的行抽奖时间— | 否 |
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

每个draw分别展示，不按手机号 / 用户名折叠；同一人多个奖项的状态各自独立。缺draw的历史award单独保留并标来源待核对。预约记录按钮查询activityId + participationId + awardId（活动预约行的参与者历史不限定awardId），始终仅PRIZE；未预约显示空态，取消和重约历史保留。不跨活动、参与者、奖项或品牌扩大查询。

## 兼容边界

Sowind四表和会员/销售Store未改；可选gender不混入user_profile，不把salutation当性别。新createdBy不是后端字段。旧数据无新字段照常读取，schema仍为2且存储键不变。查看、筛选、历史抽屉不调用act、不写LocalStorage、不补建记录。HQ权限和活动品牌过滤沿用原入口，Staff仍是唯一核销执行页面。

## 示意数据（2026-09-18 增量）

按用户要求新增25位虚构参与者：25条活动预约（3待核销、20已核销、2已取消），抽奖表25行（5未抽奖、10已抽奖、2直接已核销、4已预约、4预约已核销）。20次虚构draw中4次未中奖、16份奖品；虚拟发放仍标为已抽奖，不伪造外部兑换事实。包含男女、未透露和未记录性别以及五种参与渠道。

全部姓名标注“示意用户”，OpenID、手机号、凭证与兑换码均为虚构。参与identity不引用会员，不创建customer / user / profile / intent，不写销售Store。历史核销明确使用DEMO_SEED来源。

只有缺失营销存储键的新初始化才在原第一个演示活动追加这些数据（保留原满额演示记录，共26条活动预约）；已有LocalStorage不自动合并。营销列表的“加入示意数据”是HQ显式操作，创建独立的25条示意活动并打开详情，重复点击只打开原活动，不重复追加、不刷新原时间、不替换用户修改。既有四个默认活动、销售/会员存储键及数据不变；无需清库或重置。
