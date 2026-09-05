import { z } from "zod";
import { timezoneAwareDateTimeSchema } from "../contacts/schemas.js";

const emptyToNull = (value: unknown) => typeof value === "string" && value.trim() === "" ? null : value;
const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const optionalId = z.preprocess(emptyToNull, z.string().trim().min(1).max(32).nullable().optional());
const optionalDateTime = z.preprocess(emptyToNull, timezoneAwareDateTimeSchema.nullable().optional());
const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const statusSchema = z.enum(["NEW", "QUALIFIED", "SOLUTION", "QUOTATION", "WON", "LOST"]);
const followupTypeSchema = z.enum(["GENERAL", "MEETING", "CALL", "EMAIL", "WECHAT", "OTHER"]);

const quoteValueSchema = z.union([
  z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).transform((value) => String(value)),
  z.string().trim().regex(/^\d{1,16}(?:\.\d{1,2})?$/, "报价最多 16 位整数和 2 位小数"),
]);
const optionalQuote = z.preprocess(emptyToNull, quoteValueSchema.nullable().optional());
const optionalCurrency = z.preprocess(
  emptyToNull,
  z.string().trim().length(3).regex(/^[A-Z]{3}$/, "币种必须是 3 位大写代码").nullable().optional(),
);
const participantUserIdsSchema = z.array(z.string().trim().min(1).max(32)).max(50)
  .transform((values) => [...new Set(values)]);

const leadFields = {
  requirementDetail: optionalText(16_000),
  imageRequirementNote: optionalText(16_000),
  quotationNote: optionalText(16_000),
  leadSource: optionalText(160),
  estimatedQuote: optionalQuote,
  currency: optionalCurrency,
  projectDomain: optionalText(160),
  projectType: optionalText(160),
  technologyType: optionalText(4_000),
  productType: optionalText(160),
  productName: optionalText(240),
  resourceRequirement: optionalText(16_000),
  collaborationGroups: optionalText(8_000),
  followMode: optionalText(160),
  solution: optionalText(16_000),
  remark: optionalText(16_000),
  salesOwnerUserId: optionalId,
  followupOwnerUserId: optionalId,
  wonAt: optionalDateTime,
  deliveryFollowupAt: optionalDateTime,
  contractRenewalAt: optionalDateTime,
  paymentReceivedAt: optionalDateTime,
} as const;

export const crmLeadCreateSchema = z.object({
  contactId: z.string().trim().min(1).max(32),
  requirementSummary: z.string().trim().min(1).max(200),
  ...leadFields,
  salesOwnerUserId: z.string().trim().min(1).max(32),
  participantUserIds: participantUserIdsSchema.default([]),
  priority: prioritySchema.default("MEDIUM"),
  status: statusSchema.default("NEW"),
}).strict().superRefine((value, context) => {
  if (value.estimatedQuote !== null && value.estimatedQuote !== undefined && !value.currency) {
    context.addIssue({ code: "custom", path: ["currency"], message: "填写预计报价时必须填写币种" });
  }
});

// Snapshot values are accepted only by the legacy-compatible import path.
// Lead create/edit HTTP schemas intentionally omit them.
export const crmLeadImportSchema = crmLeadCreateSchema.safeExtend({
  latestProgress: optionalText(16_000),
  nextAction: optionalText(16_000),
  nextFollowupAt: optionalDateTime,
}).strict();

export const crmLeadPatchSchema = z.object({
  requirementSummary: z.string().trim().min(1).max(200).optional(),
  ...leadFields,
  participantUserIds: participantUserIdsSchema.optional(),
  priority: prioritySchema.optional(),
  status: statusSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "至少提供一个需要修改的字段",
});

export const leadFollowupCreateSchema = z.object({
  occurredAt: timezoneAwareDateTimeSchema,
  ownerUserId: z.string().trim().min(1).max(32).optional(),
  type: followupTypeSchema.default("GENERAL"),
  content: z.string().trim().min(1).max(16_000),
  progress: optionalText(16_000),
  nextAction: optionalText(16_000),
  nextFollowupAt: optionalDateTime,
  important: z.boolean().default(false),
  currentTaskId: optionalId,
}).strict();

export const crmLeadOrderBySchema = z.enum([
  "updatedAt_desc",
  "updatedAt_asc",
  "nextFollowupAt_asc",
  "nextFollowupAt_desc",
  "lastFollowupAt_asc",
  "lastFollowupAt_desc",
  "requirementSummary_asc",
  "requirementSummary_desc",
]);

export type CrmLeadCreateInput = z.infer<typeof crmLeadCreateSchema>;
export type CrmLeadImportInput = z.infer<typeof crmLeadImportSchema>;
export type CrmLeadPatchInput = z.infer<typeof crmLeadPatchSchema>;
export type LeadFollowupCreateInput = z.infer<typeof leadFollowupCreateSchema>;
