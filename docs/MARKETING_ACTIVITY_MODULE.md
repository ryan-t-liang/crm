# 营销活动模块（V8 默认奖池与兑奖预约设置）

## 2026-09-20 当前交互与数据补充

- 保留活动预约记录 / 奖品设置 / 抽奖记录三个入口和右侧信息栏。
- 顶部“活动状态操作”仅含开始 / 暂停 / 结束。创建奖品位于奖品区；活动信息、活动预约设置、抽奖设置使用对应信息卡的编辑图标；管理活动场次位于活动预约设置卡。
- “兑奖预约设置”列表列为兑奖预约、有效日期、可预约数量、关联奖品、状态、操作；状态独立成列。上下文抽屉分“兑奖预约”“兑奖时段”“预约记录”，批量生成和新增单个时段均位于兑奖时段区。
- 新增独立演示活动“ Kivisense 品牌体验日（200条演示）”：200条活动预约、200条抽奖；咖啡券、DIY皮牌（预约领取）、京东购物卡三种奖品。管理账号加载时幂等追加，不替换旧活动和数据。完整映射与边界见MARKETING_RECORD_FIELDS.md。
- 当前概率继承和库存规则以本文件Session Probability章节为准，替代历史版本“所有场次必须单独配置”的要求。

> 文档角色：营销业务、数据和兼容合同。页面描述仅记录模块当前或历史行为，不是 Kivisense 视觉规范；如有冲突，以 `DESIGN_SYSTEM.md` 和成熟 CRM 页面为准。

现有纯前端原型的活动管理与独立数据模块，使用现有React、Semi Design / Icons、Kivisense主题及LocalStorage。不新增后端、数据库、SQL表、登录系统、微信服务或部署架构。营销合同为前端原型扩展，不混入Sowind四表；底层gp / un范围保留，用户界面分别显示为Kivisense与Kivicube。

销售仍为Lead → Qualified → Convert to Deal → Won/Lost，不新增Opportunity或金额。营销参与不成为Sales Lead / Deal或Sowind购买意向；集团 / 品牌用户关联、会员匹配、销售 / 会员Store、三视图Dashboard均未修改。

## Activity 中心与页面职责

唯一主入口 `#marketing` 为活动列表。权限过滤先于搜索和状态筛选，列表只显示以下八列：

```text
活动编号 / 活动名称 / 活动类型 / 场地 / 活动时间 / 状态 / 参与方式 / 操作
```

活动名称进入详情；一行只保留“编辑”和“更多”。更多菜单严格只有开始、暂停、结束。列表生命周期只呈现待开始、进行中、已结束；暂停是运营动作，不生成第四种列表状态。活动编号由系统按 `ACT + 上海日期 + 流水号` 生成，在当前营销命名空间内唯一且不可编辑，业务页面不显示内部 UUID。线上活动场地显示“—”。

新建与编辑共用同一套 Kivisense CRM 标准 Modal / Form。表单只包含活动名称、所属品牌、活动类型、场地、活动开始时间、活动结束时间、参与方式、是否启用抽奖和活动规则。线上活动隐藏场地；参与方式是预约参与 / 直接参与；活动规则使用轻量安全富文本。活动说明、发布检查、预约详细规则、抽奖次数 / 概率和奖品配置不进入该 Modal。预约、抽奖和奖品在活动创建后继续配置。

Activity Detail 固定使用三个业务入口，不再增加概览或二级导航：

| 入口 | 职责 |
| --- | --- |
| 活动预约记录 | ACTIVITY预约事实、状态、时间与只读详情 |
| 奖品设置 | 上段奖品、下段兑奖预约设置；数量、默认概率、场次配置、共享领取容量与兑换码管理 |
| 抽奖记录 | 每次Draw、Award、PRIZE预约与核销阶段的统一只读投影 |

详情复用成熟 Lead / Deal 的 `DetailWorkspace`、`record-tabs` 主工作表面、Semi Table 和 `SideSection` / `DataList` 信息栏。右侧集中展示活动信息、活动规则、预约设置和抽奖设置；顶部“活动管理”下拉统一承载创建奖品、编辑活动信息、编辑预约设置、管理场次和抽奖设置。布局、字号、间距、Tag、Card、Tabs、Modal与Drawer外观全部沿用当前 `DESIGN_SYSTEM.md` 和共享实现，本模块不另设视觉规则。

活动预约、参与身份、Draw、Award、PRIZE预约和Redemption底层事实仍保持独立；三入口只是当前信息架构的读侧组织方式，不合并数据模型。直接参与、未启用预约或未启用抽奖时仍保留三个入口并显示明确说明或空态，不制造业务记录。此前的 `overview / settings / participants / awards` 嵌套路由继续兼容并映射到最接近的三个入口，避免旧书签失效。

新记录由集中创建 / 复制动作记录可选 `createdBy`，编辑不能覆盖；旧创建人显示未记录。可选 `identity.gender` 是活动表单快照，不是 Sowind 字段，不从会员称谓推断，旧缺失值不回填。

抽奖读侧阶段契约继续保留：1未抽奖、2已抽奖、3已核销（无需预约）、4已预约、5已核销（需要预约）。3 / 5 中文相同但值 / 流程独立；未中奖仍为2，直接虚拟发放不冒充外部核销。“抽奖记录”表只展示真正存在 Draw 的2–5阶段；拥有次数但尚未抽奖的1阶段留在预约 / 参与详情，不制造 Draw Log。参与用户、预约、Draw、Award、PRIZE预约与Redemption分别进入上述业务入口，不合并或改写底层事实。详见 `MARKETING_RECORD_FIELDS.md`。

旧 `#marketing/prizes`、`#marketing/bookings` 显示活动列表和入口迁移说明，不保留全局模块。会员原营销 Tab 保持只读引用。用户流程预览UI已移除；旧 `#marketing/preview/<activityId>/<userId>` 只展示授权活动的后台详情。会员营销记录链接进入后台参与记录，不提供报名 / 抽奖预览。

`#redemption/<credential>` 是独立 Staff / 核销端，没有 CRM AppShell / 侧栏 / 后台导航，不管理活动配置。兼容原 `#marketing/redemption/<credential>`，同样渲染独立页面。现场报名只在此页面，选择授权品牌内已存在、未删除的 user；仅允许已发布、allowWalkIn 的活动，集中动作检查活动期、场次窗口 / 容量和既有身份 / 预约，不创建会员、不猜手机号 / UnionID / 姓名。已有有效参与身份与预约幂等复用，报名不发抽奖机会。Staff 能力不依赖用户预览权限。用户流程预览不再作为页面提供；既有ACT / WIN凭证与历史记录仍保留，不改Staff核验动作。CRM 核销数据页只读。

## 活动创建与配置校验

创建只依赖 `manage` + 至少一个可管理品牌，与该品牌是否已有会员无关。多个授权品牌可选；单品牌默认；无品牌提示“当前账号没有可管理的品牌。”。零会员仍可配置、导入代码、保存、发布以及由可选外部身份参加；不自动创建CRM会员。Staff选取已有品牌用户是兼容路径，不是所有活动参与者必须有会员的全局条件。

新建使用独立 `createMarketingActivity`：活动表单未填写的值保持空，场次、SessionPrize与奖品为空；不自动生成日期，不复用演示种子的相对时间，也不升级存储命名空间。创建与编辑通过同一字段白名单保存，已有其他配置不因过期表单快照被覆盖。

创建表单要求名称、有效授权品牌、合法活动开始 / 结束时间，以及线下活动场地；不要求预约、抽奖和奖品已配置。创建只是保存内部DRAFT，不等于开始。集中动作仍拒绝非法数量、概率和反向时间；开始与恢复动作都在写入 PUBLISHED 前校验实际需要的预约、抽奖、可发放数量、领取能力和虚拟内容，但业务页面不建立发布检查页、Checklist或步骤跳转。旧 `description` 保留兼容但不再展示、编辑或作为必填项。

列表生命周期只有待开始 / 进行中 / 已结束：未启用或尚未到活动开始时间是待开始；有效举行期内的PUBLISHED/PAUSED均是进行中；CANCELED或活动结束时间已到是已结束。暂停不生成第四状态；暂停后“开始”调用原恢复动作。开始不改写设定时间，未到开始时间或已结束时不可用；举行期内已正常运行时不可重复开始。结束二次确认后调用原CANCELED语义，取消未到场ACT预约，保留已有中奖权益、PRIZE预约及履约历史。未重写底层业务状态机。

## 数据模型与归属

沿用 Activity、Participation、Booking、Chance、Draw、Award、Audit 的集中动作逻辑，不平行创建第二套抽奖状态。

| 集合 | 字段 / 关联 |
| --- | --- |
| activities | 原品牌、管理状态、独立时间、预约 / 抽奖规则；可选activityCode、ruleContent及ruleContentFormat；旧 `pool` 名仅作持久化兼容，业务对象是独立 ActivityPrize |
| ActivityPrize | id + activityId；名称、奖品类型、领取方式、quantityMode、quantityLimit、defaultProbability、个人上限、有效期、instructions、pickupScheduleId、codes与虚拟内容；旧 slots 为兼容读取；旧quota / probability只读兼容 |
| SessionPrize | sessionId + prizeId；enabled、probability及限量奖品的allocatedQuantity；不持久化可由Award派生的已中奖 / 剩余 |
| participations | activityId、稳定内部participantId / participation.id、可选身份观察和渠道、兼容旧subjectKey / identities、ACT码、报名 / 签到 / 完成 |
| bookings | activityId + participationId；ACTIVITY 或 PRIZE（awardId / poolItemId）；场次、状态、历史时间、USER / WALK_IN / UNKNOWN 来源 |
| chances | 首次完成发放流水，不由预约替代完成 |
| draws | activityId、participationId、预约活动的sessionId、operationId、规则版本或轻量概率快照、随机值和结果（含 NONE） |
| awards | activityId、participationId、drawId、poolItemId、WIN 码；中奖时冻结奖品 / 履约 / 虚拟内容；wonAt、fulfilledAt / 本地 issuedAt |
| redemptions | 实际签到 / 完成 / 实体领取 / 体验核销事实及来源，与配置 Audit 独立 |
| audits | 开始、编辑、场次数量 / 概率调整、追加可发放数量、导入与拒绝的操作审计，不作为核销列表 |

没有全局奖品主数据集合，也没有业务 UI 可见的“奖池”。同名 A / B 奖品仍是不同 ID、可发放数量、兑换码；只有明确绑定同一 PickupSchedule 的奖品才共享领取容量。复制活动只复制配置结构并产生新活动 / 奖品 / 场次 ID，不复制参与、预约、机会、Draw、Award、Redemption、原审计或已分配兑换码；新副本单独记录复制操作。所有活动 / 预约 / 抽奖 / 领奖窗口及场次日期清空，运营重新填写，不继承过去完整日期；场次名称、地点、容量等结构保留。

## 活动规则、参与方式与 Flexible Participant Identity

`ruleContent?: string` 是活动展示规则，V3用简单富文本编辑并在活动详情展示。`ruleContentFormat?: "html"`显式标记富文本，缺省仍按旧纯文本安全展示；不会猜测旧文本中的标签是HTML或自动改写LocalStorage。只允许段落、加粗、斜体、有序 / 无序列表、换行与安全HTTP(S)链接，渲染时重建HTML白名单，不提供HTML源码 / 媒体 / CMS。旧description保留存储但不再展示或编辑。规则仍不解析成grantCount、drawLimit、winLimit、probability或预约约束。

`activityCode?: string`由保存动作自动分配，形式ACT+上海日期+至少四位流水，检查整个营销命名空间（不是品牌筛选后的列表），不可手工更改；复制模型生成新编号。旧缺编号活动只读生成可扫描的业务编号，内部UUID不直接展示；只有显式保存该活动时才固化编号，不批量回填或覆盖其他活动。唯一性是本地前端命名空间约束，不声称有跨设备真实后端全局编号服务。新基础 / 预约 / 抽奖表单各自只保存对应字段，并保留当前其他配置，避免用过期表单快照覆盖奖品或另一份配置。

活动参与方式`RESERVATION / DIRECT`沿用`bookingEnabled`作兼容映射（true / false），不是新增数据库字段。RESERVATION选ACT场次并预约，再签到 / 完成；DIRECT创建稳定Participation，无ACT Booking或ACT slot要求。预约和直接报名都不等于完成，不直接发放机会。

| 可选身份字段 | 语义 / 约束 |
| --- | --- |
| memberId | 已有品牌会员引用，可缺失；不是新建会员动作 |
| unionId | 外部微信观察，可缺失；不新增全局唯一 / 合并规则 |
| openId + wechatAppId | OpenID必须有应用上下文；同OpenID跨App不能自动合并 |
| phone + phoneCountryCode | 可缺失；当前品牌内只读核对候选，多个候选标待核验；唯一候选也不自动关联会员 |
| externalUserId / anonymousId / sessionId | 可选来源标识，不把昵称、姓名、设备或会话猜成自然人唯一身份 |
| displayName | 可缺失的展示名，不做唯一键 |
| participationChannel | WECHAT_MINIPROGRAM / WECHAT_H5 / WEB_H5 / QR_H5 / STAFF / OTHER，页面中文；旧缺失只读解释OTHER |

会员、UnionID、OpenID、手机号、姓名都不是全局必填。完整微信、只有OpenID+AppID、手机号H5、匿名H5、只有会员都可以参加；预约、机会、中奖、核销引用内部ID及凭证，不依赖缺失的外部字段。后续明确关联已有会员沿用原Participation和历史，不重新报名、不自动合并集团。身份清洗 / CRM匹配不是生产身份认证。普通列表只展示掩码手机号、渠道和关联状态，身份详情抽屉明确空值“—”，不渲染null / undefined，不在普通列表公开完整微信标识。

## 实体与虚拟奖品

`prizeType`、`fulfillmentMode?: DIRECT / RESERVATION`及原`method`分开表达奖品性质、是否需预约及内容 / 领取方法。缺少fulfillmentMode的旧记录依据原DIRECT / PICKUP / EXPERIENCE等兼容解释，不回写原记录。不能从“需要预约”猜类型，也不能从活动预约开关推导领奖方式。新增配置使用中文“直接领取 / 预约后领取”，内部DIRECT / PICKUP等旧枚举仅保留数据兼容。

| 活动参与方式 | 领奖方式 | 链路 |
| --- | --- | --- |
| 预约参加 | 预约领取 | ACT预约 → 完成 → 中奖 → PRIZE预约 → 核验领取 |
| 预约参加 | 直接领取 | ACT预约 → 完成 → 中奖 → 直接领取 / 内容发放 |
| 直接参加 | 预约领取 | Participation → 完成 → 中奖 → PRIZE预约 → 核验领取 |
| 直接参加 | 直接领取 | Participation → 完成 → 中奖 → 直接领取 / 内容发放 |

ACT与PRIZE Booking引用不同场次及业务目标，绝不复用完成 / 抽奖机会流水。预约领取保留容量与未预约赢家承诺保护。直接PHYSICAL无需PRIZE Booking，获奖后有WIN凭证，Staff CLAIM；虚拟兑换码 / 凭证 / 链接的直接内容发放不伪装现场CLAIM。虚拟类型不硬编码为DIRECT；配置兼容预约型权益，能力和内容发放时机需按独立领取规则判断。WIN核验凭证与虚拟兑换码内容不是同一标识。

| 类型 | 产品方式 | 内部值 / 能力 |
| --- | --- | --- |
| PHYSICAL | DIRECT_PICKUP | DIRECT：有效期内现场直接领取 |
| PHYSICAL | RESERVATION_PICKUP | PICKUP：获奖后预约领取 |
| PHYSICAL | EXPERIENCE | EXPERIENCE：获奖后预约体验、独立体验核销事实 |
| VIRTUAL | 兑换码 | REDEMPTION_CODE：文本 / 一列 CSV 导入，中奖原子分配 |
| VIRTUAL | 虚拟凭证 | VIRTUAL_VOUCHER：名称 / 描述快照，仅本地演示 |
| VIRTUAL | 领取链接 | LINK：HTTP / HTTPS 快照，未接外部发放 |
| UNKNOWN | 待补充奖品类型 | 保留旧权益；不可新增中奖 / 发布或错误地实体核销 |

DIRECT / PICKUP 旧枚举是有意兼容，不是恢复全局奖品库。

代码只在本地读取，CSV 可带 code / 兑换码表头；多列歧义 / CSV结构错误仍整批拒绝。正确结构采用逐行部分导入：去首尾空格、忽略空行，剔除批次 / 已有兑换码 / 跨活动奖品重复，以及长度不在1–128、空白 / 控制字符或明显非法字符的码。明确展示成功 / 重复 / 非法 / 忽略数量及逐行失败原因，不把部分失败报成全部成功。旧严格解析函数保留兼容调用，管理页面使用部分导入接口。限量奖品发布时有效代码总数不得少于可发放数量；正概率还需要未分配有效码。一次状态提交同步保存 draw、award、扣次、可发放数量占用、assignedAwardId / assignedAt 和内容快照。重复 operationId、点击、刷新返回原内容，不重分配代码。

“查看兑换码”使用活动奖品内的管理抽屉，展示中文“未分配 / 已分配”、分配时间、关联参与用户。未分配即 AVAILABLE，已分配即 ASSIGNED（内部由 assignedAwardId 表示，不改存储契约）。草稿可单删 / 清空未分配码并重导；已分配码永久不能删除、清空、解分配或重分配，通用活动 / 奖品保存也不能绕过该保护。发布后（含暂停 / 取消）可追加；限量奖品删除后有效未分配码必须覆盖当前剩余可发放数量，否则阻止删除。不限量兑换码奖品的实际可发放能力始终受未分配有效兑换码数量限制。导入 / 删除 Audit 仅存数量，不存完整码；奖品复制后的代码库为空。

普通列表只显示可用数量 / 内容状态，不暴露完整兑换码。用户自己的结果及获授权只读权益详情可查看完整已分配代码。issuedAt仅指本地内容发放，不是外部已发券 / 已兑换 / 已查看；不伪造viewedAt。直接虚拟内容在DRAW后发放，不需要CLAIM或PRIZE预约。预约型虚拟内容在DRAW时占用可发放数量、分配兑换码并冻结virtualContent，但不设置issuedAt；有效PRIZE预约和正确Staff核验后才设置issuedAt / fulfilledAt。WIN凭证始终不是兑换码内容本身。

## Activity Prize Quantity

ActivityPrize 使用以下业务字段：

```text
奖品名称 / 奖品类型 / 领取方式 / 数量模式 / 可发放数量 / 概率
```

`quantityMode` 为 `LIMITED / UNLIMITED`。限量奖品的 `quantityLimit` 表示整个 Activity 最多可以产生多少份该奖品 Award；业务 UI 固定称“可发放数量”，不称总库存、仓库库存或奖池。不限量奖品不受活动数量上限控制，但唯一兑换码型虚拟奖品仍受当前未分配有效兑换码数量限制。旧 `quota` / `probability` 只作兼容读取，不批量回写用户已有 LocalStorage。

限量奖品的聚合口径如下：

| 页面口径 | 计算方式 |
| --- | --- |
| 可发放数量 | `quantityLimit` |
| 已中奖数量 | 当前 Activity 下该 Prize 的 Award 数量 |
| 当前剩余 | `quantityLimit - 已中奖数量` |
| 场次有效占用 | 所有仍可产生未来 Draw 场次的 `max(allocatedQuantity - sessionWonCount, 0)` 之和 |
| 活动可分配 | `当前剩余 - 场次有效占用` |

中奖即占用可发放数量，领取、过期或取消领奖不二次扣减，也不自动返还。历史 `allocatedQuantity` 保留原值用于解释过去配置；它不是当前仍占用的数量。预约活动的奖品设置展示“限量 / 已中奖 / 可分配”，直接参与活动展示“限量 / 已中奖 / 剩余”，不得混用两个口径。

## Session Prize Allocation

仅当活动为预约参与且启用抽奖时，每个 ACTIVITY 场次使用显式 SessionPrize 配置：

```ts
SessionPrize {
  sessionId
  prizeId
  enabled
  probability
  allocatedQuantity
}
```

不限量奖品可以不设置 `allocatedQuantity`。限量奖品的 `sessionWonCount` 由该 `sessionId + prizeId` 的 Award 数量派生，`sessionRemaining = allocatedQuantity - sessionWonCount`；两者能够可靠计算时不得重复持久化。

限量奖品的当前有效占用始终满足：

```text
totalAwardCount + sum(activeSession.effectiveReserved) <= ActivityPrize.quantityLimit
```

仍可产生未来 Draw 的场次使用 `effectiveReserved = max(allocatedQuantity - sessionWonCount, 0)`；场次或 Activity 已结束后 `effectiveReserved = 0`。结束场次继续显示“历史分配 / 已中奖 / 未使用 · 已释放”，不把历史 `allocatedQuantity` 改写为已中奖数量。本场分配不能低于本场已中奖，增加不能超过活动可分配数量。低于已中奖时提示“当前场次已有15份中奖记录，本场可发放数量不能低于15份。”；超过当前可用数量时提示“当前奖品仅剩8份活动可分配数量。”。减少只释放尚未中奖的数量回活动可分配，不删除 Award。关闭尚未中奖的奖品时将概率和本场分配归零；已有中奖时将概率归零、分配收敛到 `sessionWonCount`、本场剩余归零，历史 Award 保持不变。

新场次默认继承活动奖池，不预占库存；实际抽奖只能使用活动未分配数量。开启“单独配置本场奖池”后才保存SessionPrize，初始数量下限是本场已中奖数量，不隐式预占剩余库存。可显式“复制其他场次配置”，只复制启用状态、概率和分配数量，不复制Draw、Award等结果，且仍校验活动可分配数量。

“活动预约设置 → 管理活动场次”中的主表只展示日期、时间、场地、预约人数 / 容量、奖品配置摘要、状态和操作。摘要使用“3个奖品 · 剩余62份”“3个奖品 · 未使用25份已释放”或“未配置”，不永久铺开概率矩阵。管理奖品进入中等 Contextual Drawer，逐行显示参与、中奖概率、复合的本场数量、活动可分配和操作；本场数量在一个单元格内组合“分配 / 已中 / 剩余”，核心字段不依赖横向滚动。

## Session Probability

每个启用的 SessionPrize 配置本场中奖概率。启用奖品概率合计不得超过100%；超过时拒绝保存并提示“当前中奖概率合计为110%，请调整至100%以内。”。合计小于100%合法，未中奖概率由 `100% - 启用奖品概率合计` 自动计算，不作为用户输入字段。

ActivityPrize的`defaultProbability`用于直接参与活动以及没有SessionPrize行的场次，UI标为“活动默认概率”。有任意SessionPrize行时，整场以显式奖池为准，未加入或停用奖品不回退；全部停用不会触发继承。修改活动默认概率只影响未来使用默认池的抽奖，不覆盖显式场次或历史快照。概率保存推进配置版本。

继承场次共享 `quantityLimit - 活动已中奖 - 其他有效场次保留数量`，不能消耗已分配给其他场次的数量；不限量奖品仍受兑换码、兑奖容量、每人限额等约束。首次从继承切换为独立配置可设置分配，但不得低于本场已中奖或超出活动可分配；此后运行中数量仍须使用“调整数量”。不允许清空显式奖池来隐式恢复继承。

当场次奖品剩余为0、兑换码不可用或领取能力不足时，该奖品运行时有效概率为0，原概率区间转为未中奖，不自动分给其他奖品。无任何有效可中奖奖品时停止抽奖且不扣次数。预约活动的 Draw 必须保存 `sessionId`，并保存轻量 `drawConfigVersion` 或概率快照，保证历史能够解释当时使用的规则。

预约参与按 `Participation → 当前有效ACTIVITY Booking → ActivitySession → 显式SessionPrize或活动默认池` 选择规则；改约只影响未来Draw，历史Draw不变。现场报名必须归属场次。直接参与活动没有Session，使用活动默认概率和活动级数量，不虚构场次。

## Live Quantity Adjustment

场次尚未开始且没有历史 Draw 时，可以直接编辑 enabled、probability和allocatedQuantity。场次已开始或已有 Draw 后，数量通过“调整数量”表达增加 / 减少的 delta；使用小 Modal / Popover，同时展示当前分配、已中奖、当前剩余、活动可分配和调整后结果。

- 增加数量占用活动可分配数量，不能超过当前可分配上限；
- 减少数量释放未中奖部分回到活动可分配，调整后分配不能低于 `sessionWonCount`；
- 进行中场次可调整未来 Draw 的数量和概率；
- 已结束场次和已结束 Activity 的场次配置只读；
- Activity 暂停时可调整未来配置，但不能产生新 Draw。

数量和概率调整必须写入现有 Marketing Audit，记录 Activity、Session、Prize、增加 / 减少、Delta、Before、After、Operator和Time；概率同时记录前后值。任何调整、禁用、暂停或结束都不能修改或删除历史 Draw、Award、已分配兑换码和Redemption。

预约参与且启用抽奖的活动开始前，每个仍有效的活动场次都必须完成合法 SessionPrize 配置：至少一个启用、正概率且真实可发放的奖品，概率合计不超过100%，限量奖品本场数量大于已中奖数量。未完成时阻止开始并列出场次，详情页可直接进入“活动预约设置 → 管理活动场次”处理，不增加发布检查页面。

“从其他场次复制”是场次奖品抽屉顶部的次级动作，选择来源场次后只复制参与状态、中奖概率和本场分配；Draw、Award、已中奖和历史剩余不复制。复制仍按当前有效占用校验活动可分配数量。

## 共享兑奖预约设置（PickupSchedule）

PickupSchedule 属于 Activity，字段为 id、activityId、name、location、startAt、endAt、slots。Slot 复用现有 MarketingSlot：id、起止时间、地点、capacity、bookingClosesAt、checkinStart / checkinEnd、disabled / deleted。它不是跨活动资源中心。ActivityPrize.pickupScheduleId 是显式关联；原 Booking 的 kind=PRIZE 不变，新增可选 scheduleId。ACTIVITY 场次容量完全独立。

每个时段的已预约 = 当前 Activity / Schedule / Slot 下所有 status != CANCELED 的 PRIZE Booking（包括已领取及已记录未到场）；剩余 = max(capacity - 已预约, 0)。不按奖品各算一遍，不把 Award 当 Booking。皮牌5人 + 礼盒3人共享10人时段，已预约8、剩余2；再预约2人后已满，下一人拒绝。取消一条释放1个名额，但 Award、中奖占用与已分配兑换码不释放。

`BOOK_PRIZE` 检查有效未领取 Award、预约领取方式、安排归属、时段窗口 / 停止状态 / 容量，以及每个 Award 唯一非取消预约。`RESCHEDULE` 先检查新时段全部约束，再在同一个候选 state 中取消旧行、添加新行；校验或保存失败不改变原预约。原预约取消历史仍可查看。暂停活动不允许新领奖预约和改约，但已有预约仍按窗口核销。

- `ADJUST_PICKUP_CAPACITY` 必须是非负安全整数且不低于非取消预约人数；Audit 记录调整前后容量。
- `SET_PICKUP_SLOT_OPEN` 仅停止 / 恢复新预约，不能使历史预约失效；已结束时段不能恢复。
- 有任何预约历史（包括取消）不能删除时段或更改时间 / 地点，已有奖品预约不能切换 Schedule；核销仍引用原时段。
- 预约型奖品必须 LIMITED；已中奖奖品锁定类型、领取规则、有效期及虚拟内容，默认概率只影响未来规则；已有发布 / 中奖的数量变更使用显式操作。

新建兑奖预约先保存名称、地点、有效日期；在安排 SideSheet 中批量生成时段。输入日期范围、每日开始 / 结束、时段分钟数及容量，先预览天数 / 新时段 / 跳过数量，再确认提交。Action 重新生成和校验：完全相同起止跳过，同一安排任何其他重叠拒绝；范围须可完整划分、位于安排有效日期内。单次最多366天 / 10000时段是前端性能边界，不是后端业务约束。生成后支持单时段编辑、调整容量、停止预约和查看该时段预约名单。

旧奖品私有 slots 以稳定的 `pickup-legacy:<prizeId>` 在读侧映射为独立安排；不依据同名、同地点或同时间自动合并。单纯加载不写回，首次显式编辑该安排时才将原配置保存到 activity.pickupSchedules 并关联对应 Prize。旧 Booking 未填写 scheduleId 时沿其原 Prize 查询此稳定映射；不重写历史 Draw / Award / Booking。缺失关系明确待核对，不自动补建预约。

## 领取能力与历史承诺

开始活动前，每个正概率奖品必须至少有一个真实可发单位，不能由别的奖品掩盖空奖品：实体直接领取要有剩余可发放数量与合法领取窗口；预约领取还要有有效履约能力；兑换码要有未分配有效码；Voucher要有名称、使用说明和有效期；Link要有合法HTTP(S)地址及有效期。0数量 + 0概率可以保存为暂不抽取配置。预约 ≠ 签到 ≠ 完成 ≠ 获奖；首次完成仅发一次grantCount，累计 / 每日次数、累计中奖和单奖个人上限继续独立。

预约领取奖品必须限量并绑定本 Activity 的 PickupSchedule。兑奖预约设置容量不足以覆盖全部奖品数量是高优先级 Warning，不阻止保存奖品或追加可发放数量。开始 / 恢复与未来 Draw 前，必须有有效且可预约的兑奖时段，不能依靠已经结束、停止或满额的时段。运行时可发放能力扣除共享安排的已预约人数及未预约赢家承诺，不向未来中奖重复承诺名额。

ActivityPrize 的类型、领取方式、有效期和虚拟发放内容等实质规则，在已有业务记录后继续受历史保护；直接参与活动的默认概率也不覆盖已发生 Draw。SessionPrize 的未来概率和分配按本节明确规则允许调整，并由Draw快照和Audit保留可解释性。奖品名称、奖项、图片、说明和使用说明只影响未来中奖，旧Award始终保留中奖时快照。

实体直接领取：待领取 → 已领取。预约型权益：待预约 → 已预约 / 待领取 → 已领取；体验完成标“已履约（体验完成）”，过期权益保留占用与历史。直接虚拟码标“兑换码已分配”、凭证标“权益已生成”、链接标“领取链接已生成”，均指平台本地发放，不伪造外部兑换 / 已使用 / 已查看。活动后台、中奖表、Staff识别和会员只读记录复用同一履约判定。

## 预约、时间、暂停与取消

每主体最多一个有效 ACTIVITY 预约；有任意预约历史（含取消）的场次不可删除，容量不得小于有效占用，有预约仅可安全改名称 / 容量，不覆盖地点和时间。allowCancel / allowReschedule / allowWalkIn 是服务规则，不只是按钮。已签到不能用户取消；改约先检查目标容量 / 范围 / 窗口，失败保留原预约。工作人员 walk-in 即使关闭预约仍检查 redeem 权限和 allowWalkIn。未知旧来源明确显示，不猜成 USER / WALK_IN。

PRIZE预约引用具体获奖权益与该活动奖品slots，不重报名、不发机会、不扣次。DIRECT无预约；RESERVATION按独立履约配置预约，不能因奖品是虚拟类型省略。

管理状态 DRAFT / PUBLISHED / PAUSED / CANCELED 与预约期 / 活动期 / 抽奖期 / 各奖品有效期分开；活动结束 ≠ 领奖结束。V2 暂停停止新参加、新抽奖和所有新预约（含 PRIZE 预约 / 改约），但已有有效领奖预约可履约、已有到场记录可签到 / 完成。取消停止参与并取消未签到的活动预约，保留历史、获奖权益及奖品预约；自然结束 / 取消后既有权益仍按自身窗口和容量预约 / 履约。过期拒绝，不回收。该明确策略取代 V1 的暂停领奖预约待确认项。

删除与取消不混用：仅DRAFT且从未发布、Participation / Booking / Chance / Draw / Award / Redemption均无业务记录、无已分配兑换码时，经二次确认可删除草稿及其内嵌奖品、未分配码、未使用场次。配置 / 导入 / 复制操作Audit不属于参与业务，不阻止真正未使用草稿删除，审计仍保留。任何业务集合有记录（包括异常旧数据只剩孤立记录），即使技术状态变回草稿也不允许硬删除。取消始终保留历史权益与核销事实。

## 核销事实、统计与权限

独立核销端识别 ACT / WIN 后明确选择 CHECKIN / COMPLETE / CLAIM、位置及必要场次，不把活动凭证当领奖码、领奖当完成。Redemption 保存 CHECKIN / COMPLETE / PRIZE_CLAIM / EXPERIENCE_CLAIM、activityId、participationId、适用 awardId、targetId、occurredAt、actorId、result、credential、detail、source。有效业务对象的拒绝也留事实；无权限 / 不明码不伪造对象。重复成功核销不二领、不重复事实；签到即完成一次产生两种事实，不是两次到场。

八指标：当前有效活动预约人数、到场人数、完成人数、抽奖人数、抽奖次数、中奖人数、中奖份数、已履约份数（实体领取 / 虚拟平台侧发放，非外部兑换）。列表对应有效预约、已签到、已完成、中奖人数，去掉模糊“参与人数”。人数按本活动 participation 去重，次数按 draw（含 NONE），份数按 award；当前预约排除取消、爽约和失效。未到场的BOOKED超过checkinEnd派生NO_SHOW；缺失 / 删除 / 非法窗口的未领取预约派生INVALID；仅ACTIVITY预约会因场次禁用而失效，停止PRIZE新预约不使既有预约失效（不增加存储状态枚举），保留历史并提示场次待核对，不伪造签到。签到 / 完成仍依据真实 checkedInAt / completedAt 事实，不因后续场次变动抹掉历史。点击消费相同活动 / 品牌 / 授权与固定查看时间的原始 ID 数组；明细冻结打开时间，数据 / 角色 / 活动 / Tab 变化关闭。营销参与不加进集团总人数，不改 Dashboard 口径。

能力映射：`marketing.activity.view → view`（活动 / 指标 / 全部业务数据，只读）；`marketing.activity.manage → manage`（创建 / 编辑 / 开始 / 暂停 / 奖品 / 场次 / 代码配置）；`marketing.redemption.execute → redeem`（现场报名 / 签到 / 完成 / 实体领取 / 体验核销）。旧 `preview` 只保留兼容授权，不恢复用户流程预览 UI。redeem 不蕴含 manage，manage 不蕴含 redeem；view-only 不写任何业务 / 配置 / Audit。命令分组在动作最前检查能力，页面按钮与列表 / 详情 / 兼容路由 / Staff URL也检查能力和品牌，不能由直达URL绕过。旧权限夹具未提供view时保留兼容解释；真实角色映射显式提供所有能力。

现有 HQ_ADMIN 保持既有 GP / UN 范围，映射 view / manage / redeem / preview；分销商无会员 / 营销品牌权限。未改全局RBAC，未新增品牌管理员 / Event Staff / view-only 演示账号；互相独立的能力组合以动作规则夹具验证，现有HQ与分销商以真实页面验证。未来单独Staff角色只需映射能力，不需要重构业务逻辑。

## 存储与 V1 非破坏兼容

仍用 `kivisense-marketing-prototype-v1`，内部 schema2；仅缺键初始化，刷新不移动时间、不重播种、不覆盖修改。升级先将完整原始字符串备份到 `kivisense-marketing-prototype-v1:backup-v1`，再写 V2。

Refinement V2至V6不改存储键 / schema2、不清空LocalStorage、不回填日期、代码或会员。旧活动缺ruleContent、ruleContentFormat或activityCode，旧Participation缺新身份 / 渠道字段、旧奖品缺fulfillmentMode / quantityMode / quantityLimit / defaultProbability都以只读适配解释，已有用户修改不被演示种子覆盖。旧数据没有SessionPrize、Draw.sessionId或概率快照时明确显示未配置 / 待核对，不把今天的配置伪装为历史规则。缺省场次标记解释为未禁用 / 未删除；历史正概率空数量与不足履约配置不强行重写。新建与demo工厂分离仍保留。

旧全局定义复制为各活动自己的 ActivityPrize，保留 pool / award / participation / booking / chance / draw ID、履约承诺，prizeId 留 legacyPrizeId 可追溯。DIRECT / PICKUP / EXPERIENCE → PHYSICAL，不能判断 → UNKNOWN。历史缺图片 / 说明不拿今天可变定义伪造快照。仅从有对象 / 演员 / 动作且成功时间匹配的旧 CHECKIN / COMPLETE / CLAIM Audit 转可信核销，标 LEGACY_AUDIT；孤立时间不造事实，配置 Audit 不混入。虚构演示事实标 DEMO_SEED。

升级前原文已被另一页改、备份不可写或存在不同 V1 备份时阻断，不覆盖原文 / 备份。未知版本、损坏或代码分配冲突保留原始存储。动作保存失败不提交扣次、奖品数量变化或孤立结果。跨页事件更新或阻断，不把键移除视为允许重建；不声称跨页 / 设备事务安全。

明确营销重置只替换主营销键，不清备份 / 销售 / 会员；销售 / 会员重置不清营销。升级失败后明确重置仍可正常操作，保留旧备份。测试只用隔离虚构数据，不修改用户浏览器。

四种种子：线下预约 + STAFF 完成抽奖；线下免预约抽奖；预约签到无抽奖；结束但仍可领奖。含实体三方式、虚拟代码、满场、NONE、已领及过期。只引用当前有效品牌 user，缺身份显示原因，不自动创建会员。

## 原型限制与接入点

未实现真实微信 / 摄像头 / 小程序 / 消息 / HQ、外部发券 / 兑换 / viewed、生产随机、防作弊、多设备锁、库存事务、统一开奖、全局仓库、物流、候补、积分、支付或 ROI。没有新增生产角色 / 地点范围，也没有全局 Audit 模块；现有活动 Audit 单独保留。

本地同步提交与幂等不是生产事务或服务器安全。真实接入需后端权威身份 / 品牌权限、事务库存 / 预约 / 代码、可信随机、不可变历史与恢复策略；本轮不搭建。Safari / Firefox / 真机 / 扫描硬件及多用户压力未验；单品牌 / 只读授权以规则夹具验证，不假称已有页面账号。V2.1的27项修正与V2历史31项场景的实际层级见 `MARKETING_ACTIVITY_ACCEPTANCE.md`。

## 本轮实现与人工 Review（2026-09-20）

保留三入口及右侧信息栏。奖品区增加创建入口，兑奖预约设置区可查看共享安排；活动预约设置 → 管理活动场次 → 管理奖品配置单场概率 / 数量。场次和兑奖预约设置使用约820px上下文抽屉；复制、数量 / 容量调整和批量生成使用Modal。More菜单先关闭再打开操作面板，子操作打开时隐藏上一层抽屉；返回保留上下文。

删除 `marketing-record-illustrations.ts` 的页面动态数据拼接。首次 Seed 的预约工坊包含多场次、30条虚构预约和30条真实持久化Draw样本（另保留原有满额场预约），以及真实Award、Chance、PRIZE Booking、Redemption关联。共享时段示例已预约5+3人，另有后续时段；含不限量兑换码奖品和已结束场次释放示例。另建无Participation / Booking / Draw的空活动。每个数据源都属于DEMO_SEED；现有LocalStorage不合并种子、不清空、不补时间。

废弃五步向导展示文件及其专属旧测试文件删除；validateActivity、publishChecks、sessionPrizeReadiness与业务保护保留。

本轮仅使用TypeScript静态诊断与代码审阅。按需求未执行自动化测试、浏览器QA、截图、视觉Diff或Acceptance Gate，未新增 / 重写测试。旧测试断言尚未按本轮新合同重新验收；业务场景与视觉效果等待人工Review。未部署、未发布、未修改main。LocalStorage仍是纯前端原型，跨窗口同时操作不等于生产数据库事务保证。
