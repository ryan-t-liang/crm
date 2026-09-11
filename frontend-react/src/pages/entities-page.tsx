import { useCallback, useState } from "react";
import {
  IconBriefcaseStroked as BriefcaseBusiness,
  IconCommentStroked as MessageSquare,
  IconEditStroked as Pencil,
  IconPlus as Plus,
} from "@douyinfe/semi-icons";
import { Pagination } from "@douyinfe/semi-ui";
import {
  CONTACT_STAGES,
  LEAD_FIELDS,
  LEAD_STATUSES,
  LEAD_PRIORITIES,
  type FieldDefinition,
} from "../../../frontend/js/field-definitions.js";
import { crmApi, type SessionUser, type CrmUser } from "@/lib/api";
import {
  can,
  dateTime,
  friendlyError,
  queryString,
  useResource,
  type Contact,
  type Lead,
  type PageResult,
  type Organization,
  type JourneyEvent,
  type Attachment,
} from "@/lib/crm";
import { Button, DateInput, Input } from "@/components/crm/ui";
import { DataTable, type CrmColumnDef } from "@/components/crm/data-table";
import { ContactOverview } from "@/components/crm/contact-overview";
import {
  NextActionCell,
  OwnerCell,
  RelationCountCell,
  RelativeDateCell,
} from "@/components/crm/cells";
import { EntityForm, type EntityRecord } from "@/components/crm/entity-form";
import {
  FollowupForm,
  type FollowupTarget,
} from "@/components/crm/followup-form";
import { AttachmentList } from "@/components/crm/attachment-list";
import { Timeline } from "@/components/crm/timeline";
import { EntityAudit } from "@/components/crm/entity-audit";
import { ImportExport } from "@/components/crm/import-export";
import { TaskForm, type TaskTarget } from "@/components/crm/task-interactions";
import { marketingSourceChannelLabel, marketingSourceLabel } from "@/lib/product-language";
import {
  CRMActionMenu,
  CRMAssociationCard,
  CRMDescriptions,
  CRMEmptyState,
  CRMEntityCell,
  CRMFilterBar,
  CRMInlineStats,
  CRMPageHeader,
  CRMRecordHeader,
  CRMRecordListItem,
  CRMRecordTabs,
  CRMSystemInfoPopover,
} from "@/components/crm/interaction-patterns";
import { CRMListLayout, CRMRecordLayout } from "@/components/crm/layout";
import {
  PageContent,
  EntityMeta,
  ListMetrics,
  SummaryStrip,
  UserAvatar,
  DetailTabs,
  Section,
  RowActions,
  SearchInput,
  FilterControl,
  FilterPopover,
  Field,
  EntityCombobox,
  ConfirmDeleteDialog,
  ErrorState,
  LoadingSkeleton,
  StatusBadge,
  StagePath,
  SystemIdField,
} from "@/components/crm/primitives";

type RecordRow = EntityRecord & Partial<Contact & Lead>;
const optionMap = (options: { value: string; label: string }[]) =>
  Object.fromEntries(options.map((o) => [o.value, o.label]));
const contactStages = optionMap(CONTACT_STAGES),
  leadStatuses = optionMap(LEAD_STATUSES),
  priorities = optionMap(LEAD_PRIORITIES);
const contactTypeViews = [
  { key: "all", label: "全部联系人" },
  { key: "BUSINESS", label: "企业联系人" },
  { key: "INDIVIDUAL", label: "个人联系人" },
];
const opportunityStageViews = [
  { key: "all", label: "全部商机" },
  ...LEAD_STATUSES.map((stage) => ({ key: stage.value, label: stage.label })),
];
const postSalesOpportunityFields = new Set([
  "wonAt",
  "deliveryFollowupAt",
  "contractRenewalAt",
  "paymentReceivedAt",
]);
const nameOf = (r: RecordRow) =>
  String(r.contactName || r.requirementSummary || "记录");
const endpointOf = (kind: "contact" | "lead") =>
  `/api/v1/crm/${kind === "contact" ? "contacts" : "leads"}`;

export function EntitiesPage({
  kind,
  id,
  me,
  users,
}: {
  kind: "contact" | "lead";
  id?: string;
  me: SessionUser;
  users: CrmUser[];
}) {
  const family = kind === "contact" ? "contacts" : "leads",
    label = kind === "contact" ? "联系人" : "商机",
    endpoint = endpointOf(kind);
  const [filters, setFilters] = useState<Record<string, string>>({}),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [tab, setTab] = useState(kind === "contact" ? "overview" : "requirement"),
    [selectedIds, setSelectedIds] = useState<string[]>([]),
    [batchOwnerUserId, setBatchOwnerUserId] = useState(""),
    [batchBusy, setBatchBusy] = useState(false),
    [batchError, setBatchError] = useState("");
  const [form, setForm] = useState<{
      kind: "contact" | "lead";
      record?: EntityRecord;
      contact?: Pick<Contact, "id" | "contactName">;
    } | null>(null),
    [deleting, setDeleting] = useState<RecordRow | null>(null),
    [followup, setFollowup] = useState<FollowupTarget | null>(null),
    [task, setTask] = useState<TaskTarget | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState("");
  const list = useResource<PageResult<RecordRow>>(
    id
      ? null
      : `${endpoint}?${queryString({ ...filters, page, pageSize: 20 })}`,
  );
  const detail = useResource<{ data: RecordRow }>(
    id ? `${endpoint}/${id}` : null,
  );
  const row = detail.data?.data;
  const journey = useResource<{
    data: {
      events: JourneyEvent[];
      summary: {
        activeLeadCount?: number;
        wonLeadCount?: number;
        recentInteractionAt?: string;
        nextFollowupAt?: string;
      };
    };
  }>(kind === "contact" && id ? `${endpoint}/${id}/journey` : null);
  const change = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const clearFilters = () => {
    setFilters({});
    setSearch("");
    setOrganizationLabel("");
    setPage(1);
  };
  const activeContactFilters = kind === "contact" ? [
    ...(filters.keyword ? [{ key: "keyword", label: `搜索：${filters.keyword}`, onRemove: () => { change("keyword", ""); setSearch(""); } }] : []),
    ...(filters.contactType ? [{ key: "contactType", label: `类型：${filters.contactType === "INDIVIDUAL" ? "个人联系人" : "企业联系人"}`, onRemove: () => change("contactType", "") }] : []),
    ...(filters.ownerUserId ? [{ key: "ownerUserId", label: `负责人：${users.find((user) => user.id === filters.ownerUserId)?.name || "已选择"}`, onRemove: () => change("ownerUserId", "") }] : []),
    ...(filters.organizationId ? [{ key: "organizationId", label: `组织：${organizationLabel || "已选择"}`, onRemove: () => { change("organizationId", ""); setOrganizationLabel(""); } }] : []),
    ...(filters.source ? [{ key: "source", label: `来源：${filters.source}`, onRemove: () => change("source", "") }] : []),
    ...(filters.nextFollowupFrom ? [{ key: "nextFollowupFrom", label: "下次跟进：已设置起始日", onRemove: () => change("nextFollowupFrom", "") }] : []),
    ...(filters.nextFollowupTo ? [{ key: "nextFollowupTo", label: "下次跟进：已设置截止日", onRemove: () => change("nextFollowupTo", "") }] : []),
  ] : [];
  const refresh = () => {
    list.reload();
    detail.reload();
    journey.reload();
    window.dispatchEvent(new Event("crm:data-changed"));
  };
  const batchAssign = async () => {
    if (!batchOwnerUserId || !selectedIds.length) return;
    setBatchBusy(true);
    setBatchError("");
    try {
      await crmApi(`${endpoint}/batch-assign`, {
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
  };
  const follow = (r: RecordRow) =>
    setFollowup({ kind, id: r.id, label: nameOf(r) });
  const canFollow =
    can(me, `crm.${kind}_followup.create`) && can(me, "crm.task.create");
  const canCreate =
    can(me, `crm.${kind}.create`) &&
    (kind === "contact" || can(me, "crm.contact.view"));
  const actions = (r: RecordRow) => [
    {
      label: "查看详情",
      onClick: () => {
        window.location.hash = `${family}/${r.id}`;
      },
    },
    ...(can(me, `crm.${kind}.edit`)
      ? [
          {
            label: "编辑",
            onClick: () => {
              void crmApi<{ data: EntityRecord }>(`${endpoint}/${r.id}`)
                .then((response) => setForm({ kind, record: response.data }))
                .catch(() => {
                  window.location.hash = `${family}/${r.id}`;
                });
            },
          },
        ]
      : []),
    ...(canFollow ? [{ label: "记录跟进", onClick: () => follow(r) }] : []),
    ...(kind === "contact" && can(me, "crm.lead.create")
      ? [{ label: "新增商机", dividerBefore: true, onClick: () => setForm({ kind: "lead", contact: { id: r.id, contactName: nameOf(r) } }) }]
      : []),
    ...(kind === "contact" && can(me, "crm.task.create")
      ? [{ label: "创建任务", onClick: () => setTask({ contactId: r.id, label: nameOf(r) }) }]
      : []),
    ...(can(me, `crm.${kind}.delete`)
      ? [{ label: "删除", destructive: true, dividerBefore: true, onClick: () => setDeleting(r) }]
      : []),
  ];
  const organizationOptions = useCallback(
    async (keyword: string, signal: AbortSignal) => {
      const response = await crmApi<PageResult<Organization>>(
        `/api/v1/crm/organizations?${queryString({ keyword, pageSize: 20 })}`,
        { signal },
      );
      return response.data.map((o) => ({ id: o.id, label: o.name }));
    },
    [],
  );
  const columns: CrmColumnDef<RecordRow>[] = [
    {
      id: "name",
      header: label,
      enableHiding: false,
      cell: ({ row: { original: r } }) => kind === "contact" ? (
        <CRMEntityCell
          name={nameOf(r)}
          secondary={r.email || r.phone}
          href={`#contacts/${r.id}`}
        />
      ) : (
        <a href={`#${family}/${r.id}`} className="flex min-w-40 max-w-72 items-center gap-2.5 hover:underline">
          <div className="min-w-0">
            <p className="truncate font-medium">{nameOf(r)}</p>
            <p className="truncate text-xs text-muted-foreground">{r.contact?.contactName}</p>
          </div>
        </a>
      ),
    },
    {
      id: "company",
      header: "组织",
      cell: ({ row: { original: r } }) => {
        const c = kind === "contact" ? r : r.contact;
        return c?.organizationId ? (
          <div className="crm-contact-organization-cell">
            <a href={`#organizations/${c.organizationId}`}>
              {c.organization?.shortName || c.organization?.name || c.companyShortName || c.companyName}
            </a>
            {kind === "contact" && c.title ? <span>{c.title}</span> : null}
          </div>
        ) : (
          <span className="crm-contact-organization-empty">
            {c?.companyShortName || c?.companyName || "未关联组织"}
          </span>
        );
      },
    },
    ...(kind === "contact"
      ? [
          {
            id: "contactType",
            header: "联系人类型",
            cell: ({
              row: { original: r },
            }: {
              row: { original: RecordRow };
            }) => (
              <StatusBadge>
                {r.contactType === "INDIVIDUAL" ? "个人联系人" : "企业联系人"}
              </StatusBadge>
            ),
          },
          {
            accessorKey: "phone",
            header: "手机",
            cell: ({
              row: { original: r },
            }: {
              row: { original: RecordRow };
            }) => (
              <span className={r.phone ? "crm-contact-phone" : "crm-contact-phone is-empty"}>{r.phone || "—"}</span>
            ),
          },
        ]
      : [
          {
            id: "priority",
            header: "商机优先级",
            cell: ({
              row: { original: r },
            }: {
              row: { original: RecordRow };
            }) => (
              <StatusBadge>{priorities[r.priority || ""] || "—"}</StatusBadge>
            ),
          },
        ]),
    ...(kind === "lead"
      ? [
          {
            id: "stage",
            header: "商机阶段",
            cell: ({
              row: { original: r },
            }: {
              row: { original: RecordRow };
            }) => (
              <StatusBadge>{leadStatuses[r.status || ""] || "—"}</StatusBadge>
            ),
          },
        ]
      : []),
    ...(kind === "contact"
      ? [{
          accessorKey: "relatedLeadCount",
          header: "商机数",
          cell: ({ row: { original: r } }: { row: { original: RecordRow } }) => (
            <RelationCountCell
              count={r.relatedLeadCount}
              label="个商机"
              href={`#contacts/${r.id}`}
            />
          ),
        }]
      : []),
    {
      id: "owner",
      header: kind === "contact" ? "联系人负责人" : "商机负责人",
      cell: ({ row: { original: r } }) => (
        <OwnerCell name={(kind === "contact" ? r.owner : r.salesOwner)?.name} />
      ),
    },
    {
      id: "next",
      header: kind === "contact" ? "最近互动" : "下一步行动",
      cell: ({ row: { original: r } }) => kind === "contact" ? (
        <RelativeDateCell value={r.lastFollowupAt} emptyLabel="暂无互动" />
      ) : (
        <NextActionCell
          title={r.nextAction}
          date={r.nextFollowupAt}
          overdue={Boolean(r.nextFollowupAt && Date.parse(r.nextFollowupAt) < Date.now())}
        />
      ),
    },
    {
      id: "updated",
      header: "更新时间",
      cell: ({ row: { original: r } }) => <RelativeDateCell value={r.updatedAt} />,
    },
    {
      id: "actions",
      header: "操作",
      enableHiding: false,
      cell: ({ row: { original: r } }) => (
        kind === "contact"
          ? <CRMActionMenu label={nameOf(r)} items={actions(r)} />
          : <RowActions label={nameOf(r)} items={actions(r)} />
      ),
    },
  ];
  return (
    <PageContent
      detail={!!id}
      mode={id ? "record" : "list"}
      breadcrumbs={[
        { label: "Kivisense CRM", href: "#dashboard" },
        { label, href: id ? `#${family}` : undefined },
        ...(id ? [{ label: row ? nameOf(row) : "详情" }] : []),
      ]}
    >
      {!id ? (
        <CRMListLayout
          className={kind === "contact" ? "crm-list-layout--contact" : "crm-list-layout--opportunity"}
          header={
            <CRMPageHeader
              title={label}
              description={kind === "contact" ? "管理客户、合作伙伴及其他业务联系人的信息与关系。" : "管理商机信息与下一步行动。"}
              actions={(
                <>
                  <ImportExport kind={family} me={me} onChanged={refresh} selectedIds={selectedIds} filters={filters} />
                  {canCreate ? <Button onClick={() => setForm({ kind })}><Plus />新增{label}</Button> : null}
                </>
              )}
            />
          }
          stats={kind === "contact" ? (
            <CRMInlineStats
              label="联系人列表统计"
              items={[
                { label: "位联系人", value: list.data?.meta.total ?? "—" },
                {
                  label: "位本页企业联系人",
                  value: (list.data?.data || []).filter((item) => item.contactType === "BUSINESS").length,
                },
                {
                  label: "位本页有商机",
                  value: (list.data?.data || []).filter((item) => Number(item.relatedLeadCount || 0) > 0).length,
                },
                {
                  label: "位本页待跟进",
                  value: (list.data?.data || []).filter((item) => !!item.nextFollowupAt).length,
                },
              ]}
            />
          ) : (
            <ListMetrics
              items={
                [
                    { label: "商机总数", value: list.data?.meta.total ?? "—" },
                    {
                      label: "本页进行中",
                      value: (list.data?.data || []).filter((item) => !["WON", "LOST"].includes(item.status || "")).length,
                    },
                    {
                      label: "本页已分配负责人",
                      value: (list.data?.data || []).filter((item) => !!item.salesOwner).length,
                    },
                  ]
              }
            />
          )}
        >
          {list.error ? (
            <ErrorState error={list.error} retry={list.reload} />
          ) : (
            <DataTable
              label={`${label}目录`}
              columns={columns}
              rows={list.data?.data || []}
              views={kind === "contact" ? contactTypeViews : opportunityStageViews}
              activeView={filters[kind === "contact" ? "contactType" : "status"] || "all"}
              onViewChange={(view) => {
                change(
                  kind === "contact" ? "contactType" : "status",
                  view === "all" ? "" : view,
                );
                setSelectedIds([]);
              }}
              page={page}
              total={list.data?.meta.total}
              onPage={setPage}
              loading={list.loading}
              flat={kind === "contact"}
              emptyTitle={kind === "contact" ? "暂无联系人" : undefined}
              emptyDescription={kind === "contact" ? "当前范围内还没有联系人。调整筛选条件，或新增第一位联系人。" : undefined}
              selectable={can(me, `crm.${kind}.edit`)}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              selectionActions={
                <>
                  <FilterControl
                    label="批量分配负责人"
                    value={batchOwnerUserId || "unassigned"}
                    all={false}
                    options={{
                      unassigned: "选择负责人",
                      ...Object.fromEntries(users.map((u) => [u.id, u.name])),
                    }}
                    onChange={(value) =>
                      setBatchOwnerUserId(
                        value === "unassigned" ? "" : value,
                      )
                    }
                  />
                  <Button
                    size="sm"
                    disabled={!batchOwnerUserId || batchBusy}
                    onClick={() => void batchAssign()}
                  >
                    {batchBusy ? "分配中…" : "批量分配"}
                  </Button>
                  <ImportExport kind={family} me={me} onChanged={refresh} selectedIds={selectedIds} filters={filters} exportOnly />
                </>
              }
              toolbar={
                <CRMFilterBar
                  activeFilters={activeContactFilters}
                  onClear={kind === "contact" ? clearFilters : undefined}
                >
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      change("keyword", search);
                    }}
                  >
                    <SearchInput
                      value={search}
                      onChange={setSearch}
                      placeholder={`搜索${label}、组织${kind === "contact" ? "、Email 或电话" : ""}`}
                    />
                    <Button type="submit" className="sr-only">
                      搜索
                    </Button>
                  </form>
                  {kind === "contact" ? (
                    <FilterControl
                      label="联系人类型"
                      value={filters.contactType || "all"}
                      options={{ BUSINESS: "企业联系人", INDIVIDUAL: "个人联系人" }}
                      onChange={(v) => change("contactType", v)}
                    />
                  ) : (
                    <FilterControl
                      label="商机阶段"
                      value={filters.status || "all"}
                      options={leadStatuses}
                      onChange={(v) => change("status", v)}
                    />
                  )}
                  <FilterControl
                    label={kind === "contact" ? "联系人负责人" : "商机负责人"}
                    value={
                      filters[
                        kind === "contact" ? "ownerUserId" : "salesOwnerUserId"
                      ] || "all"
                    }
                    options={Object.fromEntries(
                      users.map((u) => [u.id, u.name]),
                    )}
                    onChange={(v) =>
                      change(
                        kind === "contact" ? "ownerUserId" : "salesOwnerUserId",
                        v,
                      )
                    }
                  />
                  {kind === "lead" && (
                    <FilterControl
                      label="商机优先级"
                      value={filters.priority || "all"}
                      options={priorities}
                      onChange={(v) => change("priority", v)}
                    />
                  )}
                  <FilterPopover
                    active={
                      !!Object.entries(filters).filter(
                        ([k, v]) =>
                          [
                            "organizationId",
                            "source",
                            "nextFollowupFrom",
                            "nextFollowupTo",
                            "followupOwnerUserId",
                          ].includes(k) &&
                          v &&
                          v !== "all",
                      ).length
                    }
                  >
                    {can(me, "crm.organization.view") && (
                      <Field label="组织">
                        {() => (
                          <EntityCombobox
                            label="筛选组织"
                            value={filters.organizationId || ""}
                            selectedLabel={organizationLabel}
                            load={organizationOptions}
                            onChange={(v, label) => {
                              change("organizationId", v);
                              setOrganizationLabel(label);
                            }}
                          />
                        )}
                      </Field>
                    )}
                    {(kind as string) === "contact" ? (
                      <Field label="来源">
                        {(fieldId) => (
                          <Input
                            id={fieldId}
                            value={filters.source || ""}
                            onChange={(e) => change("source", e.target.value)}
                          />
                        )}
                      </Field>
                    ) : (
                      <FilterControl
                        label="跟进对接人"
                        value={filters.followupOwnerUserId || "all"}
                        options={Object.fromEntries(
                          users.map((u) => [u.id, u.name]),
                        )}
                        onChange={(v) => change("followupOwnerUserId", v)}
                      />
                    )}
                    <Field label="下次跟进自">
                      {(fieldId) => (
                        <DateInput
                          id={fieldId}
                          onValueChange={(value) =>
                            change(
                              "nextFollowupFrom",
                              value
                                ? new Date(`${value}T00:00:00`).toISOString()
                                : "",
                            )
                          }
                        />
                      )}
                    </Field>
                    <Field label="下次跟进至">
                      {(fieldId) => (
                        <DateInput
                          id={fieldId}
                          onValueChange={(value) =>
                            change(
                              "nextFollowupTo",
                              value
                                ? new Date(`${value}T23:59:59.999`).toISOString()
                                : "",
                            )
                          }
                        />
                      )}
                    </Field>
                  </FilterPopover>
                  {kind === "lead" ? (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>重置</Button>
                  ) : null}
                </CRMFilterBar>
              }
            />
          )}
          {batchError && (
            <p role="alert" className="text-sm text-destructive">
              {batchError}
            </p>
          )}
        </CRMListLayout>
      ) : detail.error ? (
        <ErrorState error={detail.error} retry={detail.reload} />
      ) : !row ? (
        <LoadingSkeleton detail />
      ) : (
        <CRMRecordLayout
          className={kind === "contact" ? "crm-record-layout--contact" : "crm-record-layout--opportunity"}
          header={kind === "contact" ? (
            <CRMRecordHeader
              name={nameOf(row)}
              subtitle={(
                <span className="crm-contact-header-subtitle">
                  <span>
                    {row.organizationId ? <a href={`#organizations/${row.organizationId}`}>{row.organization?.shortName || row.organization?.name || row.companyName}</a> : "未关联组织"}
                    {" · "}{row.title || "职位待补充"}
                  </span>
                  {row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : null}
                </span>
              )}
              tags={(
                <>
                  <StatusBadge>{row.contactType === "INDIVIDUAL" ? "个人联系人" : "企业联系人"}</StatusBadge>
                  {row.stage ? <StatusBadge>{contactStages[row.stage] || row.stage}</StatusBadge> : null}
                </>
              )}
              actions={(
                <>
                  {can(me, "crm.contact.edit") ? <Button variant="outline" onClick={() => setForm({ kind, record: row })}><Pencil />编辑</Button> : null}
                  {canFollow ? <Button variant="outline" onClick={() => follow(row)}><MessageSquare />记录跟进</Button> : null}
                  {can(me, "crm.lead.create") ? <Button onClick={() => setForm({ kind: "lead", contact: { id: row.id, contactName: nameOf(row) } })}><Plus />新增商机</Button> : null}
                  <CRMSystemInfoPopover
                    id={row.id}
                    createdAt={row.createdAt ? dateTime(String(row.createdAt)) : undefined}
                    updatedAt={row.updatedAt ? dateTime(row.updatedAt) : undefined}
                    createdBy={(row.createdBy as CrmUser | undefined)?.name}
                    updatedBy={(row.updatedBy as CrmUser | undefined)?.name}
                    footer={can(me, "crm.contact.delete") ? (
                      <Button variant="destructive" size="sm" onClick={() => setDeleting(row)}>删除联系人</Button>
                    ) : undefined}
                  />
                </>
              )}
            />
          ) : (
            <CRMRecordHeader
              identity={<div className="crm-detail-symbol"><BriefcaseBusiness /></div>}
              name={nameOf(row)}
              subtitle={<><span>销售：{row.salesOwner?.name || "待分配"}</span><a className="hover:underline" href={`#contacts/${row.contactId}`}>{row.contact?.contactName}</a></>}
              tags={<><StatusBadge>{leadStatuses[row.status || ""]}</StatusBadge><StatusBadge>{priorities[row.priority || ""]}</StatusBadge><SystemIdField value={row.id} label="商机 ID" /></>}
              actions={<>
                {can(me, `crm.${kind}.edit`) && <Button variant="outline" onClick={() => setForm({ kind, record: row })}><Pencil />编辑</Button>}
                {canFollow && <Button variant="outline" onClick={() => follow(row)}><MessageSquare />记录跟进</Button>}
                {can(me, `crm.${kind}.delete`) && <RowActions label={nameOf(row)} items={[{ label: "删除", destructive: true, onClick: () => setDeleting(row) }]} />}
              </>}
            />
          )}
          inlineMeta={kind === "contact" ? (
            <CRMInlineStats
              label="联系人关系摘要"
              items={[
                { label: "关联商机", value: row.relatedLeadCount ?? 0 },
                { label: "进行中商机", value: journey.data?.data.summary.activeLeadCount ?? 0 },
                { label: "最近互动", value: dateTime(journey.data?.data.summary.recentInteractionAt) },
                { label: "附件", value: row.attachments?.length ?? 0 },
              ]}
            />
          ) : (
            <SummaryStrip
              items={[
                { label: "最新进展", value: String(row.latestProgress || "暂无进展") },
                { label: "下一步行动", value: row.nextAction || "待安排" },
                { label: "下次跟进", value: dateTime(row.nextFollowupAt) },
                { label: "最近沟通", value: dateTime(row.lastFollowupAt) },
              ]}
            />
          )}
          stages={kind === "lead" ? (
            <StagePath current={String(row.status || "NEW")} stages={[
              { key: "NEW", label: "新建" },
              { key: "QUALIFIED", label: "已验证" },
              { key: "SOLUTION", label: "方案" },
              { key: "QUOTATION", label: "报价" },
              { key: "WON", label: "成交" },
              ...(row.status === "LOST" ? [{ key: "LOST", label: "丢失" }] : []),
            ]} />
          ) : undefined}
          sidebar={kind === "contact" ? (
            <div className="crm-contact-profile">
              <CRMDescriptions
                title="基本资料"
                items={[
                  { label: "类型", value: row.contactType === "INDIVIDUAL" ? "个人联系人" : "企业联系人" },
                  { label: "职位", value: row.title },
                  { label: "部门", value: String(row.department || "") },
                  { label: "负责人", value: row.owner?.name || "未分配" },
                  { label: "来源", value: row.source },
                  { label: "初始背景", value: String(row.initialContext || "") },
                  { label: "跟进关注", value: String(row.followupAttention || "") },
                ]}
              />
              <CRMDescriptions
                title="联系方式"
                items={[
                  { label: "Email", value: row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : undefined },
                  { label: "手机", value: row.phone ? <a href={`tel:${row.phone}`}>{row.phone}</a> : undefined },
                  { label: "微信", value: String(row.wechat || "") },
                  { label: "WhatsApp", value: row.whatsapp ? <a href={`https://wa.me/${String(row.whatsapp).replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{String(row.whatsapp)}</a> : undefined },
                  { label: "LinkedIn", value: row.linkedin ? <a href={String(row.linkedin)} target="_blank" rel="noreferrer">打开主页</a> : undefined },
                ]}
                emptyTitle="暂无联系方式"
                emptyDescription="可通过编辑联系人补充联系方式。"
                emptyAction={can(me, "crm.contact.edit") ? <Button variant="outline" size="sm" onClick={() => setForm({ kind, record: row })}>添加</Button> : undefined}
              />
              <CRMAssociationCard
                title="所属组织 / 业务关系"
                name={row.organization?.shortName || row.organization?.name || row.companyName}
                href={row.organizationId ? `#organizations/${row.organizationId}` : undefined}
                meta="当前组织"
                detail={row.title}
                emptyTitle="暂无关联组织"
                emptyDescription="关联组织后，可在联系人与组织之间快速查看业务关系。"
                emptyAction={can(me, "crm.contact.edit") ? <Button variant="outline" size="sm" onClick={() => setForm({ kind, record: row })}>关联组织</Button> : undefined}
              />
            </div>
          ) : (
            <>
              <>
                  <Section title="商机信息">
                    <EntityMeta items={[
                      { label: "商机阶段", value: leadStatuses[row.status || ""] },
                      { label: "优先级", value: priorities[row.priority || ""] },
                      { label: "商机负责人", value: row.salesOwner?.name || "待分配" },
                      { label: "关联联系人", value: row.contact?.contactName },
                    ]} />
                  </Section>
                  {row.sourceMarketingLead && (
                    <Section title="来源线索" action={<Button variant="outline" size="sm" onClick={() => { window.location.hash = `marketing-leads/${row.sourceMarketingLead?.id}`; }}>查看原始线索</Button>}>
                      <EntityMeta items={[
                        { label: "来源线索", value: `${row.sourceMarketingLead.fullName}${row.sourceMarketingLead.companyName ? ` · ${row.sourceMarketingLead.companyName}` : ""}` },
                        { label: "获客来源", value: [marketingSourceLabel(row.sourceMarketingLead.source), marketingSourceChannelLabel(row.sourceMarketingLead.sourceChannel), row.sourceMarketingLead.sourceDetail].filter(Boolean).join(" / ") },
                        { label: "原始询盘", value: row.sourceMarketingLead.inquiryContent?.slice(0, 280) || "—" },
                        { label: "转商机时间", value: dateTime(row.sourceMarketingLead.convertedAt) },
                      ]} />
                    </Section>
                  )}
                </>
            </>
          )}
        >
          {kind === "contact" ? <CRMRecordTabs
            value={tab}
            onChange={setTab}
            items={[
              ["overview", "概览"],
              ["leads", `关联商机 ${row.relatedLeadCount ?? 0}`],
              ["journey", "客户旅程"],
              ["notes", "备注与附件"],
              ...(can(me, "audit.view") ? [["audit", "操作记录"]] : []),
            ] as [string, string][]}
          >
            {tab === "overview" && (
              <ContactOverview
                contact={row}
                journey={journey.data?.data}
                journeyLoading={journey.loading}
                journeyError={journey.error}
                retryJourney={journey.reload}
                canViewOpportunities={can(me, "crm.lead.view")}
                onOpenJourney={() => setTab("journey")}
                onOpenOpportunities={() => setTab("leads")}
                onScheduleTask={can(me, "crm.task.create") ? () => setTask({ contactId: row.id, label: nameOf(row) }) : undefined}
              />
            )}
            {tab === "leads" && (can(me, "crm.lead.view") ? (
              <ContactLeads
                id={row.id}
                onCreate={can(me, "crm.lead.create") ? () => setForm({ kind: "lead", contact: { id: row.id, contactName: nameOf(row) } }) : undefined}
              />
            ) : <p className="text-sm text-muted-foreground">当前账号没有查看商机的权限。</p>)}
            {tab === "journey" && (
              <Section title="客户旅程">
                {journey.error ? <ErrorState error={journey.error} retry={journey.reload} /> : journey.loading ? <LoadingSkeleton /> : <Timeline events={journey.data?.data.events || []} contactId={row.id} me={me} />}
              </Section>
            )}
            {tab === "notes" && (
              <Section title="备注与资料">
                <p className="mb-5 whitespace-pre-wrap break-words text-sm leading-6">{String(row.remark || "暂无备注")}</p>
                <AttachmentList files={row.attachments || []} endpoint={`${endpoint}/${row.id}`} fieldKey="meetingMinutesFiles" title="历史会议资料" editable={can(me, "crm.contact.edit")} compact onChanged={detail.reload} />
              </Section>
            )}
            {tab === "audit" && can(me, "audit.view") ? <EntityAudit id={row.id} /> : null}
          </CRMRecordTabs> : <DetailTabs
            value={tab}
            onChange={setTab}
            items={[
              ["requirement", "需求与方案"],
              ["followups", "跟进记录"],
              ...(can(me, "audit.view") ? [["audit", "操作记录"]] : []),
            ] as [string, string][]}
          >
              {tab === "requirement" && (
                <LeadContent
                  row={row}
                  me={me}
                  reload={detail.reload}
                  users={users}
                />
              )}
              {tab === "followups" && (
                <LeadFollowups
                  id={row.id}
                  me={me}
                  key={`${row.id}-${row.updatedAt}`}
                />
              )}
              {tab === "audit" && can(me, "audit.view") && (
                <EntityAudit id={row.id} />
              )}
          </DetailTabs>
          }
        </CRMRecordLayout>
      )}
      {form && (
        <EntityForm
          kind={form.kind}
          record={form.record}
          contact={form.contact}
          me={me}
          users={users}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refresh();
          }}
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
      {task && (
        <TaskForm
          target={task}
          me={me}
          users={users}
          onClose={() => setTask(null)}
          onSaved={refresh}
        />
      )}
      {deleting && (
        <ConfirmDeleteDialog
          name={nameOf(deleting)}
          description={
            kind === "contact"
              ? "联系人将被软删除并移出正常列表，历史记录保留。如果仍有关联的未删除商机，请先处理这些商机。"
              : "商机将被软删除并从正常列表移除，历史旅程仍保留。"
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await crmApi(`${endpoint}/${deleting.id}`, { method: "DELETE" });
            setDeleting(null);
            refresh();
            if (id) window.location.hash = family;
          }}
        />
      )}
    </PageContent>
  );
}

function ContactLeads({ id, onCreate }: { id: string; onCreate?: () => void }) {
  const [page, setPage] = useState(1),
    result = useResource<PageResult<Lead>>(
      `/api/v1/crm/contacts/${id}/leads?page=${page}&pageSize=20`,
    );
  if (result.error)
    return <ErrorState error={result.error} retry={result.reload} />;
  if (result.loading) return <LoadingSkeleton />;
  const rows = result.data?.data || [];
  return (
    <Section
      title={`关联商机 ${result.data?.meta.total || 0}`}
      action={onCreate ? <Button size="sm" onClick={onCreate}><Plus />新增商机</Button> : undefined}
    >
      {rows.length ? (
        <div className="crm-pattern-record-list">
          {rows.map((opportunity) => (
            <CRMRecordListItem
              key={opportunity.id}
              title={opportunity.requirementSummary}
              href={`#leads/${opportunity.id}`}
              meta={<><StatusBadge>{leadStatuses[opportunity.status]}</StatusBadge><span>{priorities[opportunity.priority]}</span></>}
              detail={opportunity.nextAction || "下一步行动待安排"}
              aside={<><OwnerCell name={opportunity.salesOwner?.name} /><RelativeDateCell value={opportunity.updatedAt} /></>}
            />
          ))}
          {(result.data?.meta.total || 0) > 20 ? (
            <div className="crm-followup-pagination-wrap">
              <Pagination currentPage={page} total={result.data?.meta.total || 0} pageSize={20} showSizeChanger={false} onPageChange={setPage} />
            </div>
          ) : null}
        </div>
      ) : (
        <CRMEmptyState
          compact
          title="暂无关联商机"
          description="该联系人还没有进入正式商机阶段。"
        />
      )}
    </Section>
  );
}
type Followup = {
  id: string;
  occurredAt: string;
  type: string;
  content: string;
  progress?: string;
  nextAction?: string;
  nextFollowupAt?: string;
  owner?: CrmUser;
  important: boolean;
  attachments: Attachment[];
};
function LeadFollowups({ id, me }: { id: string; me: SessionUser }) {
  const [page, setPage] = useState(1),
    result = useResource<PageResult<Followup>>(
      can(me, "crm.lead_followup.view")
        ? `/api/v1/crm/leads/${id}/followups?page=${page}&pageSize=20`
        : null,
    );
  if (!can(me, "crm.lead_followup.view"))
    return (
      <p className="text-sm text-muted-foreground">
        当前账号没有查看跟进记录的权限。
      </p>
    );
  return result.error ? (
    <ErrorState error={result.error} retry={result.reload} />
  ) : (
    <Section title="跟进记录">
      {result.loading ? (
        <LoadingSkeleton />
      ) : (
        <div className="divide-y">
          {!result.data?.data.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              暂无跟进记录
            </p>
          )}
          {result.data?.data.map((f) => (
            <article key={f.id} className="space-y-4 py-5 first:pt-0">
              <div className="flex flex-wrap justify-between gap-3 text-sm">
                <span>
                  {f.owner?.name || "团队互动"}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ·{" "}
                    {(
                      {
                        GENERAL: "一般",
                        MEETING: "会议",
                        CALL: "电话",
                        EMAIL: "邮件",
                        WECHAT: "微信",
                        OTHER: "其他",
                      } as Record<string, string>
                    )[f.type] || f.type}
                  </span>
                  {f.important && <span className="ml-2 text-xs">· 重要</span>}
                </span>
                <time className="text-xs text-muted-foreground">
                  {dateTime(f.occurredAt)}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                {f.content}
              </p>
              {(f.progress || f.nextAction || f.nextFollowupAt) && (
                <EntityMeta
                  items={[
                    { label: "进展", value: f.progress },
                    { label: "下一步行动", value: f.nextAction },
                    { label: "下次跟进", value: dateTime(f.nextFollowupAt) },
                  ]}
                />
              )}
              <AttachmentList
                files={f.attachments || []}
                endpoint={`/api/v1/crm/leads/${id}/followups/${f.id}`}
                fieldKey="followupAttachments"
                title="本次跟进附件"
                editable={can(me, "crm.lead_followup.create")}
                onChanged={result.reload}
              />
            </article>
          ))}
        </div>
      )}
      <div className="crm-followup-pagination-wrap mt-4 flex justify-end">
        <Pagination
          className="crm-followup-pagination"
          currentPage={page}
          total={result.data?.meta.total || 0}
          pageSize={20}
          size="small"
          showSizeChanger={false}
          disabled={result.loading}
          onPageChange={setPage}
        />
      </div>
    </Section>
  );
}
function LeadContent({
  row,
  me,
  reload,
  users,
}: {
  row: RecordRow;
  me: SessionUser;
  reload: () => void;
  users: CrmUser[];
}) {
  const files: Record<string, { key: string; title: string; accept?: string }> =
    {
      requirementDetail: { key: "requirementFiles", title: "需求附件" },
      imageRequirementNote: {
        key: "requirementImages",
        title: "图片参考",
        accept: ".jpg,.jpeg,.png,.gif,.webp",
      },
      solution: { key: "proposalFiles", title: "正式方案" },
      quotationNote: {
        key: "quotationFiles",
        title: "报价文件",
        accept:
          ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt",
      },
    };
  const renderValue = (d: FieldDefinition) => {
    const value = row[d.key];
    if (d.type === "datetime-local") return dateTime(value as string);
    if (d.type === "user")
      return users.find((u) => u.id === value)?.name || "—";
    if (d.type === "multi-user")
      return (
        (row.participants as { user: CrmUser }[] | undefined)
          ?.map((p) => p.user.name)
          .join("、") || "—"
      );
    return (
      d.options?.find((o) => o.value === value)?.label || String(value || "—")
    );
  };
  return (
    <div className="crm-lead-content-grid grid items-start gap-5">
      <div className="space-y-5">
        {[
          ["requirement", "需求信息"],
          ["commercial", "方案与报价"],
        ].map(([tab, title]) => (
          <Section title={title} key={tab}>
            <div className="grid gap-5 sm:grid-cols-2">
              {LEAD_FIELDS.filter((d) => d.tab === tab).map((d) => (
                <div
                  key={d.key}
                  className={
                    d.wide
                      ? "min-w-0 space-y-3 sm:col-span-2"
                      : "min-w-0 space-y-2"
                  }
                >
                  <h3 className="text-xs text-muted-foreground">{d.label}</h3>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {renderValue(d)}
                  </p>
                  {files[d.key] && (
                    <AttachmentList
                      files={(row.attachments || []).filter(
                        (f) => f.fieldKey === files[d.key].key,
                      )}
                      endpoint={`/api/v1/crm/leads/${row.id}`}
                      fieldKey={files[d.key].key}
                      title={files[d.key].title}
                      accept={files[d.key].accept}
                      editable={can(me, "crm.lead.edit")}
                      onChanged={reload}
                    />
                  )}
                </div>
              ))}
            </div>
          </Section>
        ))}
      </div>
      <div className="space-y-5">
        {[
          ["basic", "基本信息"],
          ["team", "团队协作"],
        ].map(([tab, title]) => (
          <Section title={title} key={tab}>
            <EntityMeta
              items={LEAD_FIELDS.filter(
                (d) =>
                  d.tab === tab &&
                  !postSalesOpportunityFields.has(d.key) &&
                  !["remark", "requirementSummary"].includes(d.key),
              ).map((d) => ({ label: d.label, value: renderValue(d) }))}
            />
          </Section>
        ))}
        <Section title="内部备注">
          <p className="whitespace-pre-wrap break-words text-sm leading-6">
            {String(row.remark || "暂无备注")}
          </p>
        </Section>
      </div>
    </div>
  );
}
