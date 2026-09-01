import { z } from "zod";
import type { AppConfig } from "../../common/config.js";
import { ApiError } from "../../common/errors.js";
import { normalizeMobile } from "../../common/mobile.js";
import { COUNTRY_ALIASES, SOWIND_COUNTRY_VALUES } from "./country-values.js";
import { sowindBrandConfig } from "./sowind.config.js";
import type { SowindBusinessPayload, SowindField, SowindLeadInput } from "./sowind.types.js";

const allowedSalutations = new Set(["Dr", "Mr", "Mrs", "Ms", "Prefer not to say"]);
const salutationAliases: Record<string, string> = { "博士": "Dr", "先生": "Mr", "太太": "Mrs", "女士": "Ms", "不愿透露": "Prefer not to say" };
const allowedContacts = new Set(["WhatsApp", "WeChat", "Phone", "Email", "Signal", "Telegram", "SMS", "All of the above"]);
const contactAliases: Record<string, string> = { "微信": "WeChat", "电话": "Phone", "电子邮件": "Email", "邮箱": "Email", "短信": "SMS", "以上皆可": "All of the above" };
const emailSchema = z.string().trim().email();

function requiredText(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new ApiError(400, "GATEWAY_VALIDATION_FAILED", `${label}为必填项`);
  return normalized;
}

function field(name: string, value: string): SowindField {
  return { objectTypeId: "0-1", name, value };
}

export class SowindPayloadBuilder {
  constructor(private readonly config: AppConfig) {}

  build(input: SowindLeadInput): SowindBusinessPayload {
    const brand = sowindBrandConfig(this.config)[input.brand];
    if (!brand) throw new ApiError(400, "GATEWAY_VALIDATION_FAILED", "不支持的品牌");
    if (!input.processingConsent) throw new ApiError(400, "GATEWAY_VALIDATION_FAILED", "必须同意个人数据处理后才能提交");

    const email = emailSchema.parse(input.email).toLowerCase();
    const salutation = salutationAliases[input.salutation] ?? input.salutation;
    if (!allowedSalutations.has(salutation)) throw new ApiError(400, "GATEWAY_VALIDATION_FAILED", "称谓值不符合 Gateway Internal Value");
    const preferredContact = contactAliases[input.preferredContact] ?? input.preferredContact;
    if (!allowedContacts.has(preferredContact)) throw new ApiError(400, "GATEWAY_VALIDATION_FAILED", "首选联系方式不符合 Gateway Internal Value");
    const country = COUNTRY_ALIASES[input.country] ?? input.country;
    if (!SOWIND_COUNTRY_VALUES.has(country)) throw new ApiError(400, "GATEWAY_VALIDATION_FAILED", "国家 / 地区不在 Sowind 允许值中");
    const ownership = input.ownsBrandWatch ? ({ "是": "Yes", "否": "No" }[input.ownsBrandWatch] ?? input.ownsBrandWatch) : "";
    if (ownership && !["Yes", "No"].includes(ownership)) throw new ApiError(400, "GATEWAY_VALIDATION_FAILED", "腕表持有值必须为 Yes 或 No");
    if (brand.ownershipRequired && !ownership) throw new ApiError(400, "GATEWAY_VALIDATION_FAILED", "UN 雅典表的腕表持有字段为必填项");

    const fields: SowindField[] = [
      field("email", email),
      field("salutation", salutation),
      field("firstname", requiredText(input.firstname, "名字")),
      field("lastname", requiredText(input.lastname, "姓氏")),
    ];
    if (input.phone?.trim()) fields.push(field("phone", normalizeMobile(input.phone)));
    fields.push(
      field("hs_language", "zh"),
      field("preferred_method_of_communication", preferredContact),
      field("country_list_", country),
    );
    const city = String(input.city ?? "").trim();
    if (city) fields.push(field("city", city));
    if (ownership) fields.push(field(brand.ownershipField, ownership));
    fields.push(field("business_unit_forms", brand.businessUnitForms));

    const sku = String(input.sku ?? "").trim() || "GENERAL";
    const pageUri = sku === "GENERAL"
      ? brand.websiteBase
      : `${brand.websiteBase}/wechat-miniprogram?sku=${encodeURIComponent(sku)}`;
    const consent: SowindBusinessPayload["legalConsentOptions"]["consent"] = {
      consentToProcess: true,
      text: brand.processingConsentText,
    };
    if (input.marketingOptIn) {
      consent.communications = [{ value: true, subscriptionTypeId: brand.subscriptionTypeId, text: brand.marketingConsentText }];
    }
    const payload: SowindBusinessPayload = {
      fields,
      context: { pageUri, pageName: `WeChat Miniprogram | ${sku}` },
      legalConsentOptions: { consent },
    };
    this.assertBrandConsistency(input.brand, payload);
    return payload;
  }

  assertBrandConsistency(brandCode: SowindLeadInput["brand"], payload: SowindBusinessPayload): void {
    const brand = sowindBrandConfig(this.config)[brandCode];
    const values = new Map(payload.fields.map((item) => [item.name, item.value]));
    if (values.get("business_unit_forms") !== brand.businessUnitForms || !values.has(brand.ownershipField) && brand.ownershipRequired) {
      throw new ApiError(400, "GATEWAY_VALIDATION_FAILED", "品牌、Endpoint 与 Gateway 字段映射不一致");
    }
    const otherOwnership = brandCode === "GP" ? "do_you_own_an_ulysse_nardin_" : "do_you_own_a_girard_perregaux_";
    if (values.has(otherOwnership)) throw new ApiError(400, "GATEWAY_VALIDATION_FAILED", "检测到跨品牌 Ownership 字段");
  }
}
