import { z } from "zod";
import { timezoneAwareDateTimeSchema } from "../contacts/schemas.js";

const emptyToNull = (value: unknown) => typeof value === "string" && value.trim() === "" ? null : value;
const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());
const optionalId = z.preprocess(emptyToNull, z.string().trim().min(1).max(32).nullable().optional());
const optionalUrl = z.preprocess(emptyToNull, z.string().trim().max(500).url().nullable().optional());

export const organizationRoleSchema = z.enum(["PROSPECT", "CUSTOMER", "VENDOR", "PARTNER"]);
export const organizationLifecycleSchema = z.enum(["TARGET", "CONTACTED", "NURTURING", "OPPORTUNITY", "CUSTOMER", "DISQUALIFIED"]);

const organizationFields = {
  shortName: optionalText(120),
  website: optionalUrl,
  industry: optionalText(160),
  industryCode: optionalText(80),
  industryCustom: optionalText(160),
  country: optionalText(120),
  countryCode: z.preprocess(emptyToNull, z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "国家代码必须是 ISO 3166-1 alpha-2").nullable().optional()),
  regionCode: optionalText(80),
  cityCode: optionalText(80),
  cityCustom: optionalText(120),
  companySize: optionalText(80),
  region: optionalText(120),
  city: optionalText(120),
  ownerUserId: optionalId,
  lifecycleStage: organizationLifecycleSchema.optional(),
  fitScore: z.number().int().min(0).max(100).optional(),
  fitReason: optionalText(16_000),
  note: optionalText(16_000),
  roles: z.array(organizationRoleSchema).min(1).max(4).transform((values) => [...new Set(values)]).optional(),
} as const;

export const organizationCreateSchema = z.object({
  name: z.string().trim().min(1).max(240),
  ...organizationFields,
  roles: z.array(organizationRoleSchema).min(1).max(4).transform((values) => [...new Set(values)]).default(["PROSPECT"]),
  confirmDuplicate: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if (value.industryCode === "OTHER" && !value.industryCustom) context.addIssue({ code: "custom", path: ["industryCustom"], message: "选择其他行业时请填写行业" });
  if (value.cityCode === "OTHER" && !value.cityCustom) context.addIssue({ code: "custom", path: ["cityCustom"], message: "选择其他城市时请填写城市" });
});

export const organizationPatchSchema = z.object({
  name: z.string().trim().min(1).max(240).optional(),
  ...organizationFields,
}).strict().superRefine((value, context) => {
  if (value.industryCode === "OTHER" && !value.industryCustom) context.addIssue({ code: "custom", path: ["industryCustom"], message: "选择其他行业时请填写行业" });
  if (value.cityCode === "OTHER" && !value.cityCustom) context.addIssue({ code: "custom", path: ["cityCustom"], message: "选择其他城市时请填写城市" });
}).refine((value) => Object.keys(value).length > 0, { message: "至少提供一个需要修改的字段" });

export const nurtureCreateSchema = z.object({
  ownerUserId: z.string().trim().min(1).max(32),
  reason: z.string().trim().min(1).max(16_000),
  objective: z.string().trim().min(1).max(16_000),
  cadenceDays: z.number().int().min(1).max(365),
  nextTouchAt: timezoneAwareDateTimeSchema,
  touchTopic: z.string().trim().min(1).max(300),
}).strict();

export const nurturePatchSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).optional(),
  ownerUserId: z.string().trim().min(1).max(32).optional(),
  reason: z.string().trim().min(1).max(16_000).optional(),
  objective: z.string().trim().min(1).max(16_000).optional(),
  cadenceDays: z.number().int().min(1).max(365).optional(),
  nextTouchAt: timezoneAwareDateTimeSchema.optional(),
  touchTopic: z.string().trim().min(1).max(300).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: "至少提供一个需要修改的字段" });

export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;
export type OrganizationPatchInput = z.infer<typeof organizationPatchSchema>;
export type NurtureCreateInput = z.infer<typeof nurtureCreateSchema>;
export type NurturePatchInput = z.infer<typeof nurturePatchSchema>;
