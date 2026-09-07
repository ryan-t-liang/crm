import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { appUrl, crmApi, type SessionUser } from "@/lib/api";
import { can, dateTime, friendlyError } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
};
export function ImportExport({
  kind,
  me,
  onChanged,
}: {
  kind: "organizations" | "contacts" | "leads" | "marketing-leads";
  me: SessionUser;
  onChanged: () => void;
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
          variant="outline"
          className="shadow-none"
          onClick={() => setMode("export")}
        >
          <Download />
          导出
        </Button>
      )}
      {can(me, `crm.${key}.import`) && (
        <Button
          variant="outline"
          className="shadow-none"
          onClick={() => setMode("import")}
        >
          <Upload />
          导入
        </Button>
      )}
      {mode && (
        <JobDialog
          kind={kind}
          mode={mode}
          onClose={() => setMode(null)}
          onChanged={onChanged}
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
}: {
  kind: string;
  mode: "import" | "export";
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [createMissing, setCreateMissing] = useState(false),
    [allowDuplicate, setAllowDuplicate] = useState(false),
    [job, setJob] = useState<ImportJob | null>(null),
    [history, setHistory] = useState<ImportJob[] | null>(null),
    [result, setResult] = useState<{
      imported?: number;
      failed?: number;
      warnings?: number;
      rowCount?: number;
      downloadUrl?: string;
    } | null>(null);
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
          data: { rowCount: number; downloadUrl: string };
        }>(`/api/v1/crm/exports/${kind}`, { method: "POST", body: "{}" });
        setResult(response.data);
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
          `/api/v1/crm/imports?objectType=${objectType}&pageSize=50`,
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
          ? "将导出当前权限范围内的全部记录，不局限于列表筛选结果。"
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
                    <TableCell>{row.status}</TableCell>
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
              返回上传
            </Button>
            {history.map((item) => (
              <div key={item.id} className="border-b py-2 text-sm">
                <p>
                  {item.fileName} · {item.status}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dateTime(item.createdAt)} · 成功 {item.successCount} · 失败{" "}
                  {item.failedCount}
                </p>
              </div>
            ))}
            {!history.length && <p>暂无导入记录</p>}
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
