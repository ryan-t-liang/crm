import { z } from "zod";
import { timezoneAwareDateTimeSchema } from "../contacts/schemas.js";

const emptyToNull = (value: unknown) => typeof value === "string" && value.trim() === "" ? null : value;
const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const optionalId = z.preprocess(emptyToNull, z.string().trim().min(1).max(32).nullable().optional());
const optionalUrl = z.preprocess(emptyToNull, z.string().trim().max(500).url().nullable().optional());
const optionalEmail = z.preprocess(
  emptyToNull,
  z.string().trim().max(191).email().transform((value) => value.toLowerCase()).nullable().optional(),
);
const optionalDateTime = z.preprocess(emptyToNull, timezoneAwareDateTimeSchema.nullable().optional());
const countryCode = z.preprocess(
  emptyToNull,
  z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "国家代码必须是 ISO 3166-1 alpha-2").nullable().optional(),
);

export const marketingLeadStatuses = ["NEW", "NURTURING", "MQL", "SQL", "QUALIFIED", "CONVERTED", "RECYCLED", "DISQUALIFIED"] as const;
export const marketingLeadStatusSchema = z.enum(marketingLeadStatuses);
export const marketingLeadSources = ["WEBSITE", "FORM", "CAMPAIGN", "EVENT", "EXHIBITION", "REFERRAL", "LINKEDIN", "WECHAT", "OUTBOUND", "PARTNER", "IMPORT", "MANUAL", "OTHER"] as const;
export const marketingLeadSourceSchema = z.enum(marketingLeadSources);
export const leadActivitySourceSchema = z.enum(["WEB", "CRM", "SYSTEM", "IMPORT", "CAMPAIGN", "EVENT"]);
export const scoreDimensionSchema = z.enum(["FIT", "ENGAGEMENT"]);

const sourceChannel = z.preprocess(
  emptyToNull,
  z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:/ -]+$/, "来源渠道格式无效").transform((value) => value.toUpperCase().replace(/\s+/g, "_")).nullable().optional(),
);
const requirementTags = z.preprocess(
  (value) => value === "" ? null : value,
  z.array(z.string().trim().min(1).max(80)).max(30).transform((values) => [...new Set(values)]).nullable().optional(),
);
const fitScore = z.number().int().min(0).max(100);

const editableFields = {
  fullName: z.string().trim().min(1).max(160),
  email: optionalEmail,
  phone: optionalText(64),
  whatsapp: optionalText(64),
  wechat: optionalText(191),
  linkedinUrl: optionalUrl,
  title: optionalText(160),
  department: optionalText(160),
  companyName: optionalText(240),
  companyWebsite: optionalUrl,
  companySize: optionalText(80),
  industry: optionalText(160),
  countryCode,
  region: optionalText(120),
  city: optionalText(120),
  inquiryType: optionalText(160),
  inquiryContent: optionalText(32_000),
  productInterest: optionalText(8_000),
  requirementTags,
  budgetRange: optionalText(160),
  note: optionalText(16_000),
  source: marketingLeadSourceSchema,
  sourceChannel,
  sourceDetail: optionalText(240),
  firstTouchAt: optionalDateTime,
  ownerUserId: optionalId,
  fitScore: fitScore.default(0),
  fitReason: optionalText(16_000),
} as const;

export const marketingLeadCreateSchema = z.object({
  ...editableFields,
  status: z.enum(["NEW", "NURTURING"]).default("NEW"),
}).strict();

export const marketingLeadImportSchema = z.object({
  ...editableFields,
  status: z.enum(["NEW", "NURTURING"]).default("NEW"),
}).strict();

export const marketingLeadPatchSchema = z.object({
  fullName: editableFields.fullName.optional(),
  email: editableFields.email,
  phone: editableFields.phone,
  whatsapp: editableFields.whatsapp,
  wechat: editableFields.wechat,
  linkedinUrl: editableFields.linkedinUrl,
  title: editableFields.title,
  department: editableFields.department,
  companyName: editableFields.companyName,
  companyWebsite: editableFields.companyWebsite,
  companySize: editableFields.companySize,
  industry: editableFields.industry,
  countryCode: editableFields.countryCode,
  region: editableFields.region,
  city: editableFields.city,
  inquiryType: editableFields.inquiryType,
  inquiryContent: editableFields.inquiryContent,
  productInterest: editableFields.productInterest,
  requirementTags: editableFields.requirementTags,
  budgetRange: editableFields.budgetRange,
  note: editableFields.note,
  source: editableFields.source.optional(),
  sourceChannel: editableFields.sourceChannel,
  sourceDetail: editableFields.sourceDetail,
  firstTouchAt: editableFields.firstTouchAt,
  ownerUserId: editableFields.ownerUserId,
  fitScore: fitScore.optional(),
  fitReason: editableFields.fitReason,
}).strict().refine((value) => Object.keys(value).length > 0, { message: "至少提供一个需要修改的字段" });

export const marketingLeadOrderBySchema = z.enum([
  "createdAt_desc",
  "createdAt_asc",
  "updatedAt_desc",
  "updatedAt_asc",
  "lastActivityAt_desc",
  "lastActivityAt_asc",
  "fitScore_desc",
  "engagementScoreCached_desc",
  "fullName_asc",
]);

export const marketingLeadActivityCreateSchema = z.object({
  ruleCode: z.string().trim().min(1).max(80).transform((value) => value.toUpperCase()),
  occurredAt: timezoneAwareDateTimeSchema.optional(),
  source: leadActivitySourceSchema.default("CRM"),
  note: optionalText(16_000),
}).strict();

export const marketingLeadTransitionSchema = z.object({
  action: z.enum(["START_NURTURING", "ACCEPT_SQL", "RECYCLE", "QUALIFY", "DISQUALIFY"]),
  reason: optionalText(500),
}).strict().superRefine((value, context) => {
  if (["RECYCLE", "DISQUALIFY"].includes(value.action) && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "该状态操作必须填写原因" });
  }
});

const organizationCreateDataSchema = z.object({
  name: z.string().trim().min(1).max(240),
  shortName: optionalText(120),
  website: optionalUrl,
  companySize: optionalText(80),
  industry: optionalText(160),
  countryCode,
  region: optionalText(120),
  city: optionalText(120),
}).strict();

const contactCreateDataSchema = z.object({
  contactName: z.string().trim().min(1, "转为商机前必须填写联系人姓名").max(160),
  email: optionalEmail,
  phone: optionalText(64),
  whatsapp: optionalText(64),
  wechat: optionalText(191),
  linkedin: optionalUrl,
  title: optionalText(160),
  department: optionalText(160),
}).strict();

export const marketingLeadConversionSchema = z.object({
  organization: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), id: z.string().trim().min(1).max(32) }).strict(),
    z.object({ mode: z.literal("create"), createData: organizationCreateDataSchema }).strict(),
    z.object({ mode: z.literal("none") }).strict(),
  ]),
  contact: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), id: z.string().trim().min(1).max(32) }).strict(),
    z.object({ mode: z.literal("create"), createData: contactCreateDataSchema }).strict(),
  ]),
  opportunity: z.object({
    requirementSummary: z.string().trim().min(1).max(200),
    requirementDetail: optionalText(16_000),
    requirementContext: optionalText(160),
    productInterest: optionalText(4_000),
    requirementTags,
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
    status: z.enum(["NEW", "QUALIFIED", "SOLUTION", "QUOTATION"]).default("NEW"),
    salesOwnerUserId: z.string().trim().min(1).max(32),
    followupOwnerUserId: optionalId,
    conversionNote: optionalText(16_000),
  }).strict(),
  overrideQualification: z.boolean().default(false),
}).strict();

const scoringRuleFields = {
  code: z.string().trim().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9_]*$/).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  scoreDimension: scoreDimensionSchema,
  scoreDelta: z.number().int().min(-100).max(100),
  repeatable: z.boolean().default(true),
  maxOccurrences: z.number().int().min(1).max(65_535).nullable().optional(),
  cooldownHours: z.number().int().min(0).max(65_535).nullable().optional(),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1_000_000).default(0),
  description: optionalText(500),
} as const;

export const scoringRuleCreateSchema = z.object(scoringRuleFields).strict().superRefine((value, context) => {
  if (!value.repeatable && value.maxOccurrences && value.maxOccurrences > 1) {
    context.addIssue({ code: "custom", path: ["maxOccurrences"], message: "不可重复规则最多只能发生一次" });
  }
});

export const scoringRulePatchSchema = z.object(scoringRuleFields).partial().strict().refine(
  (value) => Object.keys(value).length > 0,
  { message: "至少提供一个需要修改的字段" },
);

export type MarketingLeadCreateInput = z.infer<typeof marketingLeadCreateSchema>;
export type MarketingLeadImportInput = z.infer<typeof marketingLeadImportSchema>;
export type MarketingLeadPatchInput = z.infer<typeof marketingLeadPatchSchema>;
export type MarketingLeadActivityCreateInput = z.infer<typeof marketingLeadActivityCreateSchema>;
export type MarketingLeadTransitionInput = z.infer<typeof marketingLeadTransitionSchema>;
export type MarketingLeadConversionInput = z.infer<typeof marketingLeadConversionSchema>;
export type ScoringRuleCreateInput = z.infer<typeof scoringRuleCreateSchema>;
export type ScoringRulePatchInput = z.infer<typeof scoringRulePatchSchema>;
