import type { Prisma, PrismaClient } from "@prisma/client";
import type { AppConfig } from "../common/config.js";
import { ApiError } from "../common/errors.js";
import { leadNumber } from "../common/ids.js";
import { normalizeMobile } from "../common/mobile.js";
import { enqueueLeadForSowind } from "../integrations/sowind/sowind.outbox.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type CanonicalLeadInput = {
  brandCode: "GP" | "UN";
  leadType?: string;
  customerId?: string | null;
  formVersion?: string;
  source: string;
  submissionMode: "USER_SUBMITTED" | "ADMIN_MANUAL" | "EXTERNAL_API" | "BATCH_IMPORT";
  sku?: string | null;
  email: string;
  salutation: string;
  firstname: string;
  lastname: string;
  phone?: string | null;
  preferredContact: string;
  country: string;
  city?: string | null;
  ownsBrandWatch?: string | null;
  language?: string;
  birthday?: Date | null;
  purchaseMethod?: string | null;
  retailer?: string | null;
  processingConsent: true;
  marketingOptIn?: boolean;
  policyVersion?: string;
  termsVersion?: string | null;
  originalSnapshot?: Record<string, unknown>;
  idempotencyKey?: string | null;
  createdBy?: string | null;
  createdByService?: string | null;
};

const MINI_PROGRAM_SOURCES = new Set(["MINI_PROGRAM", "WECHAT_MINIPROGRAM"]);

export function shouldAutoDispatchLead(input: Pick<CanonicalLeadInput, "leadType" | "source" | "submissionMode">): boolean {
  const leadType = input.leadType ?? "PURCHASE_INTENT";
  return leadType === "PURCHASE_INTENT"
    && ["USER_SUBMITTED", "EXTERNAL_API"].includes(input.submissionMode)
    && MINI_PROGRAM_SOURCES.has(input.source.toUpperCase());
}

export async function createCanonicalLead(db: DbClient, config: AppConfig, input: CanonicalLeadInput) {
  if (input.idempotencyKey) {
    const existing = await db.lead.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { brand: true } });
    if (existing) return { lead: existing, duplicate: true, outboxCreated: false };
  }
  const brand = await db.brand.findUnique({ where: { code: input.brandCode } });
  if (!brand || !brand.active) throw new ApiError(400, "VALIDATION_ERROR", "品牌不存在或未启用");
  if (input.customerId) {
    const customer = await db.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new ApiError(400, "VALIDATION_ERROR", "关联会员不存在");
  }
  const form = await db.formDefinition.findFirst({ where: { brandId: brand.id, objectType: "LEAD", formKey: "PURCHASE_INTENT", version: input.formVersion ?? "2.0", active: true } });
  if (!form) throw new ApiError(400, "VALIDATION_ERROR", "找不到有效的品牌线索表单配置");
  const normalizedPhone = input.phone?.trim() ? normalizeMobile(input.phone) : null;
  const leadType = input.leadType ?? "PURCHASE_INTENT";
  const autoDispatch = shouldAutoDispatchLead({ ...input, leadType });
  const attributes = {
    birthday: input.birthday?.toISOString().slice(0, 10) ?? null,
    purchaseMethod: input.purchaseMethod ?? null,
    retailer: input.retailer ?? null,
    localOnly: ["birthday", "purchaseMethod", "retailer"],
  };
  const lead = await db.lead.create({
    data: {
      leadNo: leadNumber(brand.code), brandId: brand.id, customerId: input.customerId, formDefinitionId: form.id,
      leadType, source: input.source, submissionMode: input.submissionMode, formVersion: form.version,
      sku: input.sku, email: input.email.trim().toLowerCase(), salutation: input.salutation,
      firstname: input.firstname.trim(), lastname: input.lastname.trim(), phone: normalizedPhone,
      language: input.language ?? "zh", preferredContact: input.preferredContact, country: input.country,
      city: input.city, ownership: input.ownsBrandWatch, birthday: input.birthday, purchaseMethod: input.purchaseMethod,
      retailer: input.retailer, processingConsent: true, marketingOptIn: input.marketingOptIn ?? false,
      attributes: attributes as Prisma.InputJsonValue,
      originalSnapshot: (input.originalSnapshot ?? input) as Prisma.InputJsonValue,
      syncStatus: autoDispatch ? "SYNC_PENDING" : "NOT_SYNCED",
      idempotencyKey: input.idempotencyKey, createdBy: input.createdBy, createdByService: input.createdByService,
    },
    include: { brand: true },
  });
  await db.consentRecord.createMany({ data: [
    { customerId: input.customerId, leadId: lead.id, brandId: brand.id, purpose: "DATA_PROCESSING", channel: "ALL", status: "GRANTED", policyVersion: input.policyVersion ?? form.policyVersion ?? "CURRENT", termsVersion: input.termsVersion ?? form.termsVersion, source: input.source, capturedAt: new Date(), capturedBy: input.createdBy },
    { customerId: input.customerId, leadId: lead.id, brandId: brand.id, purpose: "MARKETING_COMMUNICATION", channel: "EMAIL", status: input.marketingOptIn ? "GRANTED" : "DENIED", policyVersion: input.policyVersion ?? form.policyVersion ?? "CURRENT", termsVersion: input.termsVersion ?? form.termsVersion, source: input.source, capturedAt: new Date(), capturedBy: input.createdBy },
  ] });
  if (input.customerId) await db.customerJourneyEvent.create({ data: { customerId: input.customerId, brandId: brand.id, eventType: "LEAD_SUBMITTED", title: `${brand.name}线索提交`, description: input.sku || "品牌咨询", eventAt: new Date(), source: input.source, metadata: { leadId: lead.id, leadNo: lead.leadNo } } });
  if (autoDispatch) await enqueueLeadForSowind(db, config, {
    id: lead.id, brandId: brand.id, brandCode: brand.code as "GP" | "UN", brand: brand.code as "GP" | "UN",
    sku: lead.sku, email: lead.email, salutation: lead.salutation, firstname: lead.firstname, lastname: lead.lastname,
    phone: lead.phone, preferredContact: lead.preferredContact, country: lead.country, city: lead.city,
    ownsBrandWatch: lead.ownership, processingConsent: lead.processingConsent, marketingOptIn: lead.marketingOptIn,
    birthday: lead.birthday, purchaseMethod: lead.purchaseMethod, retailer: lead.retailer,
  }, "AUTO");
  return { lead, duplicate: false, outboxCreated: autoDispatch };
}

export function dbLeadToSowindInput(lead: {
  id: string; brandId: string; brand: { code: string }; sku: string | null; email: string; salutation: string;
  firstname: string; lastname: string; phone: string | null; preferredContact: string; country: string; city: string | null;
  ownership: string | null; processingConsent: boolean; marketingOptIn: boolean; birthday: Date | null;
  purchaseMethod: string | null; retailer: string | null;
}) {
  return {
    id: lead.id, brandId: lead.brandId, brandCode: lead.brand.code as "GP" | "UN", brand: lead.brand.code as "GP" | "UN",
    sku: lead.sku, email: lead.email, salutation: lead.salutation, firstname: lead.firstname, lastname: lead.lastname,
    phone: lead.phone, preferredContact: lead.preferredContact, country: lead.country, city: lead.city,
    ownsBrandWatch: lead.ownership, processingConsent: lead.processingConsent, marketingOptIn: lead.marketingOptIn,
    birthday: lead.birthday, purchaseMethod: lead.purchaseMethod, retailer: lead.retailer,
  };
}
