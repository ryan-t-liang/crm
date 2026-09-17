# 营销活动 V2 验收记录

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
