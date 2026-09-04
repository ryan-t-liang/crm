import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, extname, posix, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { CrmAttachmentEntityType, CrmAttachmentKind, Prisma, PrismaClient } from "@prisma/client";
import type { MultipartFile } from "@fastify/multipart";
import type { AuditActorContext } from "../common/audit.js";
import { appendAuditRecord } from "../common/audit.js";
import { crmUserSummarySelect, type CrmDbClient } from "../common/crm-users.js";
import { ApiError } from "../common/errors.js";

const MAX_ATTACHMENTS_PER_FIELD = 20;
const MAX_SIGNATURE_BYTES = 512 * 1024;

type AttachmentRule = {
  kind: CrmAttachmentKind;
  mimeTypes: readonly string[];
  signature: "jpeg" | "png" | "gif" | "webp" | "pdf" | "ole" | "docx" | "xlsx" | "pptx" | "mp4" | "webm" | "text";
};

const extensionRules: Readonly<Record<string, AttachmentRule>> = {
  ".jpg": { kind: "IMAGE", mimeTypes: ["image/jpeg"], signature: "jpeg" },
  ".jpeg": { kind: "IMAGE", mimeTypes: ["image/jpeg"], signature: "jpeg" },
  ".png": { kind: "IMAGE", mimeTypes: ["image/png"], signature: "png" },
  ".gif": { kind: "IMAGE", mimeTypes: ["image/gif"], signature: "gif" },
  ".webp": { kind: "IMAGE", mimeTypes: ["image/webp"], signature: "webp" },
  ".mp4": { kind: "VIDEO", mimeTypes: ["video/mp4"], signature: "mp4" },
  ".mov": { kind: "VIDEO", mimeTypes: ["video/quicktime"], signature: "mp4" },
  ".webm": { kind: "VIDEO", mimeTypes: ["video/webm"], signature: "webm" },
  ".pdf": { kind: "DOCUMENT", mimeTypes: ["application/pdf"], signature: "pdf" },
  ".doc": { kind: "DOCUMENT", mimeTypes: ["application/msword"], signature: "ole" },
  ".docx": { kind: "DOCUMENT", mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], signature: "docx" },
  ".xls": { kind: "DOCUMENT", mimeTypes: ["application/vnd.ms-excel"], signature: "ole" },
  ".xlsx": { kind: "DOCUMENT", mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], signature: "xlsx" },
  ".ppt": { kind: "DOCUMENT", mimeTypes: ["application/vnd.ms-powerpoint"], signature: "ole" },
  ".pptx": { kind: "DOCUMENT", mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"], signature: "pptx" },
  ".txt": { kind: "DOCUMENT", mimeTypes: ["text/plain"], signature: "text" },
};

const fieldKinds: Readonly<Record<string, readonly CrmAttachmentKind[]>> = {
  "CONTACT:meetingMinutesFiles": ["DOCUMENT", "IMAGE", "VIDEO"],
  "LEAD:requirementFiles": ["DOCUMENT", "IMAGE", "VIDEO"],
  "LEAD:requirementImages": ["IMAGE"],
  "LEAD:proposalFiles": ["DOCUMENT", "IMAGE", "VIDEO"],
  "LEAD:quotationFiles": ["DOCUMENT", "IMAGE"],
};

export const crmAttachmentSelect = {
  id: true,
  entityType: true,
  entityId: true,
  fieldKey: true,
  storageType: true,
  originalName: true,
  mimeType: true,
  kind: true,
  fileSize: true,
  externalUrl: true,
  createdAt: true,
  uploadedBy: { select: crmUserSummarySelect },
} satisfies Prisma.CrmAttachmentSelect;

function requireFieldRule(entityType: CrmAttachmentEntityType, fieldKey: string): readonly CrmAttachmentKind[] {
  const allowedKinds = fieldKinds[`${entityType}:${fieldKey}`];
  if (!allowedKinds) throw new ApiError(422, "ATTACHMENT_FIELD_NOT_ALLOWED", "该业务字段不支持附件");
  return allowedKinds;
}

function normalizedFileMetadata(entityType: CrmAttachmentEntityType, fieldKey: string, upload: MultipartFile) {
  const allowedKinds = requireFieldRule(entityType, fieldKey);
  const originalName = basename(upload.filename || "").trim().slice(0, 255);
  const extension = extname(originalName).toLowerCase();
  const rule = extensionRules[extension];
  const mimeType = (String(upload.mimetype || "").toLowerCase().split(";", 1).at(0) ?? "").trim();
  if (!originalName || !rule || !rule.mimeTypes.includes(mimeType) || !allowedKinds.includes(rule.kind)) {
    upload.file.resume();
    throw new ApiError(415, "ATTACHMENT_TYPE_NOT_ALLOWED", "文件扩展名、MIME 类型或业务字段不匹配");
  }
  return { originalName, extension, kind: rule.kind, mimeType, signature: rule.signature };
}

function hasPrefix(buffer: Buffer, bytes: number[]): boolean {
  return buffer.length >= bytes.length && bytes.every((value, index) => buffer[index] === value);
}

function hasAscii(buffer: Buffer, value: string): boolean {
  return buffer.indexOf(Buffer.from(value, "ascii")) >= 0;
}

function signatureMatches(buffer: Buffer, signature: AttachmentRule["signature"]): boolean {
  if (signature === "jpeg") return hasPrefix(buffer, [0xff, 0xd8, 0xff]);
  if (signature === "png") return hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (signature === "gif") return hasAscii(buffer.subarray(0, 6), "GIF87a") || hasAscii(buffer.subarray(0, 6), "GIF89a");
  if (signature === "webp") return hasAscii(buffer.subarray(0, 4), "RIFF") && hasAscii(buffer.subarray(8, 12), "WEBP");
  if (signature === "pdf") return hasAscii(buffer.subarray(0, 5), "%PDF-");
  if (signature === "ole") return hasPrefix(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (signature === "webm") return hasPrefix(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
  if (signature === "mp4") return buffer.length >= 12 && hasAscii(buffer.subarray(4, 8), "ftyp");
  if (signature === "text") {
    try {
      if (buffer.includes(0)) return false;
      new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      return true;
    } catch {
      return false;
    }
  }
  const isZip = hasPrefix(buffer, [0x50, 0x4b, 0x03, 0x04]);
  if (!isZip || !hasAscii(buffer, "[Content_Types].xml")) return false;
  if (signature === "docx") return hasAscii(buffer, "word/");
  if (signature === "xlsx") return hasAscii(buffer, "xl/");
  return hasAscii(buffer, "ppt/");
}

function safeStoragePath(storageDir: string, storedKey: string): string {
  const root = resolve(storageDir);
  const filePath = resolve(root, storedKey);
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

async function requireEntity(db: CrmDbClient, entityType: CrmAttachmentEntityType, entityId: string): Promise<void> {
  const row = entityType === "CONTACT"
    ? await db.contact.findUnique({ where: { id: entityId }, select: { id: true } })
    : entityType === "LEAD"
      ? await db.crmLead.findUnique({ where: { id: entityId }, select: { id: true } })
      : entityType === "CONTACT_FOLLOWUP"
        ? await db.contactFollowup.findUnique({ where: { id: entityId }, select: { id: true } })
        : await db.leadFollowup.findUnique({ where: { id: entityId }, select: { id: true } });
  if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "附件所属业务记录不存在");
}

export class CrmAttachmentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storageDir: string,
    private readonly maxAttachmentBytes: number,
  ) {}

  async list(entityType: CrmAttachmentEntityType, entityId: string) {
    await requireEntity(this.prisma, entityType, entityId);
    return this.prisma.crmAttachment.findMany({
      where: { entityType, entityId },
      select: crmAttachmentSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async create(entityType: CrmAttachmentEntityType, entityId: string, fieldKey: string, upload: MultipartFile | undefined, uploadedByUserId: string, audit: AuditActorContext) {
    if (!upload) throw new ApiError(422, "ATTACHMENT_REQUIRED", "请选择需要上传的附件");
    const metadata = normalizedFileMetadata(entityType, fieldKey, upload);
    const [attachmentCount] = await Promise.all([
      this.prisma.crmAttachment.count({ where: { entityType, entityId, fieldKey } }),
      requireEntity(this.prisma, entityType, entityId),
    ]);
    if (attachmentCount >= MAX_ATTACHMENTS_PER_FIELD) {
      upload.file.resume();
      throw new ApiError(409, "ATTACHMENT_LIMIT_REACHED", `每个附件字段最多上传 ${MAX_ATTACHMENTS_PER_FIELD} 个文件`);
    }

    const id = randomBytes(16).toString("hex");
    const relativeKey = posix.join("crm-attachments", entityType.toLowerCase().replaceAll("_", "-"), entityId, `${id}${metadata.extension}`);
    const targetPath = safeStoragePath(this.storageDir, relativeKey);
    const temporaryPath = `${targetPath}.uploading`;
    await mkdir(dirname(targetPath), { recursive: true });

    const hash = createHash("sha256");
    const signatureChunks: Buffer[] = [];
    let signatureBytes = 0;
    let fileSize = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        fileSize += chunk.length;
        hash.update(chunk);
        if (signatureBytes < MAX_SIGNATURE_BYTES) {
          const part = chunk.subarray(0, MAX_SIGNATURE_BYTES - signatureBytes);
          signatureChunks.push(part);
          signatureBytes += part.length;
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(upload.file, meter, createWriteStream(temporaryPath, { flags: "wx" }));
      if (upload.file.truncated || fileSize > this.maxAttachmentBytes) {
        throw new ApiError(413, "ATTACHMENT_TOO_LARGE", `单个附件不能超过 ${Math.floor(this.maxAttachmentBytes / 1024 / 1024)} MB`);
      }
      if (fileSize === 0) throw new ApiError(422, "ATTACHMENT_EMPTY", "不能上传空文件");
      if (!signatureMatches(Buffer.concat(signatureChunks), metadata.signature)) {
        throw new ApiError(415, "ATTACHMENT_MIME_MISMATCH", "文件内容与扩展名或 MIME 类型不一致");
      }
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
        const row = await tx.crmAttachment.create({
          data: {
            id, entityType, entityId, fieldKey, storageType: "LOCAL",
            originalName: metadata.originalName, mimeType: metadata.mimeType, kind: metadata.kind,
            fileSize, fileHash: hash.digest("hex"), storageKey: relativeKey, uploadedByUserId,
          },
          select: crmAttachmentSelect,
        });
        await appendAuditRecord(tx, audit, {
          action: "UPLOAD_ATTACHMENT", module: "crm", targetType: "crm_attachment", targetId: id,
          details: { entityType, entityId, fieldKey, originalName: metadata.originalName, kind: metadata.kind, fileSize },
        });
        return row;
      });
    } catch (error) {
      await unlinkIfPresent(targetPath);
      throw error;
    }
  }

  async createExternal(entityType: CrmAttachmentEntityType, entityId: string, fieldKey: string, externalUrl: string, uploadedByUserId: string, audit: AuditActorContext) {
    const allowedKinds = requireFieldRule(entityType, fieldKey);
    let parsed: URL;
    try { parsed = new URL(externalUrl); } catch { throw new ApiError(422, "INVALID_ATTACHMENT_URL", "附件 URL 无效"); }
    if (!["http:", "https:"].includes(parsed.protocol)) throw new ApiError(422, "INVALID_ATTACHMENT_URL", "附件 URL 仅支持 HTTP 或 HTTPS");
    const originalName = basename(decodeURIComponent(parsed.pathname))?.slice(0, 255) || "外部附件";
    const rule = extensionRules[extname(originalName).toLowerCase()];
    if (!rule || !allowedKinds.includes(rule.kind)) throw new ApiError(415, "ATTACHMENT_TYPE_NOT_ALLOWED", "附件 URL 的文件扩展名不适用于该业务字段");
    const [attachmentCount] = await Promise.all([
      this.prisma.crmAttachment.count({ where: { entityType, entityId, fieldKey } }),
      requireEntity(this.prisma, entityType, entityId),
    ]);
    if (attachmentCount >= MAX_ATTACHMENTS_PER_FIELD) throw new ApiError(409, "ATTACHMENT_LIMIT_REACHED", `每个附件字段最多上传 ${MAX_ATTACHMENTS_PER_FIELD} 个文件`);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.crmAttachment.create({
        data: { id: randomBytes(16).toString("hex"), entityType, entityId, fieldKey, storageType: "EXTERNAL_URL", originalName, kind: rule.kind, externalUrl: parsed.toString(), uploadedByUserId },
        select: crmAttachmentSelect,
      });
      await appendAuditRecord(tx, audit, {
        action: "UPLOAD_ATTACHMENT", module: "crm", targetType: "crm_attachment", targetId: row.id,
        details: { entityType, entityId, fieldKey, originalName, storageType: "EXTERNAL_URL" },
      });
      return row;
    });
  }

  async findForDownload(entityType: CrmAttachmentEntityType, entityId: string, attachmentId: string, audit: AuditActorContext) {
    await requireEntity(this.prisma, entityType, entityId);
    const row = await this.prisma.crmAttachment.findFirst({ where: { id: attachmentId, entityType, entityId } });
    if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "附件不存在");
    await appendAuditRecord(this.prisma, audit, {
      action: "DOWNLOAD_ATTACHMENT", module: "crm", targetType: "crm_attachment", targetId: attachmentId,
      details: { entityType, entityId, fieldKey: row.fieldKey, storageType: row.storageType },
    });
    if (row.storageType === "EXTERNAL_URL") {
      if (!row.externalUrl) throw new ApiError(404, "ATTACHMENT_FILE_MISSING", "外部附件地址不存在");
      return { row, externalUrl: row.externalUrl, stream: null };
    }
    if (!row.storageKey) throw new ApiError(404, "ATTACHMENT_FILE_MISSING", "附件文件不存在");
    const path = safeStoragePath(this.storageDir, row.storageKey);
    try { await stat(path); } catch { throw new ApiError(404, "ATTACHMENT_FILE_MISSING", "附件文件不存在"); }
    return { row, externalUrl: null, stream: createReadStream(path) };
  }

  async remove(entityType: CrmAttachmentEntityType, entityId: string, attachmentId: string, audit: AuditActorContext) {
    const row = await this.prisma.$transaction(async (tx) => {
      await requireEntity(tx, entityType, entityId);
      const existing = await tx.crmAttachment.findFirst({ where: { id: attachmentId, entityType, entityId } });
      if (!existing) throw new ApiError(404, "RESOURCE_NOT_FOUND", "附件不存在");
      await tx.crmAttachment.delete({ where: { id: attachmentId } });
      await appendAuditRecord(tx, audit, {
        action: "DELETE_ATTACHMENT", module: "crm", targetType: "crm_attachment", targetId: attachmentId,
        details: { entityType, entityId, fieldKey: existing.fieldKey, originalName: existing.originalName, kind: existing.kind, fileSize: existing.fileSize },
      });
      return existing;
    });
    if (row.storageType === "LOCAL" && row.storageKey) await unlinkIfPresent(safeStoragePath(this.storageDir, row.storageKey)).catch(() => undefined);
    return { id: attachmentId };
  }

  async deleteForEntity(entityType: CrmAttachmentEntityType, entityId: string) {
    const rows = await this.prisma.crmAttachment.findMany({ where: { entityType, entityId }, select: { storageType: true, storageKey: true } });
    await this.prisma.crmAttachment.deleteMany({ where: { entityType, entityId } });
    return rows.filter((row) => row.storageType === "LOCAL" && row.storageKey).map((row) => row.storageKey as string);
  }

  async removeFiles(storageKeys: string[]): Promise<void> {
    await Promise.all(storageKeys.map(async (storageKey) => unlinkIfPresent(safeStoragePath(this.storageDir, storageKey)).catch(() => undefined)));
  }
}

export function contentDispositionFilename(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "attachment";
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
