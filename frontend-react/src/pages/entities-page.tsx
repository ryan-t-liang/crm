import { useCallback, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeft,
  Plus,
  Pencil,
  MessageSquare,
  BriefcaseBusiness,
} from "lucide-react";
import {
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/crm/data-table";
import { EntityForm, type EntityRecord } from "@/components/crm/entity-form";
import {
  FollowupForm,
  type FollowupTarget,
} from "@/components/crm/followup-form";
import { AttachmentList } from "@/components/crm/attachment-list";
import { Timeline } from "@/components/crm/timeline";
import { EntityAudit } from "@/components/crm/entity-audit";
import { ImportExport } from "@/components/crm/import-export";
import { marketingSourceChannelLabel, marketingSourceLabel } from "@/lib/product-language";
import {
  PageContent,
  PageHeader,
  EntityHeader,
  EntityMeta,
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
const leadStatuses = optionMap(LEAD_STATUSES),
  priorities = optionMap(LEAD_PRIORITIES);
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
    [followup, setFollowup] = useState<FollowupTarget | null>(null);
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
      summary: { recentInteractionAt?: string; nextFollowupAt?: string };
    };
  }>(kind === "contact" && id ? `${endpoint}/${id}/journey` : null);
  const change = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
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
    ...(can(me, `crm.${kind}.delete`)
      ? [{ label: "删除", destructive: true, onClick: () => setDeleting(r) }]
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
  const columns: ColumnDef<RecordRow>[] = [
    {
      id: "name",
      header: label,
      enableHiding: false,
      cell: ({ row: { original: r } }) => (
        <a
          href={`#${family}/${r.id}`}
          className="flex min-w-40 max-w-72 items-center gap-2.5 hover:underline"
        >
          {kind === "contact" && (
            <UserAvatar name={nameOf(r)} showName={false} />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{nameOf(r)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {kind === "contact"
                ? r.email || r.phone || "—"
                : r.contact?.contactName}
            </p>
          </div>
        </a>
      ),
    },
    {
      id: "company",
      header: "公司",
      cell: ({ row: { original: r } }) => {
        const c = kind === "contact" ? r : r.contact;
        return c?.organizationId ? (
          <a
            href={`#organizations/${c.organizationId}`}
            className="block max-w-44 truncate hover:underline"
          >
            {c.organization?.shortName ||
              c.organization?.name ||
              c.companyShortName ||
              c.companyName}
          </a>
        ) : (
          <span className="block max-w-44 truncate">
            {c?.companyShortName || c?.companyName || "—"}
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
            accessorKey: "title",
            header: "职位",
            cell: ({
              row: { original: r },
            }: {
              row: { original: RecordRow };
            }) => (
              <span className="block max-w-36 truncate">{r.title || "—"}</span>
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
    {
      id: "owner",
      header: "负责人",
      cell: ({ row: { original: r } }) => (
        <span className="whitespace-nowrap">
          {(kind === "contact" ? r.owner : r.salesOwner)?.name || "待分配"}
        </span>
      ),
    },
    {
      id: "next",
      header: "下次跟进",
      cell: ({ row: { original: r } }) => (
        <span className="whitespace-nowrap tabular-nums">
          {dateTime(r.nextFollowupAt)}
        </span>
      ),
    },
    ...(kind === "contact"
      ? [{ accessorKey: "relatedLeadCount", header: "商机数" }]
      : []),
    {
      id: "updated",
      header: "更新时间",
      cell: ({ row: { original: r } }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {dateTime(r.updatedAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "操作",
      enableHiding: false,
      cell: ({ row: { original: r } }) => (
        <RowActions label={nameOf(r)} items={actions(r)} />
      ),
    },
  ];
  return (
    <PageContent>
      {!id ? (
        <>
          <PageHeader
            title={kind === "contact" ? "联系人" : "商机"}
            description={`管理${label}信息与下一步行动`}
          />
          {list.error ? (
            <ErrorState error={list.error} retry={list.reload} />
          ) : (
            <DataTable
              label={`${label}目录`}
              columns={columns}
              rows={list.data?.data || []}
              page={page}
              total={list.data?.meta.total}
              onPage={setPage}
              loading={list.loading}
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
              tableActions={
                <ImportExport
                  kind={family}
                  me={me}
                  onChanged={refresh}
                  selectedIds={selectedIds}
                  filters={filters}
                />
              }
              primaryAction={
                canCreate ? (
                  <Button onClick={() => setForm({ kind })}>
                    <Plus />
                    新增{label}
                  </Button>
                ) : undefined
              }
              toolbar={
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      change("keyword", search);
                    }}
                  >
                    <SearchInput
                      value={search}
                      onChange={setSearch}
                      placeholder={`搜索${label}、公司${kind === "contact" ? "、Email 或 Phone" : ""}`}
                    />
                    <button type="submit" className="sr-only">
                      搜索
                    </button>
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
                    label="负责人"
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
                      <Field label="公司">
                        {() => (
                          <EntityCombobox
                            label="筛选公司"
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
                    {kind === "contact" ? (
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
                        <Input
                          id={fieldId}
                          type="date"
                          onChange={(e) =>
                            change(
                              "nextFollowupFrom",
                              e.target.value
                                ? new Date(
                                    `${e.target.value}T00:00:00`,
                                  ).toISOString()
                                : "",
                            )
                          }
                        />
                      )}
                    </Field>
                    <Field label="下次跟进至">
                      {(fieldId) => (
                        <Input
                          id={fieldId}
                          type="date"
                          onChange={(e) =>
                            change(
                              "nextFollowupTo",
                              e.target.value
                                ? new Date(
                                    `${e.target.value}T23:59:59.999`,
                                  ).toISOString()
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
                      setSearch("");
                      setOrganizationLabel("");
                      setPage(1);
                    }}
                  >
                    重置
                  </Button>
                </>
              }
            />
          )}
          {batchError && (
            <p role="alert" className="text-sm text-destructive">
              {batchError}
            </p>
          )}
        </>
      ) : detail.error ? (
        <ErrorState error={detail.error} retry={detail.reload} />
      ) : !row ? (
        <LoadingSkeleton detail />
      ) : (
        <>
          <a
            className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            href={`#${family}`}
          >
            <ArrowLeft className="size-3" />
            返回{label}列表
          </a>
          <EntityHeader
            icon={
              kind === "contact" ? (
                <UserAvatar name={nameOf(row)} large showName={false} />
              ) : (
                <div className="rounded-lg border p-2.5">
                  <BriefcaseBusiness className="size-5" />
                </div>
              )
            }
            title={nameOf(row)}
            meta={
              <>
                <StatusBadge>
                  {kind === "contact"
                    ? row.contactType === "INDIVIDUAL"
                      ? "个人联系人"
                      : "企业联系人"
                    : leadStatuses[row.status || ""]}
                </StatusBadge>
                <SystemIdField value={row.id} />
                {kind === "contact" ? (
                  <>
                    <span>{row.title || "未填写职位"}</span>
                    <span>{row.email || row.phone || "未填写联系方式"}</span>
                    {row.organizationId ? (
                      <a
                        href={`#organizations/${row.organizationId}`}
                        className="hover:underline"
                      >
                        {row.organization?.name || row.companyName}
                      </a>
                    ) : (
                      <span>{row.companyName || "未关联公司"}</span>
                    )}
                  </>
                ) : (
                  <>
                    <StatusBadge>{priorities[row.priority || ""]}</StatusBadge>
                    <span>销售：{row.salesOwner?.name || "待分配"}</span>
                    <a
                      className="hover:underline"
                      href={`#contacts/${row.contactId}`}
                    >
                      {row.contact?.contactName}
                    </a>
                    {row.contact?.organizationId && (
                      <a
                        className="hover:underline"
                        href={`#organizations/${row.contact.organizationId}`}
                      >
                        {row.contact.organization?.name ||
                          row.contact.companyName}
                      </a>
                    )}
                  </>
                )}
              </>
            }
            actions={
              <>
                {can(me, `crm.${kind}.edit`) && (
                  <Button
                    variant="outline"
                    onClick={() => setForm({ kind, record: row })}
                  >
                    <Pencil />
                    编辑
                  </Button>
                )}
                {canFollow && (
                  <Button variant="outline" onClick={() => follow(row)}>
                    <MessageSquare />
                    记录跟进
                  </Button>
                )}
                {kind === "contact" && can(me, "crm.lead.create") && (
                  <Button
                    onClick={() =>
                      setForm({
                        kind: "lead",
                        contact: { id: row.id, contactName: nameOf(row) },
                      })
                    }
                  >
                    <Plus />
                    创建商机
                  </Button>
                )}
                {can(me, `crm.${kind}.delete`) && (
                  <RowActions
                    label={nameOf(row)}
                    items={[
                      {
                        label: "删除",
                        destructive: true,
                        onClick: () => setDeleting(row),
                      },
                    ]}
                  />
                )}
              </>
            }
          />
          <SummaryStrip
            items={
              kind === "contact"
                ? [
                    { label: "负责人", value: row.owner?.name || "待分配" },
                    { label: "关联商机", value: row.relatedLeadCount ?? 0 },
                    {
                      label: "最近互动",
                      value: dateTime(
                        journey.data?.data.summary.recentInteractionAt,
                      ),
                    },
                    {
                      label: "下次跟进",
                      value: dateTime(
                        journey.data?.data.summary.nextFollowupAt,
                      ),
                    },
                  ]
                : [
                    {
                      label: "最新进展",
                      value: String(row.latestProgress || "暂无进展"),
                    },
                    { label: "下一步行动", value: row.nextAction || "待安排" },
                    { label: "下次跟进", value: dateTime(row.nextFollowupAt) },
                    { label: "最近沟通", value: dateTime(row.lastFollowupAt) },
                  ]
            }
          />
          {kind === "lead" && (
            <StagePath
              current={String(row.status || "NEW")}
              stages={[
                { key: "NEW", label: "新建" },
                { key: "QUALIFIED", label: "已确认" },
                { key: "SOLUTION", label: "方案" },
                { key: "QUOTATION", label: "报价" },
                { key: "WON", label: "成交" },
                ...(row.status === "LOST"
                  ? [{ key: "LOST", label: "丢失" }]
                  : []),
              ]}
            />
          )}
          {kind === "lead" && row.sourceMarketingLead && (
            <Section
              title="来源线索"
              action={
                <Button variant="outline" size="sm" asChild>
                  <a href={`#marketing-leads/${row.sourceMarketingLead.id}`}>查看原始线索</a>
                </Button>
              }
            >
              <EntityMeta
                items={[
                  {
                    label: "来源线索",
                    value: `${row.sourceMarketingLead.fullName}${row.sourceMarketingLead.companyName ? ` · ${row.sourceMarketingLead.companyName}` : ""}`,
                  },
                  {
                    label: "获客来源",
                    value: [
                      marketingSourceLabel(row.sourceMarketingLead.source),
                      marketingSourceChannelLabel(row.sourceMarketingLead.sourceChannel),
                      row.sourceMarketingLead.sourceDetail,
                    ]
                      .filter(Boolean)
                      .join(" / "),
                  },
                  {
                    label: "原始询盘",
                    value:
                      row.sourceMarketingLead.inquiryContent?.slice(0, 280) ||
                      "—",
                  },
                  {
                    label: "转商机时间",
                    value: dateTime(row.sourceMarketingLead.convertedAt),
                  },
                ]}
              />
            </Section>
          )}
          <div className="min-w-0">
            <DetailTabs
              value={tab}
              onChange={setTab}
              items={
                (kind === "contact"
                  ? [
                      ["overview", "概览"],
                      ["leads", "关联商机"],
                      ["journey", "客户旅程"],
                      ["notes", "备注与附件"],
                      ...(can(me, "audit.view")
                        ? [["audit", "操作记录"]]
                        : []),
                    ]
                  : [
                      ["requirement", "需求与方案"],
                      ["followups", "跟进记录"],
                      ...(can(me, "audit.view")
                        ? [["audit", "操作记录"]]
                        : []),
                    ]) as [string, string][]
              }
            >
              {tab === "overview" && kind === "contact" && (
                <div className="grid items-start gap-5 lg:grid-cols-2">
                <Section title="联系人资料">
                  <EntityMeta
                    items={[
                      { label: "Phone", value: row.phone },
                      { label: "Email", value: row.email },
                      { label: "微信", value: String(row.wechat || "") },
                      { label: "部门", value: String(row.department || "") },
                      { label: "来源", value: row.source },
                      {
                        label: "跟进注意",
                        value: String(row.followupAttention || ""),
                      },
                      {
                        label: "初始信息",
                        value: String(row.initialContext || ""),
                      },
                    ]}
                  />
                </Section>
                <Section title="公司资料">
                  <EntityMeta
                    items={[
                      {
                        label: "公司",
                        value: row.organizationId ? (
                          <a
                            href={`#organizations/${row.organizationId}`}
                            className="hover:underline"
                          >
                            {row.organization?.name || row.companyName}
                          </a>
                        ) : (
                          row.companyName
                        ),
                      },
                      { label: "网站", value: String(row.website || "") },
                      { label: "行业", value: String(row.industry || "") },
                      {
                        label: "地区",
                        value: [row.country, row.region, row.city]
                          .filter(Boolean)
                          .join(" · "),
                      },
                      { label: "LinkedIn", value: String(row.linkedin || "") },
                    ]}
                  />
                </Section>
                </div>
              )}
              {tab === "leads" &&
                kind === "contact" &&
                (can(me, "crm.lead.view") ? (
                  <ContactLeads id={row.id} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    当前账号没有查看商机的权限。
                  </p>
                ))}
              {tab === "journey" && kind === "contact" && (
                <Section title="客户旅程">
                  {journey.error ? (
                    <ErrorState error={journey.error} retry={journey.reload} />
                  ) : journey.loading ? (
                    <LoadingSkeleton />
                  ) : (
                    <Timeline
                      events={journey.data?.data.events || []}
                      contactId={row.id}
                      me={me}
                    />
                  )}
                </Section>
              )}
              {tab === "requirement" && kind === "lead" && (
                <LeadContent
                  row={row}
                  me={me}
                  reload={detail.reload}
                  users={users}
                />
              )}
              {tab === "followups" && kind === "lead" && (
                <LeadFollowups
                  id={row.id}
                  me={me}
                  key={`${row.id}-${row.updatedAt}`}
                />
              )}
              {tab === "notes" && kind === "contact" && (
                <Section title="备注与资料">
                  <p className="mb-5 whitespace-pre-wrap break-words text-sm leading-6">
                    {String(row.remark || "暂无备注")}
                  </p>
                  <AttachmentList
                    files={row.attachments || []}
                    endpoint={`${endpoint}/${row.id}`}
                    fieldKey="meetingMinutesFiles"
                    title="历史会议资料"
                    editable={can(me, "crm.contact.edit")}
                    onChanged={detail.reload}
                  />
                </Section>
              )}
              {tab === "audit" && can(me, "audit.view") && (
                <EntityAudit id={row.id} />
              )}
            </DetailTabs>
          </div>
        </>
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

function ContactLeads({ id }: { id: string }) {
  const [page, setPage] = useState(1),
    result = useResource<PageResult<Lead>>(
      `/api/v1/crm/contacts/${id}/leads?page=${page}&pageSize=20`,
    );
  if (result.error)
    return <ErrorState error={result.error} retry={result.reload} />;
  return (
    <DataTable
      label="关联商机"
      rows={result.data?.data || []}
      loading={result.loading}
      page={page}
      total={result.data?.meta.total}
      onPage={setPage}
      columns={[
        {
          id: "title",
          header: "项目需求",
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
          id: "status",
          header: "阶段",
          cell: ({ row }) => (
            <StatusBadge>{leadStatuses[row.original.status]}</StatusBadge>
          ),
        },
        {
          id: "owner",
          header: "销售负责人",
          cell: ({ row }) => row.original.salesOwner?.name || "—",
        },
        {
          id: "next",
          header: "下次跟进",
          cell: ({ row }) => dateTime(row.original.nextFollowupAt),
        },
      ]}
    />
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
      <div className="mt-4 flex justify-end gap-2">
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
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
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
