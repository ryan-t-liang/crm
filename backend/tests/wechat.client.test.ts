import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/common/config.js";
import { WechatApiClient } from "../src/wechat/wechat.client.js";

const config = {
  wechatGpAppId: "gp-test-app",
  wechatGpAppSecret: "server-only-test-secret",
} as AppConfig;

describe("WechatApiClient", () => {
  it("resolves a phone using server-side credentials without returning credentials", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "provider-access-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errcode: 0, phone_info: { phoneNumber: "+8613812345678" } }), { status: 200 }));
    const result = await new WechatApiClient(config, fetchImpl).resolvePhone({ brandCode: "GP", code: "temporary-code" });
    expect(result).toEqual({ phoneNumber: "+8613812345678", appId: "gp-test-app", appScope: "APP:gp-test-app", unionIdScope: null });
    expect(JSON.stringify(result)).not.toContain("server-only-test-secret");
    expect(JSON.stringify(result)).not.toContain("provider-access-token");
  });

  it("does not include the temporary code or secret in provider errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ errcode: 40013 }), { status: 400 }));
    await expect(new WechatApiClient(config, fetchImpl).resolvePhone({ brandCode: "GP", code: "sensitive-temporary-code" }))
      .rejects.toSatisfy((error: Error) => !error.message.includes("sensitive-temporary-code") && !error.message.includes("server-only-test-secret"));
  });
});
