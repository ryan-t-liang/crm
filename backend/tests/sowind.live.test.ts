import { describe, expect, it } from "vitest";
import type { AppConfig } from "../src/common/config.js";
import { SowindGatewayClient } from "../src/integrations/sowind/sowind.gateway-client.js";
import { SowindPayloadBuilder } from "../src/integrations/sowind/sowind.payload-builder.js";

const liveEnabled = process.env.RUN_SOWIND_LIVE_TESTS === "true";

describe.skipIf(!liveEnabled)("Sowind Gateway live contract", () => {
  const config = {
    sowindGatewayAccessKey: process.env.SOWIND_GATEWAY_ACCESS_KEY || "",
    sowindGatewayGpUrl: process.env.SOWIND_GATEWAY_GP_URL || "https://b2b.girard-perregaux.com/n8n-webhook/wechat-leads/gp",
    sowindGatewayUnUrl: process.env.SOWIND_GATEWAY_UN_URL || "https://b2b.ulysse-nardin.com/n8n-webhook/wechat-leads/un",
    sowindGatewayTimeoutMs: 10_000,
  } as AppConfig;
  const builder = new SowindPayloadBuilder(config);
  const client = new SowindGatewayClient(config);

  it.each(["GP", "UN"] as const)("submits a consented %s test lead and receives HTTP 202", async (brand) => {
    expect(config.sowindGatewayAccessKey, "SOWIND_GATEWAY_ACCESS_KEY is required when live tests are enabled").not.toBe("");
    const payload = builder.build({
      brand,
      sku: brand === "GP" ? "81010-11-3475-1CM" : "2405-500-2A/3C",
      email: "sowind.crm.gateway.test@example.com",
      salutation: "Mr",
      firstname: "Gateway",
      lastname: "Test",
      phone: "+8613800138000",
      preferredContact: "Email",
      country: "China",
      city: "Shanghai",
      ownsBrandWatch: "No",
      processingConsent: true,
      marketingOptIn: false,
    });
    const result = await client.deliver(brand, payload);
    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(202);
    expect(result.body.ref).toEqual(expect.any(String));
  });
});
