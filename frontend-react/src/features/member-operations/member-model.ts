import type { SowindBrandUser, SowindPurchaseIntent } from "@/types/member-operations";

export function findSowindBrandUserCandidates(users: SowindBrandUser[], intent: SowindPurchaseIntent) {
  if (!intent.country_code || !intent.phone) return [];
  return users.filter((user) => user.brand === intent.brand && user.country_code === intent.country_code && user.phone === intent.phone);
}

export function describeSowindPhoneMatch(users: SowindBrandUser[], intent: SowindPurchaseIntent) {
  if (!intent.country_code || !intent.phone) return { code: "INCOMPLETE" as const, label: "号码不完整／管理员可留空", candidates: [] as SowindBrandUser[] };
  const candidates = findSowindBrandUserCandidates(users, intent);
  if (candidates.length === 1) return { code: "UNIQUE" as const, label: `唯一候选 · ${candidates[0].id}`, candidates };
  if (candidates.length === 0) return { code: "NONE" as const, label: "未匹配，允许 user_id 为空", candidates };
  return { code: "AMBIGUOUS" as const, label: `${candidates.length} 个候选 · 待处理`, candidates };
}
