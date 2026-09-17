import type { SowindBrandUser, SowindPurchaseIntent, SowindUserProfile } from "@/types/member-operations";

/** Read only: SQL fields win when supplied, including explicit null. No store backfill. */
export function readBrandPhone(user: SowindBrandUser, profiles: SowindUserProfile[]) {
  const profile = profiles.find((row) => row.user_id === user.id);
  return {
    number: profile?.tel !== undefined ? profile.tel : user.phone,
    country: profile?.tel_country_code !== undefined ? profile.tel_country_code : user.country_code,
    source: profile?.tel !== undefined ? "user_profile.tel / tel_country_code" : "旧演示别名（非 SQL user 字段）",
  };
}
export function readIntentPhone(intent: SowindPurchaseIntent) {
  return {
    number: intent.tel !== undefined ? intent.tel : intent.phone,
    country: intent.tel_country_code !== undefined ? intent.tel_country_code : intent.country_code,
  };
}
