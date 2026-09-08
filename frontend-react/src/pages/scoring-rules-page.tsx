import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";

import { DataTable } from "@/components/crm/data-table";
import { ErrorState, Field, FormDialog, PageContent, PageHeader, RowActions, StatusBadge } from "@/components/crm/primitives";
import { Button } from "@/components/v1/ui";
import { Checkbox } from "@/components/v1/ui";
import { Input } from "@/components/v1/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/v1/ui";
import { Textarea } from "@/components/v1/ui";
import { crmApi, type SessionUser } from "@/lib/api";
import { can, friendlyError, useResource, type LeadScoringRule } from "@/lib/crm";

type FormState = {
  code: string; name: string; category: string; scoreDimension: "FIT" | "ENGAGEMENT"; scoreDelta: string;
  repeatable: boolean; maxOccurrences: string; cooldownHours: string; enabled: boolean; sortOrder: string; description: string;
};

function initial(rule?: LeadScoringRule): FormState {
  return { code: rule?.code || "", name: rule?.name || "", category: rule?.category || "SALES", scoreDimension: rule?.scoreDimension || "ENGAGEMENT", scoreDelta: String(rule?.scoreDelta ?? 0), repeatable: rule?.repeatable ?? true, maxOccurrences: String(rule?.maxOccurrences ?? ""), cooldownHours: String(rule?.cooldownHours ?? ""), enabled: rule?.enabled ?? true, sortOrder: String(rule?.sortOrder ?? 0), description: rule?.description || "" };
}

function RuleForm({ rule, onClose, onSaved }: { rule?: LeadScoringRule; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(() => initial(rule)); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    setBusy(true); setError("");
    const payload = { code: form.code.trim(), name: form.name.trim(), category: form.category.trim(), scoreDimension: form.scoreDimension, scoreDelta: Number(form.scoreDelta), repeatable: form.repeatable, maxOccurrences: form.maxOccurrences ? Number(form.maxOccurrences) : null, cooldownHours: form.cooldownHours ? Number(form.cooldownHours) : null, enabled: form.enabled, sortOrder: Number(form.sortOrder), description: form.description.trim() || null };
    try { await crmApi(rule ? `/api/v1/crm/marketing/scoring-rules/${rule.id}` : "/api/v1/crm/marketing/scoring-rules", { method: rule ? "PATCH" : "POST", body: JSON.stringify(payload) }); onSaved(); }
    catch (caught) { setError(friendlyError(caught)); } finally { setBusy(false); }
  }
  return <FormDialog title={`${rule ? "编辑" : "新增"}评分规则`} description="管理员配置：技术字段只用于规则识别；修改仅影响后续行为，历史评分不回写。" onClose={onClose} busy={busy} footer={<><Button variant="outline" onClick={onClose}>取消</Button><Button disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存规则"}</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="技术代码（管理员）" required>{(id) => <Input id={id} value={form.code} disabled={!!rule} onChange={(event) => update("code", event.target.value.toUpperCase())} />}</Field><Field label="行为名称" required>{(id) => <Input id={id} value={form.name} onChange={(event) => update("name", event.target.value)} />}</Field><Field label="技术分类（管理员）" required>{(id) => <Input id={id} value={form.category} onChange={(event) => update("category", event.target.value)} />}</Field><Field label="评分维度">{() => <Select value={form.scoreDimension} onValueChange={(value) => update("scoreDimension", value as FormState["scoreDimension"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FIT">线索匹配度</SelectItem><SelectItem value="ENGAGEMENT">互动活跃度</SelectItem></SelectContent></Select>}</Field><Field label="分值变化" required>{(id) => <Input id={id} type="number" min={-100} max={100} value={form.scoreDelta} onChange={(event) => update("scoreDelta", event.target.value)} />}</Field><Field label="最多触发次数">{(id) => <Input id={id} type="number" min={1} value={form.maxOccurrences} onChange={(event) => update("maxOccurrences", event.target.value)} />}</Field><Field label="冷却小时数">{(id) => <Input id={id} type="number" min={0} value={form.cooldownHours} onChange={(event) => update("cooldownHours", event.target.value)} />}</Field><Field label="排序">{(id) => <Input id={id} type="number" min={0} value={form.sortOrder} onChange={(event) => update("sortOrder", event.target.value)} />}</Field><label className="flex items-center gap-2 text-sm"><Checkbox checked={form.repeatable} onCheckedChange={(value) => update("repeatable", value === true)} />可重复</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={form.enabled} onCheckedChange={(value) => update("enabled", value === true)} />启用</label><Field label="说明" wide>{(id) => <Textarea id={id} value={form.description} onChange={(event) => update("description", event.target.value)} />}</Field></div>{error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
  </FormDialog>;
}

export function ScoringRulesPage({ me }: { me: SessionUser }) {
  const manageable = can(me, "crm.marketing.score_rule.manage");
  const result = useResource<{ data: LeadScoringRule[] }>(`/api/v1/crm/marketing/scoring-rules?includeDisabled=${manageable}`);
  const [editing, setEditing] = useState<LeadScoringRule | true | null>(null);
  const rows = result.data?.data || [];
  const columns: ColumnDef<LeadScoringRule>[] = [
    { accessorKey: "name", header: "行为", cell: ({ row }) => <div><p className="font-medium">{row.original.name}</p>{manageable && <p className="text-xs text-muted-foreground">技术代码：{row.original.code}</p>}</div> },
    { accessorKey: "category", header: "管理员分类" }, { id: "scoreDimension", header: "评分维度", cell: ({ row }) => row.original.scoreDimension === "FIT" ? "线索匹配度" : "互动活跃度" },
    { id: "score", header: "分值变化", cell: ({ row }) => <span className="tabular-nums">{row.original.scoreDelta > 0 ? "+" : ""}{row.original.scoreDelta}</span> },
    { id: "repeat", header: "重复规则", cell: ({ row }) => row.original.repeatable ? `可重复${row.original.maxOccurrences ? ` · 最多 ${row.original.maxOccurrences}` : ""}` : "仅一次" },
    { id: "cooldown", header: "冷却时间", cell: ({ row }) => row.original.cooldownHours == null ? "—" : `${row.original.cooldownHours} 小时` },
    { id: "enabled", header: "状态", cell: ({ row }) => <StatusBadge>{row.original.enabled ? "启用" : "停用"}</StatusBadge> },
    ...(manageable ? [{ id: "actions", header: "操作", enableHiding: false, cell: ({ row }: { row: { original: LeadScoringRule } }) => <RowActions label={row.original.name} items={[{ label: "编辑", onClick: () => setEditing(row.original) }]} /> }] : []),
  ];
  return <PageContent><PageHeader title="评分规则" description="配置营销行为对线索匹配度和互动活跃度的影响；历史分值不会被回写。" actions={manageable ? <Button onClick={() => setEditing(true)}><Plus />新增规则</Button> : undefined} />{result.error ? <ErrorState error={result.error} retry={result.reload} /> : <DataTable label="评分规则" rows={rows} columns={columns} loading={result.loading} />}{editing && <RuleForm rule={editing === true ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); result.reload(); }} />}</PageContent>;
}
