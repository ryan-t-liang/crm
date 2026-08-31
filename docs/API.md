# Sowind CRM API v1.15.0

## 通用约定

- 同源 Web API 使用 HttpOnly Session Cookie。
- 成功响应：`{ "data": ..., "meta": ... }`。
- 失败响应：`{ "error": { "code", "message", "details?", "requestId" } }`。
- 列表接口由服务端强制加入账号的品牌范围；无权查看的单条资源返回 404，避免枚举泄露。
- 首次登录待改密账号除 `/auth/me`、`/auth/change-password`、`/auth/logout` 外均返回 `403 PASSWORD_CHANGE_REQUIRED`。

## 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/auth/login` | 登录，限流 5 次/分钟 |
| GET | `/api/v1/auth/me` | 当前账号、角色、权限、品牌范围 |
| POST | `/api/v1/auth/change-password` | 修改密码 |
| POST | `/api/v1/auth/logout` | 撤销当前 Session |

## 会员与品牌画像

| 方法 | 路径 | 权限 |
|---|---|---|
| GET/POST | `/api/v1/customers` | `customer.view` / `customer.create` |
| GET/PATCH | `/api/v1/customers/:id` | `customer.view` / `customer.edit` |
| GET/POST/PATCH | `/api/v1/customers/:id/brands/:brandCode` | 相应 customer 权限 |
| PATCH | `/api/v1/customers/:id/profiles/:brandCode` | `customer.edit` |
| GET | `/api/v1/customers/:id/notes` | `customer.view` |
| POST | `/api/v1/customers/:id/notes` | `customer.edit` |
| GET | `/api/v1/customers/:id/journey` | `customer.view` |
| GET | `/api/v1/customers/:id/activity` | `customer.view` |

会员主档以已验证手机号规范值唯一；各品牌 Email、注册姓名、地址、偏好、OpenID/UnionID 保存在 Brand Profile/Identity 中。Email 不作为自动合并依据。

## 线索

| 方法 | 路径 | 权限 |
|---|---|---|
| GET/POST | `/api/v1/leads` | `lead.view` / `lead.create` |
| GET/PATCH | `/api/v1/leads/:id` | `lead.view` / `lead.edit` |
| PATCH | `/api/v1/leads/:id/customer` | `lead.edit` |
| POST | `/api/v1/leads/:id/sync` | `lead.sync` |

`POST /leads` 要求 `Idempotency-Key`。后台手动新增与外部提交进入同一个 Lead Service、Form Definition、Consent 与 Outbox 契约，仅通过 `source/submissionMode` 区分。

手动同步只会创建或重新激活 Outbox，不会让浏览器直连 Gateway。

## 账号、角色、审计

| 方法 | 路径 | 权限 |
|---|---|---|
| GET/POST | `/api/v1/users` | `account.view` / `account.create` |
| GET/PATCH | `/api/v1/users/:id` | `account.view` / `account.edit` |
| POST | `/api/v1/users/:id/disable` | `account.disable` |
| POST | `/api/v1/users/:id/enable` | `account.disable` |
| POST | `/api/v1/users/:id/reset-password` | `account.reset` |
| GET | `/api/v1/roles`, `/api/v1/roles/:id`, `/api/v1/permissions` | `roles.view` |
| PATCH | `/api/v1/roles/:id/permissions` | `roles.configure` |
| GET | `/api/v1/audit-logs` | `audit.view` |

创建账号时密码只从服务端 `INITIAL_PASSWORD` 读取，响应不返回密码或哈希。

## 表单、导入、导出

- `GET /api/v1/forms?brandCode=GP&objectType=LEAD`
- `GET /api/v1/templates/customers?brandCode=UN`
- `GET /api/v1/templates/leads?brandCode=GP`
- `POST /api/v1/imports/customers?brandCode=UN&conflictStrategy=SKIP`
- `POST /api/v1/imports/leads?brandCode=GP&conflictStrategy=SKIP`
- `GET /api/v1/imports/:id`
- `POST /api/v1/exports/customers`
- `POST /api/v1/exports/leads`
- `GET /api/v1/exports/:id/download`

模板字段来自当前品牌有效 Form Definition；必填列头带红色 `*`，手机号列使用文本格式，避免科学计数法和丢失 `+`/前导零。

## 外部小程序接入

`POST /api/integration/v1/leads`

请求头：

```text
X-Client-Id
X-Timestamp        Unix 毫秒时间戳，允许偏差 5 分钟
X-Nonce            每次请求唯一，重复返回 409
X-Signature        hex(HMAC-SHA256(secret, timestamp + "." + nonce + "." + bodyHash))
Idempotency-Key
```

`bodyHash = hex(SHA-256(canonicalJson(body)))`。Canonical JSON 规则：对象键按 Unicode 字典序排序；数组保持原顺序；字符串/数字/布尔/null 使用 JSON 表示。

本地成功落库返回 HTTP 202；这只表示本地 Lead 和 Outbox 已接受，不表示 Gateway 已接受。

