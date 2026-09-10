import { useRef, useState } from "react";
import {
  IconClose as X,
  IconDownloadStroked as Download,
  IconFile as FileText,
  IconImageStroked as Image,
  IconUpload as Upload,
  IconVideoStroked as Film,
} from "@douyinfe/semi-icons";
import { Toast, Upload as SemiUpload } from "@douyinfe/semi-ui";
import { ApiError, appUrl, crmApi } from "@/lib/api";
import { dateTime, friendlyError, type Attachment } from "@/lib/crm";
import { Button } from "@/components/crm/ui";
import { ConfirmDeleteDialog } from "./primitives";
import { CRMEmptyState } from "./interaction-patterns";

export const attachmentAccept =
  ".jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";
export function AttachmentList({
  files,
  endpoint,
  fieldKey = "files",
  editable = false,
  onChanged,
  title = "附件",
  accept = attachmentAccept,
  compact = false,
}: {
  files: Attachment[];
  endpoint: string;
  fieldKey?: string;
  editable?: boolean;
  onChanged?: () => void;
  title?: string;
  accept?: string;
  compact?: boolean;
}) {
  const activeUploads = useRef(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState<Attachment | null>(null),
    [showUploader, setShowUploader] = useState(!compact);
  function finishUpload() {
    activeUploads.current = Math.max(0, activeUploads.current - 1);
    setBusy(activeUploads.current > 0);
    onChanged?.();
  }
  function upload({
    action,
    fileInstance,
    onError,
    onProgress,
    onSuccess,
  }: {
    action: string;
    fileInstance: File;
    onError: (xhr: { status?: number }, event?: Event) => void;
    onProgress: (event?: { total: number; loaded: number }) => void;
    onSuccess: (response: unknown, event?: Event) => void;
  }) {
    activeUploads.current += 1;
    setBusy(true);
    setError("");
    const request = new XMLHttpRequest();
    request.open("POST", action);
    request.withCredentials = true;
    request.setRequestHeader("accept", "application/json");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress({ total: event.total, loaded: event.loaded });
    };
    request.onerror = (event) => {
      const message = "上传失败，请检查网络后重试。";
      setError(message);
      Toast.error(message);
      onError({ status: request.status }, event);
      finishUpload();
    };
    request.onload = (event) => {
      let payload: unknown;
      try {
        payload = request.responseText ? JSON.parse(request.responseText) : null;
      } catch {
        payload = null;
      }
      if (request.status >= 200 && request.status < 300) {
        onProgress({ total: fileInstance.size, loaded: fileInstance.size });
        onSuccess(payload, event);
        Toast.success(`${fileInstance.name} 上传成功`);
      } else {
        if (request.status === 401) window.dispatchEvent(new Event("crm:session-expired"));
        const body = payload as { error?: { message?: string; code?: string }; traceId?: string } | null;
        const failure = new ApiError(
          body?.error?.message || `上传失败（${request.status}）`,
          request.status,
          body?.error?.code,
          body?.traceId,
        );
        const message = friendlyError(failure);
        setError(message);
        Toast.error(message);
        onError({ status: request.status }, event);
      }
      finishUpload();
    };
    const body = new FormData();
    body.append("file", fileInstance, fileInstance.name);
    request.send(body);
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        {editable && compact && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setShowUploader((visible) => !visible)}
          >
            <Upload />
            {busy ? "上传中…" : showUploader ? "收起上传" : "上传文件"}
          </Button>
        )}
        {editable && !compact && (
          <SemiUpload
            accept={accept}
            action={appUrl(`${endpoint}/attachments/${fieldKey}`)}
            className="crm-attachment-upload"
            customRequest={upload}
            disabled={busy}
            draggable
            dragMainText={`拖放${title}到此处`}
            dragSubText="支持图片、文档与视频"
            fileName="file"
            multiple
            name="file"
            onAcceptInvalid={() => {
              const message = "文件类型不受支持。";
              setError(message);
              Toast.warning(message);
            }}
            prompt="上传状态会显示在文件列表中"
            showRetry
            showUploadList
          >
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
            >
              <Upload />
              {busy ? "上传中…" : "上传文件"}
            </Button>
          </SemiUpload>
        )}
      </div>
      {editable && compact && showUploader && (
        <div className="crm-attachment-compact-upload">
          <SemiUpload
            accept={accept}
            action={appUrl(`${endpoint}/attachments/${fieldKey}`)}
            className="crm-attachment-upload"
            customRequest={upload}
            disabled={busy}
            draggable={false}
            fileName="file"
            multiple
            name="file"
            onAcceptInvalid={() => {
              const message = "文件类型不受支持。";
              setError(message);
              Toast.warning(message);
            }}
            showRetry
            showUploadList
          >
            <Button variant="outline" size="sm" disabled={busy}>选择文件</Button>
          </SemiUpload>
          <span>支持图片、文档与视频；选择后立即上传。</span>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className={`crm-attachment-shell divide-y${compact ? " is-compact" : " border"}`}>
        {files.map((file) => {
          const url = appUrl(`${endpoint}/attachments/${file.id}/download`);
          const Icon =
            file.kind === "VIDEO"
              ? Film
              : file.kind === "IMAGE"
                ? Image
                : FileText;
          return (
            <div key={file.id} className="crm-attachment-row flex items-center gap-3 px-3 py-2.5">
              {file.kind === "IMAGE" ? (
                <img
                  src={url}
                  alt={file.originalName}
                  className="size-9 rounded border object-cover"
                />
              ) : (
                <Icon className="size-5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm hover:underline"
                >
                  {file.originalName}
                </a>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {file.fileSize == null
                    ? "外部文件"
                    : `${Math.max(1, Math.round(file.fileSize / 1024))} KB`}{" "}
                  · {file.uploadedBy?.name || "—"} · {dateTime(file.createdAt)}
                </p>
              </div>
              <Button
                aria-label={`下载${file.originalName}`}
                variant="ghost"
                size="icon-sm"
                onClick={() => { window.location.href = url; }}
              >
                <Download />
              </Button>
              {editable && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`移除${file.originalName}`}
                  onClick={() => setDeleting(file)}
                >
                  <X />
                </Button>
              )}
            </div>
          );
        })}
        {!files.length && (compact ? (
          <CRMEmptyState
            compact
            title="暂无附件"
            description="上传与该联系人相关的会议纪要、图片或文档。"
          />
        ) : (
          <p className="px-4 py-4 text-xs text-muted-foreground">
            暂无附件{editable ? " · 上传文件或拖放至此" : ""}
          </p>
        ))}
      </div>
      {deleting && (
        <ConfirmDeleteDialog
          name={deleting.originalName}
          description="移除后该附件将不可下载。"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await crmApi(`${endpoint}/attachments/${deleting.id}`, {
              method: "DELETE",
            });
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}
