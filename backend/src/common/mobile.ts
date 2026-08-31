import { ApiError } from "./errors.js";

export function normalizeMobile(input: string): string {
  let value = String(input || "").trim().replace(/[\s\-()]/g, "");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  if (!value.startsWith("+") && /^1\d{10}$/.test(value)) value = `+86${value}`;
  if (!/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new ApiError(400, "INVALID_MOBILE", "手机号必须为有效的国际号码，例如 +8613812345678");
  }
  return value;
}
