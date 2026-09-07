import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { crmApi, type SessionUser, type CrmUser } from "@/lib/api";
import {
  can,
  queryString,
  useResource,
  dateTime,
  relativeDate,
  lifecycleLabels,
  type Organization,
  type Nurture,
  type Task,
  type PageResult,
} from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/crm/data-table";
import {
  PageContent,
  PageHeader,
  DetailTabs,
  SearchInput,
  FilterControl,
  CompanyLogo,
  RowActions,
  StatusBadge,
  ErrorState,
  LoadingSkeleton,
  SummaryStrip,
  Section,
  FormDialog,
  EntityCombobox,
} from "@/components/crm/primitives";
import {
  TaskQueue,
  TaskForm,
  NurtureForm,
  type TaskTarget,
} from "@/components/crm/task-interactions";
import {
  FollowupForm,
  type FollowupTarget,
} from "@/components/crm/followup-form";
import { EntityForm } from "@/components/crm/entity-form";

type Plan = Nurture & { organization: { id: string; name: string } };
type WorkbenchFeed = {
  summary: {
    newMql: number;
    todayTasks: number;
    overdueTasks: number;
    next7DaysTasks: number;
    staleOpportunities: number;
    missingNextAction: number;
    recontactCompanies: number;
  };
  marketingLeads: Array<{
    id: string;
    fullName: string;
    companyName?: string;
    fitScore: number;
    engagementScoreCached: number;
  }>;
  opportunities: Array<{
    id: string;
    requirementSummary: string;
    status: string;
    nextAction?: string;
    reasons: string[];
    contact: { contactName: string; companyName?: string };
  }>;
  organizations: Array<{
    id: string;
    name: string;
    shortName?: string;
    fitScore: number;
  }>;
};
export function OperationsPage({
  me,
  users,
}: {
  me: SessionUser;
  users: CrmUser[];
}) {
  const [tab, setTab] = useState("priority"),
    [owner, setOwner] = useState("all"),
    [keyword, setKeyword] = useState(""),
    [page, setPage] = useState(1);
  const [task, setTask] = useState<TaskTarget | null>(null),
    [followup, setFollowup] = useState<FollowupTarget | null>(null),
    [nurture, setNurture] = useState<{
      organization: { id: string; name: string };
      plan?: Nurture;
    } | null>(null),
    [leadCompany, setLeadCompany] = useState<Organization | null>(null),
    [actionError, setActionError] = useState<unknown>(null);
  // Reuse the legacy pools' exact rules and server-computed bands; no client score calculation.
  const pool =
    tab === "priority"
      ? { fitLevel: "HIGH", engagementLevel: "HIGH" }
      : tab === "reactivation"
        ? { fitLevel: "HIGH", engagementState: "DORMANT" }
        : { engagementState: "DORMANT" };
  const organizations = useResource<PageResult<Organization>>(
    tab === "nurture"
      ? null
      : `/api/v1/crm/organizations?${queryString({ ...pool, ownerUserId: owner, keyword, page, pageSize: 20 })}`,
  );
  const plans = useResource<{ data: Plan[] }>(
    tab === "nurture"
      ? `/api/v1/crm/nurtures?${queryString({ ownerUserId: owner })}`
      : null,
  );
  const refresh = () => {
    organizations.reload();
    plans.reload();
    window.dispatchEvent(new Event("crm:data-changed"));
  };
  async function openNurture(o: Organization) {
    setActionError(null);
    try {
      const result = await crmApi<{ data: Organization }>(
        `/api/v1/crm/organizations/${o.id}`,
      );
      setNurture({
        organization: o,
        plan:
          result.data.nurtures.find((n) => n.status === "ACTIVE") ||
          result.data.nurtures.find((n) => n.status === "PAUSED"),
      });
    } catch (e) {
      setActionError(e);
    }
  }
  return (
    <PageContent>
      <PageHeader
        title="客户运营"
        description="现在应该联系谁？从客户状态出发，执行下一步行动。"
      />
      <DetailTabs
        value={tab}
        onChange={(v) => {
          setTab(v);
          setPage(1);
        }}
        items={[
          ["priority", "重点跟进"],
          ["nurture", "客户经营计划"],
          ["reactivation", "待唤醒"],
          ["dormant", "沉睡客户"],
        ]}
      >
        {!!actionError && (
          <ErrorState error={actionError} retry={() => setActionError(null)} />
        )}
        {tab === "nurture" ? (
          plans.error ? (
            <ErrorState error={plans.error} retry={plans.reload} />
          ) : (
            <DataTable
              label="客户经营计划"
              rows={(plans.data?.data || []).filter(
                (p) =>
                  !keyword ||
                  [p.organization.name, p.reason, p.objective]
                    .join(" ")
                    .toLowerCase()
                    .includes(keyword.toLowerCase()),
              )}
              loading={plans.loading}
              toolbar={
                <>
                  <SearchInput
                    placeholder="搜索公司、原因或目标"
                    value={keyword}
                    onChange={setKeyword}
                  />
                  <FilterControl
                    label="负责人"
                    value={owner}
                    options={Object.fromEntries(
                      users.map((u) => [u.id, u.name]),
                    )}
                    onChange={setOwner}
                  />
                </>
              }
              columns={[
                {
                  id: "company",
                  header: "公司 / 经营原因",
                  cell: ({ row: { original: n } }) => (
                    <div className="min-w-48 max-w-80">
                      <a
                        className="font-medium hover:underline"
                        href={`#organizations/${n.organizationId}`}
                      >
                        {n.organization.name}
                      </a>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {n.reason}
                      </p>
                    </div>
                  ),
                },
                { accessorKey: "objective", header: "目标" },
                { accessorKey: "touchTopic", header: "下次主题" },
                {
                  id: "owner",
                  header: "负责人",
                  cell: ({ row }) => row.original.owner?.name,
                },
                {
                  id: "cadence",
                  header: "周期",
                  cell: ({ row }) => `${row.original.cadenceDays} 天`,
                },
                {
                  id: "next",
                  header: "下次触达",
                  cell: ({ row }) => dateTime(row.original.nextTouchAt),
                },
                {
                  id: "status",
                  header: "状态",
                  cell: ({ row }) => (
                    <StatusBadge>
                      {
                        {
                          ACTIVE: "进行中",
                          PAUSED: "已暂停",
                          COMPLETED: "已完成",
                        }[row.original.status]
                      }
                    </StatusBadge>
                  ),
                },
                {
                  id: "actions",
                  header: "操作",
                  cell: ({ row: { original: n } }) => (
                    <RowActions
                      label={n.organization.name}
                      items={[
                        {
                          label: "查看公司",
                          onClick: () => {
                            window.location.hash = `organizations/${n.organizationId}`;
                          },
                        },
                        ...(can(me, "crm.organization.nurture.manage")
                          ? [
                              {
                                label: "管理经营计划",
                                onClick: () =>
                                  setNurture({
                                    organization: n.organization,
                                    plan: n,
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
          )
        ) : organizations.error ? (
          <ErrorState
            error={organizations.error}
            retry={organizations.reload}
          />
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {tab === "priority"
                ? "高匹配且高活跃，优先推进。"
                : tab === "reactivation"
                  ? "高匹配的沉睡客户，适合重新建立联系。"
                  : "基于现有互动时间与活跃商机规则动态计算。"}
            </p>
            <DataTable
              label="客户运营队列"
              rows={organizations.data?.data || []}
              loading={organizations.loading}
              page={page}
              total={organizations.data?.meta.total}
              onPage={setPage}
              toolbar={
                <>
                  <SearchInput
                    value={keyword}
                    onChange={(v) => {
                      setKeyword(v);
                      setPage(1);
                    }}
                    placeholder="搜索公司或联系人"
                  />
                  <FilterControl
                    label="负责人"
                    value={owner}
                    onChange={(v) => {
                      setOwner(v);
                      setPage(1);
                    }}
                    options={Object.fromEntries(
                      users.map((u) => [u.id, u.name]),
                    )}
                  />
                </>
              }
              columns={[
                {
                  id: "company",
                  header: "公司 / 背景",
                  enableHiding: false,
                  cell: ({ row: { original: o } }) => (
                    <div className="flex min-w-52 max-w-80 gap-3">
                      <CompanyLogo organization={o} />
                      <div className="min-w-0">
                        <a
                          className="font-medium hover:underline"
                          href={`#organizations/${o.id}`}
                        >
                          {o.name}
                        </a>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {o.fitReason || o.note || "尚未补充背景"}
                        </p>
                      </div>
                    </div>
                  ),
                },
                {
                  id: "score",
                  header: "匹配度 / 互动活跃度",
                  cell: ({ row }) => (
                    <span className="tabular-nums">
                      {row.original.fitScore}
                      <span className="text-muted-foreground">
                        {" "}
                        / {row.original.engagementScore}
                      </span>
                    </span>
                  ),
                },
                {
                  id: "lifecycle",
                  header: "生命周期",
                  cell: ({ row }) => (
                    <StatusBadge>
                      {lifecycleLabels[row.original.lifecycleStage]}
                    </StatusBadge>
                  ),
                },
                {
                  id: "owner",
                  header: "负责人",
                  cell: ({ row }) => row.original.owner?.name || "待分配",
                },
                {
                  id: "interaction",
                  header: "最近互动",
                  cell: ({ row }) => (
                    <div className="whitespace-nowrap">
                      <p>{relativeDate(row.original.lastInteractionAt)}</p>
                      {row.original.engagementState === "DORMANT" && (
                        <p className="text-xs text-muted-foreground">
                          {row.original.dormantDays === null
                            ? "尚无互动"
                            : `${row.original.dormantDays} 天未互动`}
                        </p>
                      )}
                    </div>
                  ),
                },
                {
                  id: "next",
                  header: "下一步行动",
                  cell: ({ row }) => (
                    <div className="min-w-36 max-w-56">
                      <p className="truncate">
                        {row.original.nextTask?.title || "待安排"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dateTime(row.original.nextActionAt)}
                      </p>
                    </div>
                  ),
                },
                { accessorKey: "activeLeadCount", header: "活跃商机" },
                {
                  id: "actions",
                  header: "操作",
                  enableHiding: false,
                  cell: ({ row: { original: o } }) => (
                    <RowActions
                      label={o.name}
                      items={[
                        {
                          label: "查看公司",
                          onClick: () => {
                            window.location.hash = `organizations/${o.id}`;
                          },
                        },
                        ...(can(me, "crm.contact_followup.create") &&
                        can(me, "crm.task.create")
                          ? [
                              {
                                label: "新增互动",
                                onClick: () =>
                                  setFollowup({
                                    kind: "contact",
                                    organizationId: o.id,
                                    label: o.name,
                                  }),
                              },
                            ]
                          : []),
                        ...(can(me, "crm.task.create")
                          ? [
                              {
                                label: "创建任务",
                                onClick: () =>
                                  setTask({
                                    organizationId: o.id,
                                    label: o.name,
                                  }),
                              },
                            ]
                          : []),
                        ...(can(me, "crm.organization.nurture.manage")
                          ? [
                              {
                                label: "开始 / 管理客户经营计划",
                                onClick: () => {
                                  void openNurture(o);
                                },
                              },
                            ]
                          : []),
                        ...(can(me, "crm.lead.create") &&
                        can(me, "crm.contact.view")
                          ? [
                              {
                                label: "创建商机",
                                onClick: () => setLeadCompany(o),
                              },
                            ]
                          : []),
                      ]}
                    />
                  ),
                },
              ]}
            />
          </div>
        )}
      </DetailTabs>
      {task && (
        <TaskForm
          target={task}
          me={me}
          users={users}
          onClose={() => setTask(null)}
          onSaved={refresh}
        />
      )}
      {followup && (
        <FollowupForm
          target={followup}
          me={me}
          users={users}
          onClose={() => setFollowup(null)}
          onSaved={refresh}
        />
      )}
      {nurture && (
        <NurtureForm
          organization={nurture.organization}
          nurture={nurture.plan}
          me={me}
          users={users}
          onClose={() => setNurture(null)}
          onSaved={refresh}
        />
      )}
      {leadCompany && (
        <EntityForm
          kind="lead"
          organization={leadCompany}
          me={me}
          users={users}
          onClose={() => setLeadCompany(null)}
          onSaved={() => {
            setLeadCompany(null);
            refresh();
          }}
        />
      )}
    </PageContent>
  );
}

export function WorkbenchPage({
  me,
  users,
}: {
  me: SessionUser;
  users: CrmUser[];
}) {
  const [status, setStatus] = useState("OPEN"),
    [page, setPage] = useState(1),
    [scope, setScope] = useState(me.id),
    [followup, setFollowup] = useState<FollowupTarget | null>(null),
    [task, setTask] = useState<TaskTarget | "pick" | null>(null),
    [actionError, setActionError] = useState("");
  const result = useResource<PageResult<Task>>(
    `/api/v1/crm/tasks?${queryString({ ownerUserId: scope, status, page, pageSize: 20 })}`,
  );
  const feed = useResource<{ data: WorkbenchFeed }>(
    `/api/v1/crm/workbench?${queryString({ ownerUserId: scope })}`,
  );
  const refresh = () => {
    result.reload();
    feed.reload();
    window.dispatchEvent(new Event("crm:data-changed"));
  };
  const acceptMql = async (id: string) => {
    setActionError("");
    try {
      await crmApi(`/api/v1/crm/marketing-leads/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({ action: "ACCEPT_SQL", reason: null }),
      });
      refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "接受线索失败");
    }
  };
  return (
    <PageContent>
      <PageHeader
        title="我的工作台"
        description="今天要联系谁、为什么联系、下一步做什么。"
        actions={
          can(me, "crm.task.create") && (
            <Button onClick={() => setTask("pick")}>
              <Plus />
              创建任务
            </Button>
          )
        }
      />
      <SummaryStrip
        items={[
          { label: "新 MQL 待接受", value: feed.data?.data.summary.newMql ?? "—" },
          { label: "逾期任务", value: feed.data?.data.summary.overdueTasks ?? "—" },
          { label: "今日任务", value: feed.data?.data.summary.todayTasks ?? "—" },
          { label: "未来 7 天", value: feed.data?.data.summary.next7DaysTasks ?? "—" },
          { label: "停滞商机", value: feed.data?.data.summary.staleOpportunities ?? "—" },
          { label: "缺少下一步", value: feed.data?.data.summary.missingNextAction ?? "—" },
        ]}
      />
      {actionError && (
        <p role="alert" className="text-sm text-destructive">{actionError}</p>
      )}
      {feed.error ? (
        <ErrorState error={feed.error} retry={feed.reload} />
      ) : feed.loading ? (
        <LoadingSkeleton />
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <Section title="新 MQL 待接受">
            {feed.data?.data.marketingLeads.length ? (
              <ul className="divide-y">
                {feed.data.data.marketingLeads.map((lead) => (
                  <li key={lead.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <a className="text-sm font-medium hover:underline" href={`#marketing-leads/${lead.id}`}>{lead.fullName}</a>
                      <p className="truncate text-xs text-muted-foreground">
                        {lead.companyName || "未填写公司"} · 线索匹配度 {lead.fitScore} · 互动活跃度 {lead.engagementScoreCached}
                      </p>
                    </div>
                    {can(me, "crm.marketing_lead.qualify") && <Button size="sm" onClick={() => void acceptMql(lead.id)}>接受跟进</Button>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">暂无待接受的 MQL。</p>}
          </Section>
          <Section title="商机提醒">
            {feed.data?.data.opportunities.length ? (
              <ul className="divide-y">
                {feed.data.data.opportunities.map((opportunity) => (
                  <li key={opportunity.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <a className="text-sm font-medium hover:underline" href={`#leads/${opportunity.id}`}>{opportunity.requirementSummary}</a>
                      <p className="text-xs text-muted-foreground">{opportunity.contact.contactName} · {opportunity.reasons.includes("STALE") ? "停滞" : ""}{opportunity.reasons.length > 1 ? " / " : ""}{opportunity.reasons.includes("NO_NEXT_ACTION") ? "缺少下一步" : ""}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setFollowup({ kind: "lead", id: opportunity.id, label: opportunity.requirementSummary })}>记录跟进</Button>
                    <Button variant="outline" size="sm" onClick={() => setTask({ leadId: opportunity.id, label: opportunity.requirementSummary })}>安排下一步</Button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">暂无停滞或缺少下一步行动的商机。</p>}
          </Section>
          {feed.data?.data.organizations.length ? (
            <Section title="高价值待重新联系">
              <ul className="divide-y">
                {feed.data.data.organizations.map((organization) => (
                  <li key={organization.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <a className="min-w-0 flex-1 truncate text-sm font-medium hover:underline" href={`#organizations/${organization.id}`}>{organization.shortName || organization.name}</a>
                    <StatusBadge>匹配度 {organization.fitScore}</StatusBadge>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <FilterControl
          label="任务状态"
          value={status}
          all={false}
          options={{ OPEN: "待完成", DONE: "已完成", CANCELED: "已取消" }}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        {(me.role.key === "SUPER_ADMIN" ||
          can(me, "crm.dashboard.management.view")) && (
          <FilterControl
            label="负责人"
            value={scope}
            options={Object.fromEntries(users.map((u) => [u.id, u.name]))}
            all={false}
            onChange={(v) => {
              setScope(v);
              setPage(1);
            }}
          />
        )}
      </div>
      <Section title="任务队列">
        {result.error ? (
          <ErrorState error={result.error} retry={result.reload} />
        ) : result.loading ? (
          <LoadingSkeleton />
        ) : (
          <TaskQueue
            tasks={result.data?.data || []}
            me={me}
            onChanged={refresh}
            onFollowup={(t) =>
              setFollowup({
                kind: t.leadId ? "lead" : "contact",
                id: t.leadId || t.contactId,
                organizationId: t.organizationId,
                label:
                  t.lead?.requirementSummary ||
                  t.contact?.contactName ||
                  t.organization?.name ||
                  t.title,
                currentTaskId: t.id,
              })
            }
          />
        )}
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            共 {result.data?.meta.total || 0} 条 · 第 {page} 页
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 20 >= (result.data?.meta.total || 0)}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </Section>
      {task === "pick" && (
        <TaskTargetPicker
          me={me}
          onClose={() => setTask(null)}
          onSelect={setTask}
        />
      )}
      {task && task !== "pick" && (
        <TaskForm
          target={task}
          me={me}
          users={users}
          onClose={() => setTask(null)}
          onSaved={refresh}
        />
      )}
      {followup && (
        <FollowupForm
          target={followup}
          me={me}
          users={users}
          onClose={() => setFollowup(null)}
          onSaved={refresh}
        />
      )}
    </PageContent>
  );
}
function TaskTargetPicker({
  me,
  onClose,
  onSelect,
}: {
  me: SessionUser;
  onClose: () => void;
  onSelect: (target: TaskTarget) => void;
}) {
  const available = [
    ["organizations", "公司", "crm.organization.view"],
    ["contacts", "联系人", "crm.contact.view"],
    ["leads", "商机", "crm.lead.view"],
  ].filter(([, , permission]) => can(me, permission));
  const [kind, setKind] = useState(available[0]?.[0] || ""),
    [value, setValue] = useState(""),
    [label, setLabel] = useState("");
  const load = useCallback(
    async (keyword: string, signal: AbortSignal) => {
      const result = await crmApi<
        PageResult<{
          id: string;
          name?: string;
          contactName?: string;
          requirementSummary?: string;
        }>
      >(`/api/v1/crm/${kind}?${queryString({ keyword, pageSize: 20 })}`, {
        signal,
      });
      return result.data.map((r) => ({
        id: r.id,
        label: r.name || r.contactName || r.requirementSummary || r.id,
      }));
    },
    [kind],
  );
  return (
    <FormDialog
      title="选择任务关联对象"
      description="任务需要关联公司、联系人或商机。"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!value}
            onClick={() =>
              onSelect({
                label,
                [kind === "organizations"
                  ? "organizationId"
                  : kind === "contacts"
                    ? "contactId"
                    : "leadId"]: value,
              })
            }
          >
            下一步
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FilterControl
          label="对象类型"
          all={false}
          value={kind}
          options={Object.fromEntries(
            available.map(([key, label]) => [key, label]),
          )}
          onChange={(v) => {
            setKind(v);
            setValue("");
            setLabel("");
          }}
        />
        <EntityCombobox
          key={kind}
          label="任务关联对象"
          value={value}
          selectedLabel={label}
          load={load}
          onChange={(v, l) => {
            setValue(v);
            setLabel(l);
          }}
        />
      </div>
    </FormDialog>
  );
}
