import { describe, expect, it } from "vitest";
import type { AppConfig } from "../src/common/config.js";
import { SOWIND_COUNTRY_VALUES } from "../src/integrations/sowind/country-values.js";
import { SowindPayloadBuilder } from "../src/integrations/sowind/sowind.payload-builder.js";

const config = {
  sowindGatewayGpUrl: "https://b2b.girard-perregaux.com/n8n-webhook/wechat-leads/gp",
  sowindGatewayUnUrl: "https://b2b.ulysse-nardin.com/n8n-webhook/wechat-leads/un",
} as AppConfig;

const common = {
  sku: "81010-11-3475-1CM", email: "TEST@EXAMPLE.CN", salutation: "Mr", firstname: "Yi", lastname: "Zhang",
  phone: "+86 138 1234 5678", preferredContact: "WeChat", country: "China", city: "Shanghai",
  processingConsent: true, birthday: new Date("1990-08-18"), purchaseMethod: "Boutique", retailer: "Local-only retailer",
} as const;

describe("Sowind Gateway v2.0 payload", () => {
  it.each([
    ["GP", false, "girard_perregaux", "do_you_own_a_girard_perregaux_", 370626181],
    ["GP", true, "girard_perregaux", "do_you_own_a_girard_perregaux_", 370626181],
    ["UN", false, "ulysse_nardin", "do_you_own_an_ulysse_nardin_", 5186585],
    ["UN", true, "ulysse_nardin", "do_you_own_an_ulysse_nardin_", 5186585],
  ] as const)("builds %s marketing=%s exactly", (brand, marketingOptIn, businessUnit, ownershipField, subscriptionTypeId) => {
    const payload = new SowindPayloadBuilder(config).build({ ...common, brand, marketingOptIn, ownsBrandWatch: "Yes" });
    const values = Object.fromEntries(payload.fields.map((field) => [field.name, field.value]));
    expect(values.business_unit_forms).toBe(businessUnit);
    expect(values[ownershipField]).toBe("Yes");
    expect(values.email).toBe("test@example.cn");
    expect(values.phone).toBe("+8613812345678");
    expect(payload.context).toEqual({ pageUri: expect.stringContaining("sku=81010-11-3475-1CM"), pageName: "WeChat Miniprogram | 81010-11-3475-1CM" });
    expect(payload.legalConsentOptions.consent.consentToProcess).toBe(true);
    if (marketingOptIn) expect(payload.legalConsentOptions.consent.communications).toEqual([{ value: true, subscriptionTypeId, text: expect.any(String) }]);
    else expect(payload.legalConsentOptions.consent).not.toHaveProperty("communications");
    expect(values).not.toHaveProperty("birthday");
    expect(values).not.toHaveProperty("purchaseMethod");
    expect(values).not.toHaveProperty("retailer");
  });

  it("allows optional GP ownership but requires UN ownership", () => {
    const gp = new SowindPayloadBuilder(config).build({ ...common, brand: "GP", marketingOptIn: false });
    expect(gp.fields.some((field) => field.name.includes("do_you_own"))).toBe(false);
    expect(() => new SowindPayloadBuilder(config).build({ ...common, brand: "UN", marketingOptIn: false })).toThrow(/UN 雅典表/);
  });

  it("uses GENERAL fallback and the complete Appendix A country set", () => {
    const payload = new SowindPayloadBuilder(config).build({ ...common, brand: "UN", sku: "", ownsBrandWatch: "No", marketingOptIn: false });
    expect(payload.context.pageName).toBe("WeChat Miniprogram | GENERAL");
    expect(SOWIND_COUNTRY_VALUES.size).toBe(219);
  });
});
