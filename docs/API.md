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
| GET/PATCH | `/api/v1/crm/contacts/:id` | 详情、编辑 |
| GET/POST | `/api/v1/crm/contacts/:id/followups` | 跟进列表、追加跟进 |
| GET | `/api/v1/crm/contacts/:id/leads` | 关联线索 |

## 线索

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/api/v1/crm/leads` | 列表、创建 |
| GET/PATCH | `/api/v1/crm/leads/:id` | 详情、编辑 |
| GET/POST | `/api/v1/crm/leads/:id/followups` | 跟进列表、追加跟进 |

线索创建时必须提交 `contactId`。联系人姓名、公司、邮箱和电话从关联联系人实时读取，不在线索中重复保存。

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

`:object` 取值为 `contacts` 或 `leads`。

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
