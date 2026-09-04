import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { basename, extname, join, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { LeadAttachmentKind, PrismaClient } from "@prisma/client";
import type { MultipartFile } from "@fastify/multipart";
import type { AuditActorContext } from "../common/audit.js";
import { appendAuditRecord } from "../common/audit.js";
import { crmUserSummarySelect } from "../common/crm-users.js";
import { ApiError } from "../common/errors.js";

const MAX_ATTACHMENTS_PER_LEAD = 20;

const extensionKinds: Readonly<Record<string, LeadAttachmentKind>> = {
  ".jpg": "IMAGE", ".jpeg": "IMAGE", ".png": "IMAGE", ".gif": "IMAGE", ".webp": "IMAGE",
  ".mp4": "VIDEO", ".webm": "VIDEO", ".mov": "VIDEO",
  ".pdf": "DOCUMENT", ".doc": "DOCUMENT", ".docx": "DOCUMENT", ".xls": "DOCUMENT", ".xlsx": "DOCUMENT",
  ".ppt": "DOCUMENT", ".pptx": "DOCUMENT", ".txt": "DOCUMENT", ".csv": "DOCUMENT", ".rtf": "DOCUMENT",
};

const allowedMimeTypes = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm", "video/quicktime",
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "application/rtf", "text/rtf", "application/octet-stream",
]);

export const leadAttachmentSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  kind: true,
  sizeBytes: true,
  createdAt: true,
  uploadedBy: { select: crmUserSummarySelect },
} as const;

function normalizedFileMetadata(upload: MultipartFile): { originalName: string; extension: string; kind: LeadAttachmentKind; mimeType: string } {
  const originalName = basename(upload.filename || "").trim().slice(0, 255);
  const extension = extname(originalName).toLowerCase();
  const kind = extensionKinds[extension];
  const mimeType = upload.mimetype.toLowerCase();
  if (!originalName || !kind || !allowedMimeTypes.has(mimeType)) {
    upload.file.resume();
    throw new ApiError(415, "ATTACHMENT_TYPE_NOT_ALLOWED", "仅支持图片、视频、PDF、Office、TXT、CSV 和 RTF 文件");
  }
  return { originalName, extension, kind, mimeType };
}

function safeStoragePath(storageDir: string, storedPath: string): string {
  const root = resolve(storageDir);
  const filePath = resolve(storedPath);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    throw new ApiError(500, "ATTACHMENT_STORAGE_INVALID", "附件存储路径无效");
  }
  return filePath;
}

async function unlinkIfPresent(path: string): Promise<void> {
  await unlink(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export class LeadAttachmentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storageDir: string,
    private readonly maxAttachmentBytes: number,
  ) {}

  async create(leadId: string, upload: MultipartFile | undefined, uploadedByUserId: string, audit: AuditActorContext) {
    if (!upload) throw new ApiError(422, "ATTACHMENT_REQUIRED", "请选择需要上传的附件");
    const metadata = normalizedFileMetadata(upload);
    const [lead, attachmentCount] = await Promise.all([
      this.prisma.crmLead.findUnique({ where: { id: leadId }, select: { id: true } }),
      this.prisma.leadAttachment.count({ where: { leadId } }),
    ]);
    if (!lead) {
      upload.file.resume();
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "线索不存在");
    }
    if (attachmentCount >= MAX_ATTACHMENTS_PER_LEAD) {
      upload.file.resume();
      throw new ApiError(409, "ATTACHMENT_LIMIT_REACHED", `每条线索最多上传 ${MAX_ATTACHMENTS_PER_LEAD} 个附件`);
    }

    const id = randomBytes(16).toString("hex");
    const targetDir = join(this.storageDir, "leads", leadId);
    const targetPath = join(targetDir, `${id}${metadata.extension}`);
    const temporaryPath = `${targetPath}.uploading`;
    await mkdir(targetDir, { recursive: true });

    const hash = createHash("sha256");
    let sizeBytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    try {
      await pipeline(upload.file, meter, createWriteStream(temporaryPath, { flags: "wx" }));
      if (upload.file.truncated || sizeBytes > this.maxAttachmentBytes) {
        throw new ApiError(413, "ATTACHMENT_TOO_LARGE", `单个附件不能超过 ${Math.floor(this.maxAttachmentBytes / 1024 / 1024)} MB`);
      }
      if (sizeBytes === 0) throw new ApiError(422, "ATTACHMENT_EMPTY", "不能上传空文件");
      await rename(temporaryPath, targetPath);
    } catch (error) {
      await unlinkIfPresent(temporaryPath);
      if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
        throw new ApiError(413, "ATTACHMENT_TOO_LARGE", `单个附件不能超过 ${Math.floor(this.maxAttachmentBytes / 1024 / 1024)} MB`);
      }
      throw error;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.leadAttachment.create({
          data: {
            id,
            leadId,
            originalName: metadata.originalName,
            mimeType: metadata.mimeType,
            kind: metadata.kind,
            sizeBytes,
            fileHash: hash.digest("hex"),
            storagePath: targetPath,
            uploadedByUserId,
          },
          select: leadAttachmentSelect,
        });
        await appendAuditRecord(tx, audit, {
          action: "UPLOAD_LEAD_ATTACHMENT",
          module: "crm",
          targetType: "lead_attachment",
          targetId: id,
          details: { leadId, originalName: metadata.originalName, kind: metadata.kind, sizeBytes },
        });
        return row;
      });
    } catch (error) {
      await unlinkIfPresent(targetPath);
      throw error;
    }
  }

  async findForDownload(leadId: string, attachmentId: string) {
    const row = await this.prisma.leadAttachment.findFirst({ where: { id: attachmentId, leadId } });
    if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "附件不存在");
    const path = safeStoragePath(this.storageDir, row.storagePath);
    try {
      await stat(path);
    } catch {
      throw new ApiError(404, "ATTACHMENT_FILE_MISSING", "附件文件不存在");
    }
    return { row, stream: createReadStream(path) };
  }

  async remove(leadId: string, attachmentId: string, audit: AuditActorContext) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.leadAttachment.findFirst({ where: { id: attachmentId, leadId } });
      if (!existing) throw new ApiError(404, "RESOURCE_NOT_FOUND", "附件不存在");
      await tx.leadAttachment.delete({ where: { id: attachmentId } });
      await appendAuditRecord(tx, audit, {
        action: "DELETE_LEAD_ATTACHMENT",
        module: "crm",
        targetType: "lead_attachment",
        targetId: attachmentId,
        details: { leadId, originalName: existing.originalName, kind: existing.kind, sizeBytes: existing.sizeBytes },
      });
      return existing;
    });
    await unlinkIfPresent(safeStoragePath(this.storageDir, row.storagePath)).catch(() => undefined);
    return { id: attachmentId };
  }

  async removeFiles(storagePaths: string[]): Promise<void> {
    await Promise.all(storagePaths.map(async (storedPath) => {
      const path = safeStoragePath(this.storageDir, storedPath);
      await unlinkIfPresent(path).catch(() => undefined);
    }));
  }
}

export function contentDispositionFilename(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "attachment";
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
