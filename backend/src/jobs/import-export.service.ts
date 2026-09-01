import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Brand, ImportJobRow, Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { appendAuditRecord } from "../common/audit.js";
import { ApiError } from "../common/errors.js";
import { normalizeMobile } from "../common/mobile.js";
import { bindCustomerIdentity } from "../customers/identity.service.js";
import { registerCanonicalMember } from "../customers/service.js";
import { createCanonicalLead } from "../leads/service.js";
import { formalImportFields, formalSheetName, type BrandCode, type FormalField, type ImportObjectType } from "./formal-schema.js";

export type MemberConflictStrategy = "SKIP" | "FILL_EMPTY" | "OVERWRITE";
export type LeadConflictStrategy = "SKIP" | "UPDATE_EXISTING";
export type LeadUnmatchedStrategy = "IMPORT_LEAD_ONLY" | "CREATE_MEMBER";

type ParsedWorkbook = { headers: string[]; rows: Array<{ rowNumber: number; values: Record<string, string> }> };
type PreflightRow = {
  rowNumber: number;
  status: string;
  conflictType?: string;
  identity?: string;
  rawData: Record<string, string>;
  normalizedData: Record<string, unknown>;
  errors: Array<{ code: string; field?: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
  resolvedCustomerId?: string;
  resolvedProfileId?: string;
  resolvedLeadId?: string;
};

export function fileSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value) return String(value.text ?? "").trim();
  if (typeof value === "object" && "richText" in value) return value.richText.map((item) => item.text).join("").trim();
  if (typeof value === "object" && "result" in value) return String(value.result ?? "").trim();
  return String(value).trim();
}

export async function parseWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as never); } catch { throw new ApiError(400, "INVALID_XLSX", "无法读取 XLSX 文件"); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ApiError(400, "INVALID_XLSX", "工作簿没有可读取的工作表");
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column - 1] = cellText(cell.value).replace(/\s*\*$/, "").trim();
  });
  const rows: ParsedWorkbook["rows"] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, string> = {};
    headers.forEach((header, index) => { if (header) values[header] = cellText(row.getCell(index + 1).value); });
    if (Object.values(values).some((value) => value !== "")) rows.push({ rowNumber, values });
  });
  return { headers, rows };
}

export async function templateWorkbook(objectType: ImportObjectType, brand: BrandCode): Promise<Buffer> {
  const fields = formalImportFields(objectType, brand);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sowind CRM";
  workbook.created = new Date("2026-09-01T00:00:00.000Z");
  const sheet = workbook.addWorksheet(formalSheetName(objectType, brand), { views: [{ state: "frozen", ySplit: 1 }] });
  fields.forEach((field, index) => {
    const column = index + 1;
    const header = sheet.getCell(1, column);
    header.value = field.required
      ? { richText: [{ text: field.label, font: { bold: true, color: { argb: "FF222222" } } }, { text: " *", font: { bold: true, color: { argb: "FFD32F2F" } } }] }
      : field.label;
    header.font = { bold: true, color: { argb: "FF222222" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F1EC" } };
    header.alignment = { vertical: "middle", wrapText: true };
    header.border = { bottom: { style: "thin", color: { argb: "FFD6D3CD" } } };
    sheet.getCell(2, column).value = field.example;
    sheet.getCell(2, column).alignment = { vertical: "middle" };
    sheet.getColumn(column).width = Math.max(14, Math.min(32, Math.max(field.label.length * 2 + 5, field.example.length + 3)));
    if (["phone", "text"].includes(field.type) && ["mobile", "phone", "postalCode", "leadNo", "openId", "unionId"].includes(field.key)) {
      sheet.getColumn(column).numFmt = "@";
      sheet.getCell(2, column).numFmt = "@";
    }
    if (field.options?.length) {
      for (let row = 2; row <= 5001; row += 1) {
        sheet.getCell(row, column).dataValidation = { type: "list", allowBlank: !field.required, formulae: [`"${field.options.join(",")}"`] };
      }
    }
  });
  sheet.getRow(1).height = 30;
  sheet.getRow(2).height = 24;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: fields.length } };
  const note = workbook.addWorksheet("填写说明", { views: [{ state: "frozen", ySplit: 1 }] });
  note.columns = [{ width: 24 }, { width: 78 }];
  note.addRows([
    ["标记", "说明"],
    ["红色 *", "必填字段；未标记 * 的字段为非必填字段"],
    [objectType === "CUSTOMER" ? "手机号" : "Lead 手机号", objectType === "CUSTOMER" ? "必填；列已设为文本格式，请保留国家码与 + 号" : "选填；如填写，列已设为文本格式，请保留国家码与 + 号"],
    ["数据范围", `本模板只接受 ${brand} 品牌${objectType === "CUSTOMER" ? "会员" : "购买意向线索"}数据，不可混入其他品牌`],
    ["示例行", "第 2 行仅为格式示例，正式导入前请替换或删除"],
  ]);
  note.getRow(1).font = { bold: true };
  note.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F1EC" } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function booleanValue(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["是", "yes", "true", "1", "同意", "granted"].includes(normalized)) return true;
  if (["否", "no", "false", "0", "不同意", "denied"].includes(normalized)) return false;
  return null;
}

function dateValue(value: string): Date | null {
  if (!value.trim()) return null;
  const normalized = value.trim().replace(/\//g, "-").replace(" ", "T");
  const date = new Date(normalized.length === 10 ? `${normalized}T00:00:00.000Z` : normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function jsonDate(value: Date | null): string | null { return value?.toISOString() ?? null; }

function normalizeRow(fields: FormalField[], raw: Record<string, string>): { data: Record<string, unknown>; errors: PreflightRow["errors"] } {
  const data: Record<string, unknown> = {};
  const errors: PreflightRow["errors"] = [];
  for (const field of fields) {
    const value = (raw[field.label] ?? "").trim();
    if (field.required && !value) errors.push({ code: "REQUIRED", field: field.key, message: `${field.label}为必填项` });
    if (!value) { data[field.key] = null; continue; }
    if (field.type === "boolean") {
      const parsed = booleanValue(value);
      if (parsed === null) errors.push({ code: "INVALID_BOOLEAN", field: field.key, message: `${field.label}必须为是或否` });
      data[field.key] = parsed;
    } else if (field.type === "date" || field.type === "datetime") {
      const parsed = dateValue(value);
      if (!parsed) errors.push({ code: "INVALID_DATE", field: field.key, message: `${field.label}日期格式无效` });
      data[field.key] = jsonDate(parsed);
    } else if (field.type === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push({ code: "INVALID_EMAIL", field: field.key, message: `${field.label}格式无效` });
      data[field.key] = value.toLowerCase();
    } else if (field.type === "enum") {
      if (field.options && !field.options.includes(value)) errors.push({ code: "INVALID_ENUM", field: field.key, message: `${field.label}不在允许值范围内` });
      data[field.key] = value;
    } else data[field.key] = value;
  }
  return { data, errors };
}

function headerMapping(fields: FormalField[], headers: string[]) {
  const byLabel = new Map(fields.map((field) => [field.label, field]));
  const mapping: Record<string, { key: string; label: string; required: boolean; status: "MATCHED" }> = {};
  for (const header of headers) {
    const field = byLabel.get(header);
    if (field) mapping[header] = { key: field.key, label: field.label, required: field.required, status: "MATCHED" };
  }
  const missingRequired = fields.filter((field) => field.required && !headers.includes(field.label));
  return { mapping, missingRequired };
}

function auditContext(request: FastifyRequest) {
  return { actorUserId: request.auth?.userId ?? null, actorName: request.auth?.name ?? "Unknown", requestId: request.id, traceId: request.id, ipAddress: request.ip, userAgent: request.headers["user-agent"]?.slice(0, 500) ?? null };
}

async function preflightMember(app: FastifyInstance, brand: Brand, parsed: ParsedWorkbook, strategy: MemberConflictStrategy): Promise<PreflightRow[]> {
  const fields = formalImportFields("CUSTOMER", brand.code as BrandCode);
  const seen = new Map<string, number>();
  const rows: PreflightRow[] = [];
  for (const item of parsed.rows) {
    const normalized = normalizeRow(fields, item.values);
    let normalizedMobile: string | null = null;
    if (normalized.data.mobile) {
      try { normalizedMobile = normalizeMobile(String(normalized.data.mobile)); }
      catch { normalized.errors.push({ code: "INVALID_PHONE", field: "mobile", message: "手机号格式无效" }); }
    }
    normalized.data.mobileNormalized = normalizedMobile;
    const warnings: PreflightRow["warnings"] = [];
    let status = "ERROR";
    let conflictType: string | undefined;
    let customerId: string | undefined;
    let profileId: string | undefined;
    if (normalizedMobile) {
      const firstRow = seen.get(normalizedMobile);
      if (firstRow) {
        normalized.errors.push({ code: "FILE_DUPLICATE", field: "mobile", message: `手机号与第 ${firstRow} 行重复` });
        conflictType = "FILE_DUPLICATE";
      } else seen.set(normalizedMobile, item.rowNumber);
    }
    const customer = normalizedMobile ? await app.prisma.customer.findUnique({ where: { mobileNormalized: normalizedMobile }, include: { profiles: { where: { brandId: brand.id } } } }) : null;
    customerId = customer?.id;
    profileId = customer?.profiles[0]?.id;
    for (const [identityType, key, scope] of [["OPENID", "openId", `IMPORT_APP:${brand.code}`], ["UNIONID", "unionId", `IMPORT_OPEN_PLATFORM:${brand.code}`]] as const) {
      const value = normalized.data[key];
      if (!value) continue;
      const existing = await app.prisma.customerIdentity.findUnique({ where: { brandId_identityType_scope_value: { brandId: brand.id, identityType, scope, value: String(value) } } });
      if (existing && existing.customerId !== customerId) {
        normalized.errors.push({ code: "IDENTITY_CONFLICT", field: key, message: `${key}已绑定其他会员` });
        conflictType = "IDENTITY_CONFLICT";
      }
    }
    if (!normalized.errors.length) {
      if (!customer) status = "NEW_CUSTOMER";
      else if (!profileId) status = "NEW_BRAND_PROFILE";
      else { status = "EXISTING_PROFILE"; conflictType = "EXISTING_PROFILE"; if (strategy === "SKIP") warnings.push({ code: "WILL_SKIP", message: "执行时将按 SKIP 跳过已有品牌资料" }); }
    }
    rows.push({ rowNumber: item.rowNumber, status, conflictType, identity: normalizedMobile ?? undefined, rawData: item.values, normalizedData: normalized.data, errors: normalized.errors, warnings, resolvedCustomerId: customerId, resolvedProfileId: profileId });
  }
  return rows;
}

async function preflightLead(app: FastifyInstance, brand: Brand, parsed: ParsedWorkbook, strategy: LeadConflictStrategy, unmatched: LeadUnmatchedStrategy): Promise<PreflightRow[]> {
  const fields = formalImportFields("LEAD", brand.code as BrandCode);
  const seenLeadNos = new Map<string, number>();
  const rows: PreflightRow[] = [];
  for (const item of parsed.rows) {
    const normalized = normalizeRow(fields, item.values);
    const warnings: PreflightRow["warnings"] = [];
    let normalizedPhone: string | null = null;
    if (normalized.data.phone) {
      try { normalizedPhone = normalizeMobile(String(normalized.data.phone)); }
      catch { normalized.errors.push({ code: "INVALID_PHONE", field: "phone", message: "手机号格式无效" }); }
    }
    normalized.data.phoneNormalized = normalizedPhone;
    if (normalized.data.brand !== brand.code) normalized.errors.push({ code: "BRAND_MISMATCH", field: "brand", message: `文件品牌必须为 ${brand.code}` });
    if (normalized.data.leadType !== "PURCHASE_INTENT") normalized.errors.push({ code: "INVALID_LEAD_TYPE", field: "leadType", message: "线索类型必须为 PURCHASE_INTENT" });
    if (normalized.data.status && normalized.data.status !== "NEW") normalized.errors.push({ code: "INVALID_STATUS", field: "status", message: "新导入线索状态只允许 NEW 或留空" });
    const leadNo = normalized.data.leadNo ? String(normalized.data.leadNo) : null;
    if (leadNo) {
      const firstRow = seenLeadNos.get(leadNo);
      if (firstRow) normalized.errors.push({ code: "FILE_DUPLICATE", field: "leadNo", message: `Lead No 与第 ${firstRow} 行重复` });
      else seenLeadNos.set(leadNo, item.rowNumber);
    }
    const existingLead = leadNo ? await app.prisma.lead.findUnique({ where: { leadNo } }) : null;
    if (existingLead && existingLead.brandId !== brand.id) normalized.errors.push({ code: "LEAD_BRAND_CONFLICT", field: "leadNo", message: "Lead No 已属于其他品牌" });
    const customer = normalizedPhone ? await app.prisma.customer.findUnique({ where: { mobileNormalized: normalizedPhone } }) : null;
    if (customer) warnings.push({ code: "MATCHED_MEMBER", message: "手机号已匹配会员" });
    else warnings.push({ code: "UNMATCHED_MEMBER", message: "未匹配会员" });
    if (!customer && unmatched === "CREATE_MEMBER" && !normalizedPhone) normalized.errors.push({ code: "PHONE_REQUIRED_FOR_MEMBER", field: "phone", message: "CREATE_MEMBER 策略要求有效手机号" });
    if (!leadNo && !normalized.errors.length) {
      const createdAt = normalized.data.createdAt ? new Date(String(normalized.data.createdAt)) : null;
      const possibleWhere: Prisma.LeadWhereInput = {
        brandId: brand.id, leadType: "PURCHASE_INTENT", sku: normalized.data.sku ? String(normalized.data.sku) : null,
        ...(normalizedPhone
          ? { phone: normalizedPhone }
          : { phone: null, email: String(normalized.data.email), ...(createdAt ? { createdAt } : {}) }),
      };
      if (await app.prisma.lead.findFirst({ where: possibleWhere, select: { id: true } })) warnings.push({ code: "POSSIBLE_DUPLICATE", message: "发现可能重复线索；仅提示，不自动合并" });
    }
    const status = normalized.errors.length ? "ERROR" : existingLead ? "EXISTING_LEAD" : "NEW_LEAD";
    rows.push({ rowNumber: item.rowNumber, status, conflictType: existingLead ? "EXISTING_LEAD" : undefined, identity: leadNo ?? normalizedPhone ?? String(normalized.data.email ?? ""), rawData: item.values, normalizedData: normalized.data, errors: normalized.errors, warnings: existingLead && strategy === "SKIP" ? [...warnings, { code: "WILL_SKIP", message: "执行时将按 SKIP 跳过已有线索" }] : warnings, resolvedCustomerId: customer?.id, resolvedLeadId: existingLead?.id });
  }
  return rows;
}

export function preflightSummary(objectType: ImportObjectType, rows: PreflightRow[]) {
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  if (objectType === "CUSTOMER") return {
    total: rows.length, importable: rows.filter((row) => !row.errors.length && row.status !== "EXISTING_PROFILE").length,
    newCustomer: count("NEW_CUSTOMER"), newBrandProfile: count("NEW_BRAND_PROFILE"), existingProfileConflict: count("EXISTING_PROFILE"),
    fileDuplicate: rows.filter((row) => row.conflictType === "FILE_DUPLICATE").length, error: count("ERROR"),
  };
  return {
    total: rows.length, importable: rows.filter((row) => !row.errors.length && row.status !== "EXISTING_LEAD").length,
    newLead: count("NEW_LEAD"), matchedMember: rows.filter((row) => row.warnings.some((warning) => warning.code === "MATCHED_MEMBER")).length,
    unmatchedMember: rows.filter((row) => row.warnings.some((warning) => warning.code === "UNMATCHED_MEMBER")).length,
    existingLeadConflict: count("EXISTING_LEAD"), possibleDuplicate: rows.filter((row) => row.warnings.some((warning) => warning.code === "POSSIBLE_DUPLICATE")).length,
    error: count("ERROR"),
  };
}

export async function prepareImport(
  app: FastifyInstance,
  input: { objectType: ImportObjectType; brand: Brand; buffer: Buffer; conflictStrategy: MemberConflictStrategy | LeadConflictStrategy; unmatchedStrategy?: LeadUnmatchedStrategy },
) {
  const parsed = await parseWorkbook(input.buffer);
  if (parsed.rows.length > 5000) throw new ApiError(400, "IMPORT_LIMIT_EXCEEDED", "单次导入最多 5000 行");
  const fields = formalImportFields(input.objectType, input.brand.code as BrandCode);
  const { mapping, missingRequired } = headerMapping(fields, parsed.headers);
  if (missingRequired.length) throw new ApiError(400, "MISSING_REQUIRED_HEADERS", `缺少必填列：${missingRequired.map((field) => field.label).join("、")}`);
  const rows = input.objectType === "CUSTOMER"
    ? await preflightMember(app, input.brand, parsed, input.conflictStrategy as MemberConflictStrategy)
    : await preflightLead(app, input.brand, parsed, input.conflictStrategy as LeadConflictStrategy, input.unmatchedStrategy ?? "IMPORT_LEAD_ONLY");
  return { parsed, mapping, rows, summary: preflightSummary(input.objectType, rows) };
}

function profilePatch(data: Record<string, unknown>) {
  return {
    salutation: data.salutation ? String(data.salutation) : null,
    lastName: data.lastName ? String(data.lastName) : null,
    firstName: data.firstName ? String(data.firstName) : null,
    birthday: data.birthday ? new Date(String(data.birthday)) : null,
    email: data.email ? String(data.email) : null,
    mobile: data.mobile ? String(data.mobile) : null,
    country: data.country ? String(data.country) : null,
    region: data.region ? String(data.region) : null,
    city: data.city ? String(data.city) : null,
    postalCode: data.postalCode ? String(data.postalCode) : null,
    addressLine: data.addressLine ? String(data.addressLine) : null,
    language: data.language ? String(data.language) : null,
    preferredContact: data.preferredContact ? String(data.preferredContact) : null,
    ownsBrandWatch: typeof data.ownsBrandWatch === "boolean" ? data.ownsBrandWatch : null,
    purchaseChannel: data.purchaseChannel ? String(data.purchaseChannel) : null,
    interestCenter: data.interestCenter ? String(data.interestCenter) : null,
    favoriteCollection: data.favoriteCollection ? String(data.favoriteCollection) : null,
  };
}

function isEmpty(value: unknown): boolean { return value === null || value === undefined || value === ""; }

async function bindImportedIdentities(tx: Prisma.TransactionClient, brand: Brand, customerId: string, data: Record<string, unknown>) {
  for (const [identityType, key, scope] of [["OPENID", "openId", `IMPORT_APP:${brand.code}`], ["UNIONID", "unionId", `IMPORT_OPEN_PLATFORM:${brand.code}`]] as const) {
    if (!data[key]) continue;
    await bindCustomerIdentity(tx, { customerId, brandId: brand.id, identityType, scope, value: String(data[key]), verifiedAt: null, source: "BATCH_IMPORT" });
  }
}

async function executeMemberRow(app: FastifyInstance, request: FastifyRequest, brand: Brand, row: ImportJobRow, strategy: MemberConflictStrategy) {
  const data = (row.normalizedData ?? {}) as Record<string, unknown>;
  if (row.status === "ERROR") throw new ApiError(400, "PREFLIGHT_ERROR", "该行未通过预检");
  if (row.resolvedProfileId && strategy === "SKIP") return { outcome: "SKIPPED" as const, id: row.resolvedProfileId, created: false, updated: false, customerCreated: false, profileCreated: false };
  return app.prisma.$transaction(async (tx) => {
    if (!row.resolvedProfileId) {
      const result = await registerCanonicalMember(tx, {
        brand,
        mobile: String(data.mobile),
        profile: {
          brandCode: brand.code as BrandCode, salutation: String(data.salutation), lastName: String(data.lastName), firstName: String(data.firstName),
          birthday: data.birthday ? new Date(String(data.birthday)) : null, email: data.email ? String(data.email) : null,
          country: data.country ? String(data.country) : null, region: data.region ? String(data.region) : null, city: data.city ? String(data.city) : null,
          postalCode: data.postalCode ? String(data.postalCode) : null, addressLine: data.addressLine ? String(data.addressLine) : null,
          language: data.language ? String(data.language) : null, preferredContact: data.preferredContact ? String(data.preferredContact) : null,
          ownsBrandWatch: Boolean(data.ownsBrandWatch), purchaseChannel: data.purchaseChannel ? String(data.purchaseChannel) : null,
          interestCenter: data.interestCenter ? String(data.interestCenter) : null, favoriteCollection: data.favoriteCollection ? String(data.favoriteCollection) : null,
          registrationSource: "BATCH_IMPORT", openId: data.openId ? String(data.openId) : null, unionId: data.unionId ? String(data.unionId) : null,
          marketingOptIn: Boolean(data.marketingOptIn), processingConsent: true, policyVersion: `${brand.code}-IMPORT-CURRENT`, registrationData: row.rawData as Record<string, unknown>,
        },
        audit: auditContext(request), createdBy: request.auth!.userId, duplicateProfilePolicy: "REJECT",
      });
      await bindImportedIdentities(tx, brand, result.customer.id, data);
      if (data.registeredAt) await tx.customerBrandProfile.update({ where: { id: result.profile.id }, data: { registeredAt: new Date(String(data.registeredAt)) } });
      return { outcome: "SUCCEEDED" as const, id: result.profile.id, created: true, updated: false, customerCreated: result.customerCreated, profileCreated: result.profileCreated };
    }
    const existing = await tx.customerBrandProfile.findUniqueOrThrow({ where: { id: row.resolvedProfileId } });
    const incoming = profilePatch(data);
    const updateData = Object.fromEntries(Object.entries(incoming).filter(([key, value]) => strategy === "OVERWRITE" ? !isEmpty(value) : isEmpty(existing[key as keyof typeof existing]) && !isEmpty(value)));
    const updated = await tx.customerBrandProfile.update({ where: { id: existing.id }, data: { ...updateData, registrationSource: "BATCH_IMPORT", registrationData: row.rawData as Prisma.InputJsonValue } });
    await bindImportedIdentities(tx, brand, existing.customerId, data);
    await tx.consentRecord.createMany({ data: [
      { customerId: existing.customerId, customerBrandProfileId: existing.id, brandId: brand.id, purpose: "DATA_PROCESSING", channel: "ALL", status: "GRANTED", policyVersion: `${brand.code}-IMPORT-CURRENT`, source: "BATCH_IMPORT", capturedAt: new Date(), capturedBy: request.auth!.userId, evidence: { importedValue: Boolean(data.processingConsent), originalAuthorizationTime: null } },
      { customerId: existing.customerId, customerBrandProfileId: existing.id, brandId: brand.id, purpose: "MARKETING_COMMUNICATION", channel: "EMAIL", status: data.marketingOptIn ? "GRANTED" : "DENIED", policyVersion: `${brand.code}-IMPORT-CURRENT`, source: "BATCH_IMPORT", capturedAt: new Date(), capturedBy: request.auth!.userId, evidence: { importedValue: Boolean(data.marketingOptIn), originalAuthorizationTime: null } },
    ] });
    await tx.customerJourneyEvent.create({ data: { customerId: existing.customerId, brandId: brand.id, eventType: "PROFILE_UPDATE", title: `${brand.name}会员资料批量更新`, eventAt: new Date(), source: "BATCH_IMPORT", metadata: { importJobRowId: row.id, strategy } } });
    await appendAuditRecord(tx, auditContext(request), { action: "MEMBER_PROFILE_UPDATE", module: "customer", targetType: "customer_profile", targetId: existing.id, brandId: brand.id, details: { source: "BATCH_IMPORT", strategy, changedFields: Object.keys(updateData) } });
    return { outcome: "SUCCEEDED" as const, id: updated.id, created: false, updated: true, customerCreated: false, profileCreated: false };
  });
}

async function executeLeadRow(app: FastifyInstance, request: FastifyRequest, brand: Brand, row: ImportJobRow, strategy: LeadConflictStrategy, unmatched: LeadUnmatchedStrategy) {
  const data = (row.normalizedData ?? {}) as Record<string, unknown>;
  if (row.status === "ERROR") throw new ApiError(400, "PREFLIGHT_ERROR", "该行未通过预检");
  if (row.resolvedLeadId && strategy === "SKIP") return { outcome: "SKIPPED" as const, id: row.resolvedLeadId, created: false, updated: false, memberCreated: false, matchedMember: Boolean(row.resolvedCustomerId) };
  return app.prisma.$transaction(async (tx) => {
    let customerId = row.resolvedCustomerId ?? null;
    let memberCreated = false;
    if (!customerId && unmatched === "CREATE_MEMBER") {
      if (!data.phoneNormalized) throw new ApiError(400, "PHONE_REQUIRED_FOR_MEMBER", "创建会员必须提供有效手机号");
      const member = await registerCanonicalMember(tx, {
        brand, mobile: String(data.phone),
        profile: {
          brandCode: brand.code as BrandCode, salutation: String(data.salutation), lastName: String(data.lastname), firstName: String(data.firstname),
          email: String(data.email), country: String(data.country), city: data.city ? String(data.city) : null, language: String(data.language),
          preferredContact: String(data.preferredContact), ownsBrandWatch: typeof data.ownsBrandWatch === "boolean" ? data.ownsBrandWatch : null,
          purchaseChannel: data.purchaseMethod ? String(data.purchaseMethod) : null, registrationSource: "BATCH_IMPORT", marketingOptIn: Boolean(data.marketingOptIn),
          processingConsent: true, policyVersion: `${brand.code}-IMPORT-CURRENT`, registrationData: row.rawData as Record<string, unknown>,
        }, audit: auditContext(request), createdBy: request.auth!.userId, duplicateProfilePolicy: "RETURN_EXISTING",
      });
      customerId = member.customer.id;
      memberCreated = member.customerCreated || member.profileCreated;
    }
    if (row.resolvedLeadId) {
      const updated = await tx.lead.update({ where: { id: row.resolvedLeadId }, data: {
        customerId, source: "BATCH_IMPORT", submissionMode: "BATCH_IMPORT", sku: data.sku ? String(data.sku) : null,
        email: String(data.email), salutation: String(data.salutation), firstname: String(data.firstname), lastname: String(data.lastname),
        phone: data.phoneNormalized ? String(data.phoneNormalized) : null, language: String(data.language), preferredContact: String(data.preferredContact),
        country: String(data.country), city: data.city ? String(data.city) : null, ownership: typeof data.ownsBrandWatch === "boolean" ? (data.ownsBrandWatch ? "Yes" : "No") : null,
        purchaseMethod: data.purchaseMethod ? String(data.purchaseMethod) : null, marketingOptIn: Boolean(data.marketingOptIn), originalSnapshot: row.rawData as Prisma.InputJsonValue,
      } });
      await appendAuditRecord(tx, auditContext(request), { action: "IMPORT_LEAD_UPDATE", module: "lead", targetType: "lead", targetId: updated.id, brandId: brand.id, details: { strategy, preservedSyncStatus: updated.syncStatus } });
      return { outcome: "SUCCEEDED" as const, id: updated.id, created: false, updated: true, memberCreated, matchedMember: Boolean(customerId) };
    }
    const result = await createCanonicalLead(tx, app.config, {
      brandCode: brand.code as BrandCode, customerId, leadType: "PURCHASE_INTENT", source: "BATCH_IMPORT", submissionMode: "BATCH_IMPORT", formVersion: "2.0",
      sku: data.sku ? String(data.sku) : null, email: String(data.email), salutation: String(data.salutation), firstname: String(data.firstname), lastname: String(data.lastname),
      phone: data.phoneNormalized ? String(data.phoneNormalized) : null, language: String(data.language), preferredContact: String(data.preferredContact), country: String(data.country),
      city: data.city ? String(data.city) : null, ownsBrandWatch: typeof data.ownsBrandWatch === "boolean" ? (data.ownsBrandWatch ? "Yes" : "No") : null,
      purchaseMethod: data.purchaseMethod ? String(data.purchaseMethod) : null, processingConsent: true, marketingOptIn: Boolean(data.marketingOptIn),
      originalSnapshot: row.rawData as Record<string, unknown>, createdBy: request.auth!.userId, idempotencyKey: `IMPORT:${row.importJobId}:${row.rowNumber}`,
    });
    const customLeadNo = data.leadNo ? String(data.leadNo) : null;
    const lead = customLeadNo || data.createdAt
      ? await tx.lead.update({ where: { id: result.lead.id }, data: { ...(customLeadNo ? { leadNo: customLeadNo } : {}), ...(data.createdAt ? { createdAt: new Date(String(data.createdAt)) } : {}) } })
      : result.lead;
    if (result.outboxCreated || lead.syncStatus !== "NOT_SYNCED") throw new Error("BATCH_IMPORT_DISPATCH_INVARIANT_VIOLATION");
    return { outcome: "SUCCEEDED" as const, id: lead.id, created: true, updated: false, memberCreated, matchedMember: Boolean(customerId) };
  });
}

function csvCell(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

async function writeFailureCsv(app: FastifyInstance, jobId: string, rows: Array<{ row: ImportJobRow; errorCode: string; errorMessage: string }>) {
  if (!rows.length) return null;
  const allHeaders = [...new Set(rows.flatMap((item) => Object.keys(item.row.rawData as Record<string, unknown>)))];
  const lines = [
    ["original_row_number", "business_identifier", "error_code", "error_message", ...allHeaders].map(csvCell).join(","),
    ...rows.map(({ row, errorCode, errorMessage }) => {
      const raw = row.rawData as Record<string, unknown>;
      return [row.rowNumber, row.identity ?? "", errorCode, errorMessage, ...allHeaders.map((header) => raw[header] ?? "")].map(csvCell).join(",");
    }),
  ];
  const directory = join(app.config.storageDir, "imports", "failures");
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${jobId}-failures.csv`);
  await writeFile(path, `\uFEFF${lines.join("\r\n")}`, "utf8");
  return path;
}

export async function executeImportJob(
  app: FastifyInstance,
  request: FastifyRequest,
  input: { jobId: string; brand: Brand; objectType: ImportObjectType; conflictStrategy: MemberConflictStrategy | LeadConflictStrategy; unmatchedStrategy?: LeadUnmatchedStrategy },
) {
  const job = await app.prisma.importJob.findFirst({ where: { id: input.jobId, brandId: input.brand.id, objectType: input.objectType, createdBy: request.auth!.userId }, include: { rows: { orderBy: { rowNumber: "asc" } } } });
  if (!job) throw new ApiError(404, "RESOURCE_NOT_FOUND", "导入任务不存在、不是当前用户创建或超出品牌范围");
  if (!job.storagePath || !job.fileHash || !job.mappingJson) throw new ApiError(409, "IMPORT_NOT_READY", "导入文件或映射缺失");
  if (!(["PREFLIGHT_READY", "READY_TO_EXECUTE"] as string[]).includes(job.status)) throw new ApiError(409, "IMPORT_NOT_READY", "导入任务未处于可执行状态");
  const actualHash = fileSha256(await readFile(job.storagePath));
  if (actualHash !== job.fileHash) throw new ApiError(409, "IMPORT_FILE_CHANGED", "导入文件已被修改，请重新上传");
  await app.prisma.importJob.update({ where: { id: job.id }, data: { status: "PROCESSING", processingStartedAt: new Date(), conflictStrategy: input.conflictStrategy, unmatchedStrategy: input.unmatchedStrategy } });
  let success = 0; let failed = 0; let skipped = 0; let created = 0; let updated = 0;
  const breakdown = { newCustomers: 0, newBrandProfiles: 0, updatedProfiles: 0, newLeads: 0, updatedLeads: 0, matchedMembers: 0, createdMembers: 0 };
  const failures: Array<{ row: ImportJobRow; errorCode: string; errorMessage: string }> = [];
  for (const row of job.rows) {
    try {
      const result = input.objectType === "CUSTOMER"
        ? await executeMemberRow(app, request, input.brand, row, input.conflictStrategy as MemberConflictStrategy)
        : await executeLeadRow(app, request, input.brand, row, input.conflictStrategy as LeadConflictStrategy, input.unmatchedStrategy ?? "IMPORT_LEAD_ONLY");
      if (result.outcome === "SKIPPED") { skipped += 1; await app.prisma.importJobRow.update({ where: { id: row.id }, data: { status: "SKIPPED", createdId: result.id } }); continue; }
      success += 1; if (result.created) created += 1; if (result.updated) updated += 1;
      if (input.objectType === "CUSTOMER") {
        const member = result as Awaited<ReturnType<typeof executeMemberRow>>;
        if (member.customerCreated) breakdown.newCustomers += 1;
        if (member.profileCreated) breakdown.newBrandProfiles += 1;
        if (member.updated) breakdown.updatedProfiles += 1;
      } else {
        const lead = result as Awaited<ReturnType<typeof executeLeadRow>>;
        if (lead.created) breakdown.newLeads += 1;
        if (lead.updated) breakdown.updatedLeads += 1;
        if (lead.matchedMember) breakdown.matchedMembers += 1;
        if (lead.memberCreated) breakdown.createdMembers += 1;
      }
      await app.prisma.importJobRow.update({ where: { id: row.id }, data: { status: "SUCCEEDED", createdId: result.id } });
    } catch (error) {
      failed += 1;
      const errorCode = error instanceof ApiError ? error.code : "IMPORT_ROW_FAILED";
      const errorMessage = error instanceof Error ? error.message : String(error);
      failures.push({ row, errorCode, errorMessage });
      await app.prisma.importJobRow.update({ where: { id: row.id }, data: { status: "FAILED", errors: [{ code: errorCode, message: errorMessage }] } });
    }
  }
  const failureFilePath = await writeFailureCsv(app, job.id, failures);
  const status = failed === 0 ? "COMPLETED" : success + skipped > 0 ? "COMPLETED_WITH_ERRORS" : "FAILED";
  const resultJson = { success, failed, skipped, created, updated, ...breakdown };
  const updatedJob = await app.prisma.$transaction(async (tx) => {
    const saved = await tx.importJob.update({ where: { id: job.id }, data: { status, successCount: success, failedCount: failed, skippedCount: skipped, createdCount: created, updatedCount: updated, failureFilePath, resultJson, completedAt: new Date() } });
    await appendAuditRecord(tx, auditContext(request), { action: "IMPORT_EXECUTE", module: "import", targetType: "import_job", targetId: job.id, brandId: input.brand.id, details: { objectType: input.objectType, status, ...resultJson } });
    return saved;
  });
  return { job: updatedJob, result: resultJson };
}
