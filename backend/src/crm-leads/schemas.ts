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

const leadFields = {
  requirementDetail: optionalText(16_000),
  latestProgress: optionalText(16_000),
  estimatedQuote: optionalQuote,
  currency: optionalCurrency,
  projectDomain: optionalText(160),
  projectType: optionalText(160),
  technologyType: optionalText(160),
  productType: optionalText(160),
  productName: optionalText(240),
  resourceRequirement: optionalText(16_000),
  solution: optionalText(16_000),
  remark: optionalText(16_000),
  salesOwnerUserId: optionalId,
  followupOwnerUserId: optionalId,
  nextFollowupAt: optionalDateTime,
} as const;

export const crmLeadCreateSchema = z.object({
  contactId: z.string().trim().min(1).max(32),
  requirementSummary: z.string().trim().min(1).max(200),
  ...leadFields,
  priority: prioritySchema.default("MEDIUM"),
  status: statusSchema.default("NEW"),
}).strict().superRefine((value, context) => {
  if (value.estimatedQuote !== null && value.estimatedQuote !== undefined && !value.currency) {
    context.addIssue({ code: "custom", path: ["currency"], message: "填写预计报价时必须填写币种" });
  }
});

export const crmLeadPatchSchema = z.object({
  requirementSummary: z.string().trim().min(1).max(200).optional(),
  ...leadFields,
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
  important: z.boolean().default(false),
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
export type CrmLeadPatchInput = z.infer<typeof crmLeadPatchSchema>;
export type LeadFollowupCreateInput = z.infer<typeof leadFollowupCreateSchema>;
