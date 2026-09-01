import { z } from "zod";

const nullableText = z.string().trim().max(500).nullable().optional();

export const memberProfileSchema = z.object({
  brandCode: z.enum(["GP", "UN"]),
  salutation: z.string().trim().max(40).optional(),
  lastName: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(100),
  birthday: z.coerce.date().nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  mobile: z.string().trim().optional(),
  country: nullableText,
  region: nullableText,
  city: nullableText,
  postalCode: nullableText,
  addressLine: nullableText,
  language: nullableText,
  preferredContact: nullableText,
  ownsBrandWatch: z.boolean().nullable().optional(),
  purchaseChannel: nullableText,
  interestCenter: nullableText,
  favoriteCollection: nullableText,
  registrationSource: z.string().trim().max(120).default("ADMIN_MANUAL"),
  openId: nullableText,
  unionId: nullableText,
  marketingOptIn: z.boolean().default(false),
  processingConsent: z.literal(true),
  policyVersion: z.string().trim().max(120).default("CURRENT"),
  registrationData: z.record(z.string(), z.unknown()).optional(),
});

export const createMemberSchema = z.object({ mobile: z.string().trim(), profile: memberProfileSchema });
export const patchCustomerSchema = z.object({ displayName: z.string().trim().min(1).max(160).optional(), mobile: z.string().trim().optional() });
export const patchMemberProfileSchema = memberProfileSchema.omit({ brandCode: true, processingConsent: true }).partial();

export const wechatMemberProfileSchema = memberProfileSchema.omit({
  brandCode: true,
  mobile: true,
  registrationSource: true,
  openId: true,
  unionId: true,
});

export const patchWechatMemberProfileSchema = wechatMemberProfileSchema.omit({ processingConsent: true }).partial();

export type MemberProfileInput = z.infer<typeof memberProfileSchema>;
export type MemberProfilePatch = z.infer<typeof patchMemberProfileSchema>;
