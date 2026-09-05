import { z } from "zod";
import { timezoneAwareDateTimeSchema } from "../contacts/schemas.js";

const emptyToNull = (value: unknown) => typeof value === "string" && value.trim() === "" ? null : value;
const optionalId = z.preprocess(emptyToNull, z.string().trim().min(1).max(32).nullable().optional());

export const taskCreateSchema = z.object({
  organizationId: optionalId,
  contactId: optionalId,
  leadId: optionalId,
  title: z.string().trim().min(1).max(300),
  description: z.preprocess(emptyToNull, z.string().trim().max(16_000).nullable().optional()),
  ownerUserId: z.string().trim().min(1).max(32),
  priority: z.enum(["NORMAL", "HIGH"]).default("NORMAL"),
  dueAt: timezoneAwareDateTimeSchema,
  source: z.enum(["MANUAL", "FOLLOWUP", "NURTURE"]).default("MANUAL"),
}).strict().refine((value) => Boolean(value.organizationId || value.contactId || value.leadId), { message: "任务必须关联公司、联系人或线索", path: ["organizationId"] });

export const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.preprocess(emptyToNull, z.string().trim().max(16_000).nullable().optional()),
  ownerUserId: z.string().trim().min(1).max(32).optional(),
  priority: z.enum(["NORMAL", "HIGH"]).optional(),
  dueAt: timezoneAwareDateTimeSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: "至少提供一个需要修改的字段" });

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskPatchInput = z.infer<typeof taskPatchSchema>;
