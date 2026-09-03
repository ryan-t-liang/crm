import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImportJobRow } from "@prisma/client";
import ExcelJS from "exceljs";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { appendAuditRecord, type AuditActorContext } from "../common/audit.js";
import { ApiError } from "../common/errors.js";
import { jobNumber } from "../common/ids.js";
import { contactCreateSchema, type ContactCreateInput } from "../contacts/schemas.js";
import { ContactService } from "../contacts/service.js";
import { crmLeadCreateSchema, type CrmLeadCreateInput } from "../crm-leads/schemas.js";
import { CrmLeadService } from "../crm-leads/service.js";
import { crmImportFields, contactExportFields, crmLeadExportFields } from "./crm-schema.js";
import type { CrmJobObjectType } from "./job-types.js";
import { fileSha256, parseWorkbook, writeFailureCsv } from "./workbook.js";

type ValidationMessage = { code: string; field?: string; message: string };
export type CrmPreflightRow = {
  rowNumber: number;
  status: "VALID" | "WARNING" | "ERROR";
  identity: string;
  rawData: Record<string, string>;
  normalizedData: Record<string, unknown>;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
};

const stageAliases = new Map([
  ["INITIAL", "INITIAL"], ["初筛", "INITIAL"], ["ONE_TO_ONE", "ONE_TO_ONE"], ["1V1", "ONE_TO_ONE"],
  ["SOLUTION", "SOLUTION"], ["CONVENTION", "CONVENTION"],
]);
const statusAliases = new Map([
  ["NEW", "NEW"], ["新建", "NEW"], ["QUALIFIED", "QUALIFIED"], ["已确认", "QUALIFIED"],
  ["SOLUTION", "SOLUTION"], ["方案", "SOLUTION"], ["QUOTATION", "QUOTATION"], ["报价", "QUOTATION"],
  ["WON", "WON"], ["成交", "WON"], ["LOST", "LOST"], ["丢失", "LOST"],
]);
const priorityAliases = new Map([
  ["LOW", "LOW"], ["低", "LOW"], ["MEDIUM", "MEDIUM"], ["中", "MEDIUM"],
  ["HIGH", "HIGH"], ["高", "HIGH"], ["URGENT", "URGENT"], ["紧急", "URGENT"],
]);

function auditContext(request: FastifyRequest): AuditActorContext {
  return {
    actorUserId: request.auth?.userId ?? null,
    actorName: request.auth?.name ?? "Unknown",
    requestId: request.id,
    traceId: request.id,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"]?.slice(0, 500) ?? null,
  };
}

function trimOrNull(value: string | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function normalizedPhone(value: string | null): string | null {
  return value ? value.replace(/[\s\-().]/g, "") : null;
}

function parseDate(value: string | undefined, field: string, errors: ValidationMessage[]): string | null {
  const trimmed = trimOrNull(value);
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\//g, "-").replace(" ", "T");
  const date = new Date(normalized.length === 10 ? `${normalized}T00:00:00+08:00` : normalized);
  if (Number.isNaN(date.getTime())) {
    errors.push({ code: "INVALID_DATE", field, message: `${field} 日期时间格式无效` });
    return null;
  }
  return date.toISOString();
}

function enumValue(value: string | undefined, aliases: Map<string, string>, field: string, fallback: string, errors: ValidationMessage[]): string {
  const trimmed = trimOrNull(value);
  if (!trimmed) return fallback;
  const resolved = aliases.get(trimmed) ?? aliases.get(trimmed.toUpperCase());
  if (!resolved) {
    errors.push({ code: "INVALID_ENUM", field, message: `${field} 不在允许值范围内` });
    return fallback;
  }
  return resolved;
}

function schemaErrors(error: { issues: Array<{ path: PropertyKey[]; code: string; message: string }> }): ValidationMessage[] {
  return error.issues.map((issue) => ({
    code: issue.code === "invalid_format" ? "INVALID_FORMAT" : issue.code === "too_small" ? "REQUIRED" : "VALIDATION_ERROR",
    field: issue.path.map(String).join(".") || undefined,
    message: issue.message,
  }));
}

async function userResolver(app: FastifyInstance) {
  const users = await app.prisma.user.findMany({ select: { id: true, loginAccount: true, status: true } });
  const byId = new Map(users.map((user) => [user.id, user]));
  const byLogin = new Map(users.map((user) => [user.loginAccount, user]));
  return (value: string | undefined, field: string, errors: ValidationMessage[]): string | null => {
    const identifier = trimOrNull(value);
    if (!identifier) return null;
    const user = byId.get(identifier) ?? byLogin.get(identifier);
    if (!user || user.status !== "ACTIVE") {
      errors.push({ code: user ? "OWNER_DISABLED" : "OWNER_NOT_FOUND", field, message: `${field} 必须精确匹配启用账号的登录账号或用户编号` });
      return null;
    }
    return user.id;
  };
}

function assertHeaders(objectType: CrmJobObjectType, headers: string[]) {
  const fields = crmImportFields(objectType);
  const allowed = new Set(fields.map((field) => field.key));
  const actual = headers.filter(Boolean);
  const unsupported = actual.filter((header) => !allowed.has(header));
  if (unsupported.length) {
    throw new ApiError(400, "UNSUPPORTED_IMPORT_HEADERS", `模板包含不允许的字段：${unsupported.join("、")}`);
  }
  const missing = fields.filter((field) => field.required && !actual.includes(field.key));
  if (missing.length) {
    throw new ApiError(400, "MISSING_REQUIRED_HEADERS", `缺少必填列：${missing.map((field) => field.key).join("、")}`);
  }
  return Object.fromEntries(actual.map((header) => [header, { key: header, label: fields.find((field) => field.key === header)?.label ?? header, required: fields.find((field) => field.key === header)?.required ?? false, status: "MATCHED" }]));
}

function serializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function preflightContacts(app: FastifyInstance, rows: Array<{ rowNumber: number; values: Record<string, string> }>): Promise<CrmPreflightRow[]> {
  const resolveUser = await userResolver(app);
  const contacts = await app.prisma.contact.findMany({
    where: { OR: [{ email: { not: null } }, { phone: { not: null } }] },
    select: { id: true, contactName: true, companyShortName: true, companyName: true, email: true, phone: true },
  });
  const emailMatches = new Map<string, typeof contacts>();
  const phoneMatches = new Map<string, typeof contacts>();
  for (const contact of contacts) {
    const email = contact.email?.trim().toLowerCase();
    const phone = normalizedPhone(contact.phone);
    if (email) emailMatches.set(email, [...(emailMatches.get(email) ?? []), contact]);
    if (phone) phoneMatches.set(phone, [...(phoneMatches.get(phone) ?? []), contact]);
  }
  const workbookEmails = new Map<string, number>();
  const workbookPhones = new Map<string, number>();
  const output: CrmPreflightRow[] = [];
  for (const row of rows) {
    const raw = row.values;
    const errors: ValidationMessage[] = [];
    const warnings: ValidationMessage[] = [];
    const email = trimOrNull(raw.email)?.toLowerCase() ?? null;
    const phone = trimOrNull(raw.phone);
    const phoneKey = normalizedPhone(phone);
    const stage = enumValue(raw.stage, stageAliases, "stage", "INITIAL", errors);
    const ownerUserId = resolveUser(raw.owner, "owner", errors);
    const candidate = {
      contactName: String(raw.contactName ?? "").trim(),
      companyShortName: trimOrNull(raw.companyShortName), companyName: trimOrNull(raw.companyName),
      department: trimOrNull(raw.department), title: trimOrNull(raw.title), email, phone,
      wechat: trimOrNull(raw.wechat), linkedin: trimOrNull(raw.linkedin), website: trimOrNull(raw.website),
      industry: trimOrNull(raw.industry), source: trimOrNull(raw.source), country: trimOrNull(raw.country),
      city: trimOrNull(raw.city), region: trimOrNull(raw.region), stage,
      ownerUserId, nextFollowupAt: parseDate(raw.nextFollowupAt, "nextFollowupAt", errors),
      initialContext: trimOrNull(raw.initialContext), remark: trimOrNull(raw.remark),
    };
    const parsed = contactCreateSchema.safeParse(candidate);
    if (!parsed.success) errors.push(...schemaErrors(parsed.error));
    const addDuplicate = (field: "email" | "phone", message: string) => {
      if (!warnings.some((warning) => warning.field === field && warning.message === message)) warnings.push({ code: "POTENTIAL_DUPLICATE", field, message });
    };
    if (email) {
      for (const contact of emailMatches.get(email) ?? []) addDuplicate("email", `电子邮箱可能重复：${email}；现有客户联系人：${contact.contactName} / ${contact.companyShortName || contact.companyName || "-"}`);
      const previous = workbookEmails.get(email);
      if (previous) addDuplicate("email", `电子邮箱可能重复：${email}；同时出现在工作簿第 ${previous} 行`);
      else workbookEmails.set(email, row.rowNumber);
    }
    if (phoneKey) {
      for (const contact of phoneMatches.get(phoneKey) ?? []) addDuplicate("phone", `电话可能重复：${phone}；现有客户联系人：${contact.contactName} / ${contact.companyShortName || contact.companyName || "-"}`);
      const previous = workbookPhones.get(phoneKey);
      if (previous) addDuplicate("phone", `电话可能重复：${phone}；同时出现在工作簿第 ${previous} 行`);
      else workbookPhones.set(phoneKey, row.rowNumber);
    }
    const normalizedData = parsed.success ? serializable(parsed.data) : serializable(candidate);
    output.push({
      rowNumber: row.rowNumber,
      status: errors.length ? "ERROR" : warnings.length ? "WARNING" : "VALID",
      identity: [candidate.contactName, candidate.companyShortName || candidate.companyName].filter(Boolean).join(" / "),
      rawData: raw, normalizedData, errors, warnings,
    });
  }
  return output;
}

async function preflightLeads(app: FastifyInstance, rows: Array<{ rowNumber: number; values: Record<string, string> }>): Promise<CrmPreflightRow[]> {
  const resolveUser = await userResolver(app);
  const contactIds = [...new Set(rows.map((row) => trimOrNull(row.values.contactId)).filter((value): value is string => Boolean(value)))];
  const existingContacts = new Set((await app.prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true } })).map((contact) => contact.id));
  const output: CrmPreflightRow[] = [];
  for (const row of rows) {
    const raw = row.values;
    const errors: ValidationMessage[] = [];
    const contactId = String(raw.contactId ?? "").trim();
    if (contactId && !existingContacts.has(contactId)) errors.push({ code: "CONTACT_NOT_FOUND", field: "contactId", message: `未找到客户联系人编号：${contactId}` });
    const priority = enumValue(raw.priority, priorityAliases, "priority", "MEDIUM", errors);
    const status = enumValue(raw.status, statusAliases, "status", "NEW", errors);
    const salesOwnerUserId = resolveUser(raw.salesOwner, "salesOwner", errors);
    const followupOwnerUserId = resolveUser(raw.followupOwner, "followupOwner", errors);
    const quote = trimOrNull(raw.estimatedQuote);
    const currency = trimOrNull(raw.currency);
    if (quote && !/^\d{1,16}(?:\.\d{1,2})?$/.test(quote)) errors.push({ code: "INVALID_QUOTE", field: "estimatedQuote", message: "预计报价必须大于等于 0，且最多保留 2 位小数" });
    if (quote && !currency) errors.push({ code: "CURRENCY_REQUIRED", field: "currency", message: "填写预计报价时必须填写币种" });
    if (currency && !/^[A-Z]{3}$/.test(currency)) errors.push({ code: "INVALID_CURRENCY", field: "currency", message: "币种必须是 3 位大写代码" });
    const candidate = {
      contactId,
      requirementSummary: String(raw.requirementSummary ?? "").trim(),
      requirementDetail: trimOrNull(raw.requirementDetail), latestProgress: trimOrNull(raw.latestProgress),
      priority, estimatedQuote: quote, currency, projectDomain: trimOrNull(raw.projectDomain),
      projectType: trimOrNull(raw.projectType), technologyType: trimOrNull(raw.technologyType),
      productType: trimOrNull(raw.productType), productName: trimOrNull(raw.productName),
      resourceRequirement: trimOrNull(raw.resourceRequirement), solution: trimOrNull(raw.solution),
      remark: trimOrNull(raw.remark), status, salesOwnerUserId, followupOwnerUserId,
      nextFollowupAt: parseDate(raw.nextFollowupAt, "nextFollowupAt", errors),
    };
    const parsed = crmLeadCreateSchema.safeParse(candidate);
    if (!parsed.success) errors.push(...schemaErrors(parsed.error));
    const normalizedData = parsed.success ? serializable(parsed.data) : serializable(candidate);
    output.push({
      rowNumber: row.rowNumber,
      status: errors.length ? "ERROR" : "VALID",
      identity: [candidate.requirementSummary, contactId].filter(Boolean).join(" / "),
      rawData: raw, normalizedData, errors, warnings: [],
    });
  }
  return output;
}

export function crmPreflightSummary(rows: CrmPreflightRow[]) {
  const validRows = rows.filter((row) => row.status === "VALID").length;
  const warningRows = rows.filter((row) => row.status === "WARNING").length;
  const errorRows = rows.filter((row) => row.status === "ERROR").length;
  return { totalRows: rows.length, validRows, warningRows, errorRows, importableRows: validRows + warningRows };
}

export async function prepareCrmImport(app: FastifyInstance, objectType: CrmJobObjectType, buffer: Buffer) {
  const parsed = await parseWorkbook(buffer);
  if (parsed.rows.length > 5000) throw new ApiError(400, "IMPORT_LIMIT_EXCEEDED", "单次导入最多 5000 行");
  const mapping = assertHeaders(objectType, parsed.headers);
  const rows = objectType === "CONTACT" ? await preflightContacts(app, parsed.rows) : await preflightLeads(app, parsed.rows);
  return { parsed, mapping, rows, summary: crmPreflightSummary(rows) };
}

function contactInput(data: Record<string, unknown>): ContactCreateInput {
  return contactCreateSchema.parse(data);
}

function leadInput(data: Record<string, unknown>): CrmLeadCreateInput {
  return crmLeadCreateSchema.parse(data);
}

export async function executeCrmImportJob(app: FastifyInstance, request: FastifyRequest, jobId: string) {
  const job = await app.prisma.importJob.findFirst({
    where: { id: jobId, objectType: { in: ["CONTACT", "CRM_LEAD"] }, createdBy: request.auth!.userId },
    include: { rows: { orderBy: { rowNumber: "asc" } } },
  });
  if (!job) throw new ApiError(404, "RESOURCE_NOT_FOUND", "CRM 导入任务不存在或不是当前用户创建");
  if (!job.storagePath || !job.fileHash || !job.mappingJson) throw new ApiError(409, "IMPORT_NOT_READY", "导入文件或预检结果缺失");
  if (!(["PREFLIGHT_READY", "READY_TO_EXECUTE"] as string[]).includes(job.status)) throw new ApiError(409, "IMPORT_NOT_READY", "导入任务未处于可执行状态");
  if (fileSha256(await readFile(job.storagePath)) !== job.fileHash) throw new ApiError(409, "IMPORT_FILE_CHANGED", "导入文件已被修改，请重新上传");
  const claim = await app.prisma.importJob.updateMany({
    where: { id: job.id, status: { in: ["PREFLIGHT_READY", "READY_TO_EXECUTE"] } },
    data: { status: "PROCESSING", processingStartedAt: new Date() },
  });
  if (claim.count !== 1) throw new ApiError(409, "IMPORT_ALREADY_CLAIMED", "导入任务已被执行或正在处理中");

  const contacts = new ContactService(app.prisma);
  const leads = new CrmLeadService(app.prisma);
  let success = 0;
  let failed = 0;
  let warnings = 0;
  const failures: Array<{ row: ImportJobRow; errorCode: string; errorMessage: string }> = [];
  for (const row of job.rows) {
    try {
      const rowWarnings = Array.isArray(row.warnings) ? row.warnings.length : 0;
      warnings += rowWarnings;
      if (row.status === "ERROR") throw new ApiError(400, "PREFLIGHT_ERROR", "该行未通过预检");
      const data = (row.normalizedData ?? {}) as Record<string, unknown>;
      const created = job.objectType === "CONTACT"
        ? await contacts.create(contactInput(data), request.auth!.userId, auditContext(request))
        : await leads.create(leadInput(data), request.auth!.userId, auditContext(request));
      success += 1;
      await app.prisma.importJobRow.update({ where: { id: row.id }, data: { status: "SUCCEEDED", createdId: created.id } });
    } catch (error) {
      failed += 1;
      const errorCode = error instanceof ApiError ? error.code : "IMPORT_ROW_FAILED";
      const errorMessage = error instanceof Error ? error.message : String(error);
      failures.push({ row, errorCode, errorMessage });
      await app.prisma.importJobRow.update({ where: { id: row.id }, data: { status: "FAILED", errors: [{ code: errorCode, message: errorMessage }] } });
    }
  }
  const failureFilePath = await writeFailureCsv(app, job.id, failures);
  const status = failed === 0 ? "COMPLETED" : success > 0 ? "COMPLETED_WITH_ERRORS" : "FAILED";
  const result = { imported: success, failed, skipped: 0, warnings };
  const saved = await app.prisma.$transaction(async (tx) => {
    const updated = await tx.importJob.update({
      where: { id: job.id },
      data: { status, successCount: success, failedCount: failed, skippedCount: 0, createdCount: success, updatedCount: 0, failureFilePath, resultJson: result, completedAt: new Date() },
    });
    await appendAuditRecord(tx, auditContext(request), {
      action: "IMPORT_EXECUTE", module: "crm_import", targetType: "import_job", targetId: job.id,
      details: { objectType: job.objectType, status, ...result },
    });
    return updated;
  });
  return { job: saved, result };
}

function formatDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().replace("T", " ").slice(0, 19) : null;
}

function styleExportSheet(sheet: ExcelJS.Worksheet, textColumns: string[]) {
  sheet.getRow(1).font = { bold: true, color: { argb: "FF202322" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0ED" } };
  sheet.getRow(1).height = 28;
  sheet.getRow(1).alignment = { vertical: "middle" };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  for (const key of textColumns) {
    const column = sheet.columns.find((item) => item.key === key);
    if (column) column.numFmt = "@";
  }
}

export async function buildCrmExportWorkbook(app: FastifyInstance, objectType: CrmJobObjectType) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kivisense CRM";
  if (objectType === "CONTACT") {
    const sheet = workbook.addWorksheet("Contacts", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = contactExportFields.map(([key, header]) => ({ key, header, width: Math.max(14, Math.min(32, header.length + 6)) }));
    const rows = await app.prisma.contact.findMany({ include: { owner: { select: { loginAccount: true } }, _count: { select: { leads: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
    for (const contact of rows) sheet.addRow({
      ...contact,
      owner: contact.owner?.loginAccount ?? null,
      nextFollowupAt: formatDate(contact.nextFollowupAt),
      relatedLeadCount: contact._count.leads,
      createdAt: formatDate(contact.createdAt), updatedAt: formatDate(contact.updatedAt),
    });
    styleExportSheet(sheet, ["id", "phone"]);
    return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), rowCount: rows.length, fields: contactExportFields.map(([key]) => key) };
  }
  const sheet = workbook.addWorksheet("CRM Leads", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = crmLeadExportFields.map(([key, header]) => ({ key, header, width: Math.max(14, Math.min(32, header.length + 6)) }));
  const rows = await app.prisma.crmLead.findMany({
    include: {
      contact: { select: { contactName: true, companyShortName: true, companyName: true, email: true, phone: true } },
      salesOwner: { select: { loginAccount: true } }, followupOwner: { select: { loginAccount: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  for (const lead of rows) sheet.addRow({
    ...lead,
    estimatedQuote: lead.estimatedQuote?.toString() ?? null,
    salesOwner: lead.salesOwner?.loginAccount ?? null, followupOwner: lead.followupOwner?.loginAccount ?? null,
    nextFollowupAt: formatDate(lead.nextFollowupAt), lastFollowupAt: formatDate(lead.lastFollowupAt),
    contactName: lead.contact.contactName,
    company: lead.contact.companyShortName || lead.contact.companyName || null,
    contactEmail: lead.contact.email ?? null, contactPhone: lead.contact.phone ?? null,
    createdAt: formatDate(lead.createdAt), updatedAt: formatDate(lead.updatedAt),
  });
  styleExportSheet(sheet, ["id", "contactId", "contactPhone"]);
  return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), rowCount: rows.length, fields: crmLeadExportFields.map(([key]) => key) };
}

export async function persistCrmExport(app: FastifyInstance, request: FastifyRequest, objectType: CrmJobObjectType) {
  const jobNo = jobNumber("EXP");
  const job = await app.prisma.$transaction(async (tx) => {
    const created = await tx.exportJob.create({
      data: { jobNo, objectType, status: "PROCESSING", requestJson: { scope: "ALL" }, scope: "ALL", selectedCount: 0, createdBy: request.auth!.userId },
    });
    await appendAuditRecord(tx, auditContext(request), {
      action: "EXPORT_CREATE", module: "crm_export", targetType: "export_job", targetId: created.id,
      details: { objectType, scope: "ALL" },
    });
    return created;
  });
  try {
    const result = await buildCrmExportWorkbook(app, objectType);
    const directory = join(app.config.storageDir, "exports");
    await mkdir(directory, { recursive: true });
    const fileName = `${objectType === "CONTACT" ? "kivisense-contacts" : "kivisense-crm-leads"}-${jobNo}.xlsx`;
    const storagePath = join(directory, `${job.id}.xlsx`);
    await writeFile(storagePath, result.buffer);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return app.prisma.exportJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", fileName, storagePath, rowCount: result.rowCount, effectiveFields: result.fields, completedAt: new Date(), expiresAt },
    });
  } catch (error) {
    await app.prisma.exportJob.update({ where: { id: job.id }, data: { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 1000) : "Export failed", completedAt: new Date() } });
    throw error;
  }
}
