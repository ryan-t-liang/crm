import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, CircleGauge, GitMerge, MessageSquarePlus, Pencil, Plus } from "lucide-react";

import { ImportExport } from "@/components/crm/import-export";
import { DataTable } from "@/components/crm/data-table";
import { EntityAudit } from "@/components/crm/entity-audit";
import {
  ConfirmDeleteDialog,
  DetailTabs,
  EntityHeader,
  EntityMeta,
  ErrorState,
  Field,
  focusFirstInvalidField,
  FormDialog,
  LoadingSkeleton,
  PageContent,
  PageHeader,
  RowActions,
  SearchInput,
  Section,
  StatusBadge,
  SystemIdField,
  SummaryStrip,
  UserAvatar,
  FilterControl,
} from "@/components/crm/primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, crmApi, type CrmUser, type SessionUser } from "@/lib/api";
import { marketingActivitySourceLabel, marketingSourceChannelLabel, marketingSourceChannelLabels, marketingSourceLabels } from "@/lib/product-language";
import {
  can,
  dateTime,
  friendlyError,
  levelLabels as opportunityPriorityLabels,
  queryString,
  stageLabels as opportunityStageLabels,
  useResource,
  type LeadScoringRule,
  type MarketingLead,
  type MarketingLeadStatus,
  type PageResult,
} from "@/lib/crm";

const statusLabels: Record<MarketingLeadStatus, string> = {
  NEW: "新线索",
  NURTURING: "孵化中",
  MQL: "营销合格线索（MQL）",
  SQL: "销售合格线索（SQL）",
  QUALIFIED: "已确认机会",
  CONVERTED: "已转商机",
  RECYCLED: "重新培育",
  DISQUALIFIED: "无效 / 不跟进",
};

const sourceLabels = marketingSourceLabels;
const levelLabels: Record<string, string> = { LOW: "低", MEDIUM: "中", HIGH: "高", COLD: "低", WARM: "中", HOT: "高" };
const sourceChannelLabels = marketingSourceChannelLabels;

type LeadFormState = {
  fullName: string; email: string; phone: string; whatsapp: string; wechat: string; linkedinUrl: string;
  title: string; department: string; companyName: string; companyWebsite: string; companySize: string;
  industry: string; countryCode: string; region: string; city: string; inquiryType: string; inquiryContent: string;
  productInterest: string; requirementTags: string; budgetRange: string; note: string; source: string;
  sourceChannel: string; sourceDetail: string; ownerUserId: string;
};

function initialForm(lead?: MarketingLead): LeadFormState {
  return {
    fullName: lead?.fullName || "", email: lead?.email || "", phone: lead?.phone || "", whatsapp: lead?.whatsapp || "",
    wechat: lead?.wechat || "", linkedinUrl: lead?.linkedinUrl || "", title: lead?.title || "", department: lead?.department || "",
    companyName: lead?.companyName || "", companyWebsite: lead?.companyWebsite || "", companySize: lead?.companySize || "",
    industry: lead?.industry || "", countryCode: lead?.countryCode || "", region: lead?.region || "", city: lead?.city || "",
    inquiryType: lead?.inquiryType || "", inquiryContent: lead?.inquiryContent || "", productInterest: lead?.productInterest || "",
    requirementTags: lead?.requirementTags?.join("，") || "", budgetRange: lead?.budgetRange || "", note: lead?.note || "",
    source: lead?.source || "MANUAL", sourceChannel: lead?.sourceChannel || "", sourceDetail: lead?.sourceDetail || "",
    ownerUserId: lead?.ownerUserId || "",
  };
}

function nullable(value: string) {
  return value.trim() || null;
}

function MarketingLeadForm({ lead, users, onClose, onSaved }: { lead?: MarketingLead; users: CrmUser[]; onClose: () => void; onSaved: (lead: MarketingLead) => void }) {
  const [form, setForm] = useState(() => initialForm(lead));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("identity");
  const update = (key: keyof LeadFormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const fields = (keys: Array<[keyof LeadFormState, string, string?]>) => keys.map(([key, label, placeholder]) => (
    <Field key={key} label={label} required={key === "fullName"} error={fieldErrors[key]}>
      {(id) => <Input id={id} value={form[key]} placeholder={placeholder} aria-invalid={!!fieldErrors[key]} onChange={(event) => update(key, event.target.value)} />}
    </Field>
  ));
  async function save() {
    const clientErrors: Record<string, string> = {};
    if (!form.fullName.trim()) clientErrors.fullName = "请填写姓名";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) clientErrors.email = "请输入有效 Email";
    if (form.companyWebsite && !/^https?:\/\//i.test(form.companyWebsite)) clientErrors.companyWebsite = "请输入完整 http:// 或 https:// 地址";
    if (form.countryCode && !/^[A-Za-z]{2}$/.test(form.countryCode)) clientErrors.countryCode = "请输入 ISO 两位国家或地区代码";
    setFieldErrors(clientErrors);
    if (Object.keys(clientErrors).length) {
      setTab(Object.keys(clientErrors).some((key) => ["source", "sourceChannel", "sourceDetail", "ownerUserId"].includes(key)) ? "qualification" : "identity");
      setError("请检查标记字段。");
      focusFirstInvalidField();
      return;
    }
    setBusy(true); setError(""); setFieldErrors({});
    const payload = {
      fullName: form.fullName.trim(), email: nullable(form.email), phone: nullable(form.phone), whatsapp: nullable(form.whatsapp),
      wechat: nullable(form.wechat), linkedinUrl: nullable(form.linkedinUrl), title: nullable(form.title), department: nullable(form.department),
      companyName: nullable(form.companyName), companyWebsite: nullable(form.companyWebsite), companySize: nullable(form.companySize),
      industry: nullable(form.industry), countryCode: nullable(form.countryCode)?.toUpperCase() || null, region: nullable(form.region), city: nullable(form.city),
      inquiryType: nullable(form.inquiryType), inquiryContent: nullable(form.inquiryContent), productInterest: nullable(form.productInterest),
      requirementTags: form.requirementTags.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean), budgetRange: nullable(form.budgetRange), note: nullable(form.note),
      source: form.source, sourceChannel: nullable(form.sourceChannel), sourceDetail: nullable(form.sourceDetail), ownerUserId: nullable(form.ownerUserId),
    };
    try {
      const response = await crmApi<{ data: MarketingLead }>(lead ? `/api/v1/crm/marketing-leads/${lead.id}` : "/api/v1/crm/marketing-leads", {
        method: lead ? "PATCH" : "POST", body: JSON.stringify(payload),
      });
      onSaved(response.data);
    } catch (caught) {
      if (caught instanceof ApiError && Array.isArray(caught.details)) {
        const errors = Object.fromEntries(caught.details.filter((item: { field?: string }) => item.field).map((item: { field: string; message: string }) => [item.field, item.message]));
        setFieldErrors(errors);
        const first = Object.keys(errors)[0];
        setTab(["source", "sourceChannel", "sourceDetail", "ownerUserId"].includes(first) ? "qualification" : ["inquiryType", "inquiryContent", "productInterest", "requirementTags", "budgetRange", "note"].includes(first) ? "inquiry" : "identity");
        focusFirstInvalidField();
      }
      setError(friendlyError(caught));
    } finally { setBusy(false); }
  }
  return (
    <FormDialog title={`${lead ? "编辑" : "新增"}线索`} description="线索保存获客来源、原始询盘和营销资格信息。" onClose={onClose} busy={busy} wide footer={<><Button variant="outline" onClick={onClose} disabled={busy}>取消</Button><Button onClick={() => void save()} disabled={busy}>{busy ? "保存中…" : "保存线索"}</Button></>}>
      <div className="space-y-5">
        <DetailTabs value={tab} onChange={setTab} items={[["identity", `身份与公司${Object.keys(fieldErrors).some((key) => !["source", "sourceChannel", "sourceDetail", "ownerUserId", "inquiryType", "inquiryContent", "productInterest", "requirementTags", "budgetRange", "note"].includes(key)) ? " · 有错误" : ""}`], ["inquiry", `询盘与来源${Object.keys(fieldErrors).some((key) => ["inquiryType", "inquiryContent", "productInterest", "requirementTags", "budgetRange", "note"].includes(key)) ? " · 有错误" : ""}`], ["qualification", `营销资格${Object.keys(fieldErrors).some((key) => ["source", "sourceChannel", "sourceDetail", "ownerUserId"].includes(key)) ? " · 有错误" : ""}`]]}>
        {tab === "identity" ? <div className="space-y-7"><FormSection title="身份信息"><div className="grid gap-4 sm:grid-cols-2">{fields([["fullName", "姓名"], ["email", "Email"], ["phone", "Phone", "+国家代码"], ["whatsapp", "WhatsApp", "+国家代码"], ["wechat", "WeChat"], ["linkedinUrl", "LinkedIn URL"], ["title", "职位"], ["department", "部门"]])}</div></FormSection><FormSection title="公司快照"><div className="grid gap-4 sm:grid-cols-2">{fields([["companyName", "公司"], ["companyWebsite", "公司网站"], ["companySize", "公司规模"], ["industry", "行业"], ["countryCode", "国家 / 地区代码", "ISO 两位代码，如 AE"], ["region", "州 / 省"], ["city", "城市"]])}</div></FormSection></div>
        : tab === "inquiry" ? <FormSection title="原始询盘"><div className="grid gap-4 sm:grid-cols-2">{fields([["inquiryType", "询盘类型"], ["productInterest", "产品兴趣"], ["requirementTags", "需求标签", "多个标签用逗号分隔"], ["budgetRange", "预算范围"]])}<Field label="询盘内容" error={fieldErrors.inquiryContent} wide>{(id) => <Textarea id={id} className="min-h-32" value={form.inquiryContent} aria-invalid={!!fieldErrors.inquiryContent} onChange={(event) => update("inquiryContent", event.target.value)} />}</Field><Field label="补充说明" error={fieldErrors.note} wide>{(id) => <Textarea id={id} value={form.note} aria-invalid={!!fieldErrors.note} onChange={(event) => update("note", event.target.value)} />}</Field></div></FormSection>
        : <FormSection title="来源与营销资格"><div className="grid gap-4 sm:grid-cols-2">
          <Field label="来源" required error={fieldErrors.source}>{() => <Select value={form.source} onValueChange={(value) => update("source", value)}><SelectTrigger aria-invalid={!!fieldErrors.source}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(sourceLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>}</Field>
          <Field label="来源渠道" error={fieldErrors.sourceChannel}>{() => <Select value={form.sourceChannel || "unassigned"} onValueChange={(value) => update("sourceChannel", value === "unassigned" ? "" : value)}><SelectTrigger aria-invalid={!!fieldErrors.sourceChannel}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">未选择</SelectItem>{Object.entries(sourceChannelLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>}</Field>
          {fields([["sourceDetail", "来源详情", "例如：Google / 秋季活动"]])}
          <Field label="负责人" error={fieldErrors.ownerUserId}>{() => <Select value={form.ownerUserId || "unassigned"} onValueChange={(value) => update("ownerUserId", value === "unassigned" ? "" : value)}><SelectTrigger aria-invalid={!!fieldErrors.ownerUserId}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">待分配</SelectItem>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select>}</Field>
          <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">新线索统一以“新线索”进入。线索匹配度与互动活跃度由评分规则计算，达到阈值后自动成为营销合格线索（MQL）。</div>
        </div></FormSection>}
        </DetailTabs>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </FormDialog>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-4 border-b pb-3 text-sm font-semibold">{title}</h3>{children}</section>;
}

function ActivityDialog({ lead, onClose, onSaved }: { lead: MarketingLead; onClose: () => void; onSaved: () => void }) {
  const [rules, setRules] = useState<LeadScoringRule[]>([]);
  const [ruleCode, setRuleCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void crmApi<{ data: LeadScoringRule[] }>("/api/v1/crm/marketing/scoring-rules").then((response) => { setRules(response.data); setRuleCode(response.data[0]?.code || ""); }).catch((caught) => setError(friendlyError(caught))); }, []);
  async function save() {
    setBusy(true); setError("");
    try { await crmApi(`/api/v1/crm/marketing-leads/${lead.id}/activities`, { method: "POST", body: JSON.stringify({ ruleCode, source: "CRM", note: nullable(note) }) }); onSaved(); }
    catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  }
  return <FormDialog title="记录行为" description={`${lead.fullName} · 由评分规则自动计算分值，销售不能手工输入加减分。`} onClose={onClose} busy={busy} footer={<><Button variant="outline" onClick={onClose}>取消</Button><Button disabled={!ruleCode || busy} onClick={() => void save()}>{busy ? "记录中…" : "记录行为"}</Button></>}>
    <div className="space-y-4"><Field label="行为" required>{() => <Select value={ruleCode} onValueChange={setRuleCode}><SelectTrigger><SelectValue placeholder="选择行为" /></SelectTrigger><SelectContent>{rules.map((rule) => <SelectItem key={rule.id} value={rule.code}>{rule.name}</SelectItem>)}</SelectContent></Select>}</Field><Field label="补充说明">{(id) => <Textarea id={id} value={note} onChange={(event) => setNote(event.target.value)} />}</Field>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>
  </FormDialog>;
}

type ConversionPreview = {
  lead: MarketingLead;
  organizationMatches: Array<{ id: string; name: string; shortName?: string; website?: string; matchType: string; autoMerge: false }>;
  contactMatches: Array<{ id: string; contactName: string; email?: string; phone?: string; organization?: { name: string }; matchType: string; autoMerge: false }>;
  suggestedOpportunity: { requirementSummary: string; requirementDetail?: string; requirementContext?: string; productInterest?: string; requirementTags: string[]; priority: string; status: string; salesOwnerUserId?: string };
};

const matchTypeLabels: Record<string, string> = {
  DOMAIN_EXACT: "网站域名完全匹配",
  NAME_EXACT: "公司名称完全匹配",
  NAME_SIMILAR: "公司名称相似，仅供确认",
  EMAIL_EXACT: "Email 完全匹配",
  PHONE_EXACT: "手机号完全匹配",
  WHATSAPP_EXACT: "WhatsApp 完全匹配",
  WECHAT_EXACT: "微信完全匹配",
  NAME_COMPANY_WARNING: "姓名与公司相似，仅供确认",
  NAME_WARNING: "姓名相似，仅供确认",
};

function ConvertDialog({ lead, me, users, onClose, onSaved }: { lead: MarketingLead; me: SessionUser; users: CrmUser[]; onClose: () => void; onSaved: (result: { opportunityId: string }) => void }) {
  const preview = useResource<{ data: ConversionPreview }>(`/api/v1/crm/marketing-leads/${lead.id}/conversion-preview`);
  const [organizationChoice, setOrganizationChoice] = useState("");
  const [contactChoice, setContactChoice] = useState("");
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState(lead.inquiryContent || "");
  const [priority, setPriority] = useState("MEDIUM");
  const [stage, setStage] = useState("NEW");
  const [owner, setOwner] = useState(lead.ownerUserId || me.id);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const data = preview.data?.data;
  useEffect(() => {
    if (!data) return;
    setOrganizationChoice((value) => value || (data.organizationMatches[0] ? `existing:${data.organizationMatches[0].id}` : lead.companyName ? "create" : "none"));
    setContactChoice((value) => value || (data.contactMatches[0] ? `existing:${data.contactMatches[0].id}` : "create"));
    setSummary((value) => value || data.suggestedOpportunity.requirementSummary);
  }, [data, lead.companyName]);
  async function convert() {
    if (!data || !summary.trim() || !owner) { setError("请完成公司、联系人和商机确认。"); return; }
    setBusy(true); setError("");
    const organization = organizationChoice.startsWith("existing:")
      ? { mode: "existing", id: organizationChoice.slice(9) }
      : organizationChoice === "create"
        ? { mode: "create", createData: { name: lead.companyName || `${lead.fullName} 的公司`, website: lead.companyWebsite || null, companySize: lead.companySize || null, industry: lead.industry || null, countryCode: lead.countryCode || null, region: lead.region || null, city: lead.city || null } }
        : { mode: "none" };
    const contact = contactChoice.startsWith("existing:")
      ? { mode: "existing", id: contactChoice.slice(9) }
      : { mode: "create", createData: { contactName: lead.fullName, email: lead.email || null, phone: lead.phone || null, whatsapp: lead.whatsapp || null, wechat: lead.wechat || null, linkedin: lead.linkedinUrl || null, title: lead.title || null, department: lead.department || null } };
    try {
      const response = await crmApi<{ data: { opportunityId: string } }>(`/api/v1/crm/marketing-leads/${lead.id}/convert`, { method: "POST", body: JSON.stringify({ organization, contact, opportunity: { requirementSummary: summary.trim(), requirementDetail: nullable(detail), requirementContext: lead.inquiryType || null, productInterest: lead.productInterest || null, requirementTags: lead.requirementTags || [], priority, status: stage, salesOwnerUserId: owner, followupOwnerUserId: owner, conversionNote: nullable(note) }, overrideQualification: false }) });
      onSaved(response.data);
    } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  }
  return <FormDialog title="线索转商机" description="匹配结果仅用于建议；必须在单一后端事务提交前明确选择，不会自动合并。" onClose={onClose} busy={busy} wide footer={<><Button variant="outline" onClick={onClose}>取消</Button><Button disabled={busy || !data} onClick={() => void convert()}>{busy ? "转换中…" : "确认转商机"}</Button></>}>
    {preview.loading ? <LoadingSkeleton detail /> : preview.error ? <ErrorState error={preview.error} retry={preview.reload} /> : data ? <div className="space-y-6">
      <FormSection title="公司"><Field label="公司处理方式" required>{() => <Select value={organizationChoice} onValueChange={setOrganizationChoice}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{data.organizationMatches.map((match) => <SelectItem key={match.id} value={`existing:${match.id}`}>使用已有公司 · {match.shortName || match.name} · {matchTypeLabels[match.matchType] || "需要人工确认"}</SelectItem>)}<SelectItem value="create">创建新公司 · {lead.companyName || "使用线索公司快照"}</SelectItem><SelectItem value="none">暂不关联公司</SelectItem></SelectContent></Select>}</Field>{data.organizationMatches.length ? <MatchList title="系统公司匹配" rows={data.organizationMatches.map((match) => ({ id: match.id, title: match.shortName || match.name, detail: `${match.website || "无网站"} · ${matchTypeLabels[match.matchType] || "需要人工确认"}` }))} /> : <p className="text-sm text-muted-foreground">未发现精确公司匹配。</p>}</FormSection>
      <FormSection title="联系人"><Field label="联系人处理方式" required>{() => <Select value={contactChoice} onValueChange={setContactChoice}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{data.contactMatches.map((match) => <SelectItem key={match.id} value={`existing:${match.id}`}>使用已有联系人 · {match.contactName} · {matchTypeLabels[match.matchType] || "需要人工确认"}</SelectItem>)}<SelectItem value="create">创建新联系人 · {lead.fullName}</SelectItem></SelectContent></Select>}</Field>{data.contactMatches.length ? <MatchList title="系统联系人匹配" rows={data.contactMatches.map((match) => ({ id: match.id, title: match.contactName, detail: `${match.email || match.phone || "无联系方式"} · ${matchTypeLabels[match.matchType] || "需要人工确认"}` }))} /> : <p className="text-sm text-muted-foreground">未发现精确联系人匹配。</p>}</FormSection>
      <FormSection title="商机"><div className="grid gap-4 sm:grid-cols-2"><Field label="商机名称 / 需求简述" required wide>{(id) => <Input id={id} value={summary} onChange={(event) => setSummary(event.target.value)} />}</Field><Field label="商机负责人" required>{() => <Select value={owner} onValueChange={setOwner}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select>}</Field><Field label="商机优先级">{() => <Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => <SelectItem key={value} value={value}>{opportunityPriorityLabels[value] || (value === "URGENT" ? "紧急" : "未知")}</SelectItem>)}</SelectContent></Select>}</Field><Field label="初始商机阶段">{() => <Select value={stage} onValueChange={setStage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["NEW", "QUALIFIED", "SOLUTION", "QUOTATION"].map((value) => <SelectItem key={value} value={value}>{opportunityStageLabels[value] || "未知"}</SelectItem>)}</SelectContent></Select>}</Field><Field label="需求详情" wide>{(id) => <Textarea id={id} className="min-h-32" value={detail} onChange={(event) => setDetail(event.target.value)} />}</Field><Field label="转换备注" wide>{(id) => <Textarea id={id} value={note} onChange={(event) => setNote(event.target.value)} />}</Field></div><Alert className="mt-4"><AlertTitle>原始询盘受保护</AlertTitle><AlertDescription>需求详情以原始询盘初始化，但后续修改商机不会改写线索的原始询盘。</AlertDescription></Alert></FormSection>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div> : null}
  </FormDialog>;
}

function MatchList({ title, rows }: { title: string; rows: Array<{ id: string; title: string; detail: string }> }) {
  return <div className="mt-3 rounded-lg border bg-muted/20 p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>{rows.slice(0, 3).map((row) => <div key={row.id} className="border-t py-2 first:border-0"><p className="text-sm font-medium">{row.title}</p><p className="text-xs text-muted-foreground">{row.detail}</p></div>)}</div>;
}

function TransitionDialog({ lead, action, onClose, onSaved }: { lead: MarketingLead; action: string; onClose: () => void; onSaved: () => void }) {
  const labels: Record<string, string> = { ACCEPT_SQL: "接受跟进", RECYCLE: "退回培育", DISQUALIFY: "判定无效" };
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const required = ["RECYCLE", "DISQUALIFY"].includes(action);
  async function save() { if (required && !reason.trim()) { setError("请填写原因。"); return; } setBusy(true); setError(""); try { await crmApi(`/api/v1/crm/marketing-leads/${lead.id}/transition`, { method: "POST", body: JSON.stringify({ action, reason: nullable(reason) }) }); onSaved(); } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); } }
  return <FormDialog title={labels[action] || "变更状态"} description={`${lead.fullName} · 当前状态：${statusLabels[lead.status]}`} onClose={onClose} busy={busy} footer={<><Button variant="outline" onClick={onClose}>取消</Button><Button onClick={() => void save()} disabled={busy}>{busy ? "保存中…" : "确认"}</Button></>}><Field label="说明" required={required}>{(id) => <Textarea id={id} value={reason} onChange={(event) => setReason(event.target.value)} />}</Field>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}</FormDialog>;
}

export function MarketingLeadsPage({ id, me, users }: { id?: string; me: SessionUser; users: CrmUser[] }) {
  const [filters, setFilters] = useState<Record<string, string>>({}); const [search, setSearch] = useState(""); const [page, setPage] = useState(1); const [tab, setTab] = useState("overview");
  const [formOpen, setFormOpen] = useState(false); const [activityOpen, setActivityOpen] = useState(false); const [conversionOpen, setConversionOpen] = useState(false); const [transition, setTransition] = useState<string | null>(null); const [deleting, setDeleting] = useState<MarketingLead | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]); const [batchOwnerUserId, setBatchOwnerUserId] = useState("");
  const list = useResource<PageResult<MarketingLead>>(id ? null : `/api/v1/crm/marketing-leads?${queryString({ ...filters, page, pageSize: 20 })}`);
  const detail = useResource<{ data: MarketingLead }>(id ? `/api/v1/crm/marketing-leads/${id}` : null);
  const lead = detail.data?.data;
  const journey = useMemo(() => lead ? [
    ...(lead.activities || []).map((item) => {
      const scoreText = item.fitDeltaSnapshot
        ? `线索匹配度 ${item.fitDeltaSnapshot > 0 ? "+" : ""}${item.fitDeltaSnapshot}`
        : `互动活跃度 ${item.engagementDeltaSnapshot >= 0 ? "+" : ""}${item.engagementDeltaSnapshot}`;
      return { id: item.id, at: item.occurredAt, title: item.scoringRule?.name || "其他行为", detail: `${marketingActivitySourceLabel(item.source)} · ${scoreText}${item.note ? ` · ${item.note}` : ""}` };
    }),
    ...(lead.statusHistory || []).map((item) => ({ id: item.id, at: item.changedAt, title: `${item.fromStatus ? statusLabels[item.fromStatus] : "创建"} → ${statusLabels[item.toStatus]}`, detail: item.reason || "状态变更" })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) : [], [lead]);
  const refresh = () => { list.reload(); detail.reload(); window.dispatchEvent(new Event("crm:data-changed")); };
  const actionsFor = (row: MarketingLead) => [{ label: "查看详情", onClick: () => { window.location.hash = `marketing-leads/${row.id}`; } }, ...(can(me, "crm.marketing_lead.edit") && row.status !== "CONVERTED" ? [{ label: "编辑", onClick: () => { window.location.hash = `marketing-leads/${row.id}`; setFormOpen(true); } }] : []), ...(can(me, "crm.marketing_lead.delete") ? [{ label: "删除", destructive: true, onClick: () => setDeleting(row) }] : [])];
  const columns: ColumnDef<MarketingLead>[] = [
    { id: "name", header: "姓名", enableHiding: false, cell: ({ row }) => <a href={`#marketing-leads/${row.original.id}`} className="flex min-w-44 items-center gap-2 hover:underline"><UserAvatar name={row.original.fullName} showName={false} /><span className="font-medium">{row.original.fullName}</span></a> },
    { accessorKey: "companyName", header: "公司", cell: ({ row }) => row.original.companyName || "—" },
    { id: "source", header: "来源", cell: ({ row }) => <span>{sourceLabels[row.original.source] || "其他"}{row.original.sourceChannel ? ` / ${marketingSourceChannelLabel(row.original.sourceChannel)}` : ""}</span> },
    { id: "status", header: "状态", cell: ({ row }) => <StatusBadge>{statusLabels[row.original.status]}</StatusBadge> },
    { id: "fit", header: "线索匹配度", cell: ({ row }) => <span className="tabular-nums">{row.original.fitScore} · {levelLabels[row.original.fitLevel]}</span> },
    { id: "engagement", header: "互动活跃度", cell: ({ row }) => <span className="tabular-nums">{row.original.engagementScoreCached} · {levelLabels[row.original.engagementLevel]}</span> },
    { id: "owner", header: "负责人", cell: ({ row }) => row.original.owner?.name || "待分配" },
    { id: "activity", header: "最近行为", cell: ({ row }) => dateTime(row.original.lastActivityAt) },
    { id: "createdAt", header: "创建时间", cell: ({ row }) => dateTime(row.original.createdAt) },
    { id: "actions", header: "操作", enableHiding: false, cell: ({ row }) => <RowActions label={row.original.fullName} items={actionsFor(row.original)} /> },
  ];
  if (!id) return <PageContent><PageHeader title="线索" description="管理获客来源、原始询盘、评分与资格确认。" />{list.error ? <ErrorState error={list.error} retry={list.reload} /> : <DataTable label="线索目录" columns={columns} rows={list.data?.data || []} total={list.data?.meta.total} page={page} onPage={setPage} loading={list.loading} selectable selectedIds={selectedIds} onSelectedIdsChange={setSelectedIds} selectionActions={<>{can(me, "crm.marketing_lead.assign") && <><FilterControl label="批量分配负责人" value={batchOwnerUserId || "unassigned"} all={false} options={{ unassigned: "选择负责人", ...Object.fromEntries(users.map((user) => [user.id, user.name])) }} onChange={(ownerUserId) => setBatchOwnerUserId(ownerUserId === "unassigned" ? "" : ownerUserId)} /><Button size="sm" disabled={!batchOwnerUserId} onClick={() => { void crmApi("/api/v1/crm/marketing-leads/batch-assign", { method: "POST", body: JSON.stringify({ ids: selectedIds, ownerUserId: batchOwnerUserId }) }).then(() => { setSelectedIds([]); refresh(); }); }}>批量分配</Button></>}<ImportExport kind="marketing-leads" me={me} onChanged={refresh} selectedIds={selectedIds} filters={filters} exportOnly /></>} toolbar={<><form onSubmit={(event) => { event.preventDefault(); setFilters((current) => ({ ...current, keyword: search })); setPage(1); }}><SearchInput value={search} onChange={setSearch} placeholder="搜索姓名、公司、Email、Phone 或询盘" /></form><FilterControl label="状态" value={filters.status || "all"} options={statusLabels} onChange={(value) => { setFilters((current) => ({ ...current, status: value })); setPage(1); }} /><FilterControl label="来源" value={filters.source || "all"} options={sourceLabels} onChange={(value) => { setFilters((current) => ({ ...current, source: value })); setPage(1); }} /><FilterControl label="负责人" value={filters.ownerUserId || "all"} options={Object.fromEntries(users.map((user) => [user.id, user.name]))} onChange={(value) => { setFilters((current) => ({ ...current, ownerUserId: value })); setPage(1); }} /></>} tableActions={<ImportExport kind="marketing-leads" me={me} onChanged={refresh} selectedIds={selectedIds} filters={filters} />} primaryAction={can(me, "crm.marketing_lead.create") ? <Button onClick={() => setFormOpen(true)}><Plus />新增线索</Button> : undefined} />}{formOpen && <MarketingLeadForm users={users} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />}{deleting && <ConfirmDeleteDialog name={deleting.fullName} description="线索将被软删除，评分、行为和审计历史会保留。" onClose={() => setDeleting(null)} onConfirm={async () => { await crmApi(`/api/v1/crm/marketing-leads/${deleting.id}`, { method: "DELETE" }); refresh(); }} />}</PageContent>;
  if (detail.loading || !lead) return <PageContent>{detail.error ? <ErrorState error={detail.error} retry={detail.reload} /> : <LoadingSkeleton detail />}</PageContent>;
  const legalActions = lead.status === "MQL" ? ["ACCEPT_SQL", "RECYCLE"] : lead.status === "SQL" ? ["RECYCLE"] : [];
  if (!["CONVERTED", "DISQUALIFIED"].includes(lead.status)) legalActions.push("DISQUALIFY");
  const transitionLabels: Record<string, string> = { ACCEPT_SQL: "接受跟进", RECYCLE: "退回培育", DISQUALIFY: "判定无效" };
  return <PageContent><a href="#marketing-leads" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />返回线索</a><EntityHeader icon={<UserAvatar name={lead.fullName} large showName={false} />} title={lead.fullName} meta={<><span>{lead.companyName || "未填写公司"}</span><span>{sourceLabels[lead.source] || "其他"}{lead.sourceChannel ? ` / ${marketingSourceChannelLabel(lead.sourceChannel)}` : ""}</span><StatusBadge>{statusLabels[lead.status]}</StatusBadge><UserAvatar name={lead.owner?.name} /><SystemIdField value={lead.id} label="线索编号" /></>} actions={<>{can(me, "crm.marketing.activity.create") && lead.status !== "CONVERTED" && <Button variant="outline" onClick={() => setActivityOpen(true)}><MessageSquarePlus />记录行为</Button>}{can(me, "crm.marketing_lead.qualify") && legalActions.map((action) => <Button key={action} variant="outline" onClick={() => setTransition(action)}>{transitionLabels[action]}</Button>)}{can(me, "crm.marketing_lead.convert") && ["SQL", "QUALIFIED"].includes(lead.status) && <Button onClick={() => setConversionOpen(true)}><GitMerge />转为商机</Button>}{can(me, "crm.marketing_lead.edit") && lead.status !== "CONVERTED" && <Button variant="outline" onClick={() => setFormOpen(true)}><Pencil />编辑</Button>}</>} />
    <SummaryStrip items={[{ label: "状态", value: statusLabels[lead.status] }, { label: "线索匹配度", value: `${lead.fitScore} · ${levelLabels[lead.fitLevel]}` }, { label: "互动活跃度", value: `${lead.engagementScoreCached} · ${levelLabels[lead.engagementLevel]}` }, { label: "最近行为", value: dateTime(lead.lastActivityAt), detail: `${lead.activities?.length || 0} 条行为记录` }, { label: "负责人", value: lead.owner?.name || "待分配" }]} />
    {lead.status === "CONVERTED" && <Alert><CircleGauge /><AlertTitle>已转商机</AlertTitle><AlertDescription><div className="flex flex-wrap gap-4">{lead.convertedOrganization && <a className="underline" href={`#organizations/${lead.convertedOrganization.id}`}>公司：{lead.convertedOrganization.shortName || lead.convertedOrganization.name}</a>}{lead.convertedContact && <a className="underline" href={`#contacts/${lead.convertedContact.id}`}>联系人：{lead.convertedContact.contactName}</a>}{lead.convertedOpportunity && <a className="underline" href={`#leads/${lead.convertedOpportunity.id}`}>商机：{lead.convertedOpportunity.requirementSummary}</a>}<span>{dateTime(lead.convertedAt)} · {lead.convertedBy?.name || "—"}</span></div></AlertDescription></Alert>}
    <DetailTabs value={tab} onChange={setTab} items={[["overview", "概览"], ["journey", "客户旅程"], ["scoring", "评分历史"], ["audit", "操作记录"]]}>
      {tab === "overview" ? <div className="grid gap-5 xl:grid-cols-2"><Section title="身份与公司"><EntityMeta items={[{ label: "姓名", value: lead.fullName }, { label: "职位", value: lead.title }, { label: "Email", value: lead.email }, { label: "Phone", value: lead.phoneNormalized || lead.phone }, { label: "WhatsApp", value: lead.whatsappNormalized || lead.whatsapp }, { label: "WeChat", value: lead.wechat }, { label: "LinkedIn", value: lead.linkedinUrl }, { label: "公司", value: lead.companyName }, { label: "公司网站", value: lead.companyWebsite }, { label: "国家 / 地区", value: [lead.countryCode, lead.region, lead.city].filter(Boolean).join(" · ") }]} /></Section><Section title="获客与生命周期"><EntityMeta items={[{ label: "来源", value: sourceLabels[lead.source] || "其他" }, { label: "来源渠道", value: marketingSourceChannelLabel(lead.sourceChannel) }, { label: "来源详情", value: lead.sourceDetail }, { label: "首次触达", value: dateTime(lead.firstTouchAt) }, { label: "MQL", value: dateTime(lead.mqlAt) }, { label: "SQL", value: dateTime(lead.sqlAt) }, { label: "销售首次响应", value: dateTime(lead.firstSalesResponseAt) }]} /></Section><Section title="原始询盘与补充说明"><EntityMeta columns={1} items={[{ label: "询盘类型", value: lead.inquiryType }, { label: "原始询盘", value: <p className="whitespace-pre-wrap">{lead.inquiryContent || "—"}</p> }, { label: "产品兴趣", value: lead.productInterest }, { label: "需求标签", value: lead.requirementTags?.join("、") }, { label: "预算范围", value: lead.budgetRange }, { label: "补充说明", value: <p className="whitespace-pre-wrap">{lead.note || "—"}</p> }, ...(lead.disqualifiedReason ? [{ label: "无效原因", value: lead.disqualifiedReason }] : [])]} /></Section><Section title="系统信息"><EntityMeta items={[{ label: "创建人", value: lead.createdBy?.name }, { label: "创建时间", value: dateTime(lead.createdAt) }, { label: "更新时间", value: dateTime(lead.updatedAt) }, { label: "线索编号", value: <SystemIdField value={lead.id} /> }]} /></Section></div>
      : tab === "journey" ? <Section title="客户旅程"><div className="space-y-0">{journey.map((item) => <div key={item.id} className="grid grid-cols-[8rem_1fr] gap-4 border-b py-3 last:border-0"><time className="text-xs text-muted-foreground">{dateTime(item.at)}</time><div><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.detail}</p></div></div>)}{!journey.length && <p className="text-sm text-muted-foreground">暂无行为与状态事件。</p>}</div></Section>
      : tab === "scoring" ? <Section title="评分历史"><SummaryStrip items={[{ label: "线索匹配度", value: `${lead.fitScore} · ${levelLabels[lead.fitLevel]}` }, { label: "互动活跃度", value: `${lead.engagementScoreCached} · ${levelLabels[lead.engagementLevel]}` }, { label: "线索热度", value: levelLabels[lead.leadLevel] }, { label: "计算时间", value: dateTime(lead.engagementScoreCalculatedAt) }]} /><div className="mt-5 space-y-3">{lead.scoreHistory?.map((item) => <div key={item.id} className="flex items-start justify-between gap-4 border-b pb-3"><div><p className="text-sm font-medium">{item.dimension === "FIT" ? "线索匹配度" : "互动活跃度"} · {item.reason || "评分变更"}</p><p className="text-xs text-muted-foreground">{item.changedBy?.name || "系统"} · {dateTime(item.createdAt)}</p></div><span className="tabular-nums">{item.previousScore} {item.scoreDelta >= 0 ? "+" : ""}{item.scoreDelta} = {item.newScore}</span></div>)}</div></Section>
      : <EntityAudit id={lead.id} />}
    </DetailTabs>
    {formOpen && <MarketingLeadForm lead={lead} users={users} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />}
    {activityOpen && <ActivityDialog lead={lead} onClose={() => setActivityOpen(false)} onSaved={() => { setActivityOpen(false); refresh(); }} />}
    {transition && <TransitionDialog lead={lead} action={transition} onClose={() => setTransition(null)} onSaved={() => { setTransition(null); refresh(); }} />}
    {conversionOpen && <ConvertDialog lead={lead} me={me} users={users} onClose={() => setConversionOpen(false)} onSaved={() => { setConversionOpen(false); refresh(); }} />}
  </PageContent>;
}
