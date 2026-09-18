import type { DemoUser } from "@/types/crm";
import type { MemberOperationsState, SowindBrandCode, SowindBrandUser, SowindPurchaseIntent, SowindPurchaseIntentInput, SowindUserProfile } from "@/types/member-operations";
import { readBrandPhone, readIntentPhone } from "./sowind-read";

export interface MemberWriteContext { role: string; brands: SowindBrandCode[] }
export function memberWriteContext(actor: DemoUser): MemberWriteContext {
  return { role: actor.role, brands: actor.role === "HQ_ADMIN" ? ["gp", "un"] : [] };
}
export function canWriteMemberBrand(actor: MemberWriteContext, brand: SowindBrandCode) {
  return actor.role === "HQ_ADMIN" && actor.brands.includes(brand) && ["gp", "un"].includes(brand);
}

/** Comparison only. Never rewrite stored phones, snapshots or explicit NULL values. */
export function normalizeSowindPhone(country: string | null | undefined, number: string | null | undefined) {
  if (typeof country !== "string" || typeof number !== "string") return null;
  const code = country.trim().replace(/^\+/, "").replace(/^00/, "").replace(/[\s()-]/g, "");
  const digits = number.trim().replace(/[\s().-]/g, "");
  if (!/^\d{1,6}$/.test(code) || !/^\d{3,30}$/.test(digits)) return null;
  return `${code}:${digits}`;
}

export function matchPurchaseIntentMember(users: SowindBrandUser[], profiles: SowindUserProfile[], input: Pick<SowindPurchaseIntentInput, "brand" | "tel" | "tel_country_code">) {
  const key = normalizeSowindPhone(input.tel_country_code, input.tel);
  const candidates = key ? users.filter((user) => {
    if (user.brand !== input.brand || !["gp", "un"].includes(user.brand) || user.is_deleted !== 0 || !user.id) return false;
    // A malformed duplicate profile cannot be silently resolved by taking its first record.
    if (profiles.filter((profile) => profile.user_id === user.id).length > 1) return false;
    const value = readBrandPhone(user, profiles);
    return normalizeSowindPhone(value.country, value.number) === key;
  }) : [];
  if (!key) return { code: "INCOMPLETE" as const, label: "号码不完整／管理员可留空", candidates, user_id: null };
  if (candidates.length === 1) return { code: "UNIQUE" as const, label: `唯一候选 · ${candidates[0].id}`, candidates, user_id: candidates[0].id };
  if (candidates.length === 0) return { code: "NONE" as const, label: "未匹配，允许 user_id 为空", candidates, user_id: null };
  return { code: "AMBIGUOUS" as const, label: `${candidates.length} 个候选 · 待处理`, candidates, user_id: null };
}

export function findSowindBrandUserCandidates(users: SowindBrandUser[], intent: SowindPurchaseIntent, profiles: SowindUserProfile[] = []) {
  return describeSowindPhoneMatch(users, intent, profiles).candidates;
}

export function describeSowindPhoneMatch(users: SowindBrandUser[], intent: SowindPurchaseIntent, profiles: SowindUserProfile[] = []) {
  const value = readIntentPhone(intent);
  return matchPurchaseIntentMember(users, profiles, { brand: intent.brand, tel: value.number, tel_country_code: value.country });
}

const failure = (code: string, error: string) => ({ ok: false as const, code, error });

export function createSowindPurchaseIntent(state: MemberOperationsState, input: SowindPurchaseIntentInput, actor: MemberWriteContext, id: string, now: string) {
  if (!canWriteMemberBrand(actor, input.brand)) return failure("FORBIDDEN", "当前角色无权创建此品牌购买意向。");
  if (![0, 1, 2].includes(input.has_watch) || ![0, 1, 2].includes(input.accepts_marketing) || ![0, 1].includes(input.personal_data_consent))
    return failure("INVALID_ENUM", "has_watch / accepts_marketing 必须为 0、1、2；数据处理同意必须为 0 或 1。");
  const textLimits = { first_name: 100, last_name: 100, tel: 30, tel_country_code: 10, email: 255, product_sku: 100, model: 100, language: 10, region: 10, city: 100 } as const;
  for (const [field, max] of Object.entries(textLimits)) {
    const value = input[field as keyof typeof textLimits];
    if (value !== null && value !== undefined && (typeof value !== "string" || value.length > max)) return failure("INVALID_FIELD", `${field} 必须为空值或不超过 ${max} 字符的文本。`);
  }
  if (input.salutation !== undefined && input.salutation !== null && ![0, 1, 2, 3, 4].includes(input.salutation)) return failure("INVALID_ENUM", "称谓编码无效。");
  if (input.preferred_contact !== undefined && input.preferred_contact !== null && ![1, 2, 3, 4].includes(input.preferred_contact)) return failure("INVALID_ENUM", "联系方式编码无效。");
  if (input.purchase_channel !== undefined && input.purchase_channel !== null && input.purchase_channel !== 1) return failure("INVALID_ENUM", "购买方式编码无效。");
  if (input.retailer !== undefined && input.retailer !== null && (!Number.isInteger(input.retailer) || input.retailer < 0 || input.retailer > 65535)) return failure("INVALID_FIELD", "retailer 必须为空值或 SMALLINT UNSIGNED 原始编码。");
  if (input.birthday !== undefined && input.birthday !== null && (typeof input.birthday !== "string" || !Number.isFinite(Date.parse(input.birthday)))) return failure("INVALID_FIELD", "birthday 必须为空值或有效日期时间。");
  if (!id || state.purchaseIntents.some((intent) => intent.id === id)) return failure("DUPLICATE_ID", "购买意向 ID 已存在。");
  const match = matchPurchaseIntentMember(state.brandUsers, state.userProfiles, input);
  // Whitelist SQL fields: callers cannot supply a link, HQ status or other internal fields.
  const intent: SowindPurchaseIntent = {
    id, brand: input.brand, user_id: match.user_id,
    first_name: input.first_name, last_name: input.last_name, tel: input.tel, tel_country_code: input.tel_country_code,
    email: input.email, product_sku: input.product_sku, model: input.model,
    has_watch: input.has_watch, accepts_marketing: input.accepts_marketing, personal_data_consent: input.personal_data_consent,
    salutation: input.salutation ?? null, language: input.language ?? null, preferred_contact: input.preferred_contact ?? null,
    region: input.region ?? null, city: input.city ?? null, birthday: input.birthday ?? null,
    purchase_channel: input.purchase_channel ?? null, retailer: input.retailer ?? null,
    source: 2, hq_ref: null, error: null, hq_sync_status: 0, created_at: now, updated_at: now,
    name: [input.last_name, input.first_name].filter((value) => value !== null && value !== "").join(" ") || null,
    country_code: input.tel_country_code, phone: input.tel,
    // Compatibility-only display fields are not added to the SQL contract.
    areas_of_interest: null, favorite_series: null,
  };
  return { ok: true as const, state: { ...state, purchaseIntents: [intent, ...state.purchaseIntents] }, intent, match,
    warning: match.code === "AMBIGUOUS" ? "手机号匹配到多个会员，关联待核验。" : undefined };
}

export function updateSowindProfileHasWatch(state: MemberOperationsState, profileId: string, has_watch: 0 | 1 | null, actor: MemberWriteContext, now: string) {
  if (state.userProfiles.filter((item) => item.id === profileId).length !== 1) return failure("INVALID_TARGET", "会员资料 ID 缺失或冲突，禁止修改。");
  const profile = state.userProfiles.find((item) => item.id === profileId);
  const user = profile && state.brandUsers.find((item) => item.id === profile.user_id);
  if (!profile || !user || user.is_deleted !== 0 || state.userProfiles.filter((item) => item.user_id === user.id).length !== 1) return failure("INVALID_TARGET", "会员资料或有效品牌关联不存在。");
  if (!canWriteMemberBrand(actor, user.brand)) return failure("FORBIDDEN", "当前角色无权修改此品牌会员资料。");
  if (has_watch !== null && ![0, 1].includes(has_watch)) return failure("INVALID_ENUM", "会员 has_watch 必须为 0、1 或 NULL。");
  return { ok: true as const, state: { ...state, userProfiles: state.userProfiles.map((item) => item.id === profileId ? { ...item, has_watch, updated_at: now } : item) } };
}

export function updateSowindIntentHasWatch(state: MemberOperationsState, intentId: string, has_watch: 0 | 1 | 2 | null, actor: MemberWriteContext, now: string) {
  if (state.purchaseIntents.filter((item) => item.id === intentId).length !== 1) return failure("INVALID_TARGET", "购买意向 ID 缺失或冲突，禁止修改。");
  const intent = state.purchaseIntents.find((item) => item.id === intentId);
  if (!intent) return failure("INVALID_TARGET", "购买意向不存在。");
  if (!canWriteMemberBrand(actor, intent.brand)) return failure("FORBIDDEN", "当前角色无权修改此品牌购买意向。");
  if (has_watch === null || ![0, 1, 2].includes(has_watch)) return failure("INVALID_ENUM", "购买意向 has_watch 必须为 0、1 或 2；SQL 不允许新增 NULL 写入。");
  // Loading retains legacy NULL without rewriting it. Explicit edits can only write SQL-valid values.
  return { ok: true as const, state: { ...state, purchaseIntents: state.purchaseIntents.map((item) => item.id === intentId ? { ...item, has_watch, updated_at: now } : item) } };
}
