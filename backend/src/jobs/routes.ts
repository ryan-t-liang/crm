import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendAudit } from "../common/audit.js";
import { guard } from "../common/auth.js";
import { resolveBrand, visibleBrandIds } from "../common/brand.js";
import { ApiError } from "../common/errors.js";
import { jobNumber } from "../common/ids.js";
import { customerExportFields, formalImportFields, formalTemplateFilename, leadExportFields, type BrandCode, type ImportObjectType } from "./formal-schema.js";
import { executeImportJob, fileSha256, prepareImport, templateWorkbook, type LeadConflictStrategy, type LeadUnmatchedStrategy, type MemberConflictStrategy } from "./import-export.service.js";

const uploadQuerySchema = z.object({
  brandCode: z.enum(["GP", "UN"]), conflictStrategy: z.string().optional(),
  unmatchedStrategy: z.enum(["IMPORT_LEAD_ONLY", "CREATE_MEMBER"]).optional(), allowDuplicate: z.coerce.boolean().default(false),
});
const executeSchema = z.object({ conflictStrategy: z.string().optional(), unmatchedStrategy: z.enum(["IMPORT_LEAD_ONLY", "CREATE_MEMBER"]).optional() });
const exportSchema = z.object({
  scope: z.enum(["CURRENT_FILTER", "SELECTED_IDS", "ALL"]).default("ALL"), brandCode: z.enum(["GP", "UN"]).optional(),
  fields: z.array(z.string()).max(100).optional(), selectedIds: z.array(z.string()).max(5000).optional(), filter: z.record(z.string(), z.unknown()).optional(),
});

function filenameHeader(filename: string): string { return `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`; }
function assertImportStrategy(objectType: ImportObjectType, value?: string): MemberConflictStrategy | LeadConflictStrategy {
  if (objectType === "CUSTOMER") {
    const strategy = value ?? "SKIP";
    if (!["SKIP", "FILL_EMPTY", "OVERWRITE"].includes(strategy)) throw new ApiError(400, "INVALID_CONFLICT_STRATEGY", "会员冲突策略必须为 SKIP、FILL_EMPTY 或 OVERWRITE");
    return strategy as MemberConflictStrategy;
  }
  const strategy = value ?? "SKIP";
  if (!["SKIP", "UPDATE_EXISTING"].includes(strategy)) throw new ApiError(400, "INVALID_CONFLICT_STRATEGY", "线索冲突策略必须为 SKIP 或 UPDATE_EXISTING");
  return strategy as LeadConflictStrategy;
}
function requiredPermission(objectType: string, action: "import" | "export"): string { return `${objectType === "CUSTOMER" ? "customer" : "lead"}.${action}`; }
function assertJobPermission(request: FastifyRequest, objectType: string, action: "import" | "export"): void {
  if (!request.auth?.permissions.has(requiredPermission(objectType, action))) throw new ApiError(403, "PERMISSION_DENIED", "当前账户没有此操作权限");
}
async function activeForm(app: FastifyInstance, brandId: string, objectType: ImportObjectType) {
  const form = await app.prisma.formDefinition.findFirst({ where: { brandId, objectType, active: true }, orderBy: { effectiveAt: "desc" } });
  if (!form) throw new ApiError(404, "RESOURCE_NOT_FOUND", "没有可用的表单配置");
  return form;
}
function importableCount(objectType: ImportObjectType, rows: Array<{ status: string; errors: unknown[] }>, strategy: string): number {
  return rows.filter((row) => !row.errors.length && !((objectType === "CUSTOMER" ? row.status === "EXISTING_PROFILE" : row.status === "EXISTING_LEAD") && strategy === "SKIP")).length;
}
function scopedBrandWhere(request: FastifyRequest, brandId?: string): Prisma.CustomerBrandProfileWhereInput {
  if (brandId) return { brandId };
  const ids = visibleBrandIds(request); return ids ? { brandId: { in: ids } } : {};
}
function customerExportWhere(request: FastifyRequest, filter: Record<string, unknown>, brandId?: string): Prisma.CustomerWhereInput {
  const profileScope = scopedBrandWhere(request, brandId); const where: Prisma.CustomerWhereInput = { profiles: { some: profileScope } };
  const value = String(filter.value ?? filter.keyword ?? "").trim(); const field = String(filter.field ?? "");
  if (filter.status) where.status = String(filter.status);
  if (filter.createdFrom || filter.createdTo) where.createdAt = { gte: filter.createdFrom ? new Date(String(filter.createdFrom)) : undefined, lte: filter.createdTo ? new Date(String(filter.createdTo)) : undefined };
  if (value) {
    if (field === "customerNo") where.customerNo = { contains: value };
    else if (field === "mobile") where.mobileNormalized = { contains: value.replace(/[\s\-()]/g, "") };
    else if (field === "displayName") where.displayName = { contains: value };
    else if (["email", "firstName", "lastName", "country", "region", "city", "language", "preferredContact", "interestCenter", "favoriteCollection"].includes(field)) where.profiles = { some: { ...profileScope, [field]: { contains: value } } };
    else where.OR = [{ customerNo: { contains: value } }, { displayName: { contains: value } }, { mobileNormalized: { contains: value.replace(/[\s\-()]/g, "") } }, { profiles: { some: { ...profileScope, OR: [{ email: { contains: value } }, { firstName: { contains: value } }, { lastName: { contains: value } }, { city: { contains: value } }] } } }];
  }
  return where;
}
function leadExportWhere(request: FastifyRequest, filter: Record<string, unknown>, brandId?: string): Prisma.LeadWhereInput {
  const ids = visibleBrandIds(request); const where: Prisma.LeadWhereInput = brandId ? { brandId } : ids ? { brandId: { in: ids } } : {};
  if (filter.syncStatus) where.syncStatus = String(filter.syncStatus) as never;
  if (filter.status) where.status = String(filter.status);
  if (filter.leadType) where.leadType = String(filter.leadType);
  if (filter.createdFrom || filter.createdTo || filter.startAt || filter.endAt) where.createdAt = { gte: filter.createdFrom || filter.startAt ? new Date(String(filter.createdFrom ?? filter.startAt)) : undefined, lte: filter.createdTo || filter.endAt ? new Date(String(filter.createdTo ?? filter.endAt)) : undefined };
  const value = String(filter.value ?? filter.keyword ?? "").trim(); const field = String(filter.field ?? "");
  if (value) {
    const selected: Record<string, Prisma.LeadWhereInput> = { leadNo: { leadNo: { contains: value } }, email: { email: { contains: value } }, firstname: { firstname: { contains: value } }, lastname: { lastname: { contains: value } }, phone: { phone: { contains: value } }, sku: { sku: { contains: value } }, country: { country: { contains: value } }, city: { city: { contains: value } }, source: { source: { contains: value } } };
    if (selected[field]) Object.assign(where, selected[field]);
    else where.OR = [{ leadNo: { contains: value } }, { email: { contains: value } }, { firstname: { contains: value } }, { lastname: { contains: value } }, { phone: { contains: value } }, { sku: { contains: value } }];
  }
  return where;
}
function formatDate(value: Date | null | undefined): string { return value ? value.toISOString().replace("T", " ").slice(0, 19) : ""; }
function formatCell(value: unknown): string | number | boolean { if (value instanceof Date) return formatDate(value); if (typeof value === "boolean") return value ? "是" : "否"; return value == null ? "" : String(value); }

async function buildExportWorkbook(app: FastifyInstance, request: FastifyRequest, objectType: "CUSTOMER" | "LEAD", body: z.infer<typeof exportSchema>, brandId?: string) {
  const allowlist = objectType === "CUSTOMER" ? customerExportFields : leadExportFields; const allFields = Object.keys(allowlist);
  const requested = body.fields?.length ? body.fields : allFields; const invalid = requested.filter((field) => !allFields.includes(field));
  if (invalid.length) throw new ApiError(400, "INVALID_EXPORT_FIELDS", `不允许导出字段：${invalid.join("、")}`);
  const fields = [...new Set(requested)]; const filter = body.scope === "CURRENT_FILTER" ? body.filter ?? {} : {}; const selectedIds = [...new Set(body.selectedIds ?? [])];
  if (body.scope === "SELECTED_IDS" && !selectedIds.length) throw new ApiError(400, "SELECTED_IDS_REQUIRED", "请选择至少一条数据");
  const workbook = new ExcelJS.Workbook(); workbook.creator = "Sowind CRM";
  const sheet = workbook.addWorksheet(objectType === "CUSTOMER" ? "会员" : "线索", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = fields.map((field) => ({ header: allowlist[field as keyof typeof allowlist], key: field, width: Math.max(14, String(allowlist[field as keyof typeof allowlist]).length * 2 + 5) }));
  if (objectType === "CUSTOMER") {
    const profileWhere = scopedBrandWhere(request, brandId); const where = customerExportWhere(request, filter, brandId); if (body.scope === "SELECTED_IDS") where.id = { in: selectedIds };
    const rows = await app.prisma.customer.findMany({ where, include: { profiles: { where: profileWhere, include: { brand: true } } }, orderBy: { createdAt: "desc" } });
    if (body.scope === "SELECTED_IDS" && rows.length !== selectedIds.length) throw new ApiError(403, "EXPORT_SCOPE_DENIED", "选择项包含不存在或超出品牌权限的数据");
    for (const customer of rows) for (const profile of customer.profiles) {
      const record: Record<string, unknown> = { customerNo: customer.customerNo, displayName: customer.displayName, mobile: customer.mobile, brand: profile.brand.name, brandMemberNo: profile.brandMemberNo, email: profile.email, salutation: profile.salutation, lastName: profile.lastName, firstName: profile.firstName, birthday: profile.birthday, country: profile.country, region: profile.region, city: profile.city, postalCode: profile.postalCode, addressLine: profile.addressLine, language: profile.language, preferredContact: profile.preferredContact, ownsBrandWatch: profile.ownsBrandWatch, purchaseChannel: profile.purchaseChannel, interestCenter: profile.interestCenter, favoriteCollection: profile.favoriteCollection, registeredAt: profile.registeredAt, createdAt: customer.createdAt };
      sheet.addRow(Object.fromEntries(fields.map((field) => [field, formatCell(record[field])])));
    }
  } else {
    const where = leadExportWhere(request, filter, brandId); if (body.scope === "SELECTED_IDS") where.id = { in: selectedIds };
    const rows = await app.prisma.lead.findMany({ where, include: { brand: true }, orderBy: { createdAt: "desc" } });
    if (body.scope === "SELECTED_IDS" && rows.length !== selectedIds.length) throw new ApiError(403, "EXPORT_SCOPE_DENIED", "选择项包含不存在或超出品牌权限的数据");
    for (const lead of rows) {
      const record: Record<string, unknown> = { leadNo: lead.leadNo, brand: lead.brand.name, leadType: lead.leadType, status: lead.status, source: lead.source, submissionMode: lead.submissionMode, firstname: lead.firstname, lastname: lead.lastname, email: lead.email, phone: lead.phone, country: lead.country, city: lead.city, language: lead.language, preferredContact: lead.preferredContact, ownsBrandWatch: lead.ownership, purchaseMethod: lead.purchaseMethod, sku: lead.sku, marketingOptIn: lead.marketingOptIn, processingConsent: lead.processingConsent, syncStatus: lead.syncStatus, createdAt: lead.createdAt };
      sheet.addRow(Object.fromEntries(fields.map((field) => [field, formatCell(record[field])])));
    }
  }
  sheet.getRow(1).font = { bold: true }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F1EC" } }; sheet.getRow(1).alignment = { vertical: "middle" }; sheet.getRow(1).height = 30;
  if (sheet.columnCount) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  for (const field of fields) if (["mobile", "phone", "postalCode", "leadNo"].includes(field)) sheet.getColumn(fields.indexOf(field) + 1).numFmt = "@";
  return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), rowCount: Math.max(0, sheet.rowCount - 1), requestedFields: body.fields ?? null, effectiveFields: fields, filter, selectedCount: selectedIds.length };
}

export async function importExportRoutes(app: FastifyInstance): Promise<void> {
  for (const routeObject of ["customers", "leads"] as const) {
    const objectType: ImportObjectType = routeObject === "customers" ? "CUSTOMER" : "LEAD"; const permission = routeObject === "customers" ? "customer.import" : "lead.import";
    app.get(`/api/v1/templates/${routeObject}`, { preHandler: guard(permission) }, async (request, reply) => {
      const query = z.object({ brandCode: z.enum(["GP", "UN"]) }).parse(request.query); const brand = await resolveBrand(app, request, query.brandCode); await activeForm(app, brand.id, objectType);
      const buffer = await templateWorkbook(objectType, brand.code as BrandCode);
      return reply.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("content-disposition", filenameHeader(formalTemplateFilename(objectType, brand.code as BrandCode))).send(buffer);
    });
    app.post(`/api/v1/imports/${routeObject}`, { preHandler: guard(permission) }, async (request, reply) => {
      const query = uploadQuerySchema.parse(request.query); const brand = await resolveBrand(app, request, query.brandCode); const conflictStrategy = assertImportStrategy(objectType, query.conflictStrategy); const unmatchedStrategy = objectType === "LEAD" ? query.unmatchedStrategy ?? "IMPORT_LEAD_ONLY" : undefined;
      const upload = await request.file(); if (!upload || !upload.filename.toLowerCase().endsWith(".xlsx")) throw new ApiError(400, "INVALID_FILE", "请上传 .xlsx 文件");
      const buffer = await upload.toBuffer(); const hash = fileSha256(buffer);
      if (!query.allowDuplicate) { const duplicate = await app.prisma.importJob.findFirst({ where: { brandId: brand.id, objectType, fileHash: hash, status: { not: "FAILED" } }, orderBy: { createdAt: "desc" } }); if (duplicate) throw new ApiError(409, "IMPORT_FILE_DUPLICATE", "相同文件已上传。如需重新执行，请明确确认重新上传。", { existingJobId: duplicate.id }); }
      const form = await activeForm(app, brand.id, objectType); const prepared = await prepareImport(app, { objectType, brand, buffer, conflictStrategy, unmatchedStrategy }); const summary = { ...prepared.summary, importable: importableCount(objectType, prepared.rows, conflictStrategy) };
      await mkdir(join(app.config.storageDir, "imports"), { recursive: true }); const jobNo = jobNumber("IMP"); const storedName = `${jobNo}-${basename(upload.filename).replace(/[^A-Za-z0-9._-]/g, "_")}`; const storagePath = join(app.config.storageDir, "imports", storedName); await writeFile(storagePath, buffer);
      const job = await app.prisma.$transaction(async (tx) => {
        const created = await tx.importJob.create({ data: { jobNo, objectType, brandId: brand.id, subtype: objectType === "LEAD" ? "PURCHASE_INTENT" : "REGISTRATION", fileName: upload.filename, storagePath, fileHash: hash, mappingJson: { schemaVersion: form.version, headers: prepared.parsed.headers, fields: formalImportFields(objectType, brand.code as BrandCode), mapping: prepared.mapping, preflightSummary: summary }, conflictStrategy, unmatchedStrategy, status: "UPLOADED", totalCount: prepared.rows.length, importableCount: summary.importable, createdBy: request.auth!.userId } });
        await appendAudit(tx, request, { action: "IMPORT_UPLOAD", module: "import", targetType: "import_job", targetId: created.id, brandId: brand.id, details: { objectType, fileName: upload.filename, fileHash: hash, rowCount: prepared.rows.length } });
        await tx.importJobRow.createMany({ data: prepared.rows.map((row) => ({ importJobId: created.id, rowNumber: row.rowNumber, status: row.status, conflictType: row.conflictType, identity: row.identity, rawData: row.rawData, normalizedData: row.normalizedData as Prisma.InputJsonValue, errors: row.errors, warnings: row.warnings, resolvedCustomerId: row.resolvedCustomerId, resolvedProfileId: row.resolvedProfileId, resolvedLeadId: row.resolvedLeadId })) });
        const ready = await tx.importJob.update({ where: { id: created.id }, data: { status: "PREFLIGHT_READY", preflightedAt: new Date() } });
        await appendAudit(tx, request, { action: "IMPORT_PREFLIGHT", module: "import", targetType: "import_job", targetId: created.id, brandId: brand.id, details: summary }); return ready;
      });
      return reply.status(201).send({ data: { ...job, mapping: prepared.mapping, preflight: summary, rows: prepared.rows.slice(0, 500) } });
    });
  }
  app.post<{ Params: { id: string } }>("/api/v1/imports/:id/execute", { preHandler: guard() }, async (request) => {
    const job = await app.prisma.importJob.findUnique({ where: { id: request.params.id }, include: { brand: true } }); if (!job) throw new ApiError(404, "RESOURCE_NOT_FOUND", "导入任务不存在"); assertJobPermission(request, job.objectType, "import");
    const brand = await resolveBrand(app, request, job.brand.code); const body = executeSchema.parse(request.body ?? {}); const conflictStrategy = assertImportStrategy(job.objectType as ImportObjectType, body.conflictStrategy ?? job.conflictStrategy ?? undefined); const unmatchedStrategy = job.objectType === "LEAD" ? body.unmatchedStrategy ?? (job.unmatchedStrategy as LeadUnmatchedStrategy | null) ?? "IMPORT_LEAD_ONLY" : undefined;
    return { data: await executeImportJob(app, request, { jobId: job.id, brand, objectType: job.objectType as ImportObjectType, conflictStrategy, unmatchedStrategy }) };
  });
  app.get("/api/v1/imports/history", { preHandler: guard() }, async (request) => {
    const query = z.object({ objectType: z.enum(["CUSTOMER", "LEAD"]).optional(), brandCode: z.enum(["GP", "UN"]).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).parse(request.query); if (query.objectType) assertJobPermission(request, query.objectType, "import");
    const brand = query.brandCode ? await resolveBrand(app, request, query.brandCode) : null; const ids = visibleBrandIds(request); const where: Prisma.ImportJobWhereInput = { ...(query.objectType ? { objectType: query.objectType } : {}), ...(brand ? { brandId: brand.id } : ids ? { brandId: { in: ids } } : {}) };
    const [total, rows] = await app.prisma.$transaction([app.prisma.importJob.count({ where }), app.prisma.importJob.findMany({ where, include: { brand: true }, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize })]); const allowedRows = rows.filter((row) => request.auth!.permissions.has(requiredPermission(row.objectType, "import")));
    const operators = await app.prisma.user.findMany({ where: { id: { in: [...new Set(allowedRows.map((row) => row.createdBy))] } }, select: { id: true, name: true } }); const operatorNames = new Map(operators.map((operator) => [operator.id, operator.name]));
    return { data: allowedRows.map((row) => ({ ...row, operatorName: operatorNames.get(row.createdBy) ?? "已删除账号" })), meta: { page: query.page, pageSize: query.pageSize, total: query.objectType ? total : allowedRows.length } };
  });
  app.get<{ Params: { id: string } }>("/api/v1/imports/:id", { preHandler: guard() }, async (request) => {
    const ids = visibleBrandIds(request); const job = await app.prisma.importJob.findFirst({ where: { id: request.params.id, ...(ids ? { brandId: { in: ids } } : {}) }, include: { brand: true, rows: { orderBy: { rowNumber: "asc" }, take: 1000 } } });
    if (!job) throw new ApiError(404, "RESOURCE_NOT_FOUND", "导入任务不存在或超出品牌范围"); assertJobPermission(request, job.objectType, "import"); return { data: job };
  });
  app.get<{ Params: { id: string } }>("/api/v1/imports/:id/failures", { preHandler: guard() }, async (request, reply) => {
    const ids = visibleBrandIds(request); const job = await app.prisma.importJob.findFirst({ where: { id: request.params.id, ...(ids ? { brandId: { in: ids } } : {}) } }); if (!job) throw new ApiError(404, "RESOURCE_NOT_FOUND", "导入任务不存在或超出品牌范围"); assertJobPermission(request, job.objectType, "import"); if (!job.failureFilePath) throw new ApiError(404, "RESOURCE_NOT_FOUND", "该任务没有失败明细文件");
    const buffer = await readFile(job.failureFilePath); await appendAudit(app.prisma, request, { action: "IMPORT_FAILURE_DOWNLOAD", module: "import", targetType: "import_job", targetId: job.id, brandId: job.brandId, details: { fileName: `${job.jobNo}-failures.csv` } });
    return reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", filenameHeader(`${job.jobNo}-failures.csv`)).send(buffer);
  });
  for (const routeObject of ["customers", "members", "leads"] as const) {
    const objectType = routeObject === "leads" ? "LEAD" : "CUSTOMER"; const permission = objectType === "CUSTOMER" ? "customer.export" : "lead.export";
    app.post(`/api/v1/exports/${routeObject}`, { preHandler: guard(permission) }, async (request, reply) => {
      const body = exportSchema.parse(request.body ?? {}); const filterBrand = body.scope === "CURRENT_FILTER" ? String(body.filter?.brandCode ?? body.filter?.brand ?? "").toUpperCase() : ""; const requestedBrand = body.brandCode ?? (["GP", "UN"].includes(filterBrand) ? filterBrand as "GP" | "UN" : undefined); const brand = requestedBrand ? await resolveBrand(app, request, requestedBrand) : null; const result = await buildExportWorkbook(app, request, objectType, body, brand?.id);
      await mkdir(join(app.config.storageDir, "exports"), { recursive: true }); const jobNo = jobNumber("EXP"); const fileName = `${objectType === "CUSTOMER" ? "members" : "leads"}-${jobNo}.xlsx`; const storagePath = join(app.config.storageDir, "exports", fileName); await writeFile(storagePath, result.buffer); const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const requestJson = JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue; const filterJson = JSON.parse(JSON.stringify(result.filter)) as Prisma.InputJsonValue;
      const job = await app.prisma.$transaction(async (tx) => { const row = await tx.exportJob.create({ data: { jobNo, objectType, brandId: brand?.id, status: "COMPLETED", requestJson, scope: body.scope, filterJson, selectedCount: result.selectedCount, requestedFields: result.requestedFields ?? undefined, effectiveFields: result.effectiveFields, brandScope: brand ? [brand.code] : request.auth!.allBrands ? ["ALL"] : request.auth!.brandIds, fileName, storagePath, rowCount: result.rowCount, createdBy: request.auth!.userId, completedAt: new Date(), expiresAt } }); await appendAudit(tx, request, { action: "EXPORT_CREATE", module: "export", targetType: "export_job", targetId: row.id, brandId: brand?.id, details: { objectType, scope: body.scope, rowCount: result.rowCount, effectiveFields: result.effectiveFields } }); return row; });
      return reply.status(201).send({ data: { ...job, downloadUrl: `/api/v1/exports/${job.id}/download` } });
    });
  }
  app.get<{ Params: { id: string } }>("/api/v1/exports/:id/download", { preHandler: guard() }, async (request, reply) => {
    const ids = visibleBrandIds(request); const job = await app.prisma.exportJob.findFirst({ where: { id: request.params.id, createdBy: request.auth!.userId, ...(ids ? { OR: [{ brandId: null }, { brandId: { in: ids } }] } : {}) } }); if (!job) throw new ApiError(404, "RESOURCE_NOT_FOUND", "导出文件不存在或无权下载"); assertJobPermission(request, job.objectType, "export");
    if (!job.storagePath || !job.fileName || (job.expiresAt && job.expiresAt <= new Date())) throw new ApiError(404, "EXPORT_EXPIRED", "导出文件不存在或已过期"); const buffer = await readFile(job.storagePath); await appendAudit(app.prisma, request, { action: "EXPORT_DOWNLOAD", module: "export", targetType: "export_job", targetId: job.id, brandId: job.brandId, details: { fileName: job.fileName, rowCount: job.rowCount } });
    return reply.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("content-disposition", filenameHeader(job.fileName)).send(buffer);
  });
}
