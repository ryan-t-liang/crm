import { useRef, useState } from "react";
import { Download, FileText, Film, Image, Upload, X } from "lucide-react";
import { appUrl, crmApi } from "@/lib/api";
import { dateTime, friendlyError, type Attachment } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "./primitives";

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
}: {
  files: Attachment[];
  endpoint: string;
  fieldKey?: string;
  editable?: boolean;
  onChanged?: () => void;
  title?: string;
  accept?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState<Attachment | null>(null);
  async function upload(selected: File[]) {
    if (busy || !selected.length) return;
    setBusy(true);
    setError("");
    try {
      for (const file of selected) {
        const body = new FormData();
        body.append("file", file, file.name);
        await crmApi(`${endpoint}/attachments/${fieldKey}`, {
          method: "POST",
          body,
        });
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      onChanged?.();
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        {editable && (
          <>
            <input
              ref={input}
              aria-label={`上传${title}`}
              type="file"
              multiple
              accept={accept}
              className="sr-only"
              onChange={(e) => {
                void upload(Array.from(e.target.files || []));
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <Upload />
              {busy ? "上传中…" : "上传文件"}
            </Button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div
        onDragOver={(e) => {
          if (editable) e.preventDefault();
        }}
        onDrop={(e) => {
          if (editable) {
            e.preventDefault();
            void upload(Array.from(e.dataTransfer.files));
          }
        }}
        className="divide-y rounded-lg border"
      >
        {files.map((file) => {
          const url = appUrl(`${endpoint}/attachments/${file.id}/download`);
          const Icon =
            file.kind === "VIDEO"
              ? Film
              : file.kind === "IMAGE"
                ? Image
                : FileText;
          return (
            <div key={file.id} className="flex items-center gap-3 px-3 py-2.5">
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
              <Button asChild variant="ghost" size="icon-sm">
                <a
                  aria-label={`下载${file.originalName}`}
                  href={url}
                  download={file.originalName}
                  rel="noreferrer"
                >
                  <Download />
                </a>
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
        {!files.length && (
          <p className="px-4 py-4 text-xs text-muted-foreground">
            暂无附件{editable ? " · 上传文件或拖放至此" : ""}
          </p>
        )}
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
