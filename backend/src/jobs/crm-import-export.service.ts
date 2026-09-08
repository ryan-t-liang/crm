import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImportJobRow, Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { appendAuditRecord, type AuditActorContext } from "../common/audit.js";
import { ApiError } from "../common/errors.js";
import { jobNumber } from "../common/ids.js";
import { contactImportSchema, type ContactImportInput } from "../contacts/schemas.js";
import { ContactService } from "../contacts/service.js";
import { crmLeadImportSchema, type CrmLeadImportInput } from "../crm-leads/schemas.js";
import { CrmLeadService } from "../crm-leads/service.js";
import { CrmAttachmentService } from "../crm-leads/attachments.js";
import { marketingLeadImportSchema, type MarketingLeadImportInput } from "../marketing-leads/schemas.js";
import { MarketingLeadService } from "../marketing-leads/service.js";
import { normalizeInternationalPhone } from "../marketing-leads/phone.js";
import { organizationCreateSchema } from "../organizations/schemas.js";
import { normalizeOrganizationName, OrganizationService } from "../organizations/service.js";
import { crmImportFields, contactExportFields, crmLeadExportFields, marketingLeadExportFields, organizationExportFields } from "./crm-schema.js";
import type { CrmJobObjectType } from "./job-types.js";
import { fileSha256, parseWorkbook, writeFailureCsv } from "./workbook.js";

export type CrmExportRequestInput = {
  scope: "SELECTED" | "FILTERED" | "ALL_CURRENT_PERMISSION";
  format: "XLSX";
  selectedIds: string[];
  filters: Record<string, string>;
  requestedFields?: string[];
};

type ExportActor = { userId: string; roleKey: string };

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
const contactTypeAliases = new Map([
  ["BUSINESS", "BUSINESS"], ["企业联系人", "BUSINESS"],
  ["INDIVIDUAL", "INDIVIDUAL"], ["个人联系人", "INDIVIDUAL"],
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
const organizationRoleAliases = new Map([
  ["PROSPECT", "PROSPECT"], ["潜在客户", "PROSPECT"], ["CUSTOMER", "CUSTOMER"], ["客户", "CUSTOMER"],
  ["VENDOR", "VENDOR"], ["供应商", "VENDOR"], ["PARTNER", "PARTNER"], ["合作伙伴", "PARTNER"],
]);
const organizationTypeAliases = new Map([
  ["ENTERPRISE", "ENTERPRISE"], ["企业", "ENTERPRISE"],
  ["SCHOOL", "SCHOOL"], ["学校", "SCHOOL"], ["高校", "SCHOOL"], ["学校 / 高校", "SCHOOL"],
  ["GOVERNMENT", "GOVERNMENT"], ["政府机构", "GOVERNMENT"],
  ["ASSOCIATION", "ASSOCIATION"], ["协会", "ASSOCIATION"], ["商会", "ASSOCIATION"], ["协会 / 商会", "ASSOCIATION"],
  ["NONPROFIT", "NONPROFIT"], ["非营利组织", "NONPROFIT"],
  ["FOUNDATION", "FOUNDATION"], ["基金会", "FOUNDATION"],
  ["OTHER", "OTHER"], ["其他", "OTHER"],
]);
const lifecycleAliases = new Map([
  ["TARGET", "TARGET"], ["目标", "TARGET"], ["CONTACTED", "CONTACTED"], ["已触达", "CONTACTED"],
  ["NURTURING", "NURTURING"], ["孵化中", "NURTURING"], ["OPPORTUNITY", "OPPORTUNITY"], ["机会中", "OPPORTUNITY"],
  ["CUSTOMER", "CUSTOMER"], ["客户", "CUSTOMER"], ["DISQUALIFIED", "DISQUALIFIED"], ["不合格", "DISQUALIFIED"],
]);
const marketingSourceAliases = new Map([
  ["WEBSITE", "WEBSITE"], ["网站", "WEBSITE"], ["FORM", "FORM"], ["表单", "FORM"],
  ["CAMPAIGN", "CAMPAIGN"], ["营销活动", "CAMPAIGN"], ["EVENT", "EVENT"], ["活动", "EVENT"],
  ["EXHIBITION", "EXHIBITION"], ["展会", "EXHIBITION"], ["REFERRAL", "REFERRAL"], ["转介绍", "REFERRAL"],
  ["LINKEDIN", "LINKEDIN"], ["WECHAT", "WECHAT"], ["微信", "WECHAT"], ["OUTBOUND", "OUTBOUND"],
  ["PARTNER", "PARTNER"], ["合作伙伴", "PARTNER"], ["IMPORT", "IMPORT"], ["导入", "IMPORT"],
  ["MANUAL", "MANUAL"], ["手工", "MANUAL"], ["OTHER", "OTHER"], ["其他", "OTHER"],
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

function splitMultiValue(value: string | undefined): string[] {
  return [...new Set(String(value ?? "").split(/\r?\n|;/).map((item) => item.trim()).filter(Boolean))];
}

function attachmentUrls(value: string | undefined, field: string, warnings: ValidationMessage[]): string[] {
  const urls: string[] = [];
  for (const item of splitMultiValue(value)) {
    try {
      const parsed = new URL(item);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported protocol");
      urls.push(parsed.toString());
    } catch {
      warnings.push({ code: "ATTACHMENT_FILE_NOT_AVAILABLE", field, message: `${field} 中的“${item}”没有可访问的 HTTP/HTTPS 文件实体，将不会创建附件` });
    }
  }
  return urls;
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

async function preflightContacts(app: FastifyInstance, rows: Array<{ rowNumber: number; values: Record<string, string> }>, createMissingOrganization = false): Promise<CrmPreflightRow[]> {
  const resolveUser = await userResolver(app);
  const contacts = await app.prisma.contact.findMany({
    where: { deletedAt: null, OR: [{ email: { not: null } }, { phone: { not: null } }] },
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
  const organizations = await app.prisma.organization.findMany({ where: { deletedAt: null }, select: { id: true, name: true, normalizedName: true } });
  const output: CrmPreflightRow[] = [];
  for (const row of rows) {
    const raw = row.values;
    const errors: ValidationMessage[] = [];
    const warnings: ValidationMessage[] = [];
    const email = trimOrNull(raw.email)?.toLowerCase() ?? null;
    const phone = trimOrNull(raw.phone);
    const phoneKey = normalizedPhone(phone);
    const stage = enumValue(raw.stage, stageAliases, "stage", "INITIAL", errors);
    const contactType = enumValue(raw.contactType, contactTypeAliases, "contactType", "BUSINESS", errors);
    const ownerUserId = resolveUser(raw.owner, "owner", errors);
    let organizationId = trimOrNull(raw.organizationId);
    const organizationName = trimOrNull(raw.organizationName);
    let organizationNameToCreate: string | null = null;
    if (organizationId && !organizations.some((organization) => organization.id === organizationId)) {
      errors.push({ code: "ORGANIZATION_NOT_FOUND", field: "organizationId", message: `未找到公司编号：${organizationId}` });
      organizationId = null;
    } else if (!organizationId && organizationName) {
      const matches = organizations.filter((organization) => organization.normalizedName === normalizeOrganizationName(organizationName));
      if (matches.length === 1) organizationId = matches[0]!.id;
      else if (matches.length > 1) errors.push({ code: "ORGANIZATION_AMBIGUOUS", field: "organizationName", message: `公司名称匹配到 ${matches.length} 条记录，请改用 organizationId` });
      else if (createMissingOrganization) {
        organizationNameToCreate = organizationName;
        warnings.push({ code: "ORGANIZATION_WILL_BE_CREATED", field: "organizationName", message: `执行导入时将显式创建公司：${organizationName}` });
      } else errors.push({ code: "ORGANIZATION_NOT_FOUND", field: "organizationName", message: `未找到公司：${organizationName}；如需创建，请开启 Create Missing Organization` });
    }
    const candidate = {
      contactName: String(raw.contactName ?? "").trim(), contactType,
      organizationId, companyShortName: trimOrNull(raw.companyShortName), companyName: trimOrNull(raw.companyName) ?? organizationName,
      department: trimOrNull(raw.department), title: trimOrNull(raw.title), email, phone,
      wechat: trimOrNull(raw.wechat), linkedin: trimOrNull(raw.linkedin), website: trimOrNull(raw.website),
      industry: trimOrNull(raw.industry), source: trimOrNull(raw.source), country: trimOrNull(raw.country),
      city: trimOrNull(raw.city), region: trimOrNull(raw.region), stage,
      ownerUserId, nextFollowupAt: parseDate(raw.nextFollowupAt, "nextFollowupAt", errors),
      initialContext: trimOrNull(raw.initialContext), followupAttention: trimOrNull(raw.followupAttention), remark: trimOrNull(raw.remark),
    };
    const parsed = contactImportSchema.safeParse(candidate);
    if (!parsed.success) errors.push(...schemaErrors(parsed.error));
    const addDuplicate = (field: "email" | "phone", message: string) => {
      if (!warnings.some((warning) => warning.field === field && warning.message === message)) warnings.push({ code: "POTENTIAL_DUPLICATE", field, message });
    };
    if (email) {
      for (const contact of emailMatches.get(email) ?? []) addDuplicate("email", `电子邮箱可能重复：${email}；现有联系人：${contact.contactName} / ${contact.companyShortName || contact.companyName || "-"}`);
      const previous = workbookEmails.get(email);
      if (previous) addDuplicate("email", `电子邮箱可能重复：${email}；同时出现在工作簿第 ${previous} 行`);
      else workbookEmails.set(email, row.rowNumber);
    }
    if (phoneKey) {
      for (const contact of phoneMatches.get(phoneKey) ?? []) addDuplicate("phone", `电话可能重复：${phone}；现有联系人：${contact.contactName} / ${contact.companyShortName || contact.companyName || "-"}`);
      const previous = workbookPhones.get(phoneKey);
      if (previous) addDuplicate("phone", `电话可能重复：${phone}；同时出现在工作簿第 ${previous} 行`);
      else workbookPhones.set(phoneKey, row.rowNumber);
    }
    const fileUrls = attachmentUrls(raw.meetingMinutesFiles, "meetingMinutesFiles", warnings);
    const normalizedData = { ...(parsed.success ? serializable(parsed.data) : serializable(candidate)), _organizationNameToCreate: organizationNameToCreate, attachmentUrls: { meetingMinutesFiles: fileUrls } };
    output.push({
      rowNumber: row.rowNumber,
      status: errors.length ? "ERROR" : warnings.length ? "WARNING" : "VALID",
      identity: [candidate.contactName, candidate.companyShortName || candidate.companyName].filter(Boolean).join(" / "),
      rawData: raw, normalizedData, errors, warnings,
    });
  }
  return output;
}

async function preflightOrganizations(app: FastifyInstance, rows: Array<{ rowNumber: number; values: Record<string, string> }>): Promise<CrmPreflightRow[]> {
  const resolveUser = await userResolver(app);
  const existing = await app.prisma.organization.findMany({ where: { deletedAt: null }, select: { id: true, name: true, normalizedName: true, websiteDomain: true } });
  const output: CrmPreflightRow[] = [];
  for (const row of rows) {
    const raw = row.values;
    const errors: ValidationMessage[] = [];
    const warnings: ValidationMessage[] = [];
    const roles = splitMultiValue(raw.roles || "PROSPECT").map((value) => enumValue(value, organizationRoleAliases, "roles", "PROSPECT", errors));
    const organizationType = enumValue(raw.organizationType, organizationTypeAliases, "organizationType", "ENTERPRISE", errors);
    const lifecycleStage = enumValue(raw.lifecycle, lifecycleAliases, "lifecycle", "TARGET", errors);
    const fitScore = trimOrNull(raw.fitScore) ? Number(raw.fitScore) : 0;
    if (!Number.isInteger(fitScore) || fitScore < 0 || fitScore > 100) errors.push({ code: "INVALID_FIT_SCORE", field: "fitScore", message: "fitScore 必须是 0 到 100 的整数" });
    const candidate = {
      name: String(raw.name ?? "").trim(), shortName: trimOrNull(raw.shortName), organizationType, website: trimOrNull(raw.website),
      industry: trimOrNull(raw.industry), country: trimOrNull(raw.country), region: trimOrNull(raw.region), city: trimOrNull(raw.city),
      district: trimOrNull(raw.district), street: trimOrNull(raw.street),
      roles, lifecycleStage, ownerUserId: resolveUser(raw.owner, "owner", errors), fitScore,
      fitReason: trimOrNull(raw.fitReason), note: trimOrNull(raw.note), confirmDuplicate: false,
    };
    const parsed = organizationCreateSchema.safeParse(candidate);
    if (!parsed.success) errors.push(...schemaErrors(parsed.error));
    const nameMatches = existing.filter((organization) => organization.normalizedName === normalizeOrganizationName(candidate.name));
    if (nameMatches.length) warnings.push({ code: "POTENTIAL_DUPLICATE", field: "name", message: `发现 ${nameMatches.length} 条同名公司；执行时仍会要求显式确认` });
    const logo = attachmentUrls(raw.logo, "logo", warnings);
    output.push({ rowNumber: row.rowNumber, status: errors.length ? "ERROR" : warnings.length ? "WARNING" : "VALID", identity: candidate.name, rawData: raw, normalizedData: { ...(parsed.success ? serializable(parsed.data) : serializable(candidate)), attachmentUrls: { logo } }, errors, warnings });
  }
  return output;
}

async function preflightLeads(app: FastifyInstance, rows: Array<{ rowNumber: number; values: Record<string, string> }>): Promise<CrmPreflightRow[]> {
  const resolveUser = await userResolver(app);
  const contactIds = [...new Set(rows.map((row) => trimOrNull(row.values.contactId)).filter((value): value is string => Boolean(value)))];
  const existingContacts = new Set((await app.prisma.contact.findMany({ where: { id: { in: contactIds }, deletedAt: null }, select: { id: true } })).map((contact) => contact.id));
  const output: CrmPreflightRow[] = [];
  for (const row of rows) {
    const raw = row.values;
    const errors: ValidationMessage[] = [];
    const warnings: ValidationMessage[] = [];
    const contactId = String(raw.contactId ?? "").trim();
    if (contactId && !existingContacts.has(contactId)) errors.push({ code: "CONTACT_NOT_FOUND", field: "contactId", message: `未找到联系人编号：${contactId}` });
    const priority = enumValue(raw.priority, priorityAliases, "priority", "MEDIUM", errors);
    const status = enumValue(raw.status, statusAliases, "status", "NEW", errors);
    const salesOwnerUserId = resolveUser(raw.salesOwner, "salesOwner", errors);
    const followupOwnerUserId = resolveUser(raw.followupOwner, "followupOwner", errors);
    const participantUserIds = splitMultiValue(raw.participantUsers).map((value) => resolveUser(value, "participantUsers", errors)).filter((value): value is string => Boolean(value));
    const quote = trimOrNull(raw.estimatedQuote);
    const currency = trimOrNull(raw.currency);
    if (quote && !/^\d{1,16}(?:\.\d{1,2})?$/.test(quote)) errors.push({ code: "INVALID_QUOTE", field: "estimatedQuote", message: "预计报价必须大于等于 0，且最多保留 2 位小数" });
    if (quote && !currency) errors.push({ code: "CURRENCY_REQUIRED", field: "currency", message: "填写预计报价时必须填写币种" });
    if (currency && !/^[A-Z]{3}$/.test(currency)) errors.push({ code: "INVALID_CURRENCY", field: "currency", message: "币种必须是 3 位大写代码" });
    const candidate = {
      contactId,
      requirementSummary: String(raw.requirementSummary ?? "").trim(),
      requirementDetail: trimOrNull(raw.requirementDetail), imageRequirementNote: trimOrNull(raw.imageRequirementNote), latestProgress: trimOrNull(raw.latestProgress), nextAction: trimOrNull(raw.nextAction), leadSource: trimOrNull(raw.leadSource),
      priority, estimatedQuote: quote, currency, projectDomain: trimOrNull(raw.projectDomain),
      projectType: trimOrNull(raw.projectType), technologyType: trimOrNull(raw.technologyType),
      productType: trimOrNull(raw.productType), productName: trimOrNull(raw.productName),
      resourceRequirement: trimOrNull(raw.resourceRequirement), collaborationGroups: splitMultiValue(raw.collaborationGroups).join("\n") || null,
      followMode: trimOrNull(raw.followMode), solution: trimOrNull(raw.solution), quotationNote: trimOrNull(raw.quotationNote),
      remark: trimOrNull(raw.remark), status, salesOwnerUserId, followupOwnerUserId,
      nextFollowupAt: parseDate(raw.nextFollowupAt, "nextFollowupAt", errors),
      wonAt: parseDate(raw.wonAt, "wonAt", errors), deliveryFollowupAt: parseDate(raw.deliveryFollowupAt, "deliveryFollowupAt", errors),
      contractRenewalAt: parseDate(raw.contractRenewalAt, "contractRenewalAt", errors), paymentReceivedAt: parseDate(raw.paymentReceivedAt, "paymentReceivedAt", errors),
      participantUserIds,
    };
    const parsed = crmLeadImportSchema.safeParse(candidate);
    if (!parsed.success) errors.push(...schemaErrors(parsed.error));
    const fileUrls = Object.fromEntries(["requirementFiles", "requirementImages", "proposalFiles", "quotationFiles"].map((field) => [field, attachmentUrls(raw[field], field, warnings)]));
    const normalizedData = { ...(parsed.success ? serializable(parsed.data) : serializable(candidate)), attachmentUrls: fileUrls };
    output.push({
      rowNumber: row.rowNumber,
      status: errors.length ? "ERROR" : warnings.length ? "WARNING" : "VALID",
      identity: [candidate.requirementSummary, contactId].filter(Boolean).join(" / "),
      rawData: raw, normalizedData, errors, warnings,
    });
  }
  return output;
}

async function preflightMarketingLeads(app: FastifyInstance, rows: Array<{ rowNumber: number; values: Record<string, string> }>): Promise<CrmPreflightRow[]> {
  const resolveUser = await userResolver(app);
  const existing = await app.prisma.marketingLead.findMany({
    where: { deletedAt: null, OR: [{ email: { not: null } }, { phoneNormalized: { not: null } }, { whatsappNormalized: { not: null } }] },
    select: { id: true, fullName: true, companyName: true, email: true, phoneNormalized: true, whatsappNormalized: true },
  });
  const workbookIdentity = new Map<string, number>();
  const output: CrmPreflightRow[] = [];
  for (const row of rows) {
    const raw = row.values;
    const errors: ValidationMessage[] = [];
    const warnings: ValidationMessage[] = [];
    const countryCode = trimOrNull(raw.countryCode)?.toUpperCase() ?? null;
    const email = trimOrNull(raw.email)?.toLowerCase() ?? null;
    const phone = trimOrNull(raw.phone);
    const whatsapp = trimOrNull(raw.whatsapp);
    const phoneNormalized = normalizeInternationalPhone(phone, countryCode);
    const whatsappNormalized = normalizeInternationalPhone(whatsapp, countryCode);
    if (phone && !phoneNormalized) errors.push({ code: "INVALID_INTERNATIONAL_PHONE", field: "phone", message: "Phone 必须使用有效国际号码，或同时提供 ISO 国家代码" });
    if (whatsapp && !whatsappNormalized) errors.push({ code: "INVALID_INTERNATIONAL_PHONE", field: "whatsapp", message: "WhatsApp 必须使用有效国际号码，或同时提供 ISO 国家代码" });
    const fitScore = trimOrNull(raw.fitScore) ? Number(raw.fitScore) : 0;
    if (!Number.isInteger(fitScore) || fitScore < 0 || fitScore > 100) errors.push({ code: "INVALID_FIT_SCORE", field: "fitScore", message: "fitScore 必须是 0 到 100 的整数" });
    const candidate = {
      fullName: String(raw.fullName ?? "").trim(), email, phone, whatsapp, wechat: trimOrNull(raw.wechat),
      companyName: trimOrNull(raw.companyName), title: trimOrNull(raw.title), countryCode,
      source: enumValue(raw.source, marketingSourceAliases, "source", "IMPORT", errors),
      sourceChannel: trimOrNull(raw.sourceChannel), sourceDetail: trimOrNull(raw.sourceDetail),
      inquiryType: trimOrNull(raw.inquiryType), inquiryContent: trimOrNull(raw.inquiryContent),
      ownerUserId: resolveUser(raw.owner, "owner", errors), fitScore, note: trimOrNull(raw.note), status: "NEW",
    };
    const parsed = marketingLeadImportSchema.safeParse(candidate);
    if (!parsed.success) errors.push(...schemaErrors(parsed.error));
    const matches = existing.filter((lead) =>
      Boolean(
        (email && lead.email?.toLowerCase() === email) ||
        (phoneNormalized && lead.phoneNormalized === phoneNormalized) ||
        (whatsappNormalized && lead.whatsappNormalized === whatsappNormalized),
      ),
    );
    if (matches.length) warnings.push({ code: "POTENTIAL_DUPLICATE", field: email ? "email" : phoneNormalized ? "phone" : "whatsapp", message: `发现 ${matches.length} 条可能重复线索，导入不会自动合并` });
    for (const identity of [email && `email:${email}`, phoneNormalized && `phone:${phoneNormalized}`, whatsappNormalized && `whatsapp:${whatsappNormalized}`].filter((value): value is string => Boolean(value))) {
      const previous = workbookIdentity.get(identity);
      if (previous) warnings.push({ code: "POTENTIAL_DUPLICATE", message: `同一身份信息也出现在工作簿第 ${previous} 行，导入不会自动合并` });
      else workbookIdentity.set(identity, row.rowNumber);
    }
    output.push({
      rowNumber: row.rowNumber,
      status: errors.length ? "ERROR" : warnings.length ? "WARNING" : "VALID",
      identity: [candidate.fullName, candidate.companyName].filter(Boolean).join(" / "),
      rawData: raw,
      normalizedData: parsed.success ? serializable(parsed.data) : serializable(candidate),
      errors,
      warnings,
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

export async function prepareCrmImport(app: FastifyInstance, objectType: CrmJobObjectType, buffer: Buffer, options: { createMissingOrganization?: boolean } = {}) {
  const parsed = await parseWorkbook(buffer);
  if (parsed.rows.length > 5000) throw new ApiError(400, "IMPORT_LIMIT_EXCEEDED", "单次导入最多 5000 行");
  const mapping = assertHeaders(objectType, parsed.headers);
  const rows = objectType === "CONTACT"
    ? await preflightContacts(app, parsed.rows, options.createMissingOrganization)
    : objectType === "CRM_LEAD"
      ? await preflightLeads(app, parsed.rows)
      : objectType === "MARKETING_LEAD"
        ? await preflightMarketingLeads(app, parsed.rows)
      : await preflightOrganizations(app, parsed.rows);
  return { parsed, mapping, rows, summary: crmPreflightSummary(rows) };
}

function contactInput(data: Record<string, unknown>): ContactImportInput {
  return contactImportSchema.parse(data);
}

function leadInput(data: Record<string, unknown>): CrmLeadImportInput {
  return crmLeadImportSchema.parse(data);
}

function marketingLeadInput(data: Record<string, unknown>): MarketingLeadImportInput {
  return marketingLeadImportSchema.parse(data);
}

export async function executeCrmImportJob(app: FastifyInstance, request: FastifyRequest, jobId: string) {
  const job = await app.prisma.importJob.findFirst({
    where: { id: jobId, objectType: { in: ["CONTACT", "CRM_LEAD", "MARKETING_LEAD", "ORGANIZATION"] }, createdBy: request.auth!.userId },
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
  const marketingLeads = new MarketingLeadService(app.prisma, app.config);
  const organizations = new OrganizationService(app.prisma, app.config);
  const attachments = new CrmAttachmentService(app.prisma, app.config.storageDir, app.config.maxAttachmentBytes);
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
      const { attachmentUrls: importedAttachmentUrls, _organizationNameToCreate, ...entityData } = data;
      if (job.objectType === "CONTACT" && _organizationNameToCreate && !entityData.organizationId) {
        const createdOrganization = await organizations.create({ name: String(_organizationNameToCreate), roles: ["PROSPECT"], confirmDuplicate: false }, request.auth!.userId, auditContext(request));
        entityData.organizationId = createdOrganization!.id;
      }
      const created = job.objectType === "CONTACT"
        ? await contacts.create(contactInput(entityData), request.auth!.userId, auditContext(request))
        : job.objectType === "CRM_LEAD"
          ? await leads.create(leadInput(entityData), request.auth!.userId, auditContext(request))
          : job.objectType === "MARKETING_LEAD"
            ? await marketingLeads.create(marketingLeadInput(entityData), request.auth!.userId, auditContext(request))
          : await organizations.create(organizationCreateSchema.parse(entityData), request.auth!.userId, auditContext(request));
      const urlsByField = (importedAttachmentUrls ?? {}) as Record<string, string[]>;
      for (const [fieldKey, urls] of Object.entries(urlsByField)) {
        for (const url of urls) await attachments.createExternal(job.objectType === "CONTACT" ? "CONTACT" : job.objectType === "CRM_LEAD" ? "LEAD" : "ORGANIZATION", created!.id, fieldKey, url, request.auth!.userId, auditContext(request));
      }
      success += 1;
      await app.prisma.importJobRow.update({ where: { id: row.id }, data: { status: "SUCCEEDED", createdId: created!.id } });
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

type ExportAttachment = { id: string; entityId: string; fieldKey: string; storageType: "LOCAL" | "EXTERNAL_URL"; originalName: string; externalUrl: string | null };

function attachmentExportValue(app: FastifyInstance, entityType: "CONTACT" | "LEAD" | "ORGANIZATION", entityId: string, fieldKey: string, rows: ExportAttachment[]): string | null {
  const value = rows.filter((item) => item.entityId === entityId && item.fieldKey === fieldKey).map((item) => {
    const url = item.storageType === "EXTERNAL_URL"
      ? item.externalUrl
      : `${app.config.appBasePath}/api/v1/crm/${entityType === "CONTACT" ? "contacts" : entityType === "LEAD" ? "leads" : "organizations"}/${encodeURIComponent(entityId)}/attachments/${encodeURIComponent(item.id)}/download`;
    return `${item.originalName} | ${url || "-"}`;
  });
  return value.length ? value.join("\n") : null;
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

function contains(value?: string) {
  return value ? { contains: value } : undefined;
}

function exportWhere(objectType: CrmJobObjectType, input: CrmExportRequestInput, actor: ExportActor) {
  const selected = input.scope === "SELECTED" ? { id: { in: input.selectedIds } } : {};
  const filtered = input.scope === "FILTERED" ? input.filters : {};
  if (objectType === "ORGANIZATION") return {
    deletedAt: null,
    ...selected,
    lifecycleStage: filtered.lifecycleStage || undefined,
    ownerUserId: filtered.ownerUserId || (filtered.view === "mine" ? actor.userId : undefined),
    roles: filtered.role
      ? {
          some: {
            role:
              filtered.role === "CUSTOMER_RELATION"
                ? { in: ["PROSPECT", "CUSTOMER"] }
                : filtered.role,
          },
        }
      : undefined,
    organizationType: filtered.organizationType || undefined,
    OR: filtered.keyword ? [{ name: contains(filtered.keyword) }, { shortName: contains(filtered.keyword) }, { website: contains(filtered.keyword) }] : undefined,
  };
  if (objectType === "CONTACT") return {
    deletedAt: null,
    ...selected,
    organizationId: filtered.organizationId || undefined,
    ownerUserId: filtered.ownerUserId || undefined,
    contactType: filtered.contactType || undefined,
    OR: filtered.keyword ? [{ contactName: contains(filtered.keyword) }, { companyName: contains(filtered.keyword) }, { email: contains(filtered.keyword) }, { phone: contains(filtered.keyword) }] : undefined,
  };
  if (objectType === "MARKETING_LEAD") return {
    deletedAt: null,
    ...selected,
    status: filtered.status || undefined,
    source: filtered.source || undefined,
    ownerUserId: filtered.ownerUserId || undefined,
    AND: actor.roleKey === "SALES" ? { OR: [{ ownerUserId: actor.userId }, { createdByUserId: actor.userId }] } : undefined,
    OR: filtered.keyword ? [{ fullName: contains(filtered.keyword) }, { companyName: contains(filtered.keyword) }, { email: contains(filtered.keyword) }, { phone: contains(filtered.keyword) }, { inquiryContent: contains(filtered.keyword) }] : undefined,
  };
  return {
    deletedAt: null,
    ...selected,
    status: filtered.status || undefined,
    priority: filtered.priority || undefined,
    salesOwnerUserId: filtered.salesOwnerUserId || undefined,
    contact: { deletedAt: null, organizationId: filtered.organizationId || undefined },
    OR: filtered.keyword ? [{ requirementSummary: contains(filtered.keyword) }, { contact: { contactName: contains(filtered.keyword) } }, { contact: { companyName: contains(filtered.keyword) } }] : undefined,
  };
}

export async function estimateCrmExportCount(app: FastifyInstance, objectType: CrmJobObjectType, input: CrmExportRequestInput, actor: ExportActor) {
  const where = exportWhere(objectType, input, actor);
  if (objectType === "ORGANIZATION") return app.prisma.organization.count({ where: where as Prisma.OrganizationWhereInput });
  if (objectType === "CONTACT") return app.prisma.contact.count({ where: where as Prisma.ContactWhereInput });
  if (objectType === "MARKETING_LEAD") return app.prisma.marketingLead.count({ where: where as Prisma.MarketingLeadWhereInput });
  return app.prisma.crmLead.count({ where: where as Prisma.CrmLeadWhereInput });
}

export async function buildCrmExportWorkbook(app: FastifyInstance, objectType: CrmJobObjectType, input: CrmExportRequestInput = { scope: "ALL_CURRENT_PERMISSION", format: "XLSX", selectedIds: [], filters: {} }, actor: ExportActor = { userId: "", roleKey: "SUPER_ADMIN" }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kivisense CRM";
  if (objectType === "ORGANIZATION") {
    const sheet = workbook.addWorksheet("Organizations", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = organizationExportFields.map(([key, header]) => ({ key, header, width: Math.max(14, Math.min(32, header.length + 6)) }));
    const [rows, attachmentRows] = await Promise.all([
      app.prisma.organization.findMany({ where: exportWhere(objectType, input, actor) as Prisma.OrganizationWhereInput, include: { roles: true, owner: { select: { loginAccount: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] }),
      app.prisma.crmAttachment.findMany({ where: { entityType: "ORGANIZATION" }, select: { id: true, entityId: true, fieldKey: true, storageType: true, originalName: true, externalUrl: true } }),
    ]);
    for (const organization of rows) sheet.addRow({
      ...organization, roles: organization.roles.map((item) => item.role).join("\n"), lifecycle: organization.lifecycleStage,
      owner: organization.owner?.loginAccount ?? null, logo: attachmentExportValue(app, "ORGANIZATION", organization.id, "logo", attachmentRows),
      createdAt: formatDate(organization.createdAt), updatedAt: formatDate(organization.updatedAt),
    });
    styleExportSheet(sheet, ["id", "roles", "logo"]);
    return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), rowCount: rows.length, fields: organizationExportFields.map(([key]) => key) };
  }
  if (objectType === "CONTACT") {
    const sheet = workbook.addWorksheet("Contacts", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = contactExportFields.map(([key, header]) => ({ key, header, width: Math.max(14, Math.min(32, header.length + 6)) }));
    const [rows, attachmentRows] = await Promise.all([
      app.prisma.contact.findMany({ where: exportWhere(objectType, input, actor) as Prisma.ContactWhereInput, include: { organization: { select: { id: true, name: true } }, owner: { select: { loginAccount: true } }, createdBy: { select: { loginAccount: true } }, _count: { select: { leads: { where: { deletedAt: null } } } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] }),
      app.prisma.crmAttachment.findMany({ where: { entityType: "CONTACT" }, select: { id: true, entityId: true, fieldKey: true, storageType: true, originalName: true, externalUrl: true } }),
    ]);
    for (const contact of rows) sheet.addRow({
      ...contact,
      organizationId: contact.organization?.id ?? null,
      organizationName: contact.organization?.name ?? null,
      owner: contact.owner?.loginAccount ?? null,
      createdBy: contact.createdBy.loginAccount,
      nextFollowupAt: formatDate(contact.nextFollowupAt),
      meetingMinutesFiles: attachmentExportValue(app, "CONTACT", contact.id, "meetingMinutesFiles", attachmentRows),
      relatedLeadCount: contact._count.leads,
      createdAt: formatDate(contact.createdAt), updatedAt: formatDate(contact.updatedAt),
    });
    styleExportSheet(sheet, ["id", "organizationId", "phone", "meetingMinutesFiles"]);
    return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), rowCount: rows.length, fields: contactExportFields.map(([key]) => key) };
  }
  if (objectType === "MARKETING_LEAD") {
    const sheet = workbook.addWorksheet("Marketing Leads", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = marketingLeadExportFields.map(([key, header]) => ({ key, header, width: Math.max(14, Math.min(32, header.length + 6)) }));
    const rows = await app.prisma.marketingLead.findMany({
      where: exportWhere(objectType, input, actor) as Prisma.MarketingLeadWhereInput,
      include: { owner: { select: { loginAccount: true } }, createdBy: { select: { loginAccount: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    for (const lead of rows) sheet.addRow({
      ...lead,
      owner: lead.owner?.loginAccount ?? null,
      createdBy: lead.createdBy.loginAccount,
      engagementScore: lead.engagementScoreCached,
      firstTouchAt: formatDate(lead.firstTouchAt), lastActivityAt: formatDate(lead.lastActivityAt),
      mqlAt: formatDate(lead.mqlAt), sqlAt: formatDate(lead.sqlAt), qualifiedAt: formatDate(lead.qualifiedAt), convertedAt: formatDate(lead.convertedAt),
      createdAt: formatDate(lead.createdAt), updatedAt: formatDate(lead.updatedAt),
    });
    styleExportSheet(sheet, ["id", "phone", "whatsapp", "convertedOpportunityId"]);
    return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), rowCount: rows.length, fields: marketingLeadExportFields.map(([key]) => key) };
  }
  const sheet = workbook.addWorksheet("CRM Leads", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = crmLeadExportFields.map(([key, header]) => ({ key, header, width: Math.max(14, Math.min(32, header.length + 6)) }));
  const [rows, attachmentRows] = await Promise.all([app.prisma.crmLead.findMany({
    where: exportWhere(objectType, input, actor) as Prisma.CrmLeadWhereInput,
    include: {
      contact: { select: { contactName: true, companyShortName: true, companyName: true, email: true, phone: true, wechat: true, organization: { select: { name: true, shortName: true } } } },
      salesOwner: { select: { loginAccount: true } }, followupOwner: { select: { loginAccount: true } },
      createdBy: { select: { loginAccount: true } }, participants: { include: { user: { select: { loginAccount: true } } } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  }), app.prisma.crmAttachment.findMany({ where: { entityType: "LEAD" }, select: { id: true, entityId: true, fieldKey: true, storageType: true, originalName: true, externalUrl: true } })]);
  for (const lead of rows) sheet.addRow({
    ...lead,
    estimatedQuote: lead.estimatedQuote?.toString() ?? null,
    salesOwner: lead.salesOwner?.loginAccount ?? null, followupOwner: lead.followupOwner?.loginAccount ?? null,
    participantUsers: lead.participants.map((item) => item.user.loginAccount).join("\n") || null,
    nextFollowupAt: formatDate(lead.nextFollowupAt), lastFollowupAt: formatDate(lead.lastFollowupAt),
    wonAt: formatDate(lead.wonAt), deliveryFollowupAt: formatDate(lead.deliveryFollowupAt), contractRenewalAt: formatDate(lead.contractRenewalAt), paymentReceivedAt: formatDate(lead.paymentReceivedAt),
    requirementFiles: attachmentExportValue(app, "LEAD", lead.id, "requirementFiles", attachmentRows),
    requirementImages: attachmentExportValue(app, "LEAD", lead.id, "requirementImages", attachmentRows),
    proposalFiles: attachmentExportValue(app, "LEAD", lead.id, "proposalFiles", attachmentRows),
    quotationFiles: attachmentExportValue(app, "LEAD", lead.id, "quotationFiles", attachmentRows),
    contactName: lead.contact.contactName,
    company: lead.contact.organization?.shortName || lead.contact.organization?.name || lead.contact.companyShortName || lead.contact.companyName || null,
    contactEmail: lead.contact.email ?? null, contactPhone: lead.contact.phone ?? null, contactWechat: lead.contact.wechat ?? null,
    createdBy: lead.createdBy.loginAccount,
    createdAt: formatDate(lead.createdAt), updatedAt: formatDate(lead.updatedAt),
  });
  styleExportSheet(sheet, ["id", "contactId", "contactPhone", "participantUsers", "requirementFiles", "requirementImages", "proposalFiles", "quotationFiles"]);
  return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), rowCount: rows.length, fields: crmLeadExportFields.map(([key]) => key) };
}

export async function createCrmExportJob(app: FastifyInstance, request: FastifyRequest, objectType: CrmJobObjectType, input: CrmExportRequestInput) {
  const jobNo = jobNumber("EXP");
  return app.prisma.$transaction(async (tx) => {
    const created = await tx.exportJob.create({
      data: { jobNo, objectType, status: "PENDING", requestJson: input, scope: input.scope, filterJson: input.filters, selectedCount: input.selectedIds.length, requestedFields: input.requestedFields, createdBy: request.auth!.userId },
    });
    await appendAuditRecord(tx, auditContext(request), {
      action: "EXPORT_CREATE", module: "crm_export", targetType: "export_job", targetId: created.id,
      details: { objectType, scope: input.scope, selectedCount: input.selectedIds.length, filters: input.filters },
    });
    return created;
  });
}

export async function processCrmExportJob(app: FastifyInstance, jobId: string, actor: ExportActor) {
  const claim = await app.prisma.exportJob.updateMany({ where: { id: jobId, status: "PENDING" }, data: { status: "PROCESSING" } });
  if (claim.count !== 1) return app.prisma.exportJob.findUnique({ where: { id: jobId } });
  const job = await app.prisma.exportJob.findUniqueOrThrow({ where: { id: jobId } });
  const input = job.requestJson as unknown as CrmExportRequestInput;
  try {
    const result = await buildCrmExportWorkbook(app, job.objectType as CrmJobObjectType, input, actor);
    const directory = join(app.config.storageDir, "exports");
    await mkdir(directory, { recursive: true });
    const fileName = `${job.objectType === "CONTACT" ? "kivisense-contacts" : job.objectType === "CRM_LEAD" ? "kivisense-opportunities" : job.objectType === "MARKETING_LEAD" ? "kivisense-marketing-leads" : "kivisense-organizations"}-${job.jobNo}.xlsx`;
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

export async function persistCrmExport(app: FastifyInstance, request: FastifyRequest, objectType: CrmJobObjectType, input: CrmExportRequestInput = { scope: "ALL_CURRENT_PERMISSION", format: "XLSX", selectedIds: [], filters: {} }) {
  const job = await createCrmExportJob(app, request, objectType, input);
  return processCrmExportJob(app, job.id, { userId: request.auth!.userId, roleKey: request.auth!.roleKey });
}
