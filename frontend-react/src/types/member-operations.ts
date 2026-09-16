export type SowindBrandCode = "gp" | "un";
export type MemberBrandScope = "ALL" | SowindBrandCode;
export type SowindHqSyncStatus = 0 | 1;
export type SowindProfileHasWatch = 0 | 1 | null;
export type SowindProfileAcceptsMarketing = 0 | 1;
export type SowindIntentChoice = 0 | 1 | 2 | null;

/** Known `customer` fields. The SQL file is currently unavailable, so no unverified columns are added. */
export interface SowindCustomer {
  id: string;
}

/** `user` is a brand identity, never a CRM login user. */
export interface SowindBrandUser {
  id: string;
  customer_id: string | null;
  brand: SowindBrandCode;
  openid: string | null;
  unionid: string | null;
  country_code: string | null;
  phone: string | null;
}

/** Brand-scoped `user_profile`; composed with `user` on the member detail page. */
export interface SowindUserProfile {
  id: string;
  user_id: string;
  has_watch: SowindProfileHasWatch;
  accepts_marketing: SowindProfileAcceptsMarketing;
  region: string | number | null;
  areas_of_interest: string | null;
  favorite_series: string | null;
  retailer: string | null;
}

/** Brand-scoped `user_purchase_intent`; its contact snapshot is independent of profile data. */
export interface SowindPurchaseIntent {
  id: string;
  user_id: string | null;
  brand: SowindBrandCode;
  name: string | null;
  country_code: string | null;
  phone: string | null;
  email: string | null;
  has_watch: SowindIntentChoice;
  accepts_marketing: SowindIntentChoice;
  region: string | number | null;
  areas_of_interest: string | null;
  favorite_series: string | null;
  retailer: string | null;
  hq_ref: string | null;
  error: string | null;
  hq_sync_status: SowindHqSyncStatus;
}

export interface MemberOperationsState {
  version: 2;
  brandScope: MemberBrandScope;
  customers: SowindCustomer[];
  brandUsers: SowindBrandUser[];
  userProfiles: SowindUserProfile[];
  purchaseIntents: SowindPurchaseIntent[];
}
