# Kivisense CRM 2.0 内部 API

所有业务接口均为 CRM 前端使用的内部接口。除登录和健康检查外，接口需要有效 Session；写操作同时校验 Origin 与 RBAC 权限。

## 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | 登录 |
| GET | `/api/v1/auth/me` | 当前账号、角色与权限 |
| POST | `/api/v1/auth/change-password` | 修改密码 |
| POST | `/api/v1/auth/logout` | 退出登录 |

## 客户联系人

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/api/v1/crm/contacts` | 列表、创建 |
| GET/PATCH/DELETE | `/api/v1/crm/contacts/:id` | 详情、编辑、删除 |
| GET/POST | `/api/v1/crm/contacts/:id/followups` | 跟进列表、追加跟进 |
| GET | `/api/v1/crm/contacts/:id/leads` | 关联线索 |

联系人可提交 `organizationId` 关联统一公司主档；已关联后，公司名称、网站、行业和地区以 Organization 为准。

## 公司、孵化与文件

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/api/v1/crm/organizations` | 公司列表、创建与重复预警 |
| GET/PATCH/DELETE | `/api/v1/crm/organizations/:id` | Company 360、编辑、受保护删除 |
| GET | `/api/v1/crm/organizations/:id/journey` | 公司业务旅程 |
| GET/POST | `/api/v1/crm/organizations/:id/nurtures` | 孵化计划列表、创建并生成下一触达任务 |
| PATCH | `/api/v1/crm/nurtures/:id` | 暂停、恢复或完成孵化 |
| POST | `/api/v1/crm/organizations/:id/attachments/logo` | 上传并替换公司 Logo（仅图片） |
| POST | `/api/v1/crm/organizations/:id/attachments/files` | 上传公司文件 |
| GET/DELETE | `/api/v1/crm/organizations/:id/attachments/:attachmentId[/download]` | 下载或删除公司文件 |

## 任务与执行

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/api/v1/crm/tasks` | 按权限范围查询或创建任务 |
| PATCH | `/api/v1/crm/tasks/:id` | 编辑未关闭任务 |
| POST | `/api/v1/crm/tasks/:id/complete` | 完成任务并保留历史 |
| POST | `/api/v1/crm/tasks/:id/cancel` | 取消任务并保留历史 |

任务至少关联公司、联系人或线索之一。`OPEN` 任务可编辑；`DONE` 和 `CANCELED` 不可重写业务内容。联系人或线索跟进可提交 `currentTaskId`、`nextAction` 和 `nextFollowupAt`，以原子方式完成当前任务并创建下一任务。

## Analytics

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/crm/analytics/management` | 管理 Dashboard 聚合数据 |
| GET | `/api/v1/crm/analytics/self` | 当前用户范围 Dashboard |
| GET | `/api/v1/crm/analytics/fit-engagement-matrix` | 3×3 Fit × Engagement 矩阵 |
| GET | `/api/v1/crm/analytics/team` | 团队执行数据 |

Analytics 支持 `from`、`to`、`ownerUserId` 和 `organizationRole` 过滤（自助 Dashboard 强制当前用户范围），且不返回报价、金额、收入、成本、合同、付款、发票或采购数据。

## 线索

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/api/v1/crm/leads` | 列表、创建 |
| GET/PATCH/DELETE | `/api/v1/crm/leads/:id` | 详情、编辑、删除 |
| GET/POST | `/api/v1/crm/leads/:id/followups` | 跟进列表、追加跟进 |
| POST | `/api/v1/crm/leads/:id/attachments` | 上传需求附件 |
| GET | `/api/v1/crm/leads/:id/attachments/:attachmentId/download` | 查看或下载需求附件 |
| DELETE | `/api/v1/crm/leads/:id/attachments/:attachmentId` | 删除需求附件 |

线索创建时必须提交 `contactId`。联系人姓名、公司、邮箱和电话从关联联系人实时读取，不在线索中重复保存。每条线索最多 20 个附件，支持常见图片、视频、PDF、Office、TXT、CSV 和 RTF 文件。

联系人仍有关联线索时，删除接口返回 `409 CONTACT_HAS_LEADS`；删除线索会级联删除其跟进与附件记录，并清理对应附件文件。

## 导入导出

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/crm/templates/:object` | 下载标准模板 |
| POST | `/api/v1/crm/imports/:object` | 上传并预检 |
| POST | `/api/v1/crm/imports/:id/execute` | 执行导入 |
| GET | `/api/v1/crm/imports` | 导入记录 |
| GET | `/api/v1/crm/imports/:id/failures` | 失败明细 |
| POST | `/api/v1/crm/exports/:object` | 创建导出文件 |
| GET | `/api/v1/crm/exports/:id/download` | 下载导出文件 |

`:object` 取值为 `contacts`、`leads` 或 `organizations`。联系人导入可使用精确 `Organization ID` 或精确规范化后的 `Organization Name`；创建缺失公司必须显式提交 `createMissingOrganization=true`，默认关闭，禁止模糊合并。

## 系统管理

- `/api/v1/users`：账号管理。
- `/api/v1/roles` 与 `/api/v1/permissions`：角色和权限管理。
- `/api/v1/audit-logs`：审计日志。
- `/api/health` 与 `/api/ready`：健康和就绪检查。

错误响应格式：

```json
{
  "error": { "code": "PERMISSION_DENIED", "message": "当前账户没有此操作权限" },
  "traceId": "..."
}
```
