import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Goal,
  MessageSquarePlus,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { crmApi, type SessionUser, type CrmUser } from "@/lib/api";
import {
  can,
  businessRelationText,
  dateTime,
  engagementLabels,
  friendlyError,
  queryString,
  relativeDate,
  useResource,
  type Contact,
  type JourneyEvent,
  type Lead,
  type MarketingLead,
  type Organization,
  type PageResult,
} from "@/lib/crm";
import {
  auditActionLabel,
  marketingLeadStatusLabels,
  organizationTypeLabels,
  opportunityStageLabels,
  scoreLevelLabels,
} from "@/lib/product-language";
import { Button, Input } from "@/components/v1/ui";
import {
  PageContent,
  PageHeader,
  DetailScaffold,
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
  SystemIdField,
  type ActionItem,
} from "@/components/crm/primitives";
import { DataTable } from "@/components/crm/data-table";
import { OrganizationForm } from "@/components/crm/organization-form";
import { Timeline } from "@/components/crm/timeline";
import { FollowupForm, type FollowupTarget } from "@/components/crm/followup-form";
import { ImportExport } from "@/components/crm/import-export";
import { EntityForm } from "@/components/crm/entity-form";
import { MarketingLeadForm } from "@/pages/marketing-leads-page";

type Props = {
  me: SessionUser;
  users: CrmUser[];
  id?: string;
  supplier?: boolean;
};

const organizationRelationOptions = {
  CUSTOMER_RELATION: "客户",
  PARTNER: "合作伙伴",
  VENDOR: "供应商",
};

export function OrganizationsPage({ me, users, id, supplier = false }: Props) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("opportunities");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchOwnerUserId, setBatchOwnerUserId] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [edit, setEdit] = useState<Organization | "new" | null>(null);
  const [deleting, setDeleting] = useState<Organization | null>(null);
  const [followupTarget, setFollowupTarget] = useState<FollowupTarget | null>(null);
  const [entityCreate, setEntityCreate] = useState<"contact" | "lead" | null>(null);
  const [marketingLeadCreate, setMarketingLeadCreate] = useState(false);

  useEffect(() => {
    sessionStorage.removeItem("kivisense.crm.organization.filters");
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) =>
        (current.keyword || "") === keyword ? current : { ...current, keyword },
      );
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [keyword]);
  useEffect(() => {
    setTab("opportunities");
  }, [id]);

  const setFilter = (key: string, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  const list = useResource<PageResult<Organization>>(
    !id
      ? `/api/v1/crm/organizations?${queryString({
          ...filters,
          role: supplier ? "VENDOR" : filters.role,
          page,
          pageSize: 20,
        })}`
      : null,
  );
  const detail = useResource<{ data: Organization }>(
    id ? `/api/v1/crm/organizations/${id}` : null,
  );
  const journey = useResource<{ data: { events: JourneyEvent[] } }>(
    id ? `/api/v1/crm/organizations/${id}/journey` : null,
  );
  const organization = detail.data?.data;
  const targetFamily = supplier ? "suppliers" : "organizations";

  function refresh() {
    list.reload();
    detail.reload();
    journey.reload();
    window.dispatchEvent(new Event("crm:data-changed"));
  }

  async function batchAssign() {
    if (!selectedIds.length || !batchOwnerUserId) return;
    setBatchBusy(true);
    setBatchError("");
    try {
      await crmApi("/api/v1/crm/organizations/batch-assign", {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds, ownerUserId: batchOwnerUserId }),
      });
      setSelectedIds([]);
      refresh();
    } catch (error) {
      setBatchError(friendlyError(error));
    } finally {
      setBatchBusy(false);
    }
  }

  function listActions(row: Organization): ActionItem[] {
    return [
      {
        label: "查看组织",
        onClick: () => {
          location.hash = `${targetFamily}/${row.id}`;
        },
      },
      ...(can(me, "crm.contact_followup.create") && can(me, "crm.task.create")
        ? [
            {
              label: "新增互动",
              onClick: () =>
                setFollowupTarget({
                  kind: "contact" as const,
                  organizationId: row.id,
                  label: row.name,
                }),
            },
          ]
        : []),
      ...(can(me, "crm.organization.edit")
        ? [{ label: "编辑组织", onClick: () => setEdit(row) }]
        : []),
      ...(can(me, "crm.organization.delete")
        ? [
            {
              label: "删除组织",
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
      header: "组织",
      enableHiding: false,
      cell: ({ row }) => (
        <a href={`#${targetFamily}/${row.original.id}`} className="flex min-w-48 items-center gap-3">
          <CompanyLogo organization={row.original} />
          <span className="grid">
            <span className="max-w-56 truncate font-medium hover:underline">
              {row.original.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {row.original.shortName || row.original.website || "—"}
            </span>
          </span>
        </a>
      ),
    },
    {
      id: "roles",
      header: "组织关系",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {businessRelationText(row.original.roleKeys)}
        </span>
      ),
    },
    {
      accessorKey: "organizationType",
      header: "组织类型",
      cell: ({ row }) => organizationTypeLabels[row.original.organizationType] || "其他",
    },
    {
      accessorKey: "industry",
      header: "行业",
      cell: ({ row }) => row.original.industryCustom || row.original.industry || "—",
    },
    {
      accessorKey: "engagementScore",
      header: "互动活跃度",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium tabular-nums">{row.original.engagementScore}</span>
          <span className="text-[10px] text-muted-foreground">
            {scoreLevelLabels[row.original.engagementLevel] || "未知"}
          </span>
        </span>
      ),
    },
    { accessorKey: "contactCount", header: "联系人" },
    { accessorKey: "activeLeadCount", header: "活跃商机" },
    {
      id: "lastInteraction",
      header: "最近互动",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground" title={dateTime(row.original.lastInteractionAt)}>
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
            <p className="mt-0.5 text-xs text-muted-foreground">{dateTime(row.original.nextActionAt)}</p>
          )}
        </div>
      ),
    },
    {
      id: "updatedAt",
      header: "更新时间",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">{dateTime(row.original.updatedAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "操作",
      enableHiding: false,
      cell: ({ row }) => <RowActions label={row.original.name} items={listActions(row.original)} />,
    },
  ];

  const opportunityColumns = useMemo<ColumnDef<Lead>[]>(
    () => [
      {
        accessorKey: "requirementSummary",
        header: "商机",
        cell: ({ row }) => (
          <a href={`#leads/${row.original.id}`} className="font-medium hover:underline">
            {row.original.requirementSummary}
          </a>
        ),
      },
      { id: "contact", header: "联系人", cell: ({ row }) => row.original.contact?.contactName || "—" },
      {
        id: "status",
        header: "阶段",
        cell: ({ row }) => <StatusBadge>{opportunityStageLabels[row.original.status] || "未知"}</StatusBadge>,
      },
      { id: "owner", header: "商机负责人", cell: ({ row }) => <UserAvatar name={row.original.salesOwner?.name} /> },
    ],
    [],
  );

  const detailActions: ActionItem[] = organization
    ? [
        ...(can(me, "crm.marketing_lead.create")
          ? [{ label: "新增线索", icon: <Goal />, onClick: () => setMarketingLeadCreate(true) }]
          : []),
        ...(can(me, "crm.contact.create")
          ? [{ label: "新增联系人", icon: <UserPlus />, onClick: () => setEntityCreate("contact") }]
          : []),
        ...(can(me, "crm.lead.create") && can(me, "crm.contact.view")
          ? [{ label: "新增商机", icon: <BriefcaseBusiness />, onClick: () => setEntityCreate("lead") }]
          : []),
        ...(can(me, "crm.contact_followup.create") && can(me, "crm.task.create")
          ? [{
              label: "新增互动",
              icon: <MessageSquarePlus />,
              onClick: () => setFollowupTarget({ kind: "contact", organizationId: organization.id, label: organization.name }),
            }]
          : []),
        ...(can(me, "crm.organization.edit")
          ? [{ label: "编辑组织", icon: <Pencil />, onClick: () => setEdit(organization) }]
          : []),
        ...(can(me, "crm.organization.delete")
          ? [{ label: "删除组织", icon: <Trash2 />, onClick: () => setDeleting(organization), destructive: true }]
          : []),
      ]
    : [];

  return (
    <PageContent detail={!!id}>
      {!id ? (
        <>
          <PageHeader
            title={supplier ? "供应商" : "组织"}
            description={supplier ? "查看组织关系为供应商的统一组织主档。" : "管理客户、合作伙伴与供应商的统一组织主档。"}
            actions={
              <>
                <ImportExport
                  kind="organizations"
                  me={me}
                  onChanged={refresh}
                  selectedIds={selectedIds}
                  filters={{ ...filters, role: supplier ? "VENDOR" : filters.role || "" }}
                />
                {can(me, "crm.organization.create") && (
                  <Button onClick={() => setEdit("new")}><Plus />新增组织</Button>
                )}
              </>
            }
          />
          {list.error ? (
            <ErrorState error={list.error} retry={list.reload} />
          ) : (
            <DataTable
              label={supplier ? "供应商组织" : "组织目录"}
              columns={columns}
              rows={list.data?.data || []}
              total={list.data?.meta.total}
              page={page}
              onPage={setPage}
              loading={list.loading}
              emptyTitle="暂无组织"
              selectable={can(me, "crm.organization.edit")}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              selectionActions={
                <>
                  <FilterControl
                    label="批量分配负责人"
                    value={batchOwnerUserId || "unassigned"}
                    all={false}
                    options={{ unassigned: "选择负责人", ...Object.fromEntries(users.map((user) => [user.id, user.name])) }}
                    onChange={(value) => setBatchOwnerUserId(value === "unassigned" ? "" : value)}
                  />
                  <Button size="sm" disabled={!batchOwnerUserId || batchBusy} onClick={() => void batchAssign()}>
                    {batchBusy ? "分配中…" : "批量分配"}
                  </Button>
                  <ImportExport
                    kind="organizations"
                    me={me}
                    onChanged={refresh}
                    selectedIds={selectedIds}
                    filters={{ ...filters, role: supplier ? "VENDOR" : filters.role || "" }}
                    exportOnly
                  />
                </>
              }
              toolbar={
                <>
                  <SearchInput value={keyword} onChange={setKeyword} placeholder="搜索组织、简称或联系人" />
                  {!supplier && (
                    <FilterControl
                      label="组织关系"
                      value={filters.role || ""}
                      onChange={(value) => setFilter("role", value)}
                      options={organizationRelationOptions}
                    />
                  )}
                  <FilterPopover active={!!(filters.organizationType || filters.engagementState || filters.industry)}>
                    <Field label="组织类型">
                      {() => (
                        <FilterControl
                          label="组织类型"
                          value={filters.organizationType || ""}
                          onChange={(value) => setFilter("organizationType", value)}
                          options={organizationTypeLabels}
                        />
                      )}
                    </Field>
                    <Field label="互动状态">
                      {() => (
                        <FilterControl
                          label="互动状态"
                          value={filters.engagementState || ""}
                          onChange={(value) => setFilter("engagementState", value)}
                          options={engagementLabels}
                        />
                      )}
                    </Field>
                    <Field label="行业">
                      {(fieldId) => (
                        <Input id={fieldId} value={filters.industry || ""} onChange={(event) => setFilter("industry", event.target.value)} />
                      )}
                    </Field>
                  </FilterPopover>
                  {Object.values(filters).some(Boolean) && (
                    <Button variant="ghost" onClick={() => { setFilters({}); setKeyword(""); setPage(1); }}>
                      清除筛选
                    </Button>
                  )}
                </>
              }
            />
          )}
          {batchError && <p role="alert" className="text-sm text-destructive">{batchError}</p>}
        </>
      ) : detail.loading ? (
        <LoadingSkeleton detail />
      ) : detail.error || !organization ? (
        <ErrorState error={detail.error} retry={detail.reload} />
      ) : (
        <DetailScaffold
          top={
            <div className="crm-organization-detail-top">
              <div className="crm-organization-detail-heading">
                <a className="crm-detail-back-button" href={`#${targetFamily}`} aria-label="返回组织列表"><ArrowLeft /></a>
                <EntityHeader
                  icon={<CompanyLogo organization={organization} large />}
                  title={organization.name}
                  meta={
                    <>
                      <span>{organization.shortName || organization.industry || "组织"}</span>
                      <span>{organizationTypeLabels[organization.organizationType] || "其他"}</span>
                      <span>{businessRelationText(organization.roleKeys)}</span>
                      <SystemIdField value={organization.id} label="组织 ID" />
                    </>
                  }
                  actions={<RowActions label={organization.name} triggerLabel="操作" items={detailActions} />}
                />
              </div>
              <SummaryStrip
                items={[
                  { label: "联系人", value: organization.contactCount },
                  { label: "线索", value: organization.marketingLeadCount || 0 },
                  { label: "商机", value: organization.leads.length },
                  { label: "最近互动", value: relativeDate(organization.lastInteractionAt), detail: dateTime(organization.lastInteractionAt) },
                ]}
              />
            </div>
          }
          sidebar={
            <>
              <Section title="组织信息">
                <EntityMeta
                  items={[
                    { label: "组织", value: organization.name },
                    { label: "组织类型", value: organizationTypeLabels[organization.organizationType] || "其他" },
                    { label: "组织关系", value: businessRelationText(organization.roleKeys) },
                    { label: "行业", value: organization.industryCustom || organization.industry },
                    { label: "地址", value: [organization.country, organization.region, organization.city, organization.district, organization.street].filter(Boolean).join(" · ") },
                    { label: "网站", value: organization.website },
                    { label: "负责人", value: organization.owner?.name },
                  ]}
                />
              </Section>
              <ContactModule rows={organization.contacts} onCreate={can(me, "crm.contact.create") ? () => setEntityCreate("contact") : undefined} />
              <MarketingLeadModule rows={organization.marketingLeads || []} onCreate={can(me, "crm.marketing_lead.create") ? () => setMarketingLeadCreate(true) : undefined} />
            </>
          }
        >
          <DetailTabs
            value={tab}
            onChange={setTab}
            items={[
              ["opportunities", `商机 ${organization.leads.length}`],
              ["overview", "概览"],
              ["journey", "客户旅程"],
              ["notes", "备注"],
              ...(can(me, "audit.view") ? [["audit", "操作记录"] as [string, string]] : []),
            ]}
          >
            {tab === "opportunities" && (
              <DataTable
                label="组织商机"
                columns={opportunityColumns}
                rows={organization.leads}
                emptyTitle="暂无商机"
                showColumnControl={false}
                primaryAction={can(me, "crm.lead.create") && can(me, "crm.contact.view") && (
                  <Button onClick={() => setEntityCreate("lead")}><Plus />新增商机</Button>
                )}
              />
            )}
            {tab === "overview" && (
              <Section title="组织概览">
                <EntityMeta items={[
                  { label: "组织简称", value: organization.shortName },
                  { label: "联系人", value: organization.contactCount },
                  { label: "线索", value: organization.marketingLeadCount || 0 },
                  { label: "商机", value: organization.leads.length },
                  { label: "最近互动", value: dateTime(organization.lastInteractionAt) },
                  { label: "更新时间", value: dateTime(organization.updatedAt) },
                ]} />
              </Section>
            )}
            {tab === "journey" && (
              <Section title="客户旅程">
                {journey.loading ? <LoadingSkeleton /> : journey.error ? <ErrorState error={journey.error} retry={journey.reload} /> : <Timeline events={journey.data?.data.events || []} />}
              </Section>
            )}
            {tab === "notes" && (
              <Section title="备注" action={can(me, "crm.organization.edit") ? (
                <Button size="sm" variant="ghost" onClick={() => setEdit(organization)}>编辑</Button>
              ) : undefined}>
                <p className="whitespace-pre-wrap text-sm leading-6">{organization.note || "暂无备注"}</p>
              </Section>
            )}
            {tab === "audit" && <OrganizationAudit id={organization.id} />}
          </DetailTabs>
        </DetailScaffold>
      )}

      {edit && (
        <OrganizationForm
          organization={edit === "new" ? undefined : edit}
          defaultRole={supplier ? "VENDOR" : "PROSPECT"}
          me={me}
          users={users}
          onClose={() => setEdit(null)}
          onSaved={(row) => { setEdit(null); refresh(); location.hash = `organizations/${row.id}`; }}
        />
      )}
      {deleting && (
        <ConfirmDeleteDialog
          name={deleting.name}
          description="执行软删除；存在联系人或活跃商机时，系统会阻止删除。"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await crmApi(`/api/v1/crm/organizations/${deleting.id}`, { method: "DELETE" });
            refresh();
            if (id) location.hash = "organizations";
          }}
        />
      )}
      {entityCreate && organization && (
        <EntityForm
          kind={entityCreate}
          organization={organization}
          me={me}
          users={users}
          onClose={() => setEntityCreate(null)}
          onSaved={() => { setEntityCreate(null); refresh(); }}
        />
      )}
      {marketingLeadCreate && organization && (
        <MarketingLeadForm
          users={users}
          initialValues={{
            companyName: organization.name,
            companyWebsite: organization.website || "",
            industry: organization.industryCustom || organization.industry || "",
            countryCode: organization.countryCode || "",
            region: organization.region || "",
            city: organization.city || "",
          }}
          onClose={() => setMarketingLeadCreate(false)}
          onSaved={(row) => { setMarketingLeadCreate(false); refresh(); location.hash = `marketing-leads/${row.id}`; }}
        />
      )}
      {followupTarget && (
        <FollowupForm target={followupTarget} me={me} users={users} onClose={() => setFollowupTarget(null)} onSaved={refresh} />
      )}
    </PageContent>
  );
}

function ContactModule({ rows, onCreate }: { rows: Contact[]; onCreate?: () => void }) {
  return (
    <Section
      title={`联系人 ${rows.length}`}
      action={onCreate ? <Button variant="ghost" size="sm" onClick={onCreate}><Plus />新增</Button> : undefined}
    >
      {rows.length ? (
        <div className="divide-y">
          {rows.slice(0, 6).map((row) => (
            <a key={row.id} href={`#contacts/${row.id}`} className="flex items-center justify-between gap-3 py-3 hover:underline">
              <UserAvatar name={row.contactName} />
              <span className="truncate text-xs text-muted-foreground">{row.title || row.email || "—"}</span>
            </a>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">暂无联系人</p>}
    </Section>
  );
}

function MarketingLeadModule({ rows, onCreate }: { rows: MarketingLead[]; onCreate?: () => void }) {
  return (
    <Section
      title={`线索 ${rows.length}`}
      action={onCreate ? <Button variant="ghost" size="sm" onClick={onCreate}><Plus />新增</Button> : undefined}
    >
      {rows.length ? (
        <div className="divide-y">
          {rows.slice(0, 6).map((row) => (
            <a key={row.id} href={`#marketing-leads/${row.id}`} className="flex items-center justify-between gap-3 py-3 hover:underline">
              <span className="truncate text-sm font-medium">{row.fullName}</span>
              <StatusBadge>{marketingLeadStatusLabels[row.status] || "未知"}</StatusBadge>
            </a>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">暂无已关联线索</p>}
    </Section>
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
  const rows = result.data?.data.filter((row) => row.targetId === id || row.details?.organizationId === id) || [];
  return (
    <Section title="操作记录">
      {result.error ? (
        <ErrorState error={result.error} retry={result.reload} />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">本组织的系统操作历史，业务互动请查看客户旅程。</p>
          {result.loading ? <LoadingSkeleton /> : rows.length ? rows.map((row) => (
            <div className="flex flex-wrap justify-between gap-3 border-b py-3 text-sm" key={row.id}>
              <span>{auditActionLabel(row.action)}</span>
              <span className="text-muted-foreground">{row.actorName} · {dateTime(row.createdAt)}</span>
            </div>
          )) : <EmptyState title="本页暂无相关操作记录" />}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page * 100 >= (result.data?.meta.total || 0)} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </>
      )}
    </Section>
  );
}
