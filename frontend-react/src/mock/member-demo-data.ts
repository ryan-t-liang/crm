import type { MemberOperationsState } from "@/types/member-operations";

// Fictional identities. SQL-compatible statistical fields are added ONLY to fresh demo seeds.
// Loading existing LocalStorage never merges these fields or assigns missing dates to today.
const baseState: MemberOperationsState = {
  version: 2,
  brandScope: "ALL",
  customers: [
    { id: "customer-1001" },
    { id: "customer-1002" },
    { id: "customer-1003" },
    { id: "customer-1004" },
  ],
  brandUsers: [
    { id: "user-gp-1001-a", customer_id: "customer-1001", brand: "gp", openid: "openid_gp_1001_a", unionid: "union_shared_1001", country_code: "+86", phone: "13800012011" },
    { id: "user-un-1001-a", customer_id: "customer-1001", brand: "un", openid: "openid_un_1001_a", unionid: "union_shared_1001", country_code: "+86", phone: "13800012011" },
    { id: "user-gp-1002-a", customer_id: "customer-1002", brand: "gp", openid: "openid_gp_1002_a", unionid: "union_gp_1002", country_code: "+86", phone: "13900012022" },
    { id: "user-gp-1002-b", customer_id: "customer-1002", brand: "gp", openid: "openid_gp_1002_b", unionid: null, country_code: "+86", phone: "13900012022" },
    { id: "user-un-1003-a", customer_id: "customer-1003", brand: "un", openid: "openid_un_1003_a", unionid: "union_un_1003", country_code: "+852", phone: "61230077" },
    { id: "user-un-unlinked", customer_id: null, brand: "un", openid: "openid_un_unlinked", unionid: null, country_code: "+86", phone: "18800012088" },
    { id: "user-gp-null-openid-a", customer_id: "customer-1004", brand: "gp", openid: null, unionid: null, country_code: null, phone: null },
    { id: "user-gp-null-openid-b", customer_id: null, brand: "gp", openid: null, unionid: null, country_code: null, phone: null },
  ],
  userProfiles: [
    { id: "profile-gp-1001-a", user_id: "user-gp-1001-a", has_watch: 1, accepts_marketing: 1, region: "GP_CN_EAST", areas_of_interest: "laureato,bridges", favorite_series: "GP_SERIES_LAUREATO", retailer: "GP_RET_SH_01" },
    { id: "profile-un-1001-a", user_id: "user-un-1001-a", has_watch: 0, accepts_marketing: 0, region: "UN_REGION_21", areas_of_interest: "diver,freak", favorite_series: "UN_SERIES_DIVER", retailer: "UN_RET_SH_08" },
    { id: "profile-gp-1002-a", user_id: "user-gp-1002-a", has_watch: null, accepts_marketing: 1, region: null, areas_of_interest: null, favorite_series: "GP_UNKNOWN_77", retailer: null },
    { id: "profile-gp-1002-b", user_id: "user-gp-1002-b", has_watch: 0, accepts_marketing: 0, region: "GP_CN_NORTH", areas_of_interest: "1966", favorite_series: null, retailer: "GP_RET_BJ_02" },
    { id: "profile-un-1003-a", user_id: "user-un-1003-a", has_watch: 1, accepts_marketing: 1, region: "UN_REGION_HK", areas_of_interest: "marine", favorite_series: "UN_UNKNOWN_42", retailer: "UN_RET_HK_03" },
    { id: "profile-un-unlinked", user_id: "user-un-unlinked", has_watch: null, accepts_marketing: 0, region: null, areas_of_interest: "freak", favorite_series: null, retailer: null },
    // The two null-openid users intentionally demonstrate that null is not treated as one globally unique identity.
    { id: "profile-gp-null-openid-a", user_id: "user-gp-null-openid-a", has_watch: null, accepts_marketing: 0, region: null, areas_of_interest: null, favorite_series: null, retailer: null },
  ],
  purchaseIntents: [
    { id: "intent-gp-linked", user_id: "user-gp-1001-a", brand: "gp", name: "王婧怡（Demo）", country_code: "+86", phone: "13800012011", email: "gp.intent@example.test", has_watch: 1, accepts_marketing: 1, region: "GP_INTENT_EAST", areas_of_interest: "laureato", favorite_series: "GP_SERIES_LAUREATO", retailer: "GP_RET_SH_01", hq_ref: "HQ-PI-GP-001", error: null, hq_sync_status: 1 },
    { id: "intent-un-linked", user_id: "user-un-1001-a", brand: "un", name: "王婧怡（Demo）", country_code: "+86", phone: "13800012011", email: "un.intent@example.test", has_watch: 2, accepts_marketing: 2, region: "UN_INTENT_21", areas_of_interest: "diver", favorite_series: "UN_SERIES_DIVER", retailer: "UN_RET_SH_08", hq_ref: null, error: null, hq_sync_status: 0 },
    { id: "intent-gp-no-match", user_id: null, brand: "gp", name: "未关联访客（Demo）", country_code: "+86", phone: "18800012999", email: null, has_watch: 0, accepts_marketing: 0, region: null, areas_of_interest: "bridges", favorite_series: "GP_UNKNOWN_99", retailer: null, hq_ref: null, error: null, hq_sync_status: 0 },
    { id: "intent-un-admin-null", user_id: null, brand: "un", name: "管理员录入（Demo）", country_code: null, phone: null, email: "admin-created@example.test", has_watch: null, accepts_marketing: null, region: null, areas_of_interest: null, favorite_series: null, retailer: null, hq_ref: null, error: null, hq_sync_status: 0 },
    { id: "intent-gp-ambiguous", user_id: null, brand: "gp", name: "同号待处理（Demo）", country_code: "+86", phone: "13900012022", email: "ambiguous@example.test", has_watch: 2, accepts_marketing: 1, region: "GP_INTENT_NORTH", areas_of_interest: "1966", favorite_series: null, retailer: "GP_RET_BJ_02", hq_ref: null, error: "Multiple phone candidates (Demo)", hq_sync_status: 0 },
    { id: "intent-un-unique-unlinked-customer", user_id: "user-un-unlinked", brand: "un", name: "未关联集团客户（Demo）", country_code: "+86", phone: "18800012088", email: "unlinked@example.test", has_watch: 1, accepts_marketing: 2, region: "UN_INTENT_CN", areas_of_interest: "freak", favorite_series: "UN_UNKNOWN_42", retailer: null, hq_ref: null, error: null, hq_sync_status: 0 },
  ],
};

export function createMemberOperationsDemoState(): MemberOperationsState {
  const state = structuredClone(baseState);
  const dayAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  state.customers = state.customers.map((item, index) => ({ ...item, created_at: dayAgo(50 + index), updated_at: dayAgo(2) }));
  state.brandUsers = state.brandUsers.map((item, index) => ({ ...item, created_at: dayAgo(index * 6), updated_at: dayAgo(0), source: 1, is_deleted: 0 }));
  state.userProfiles = state.userProfiles.map((item) => {
    const user = state.brandUsers.find((entry) => entry.id === item.user_id)!;
    return { ...item, tel: user.phone ?? "", tel_country_code: user.country_code, created_at: user.created_at, updated_at: user.updated_at };
  });
  state.purchaseIntents = state.purchaseIntents.map((item, index) => ({ ...item, created_at: dayAgo(index * 9), updated_at: dayAgo(0), tel: item.phone, tel_country_code: item.country_code, product_sku: index < 2 ? `${item.brand.toUpperCase()}-DEMO-01` : null, model: index === 2 ? "GP Demo model" : null, source: item.id.includes("admin") ? 2 : 1, hq_ref: item.hq_ref ? { demo_reference: item.hq_ref } : null }));
  return state;
}
