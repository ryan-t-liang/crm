# 营销活动与概览最终验收

日期：2026-09-17。当前分支 `codex/kivisense-product-prototype`；未提交基线 `cc8e492f4a2409c55f10b3a16199eedeb652ce32`。未部署、推送、强推、回退、覆盖main或其他未提交工作。开始时未跟踪的 `artifacts/crm-structure-2026-09-16-stage1/` 保留，所有新增证据在独立时间目录，未删旧证据。

这是本地纯前端交互原型验收，不是微信、后端、生产随机服务或并发系统验收。遵循 automated-test-engineer 的证据原则：真实页面操作 + 最终 LocalStorage / UI 状态断言，保留失败记录并重测；不只凭构建认定业务通过。

## 实际改动文件

| 范围 | 文件 |
| --- | --- |
| 新增营销展示 | `frontend-react/src/features/marketing/MarketingPages.tsx`（四主区、六详情区、用户预览、核销、会员只读引用） |
| 新增营销模型与种子 | `src/types/marketing.ts`、`src/mock/marketing-demo-data.ts` |
| 新增营销动作与兼容 | `src/features/marketing/marketing-model.ts`、`marketing-storage.ts`、`src/stores/marketing-store.tsx` |
| 新增规则回归 | `src/features/marketing/marketing-model.test.ts`，30项 |
| 新增样式 | `src/styles/marketing.css`；index.css增量加载，只为模块组合 |
| 公共接入 | `src/components/AppShell.tsx`唯一导航项、`src/app/App.tsx`路由、`src/main.tsx`Provider；原Semi主题 / React19适配保留 |
| 会员页面 | `src/features/member-operations/MemberOperationsPages.tsx`只读营销Tab；SQL展示修正属于同轮概览任务 |
| 概览增量 | `features/dashboard/{DashboardPage.tsx,dashboard-model.ts,dashboard-model.test.ts}`、`styles/dashboard.css`、会员可选SQL字段 / 新种子 / sowind-read适配，详见概览验收 |
| QA | 新增 `qa/marketing-browser-qa.mjs`、`qa/dashboard-browser-qa.mjs`；原 `qa/prototype-browser-qa.mjs`保留历史证据并加强实际状态断言；根package新增QA入口 |
| 依赖 | frontend-react/package.json与package-lock.json仅新增 MIT `qrcode-generator@2.0.4`，无UI框架或其他依赖替换 |
| 文档 | 本记录、MARKETING_ACTIVITY_MODULE、DASHBOARD_METRICS、DASHBOARD_V1_ACCEPTANCE、SOWIND_MEMBER_FIELD_MAPPING、UI_ITERATION_ISSUES与原型架构 |

表中 `src/` 均相对 frontend-react。销售类型 / 种子、CRM Store、Member Store 与匹配动作文件无差异；Lead转换、状态、看板、分配、跟进、统计仍读取原销售集合。会员关系不改，活动不生成购买意向。没有 backend / database / domain / SQL 修改，SQL副本与附件哈希一致。

## 已执行检查

| 检查 | 最终结果 |
| --- | --- |
| `npm run lint` | PASS；实际为前端 TypeScript `tsc -b --pretty false`，0错误；不是额外ESLint门禁 |
| `npm run test` | PASS，4文件 /71项：营销30、概览24、原会员17 |
| `npm run build` | PASS；保留上游lottie-web eval警告与>500KB体积警告，不隐藏、不宣称无警告 |
| `qa:marketing` | PASS，18 checkpoint组、24截图；持久状态、权限、失败分支及尺寸实际验证 |
| `qa:dashboard` | PASS，11 checkpoint组、13截图；三视图各3桌面尺寸及边界 |
| `qa:browser` | PASS，27 checkpoint组、31截图；原销售 / 会员真实业务回归 |
| Console / runtime / failed requests | 三个最终Chrome运行均0 /0 /0 |
| `git diff --check` | PASS |

本地产物：`http://127.0.0.1:4174/#marketing`，HQ演示账号 Ryan。浏览器为本机Chrome自动化真实页面（headless），独立BrowserContext，不修改用户已有浏览器数据。营销/概览浏览器时区设置 Los Angeles，页面与规则时间均 Shanghai UTC+08；规则测试注入可控时钟。营销浏览器只在测试环境注入random=0.1，正式演示不指定用户中奖。

最终验证的未提交前端产物 SHA256：app.js `72eaf2a55f4d43643839897802e374c39d4568295800c756732cba981f77f426`；app.css `e3cb3cfd881028cf807f2d32b42404153524a3f97833e7b2831a82347d5c4b8b`。这是工作区构建证明，不是远程commit / 部署证明。

## 证据入口

- [营销最终机器记录](../artifacts/prototype-qa/2026-09-17T04-21-14.534Z-marketing-v1/results.json)
- [营销按序24张截图](../artifacts/prototype-qa/2026-09-17T04-21-14.534Z-marketing-v1/evidence.md)
- [概览最终机器记录](../artifacts/prototype-qa/2026-09-17T04-21-15.717Z-dashboard-v1/results.json)
- [销售 / 会员最终机器记录](../artifacts/prototype-qa/2026-09-17T04-21-16.877Z-sales-regression/results.json)
- [原销售 / 会员截图索引](../artifacts/prototype-qa/2026-09-17T04-21-16.877Z-sales-regression/00-index.md)
- [指标口径](DASHBOARD_METRICS.md)、[概览验收](DASHBOARD_V1_ACCEPTANCE.md)、[SQL字段映射](SOWIND_MEMBER_FIELD_MAPPING.md)、[缺陷与重测](UI_ITERATION_ISSUES.md)

证据目录沿用原有Git忽略规则，属于本机交付证据，未声称已上传GitHub。下述页面操作均有最终存储断言；UI图点/每个指标的抽屉另核对完整来源ID，不是无筛选的列表跳转。

## 主流程的逐步演示

默认初始namespace下操作，时间以初次生成的演示时间为准；刷新不会移动日期。若已错过演示窗口，按当前窗口拒绝，不假签到；明确重置营销数据才能生成新的时间，且不会重置会员/销售。缺少 `is_deleted=0` 的可用身份需先核对档案，不能为试用自动填默认值或清会员数据。

| 顺序 | 操作及对象 | 实际应见结果 / 对应截图 |
| --- | --- | --- |
| 1 | 营销入口→`activity-demo-1`；Ryan预览现有 `user-gp-1001-a` | 四活动 / 四区域、独立阶段；01 /02列表截图 |
| 2 | 新建活动→关闭预约 /抽奖→保存→编辑说明→发布→暂停 /恢复 | 持久草稿与发布状态，发布后规则锁定；04配置截图 |
| 3 | 奖品库真实新增、编辑、本地PNG预览、删除未引用项 | LocalStorage含data URL，无服务器上传；已引用删除禁用；04b |
| 4 | 工坊预览预约→取消→重约→再次提交→改到满额场 | 一个主体 /一个有效预约，历史取消仍在；满额失败原预约保留；05 |
| 5 | 带 ACT 随机码进工作台，识别并确认CHECKIN | 仅签到，无机会 /中奖；06 |
| 6 | 确认COMPLETE并重复提交；活动暂停时也可完成已有到场记录 | 一条机会流水 /获得2；暂停不能新抽；恢复后才继续 |
| 7 | 测试随机0.1即时抽奖→刷新→重试相同operationId | 一条draw、一份DIRECT权益，立即占配额；剩余1但中奖上限拒绝再抽；07 |
| 8 | WIN码识别→明确CLAIM→重复CLAIM | 同一权益履约，占用转发放，不再次扣配额；08 |
| 9 | 已发布奖池追加1配额，依次进入全部六Tab | 配额10→11，追加审计真实；最新审计/抽奖时间UTC+08；08b |
| 10 | 点击八指标→抽屉核对每个原始ID；会员只读营销Tab | 人数 /次数分开；同范围同时间；09 |
| 11 | 结束活动`activity-demo-4`中PICKUP取消 /重约，取消活动后仍履约；EXPERIENCE过期核销 | PRIZE预约与中奖保留；有效预约领取成功 /过期拒绝；10 /11 |
| 12 | 无抽奖沙龙`activity-demo-3`签到；免预约`activity-demo-2`直接报名签到 | 沙龙完成无chance；直接报名不造活动场次 |
| 13 | 浏览器模拟营销存储保存失败后抽奖，再恢复保存重试 | 失败无结果 /扣次 /库存变化，随后正常只生成一次；11b |
| 14 | 用户预览 /核销375与430宽度 | document /workspace不横向溢出，表内可滚动，操作列保持可见，二维码/码可用；12 /13 |
| 15 | 隔离测试移除身份，再移除全部身份，恢复 | 凭证待核对，不按姓名/手机号转绑；空身份有建立/核对原因；14 /14b |
| 16 | 分别重置营销 /销售 /会员；注入未知营销版本再刷新 | 三namespace互不清除；未知原始内容保留不覆写 |
| 17 | 切Jason后直接访问列表 /活动 /预览 /凭证URL | 没有菜单/私有字段，明示无权限；15 |

关联链可核对：activityId +现有user → participationId +ACT码 → ACTIVITY bookingId/slotId → chance流水 → operationId/drawId → awardId +WIN码 → PRIZE bookingId/slotId（需要预约时）→ fulfilledAt +对应CLAIM audit。标识均来自同一营销Store，不复制四套页面假数据。

## 用户16项验收对应

| 编号 | 结论与证据层级 |
| --- | --- |
| 1 配置与开关 | 规则 +浏览器PASS：新建/保存/编辑/发布/暂停/恢复/锁定，两个开关关闭仍可提交 |
| 2 容量 /改约 | 规则 +浏览器PASS：最后一个名额不超额，取消释放，满场改约保留 |
| 3 主体 /重复完成 | 规则 +浏览器PASS；客户关联变动后的新别名复用及冲突停抽在规则层验证，不声称UI新增了关联编辑 |
| 4 抽奖门槛 | 规则PASS：未完成、窗口前后、0次、库存/概率等；浏览器走了未完成 /暂停禁抽 |
| 5 2机会/1中奖 | 规则 +浏览器PASS：剩余机会不扣且明确不可再用 |
| 6 NONE /停抽 | 规则PASS：NONE扣1、全无库存/概率不扣；虚构种子有NONE，未用浏览器单独随机抽出NONE |
| 7 配额与幂等 | 规则 +浏览器PASS：中奖占用、核销转发放、重复请求 /核销不重复 |
| 8 刷新恢复 | 规则 +浏览器PASS：已保存结果刷新后重试原结果；存储失败无孤立扣次；不模拟不存在的异步后端事务 |
| 9 奖品预约 | 规则 +浏览器PASS：取消重约保留权益；满奖品时段/目标失败规则层验证 |
| 10 三核销动作 | 规则 +浏览器PASS：STAFF签到不完成、完成不领奖、无抽奖CHECKIN完成；错误类型/位置/场次规则层验证 |
| 11 活动结束继续履约 | 规则 +浏览器PASS：已有PICKUP预约可重约并核销 |
| 12 暂停/取消 | 规则 +浏览器PASS：暂停保留既有到场完成，取消保留权益 /PRIZE预约并可核销 |
| 13 权限 | 规则 +浏览器PASS：Jason菜单及URL拒绝；单品牌 /只读写入 /跨品牌凭证只在规则层注入测试，未造新角色账号 |
| 14 统计与缺数据 | 规则 +浏览器PASS：全部八指标每条ID，人与次数，空范围/未知版本/无权限有独立状态 |
| 15 持久与独立 | 规则 +浏览器PASS：刷新、v1缺revision兼容、未知版本保留、三种重置、悬空引用不转绑 |
| 16 原功能 | 27组销售 /会员 +11组概览浏览器PASS：转Deal、Won/Lost、持久看板、跟进、会员/意向、三视图/筛选/旧存储 |

## 已知限制 / 未执行

没有生产环境 /真实客户 /后端 /微信 /HQ /支付 /消息 /摄像头；没有跨标签、设备、多用户真实并发压力、事务与防作弊验证，不能作为生产保障。不是完整历史数据迁移：仅验证已定义v1的缺revision兼容与未知版本安全保留，无不存在的营销旧版本迁移成果。

线上未部署，Chrome本地headless之外未做Safari/Firefox/真实手机硬件。二维码来自实际编码器并与输入码共用标识；真实摄像头识别未执行。合法预约型PICKUP链路全走通；EXPERIENCE过期拒绝已验证，合法EXPERIENCE完整链路共用规则但没有单独再走一遍浏览器。

生效上限/概率边界与身份重关联主要为控制时钟规则测试；未声称浏览器每个组合都验证。上游eval与体积警告仍存在，未做全站打包重构。

缺真实成交日期/状态历史/运营定义的成交事件、连续漏斗、活跃/复购/ROI等概览指标未实现，不用营销活动填假0或补金额。

## 后续产品待确认（不阻断本轮原型）

1. 暂停“新预约”本轮指新参加活动；中奖后的预约是既有权益履约，允许继续。如要同时暂停新的领奖预约，需明确该权益策略。
2. 当前只有HQ拥有会员/营销权限。真实品牌管理员、只读、核销员职责 /地点范围需后端权威权限设计，不擅自添加演示账号扩大权限。
3. 生产身份引用 /恢复流程、会员手机号匹配与管理员空关联、品牌字典、SQL服务器时区与HQ错误清理规则，沿用待确认项。
