import { z } from "zod";

const emptyToNull = (value: unknown) => typeof value === "string" && value.trim() === "" ? null : value;
const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const optionalId = z.preprocess(emptyToNull, z.string().trim().min(1).max(32).nullable().optional());
const optionalEmail = z.preprocess(
  emptyToNull,
  z.string().trim().max(191).email().transform((value) => value.toLowerCase()).nullable().optional(),
);
const optionalUrl = z.preprocess(emptyToNull, z.string().trim().max(500).url().nullable().optional());

export const timezoneAwareDateTimeSchema = z.string()
  .trim()
  .max(40)
  .regex(/(?:Z|[+-]\d{2}:\d{2})$/, "日期时间必须包含时区")
  .refine((value) => !Number.isNaN(Date.parse(value)), "日期时间格式无效")
  .transform((value) => new Date(value));

const optionalDateTime = z.preprocess(emptyToNull, timezoneAwareDateTimeSchema.nullable().optional());
const contactStageSchema = z.enum(["INITIAL", "ONE_TO_ONE", "SOLUTION", "CONVENTION"]);
const followupTypeSchema = z.enum(["GENERAL", "MEETING", "CALL", "EMAIL", "WECHAT", "OTHER"]);

const contactFields = {
  companyShortName: optionalText(120),
  companyName: optionalText(240),
  department: optionalText(160),
  title: optionalText(160),
  email: optionalEmail,
  phone: optionalText(64),
  wechat: optionalText(191),
  linkedin: optionalUrl,
  website: optionalUrl,
  industry: optionalText(160),
  source: optionalText(160),
  country: optionalText(120),
  city: optionalText(120),
  region: optionalText(120),
  ownerUserId: optionalId,
  initialContext: optionalText(16_000),
  followupAttention: optionalText(16_000),
  remark: optionalText(16_000),
} as const;

export const contactCreateSchema = z.object({
  contactName: z.string().trim().min(1).max(160),
  ...contactFields,
  stage: contactStageSchema.default("INITIAL"),
}).strict();

// Import-only compatibility for the historical Contact snapshot column. The
// interactive create/edit API intentionally cannot mutate this value.
export const contactImportSchema = contactCreateSchema.extend({
  nextFollowupAt: optionalDateTime,
}).strict();

export const contactPatchSchema = z.object({
  contactName: z.string().trim().min(1).max(160).optional(),
  ...contactFields,
  stage: contactStageSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "至少提供一个需要修改的字段",
});

export const contactFollowupCreateSchema = z.object({
  occurredAt: timezoneAwareDateTimeSchema,
  ownerUserId: z.string().trim().min(1).max(32).optional(),
  type: followupTypeSchema.default("GENERAL"),
  content: z.string().trim().min(1).max(16_000),
  nextFollowupAt: optionalDateTime,
}).strict();

export const contactOrderBySchema = z.enum([
  "updatedAt_desc",
  "updatedAt_asc",
  "contactName_asc",
  "contactName_desc",
  "nextFollowupAt_asc",
  "nextFollowupAt_desc",
]);

export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactImportInput = z.infer<typeof contactImportSchema>;
export type ContactPatchInput = z.infer<typeof contactPatchSchema>;
export type ContactFollowupCreateInput = z.infer<typeof contactFollowupCreateSchema>;
