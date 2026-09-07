import { useEffect, useMemo, useState } from "react";
import { Download, RotateCw, Upload } from "lucide-react";
import { appUrl, crmApi, type SessionUser } from "@/lib/api";
import { can, dateTime, friendlyError } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { FormDialog, SummaryStrip, LoadingSkeleton } from "./primitives";

type ImportRow = {
  rowNumber: number;
  identity: string;
  status: string;
  errors?: { message: string }[];
  warnings?: { message: string }[];
};
type ImportJob = {
  id: string;
  fileName?: string;
  status?: string;
  createdAt?: string;
  successCount?: number;
  failedCount?: number;
  failureFilePath?: string;
  preflight?: {
    totalRows: number;
    importableRows: number;
    warningRows: number;
    errorRows: number;
  };
  rows?: ImportRow[];
  rowCount?: number;
  downloadUrl?: string | null;
  statusUrl?: string;
  scope?: string;
  jobNo?: string;
  objectType?: string;
  operatorName?: string;
  format?: string;
};
export function ImportExport({
  kind,
  me,
  onChanged,
  selectedIds = [],
  filters = {},
  exportOnly = false,
}: {
  kind: "organizations" | "contacts" | "leads" | "marketing-leads";
  me: SessionUser;
  onChanged: () => void;
  selectedIds?: string[];
  filters?: Record<string, string>;
  exportOnly?: boolean;
}) {
  const key =
    kind === "organizations"
      ? "organization"
      : kind === "contacts"
        ? "contact"
        : kind === "marketing-leads"
          ? "marketing_lead"
          : "lead";
  const [mode, setMode] = useState<"import" | "export" | null>(null);
  return (
    <>
      {!exportOnly && can(me, `crm.${key}.import`) && (
        <Button
          variant="outline"
          className="shadow-none"
          onClick={() => setMode("import")}
        >
          <Upload />
          导入
        </Button>
      )}
      {can(me, `crm.${key}.export`) && (
        <Button
          variant="outline"
          className="shadow-none"
          onClick={() => setMode("export")}
        >
          <Download />
          {exportOnly ? "导出所选" : "导出"}
        </Button>
      )}
      {mode && (
        <JobDialog
          kind={kind}
          mode={mode}
          onClose={() => setMode(null)}
          onChanged={onChanged}
          selectedIds={selectedIds}
          filters={filters}
        />
      )}
    </>
  );
}
function JobDialog({
  kind,
  mode,
  onClose,
  onChanged,
  selectedIds,
  filters,
}: {
  kind: string;
  mode: "import" | "export";
  onClose: () => void;
  onChanged: () => void;
  selectedIds: string[];
  filters: Record<string, string>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [createMissing, setCreateMissing] = useState(false),
    [allowDuplicate, setAllowDuplicate] = useState(false),
    [exportScope, setExportScope] = useState<"SELECTED" | "FILTERED" | "ALL_CURRENT_PERMISSION">(selectedIds.length ? "SELECTED" : "FILTERED"),
    [job, setJob] = useState<ImportJob | null>(null),
    [history, setHistory] = useState<ImportJob[] | null>(null),
    [estimatedCount, setEstimatedCount] = useState<number | null>(null),
    [result, setResult] = useState<{
      imported?: number;
      failed?: number;
      warnings?: number;
      rowCount?: number;
      downloadUrl?: string;
    } | null>(null);
  const exportRequest = useMemo(() => ({
    scope: exportScope,
    format: "XLSX" as const,
    selectedIds: exportScope === "SELECTED" ? selectedIds : [],
    filters: exportScope === "FILTERED" ? filters : {},
  }), [exportScope, filters, selectedIds]);
  useEffect(() => {
    if (mode !== "export" || history || result) return;
    const controller = new AbortController();
    setEstimatedCount(null);
    void crmApi<{ data: { count: number } }>(`/api/v1/crm/exports/${kind}/estimate`, {
      method: "POST",
      body: JSON.stringify(exportRequest),
      signal: controller.signal,
    }).then((response) => setEstimatedCount(response.data.count)).catch(() => {});
    return () => controller.abort();
  }, [exportRequest, history, kind, mode, result]);
  async function run(action: "upload" | "execute" | "export" | "history") {
    setBusy(true);
    setError("");
    try {
      if (action === "upload") {
        if (!file || !file.name.toLowerCase().endsWith(".xlsx"))
          throw new Error("请选择 XLSX 文件。");
        const body = new FormData();
        body.append("file", file, file.name);
        const params = new URLSearchParams();
        if (createMissing) params.set("createMissingOrganization", "true");
        if (allowDuplicate) params.set("allowDuplicate", "true");
        const response = await crmApi<{ data: ImportJob }>(
          `/api/v1/crm/imports/${kind}?${params}`,
          { method: "POST", body },
        );
        setJob(response.data);
      }
      if (action === "execute" && job) {
        const response = await crmApi<{
          data: {
            job: ImportJob;
            result: { imported: number; failed: number; warnings: number };
          };
        }>(`/api/v1/crm/imports/${job.id}/execute`, {
          method: "POST",
          body: "{}",
        });
        setJob(response.data.job);
        setResult(response.data.result);
        onChanged();
      }
      if (action === "export") {
        const response = await crmApi<{
          data: ImportJob;
        }>(`/api/v1/crm/exports/${kind}`, { method: "POST", body: JSON.stringify(exportRequest) });
        let current = response.data;
        for (let attempt = 0; attempt < 80 && !["COMPLETED", "FAILED"].includes(current.status || ""); attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          current = (await crmApi<{ data: ImportJob }>(`/api/v1/crm/exports/${current.id}`)).data;
        }
        if (current.status !== "COMPLETED") throw new Error(current.status === "FAILED" ? "导出任务失败，请在导出记录中重试。" : "导出任务仍在处理中，请稍后在导出记录中下载。");
        setResult({ rowCount: current.rowCount, downloadUrl: current.downloadUrl || undefined });
      }
      if (action === "history") {
        const objectType =
          kind === "contacts"
            ? "CONTACT"
            : kind === "leads"
              ? "CRM_LEAD"
              : kind === "marketing-leads"
                ? "MARKETING_LEAD"
              : "ORGANIZATION";
        const response = await crmApi<{ data: ImportJob[] }>(
          `/api/v1/crm/${mode === "export" ? "exports" : "imports"}?objectType=${objectType}&pageSize=50`,
        );
        setHistory(response.data);
      }
    } catch (e) {
      setError(
        e instanceof Error && e.message === "请选择 XLSX 文件。"
          ? e.message
          : friendlyError(e),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog
      title={mode === "import" ? "批量导入" : "导出数据"}
      description={
        mode === "export"
          ? "选择导出范围。所有范围都会再次应用当前账号的数据权限。"
          : "上传 XLSX，先预检，确认后写入。"
      }
      onClose={onClose}
      wide={mode === "import" && !!job}
      busy={busy}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {result ? "完成" : "取消"}
          </Button>
          {!result && !history && (
            <Button
              disabled={
                busy ||
                (mode === "import" &&
                  (job ? !job.preflight?.importableRows : !file))
              }
              onClick={() => {
                void run(
                  mode === "export" ? "export" : job ? "execute" : "upload",
                );
              }}
            >
              {busy
                ? "处理中…"
                : mode === "export"
                  ? "生成导出文件"
                  : job
                    ? "确认导入"
                    : "开始预检"}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {busy && <LoadingSkeleton />}
        {!busy && mode === "import" && !job && !history && (
          <>
            <a
              className="inline-block text-sm underline"
              href={appUrl(`/api/v1/crm/templates/${kind}`)}
              download
            >
              下载标准模板
            </a>
            <Input
              aria-label="XLSX 文件"
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {kind === "contacts" && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={createMissing}
                  onCheckedChange={(v) => setCreateMissing(v === true)}
                />
                创建未匹配的公司（默认关闭）
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allowDuplicate}
                onCheckedChange={(v) => setAllowDuplicate(v === true)}
              />
              确认重新上传相同文件
            </label>
            <Button
              variant="ghost"
              onClick={() => {
                void run("history");
              }}
            >
              导入记录
            </Button>
          </>
        )}
        {!busy && mode === "export" && !result && !history && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">导出范围</label>
              <Select value={exportScope} onValueChange={(value) => setExportScope(value as typeof exportScope)}>
                <SelectTrigger aria-label="导出范围"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SELECTED" disabled={!selectedIds.length}>选中的 {selectedIds.length} 条</SelectItem>
                  <SelectItem value="FILTERED">当前筛选结果</SelectItem>
                  <SelectItem value="ALL_CURRENT_PERMISSION">当前权限内全部</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">预计记录数：{estimatedCount == null ? "计算中…" : `${estimatedCount} 条`}；文件格式：XLSX；生成后 24 小时内可下载。</p>
            </div>
            <Button variant="ghost" onClick={() => { void run("history"); }}>导出记录</Button>
          </>
        )}
        {job?.preflight && !result && (
          <>
            <SummaryStrip
              items={[
                { label: "总行数", value: job.preflight.totalRows },
                { label: "可导入", value: job.preflight.importableRows },
                { label: "需注意", value: job.preflight.warningRows },
                { label: "有错误", value: job.preflight.errorRows },
              ]}
            />
            <Table>
              <TableHeader>
                <TableRow>
                  {["行号", "识别信息", "状态", "说明"].map((x) => (
                    <TableHead key={x}>{x}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.rows?.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>{row.identity}</TableCell>
                    <TableCell>{({ VALID: "可导入", WARNING: "需注意", ERROR: "有错误" } as Record<string, string>)[row.status] || "未知状态"}</TableCell>
                    <TableCell>
                      {[...(row.errors || []), ...(row.warnings || [])]
                        .map((x) => x.message)
                        .join("；") || "可导入"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        {result && (
          <>
            <p className="text-sm">
              {mode === "export"
                ? `已生成 ${result.rowCount} 条记录。`
                : `成功 ${result.imported} 条，失败 ${result.failed} 条，需注意 ${result.warnings} 条。`}
            </p>
            {result.downloadUrl && (
              <Button asChild>
                <a href={appUrl(result.downloadUrl)} download>
                  下载 XLSX
                </a>
              </Button>
            )}
            {job?.failureFilePath && (
              <a
                className="text-sm underline"
                href={appUrl(`/api/v1/crm/imports/${job.id}/failures`)}
                download
              >
                下载失败明细
              </a>
            )}
          </>
        )}
        {history && (
          <>
            <Button variant="ghost" onClick={() => setHistory(null)}>
              返回
            </Button>
            {history.map((item) => (
              <div key={item.id} className="border-b py-2 text-sm">
                <p>{item.fileName || item.jobNo || item.id} · {({ CONTACT: "联系人", CRM_LEAD: "商机", MARKETING_LEAD: "线索", ORGANIZATION: "公司" } as Record<string, string>)[item.objectType || ""] || "其他对象"} · {({ PENDING: "生成中", PROCESSING: "生成中", COMPLETED: "已完成", FAILED: "失败", EXPIRED: "已过期" } as Record<string, string>)[item.status || ""] || "未知状态"}</p>
                <p className="text-xs text-muted-foreground">
                  {dateTime(item.createdAt)} · {item.operatorName || "—"} · {mode === "export" ? `${({ SELECTED: "所选记录", FILTERED: "筛选结果", ALL_CURRENT_PERMISSION: "当前权限范围全部" } as Record<string, string>)[item.scope || ""] || "未知范围"} · ${item.rowCount || 0} 条 · ${item.format || "XLSX"}` : `成功 ${item.successCount} · 失败 ${item.failedCount}`}
                </p>
                {mode === "export" && item.status === "COMPLETED" && <a className="mr-3 text-xs underline" href={appUrl(`/api/v1/crm/exports/${item.id}/download`)} download>下载</a>}
                {mode === "export" && <Button variant="ghost" size="sm" onClick={async () => { setBusy(true); try { await crmApi(`/api/v1/crm/exports/${item.id}/regenerate`, { method: "POST", body: "{}" }); setHistory(null); await run("history"); } finally { setBusy(false); } }}><RotateCw />重新生成</Button>}
              </div>
            ))}
            {!history.length && <p>{mode === "export" ? "暂无导出记录" : "暂无导入记录"}</p>}
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </FormDialog>
  );
}
