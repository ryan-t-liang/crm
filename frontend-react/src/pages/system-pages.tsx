import { useState } from "react";
import { IconPlus as Plus, IconShieldStroked as ShieldCheck } from "@douyinfe/semi-icons";
import { Collapse } from "@douyinfe/semi-ui";
import { crmApi, type SessionUser } from "@/lib/api";
import {
  can,
  dateTime,
  friendlyError,
  queryString,
  useResource,
  type PageResult,
} from "@/lib/crm";
import { Button, Checkbox, DateInput, Input } from "@/components/crm/ui";
import { DataTable } from "@/components/crm/data-table";
import {
  PageContent,
  PageHeader,
  RowActions,
  UserAvatar,
  StatusBadge,
  SearchInput,
  FilterControl,
  FilterPopover,
  Field,
  FormDialog,
  ErrorState,
  LoadingSkeleton,
  Section,
} from "@/components/crm/primitives";
import type { AuditRow } from "@/components/crm/entity-audit";
import {
  auditActionLabel,
  auditActionOptions,
  auditModuleLabel,
  auditModuleLabels,
  auditTargetLabel,
} from "@/lib/product-language";

type Permission = { key: string; name: string; module: string };
type Role = {
  id: string;
  key: string;
  name: string;
  description?: string;
  system: boolean;
  permissions: { permission: Permission }[];
};
type Account = {
  id: string;
  name: string;
  loginAccount: string;
  roleId: string;
  role: Role;
  status: string;
  lastLoginAt?: string;
  createdAt: string;
  mustChangePassword: boolean;
};
export function AccountsPage({
  me,
  onSessionChanged,
}: {
  me: SessionUser;
  onSessionChanged: () => void;
}) {
  const result = useResource<{ data: Account[] }>("/api/v1/users"),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<Account | "new" | null>(null),
    [action, setAction] = useState<{
      account: Account;
      key: string;
      title: string;
    } | null>(null),
    [success, setSuccess] = useState("");
  const rows = (result.data?.data || []).filter(
    (u) =>
      (status === "all" || u.status === status) &&
      [u.name, u.loginAccount, u.role.name]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <PageContent>
      <PageHeader
        title="账户管理"
        description="管理团队账号、角色与登录状态。"
        actions={
          can(me, "account.create") && (
            <Button onClick={() => setEdit("new")}>
              <Plus />
              新增账号
            </Button>
          )
        }
      />
      {success && (
        <p role="status" className="text-sm text-muted-foreground">
          {success}
        </p>
      )}
      {result.error ? (
        <ErrorState error={result.error} retry={result.reload} />
      ) : (
        <DataTable
          label="账户目录"
          rows={rows.slice((page - 1) * 20, page * 20)}
          total={rows.length}
          page={page}
          onPage={setPage}
          loading={result.loading}
          toolbar={
            <>
              <SearchInput
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
                placeholder="搜索姓名、Email 或角色"
              />
              <FilterControl
                label="状态"
                value={status}
                options={{ ACTIVE: "启用", DISABLED: "禁用" }}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
              />
            </>
          }
          columns={[
            {
              id: "name",
              header: "姓名",
              enableHiding: false,
              cell: ({ row }) => <UserAvatar name={row.original.name} />,
            },
            { accessorKey: "loginAccount", header: "Email" },
            {
              id: "role",
              header: "角色",
              cell: ({ row }) => row.original.role.name,
            },
            {
              id: "status",
              header: "状态",
              cell: ({ row }) => (
                <StatusBadge>
                  {row.original.status === "ACTIVE" ? "启用" : "禁用"}
                </StatusBadge>
              ),
            },
            {
              id: "lastLogin",
              header: "最近登录",
              cell: ({ row }) => dateTime(row.original.lastLoginAt),
            },
            {
              id: "created",
              header: "创建时间",
              cell: ({ row }) => dateTime(row.original.createdAt),
            },
            {
              id: "actions",
              header: "操作",
              enableHiding: false,
              cell: ({ row: { original: u } }) => (
                <RowActions
                  label={u.name}
                  items={[
                    ...(can(me, "account.edit")
                      ? [{ label: "编辑账号", onClick: () => setEdit(u) }]
                      : []),
                    ...(can(me, "account.disable") && u.id !== me.id
                      ? [
                          {
                            label:
                              u.status === "ACTIVE" ? "禁用账号" : "启用账号",
                            onClick: () =>
                              setAction({
                                account: u,
                                key:
                                  u.status === "ACTIVE" ? "disable" : "enable",
                                title:
                                  u.status === "ACTIVE"
                                    ? "禁用账号"
                                    : "启用账号",
                              }),
                          },
                        ]
                      : []),
                    ...(can(me, "account.reset")
                      ? [
                          {
                            label: "重置密码",
                            onClick: () =>
                              setAction({
                                account: u,
                                key: "reset-password",
                                title: "重置密码",
                              }),
                          },
                        ]
                      : []),
                  ]}
                />
              ),
            },
          ]}
        />
      )}
      {edit && (
        <AccountForm
          me={me}
          account={edit === "new" ? undefined : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            result.reload();
            setSuccess("账号已保存。");
            onSessionChanged();
          }}
        />
      )}
      {action && (
        <ConfirmAction
          title={`${action.title}：${action.account.name}`}
          description={
            action.key === "reset-password"
              ? "将恢复为系统配置的初始密码，撤销该账号所有会话，并要求下次登录修改密码。"
              : action.key === "disable"
                ? "禁用后该账号将退出当前会话，无法继续登录。"
                : "启用后该账号可以重新登录。"
          }
          onClose={() => setAction(null)}
          onConfirm={async () => {
            await crmApi(`/api/v1/users/${action.account.id}/${action.key}`, {
              method: "POST",
              body: "{}",
            });
            result.reload();
            setSuccess(`${action.title}成功。`);
            if (action.account.id === me.id) onSessionChanged();
          }}
        />
      )}
    </PageContent>
  );
}
function AccountForm({
  account,
  me,
  onClose,
  onSaved,
}: {
  account?: Account;
  me: SessionUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const roles = useResource<{ data: Role[] }>(
      can(me, "roles.view") ? "/api/v1/roles" : null,
    ),
    [name, setName] = useState(account?.name || ""),
    [email, setEmail] = useState(account?.loginAccount || ""),
    [roleId, setRoleId] = useState(account?.roleId || ""),
    [status, setStatus] = useState(account?.status || "ACTIVE"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    if (!name.trim() || !email.includes("@") || !roleId) {
      setError("请填写姓名、有效 Email 和角色。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await crmApi(`/api/v1/users${account ? `/${account.id}` : ""}`, {
        method: account ? "PATCH" : "POST",
        body: JSON.stringify({
          name: name.trim(),
          loginAccount: email.trim(),
          roleId,
          status,
        }),
      });
      onSaved();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  const roleOptions =
    roles.data?.data.filter((r) =>
      ["SUPER_ADMIN", "SALES", "VIEWER"].includes(r.key),
    ) || (account ? [account.role] : []);
  return (
    <FormDialog
      title={account ? "编辑账号" : "新增账号"}
      description={
        account
          ? "更新基本资料与角色。"
          : "新账号使用系统配置的初始密码，首次登录必须修改。"
      }
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={busy || roles.loading}
            onClick={() => {
              void save();
            }}
          >
            保存账号
          </Button>
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="姓名" required>
          {(id) => (
            <Input
              id={id}
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Email" required>
          {(id) => (
            <Input
              id={id}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label="角色" required>
          {() =>
            roleOptions.length ? (
              <FilterControl
                label="角色"
                value={roleId || "unselected"}
                all={false}
                options={{
                  unselected: "请选择角色",
                  ...Object.fromEntries(roleOptions.map((r) => [r.id, r.name])),
                }}
                onChange={(v) => setRoleId(v === "unselected" ? "" : v)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                没有可读取的角色，请联系有角色查看权限的管理员。
              </p>
            )
          }
        </Field>
        <Field label="状态">
          {() => (
            <FilterControl
              label="状态"
              value={status}
              all={false}
              options={
                account?.id === me.id
                  ? { ACTIVE: "启用" }
                  : { ACTIVE: "启用", DISABLED: "禁用" }
              }
              onChange={setStatus}
            />
          )}
        </Field>
      </div>
      {!!roles.error && <ErrorState error={roles.error} retry={roles.reload} />}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </FormDialog>
  );
}
export function RolesPage({
  me,
  onSessionChanged,
}: {
  me: SessionUser;
  onSessionChanged: () => void;
}) {
  const roles = useResource<{ data: Role[] }>("/api/v1/roles"),
    users = useResource<{ data: Account[] }>(
      can(me, "account.view") ? "/api/v1/users" : null,
    ),
    [selected, setSelected] = useState<Role | null>(null);
  return (
    <PageContent>
      <PageHeader
        title="角色与权限"
        description="按业务模块查看权限；系统角色保持只读。"
      />
      {roles.error ? (
        <ErrorState error={roles.error} retry={roles.reload} />
      ) : (
        <DataTable
          label="角色目录"
          rows={roles.data?.data || []}
          loading={roles.loading}
          columns={[
            {
              id: "role",
              header: "角色",
              cell: ({ row }) => (
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-muted-foreground" />
                  <span className="font-medium">{row.original.name}</span>
                </div>
              ),
            },
            { accessorKey: "description", header: "说明" },
            {
              id: "permissions",
              header: "权限",
              cell: ({ row }) => row.original.permissions.length,
            },
            {
              id: "users",
              header: "用户",
              cell: ({ row }) =>
                users.data
                  ? users.data.data.filter((u) => u.roleId === row.original.id)
                      .length
                  : "—",
            },
            {
              id: "type",
              header: "类型",
              cell: ({ row }) =>
                row.original.system ? "系统角色" : "可配置角色",
            },
            {
              id: "actions",
              header: "操作",
              cell: ({ row }) => (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(row.original)}
                >
                  {!row.original.system && can(me, "roles.configure")
                    ? "配置权限"
                    : "查看权限"}
                </Button>
              ),
            },
          ]}
        />
      )}
      {selected && (
        <RoleForm
          role={selected}
          editable={!selected.system && can(me, "roles.configure")}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            roles.reload();
            onSessionChanged();
          }}
        />
      )}
    </PageContent>
  );
}
function RoleForm({
  role,
  editable,
  onClose,
  onSaved,
}: {
  role: Role;
  editable: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const all = useResource<{ data: Permission[] }>("/api/v1/permissions"),
    [keys, setKeys] = useState(
      new Set(role.permissions.map((p) => p.permission.key)),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const groups = (all.data?.data || []).reduce<Record<string, Permission[]>>(
    (result, p) => {
      const key = p.key.startsWith("crm.") ? p.key.split(".")[1] : p.module;
      (result[key] ||= []).push(p);
      return result;
    },
    {},
  );
  async function save() {
    setBusy(true);
    try {
      await crmApi(`/api/v1/roles/${role.id}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({ permissionKeys: [...keys] }),
      });
      onSaved();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog
      title={`${editable ? "配置" : "查看"}权限 · ${role.name}`}
      description={
        editable
          ? "关闭查看权限时，依赖它的写入权限会按现有服务端规则自动移除。"
          : "此角色当前不可修改。"
      }
      wide
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {editable ? "取消" : "关闭"}
          </Button>
          {editable && (
            <Button
              disabled={busy || all.loading}
              onClick={() => {
                void save();
              }}
            >
              保存权限
            </Button>
          )}
        </>
      }
    >
      {all.error ? (
        <ErrorState error={all.error} retry={all.reload} />
      ) : all.loading ? (
        <LoadingSkeleton />
      ) : (
        <div className="space-y-6">
          {Object.entries(groups).map(([group, permissions]) => (
            <section key={group}>
              <h3 className="mb-3 border-b pb-2 text-sm font-medium">
                {(
                  {
                    contact: "联系人",
                    lead: "商机",
                    organization: "组织",
                    task: "任务",
                    contact_followup: "客户互动",
                    lead_followup: "商机跟进",
                    dashboard: "数据看板",
                    account: "账户",
                    role: "角色",
                    audit: "审计",
                  } as Record<string, string>
                )[group] || group}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {permissions?.map((p) => (
                  <label key={p.key} className="flex items-start gap-2 text-sm">
                    {editable ? (
                      <Checkbox
                        aria-label={p.name}
                        checked={keys.has(p.key)}
                        onCheckedChange={(v) =>
                          setKeys((old) => {
                            const next = new Set(old);
                            if (v) next.add(p.key);
                            else next.delete(p.key);
                            return next;
                          })
                        }
                      />
                    ) : (
                      <span className="w-4 text-muted-foreground">
                        {keys.has(p.key) ? "✓" : "—"}
                      </span>
                    )}
                    <span>
                      {p.name}
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {p.key}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </FormDialog>
  );
}
export function AuditPage() {
  const [filters, setFilters] = useState<Record<string, string>>({}),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<AuditRow | null>(null),
    result = useResource<PageResult<AuditRow>>(
      `/api/v1/audit-logs?${queryString({ ...filters, page, pageSize: 20 })}`,
    );
  const change = (k: string, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };
  return (
    <PageContent>
      <PageHeader
        title="审计日志"
        description="系统操作历史；业务互动请在客户旅程中查看。"
      />
      {result.error ? (
        <ErrorState error={result.error} retry={result.reload} />
      ) : (
        <DataTable
          label="审计目录"
          rows={result.data?.data || []}
          page={page}
          total={result.data?.meta.total}
          onPage={setPage}
          loading={result.loading}
          toolbar={
            <>
              <FilterControl
                label="模块"
                value={filters.module || "all"}
                options={auditModuleLabels}
                onChange={(v) => change("module", v)}
              />
              <FilterControl
                label="操作类型"
                value={filters.action || ""}
                options={auditActionOptions}
                onChange={(v) => change("action", v)}
              />
              <FilterPopover>
                <Field label="业务记录编号">
                  {(id) => (
                    <Input
                      id={id}
                      value={filters.targetId || ""}
                      onChange={(e) => change("targetId", e.target.value)}
                    />
                  )}
                </Field>
                <Field label="操作人编号">
                  {(id) => (
                    <Input
                      id={id}
                      value={filters.actorUserId || ""}
                      onChange={(e) => change("actorUserId", e.target.value)}
                    />
                  )}
                </Field>
                <Field label="开始日期">
                  {(id) => (
                    <DateInput
                      id={id}
                      onValueChange={(value) =>
                        change(
                          "from",
                          value
                            ? new Date(`${value}T00:00:00`).toISOString()
                            : "",
                        )
                      }
                    />
                  )}
                </Field>
                <Field label="结束日期">
                  {(id) => (
                    <DateInput
                      id={id}
                      onValueChange={(value) =>
                        change(
                          "to",
                          value
                            ? new Date(`${value}T23:59:59.999`).toISOString()
                            : "",
                        )
                      }
                    />
                  )}
                </Field>
              </FilterPopover>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilters({});
                  setPage(1);
                }}
              >
                重置
              </Button>
            </>
          }
          columns={[
            {
              id: "time",
              header: "时间",
              cell: ({ row }) => (
                <span className="whitespace-nowrap text-xs tabular-nums">
                  {dateTime(row.original.createdAt)}
                </span>
              ),
            },
            { accessorKey: "actorName", header: "操作者" },
            {
              id: "action",
              header: "操作",
              cell: ({ row }) => auditActionLabel(row.original.action),
            },
            { id: "module", header: "模块", cell: ({ row }) => auditModuleLabel(row.original.module) },
            {
              id: "entity",
              header: "对象",
              cell: ({ row }) => (
                <div className="text-xs">
                  <p>{auditTargetLabel(row.original.targetType)}</p>
                  <p className="max-w-44 truncate text-muted-foreground">
                    {row.original.targetId}
                  </p>
                </div>
              ),
            },
            {
              id: "actions",
              header: "详情",
              cell: ({ row }) => (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(row.original)}
                >
                  查看记录
                </Button>
              ),
            },
          ]}
        />
      )}
      {selected && (
        <FormDialog
          title="操作记录详情"
          description={`${auditActionLabel(selected.action)} · ${dateTime(selected.createdAt)}`}
          onClose={() => setSelected(null)}
          footer={
            <Button variant="outline" onClick={() => setSelected(null)}>
              关闭
            </Button>
          }
        >
          <Section title="操作详情">
            <Collapse className="crm-audit-technical-collapse mb-4">
              <Collapse.Panel
                className="crm-audit-technical-panel"
                itemKey="technical-information"
                header="技术信息"
              >
                <div className="crm-audit-technical-content text-xs text-muted-foreground">
                  <p className="font-mono">{selected.action}</p>
                  <p className="mt-1 font-mono">{selected.module} · {selected.targetType || "—"}</p>
                </div>
              </Collapse.Panel>
            </Collapse>
            <pre className="whitespace-pre-wrap break-all text-xs leading-6">
              {JSON.stringify(selected.details || {}, null, 2)}
            </pre>
          </Section>
        </FormDialog>
      )}
    </PageContent>
  );
}
function ConfirmAction({
  title,
  description,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <FormDialog
      title={title}
      description={description}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onConfirm()
                .then(onClose)
                .catch((e) => setError(friendlyError(e)))
                .finally(() => setBusy(false));
            }}
          >
            确认
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </FormDialog>
  );
}
