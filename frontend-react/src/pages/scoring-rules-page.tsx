import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";

import { DataTable } from "@/components/crm/data-table";
import { ErrorState, Field, FormDialog, PageContent, PageHeader, RowActions, StatusBadge } from "@/components/crm/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  return <FormDialog title={`${rule ? "编辑" : "新增"}评分规则`} description="规则修改只影响后续行为；历史行为保留当时的 Delta Snapshot。" onClose={onClose} busy={busy} footer={<><Button variant="outline" onClick={onClose}>取消</Button><Button disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存规则"}</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="行为代码" required>{(id) => <Input id={id} value={form.code} disabled={!!rule} onChange={(event) => update("code", event.target.value.toUpperCase())} />}</Field><Field label="行为名称" required>{(id) => <Input id={id} value={form.name} onChange={(event) => update("name", event.target.value)} />}</Field><Field label="Category" required>{(id) => <Input id={id} value={form.category} onChange={(event) => update("category", event.target.value)} />}</Field><Field label="Dimension">{() => <Select value={form.scoreDimension} onValueChange={(value) => update("scoreDimension", value as FormState["scoreDimension"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FIT">FIT</SelectItem><SelectItem value="ENGAGEMENT">ENGAGEMENT</SelectItem></SelectContent></Select>}</Field><Field label="Score" required>{(id) => <Input id={id} type="number" min={-100} max={100} value={form.scoreDelta} onChange={(event) => update("scoreDelta", event.target.value)} />}</Field><Field label="Max Occurrences">{(id) => <Input id={id} type="number" min={1} value={form.maxOccurrences} onChange={(event) => update("maxOccurrences", event.target.value)} />}</Field><Field label="Cooldown Hours">{(id) => <Input id={id} type="number" min={0} value={form.cooldownHours} onChange={(event) => update("cooldownHours", event.target.value)} />}</Field><Field label="Sort Order">{(id) => <Input id={id} type="number" min={0} value={form.sortOrder} onChange={(event) => update("sortOrder", event.target.value)} />}</Field><label className="flex items-center gap-2 text-sm"><Checkbox checked={form.repeatable} onCheckedChange={(value) => update("repeatable", value === true)} />可重复</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={form.enabled} onCheckedChange={(value) => update("enabled", value === true)} />启用</label><Field label="说明" wide>{(id) => <Textarea id={id} value={form.description} onChange={(event) => update("description", event.target.value)} />}</Field></div>{error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
  </FormDialog>;
}

export function ScoringRulesPage({ me }: { me: SessionUser }) {
  const manageable = can(me, "crm.marketing.score_rule.manage");
  const result = useResource<{ data: LeadScoringRule[] }>(`/api/v1/crm/marketing/scoring-rules?includeDisabled=${manageable}`);
  const [editing, setEditing] = useState<LeadScoringRule | true | null>(null);
  const rows = result.data?.data || [];
  const columns: ColumnDef<LeadScoringRule>[] = [
    { accessorKey: "name", header: "行为", cell: ({ row }) => <div><p className="font-medium">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.code}</p></div> },
    { accessorKey: "category", header: "Category" }, { accessorKey: "scoreDimension", header: "Dimension" },
    { id: "score", header: "Score", cell: ({ row }) => <span className="tabular-nums">{row.original.scoreDelta > 0 ? "+" : ""}{row.original.scoreDelta}</span> },
    { id: "repeat", header: "Repeat", cell: ({ row }) => row.original.repeatable ? `可重复${row.original.maxOccurrences ? ` · 最多 ${row.original.maxOccurrences}` : ""}` : "仅一次" },
    { id: "cooldown", header: "Cooldown", cell: ({ row }) => row.original.cooldownHours == null ? "—" : `${row.original.cooldownHours} h` },
    { id: "enabled", header: "Enabled", cell: ({ row }) => <StatusBadge>{row.original.enabled ? "启用" : "停用"}</StatusBadge> },
    ...(manageable ? [{ id: "actions", header: "操作", enableHiding: false, cell: ({ row }: { row: { original: LeadScoringRule } }) => <RowActions label={row.original.name} items={[{ label: "编辑", onClick: () => setEditing(row.original) }]} /> }] : []),
  ];
  return <PageContent><PageHeader title="评分规则" description="配置营销行为对 Fit / Engagement 的影响。历史行为分值不会被回写。" actions={manageable ? <Button onClick={() => setEditing(true)}><Plus />新增规则</Button> : undefined} />{result.error ? <ErrorState error={result.error} retry={result.reload} /> : <DataTable label="评分规则" rows={rows} columns={columns} loading={result.loading} />}{editing && <RuleForm rule={editing === true ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); result.reload(); }} />}</PageContent>;
}
