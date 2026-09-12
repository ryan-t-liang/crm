import { useEffect, useMemo, useState } from "react";
import {
  IconDownloadStroked as Download,
  IconHistory as History,
  IconRefresh as RotateCw,
  IconUpload as Upload,
} from "@douyinfe/semi-icons";
import { Space, Table as SemiTable, Typography } from "@douyinfe/semi-ui";
import { appUrl, crmApi, type SessionUser } from "@/lib/api";
import { can, dateTime, friendlyError } from "@/lib/crm";
import { Button, Checkbox, FilePicker } from "@/components/crm/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/crm/ui";
import { RecordHighlights, LoadingSkeleton } from "./primitives";
import { CRMFormSideSheet } from "./interaction-patterns";
import { dataJobStatusLabels, dataObjectLabels, exportScopeLabels } from "@/lib/product-language";

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
      {can(me, `crm.${key}.export`) && (
        <Button
          variant={exportOnly ? "outline" : "ghost"}
          className="shadow-none"
          onClick={() => setMode("export")}
        >
          <Download />
          {exportOnly ? "导出所选" : "导出"}
        </Button>
      )}
      {!exportOnly && can(me, `crm.${key}.import`) && (
        <Button
          variant="outline"
          className="shadow-none"
          onClick={() => setMode("import")}
        >
          <Upload />
          批量导入
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
    <CRMFormSideSheet
      mode="create"
      entityLabel={mode === "import" ? "导入任务" : "导出任务"}
      title={mode === "import" ? "批量导入" : "导出数据"}
      description={
        mode === "export"
          ? "选择导出范围。所有范围都会再次应用当前账号的数据权限。"
          : "上传 XLSX，先预检，确认后写入。"
      }
      onClose={onClose}
      width={mode === "import" && !!job ? 800 : 448}
      busy={busy}
      footer={
        <Space align="center" spacing={8} style={{ width: "100%", justifyContent: "flex-end" }}>
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
        </Space>
      }
    >
      <Space className="crm-data-job" vertical align="start" spacing={16} style={{ width: "100%" }}>
        {busy && <LoadingSkeleton />}
        {!busy && mode === "import" && !job && !history && (
          <Space vertical align="start" spacing={16} style={{ width: "100%" }}>
            <Space align="center" spacing={8} wrap>
              <Button
                variant="outline"
                onClick={() => { window.location.href = appUrl(`/api/v1/crm/templates/${kind}`); }}
              >
                <Download />
                下载标准模板
              </Button>
              <FilePicker
                aria-label="XLSX 文件"
                accept=".xlsx"
                files={file ? [file] : []}
                onFilesChange={(selected) => setFile(selected[0] || null)}
                label={file ? file.name : "选择 XLSX 文件"}
              />
            </Space>
            {kind === "contacts" && (
              <Checkbox
                checked={createMissing}
                onCheckedChange={(v) => setCreateMissing(v === true)}
              >
                创建未匹配的组织（默认关闭）
              </Checkbox>
            )}
            <Checkbox
              checked={allowDuplicate}
              onCheckedChange={(v) => setAllowDuplicate(v === true)}
            >
              确认重新上传相同文件
            </Checkbox>
            <Button
              variant="outline"
              onClick={() => {
                void run("history");
              }}
            >
              <History />
              导入记录
            </Button>
          </Space>
        )}
        {!busy && mode === "export" && !result && !history && (
          <Space vertical align="start" spacing={16} style={{ width: "100%" }}>
            <Space vertical align="start" spacing={8} style={{ width: "100%" }}>
              <Typography.Text strong>导出范围</Typography.Text>
              <Select value={exportScope} onValueChange={(value) => setExportScope(value as typeof exportScope)}>
                <SelectTrigger aria-label="导出范围"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SELECTED" disabled={!selectedIds.length}>选中的 {selectedIds.length} 条</SelectItem>
                  <SelectItem value="FILTERED">当前筛选结果</SelectItem>
                  <SelectItem value="ALL_CURRENT_PERMISSION">当前权限内全部</SelectItem>
                </SelectContent>
              </Select>
              <Typography.Text type="tertiary" size="small">
                预计记录数：{estimatedCount == null ? "计算中…" : `${estimatedCount} 条`}；文件格式：XLSX；生成后 24 小时内可下载。
              </Typography.Text>
            </Space>
            <Button variant="outline" onClick={() => { void run("history"); }}><History />导出记录</Button>
          </Space>
        )}
        {job?.preflight && !result && (
          <Space vertical align="start" spacing={16} style={{ width: "100%" }}>
            <RecordHighlights
              items={[
                { label: "总行数", value: job.preflight.totalRows },
                { label: "可导入", value: job.preflight.importableRows },
                { label: "需注意", value: job.preflight.warningRows },
                { label: "有错误", value: job.preflight.errorRows },
              ]}
            />
            <SemiTable<ImportRow>
              className="crm-import-preview-table"
              rowKey="rowNumber"
              size="small"
              pagination={false}
              dataSource={job.rows || []}
              columns={[
                { title: "行号", dataIndex: "rowNumber", width: 72 },
                { title: "识别信息", dataIndex: "identity" },
                { title: "状态", dataIndex: "status", width: 100, render: (status: string) => ({ VALID: "可导入", WARNING: "需注意", ERROR: "有错误" } as Record<string, string>)[status] || "未知状态" },
                { title: "说明", render: (_value: unknown, row: ImportRow) => [...(row.errors || []), ...(row.warnings || [])].map((item) => item.message).join("；") || "可导入" },
              ]}
            />
          </Space>
        )}
        {result && (
          <Space vertical align="start" spacing={12} style={{ width: "100%" }}>
            <Typography.Text>
              {mode === "export"
                ? `已生成 ${result.rowCount} 条记录。`
                : `成功 ${result.imported} 条，失败 ${result.failed} 条，需注意 ${result.warnings} 条。`}
            </Typography.Text>
            <Space align="center" spacing={8} wrap>
              {result.downloadUrl && (
                <Button onClick={() => { window.location.href = appUrl(result.downloadUrl || ""); }}>
                  下载 XLSX
                </Button>
              )}
              {job?.failureFilePath && (
                <Button
                  variant="link"
                  onClick={() => { window.location.href = appUrl(`/api/v1/crm/imports/${job.id}/failures`); }}
                >
                  下载失败明细
                </Button>
              )}
            </Space>
          </Space>
        )}
        {history && (
          <Space vertical align="start" spacing={8} style={{ width: "100%" }}>
            <Button variant="ghost" onClick={() => setHistory(null)}>
              返回
            </Button>
            {history.map((item) => (
              <Space key={item.id} className="border-b py-2" vertical align="start" spacing={4} style={{ width: "100%" }}>
                <Typography.Text className="crm-data-job-history-title">{item.fileName || item.jobNo || item.id} · {dataObjectLabels[item.objectType || ""] || "其他对象"} · {dataJobStatusLabels[item.status || ""] || "未知状态"}</Typography.Text>
                <Typography.Text type="tertiary" size="small">
                  {dateTime(item.createdAt)} · {item.operatorName || "—"} · {mode === "export" ? `${exportScopeLabels[item.scope || ""] || "未知范围"} · ${item.rowCount || 0} 条 · ${item.format || "XLSX"}` : `成功 ${item.successCount} · 失败 ${item.failedCount}`}
                </Typography.Text>
                {mode === "export" && (
                  <Space align="center" spacing={8} wrap>
                    {item.status === "COMPLETED" && (
                      <Typography.Text
                        link={{ href: appUrl(`/api/v1/crm/exports/${item.id}/download`), download: true }}
                        size="small"
                      >
                        下载
                      </Typography.Text>
                    )}
                    <Button variant="ghost" size="sm" onClick={async () => { setBusy(true); try { await crmApi(`/api/v1/crm/exports/${item.id}/regenerate`, { method: "POST", body: "{}" }); setHistory(null); await run("history"); } finally { setBusy(false); } }}><RotateCw />重新生成</Button>
                  </Space>
                )}
              </Space>
            ))}
            {!history.length && <Typography.Text type="tertiary">{mode === "export" ? "暂无导出记录" : "暂无导入记录"}</Typography.Text>}
          </Space>
        )}
        {error && (
          <Typography.Text role="alert" type="danger">
            {error}
          </Typography.Text>
        )}
      </Space>
    </CRMFormSideSheet>
  );
}
