import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { ApiError } from "../common/errors.js";

export function normalizeCountryCode(value: string | null | undefined): CountryCode | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized as CountryCode : undefined;
}

export function normalizeInternationalPhone(
  value: string | null | undefined,
  countryCode?: string | null,
): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const phone = parsePhoneNumberFromString(raw, normalizeCountryCode(countryCode));
  return phone?.isValid() ? phone.number : null;
}

export function validatedPhone(
  value: string | null | undefined,
  countryCode: string | null | undefined,
  field: string,
): string | null {
  if (!value?.trim()) return null;
  const normalized = normalizeInternationalPhone(value, countryCode);
  if (!normalized) {
    throw new ApiError(422, "INVALID_INTERNATIONAL_PHONE", "国际电话号码格式无效", {
      field,
      hint: "请使用 +国家代码 的国际号码，或同时提供 ISO 国家代码",
    });
  }
  return normalized;
}
