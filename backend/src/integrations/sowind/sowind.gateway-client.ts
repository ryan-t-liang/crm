import type { AppConfig } from "../../common/config.js";
import { sowindBrandConfig } from "./sowind.config.js";
import { classifyGatewayResponse, timeoutGatewayResult } from "./sowind.errors.js";
import type { GatewayDeliveryResult, GatewayResponseBody, SowindBrandCode, SowindBusinessPayload, SowindGatewayRequest } from "./sowind.types.js";

type FetchLike = typeof fetch;

export class SowindGatewayClient {
  constructor(private readonly config: AppConfig, private readonly fetchImpl: FetchLike = fetch) {}

  endpointFor(brand: SowindBrandCode): string { return sowindBrandConfig(this.config)[brand].endpoint; }

  async deliver(brand: SowindBrandCode, payload: SowindBusinessPayload): Promise<GatewayDeliveryResult> {
    const startedAt = Date.now();
    if (!this.config.sowindGatewayAccessKey) {
      return { ok: false, httpStatus: null, body: { error: "invalid_gateway_key" }, errorCode: "invalid_gateway_key", errorMessage: "SOWIND_GATEWAY_ACCESS_KEY is not configured", retryable: false, retryAfterSeconds: null, permanent: false, durationMs: 0 };
    }
    const requestPayload: SowindGatewayRequest = { accessKey: this.config.sowindGatewayAccessKey, ...payload };
    try {
      const response = await this.fetchImpl(this.endpointFor(brand), {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(this.config.sowindGatewayTimeoutMs),
      });
      const raw = await response.text();
      let body: GatewayResponseBody;
      try { body = raw ? JSON.parse(raw) as GatewayResponseBody : {}; }
      catch { body = { error: `http_${response.status}`, detail: raw.slice(0, 1000) }; }
      return classifyGatewayResponse(response.status, body, Date.now() - startedAt);
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return timeoutGatewayResult(Date.now() - startedAt);
      return { ok: false, httpStatus: null, body: { error: "network_error" }, errorCode: "network_error", errorMessage: error instanceof Error ? error.message : "Network error", retryable: true, retryAfterSeconds: null, permanent: false, durationMs: Date.now() - startedAt };
    }
  }
}
