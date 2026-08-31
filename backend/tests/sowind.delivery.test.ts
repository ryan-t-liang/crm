import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/common/config.js";
import { classifyGatewayResponse, redactGatewayResponse } from "../src/integrations/sowind/sowind.errors.js";
import { SowindGatewayClient } from "../src/integrations/sowind/sowind.gateway-client.js";
import { MinuteRateLimiter, retryDecision } from "../src/integrations/sowind/sowind.retry-policy.js";

const config = {
  sowindGatewayAccessKey: "server-secret", sowindGatewayGpUrl: "https://gp.example/gateway", sowindGatewayUnUrl: "https://un.example/gateway", sowindGatewayTimeoutMs: 10000,
} as AppConfig;
const payload = { fields: [], context: { pageUri: "https://example.com", pageName: "WeChat Miniprogram | GENERAL" }, legalConsentOptions: { consent: { consentToProcess: true as const, text: "consent" } } };

describe("Sowind delivery contract", () => {
  it("accepts only HTTP 202 queued with ref", async () => {
    const fetchMock = vi.fn(async (_url, options) => {
      expect(JSON.parse(String(options?.body))).toEqual({ accessKey: "server-secret", ...payload });
      expect((options?.headers as Record<string, string>).Authorization).toBeUndefined();
      return new Response(JSON.stringify({ status: "queued", ref: "218070640267", brand: "gp" }), { status: 202 });
    });
    const result = await new SowindGatewayClient(config, fetchMock as typeof fetch).deliver("GP", payload);
    expect(result.ok).toBe(true); expect(result.body.ref).toBe("218070640267");
    expect(classifyGatewayResponse(200, { status: "queued", ref: "x" }, 1).ok).toBe(false);
  });

  it.each([
    [400, "invalid_payload", false, false], [400, "brand_mismatch", false, false], [400, "consent_missing", false, false],
    [401, "invalid_gateway_key", false, false], [404, "http_404", false, false], [429, "queue_full", true, false],
    [503, "queue_unavailable", true, false], [503, "gateway_paused", true, false], [503, "annual_cap_reached", false, true],
  ] as const)("classifies HTTP %s %s", (status, code, retryable, permanent) => {
    const result = classifyGatewayResponse(status, { error: code, retryAfterSeconds: code === "queue_full" ? 9 : undefined }, 5);
    expect(result.retryable).toBe(retryable); expect(result.permanent).toBe(permanent);
  });

  it("uses 1/2/4/8 second backoff and max five total attempts", () => {
    const result = classifyGatewayResponse(503, { error: "queue_unavailable" }, 1);
    expect([1, 2, 3, 4].map((attempt) => retryDecision(result, attempt, 5).delayMs)).toEqual([1000, 2000, 4000, 8000]);
    expect(retryDecision(result, 5, 5)).toEqual({ retry: false, deadLetter: true, delayMs: null });
    const withHint = classifyGatewayResponse(429, { error: "queue_full", retryAfterSeconds: 13 }, 1);
    expect(retryDecision(withHint, 1, 5).delayMs).toBe(13000);
  });

  it("enforces the sustained ten-per-minute ceiling", () => {
    let now = 0; const limiter = new MinuteRateLimiter(10, () => now);
    for (let i = 0; i < 10; i += 1) expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false); now = 60_001; expect(limiter.tryAcquire()).toBe(true);
  });

  it("redacts secrets before persisting a Gateway response", () => {
    expect(redactGatewayResponse({ accessKey: "secret", nested: { authorization: "Bearer x", detail: "safe" } })).toEqual({ accessKey: "[REDACTED]", nested: { authorization: "[REDACTED]", detail: "safe" } });
  });
});
