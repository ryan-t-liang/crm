# Sowind Gateway 映射与投递契约

本实现基于 v2.0 中英文规范和测试结果表。未提供真实 accessKey，因此只完成契约测试和本地 Outbox UAT，未执行真实 Endpoint 调用。

## 品牌配置

| 项目 | GP 芝柏表 | UN 雅典表 |
|---|---|---|
| Endpoint | `https://b2b.girard-perregaux.com/n8n-webhook/wechat-leads/gp` | `https://b2b.ulysse-nardin.com/n8n-webhook/wechat-leads/un` |
| `business_unit_forms` | `girard_perregaux` | `ulysse_nardin` |
| 腕表字段 | `do_you_own_a_girard_perregaux_`（可选） | `do_you_own_an_ulysse_nardin_`（必填） |
| Marketing Subscription Type | `370626181` | `5186585` |
| Response brand | `gp` | `un` |

所有品牌路由、字段、文案与订阅 ID 集中在 `sowind.config.ts`，页面代码不根据 GP/UN 分叉复制。

## 请求结构

Outbox 仅保存不含 Secret 的业务 Payload：

```json
{
  "fields": [{ "objectTypeId": "0-1", "name": "email", "value": "..." }],
  "context": { "pageUri": "...", "pageName": "WeChat Miniprogram | SKU" },
  "legalConsentOptions": { "consent": { "consentToProcess": true, "text": "..." } }
}
```

Gateway Client 发送前在内存顶层注入：

```json
{ "accessKey": "来自环境变量", "fields": [], "context": {}, "legalConsentOptions": {} }
```

不使用 `Authorization` Header。营销未选择时完全省略 `consent.communications`；选择时写入当前品牌的 `subscriptionTypeId`。

## 字段规则

- 必填：Email、称谓、名字、姓氏、电话、首选联系方式、国家、个人数据处理同意。
- UN 腕表持有必填；GP 可选。
- `hs_language` 固定为 `zh`。
- Country 必须属于规范中的 219 个 Internal Values；常用中文别名先映射。
- Birthday、UN Purchase Method/Retailer 等本地字段不发送到 Gateway。
- Payload Builder 在发送前检查品牌、Endpoint、`business_unit_forms` 与 Ownership 字段一致性。

## 响应与状态

唯一成功：HTTP 202，Body 同时满足 `status=queued` 且有字符串 `ref`。本地状态写为 `GATEWAY_QUEUED`，界面显示“Gateway 已受理”。这不是 HQ CRM 处理完成状态。

| 响应 | 行为 |
|---|---|
| 400 validation/brand/consent | 不盲目重试，标记校验失败 |
| 401 invalid key | 不自动重试，标记鉴权失败并告警 |
| 429 queue_full | 优先使用 `retryAfterSeconds` |
| 503 queue_unavailable/gateway_paused | 指数退避重试 |
| 503 annual_cap_reached | 永久停止，进入 Dead Letter |
| Timeout/Network | 指数退避重试 |
| 其他非 202 | 不视为成功 |

默认退避为 1/2/4/8 秒，总尝试上限 5 次；进程内限速 10 次/分钟。每次尝试写入 `integration_attempts`，并通过 `lead_id`、`outbox_id`、`gateway_ref` 追踪。保存 Gateway Response 前递归遮蔽 accessKey、Authorization、Password、Secret、Token 与 Cookie 类字段。

## Live Test 开关

`backend/tests/sowind.live.test.ts` 默认跳过。只有同时设置：

```text
RUN_SOWIND_LIVE_TESTS=true
SOWIND_GATEWAY_ACCESS_KEY=<secret>
```

才会向两个真实 Endpoint 发送测试线索。本轮未运行该测试。

