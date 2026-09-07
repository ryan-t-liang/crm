import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendAudit } from "../common/audit.js";
import { guard } from "../common/auth.js";
import { ApiError } from "../common/errors.js";
import { jobNumber } from "../common/ids.js";
import { executeCrmImportJob, persistCrmExport, prepareCrmImport } from "./crm-import-export.service.js";
import { crmImportFields, crmTemplateFilename, crmTemplateWorkbook } from "./crm-schema.js";
import { jobPermission, type CrmJobObjectType } from "./job-types.js";
import { fileSha256 } from "./workbook.js";

const crmObjectTypeSchema = z.enum(["CONTACT", "CRM_LEAD", "MARKETING_LEAD", "ORGANIZATION"]);
const importQuerySchema = z.object({ allowDuplicate: z.coerce.boolean().default(false), createMissingOrganization: z.coerce.boolean().default(false) });
const historyQuerySchema = z.object({
  objectType: crmObjectTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function filenameHeader(filename: string): string {
  return `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`;
}

function assertPermission(request: FastifyRequest, objectType: string, action: "import" | "export") {
  if (!request.auth?.permissions.has(jobPermission(objectType, action))) {
    throw new ApiError(403, "PERMISSION_DENIED", "当前账户没有此操作权限");
  }
}

function routeObjectType(routeObject: "contacts" | "leads" | "marketing-leads" | "organizations"): CrmJobObjectType {
  return routeObject === "contacts" ? "CONTACT" : routeObject === "leads" ? "CRM_LEAD" : routeObject === "marketing-leads" ? "MARKETING_LEAD" : "ORGANIZATION";
}

function allowedCrmObjectTypes(request: FastifyRequest, action: "import" | "export"): CrmJobObjectType[] {
  return (["CONTACT", "CRM_LEAD", "MARKETING_LEAD", "ORGANIZATION"] as const).filter((objectType) => request.auth!.permissions.has(jobPermission(objectType, action)));
}

export async function crmImportExportRoutes(app: FastifyInstance): Promise<void> {
  for (const routeObject of ["contacts", "leads", "marketing-leads", "organizations"] as const) {
    const objectType = routeObjectType(routeObject);
    const importPermission = jobPermission(objectType, "import");
    const exportPermission = jobPermission(objectType, "export");

    app.get(`/api/v1/crm/templates/${routeObject}`, { preHandler: guard(importPermission) }, async (_request, reply) => {
      const buffer = await crmTemplateWorkbook(objectType);
      return reply
        .header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header("content-disposition", filenameHeader(crmTemplateFilename(objectType)))
        .send(buffer);
    });

    app.post(`/api/v1/crm/imports/${routeObject}`, { preHandler: guard(importPermission) }, async (request, reply) => {
      const query = importQuerySchema.parse(request.query);
      const upload = await request.file();
      if (!upload || !upload.filename.toLowerCase().endsWith(".xlsx")) throw new ApiError(400, "INVALID_FILE", "请上传 .xlsx 文件");
      const allowedMime = new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"]);
      if (upload.mimetype && !allowedMime.has(upload.mimetype)) throw new ApiError(400, "INVALID_FILE_TYPE", "文件类型必须是 XLSX");
      const buffer = await upload.toBuffer();
      const hash = fileSha256(buffer);
      if (!query.allowDuplicate) {
        const duplicate = await app.prisma.importJob.findFirst({
          where: { objectType, fileHash: hash, status: { not: "FAILED" } },
          orderBy: { createdAt: "desc" },
        });
        if (duplicate) throw new ApiError(409, "IMPORT_FILE_DUPLICATE", "相同文件已上传。如需重新执行，请明确确认重新上传。", { existingJobId: duplicate.id });
      }
      const prepared = await prepareCrmImport(app, objectType, buffer, { createMissingOrganization: query.createMissingOrganization });
      const jobNo = jobNumber("IMP");
      const directory = join(app.config.storageDir, "imports");
      await mkdir(directory, { recursive: true });
      const storagePath = join(directory, `${jobNo}.xlsx`);
      await writeFile(storagePath, buffer);
      const originalName = basename(upload.filename).slice(0, 255);
      const job = await app.prisma.$transaction(async (tx) => {
        const created = await tx.importJob.create({
          data: {
            jobNo, objectType, subtype: objectType === "CONTACT" ? "CRM_CONTACT" : objectType === "CRM_LEAD" ? "CRM_OPPORTUNITY" : objectType === "MARKETING_LEAD" ? "MARKETING_LEAD" : "CRM_ORGANIZATION",
            fileName: originalName, storagePath, fileHash: hash,
            mappingJson: {
              schemaVersion: "CRM_2.0", headers: prepared.parsed.headers,
              fields: crmImportFields(objectType), mapping: prepared.mapping, preflightSummary: prepared.summary, createMissingOrganization: query.createMissingOrganization,
            },
            status: "UPLOADED", totalCount: prepared.summary.totalRows, importableCount: prepared.summary.importableRows,
            createdBy: request.auth!.userId,
          },
        });
        await appendAudit(tx, request, {
          action: "IMPORT_UPLOAD", module: "crm_import", targetType: "import_job", targetId: created.id,
          details: { objectType, fileName: originalName, fileHash: hash, rowCount: prepared.summary.totalRows },
        });
        await tx.importJobRow.createMany({
          data: prepared.rows.map((row) => ({
            importJobId: created.id, rowNumber: row.rowNumber, status: row.status, identity: row.identity,
            rawData: row.rawData, normalizedData: row.normalizedData as Prisma.InputJsonValue,
            errors: row.errors, warnings: row.warnings,
          })),
        });
        const ready = await tx.importJob.update({ where: { id: created.id }, data: { status: "PREFLIGHT_READY", preflightedAt: new Date() } });
        await appendAudit(tx, request, {
          action: "IMPORT_PREFLIGHT", module: "crm_import", targetType: "import_job", targetId: created.id,
          details: { objectType, ...prepared.summary },
        });
        return ready;
      });
      return reply.status(201).send({ data: { ...job, mapping: prepared.mapping, preflight: prepared.summary, rows: prepared.rows.slice(0, 500) } });
    });

    app.post(`/api/v1/crm/exports/${routeObject}`, { preHandler: guard(exportPermission) }, async (request, reply) => {
      z.object({}).strict().parse(request.body ?? {});
      const job = await persistCrmExport(app, request, objectType);
      return reply.status(201).send({ data: { ...job, downloadUrl: `/api/v1/crm/exports/${job.id}/download` } });
    });
  }

  app.post<{ Params: { id: string } }>("/api/v1/crm/imports/:id/execute", { preHandler: guard() }, async (request) => {
    const job = await app.prisma.importJob.findFirst({ where: { id: request.params.id, objectType: { in: ["CONTACT", "CRM_LEAD", "MARKETING_LEAD", "ORGANIZATION"] } } });
    if (!job) throw new ApiError(404, "RESOURCE_NOT_FOUND", "CRM 导入任务不存在");
    assertPermission(request, job.objectType, "import");
    return { data: await executeCrmImportJob(app, request, job.id) };
  });

  app.get("/api/v1/crm/imports", { preHandler: guard() }, async (request) => {
    const query = historyQuerySchema.parse(request.query);
    if (query.objectType) assertPermission(request, query.objectType, "import");
    const objectTypes = query.objectType ? [query.objectType] : allowedCrmObjectTypes(request, "import");
    if (!objectTypes.length) throw new ApiError(403, "PERMISSION_DENIED", "当前账户没有 CRM Import 权限");
    const where = { objectType: { in: objectTypes } } satisfies Prisma.ImportJobWhereInput;
    const [total, rows] = await app.prisma.$transaction([
      app.prisma.importJob.count({ where }),
      app.prisma.importJob.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    ]);
    const operators = await app.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.createdBy))] } }, select: { id: true, name: true, loginAccount: true } });
    const names = new Map(operators.map((operator) => [operator.id, { name: operator.name, loginAccount: operator.loginAccount }]));
    return {
      data: rows.map((row) => ({ ...row, operatorName: names.get(row.createdBy)?.name ?? "已删除账号", operatorLoginAccount: names.get(row.createdBy)?.loginAccount ?? null })),
      meta: { page: query.page, pageSize: query.pageSize, total, pageCount: Math.ceil(total / query.pageSize) },
    };
  });

  app.get<{ Params: { id: string } }>("/api/v1/crm/imports/:id", { preHandler: guard() }, async (request) => {
    const job = await app.prisma.importJob.findFirst({
      where: { id: request.params.id, objectType: { in: ["CONTACT", "CRM_LEAD", "MARKETING_LEAD", "ORGANIZATION"] } },
      include: { rows: { orderBy: { rowNumber: "asc" }, take: 1000 } },
    });
    if (!job) throw new ApiError(404, "RESOURCE_NOT_FOUND", "CRM 导入任务不存在");
    assertPermission(request, job.objectType, "import");
    return { data: job };
  });

  app.get<{ Params: { id: string } }>("/api/v1/crm/imports/:id/failures", { preHandler: guard() }, async (request, reply) => {
    const job = await app.prisma.importJob.findFirst({ where: { id: request.params.id, objectType: { in: ["CONTACT", "CRM_LEAD", "MARKETING_LEAD", "ORGANIZATION"] } } });
    if (!job) throw new ApiError(404, "RESOURCE_NOT_FOUND", "CRM 导入任务不存在");
    assertPermission(request, job.objectType, "import");
    if (!job.failureFilePath) throw new ApiError(404, "RESOURCE_NOT_FOUND", "该任务没有失败明细文件");
    const buffer = await readFile(job.failureFilePath);
    await appendAudit(app.prisma, request, { action: "IMPORT_FAILURE_DOWNLOAD", module: "crm_import", targetType: "import_job", targetId: job.id, details: { objectType: job.objectType } });
    return reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", filenameHeader(`${job.jobNo}-failures.csv`)).send(buffer);
  });

  app.get("/api/v1/crm/exports", { preHandler: guard() }, async (request) => {
    const query = historyQuerySchema.parse(request.query);
    if (query.objectType) assertPermission(request, query.objectType, "export");
    const objectTypes = query.objectType ? [query.objectType] : allowedCrmObjectTypes(request, "export");
    if (!objectTypes.length) throw new ApiError(403, "PERMISSION_DENIED", "当前账户没有 CRM Export 权限");
    const where = { objectType: { in: objectTypes } } satisfies Prisma.ExportJobWhereInput;
    const [total, rows] = await app.prisma.$transaction([
      app.prisma.exportJob.count({ where }),
      app.prisma.exportJob.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    ]);
    return { data: rows, meta: { page: query.page, pageSize: query.pageSize, total, pageCount: Math.ceil(total / query.pageSize) } };
  });

  app.get<{ Params: { id: string } }>("/api/v1/crm/exports/:id", { preHandler: guard() }, async (request) => {
    const job = await app.prisma.exportJob.findFirst({ where: { id: request.params.id, objectType: { in: ["CONTACT", "CRM_LEAD", "MARKETING_LEAD", "ORGANIZATION"] } } });
    if (!job) throw new ApiError(404, "RESOURCE_NOT_FOUND", "CRM 导出任务不存在");
    assertPermission(request, job.objectType, "export");
    return { data: { ...job, downloadUrl: job.status === "COMPLETED" ? `/api/v1/crm/exports/${job.id}/download` : null } };
  });

  app.get<{ Params: { id: string } }>("/api/v1/crm/exports/:id/download", { preHandler: guard() }, async (request, reply) => {
    const job = await app.prisma.exportJob.findFirst({
      where: { id: request.params.id, objectType: { in: ["CONTACT", "CRM_LEAD", "MARKETING_LEAD", "ORGANIZATION"] }, createdBy: request.auth!.userId },
    });
    if (!job) throw new ApiError(404, "RESOURCE_NOT_FOUND", "CRM 导出文件不存在或无权下载");
    assertPermission(request, job.objectType, "export");
    if (!job.storagePath || !job.fileName || job.status !== "COMPLETED" || (job.expiresAt && job.expiresAt <= new Date())) {
      throw new ApiError(404, "EXPORT_EXPIRED", "CRM 导出文件不存在或已过期");
    }
    const buffer = await readFile(job.storagePath);
    await appendAudit(app.prisma, request, { action: "EXPORT_DOWNLOAD", module: "crm_export", targetType: "export_job", targetId: job.id, details: { objectType: job.objectType, fileName: job.fileName, rowCount: job.rowCount } });
    return reply.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("content-disposition", filenameHeader(job.fileName)).send(buffer);
  });
}
