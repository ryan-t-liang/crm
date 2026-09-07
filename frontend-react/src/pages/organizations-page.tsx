import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { crmApi, type SessionUser, type CrmUser } from "@/lib/api";
import {
  can,
  dateTime,
  engagementLabels,
  lifecycleLabels,
  queryString,
  relativeDate,
  roleLabels,
  stageLabels,
  useResource,
  type Contact,
  type JourneyEvent,
  type Lead,
  type Organization,
  type PageResult,
} from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PageContent,
  PageHeader,
  CompanyLogo,
  UserAvatar,
  StatusBadge,
  RowActions,
  SearchInput,
  FilterControl,
  FilterPopover,
  Field,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  EntityHeader,
  EntityMeta,
  SummaryStrip,
  DetailTabs,
  Section,
  ConfirmDeleteDialog,
  type ActionItem,
} from "@/components/crm/primitives";
import { DataTable } from "@/components/crm/data-table";
import { OrganizationForm } from "@/components/crm/organization-form";
import { AttachmentList } from "@/components/crm/attachment-list";
import { Timeline } from "@/components/crm/timeline";
import {
  TaskForm,
  TaskQueue,
  NurtureForm,
  type TaskTarget,
} from "@/components/crm/task-interactions";
import {
  FollowupForm,
  type FollowupTarget,
} from "@/components/crm/followup-form";
import { ImportExport } from "@/components/crm/import-export";
import { EntityForm } from "@/components/crm/entity-form";

type Props = {
  me: SessionUser;
  users: CrmUser[];
  id?: string;
  supplier?: boolean;
};
export function OrganizationsPage({ me, users, id, supplier = false }: Props) {
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    try {
      const raw = sessionStorage.getItem("kivisense.crm.organization.filters");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [keyword, setKeyword] = useState(""),
    [page, setPage] = useState(1),
    [tab, setTab] = useState("overview");
  const [edit, setEdit] = useState<Organization | "new" | null>(null),
    [deleting, setDeleting] = useState<Organization | null>(null),
    [taskTarget, setTaskTarget] = useState<TaskTarget | null>(null),
    [nurtureTarget, setNurtureTarget] = useState<Organization | null>(null),
    [followupTarget, setFollowupTarget] = useState<FollowupTarget | null>(null);
  const [entityCreate, setEntityCreate] = useState<"contact" | "lead" | null>(
    null,
  );
  useEffect(() => {
    sessionStorage.removeItem("kivisense.crm.organization.filters");
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) =>
        (f.keyword || "") === keyword ? f : { ...f, keyword },
      );
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [keyword]);
  useEffect(() => {
    setTab("overview");
  }, [id]);
  const setFilter = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const list = useResource<PageResult<Organization>>(
    !id
      ? `/api/v1/crm/organizations?${queryString({ ...filters, role: supplier ? "VENDOR" : filters.role, page, pageSize: 20 })}`
      : null,
  );
  const detail = useResource<{ data: Organization }>(
    id ? `/api/v1/crm/organizations/${id}` : null,
  );
  const journey = useResource<{ data: { events: JourneyEvent[] } }>(
    id ? `/api/v1/crm/organizations/${id}/journey` : null,
  );
  const organization = detail.data?.data;
  function refresh() {
    list.reload();
    detail.reload();
    journey.reload();
    window.dispatchEvent(new Event("crm:data-changed"));
  }
  function actions(row: Organization): ActionItem[] {
    return [
      ...(!id
        ? [
            {
              label: "查看公司",
              onClick: () => {
                location.hash = `organizations/${row.id}`;
              },
            },
          ]
        : []),
      ...(can(me, "crm.contact_followup.create") && can(me, "crm.task.create")
        ? [
            {
              label: "新增互动",
              onClick: () =>
                setFollowupTarget({
                  kind: "contact",
                  organizationId: row.id,
                  label: row.name,
                }),
            },
          ]
        : []),
      ...(can(me, "crm.task.create")
        ? [
            {
              label: "创建任务",
              onClick: () =>
                setTaskTarget({ organizationId: row.id, label: row.name }),
            },
          ]
        : []),
      ...(can(me, "crm.organization.nurture.manage")
        ? [
            {
              label: "开始 / 管理客户经营计划",
              onClick: () => {
                void crmApi<{ data: Organization }>(
                  `/api/v1/crm/organizations/${row.id}`,
                )
                  .then((r) => setNurtureTarget(r.data))
                  .catch(() => {
                    window.location.hash = `organizations/${row.id}`;
                  });
              },
            },
          ]
        : []),
      ...(can(me, "crm.organization.edit")
        ? [{ label: "编辑公司", onClick: () => setEdit(row) }]
        : []),
      ...(can(me, "crm.organization.delete")
        ? [
            {
              label: "删除公司",
              onClick: () => setDeleting(row),
              destructive: true,
            },
          ]
        : []),
    ];
  }
  const columns: ColumnDef<Organization>[] = [
    {
      accessorKey: "name",
      header: "公司",
      enableHiding: false,
      cell: ({ row }) => (
        <a
          href={`#organizations/${row.original.id}`}
          className="flex min-w-48 items-center gap-3"
        >
          <CompanyLogo organization={row.original} />
          <span className="grid">
            <span className="max-w-56 truncate font-medium hover:underline">
              {row.original.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {row.original.shortName || row.original.industry || "—"}
            </span>
          </span>
        </a>
      ),
    },
    {
      id: "roles",
      header: "角色",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {row.original.roleKeys.map((r) => roleLabels[r]).join(" · ")}
        </span>
      ),
    },
    ...(!supplier
      ? ([
          {
            accessorKey: "lifecycleStage",
            header: "Lifecycle",
            cell: ({ row }) => (
              <StatusBadge>
                {lifecycleLabels[row.original.lifecycleStage]}
              </StatusBadge>
            ),
          },
          {
            accessorKey: "fitScore",
            header: "Fit",
            cell: ({ row }) => (
              <Score
                value={row.original.fitScore}
                level={row.original.fitLevel}
              />
            ),
          },
          {
            accessorKey: "engagementScore",
            header: "Engagement",
            cell: ({ row }) => (
              <Score
                value={row.original.engagementScore}
                level={row.original.engagementLevel}
              />
            ),
          },
        ] as ColumnDef<Organization>[])
      : ([
          {
            accessorKey: "website",
            header: "网站",
            cell: ({ row }) => row.original.website || "—",
          },
          {
            accessorKey: "region",
            header: "地区",
            cell: ({ row }) =>
              [row.original.country, row.original.city]
                .filter(Boolean)
                .join(" · ") || "—",
          },
        ] as ColumnDef<Organization>[])),
    {
      id: "owner",
      header: "负责人",
      cell: ({ row }) => <UserAvatar name={row.original.owner?.name} />,
    },
    { accessorKey: "contactCount", header: "联系人" },
    { accessorKey: "activeLeadCount", header: "活跃商机" },
    {
      id: "lastInteraction",
      header: "最近互动",
      cell: ({ row }) => (
        <span
          className="whitespace-nowrap text-xs text-muted-foreground"
          title={dateTime(row.original.lastInteractionAt)}
        >
          {relativeDate(row.original.lastInteractionAt)}
        </span>
      ),
    },
    {
      id: "nextTask",
      header: "下一步行动",
      cell: ({ row }) => (
        <div className="min-w-36 max-w-48">
          <p className="truncate">{row.original.nextTask?.title || "—"}</p>
          {row.original.nextActionAt && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {dateTime(row.original.nextActionAt)}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "updatedAt",
      header: "更新时间",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {dateTime(row.original.updatedAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableHiding: false,
      cell: ({ row }) => (
        <RowActions label={row.original.name} items={actions(row.original)} />
      ),
    },
  ];
  const contactColumns = useMemo<ColumnDef<Contact>[]>(
    () => [
      {
        accessorKey: "contactName",
        header: "联系人",
        cell: ({ row }) => (
          <a href={`#contacts/${row.original.id}`} className="hover:underline">
            <UserAvatar name={row.original.contactName} />
          </a>
        ),
      },
      { accessorKey: "title", header: "职位" },
      { accessorKey: "email", header: "Email" },
      { accessorKey: "phone", header: "Phone" },
      {
        id: "stage",
        header: "Stage",
        cell: ({ row }) => (
          <StatusBadge>{stageLabels[row.original.stage]}</StatusBadge>
        ),
      },
    ],
    [],
  );
  const leadColumns = useMemo<ColumnDef<Lead>[]>(
    () => [
      {
        accessorKey: "requirementSummary",
        header: "需求简述",
        cell: ({ row }) => (
          <a
            href={`#leads/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {row.original.requirementSummary}
          </a>
        ),
      },
      {
        id: "contact",
        header: "联系人",
        cell: ({ row }) => row.original.contact?.contactName || "—",
      },
      {
        id: "status",
        header: "阶段",
        cell: ({ row }) => (
          <StatusBadge>{stageLabels[row.original.status]}</StatusBadge>
        ),
      },
      {
        id: "owner",
        header: "负责人",
        cell: ({ row }) => <UserAvatar name={row.original.salesOwner?.name} />,
      },
    ],
    [],
  );
  return (
    <PageContent>
      {!id ? (
        <>
          <PageHeader
            title={supplier ? "供应商" : "公司"}
            description={
              supplier
                ? "管理供应商与交付合作关系。"
                : "管理潜在客户、客户、供应商与合作伙伴。"
            }
            actions={
              can(me, "crm.organization.create") && (
                <Button onClick={() => setEdit("new")}>
                  <Plus />
                  新建公司
                </Button>
              )
            }
          />
          {list.error ? (
            <ErrorState error={list.error} retry={list.reload} />
          ) : (
            <DataTable
              label={supplier ? "供应商目录" : "公司目录"}
              columns={columns}
              rows={list.data?.data || []}
              total={list.data?.meta.total}
              page={page}
              onPage={setPage}
              loading={list.loading}
              emptyTitle="暂无公司"
              toolbar={
                <>
                  <SearchInput
                    value={keyword}
                    onChange={setKeyword}
                    placeholder="搜索公司、简称或联系人"
                  />
                  {!supplier && (
                    <FilterControl
                      label="角色"
                      value={filters.role || ""}
                      onChange={(v) => setFilter("role", v)}
                      options={roleLabels}
                    />
                  )}
                  <FilterControl
                    label="生命周期"
                    value={filters.lifecycleStage || ""}
                    onChange={(v) => setFilter("lifecycleStage", v)}
                    options={lifecycleLabels}
                  />
                  <FilterControl
                    label="负责人"
                    value={filters.ownerUserId || ""}
                    onChange={(v) => setFilter("ownerUserId", v)}
                    options={Object.fromEntries(
                      users.map((u) => [u.id, u.name]),
                    )}
                  />
                  <FilterPopover
                    active={
                      !!(
                        filters.fitLevel ||
                        filters.engagementLevel ||
                        filters.engagementState ||
                        filters.industry
                      )
                    }
                  >
                    <Field label="Fit">
                      {() => (
                        <FilterControl
                          label="Fit"
                          value={filters.fitLevel || ""}
                          onChange={(v) => setFilter("fitLevel", v)}
                          options={{
                            HIGH: "高 Fit",
                            MEDIUM: "中 Fit",
                            LOW: "低 Fit",
                          }}
                        />
                      )}
                    </Field>
                    <Field label="Engagement">
                      {() => (
                        <FilterControl
                          label="Engagement"
                          value={filters.engagementLevel || ""}
                          onChange={(v) => setFilter("engagementLevel", v)}
                          options={{
                            HIGH: "高活跃",
                            MEDIUM: "中活跃",
                            LOW: "低活跃",
                          }}
                        />
                      )}
                    </Field>
                    <Field label="活跃状态">
                      {() => (
                        <FilterControl
                          label="活跃状态"
                          value={filters.engagementState || ""}
                          onChange={(v) => setFilter("engagementState", v)}
                          options={engagementLabels}
                        />
                      )}
                    </Field>
                    <Field label="行业">
                      {(fieldId) => (
                        <Input
                          id={fieldId}
                          value={filters.industry || ""}
                          onChange={(e) =>
                            setFilter("industry", e.target.value)
                          }
                        />
                      )}
                    </Field>
                  </FilterPopover>
                  {Object.values(filters).some(Boolean) && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setFilters({});
                        setKeyword("");
                        setPage(1);
                      }}
                    >
                      清除筛选
                    </Button>
                  )}
                  <ImportExport
                    kind="organizations"
                    me={me}
                    onChanged={refresh}
                  />
                </>
              }
            />
          )}
        </>
      ) : detail.loading ? (
        <LoadingSkeleton detail />
      ) : detail.error || !organization ? (
        <ErrorState error={detail.error} retry={detail.reload} />
      ) : (
        <>
          <a
            href="#organizations"
            className="flex w-fit items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            返回公司
          </a>
          <EntityHeader
            icon={<CompanyLogo organization={organization} large />}
            title={organization.name}
            meta={
              <>
                <span>{organization.shortName || organization.industry}</span>
                {organization.website && (
                  <a
                    href={organization.website}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {organization.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
                <span>
                  {organization.roleKeys.map((r) => roleLabels[r]).join(" · ")}
                </span>
                <StatusBadge>
                  {lifecycleLabels[organization.lifecycleStage]}
                </StatusBadge>
                <UserAvatar name={organization.owner?.name} />
              </>
            }
            actions={
              <>
                {can(me, "crm.contact.create") && (
                  <Button
                    variant="outline"
                    onClick={() => setEntityCreate("contact")}
                  >
                    新增联系人
                  </Button>
                )}
                {can(me, "crm.lead.create") && can(me, "crm.contact.view") && (
                  <Button
                    variant="outline"
                    onClick={() => setEntityCreate("lead")}
                  >
                    创建商机
                  </Button>
                )}
                {can(me, "crm.contact_followup.create") &&
                  can(me, "crm.task.create") && (
                    <Button
                      onClick={() =>
                        setFollowupTarget({
                          kind: "contact",
                          organizationId: organization.id,
                          label: organization.name,
                        })
                      }
                    >
                      <Plus />
                      新增互动
                    </Button>
                  )}
                <RowActions
                  label={organization.name}
                  items={actions(organization)}
                />
              </>
            }
          />
          <SummaryStrip
            items={[
              { label: "联系人", value: organization.contactCount },
              { label: "活跃商机", value: organization.activeLeadCount },
              {
                label: "最近互动",
                value: relativeDate(organization.lastInteractionAt),
                detail: dateTime(organization.lastInteractionAt),
              },
              {
                label: "下一步行动",
                value: organization.nextTask?.title || "暂无下一步行动",
                detail: organization.nextActionAt
                  ? dateTime(organization.nextActionAt)
                  : undefined,
              },
            ]}
          />
          <DetailTabs
            value={tab}
            onChange={setTab}
            items={[
              ["overview", "概览"],
              ["contacts", `联系人 ${organization.contacts.length}`],
              ["leads", `商机 ${organization.leads.length}`],
              ["journey", "客户旅程"],
              ...(can(me, "crm.task.view")
                ? [["tasks", "任务"] as [string, string]]
                : []),
              ["files", "文件"],
              ["notes", "备注"],
              ...(can(me, "audit.view")
                ? [["audit", "操作记录"] as [string, string]]
                : []),
            ]}
          >
            {tab === "overview" && (
              <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
                <div className="space-y-5">
                  <Section title="公司信息">
                    <EntityMeta
                      items={[
                        { label: "公司全称", value: organization.name },
                        { label: "行业", value: organization.industry },
                        { label: "网站", value: organization.website },
                        {
                          label: "地区",
                          value: [
                            organization.country,
                            organization.region,
                            organization.city,
                          ]
                            .filter(Boolean)
                            .join(" · "),
                        },
                        { label: "负责人", value: organization.owner?.name },
                        {
                          label: "生命周期",
                          value: lifecycleLabels[organization.lifecycleStage],
                        },
                      ]}
                    />
                  </Section>
                  <Section title="最近活动">
                    {journey.error ? (
                      <ErrorState
                        error={journey.error}
                        retry={journey.reload}
                      />
                    ) : journey.loading ? (
                      <LoadingSkeleton />
                    ) : (
                      <Timeline
                        events={journey.data?.data.events.slice(0, 3) || []}
                      />
                    )}
                  </Section>
                </div>
                <div className="space-y-5">
                  <Section title="Fit & Engagement">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <span className="text-xs text-muted-foreground">
                          Fit
                        </span>
                        <div className="mt-1 flex items-baseline gap-2">
                          <strong className="text-2xl font-semibold">
                            {organization.fitScore}
                          </strong>
                          <span className="text-xs text-muted-foreground">
                            {organization.fitLevel}
                          </span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                          {organization.fitReason || "尚未填写 Fit 理由"}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">
                          Engagement
                        </span>
                        <div className="mt-1 flex items-baseline gap-2">
                          <strong className="text-2xl font-semibold">
                            {organization.engagementScore}
                          </strong>
                          <span className="text-xs text-muted-foreground">
                            {organization.engagementLevel}
                          </span>
                        </div>
                        <dl className="mt-3 space-y-2">
                          {organization.engagementBreakdown.map((item) => (
                            <div
                              key={item.key}
                              className="flex justify-between gap-3 text-xs text-muted-foreground"
                            >
                              <dt>{item.label}</dt>
                              <dd className="tabular-nums">
                                {item.points > 0 ? "+" : ""}
                                {item.points}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    </div>
                  </Section>
                  <Section title="运营状态">
                    <EntityMeta
                      items={[
                        {
                          label: "活跃状态",
                          value: engagementLabels[organization.engagementState],
                        },
                        {
                          label: "距离最近互动",
                          value:
                            organization.dormantDays == null
                              ? "尚无互动"
                              : `${organization.dormantDays} 天`,
                        },
                        {
                          label: "下一次触达",
                          value: dateTime(
                            organization.nurtures.find(
                              (n) => n.status === "ACTIVE",
                            )?.nextTouchAt,
                          ),
                        },
                        {
                          label: "经营主题",
                          value: organization.nurtures.find(
                            (n) => n.status === "ACTIVE",
                          )?.touchTopic,
                        },
                      ]}
                    />
                  </Section>
                  <Section
                    title="下一步行动"
                    action={
                      can(me, "crm.task.create") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setTaskTarget({
                              organizationId: organization.id,
                              label: organization.name,
                            })
                          }
                        >
                          创建任务
                        </Button>
                      )
                    }
                  >
                    <p className="text-sm">
                      {organization.nextTask?.title || "尚未安排下一步行动"}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {dateTime(organization.nextActionAt)}
                    </p>
                  </Section>
                </div>
              </div>
            )}
            {tab === "contacts" && (
              <DataTable
                label="公司联系人"
                columns={contactColumns}
                rows={organization.contacts}
                emptyTitle="暂无联系人"
                toolbar={
                  can(me, "crm.contact.create") && (
                    <Button onClick={() => setEntityCreate("contact")}>
                      <Plus />
                      新增联系人
                    </Button>
                  )
                }
              />
            )}
            {tab === "leads" && (
              <DataTable
                label="公司商机"
                columns={leadColumns}
                rows={organization.leads}
                emptyTitle="暂无商机"
                toolbar={
                  can(me, "crm.lead.create") &&
                  can(me, "crm.contact.view") && (
                    <Button onClick={() => setEntityCreate("lead")}>
                      <Plus />
                      创建商机
                    </Button>
                  )
                }
              />
            )}
            {tab === "journey" && (
              <Section title="客户旅程">
                {journey.loading ? (
                  <LoadingSkeleton />
                ) : journey.error ? (
                  <ErrorState error={journey.error} retry={journey.reload} />
                ) : (
                  <Timeline events={journey.data?.data.events || []} />
                )}
              </Section>
            )}
            {tab === "tasks" && (
              <Section
                title="任务"
                action={
                  can(me, "crm.task.create") && (
                    <Button
                      size="sm"
                      onClick={() =>
                        setTaskTarget({
                          organizationId: organization.id,
                          label: organization.name,
                        })
                      }
                    >
                      <Plus />
                      创建任务
                    </Button>
                  )
                }
              >
                <TaskQueue
                  tasks={organization.tasks}
                  me={me}
                  onChanged={refresh}
                  onFollowup={(task) =>
                    setFollowupTarget({
                      kind: task.leadId ? "lead" : "contact",
                      id: task.leadId || task.contactId,
                      organizationId: organization.id,
                      label: task.title,
                      currentTaskId: task.id,
                    })
                  }
                />
              </Section>
            )}
            {tab === "files" && (
              <Section title="公司文件">
                <AttachmentList
                  files={organization.files}
                  endpoint={`/api/v1/crm/organizations/${organization.id}`}
                  editable={can(me, "crm.organization.edit")}
                  onChanged={refresh}
                />
              </Section>
            )}
            {tab === "notes" && (
              <Section
                title="备注"
                action={
                  can(me, "crm.organization.edit") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEdit(organization)}
                    >
                      编辑
                    </Button>
                  )
                }
              >
                <p className="whitespace-pre-wrap text-sm leading-6">
                  {organization.note || "暂无备注"}
                </p>
              </Section>
            )}
            {tab === "audit" && <OrganizationAudit id={organization.id} />}
          </DetailTabs>
        </>
      )}
      {edit && (
        <OrganizationForm
          organization={edit === "new" ? undefined : edit}
          defaultRole={supplier ? "VENDOR" : "PROSPECT"}
          me={me}
          users={users}
          onClose={() => setEdit(null)}
          onSaved={(row) => {
            setEdit(null);
            refresh();
            location.hash = `organizations/${row.id}`;
          }}
        />
      )}
      {deleting && (
        <ConfirmDeleteDialog
          name={deleting.name}
          description="执行软删除；存在联系人或活跃商机时，系统会阻止删除。"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await crmApi(`/api/v1/crm/organizations/${deleting.id}`, {
              method: "DELETE",
            });
            refresh();
            if (id) location.hash = "organizations";
          }}
        />
      )}
      {taskTarget && (
        <TaskForm
          target={taskTarget}
          me={me}
          users={users}
          onClose={() => setTaskTarget(null)}
          onSaved={refresh}
        />
      )}
      {nurtureTarget && (
        <NurtureForm
          organization={nurtureTarget}
          nurture={nurtureTarget.nurtures.find((n) => n.status === "ACTIVE")}
          me={me}
          users={users}
          onClose={() => setNurtureTarget(null)}
          onSaved={refresh}
        />
      )}
      {entityCreate && organization && (
        <EntityForm
          kind={entityCreate}
          organization={organization}
          me={me}
          users={users}
          onClose={() => setEntityCreate(null)}
          onSaved={() => {
            setEntityCreate(null);
            refresh();
          }}
        />
      )}
      {followupTarget && (
        <FollowupForm
          target={followupTarget}
          me={me}
          users={users}
          onClose={() => setFollowupTarget(null)}
          onSaved={refresh}
        />
      )}
    </PageContent>
  );
}
function Score({ value, level }: { value: number; level: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-medium tabular-nums">{value}</span>
      <span className="text-[10px] text-muted-foreground">{level}</span>
    </span>
  );
}
type AuditRow = {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
  targetId?: string;
  details?: { organizationId?: string };
};
function OrganizationAudit({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const result = useResource<PageResult<AuditRow>>(
    `/api/v1/audit-logs?module=crm&targetId=${encodeURIComponent(id)}&pageSize=100&page=${page}`,
  );
  const rows =
    result.data?.data.filter(
      (row) => row.targetId === id || row.details?.organizationId === id,
    ) || [];
  return (
    <Section title="操作记录">
      {result.error ? (
        <ErrorState error={result.error} retry={result.reload} />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            本公司的系统操作历史，客户互动请查看客户旅程。
          </p>
          {result.loading ? (
            <LoadingSkeleton />
          ) : rows.length ? (
            rows.map((row) => (
              <div
                className="flex flex-wrap justify-between gap-3 border-b py-3 text-sm"
                key={row.id}
              >
                <span>{row.action}</span>
                <span className="text-muted-foreground">
                  {row.actorName} · {dateTime(row.createdAt)}
                </span>
              </div>
            ))
          ) : (
            <EmptyState title="本页暂无相关操作记录" />
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 100 >= (result.data?.meta.total || 0)}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </div>
        </>
      )}
    </Section>
  );
}
