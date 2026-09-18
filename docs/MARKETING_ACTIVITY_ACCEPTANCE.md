# 营销活动验收记录

## 活动详情重复入口、直接示意与字号修正 — 2026-09-18

基线02e28d6，移除三个页签下重复同名标题、参与用户 / 独立核销记录入口和对应详情抽屉；抽奖表保留核销状态与时间，仅预约型奖品行有“查看 / 预约记录”，后者打开该用户该奖品的只读Modal。创建 / 编辑SideSheet、真实核销事实和Staff执行不变。管理场次前20px；活动页签与右侧卡片标题16px、侧栏标签 / 内容14px，其他模块字体与全局Token不变。

两表各直接展示30条虚构示意，新旧浏览器都不需额外操作；原记录保留，实际Store / LocalStorage / 库存 / 统计不变。详见MARKETING_RECORD_FIELDS.md。上轮“加入示意数据”的方式已被本轮直接只读展示替代；历史下方结论不代表本轮。

遵守用户免完整回归要求：不运行本地test或既有端到端回归；只执行类型/lint、构建和当前活动定点页面检查。实际已看到两表搜索示意用户后分页均30条；预约型用户23弹窗仅1条本用户本奖品PRIZE预约；无重复h2 / 多余入口，页面无document横向溢出。测量字段间距15px、模块20px、按钮15px、管理场次前20px。字号与最终构建/发布以本轮最终交付记录为准；GitHub既有CI自动执行，不另行发起QA任务。已有组件断言仅适配批准的SideSheet→只读Modal及标题变更，范围和数量断言保留。

追加实际字号检查：同一页面DOM计算字号为页签16px、右侧卡片标题16px、侧栏标签14px、侧栏值14px，已查看真实页面截图。TypeScript / lint通过；没有执行完整浏览器回归，定点检查不替代所有页面/尺寸的QA。

## 活动记录示意数据 — 2026-09-18

在a6f50ac已完成的三页签工作区上增量加入25位虚构用户、25条活动预约及对应25行抽奖示意，覆盖预约三种状态、抽奖1–5两条路径和未中奖。具体数量与数据隔离策略见MARKETING_RECORD_FIELDS.md。新浏览器默认演示活动可见；已有数据使用HQ列表“加入示意数据”创建独立活动，重复点击仅打开原活动，不覆盖或清空已有记录。

按用户最新要求，本次数据增量不重跑回归、单元测试或Browser QA。仅执行TypeScript / lint及构建；V5的442项PASS属于新增示意数据之前的版本，不作为本次数据增量的回归结论。GitHub原有自动CI由普通推送触发，不另行发起QA任务。静态检查、构建、推送与发布结果以最终交付记录为准。

## 活动记录工作区 V5 — 2026-09-18

基线73ef802，当前codex/kivisense-product-prototype增量实现。三个固定页签、无概览、右侧核心活动信息 / 同表单编辑、活动预约字段和只读阶段1/2/3/4/5已完成。3与5中文同为已核销，筛选与详情仍区分业务值；直接虚拟发放不等同外部核销。PRIZE历史按活动 / 参与者 / 中奖权益隔离，保留取消 / 重约，ACTIVITY表不混入领奖预约。缺性别 / 创建人显示未记录，新字段为可选前端元数据，不回填旧对象或SQL。

实际验证：现有类型 / lint通过；20文件442测试通过，其中新增27项记录模型测试、4项真实Semi组件JSDOM测试。覆盖两条核销路径、活动 / 奖品预约独立、NONE、多次记录来源、取消 / 重约、失效 / 爽约 / 过期、未知关联、只读数据不变、旧数据刷新读取、三个页签、右侧编辑表单、身份掩码和预约历史入口。原411项测试全部保留。构建与线上部署资产验证另按最终交付结果报告。

未执行完整Browser QA或旧端到端套件；JSDOM验证不是浏览器视觉验收。历史下方结论不能代替本轮。原Sales / Member模型、Store、SQL、Dashboard、库存 / 额度 / 核验状态机未重构，数据未清空；无main修改。字段与状态口径见MARKETING_RECORD_FIELDS.md。

## Marketing Refinement V2 — 本轮验收

基线：`2fd58a2a0558b10877d1249b46ee22300ad5ec4b`，分支`codex/kivisense-product-prototype`。本轮仅普通推送当前分支；不修改main、不部署。下面的历史Final Acceptance结论不能代替本轮验收。

当前状态：**PASSED（已执行的纯前端原型范围）**，2026-09-18。最终冻结构建后，本轮41项、附加虚拟预约履约 / 旧匿名兼容、原六套79组、TypeScript / lint / 407项test / build均通过。未发现未处理P0 / P1；不代表真实微信、服务端身份、库存事务或生产并发通过。原Final库存占用、不可逆代码分配、快照、权限、容量承诺和安全存储门禁未削减。完成后仅交付UI / IA review，不合并main、不部署。

### 实际改动

| 范围 | 本轮变化 |
| --- | --- |
| types/marketing.ts、marketing-model.ts、marketing-storage.ts、marketing-store.tsx | 可选ruleContent、独立fulfillmentMode、内部参与标识 / 可选身份 / 渠道；只读旧字段解释、后关联会员不造新记录；虚拟预约型分配 / 发放分离；保留集中权限 / 容量 / 库存 / 幂等；修复UNKNOWN / 缺虚拟内容误计履约 |
| MarketingAdmin.tsx | 全宽详情、四一级 / 二级导航、轻量时间查看、More操作；旧leaf路由兼容；没有后台职责卡片 / 时间侧栏 |
| MarketingEditor.tsx、MarketingCodes.tsx | 五步竖向编辑、活动内容 / 设置分组、规则文案独立、参与方式 / 奖品领取方式独立；ACT / Prize modal和表格、操作型发布检查、真实去完善跳转 / 正确footer；代码管理中文交互 |
| MarketingData.tsx | 参与列表渠道 / 身份掩码 / 状态，详情空值；中奖快照 / 履约状态；预约型未issued虚拟内容不提前显示 |
| MarketingPages.tsx | 四个可选身份演示、已有会员兼容、六渠道选择、p:id精确回访；旧匿名缺participantId复用row.id；独立Staff仍单独核验 |
| MarketingUi.tsx、styles/marketing.css、mock/marketing-demo-data.ts | 两列字段 / 规则全宽、紧凑指标与布局、竖向编辑 / 内部滚动、时间Popover及简洁空态；新种子仅增加规则内容，不覆盖已存数据 |
| 新marketing-refinement.test.ts、marketing-editor-readiness.test.ts | 新增53+14=67项；原marketing129项保留，当前marketing196项全部通过 |
| qa/marketing-refinement-browser-qa.mjs、原三个marketing QA、package.json | 新41项+附加真实链路 / 明确fixture；原QA只适配导航与新表单 / 业务文本并保留原断言；新增执行入口，不增加依赖 |
| 本文、MARKETING_ACTIVITY_MODULE.md、PROTOTYPE_ARCHITECTURE.md营销section | 字段 / 规则 / 层级 / 验收映射、真实证据及限制；历史记录保留 |

销售 / 会员模型、两个Store、数据、权限范围、关联和Dashboard查询未改；没有SQL / backend / database、金额或Opportunity改动。普通新建UI奖品显式存DIRECT，旧工厂 / 历史method仍只读推导，不大范围回填旧对象。

本轮真实浏览器套件：`qa/marketing-refinement-browser-qa.mjs`（只允许localhost / 127.0.0.1预览，默认4174；独立Chrome Context，虚构数据）。A–D活动创建、配置、发布、参加、完成、抽奖、奖品预约及核验均通过UI操作，并读取最终持久状态。旧字段缺失使用单独标注的隔离fixture，只证明兼容读取，不冒充UI创建链路。奖品概率通过页面配置100%；不覆写Math.random或生产随机逻辑。

### 41项验收矩阵

R=新增真实UI套件；U=本轮规则 / readiness测试；F=重跑原Final及既有套件。最终状态以实际results.json为准，未运行项不得标PASS。

| # | 合同 / 预期 | 验证层级 / 持久断言 | 当前状态 |
| --- | --- | --- | --- |
| 1 | 新建规则独立保存 | R草稿保存ruleContent | PASS（所列层级） |
| 2 | 修改规则并保存 | R重新打开Editor修改后的字段 | PASS（所列层级） |
| 3 | 详情显示规则 | R基本信息与description分开显示 | PASS（所列层级） |
| 4 | 用户预览显示规则 | R四链路预览中的原规则文字 | PASS（所列层级） |
| 5 | 副本保留规则 | R真实复制；日期 / 业务记录仍清空 | PASS（所列层级） |
| 6 | 旧记录无规则兼容 | R明确旧V2fixture读取 / 刷新原文字节不变 | PASS（所列层级） |
| 7 | 文案不解析抽奖限制 | R写“999次”且drawLimit仍1；U | PASS（所列层级） |
| 8 | 预约方式创建ACT预约 | R真实预约，Booking.kind=ACTIVITY | PASS（所列层级） |
| 9 | 直接参加不依赖Booking | R报名成功而ACT Booking=0 | PASS（所列层级） |
| 10 | 直接参加稳定内部身份 | RparticipantId存在，刷新报名幂等 | PASS（所列层级） |
| 11 | 直接方式不要求ACT场次 | R隐藏窗口 / 场次 / 取消字段，正常发布 | PASS（所列层级） |
| 12 | 预约发布要求有效ACT场次 | R检查阻断与真实步骤跳转；U | PASS（所列层级） |
| 13 | 直接领奖无PRIZE预约 | R实际中奖、PRIZE Booking=0 | PASS（所列层级） |
| 14 | 直接领奖生成WIN凭证 | R WIN与ACT独立，Staff按WIN核验 | PASS（所列层级） |
| 15 | 预约履约先预约后核验 | R先拒绝未预约CLAIM，再预约并成功 | PASS（所列层级） |
| 16 | PRIZE与ACT场次分开 | R poolItemId / awardId / slotId精确归属 | PASS（所列层级） |
| 17 | 活动与奖品方式独立 | R四组合持久字段；U | PASS（所列层级） |
| 18 | 预约参与+预约履约 | R A全UI链路+最终履约事实 | PASS（所列层级） |
| 19 | 预约参与+直接履约 | R B全UI链路+最终履约事实 | PASS（所列层级） |
| 20 | 直接参与+预约履约 | R C全UI链路+最终履约事实 | PASS（所列层级） |
| 21 | 直接参与+直接履约 | R D全UI链路+最终履约事实 | PASS（所列层级） |
| 22 | 无memberId可参加 | R匿名 / OpenID场景真实参加；U | PASS（所列层级） |
| 23 | 无UnionID可参加 | R OpenID / 手机 / 匿名；U | PASS（所列层级） |
| 24 | 无OpenID可参加 | R手机 / 匿名；U | PASS（所列层级） |
| 25 | 无手机号可参加 | R OpenID / 匿名；U | PASS（所列层级） |
| 26 | OpenID+AppID单独身份 | R缺Union / 手机 / 会员仍实际参加 | PASS（所列层级） |
| 27 | 手机号H5参与 | R手机号+国家码、不依赖微信字段 | PASS（所列层级） |
| 28 | 匿名H5参与 | R匿名直接活动真实参加 | PASS（所列层级） |
| 29 | 匿名可预约 | R A匿名ACT预约 | PASS（所列层级） |
| 30 | 匿名完成可获机会 | R Staff完成，Chance恰好1条 | PASS（所列层级） |
| 31 | 匿名可以中奖 | R匿名即时抽奖与Award内部关联 | PASS（所列层级） |
| 32 | Award不依赖手机号 | R匿名Award成功，原身份phone缺失 | PASS（所列层级） |
| 33 | Redemption不依赖微信 | R匿名 / 手机场景Staff实际成功 | PASS（所列层级） |
| 34 | OpenID有App上下文 | R持久wechatAppId；U缺App拒绝 / 跨App不合并 | PASS（所列层级） |
| 35 | 弱身份不误合并 | R匿名与微信独立、刷新同内部主体幂等；U同OpenID跨App / 同姓名 / 手机候选歧义 / 后关联会员 | PASS（所列层级） |
| 36 | Basic错误返回基本步骤 | R basic行“去完善”显示活动名称表单 | PASS（所列层级） |
| 37 | ACT错误返回参与步骤 | R booking行“去完善”显示预约字段 | PASS（所列层级） |
| 38 | Draw错误返回抽奖步骤 | R lottery行跳回累计上限表单 | PASS（所列层级） |
| 39 | Prize错误返回奖品步骤 | R履约容量不足行跳回真实奖品设置 | PASS（所列层级） |
| 40 | “去完善”真实跳转 | R 36–39逐个检查非空跳转 / 非逐次Toast | PASS（所列层级） |
| 41 | 全部检查完成可发布 | R无待完善CTA发布，持久status=PUBLISHED | PASS（所列层级） |

### 页面、尺寸及原逻辑回归

- 桌面1440×900、1280×800、1024×768：四一级 / 对应二级入口、概览、时间Popover、参与列表、身份掩码、空值、Editor、发布检查；检查document水平溢出，宽表保持内部滚动。
- 手机375、430：真实用户预览与独立Staff，检查document水平溢出；不以桌面截图冒充移动端。
- 纯前端 / 不接微信HQ / 并发限制等研发说明保留在文档，而不是后台职责卡片或常驻正常页面；规则版本 / 业务归属不作为运营首页噪声。
- 虚拟DIRECT仍本地发放且不执行实体CLAIM；虚拟RESERVATION先冻结代码并占库存，合法PRIZE预约 / CLAIM才issuedAt+fulfilledAt。此分支另由U和真实浏览器新增补充场景验证，不把4×PHYSICAL组合等同所有类型覆盖。
- 原六套浏览器回归已全量重跑，保持旧断言：销售 / 会员27组、Dashboard11组、Marketing V2 18组、V2.1 7组、Final 5组、Core 11组，共79组。Sales / Member存储原文字节不变；不改销售流、权限、集团关联或概览口径。

明确层级：OpenID跨App同值、缺App拒绝、同姓名 / 手机歧义、后续关联会员及权限能力组合由U规则夹具验证；当前Preview是明确虚构身份场景，不是微信授权、手机号验证或真实CRM匹配端。R证明内部记录不误合并与页面链路，不冒称已通过上述真实外部服务或全部UI录入边界。旧V2缺字段仅隔离fixture兼容读取。

额外兼容检查：克隆D链路真实UI创建 / 完成 / 中奖 / 核销的直接匿名记录，在第二个隔离Context仅移除可选participantId / identity / channel；通过原`p:<participation.id>`刷新和UI再次直接报名，断言所有Participation ID / 数量、Booking / Chance / Draw / Award / Redemption事实完全不变，Sales / Member命名空间不变。这是明确标注的旧元数据fixture，不声称字段删除是产品UI功能；原case6纯只读字节保留检查同时保留。

### 本轮实际门禁

| 检查 | 实际结果 |
| --- | --- |
| Typecheck / lint | PASS，exit0；现有lint是tsc，不宣称额外ESLint |
| 全部test / 本轮marketing规则 | 407/407 PASS；marketing196（原129+新53模型+14readiness）；本轮新增67，不削弱Final断言 |
| build | PASS，exit0；冻结后未再改生产源码；既有lottie eval / chunk-size警告不伪装消失 |
| 新浏览器41项 / 桌面 / 手机 | 41/41 PASS，6组及142截图，三个桌面 / 两个手机宽度；实际点击一级 / 二级导航覆盖全部配置与记录明细、Editor五步和两种参与方式；附虚拟预约和旧匿名p:idfixture兼容 |
| 原六套Browser / Console / Request | 79/79组PASS、155截图；七套（含新增）console / runtime / failed-request均0 |
| 真实微信、HQ、后端、并发 / 真机 | 本轮未接入 / 未执行，不声称通过 |

证据输出为新时间戳目录下`00-evidence/evidence.md`、逐步骤截图、`01-issues/issues.md`及`results.json`。截图与本地archives不提交。首次失败记录保留，修复后另开时间戳重跑；记录功能失败与视觉一致性覆盖差异。

### 最终构建与本地证据

最终构建SHA256：app.js `3445937f9577a6dc400ae6777ed0f3deb0ae06ec949db54165a240a3fb074402`；app.css `eb2214fe4f7a8d0478e539550a7a25f851e80e8e593f835ced74e2a544c3de31`。Sowind SQL保持`757ef1d2b038cfc982e9a23a646fa36d274f8f89c1715a6a39152e1ddd3701a9`。以下是本地档案，不随GitHub提交（相对链接仅本地checkout可打开），不是线上部署验收：

- [Refinement 41项 / 142步骤与截图](../artifacts/prototype-qa/2026-09-18T06-33-37.804Z-marketing-refinement-v2/00-evidence/evidence.md)；[机器结果](../artifacts/prototype-qa/2026-09-18T06-33-37.804Z-marketing-refinement-v2/results.json)；[问题与覆盖](../artifacts/prototype-qa/2026-09-18T06-33-37.804Z-marketing-refinement-v2/01-issues/issues.md)
- [Sales / Member 27组](../artifacts/prototype-qa/2026-09-18T06-27-29.624Z-sales-regression/results.json)
- [Dashboard 11组](../artifacts/prototype-qa/2026-09-18T06-27-29.620Z-dashboard-v1/results.json)
- [Core 11组](../artifacts/prototype-qa/2026-09-18T06-27-29.627Z-core-integrity/results.json)
- [Marketing V2 18组](../artifacts/prototype-qa/2026-09-18T06-27-34.430Z-marketing-v2/results.json)
- [Marketing V2.1 7组](../artifacts/prototype-qa/2026-09-18T06-27-34.443Z-marketing-v21/results.json)
- [Marketing Final 5组](../artifacts/prototype-qa/2026-09-18T06-27-34.474Z-marketing-final/results.json)

此前定位轮保留：06:11:14 Semi按钮图标可访问名、06:12:30全局固定Math.random导致Radio ID碰撞、06:13:22 Modal的aria-label=confirm与中文okText差异、06:14:16隐藏Tab规则重复、06:18:08场景hash切换的Dropdown时序、06:19:24内部scroll容器祖先scope、06:32:06将hash路由误作pathname的URL等待。这些是测试环境 / 定位假阳性，修正定位而非业务断言。06:14:50新增Direct prize缺显式fulfillmentMode在新UI对象定点修复，未全域更改旧工厂；06:21:02定位轮完整通过，06:27:31冻结构建重跑通过，06:31:05补齐明细与Editor截图通过。最终06:33:37在同一冻结构建实际点击一级 / 二级Tab后再次41项全部通过，完成时间06:34:49 UTC。所有失败档案原文保留，没有覆盖旧证据或降低不变量。

人工复核1024概览 / 基本Editor / 发布检查 / 参与详情、最终1024抽奖记录 / 抽奖规则Editor / 奖品设置Editor、375预览 / Staff关键截图，没有溢出或遮挡阻断；不声称297张（155+142）全部逐像素审查。继承的封面native file input是非P0 / P1视觉细项，未伪称新增完整Semi Upload。真实微信授权、手机校验、HQ、服务器角色 / 并发、防作弊、真机 / Safari / Firefox及扫码硬件未覆盖。本轮Git最终提交 / 远端一致性由正常推送后的Git日志及交付回复报告，不将验收基线误作交付SHA；main / 部署未由本轮改变。

## 历史记录（以下非本轮验收结论）

# Final Acceptance

结论：**PASSED（纯前端产品原型范围）**。2026-09-17，当前分支 `codex/kivisense-product-prototype`。未发现已知P0；本轮发现的P1均局部修复并重测，没有未处理P1。完成附件第三十四节33项边界及第三十六节A–D页面链路。本轮结束营销功能迭代，等待CRM统一UI / IA评审，不自行合并main或部署。

## 当前Commit与证据基线

- 验收开始时当前 / 远端Commit：`47bea37d3647e5990613e15e8049c0ccfaff9a89`；最终验收源码为该Commit加本轮局部修正。本节与修正一同提交，最终交付Commit及正常推送后远端一致性见Git日志和交付回复，不能将开始Commit误称已包含本轮修正。
- 两次fetch后无分歧；main保持 `cc8e492f4a2409c55f10b3a16199eedeb652ce32`。
- 页面验证使用最新构建的 `http://127.0.0.1:4174`，独立Chrome BrowserContext、Los Angeles系统时区、Shanghai业务时间及虚构数据；A/B全部业务从创建起通过页面控件执行，无业务状态注入，C/D使用明确演示种子。
- 最终构建SHA256：app.js `98c546d7de730b5ca12342911b1de00635c9437250fb8a7de5f6afc319c324e4`；app.css `0e5229cd681823d6ae6cc0e02cc4cf7e9bcb98020c97610a2ec6a4827d771c59`。
- Sowind SQL SHA256仍为 `757ef1d2b038cfc982e9a23a646fa36d274f8f89c1715a6a39152e1ddd3701a9`。销售 / 会员Store、类型、数据、关联和路由、三视图Dashboard、SQL与依赖均未修改；无后端 / 数据库 / 金额 / Opportunity扩展。

按 automated-test-engineer 先复现、再局部修复、保留失败记录并分开核对规则、页面及持久结果。应用内浏览器另只读复核用户原有本地活动、中奖页与最终构建错误日志为0，不重置或写入该浏览器用户数据。

## 实际修改

| 文件 | 局部变化 |
| --- | --- |
| frontend-react/src/features/marketing/marketing-model.ts | 副本清空全部时间 / 所有码；安全追加配额；全业务集合删除保护；业务记录存在即锁实质规则；集中履约状态 / 统计判定 |
| MarketingAdmin.tsx（同目录） | 删除草稿二次确认与同规则显隐；业务已有时锁配置；明确说明更新仅影响未来中奖；配额列中文口径 |
| MarketingEditor.tsx（同目录） | 有历史即锁规则；已分配码错误中文，不改变字段调用契约 |
| MarketingData.tsx（同目录） | 实体 / 虚拟状态区分；权益详情使用快照，无外部兑换 / viewed伪造 |
| MarketingPages.tsx（同目录） | 预览、Staff识别复用状态；会员只读营销Tab履约计数包含已发放虚拟奖；不改会员资料 / Store |
| MarketingCodes.tsx（同目录） | 未分配 / 已分配 / 清空按钮中文化，内部分配结构不变 |
| marketing-final.test.ts（同目录，新） | 33个规则回归用例；含数量100 / 占用30 / 安全追加150、孤立历史、全命令跨品牌、技术草稿规则锁 |
| marketing-model.test.ts / marketing-v21.test.ts（同目录） | 保留原96项；按本轮合同补足容量后验证合法追加，新增失败拒绝断言；只更新中文指标 / 错误名称 |
| qa/marketing-final-browser-qa.mjs（新） | A–D完整真实页面操作、持久状态断言、33张步骤截图及只读明细 / 空状态 / 删除确认 / 三尺寸检查 |
| qa/marketing-v2-browser-qa.mjs | 原场景保留；增加先拒绝无容量追加、再补场次成功；同时核对两条拒绝 / 成功审计 |
| qa/marketing-v21-browser-qa.mjs | 先断言副本日期空，再通过UI重填日期，继续原100/20检查；中文代码状态定位 |
| package.json | 仅增加qa:marketing:final脚本，无依赖变化 |
| docs/MARKETING_ACTIVITY_MODULE.md / MARKETING_ACTIVITY_ACCEPTANCE.md / UI_ITERATION_ISSUES.md | 当前规则、最终验收 / 限制及问题复测记录；保留所有历史记录 |

## 五个重点边界、时间与不可逆性

1. **Copy Activity**：保留基本 / 预约 / 抽奖 / 奖品 / 场次结构，所有相关ID新建；六个活动窗口、奖品领奖窗口、场次五个日期字段清空。所有未分配和已分配代码均不复制。六个业务集合 / 历史库存占用不复制，原活动完全不变；新副本留单独复制操作审计。
2. **Prize修改**：发布或任一业务历史存在后实质配置锁定，包含概率；不新增规则版本引擎。配额只能专用正整数追加，完整发放前提有效、未过期、代码 / 有效总容量 / 扣承诺后容量充足。数量100、占用30不可降到20；足额容量下可增到150。名称 / 图片 / 说明等仅影响未来中奖，旧Award全部快照不变。
3. **Physical / Virtual Fulfillment**：直接实体待领取→已领取；预约实体待预约→已预约 / 待领取→已领取；过期不返池。兑换码已分配、凭证权益已生成、领取链接已生成均为本地平台发放，不是现场已核销 / 外部已兑换。统一“已履约份数”：实体fulfilledAt，虚拟issuedAt且对应内容快照齐全；未知类型 / 缺内容不伪装已履约。
4. **Draft Delete / Cancel**：无业务且从未发布的DRAFT经二次确认可删配置 / 未分配码 / 未使用场次，操作Audit保留且不误当业务。Participation / Booking / Chance / Draw / Award / Redemption任何一处有历史或存在已分配码就不可硬删，即使技术状态为草稿。取消只停止新参与、取消未到场活动预约；Award / Redemption / 既有奖品预约保留。
5. **Staff Permission**：view、manage、redeem独立，preview仅演示用户动作；view-only无写 / 无Audit，manager不自动核销，staff-only不改配置，品牌检查覆盖所有19类命令与凭证 / 活动 / 预约 / 奖品 / 代码引用。组合权限以规则夹具验证；真实页面使用现有HQ / 分销商，不伪造已存在独立Staff账号。
6. **时间状态**：预约期、活动期、抽奖期、领奖期独立；活动 / 抽奖已结束不阻断有效旧权益领取；抽奖截止停止新抽。保留现有V2暂停策略：停止所有新预约（含领奖预约 / 改约），但已有有效领奖预约可履约，不删除权益。取消后已有权益按自身窗口保留。
7. **不可逆性**：operationId重试及刷新复用中奖 / NONE；不重新开奖或扣次；Award快照保留；assignedAwardId / assignedAt / 内容在刷新与配置调整后不变，分配码不返AVAILABLE；成功核销重试不二领 / 不重复事实。LocalStorage旧V1先原文备份，V2用户修改不重写，损坏 / 未知数据明确阻断，不清用户存储。

## 附件33项检查映射

U=marketing-final.test.ts / 原marketing-model.test.ts / marketing-v21.test.ts规则断言；F=本轮Final页面脚本；V2 / V21=本轮重跑原页面套件。所有行PASS仅限所列层级，不代表生产权限 / 事务 / 并发。

| # | 验收边界 | 实际验证 |
| --- | --- | --- |
| 1 | 副本无Participation | U、F-C原集合逐项不变 |
| 2 | 副本无Booking | U、F-C |
| 3 | 副本无Draw | U、F-C |
| 4 | 副本无Award | U、F-C |
| 5 | 副本无Redemption | U、F-C |
| 6 | 副本无任意兑换码 | U、F-C、V21 |
| 7 | 不继承过期活动日期 | U、F-C、编辑页空日期 |
| 8 | 场次无过去完整日期 | U、F-C所有场次日期为空；V21建议场次为未来 |
| 9 | 已中30不降到20 | U精确100 / 30夹具；原发布后数量锁 |
| 10 | 安全增加配额 | U100→150；V2页面先拒绝容量不足、补容量后成功 |
| 11 | 不改类型破坏权益 | U逐字段实质修改拒绝 |
| 12 | Award Snapshot不跟配置变 | U说明允许更新但旧快照深度相等；V2旧权益页面 |
| 13 | Draw后概率符合原规则 | U概率锁定，包括技术草稿；不归一化耗尽概率 |
| 14 | Code正确状态 | U、F-B兑换码已分配、V21管理已分配时间 / 用户 |
| 15 | 虚拟奖不要求实体核销 | U三种方式拒绝CLAIM、F-B无需PRIZE_CLAIM即计已履约、V2 |
| 16 | 虚拟发放计已履约 | U三种虚拟内容、F-B数字1及同源Award ID |
| 17 | 已分配码永不重分配 | U删 / 批量 / 通用保存 / 重导 / 重试保护；V2 / V21 |
| 18 | 未使用Draft删除 | U配置Audit不误阻断；F-C先取消确认保留、再确认删除及未使用码移除 |
| 19 | 有业务不可硬删 | U六集合逐个孤立事实保护；原已发布保护 |
| 20 | Cancel保留Award | U历史深度相等、V2取消后合法旧领奖 |
| 21 | Cancel保留核销 | U事实深度相等；V2历史事实列表 |
| 22 | View不能Manage | V21 U十九写组合均拒绝无Audit |
| 23 | Manage不自动核销 | V21 U manager-only拒绝VERIFY / walk-in |
| 24 | Redeem不能改配置 | V21 U staff-only完成链路并拒绝规则写 |
| 25 | 跨品牌核销拒绝 | U全命令外品牌能力组合及凭证识别拒绝 |
| 26 | URL不能绕权限 | V2现有分销商活动 / 预览 / 新旧Staff凭证URL均拒绝 |
| 27 | 活动结束仍可合法领取 | U独立时钟、F-D结束活动与抽奖后的有效既有奖品预约核销 |
| 28 | Pause保留权益 | U深度相等；V2原暂停策略与既有预约核销 |
| 29 | 抽奖截止拒绝新抽 | 原U截止边界拒绝、不新增draw |
| 30 | Draw刷新不重开奖 | 原U中奖 / NONE重试；F-B刷新重试仍仅一Draw |
| 31 | Award刷新不消失 | U解码不变、F-B深度相等、V2 |
| 32 | Assigned Code刷新不换 | U、F-B同码 / 同关联 / 同分配时间、V21 |
| 33 | Redemption重复不二领 | U状态全等；F-D重复后Award / Redemption全等，V2体验亦同 |

## 质量门禁与页面证据

| 检查 | 实际结果 |
| --- | --- |
| typecheck | tsc -b frontend-react/tsconfig.json --pretty false，exit0 |
| 当前lint | npm run lint（项目现有脚本为tsc -b），exit0；不声称有额外ESLint检查 |
| 全部test | 6文件170项全部通过；营销56+40+33=129，Dashboard24，Sales6，Member11；无skip / only / 删测试 |
| build | npm run build，exit0，3473模块；既有lottie eval及大chunk警告保留，非本轮新增架构问题 |
| Final Browser | A/B/C/D + 隔离 / 布局共5组，33步骤截图，运行 / Console错误0，失败请求0 |
| Marketing V2 / V2.1 Browser | 18组 /26截图及7组 /16截图，全PASS，运行 / Console错误0、失败请求0 |
| CRM核心回归Browser | 27组 /31截图全PASS：Lead、Qualified→Deal、阶段Won / Lost、真实看板持久阶段、跟进 / 任务 / 附件、组织 / 联系人 / Product / 分销商及角色；集团→会员→购买意向及存储隔离 |
| Dashboard Browser | 11组 /13截图全PASS：三个视图、独立日期 / 品牌 / 分销商筛选、同源明细、空状态、缺时间旧数据 / HQ组合、角色范围 |

最终五套本地证据（机器结果results.json + 步骤截图 / 索引，不纳入Git；GitHub不会包含artifacts目录）：

- [Final A–D /33步骤](../artifacts/prototype-qa/2026-09-17T09-12-59.811Z-marketing-final/evidence.md)
- [Marketing V2结果](../artifacts/prototype-qa/2026-09-17T09-12-57.370Z-marketing-v2/results.json)
- [Marketing V2.1结果](../artifacts/prototype-qa/2026-09-17T09-12-58.531Z-marketing-v21/results.json)
- [CRM /会员 /购买意向结果](../artifacts/prototype-qa/2026-09-17T09-13-01.097Z-sales-regression/results.json)
- [三视图概览结果](../artifacts/prototype-qa/2026-09-17T09-13-02.369Z-dashboard-v1/results.json)

1440×900、1280×800、1024×768验证document无横向溢出、宽表内部滚动；V2 / V21额外375 /430预览 /Staff页面。人工复核核心指标、虚拟权益、删除确认、1024宽表及独立核销截图，不声称全部截图逐像素审核。新脚本采用真实当前视口截图，避免fullPage对已滚动固定AppShell的拼接位置误解成产品问题。

先新增28项复现时13项失败，修复后通过，再补5项精确边界共33项。原V2脚本初次因新增拒绝 / 成功两条ADD_QUOTA审计而strict匹配失败，保留 [原FAIL](../artifacts/prototype-qa/2026-09-17T09-06-09.133Z-marketing-v2/results.json)，随后核对两条动作与结果，不掩盖错误。旧成功追加100却不补容量的预期与新合同冲突，场景保留并增加拒绝 / 补容量 / 成功断言；没有修改断言规避库存业务错误。

## 已知限制 / 未执行

LocalStorage仍是前端持久化、Math.random不是生产安全随机、无后端并发库存 / 码锁、无多设备一致性保证。Voucher / Link仅本地内容生成，无第三方真实发放 / 使用 / 查看事实；真实Staff账号及门店 / 地点RBAC未最终定义。Safari / Firefox、真机、摄像头 / 微信、真实客户数据、多用户并发及生产服务器安全未验，不能记为PASS。原Dashboard缺真实成交时间 / 历史状态 / 活跃定义等指标仍不实现，不拼假漏斗、金额或ROI。这些为生产阶段 / 统一产品评审事项，不扩展本轮原型架构。

## Git与收口

保护原未跟踪artifacts，不覆盖其他工作；仅明确暂存本轮16个源码 /测试 /脚本 /文档文件，正常Commit与Push当前分支，再核对远端SHA。main不合并 /不修改，不强推、不部署、不发Release、不删分支；营销功能停止迭代，进入统一CRM UI /IA评审等待。

# 以下为V2.1历史验收（不代表本轮基线）

日期：2026-09-17。本轮基于当前分支 `codex/kivisense-product-prototype` 的 Marketing V2，开始时本地 / 远端 HEAD 均为 `df24a0f12f3e4ae4fc9718caf236230aaa6b8e5a`。fetch 后分支无分歧；`origin/main` 基线为 `cc8e492f4a2409c55f10b3a16199eedeb652ce32`。原未跟踪 `artifacts/` 保留、不纳入提交。依用户要求验证后只正常提交 / 推送当前分支，最终SHA与远端一致性以交付回复和Git日志为准，不改 main、不部署、不强推。

完整读取V2.1附件、AGENTS、设计系统 / 架构、Marketing类型 / Store / 集中动作 / 管理与编辑页面 / 独立Staff页面 / 种子 / 权限 / 原56项测试与两份营销文档。依 automated-test-engineer 分开记录规则、页面、持久状态及失败原因；另通过应用内浏览器查看现有本地活动 / 新建空日期 / 只读核销Tab，不保存任何用户改动。所有可写回归使用隔离Chrome BrowserContext与虚构数据，不接真实客户 / 后端。

## 实际修改文件与边界

| 范围 | 主要修改文件 |
| --- | --- |
| 集中规则 / 原型类型 | frontend-react/src/features/marketing/marketing-model.ts；frontend-react/src/types/marketing.ts |
| 活动 / 演示工厂分离 | frontend-react/src/mock/marketing-demo-data.ts |
| 配置与发布体验 | frontend-react/src/features/marketing/MarketingAdmin.tsx、MarketingEditor.tsx、MarketingUi.tsx |
| Staff / 预览与只读数据 | frontend-react/src/features/marketing/MarketingPages.tsx、MarketingData.tsx |
| 代码生命周期 | 新增 frontend-react/src/features/marketing/MarketingCodes.tsx；marketing-code-import.ts |
| 产品组合样式 | frontend-react/src/styles/marketing.css，仅发布检查与代码单元格，不做全局override |
| 规则回归 | 原 marketing-model.test.ts 56项保留；新增 marketing-v21.test.ts 40项 |
| 页面回归 | 新增 qa/marketing-v21-browser-qa.mjs、保留并适配 qa/marketing-v2-browser-qa.mjs；package.json 新增 qa:marketing:v21 |
| 文档 | 本文、MARKETING_ACTIVITY_MODULE.md、UI_ITERATION_ISSUES.md |

Activity中心、活动自有奖品、Participation / Booking / Draw / Award / Redemption和中奖占库存都保留。未改营销Store / storage / 路由架构、销售 / 会员核心模型、两个Store、手机号 / UnionID / 集团关联、Purchase Intent、Dashboard代码 / 指标、SQL / backend / domain / database。没有Opportunity、金额、积分或ROI；不新增任何依赖。frontend-react/package.json / package-lock.json无差异；Sowind SQL SHA256仍为 `757ef1d2b038cfc982e9a23a646fa36d274f8f89c1715a6a39152e1ddd3701a9`。

原56项测试没有删除。仅将旧运行中fixture显式改用demo工厂、固定发布时钟，并把“重复行整批失败”的旧断言适配本轮明确要求的部分导入，继续断言去重与实际库存，其他V2业务不变。旧页面脚本显式填写新建窗口，检查部分导入报告与发布检查弹窗，不删除原回归范围。

## 最终产物与执行结果

环境：本机 `http://127.0.0.1:4174` 构建预览，真实Chrome headless、Los Angeles时区与Shanghai业务显示；规则用固定时钟。每套页面使用独立BrowserContext；测试写入只在这些隔离上下文中，不读取 / 清除真实用户LocalStorage。code全量管理和Staff均为现有原型页面，不是静态图。

| 检查 | 实际结果 |
| --- | --- |
| npm run lint / typecheck | PASS，项目lint实际为 `tsc -b`，0错误，不假称额外ESLint |
| npm run test | PASS，5文件 /137项：原营销56 + V2.1新增40 + Dashboard24 +销售6 +会员11 |
| npm run build | PASS，3473模块；保留 lottie-web eval 与>500KB chunk警告，不隐藏 |
| qa:marketing:v21 | PASS，7组 /16截图；无会员配置/发布、容量、代码查看/删/清空/重导/配额、Staff与统计、五种尺寸 |
| qa:marketing | PASS，原V2 18组 /25截图；代码分配与幂等、实体体验履约、只读后台、V1保护升级、重置隔离、权限 |
| qa:browser | PASS，销售 /会员27组 /31截图；Qualified→Convert to Deal、Won/Lost、看板、跟进、附件、刷新、品牌/意向/权限 |
| qa:dashboard | PASS，原三视图11组 /13截图；筛选、明细、比例分母、日期、存量与旧数据保留 |
| Console / runtime / 请求 | 四套最终页面检查错误数组及failed request /response数组均0 |
| git diff --check / 范围检查 | PASS；最终提交前再次检查，不含原artifacts或无关业务文件 |

最终源码构建 SHA256：app.js `ad55c5251c1009a26389836d8b61a1c20c2b5c4175bda4279ebebf223731b64e`；app.css `0e5229cd681823d6ae6cc0e02cc4cf7e9bcb98020c97610a2ec6a4827d771c59`。这些只证明本机受测产物，不是部署证明。

- [V2.1规则137项机器记录](../artifacts/prototype-qa/2026-09-17T08-23-55.628Z-marketing-v21/unit-results.json)
- [V2.1最终页面机器记录](../artifacts/prototype-qa/2026-09-17T08-28-47.281Z-marketing-v21/results.json)、[16张截图索引](../artifacts/prototype-qa/2026-09-17T08-28-47.281Z-marketing-v21/evidence.md)：包含新增ASSIGNED时间 /关联用户精确断言与08a截图
- [V2原页面回归](../artifacts/prototype-qa/2026-09-17T08-23-56.508Z-marketing-v2/results.json)、[25张截图索引](../artifacts/prototype-qa/2026-09-17T08-23-56.508Z-marketing-v2/evidence.md)
- [销售/会员页面回归](../artifacts/prototype-qa/2026-09-17T08-23-57.855Z-sales-regression/results.json)、[31张截图索引](../artifacts/prototype-qa/2026-09-17T08-23-57.855Z-sales-regression/00-index.md)
- [Dashboard原页面回归](../artifacts/prototype-qa/2026-09-17T08-23-58.943Z-dashboard-v1/results.json)
- [修正规则与权限](MARKETING_ACTIVITY_MODULE.md)、[缺陷 / 脚本错误 / 重测](UI_ITERATION_ISSUES.md)

QA artifacts沿用原忽略规则，只是本机证据，没有上传GitHub；源码 / 脚本 / 文档正常提交。原08-23-55 V2.1页面结果为7组 /15截图PASS，08-28-47是追加更严格分配信息断言后同一受测构建的最终7组 /16截图PASS；二者原始记录都保留。

## V2.1要求的27项逐项验证

“规则”指已执行单元测试；“页面”指真实控件操作及UI / LocalStorage最终状态断言；规则通过不冒充已有独立Staff账号或生产权限通过。

| # | 场景 | 实际验证与层级 |
| --- | --- | --- |
| 1 | 零会员仍可创建 | 规则+页面PASS，清空隔离会员fixture后HQ新建UN草稿并发布未来免预约 /免抽奖活动 |
| 2 | 无管理品牌不能创建 | 规则PASS；原V2页面分销商无品牌，列表直达被拒绝，没有创建按钮 |
| 3 | 零会员预览明确空状态 | 页面PASS，预览与Staff均为“当前品牌暂无可用参与用户。”，配置 / 发布仍可用 |
| 4 | 数量100 /容量20不发布 | 规则+页面PASS，准确显示80差额、确认禁用、错误返回奖品配置 |
| 5 | 数量20 /容量20通过该项 | 规则+页面PASS；页面复制奖品仍缺代码，所以仅该项通过，不谎称整份复制活动已发布 |
| 6 | 非法 /过期场次不贡献容量 | 规则PASS，过期/截止/禁用/删除/越界/非法时间，-1/小数/NaN/Infinity/缺失容量优先报配置错误 |
| 7 | 运行中履约能力继续保护 | 新旧规则PASS；原V2页面追加库存仍只显示实际容量，取消不归还中奖库存 /履约承诺 |
| 8 | 零库存正概率不能发布 | 规则PASS；其他奖品有库存也不能掩盖该空奖品 |
| 9 | 零库存零概率可保存 | 规则PASS，可保留不参加抽取配置 |
| 10 | 正概率无预约能力不发布 | 规则PASS；未来可领奖但有效预约容量为0仍拒绝 |
| 11 | 正概率码不足不发布 | 新旧规则+原V2页面PASS，补足代码前拒绝，补足后合法发布 |
| 12 | 正常耗尽区间转NONE | 新旧规则PASS，固定其他概率，不重新分配；浏览器不随机跑到每种库存耗尽 |
| 13 | 批次重复识别 | 规则+页面PASS，报告成功3 /重复1 /非法1，并显示失败明细；规则另覆盖98/2/1 |
| 14 | 已有码重复不写 | 规则+页面PASS，跨奖品 /活动重复也剔除，持久代码不重复 |
| 15 | 草稿删除AVAILABLE | 规则+页面PASS，单删、清空、重导的持久库存均核对 |
| 16 | ASSIGNED不能删除 | 规则+页面PASS，按钮禁用、分配信息可见，混合清空 /通用保存也不能擦除或解分配 |
| 17 | 发布后删码保护剩余配额 | 规则+页面PASS，剩9码 /9配额时删1拒绝；追加1后可删冗余，刷新分配与awards不变 |
| 18 | 重试中奖不重新分码 | 新旧规则+原V2页面PASS，同operationId /刷新仅原award /code /draw，库存不重复占用 |
| 19 | redeem不能编辑 | 规则PASS，Staff-only具备redeem但无manage /preview仍能现场报名 /签到 /完成，编辑被拒绝 |
| 20 | manage不必拥有redeem | 规则PASS，管理可配置但现场 /核销命令被拒绝 |
| 21 | view-only无写操作 | 规则PASS，19个命令组合拒绝，原state引用与Audit不变；未新增只读页面账号 |
| 22 | 直达URL不绕过权限 | 原V2页面PASS，分销商拒绝列表 /详情 /预览 /新旧Staff路径；规则覆盖显式view=false /越品牌credential |
| 23 | 新活动不默认已开始 | 规则+页面PASS，六窗口为空、活动两placeholder、草稿持久后仍空，发布要求明确时间 |
| 24 | 新场次不自动过去时间 | 规则+页面PASS，父开始时间空时场次空；规则测试未来 /过去父时间建议均在未来 |
| 25 | 列表四指标正确 | 规则+页面PASS，现场→签到→完成后2有效预约 /1签到 /1完成 /0中奖，与原记录一致；人数 /次数 /份数分开 |
| 26 | 取消不计当前预约 | 新旧规则PASS，历史记录仍保留；原V2页面取消 /重约 /指标同源明细回归 |
| 27 | 爽约不算签到 | 规则PASS，checkinEnd后未签到为NO_SHOW，没有伪造checkedInAt；新增缺失 /禁用 /删除 /非法场次的INVALID排除与历史保留测试 |

额外验证：现场报名的容量、活动状态、allowWalkIn、预约关闭分支、一个可靠主体的品牌别名不产生第二身份 /有效预约；Voucher /Link配置与过期；published追加配额 /未来场次保留历史；复制只有新ID配置，没有代码 /库存占用 /业务记录；通用保存不可擦除ASSIGNED。

## 旧数据、权限、尺寸与未执行项

V2 schema2解码与保存对旧fixture用户改名 /已分配码 /历史权益深度相等；新空时间草稿也直接往返，存储键和版本不变、不回填今天、不重新播种。页面删除 /补码后整页刷新保留已有awards、ASSIGNED与其他工作区原始字符串；原V2页面再跑V1精确backup与失败保护、未知版本、三工作区重置隔离。兼容样本是虚构V1 /V2合同fixture，不是所有真实用户旧数据抽样，未声称未知数据都已迁完。

Desktop 1440×900 /1280×800 /1024×768：列表、数据内部滚动、奖品编辑 /发布弹窗及代码抽屉；375 /430：用户预览 /独立Staff。实际做document横向溢出与相关工作区 /按钮边界检查；人工查看容量检查、代码抽屉与窄屏Staff代表截图，不声称每张图逐像素审核。应用内浏览器只读检查现有已修改demo活动，0页面error；一次调用了不存在的树接口，属于工具用法错误，改用文档的AX接口，不是CRM runtime错误。

独立view /manage /redeem /preview能力组合只在规则层跑；现有页面账号仍HQ全能力 /分销商无品牌，没有新建Event Staff、真实登录或后端权限。未执行Safari /Firefox、真机、摄像头、跨设备 /多用户压力、服务器权限、生产库存 /码事务、微信 /HQ或第三方发券。仍是LocalStorage、Math.random演示、非真实Voucher /链接发放、非生产并发锁。

需后续产品确认但本轮不扩建：实际Event Staff与品牌 /地点范围的角色映射，以及生产开奖 /码库存 /权限 /恢复策略。原Dashboard没有可靠成交日期 /完整历史等指标继续未实现，不补假0或收入 /ROI。

---

# 营销活动 V2 验收记录（历史，非V2.1最新结果）

日期：2026-09-17。当前分支 `codex/kivisense-product-prototype`；V2本地验收开始与完成时的 HEAD 基线均为 `9ffe2ed1b1000852cba5b3c27da4d74a41d0d9fb`，当时工作区改动未提交、未推送。用户随后明确授权将本轮源码提交并同步当前GitHub分支，具体提交以Git日志及远端分支为准；未授权部署、修改 main / 强推 / 回退。原未跟踪 artifacts 及所有旧成功 / 失败记录均保留。

依据：营销活动模块 V2 附件（完整读取），当前 AGENTS、DESIGN_SYSTEM、PROTOTYPE_ARCHITECTURE、实际 V1 模型 / Store / 页面及既有测试。继续使用原 Semi Foundation，不执行旧迁移请求，不重建后端或架构。遵循 automated-test-engineer：真实页面控件操作 + 最终 UI / LocalStorage 断言，真实缺陷与脚本误判分开，缺证据不记 PASS。

## 本轮产品及文件改动

| 范围 | 实际文件（src 相对 frontend-react） |
| --- | --- |
| UI 重组 | src/features/marketing/MarketingPages.tsx；新增 MarketingAdmin.tsx、MarketingEditor.tsx、MarketingData.tsx、MarketingUi.tsx |
| 模型与虚拟库存 | src/types/marketing.ts、src/features/marketing/marketing-model.ts、src/mock/marketing-demo-data.ts；新增 marketing-code-import.ts |
| 持久与升级 | src/features/marketing/marketing-storage.ts、src/stores/marketing-store.tsx |
| 业务规则回归 | src/features/marketing/marketing-model.test.ts，原30项保留并适配明确V2合同，新增26项 |
| 路由 / 组合样式 | src/app/App.tsx 仅独立核销端分支；src/styles/marketing.css 仅模块组合 |
| QA | 新增 qa/marketing-v2-browser-qa.mjs；package.json 将 qa:marketing 指向 V2；qa/dashboard-browser-qa.mjs 修正未来记录预期，不改页面统计 |
| 文档 | MARKETING_ACTIVITY_MODULE、本文、UI_ITERATION_ISSUES、PROTOTYPE_ARCHITECTURE、README |

营销根入口只显示活动列表；每活动最多9个配置 / 数据 Tab，按开关隐藏不适用 Tab。新建五步和单奖品弹窗，不恢复顶层奖品库 / 预约 / CRM 核销工作台。旧入口有迁移提示；原核销逻辑在 CRM shell 外独立页面保留。ActivityPrize 类型与发放方式独立；新增代码 / 本地凭证 / 链接快照；Redemption 独立于 Audit。

销售 / 会员类型、种子、Store、匹配动作、各页面，以及 Dashboard 模型 / 页面 / 指标文档均无源码差异。Lead 转 Deal、Won/Lost、看板、跟进、权限、会员 / 意向关系未改。frontend-react/package.json / package-lock 无差异：本轮新增 / 删除依赖均为0。没有 backend / domain / database / SQL 修改；reference SQL SHA256仍为 `757ef1d2b038cfc982e9a23a646fa36d274f8f89c1715a6a39152e1ddd3701a9`。

## 最新产物与执行结果

本地构建预览 `http://127.0.0.1:4174/#marketing`；真实 Chrome headless、隔离 BrowserContext、虚构数据，非线上验收，未修改用户浏览器存储。营销 / 概览浏览器时区 Los Angeles，业务规则与显示 Shanghai UTC+08。规则用固定时钟；浏览器可控随机只在 QA 注入，没有正式代码按指定用户中奖。

| 检查 | 实际结果 |
| --- | --- |
| npm run lint | PASS，实际为 TypeScript tsc -b，0错误；非额外 ESLint |
| npm run test | PASS，4文件 /97项：营销56、Dashboard24、销售种子6、会员种子11 |
| npm run build | PASS；保留上游 lottie-web eval 与大于500KB chunk 警告，未隐藏 |
| qa:marketing | PASS，18 checkpoint组、25截图，持久结果 / 身份 / 权限 / 兼容 / 尺寸 |
| qa:browser | PASS，27 checkpoint组、31截图，原销售 / 会员完整业务回归 |
| qa:dashboard | PASS，11 checkpoint组、13截图，原三视图 / 筛选 / 明细 / 旧数据 |
| 控制台 / runtime / 请求 | 三个最新运行错误数组均0，failed requests / responses均0 |
| git diff --check | PASS |

最终未提交产物 SHA256：app.js `a6535062bdc9fec46926cdeb70e2149d50ae0e8f092a92c56d34d034c54f8d07`；app.css `7723a455591b0507a97dae5cb3a173c9db6509f51c3ec333c15763ea1188e6f8`。这是本地工作区构建证据，不是远程 commit / 部署证明。

- [营销机器记录](../artifacts/prototype-qa/2026-09-17T07-09-42.880Z-marketing-v2/results.json)
- [营销25张按序截图与尺寸/哈希](../artifacts/prototype-qa/2026-09-17T07-09-42.880Z-marketing-v2/evidence.md)
- [销售/会员机器记录](../artifacts/prototype-qa/2026-09-17T07-08-21.826Z-sales-regression/results.json)
- [销售/会员31张截图索引](../artifacts/prototype-qa/2026-09-17T07-08-21.826Z-sales-regression/00-index.md)
- [Dashboard最终机器记录](../artifacts/prototype-qa/2026-09-17T07-08-21.825Z-dashboard-v1/results.json)
- [97项测试机器记录](../artifacts/prototype-qa/2026-09-17T07-03-29.565Z-marketing-v2/unit-results.json)
- [规则与模型](MARKETING_ACTIVITY_MODULE.md)、[问题/失败原因/重测](UI_ITERATION_ISSUES.md)

证据目录沿用已有Git忽略规则，属于本机档案，不声称已上传GitHub。V1验收文档可在上述 HEAD 的Git版本中追溯；V1 artifacts 与旧 qa/marketing-browser-qa.mjs 保留为历史，不作为 V2 当前验收。

## 31项场景逐项对应

“规则”指集中model / storage的已执行单元测试；“页面”指真实控件操作与最终持久断言。单位测试通过不升级成浏览器 / 生产事务通过。

| # | 场景 | 结论 / 实际层级与证据 |
| --- | --- | --- |
| 1 | 多个完全独立活动 | 规则+页面PASS；新建免预约活动和兑换码活动，原四活动保留 |
| 2 | A奖品 / 库存 / 预约 / 数据不进入B | 规则+页面PASS；A原对象深度相等、复制后无B业务集合 |
| 3 | 复制只复制配置 | 规则+页面PASS；新ID、代码0、没有占用/业务记录，08 |
| 4 | 活动可混合多个实体 / 虚拟奖品 | 规则+页面PASS；种子各活动 owned pool，三种实体+虚拟代码 |
| 5 | 类型切换正确变化 | 规则+页面PASS；实体→虚拟→凭证→链接→代码，03 |
| 6 | 概率非100不能发布 | 规则+页面PASS；99%且NONE=0明确拒绝，04 |
| 7 | 负 / 非法库存不能保存 | 规则+页面PASS；页面-1不关闭奖品弹窗；规则含NaN、Infinity、非整数、关闭抽奖草稿 |
| 8 | 代码不重复分配 | 规则+页面PASS；规则两主体不同代码；页面重复请求同一代码且只有一条分配，06 |
| 9 | 代码不足不可发布 | 规则+页面PASS；配额2仅1码拒绝，CSV补第二码后发布，03/04 |
| 10 | 刷新不获得新代码 | 规则+页面PASS；整页刷新+原operationId重试，代码/award/draw/扣次均不增，06 |
| 11 | 未完成不能抽 | 规则+页面PASS；预览未完成按钮禁用，报名无chance |
| 12 | 重复完成不重复发次 | 规则+页面PASS；CHECKIN即完成重复签到、STAFF重复完成仅一条chance，05/10 |
| 13 | 次数与中奖上限独立 | 规则+页面PASS；获2次、用1次、剩1，中奖上限1后停，06 |
| 14 | 中奖上限后不扣剩余 | 规则+页面PASS；失败后draw/chance/award不增，原请求仍原结果 |
| 15 | NONE消耗一次 | 规则PASS；可控随机NONE扣1且幂等，已有虚构NONE种子；未单独浏览器抽出NONE |
| 16 | 库存耗尽不继续中奖 | 规则PASS；单奖耗尽区间转NONE，全无可赢不扣；页面验证配额占用 / 追加；浏览器未逐奖抽至全部耗尽 |
| 17 | 库存>容量不超额中奖 | 规则+页面PASS；规则库存10 /容量3，3赢家后停且剩库存7；页面追加库存60，显示可继续20，09 |
| 18 | 取消释放座位不取消权益 | 规则+页面PASS；规则可继续中奖量不因取消承诺上升；页面取消→重约→领取，11 |
| 19 | 失败改约保留原约 | 规则PASS；活动 / 奖品目标满、越界、规则禁用均保留原对象，页面未在V2单独再走满场失败改约 |
| 20 | CRM无核销工作台入口 | 页面PASS；列表无主Tab/按钮，数据后台无确认执行；独立staff页无sidebar，01/05 |
| 21 | 活动详情查看核销 | 页面PASS；readonly核销Tab，12 |
| 22 | Redemption不混Audit | 规则+页面PASS；Redemption只有CHECKIN/COMPLETE/EXPERIENCE_CLAIM；ADD_QUOTA只在基本信息Audit，12/13 |
| 23 | 重复核销不重复领取 | 规则+页面PASS；EXPERIENCE再次CLAIM无二次fulfilled/事实；不二扣库存，10 |
| 24 | 全部业务归属正确activity | 规则+页面PASS；所有类型按activityId关联，兑换码链与实体体验链各自独立 |
| 25 | 概览与明细一致 | 规则+页面PASS；八指标逐条完整ID、同源空状态，固定打开时刻，14 |
| 26 | 人数≠次数 / 份数 | 规则+页面PASS；8项来源明确分开，种子同主体多奖 /多draw不累加人数 |
| 27 | 原销售正常 | 页面27组PASS；列表/详情、编辑、邮件、电话、任务、备注、附件、权限、刷新 |
| 28 | 原会员正常 | 页面+规则PASS；customer→brand user/profile→intent，品牌/空关联、重置独立 |
| 29 | Lead→Deal不受影响 | 页面PASS；Qualified→Convert、Product/Add-ons、Won/Lost、看板持久状态 |
| 30 | 购买意向逻辑不变 | 页面+既有会员规则PASS；品牌/未关联、资料与意向独立，原Store和字段无改 |
| 31 | Dashboard口径不变 | 24规则+11页面组PASS；品牌/分销商独立、日期/当前存量、比例分母、原ID明细、旧数据 |

## 兼容、权限与额外边界

页面实际验证：

- V1夹具保留用户改名、旧Physical库存/领奖快照、已履约时间，自动升级schema2；先完整原文backup后写V2。旧Audit中的可信EXPERIENCE事实转独立记录，销售 / 会员原文不变（18截图）。
- 模拟备份写入quota failure，主营销键原文不变；解除模拟后刷新安全升级。
- 已有不同V1备份时，两份原文都保留并阻断；明确reset后COPY仍能持久成功，原备份不删除 / 覆盖。
- 未知schema99刷新后原文保留，无静默空状态或清库；三个工作区reset各自独立。
- 普通列表不露全码、权益抽屉可见原码；虚拟内容不能实体核销；批次重复代码整批拒绝。
- 合法EXPERIENCE流程：活动预约→独立签到→STAFF完成→获2次→抽体验→预约体验→独立CLAIM→再CLAIM，成功事实只一条。结束 / 取消后有效PICKUP仍履约；过期EXPERIENCE拒绝。
- Jason不能访问列表 /详情 / 用户预览 /当前和旧staff URL，无私有panel；HQ内外职责分离。
- Desktop1440×900 /1280×800 /1024×768活动列表与预约数据，375/430用户预览和独立核销无document/workspace横向溢出。表内滚动、固定操作列；窄屏每个抽奖按钮在面板内。

规则层补齐暂停新PRIZE预约/改约且保留现有履约、活动slots历史不能删除 /容量不能减超占用、实际cancel/reschedule规则、免预约walk-in权限、旧身份别名冲突、上海日界、UNKNOWN类型、无可信Audit不造核销、代码重复/悬空分配阻断、保存故障。未假称每个组合均在页面测试。

V1兼容夹具来自本轮现有Physical演示对象剥离V2字段并构造合法V1合同，不是用户真实浏览器备份或生产迁移；真实旧数据未抽样读取，数据保留策略不等于已迁完所有未知版本。

## 给评审者的主流程与URL映射

| 步骤 /目的 | 页面操作 /应见结果 | 截图 |
| --- | --- | --- |
| 新建独立活动 | 五步关闭预约，设置CHECKIN完成；添加VIRTUAL代码奖品 | 03 |
| 检查发布边界 | 99%+1码/2库存拒绝；CSV补码、改100%、本地PNG保存后发布 | 04 |
| 参与 /完成 | 指定现有品牌user预览报名，ACT码独立核销；只一次grantCount=2 | 05 |
| 抽奖 /恢复 | 抽得代码，刷新/重试返回同draw与相同内容；剩余1但不能再中奖 | 06 |
| 后台看数据 | 普通列表隐藏代码，只读详情揭示原快照；无核销动作 | 07 |
| 复制 /隔离 | 新草稿有配置，无代码/库存占用/业务记录 | 08 |
| 实体履约 | 原工坊完成后抽EXPERIENCE，预约及独立核销，重复不二领 | 10 |
| 记录 /指标 | 核销Tab与Audit分开，八指标逐ID核对 | 12/13/14 |
| 升级保留 | V1用户改名/旧业务+精确backup、故障保护 | 18 |

数据链：活动id +现有品牌userId → participationId /ACT → ACTIVITY bookingId/slotId（开启时）→ chance流水 → operationId /drawId → awardId /WIN +poolItemId → PRIZE bookingId/slotId（预约型实体）→ fulfilledAt +Redemption；虚拟分支为codes.assignedAwardId +virtualContent +本地issuedAt，不造实体CLAIM。

URL中activityId限定业务归属，userId只选择当前允许的原品牌身份；它们不是登录凭证。staff URL的credential是随机ACT/WIN演示标识，仍需当前角色授权。截图二维码与输入使用同一个标识。

## 失败记录、视觉与未覆盖

保留06-49至06-52的Select异步/隐藏Audit/隐藏Tab/空行占位脚本FAIL、07-03-29概览未来记录预期FAIL、07-08-21对Semi零尺寸外层使用visible的定位FAIL；原因及修复见UI_ITERATION_ISSUES。概览QA只补同页面创建区间与固定查看时刻，额外核对future记录ID，不改Dashboard源码或弱化断言。奖品配置和复制草稿编辑均复用滚动弹窗，最终页面检查body高度/overflow及取消动作。

人工查看1024列表、虚拟奖品表单、readonly核销、375虚拟权益和430staff截图；修复本模块弹窗高度、Banner逐字竖排、窄屏动作nowrap，不修改全局Semi。无像素图，不声称逐像素审核每张截图。

未执行：Safari/Firefox/真机、真实摄像头扫描、跨设备/多用户压力、服务器权限/库存事务、防作弊或微信/HQ/外部券码服务。生产功能未实现：外部发券/兑换/viewed、小程序发布、消息、可信随机、全局Audit模块及新品牌/核销角色、物流、积分、ROI。代码/凭证/链接只是本地演示，不宣称券已被外部系统消费。

原Dashboard缺可靠成交日期/完整历史/活跃定义的成交事件、连续漏斗、活跃/复购/ROI仍未实现，不以营销活动填假0或补金额。V2明确暂停策略已落地，真实角色/地点权限、后台权威身份/恢复、生产码库存与多页事务策略仍需后续产品/服务设计，不阻断本地结构验收。
