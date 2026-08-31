import type { GatewayDeliveryResult, GatewayResponseBody } from "./sowind.types.js";

const secretKeyPattern = /(?:access[_-]?key|authorization|password|secret|token|cookie)/i;

export function redactGatewayResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactGatewayResponse);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, secretKeyPattern.test(key) ? "[REDACTED]" : redactGatewayResponse(item)]));
  }
  return value;
}

export function classifyGatewayResponse(httpStatus: number, body: GatewayResponseBody, durationMs: number): GatewayDeliveryResult {
  if (httpStatus === 202 && body.status === "queued" && typeof body.ref === "string") {
    return { ok: true, httpStatus, body, errorCode: null, errorMessage: null, retryable: false, retryAfterSeconds: null, permanent: false, durationMs };
  }
  const code = typeof body.error === "string" ? body.error : `http_${httpStatus}`;
  const message = typeof body.detail === "string" ? body.detail : code;
  const retryAfterSeconds = typeof body.retryAfterSeconds === "number" && body.retryAfterSeconds > 0 ? body.retryAfterSeconds : null;
  const retryable = (httpStatus === 429 && code === "queue_full") || (httpStatus === 503 && ["queue_unavailable", "gateway_paused"].includes(code));
  const permanent = code === "annual_cap_reached";
  return { ok: false, httpStatus, body, errorCode: code, errorMessage: message, retryable, retryAfterSeconds, permanent, durationMs };
}

export function timeoutGatewayResult(durationMs: number): GatewayDeliveryResult {
  return { ok: false, httpStatus: null, body: { error: "network_timeout" }, errorCode: "network_timeout", errorMessage: "Gateway request timed out", retryable: true, retryAfterSeconds: null, permanent: false, durationMs };
}
