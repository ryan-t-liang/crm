export type SowindBrandCode = "gp" | "un";
export type MemberBrandScope = "ALL" | SowindBrandCode;
export type SowindHqSyncStatus = 0 | 1;
export type SowindProfileHasWatch = 0 | 1 | null;
export type SowindProfileAcceptsMarketing = 0 | 1;
export type SowindIntentChoice = 0 | 1 | 2 | null;

/** SQL DATETIME strings have no offset; read-side statistics interpret them in Asia/Shanghai. */
export interface SowindTimestamps {
  created_at?: string;
  updated_at?: string;
}
export type SowindJson = null | string | number | boolean | SowindJson[] | { [key: string]: SowindJson };

/** `customer` has only id and timestamps in the supplied SQL. */
export interface SowindCustomer extends SowindTimestamps {
  id: string;
}

/** `user` is a brand identity, never a CRM login user. */
export interface SowindBrandUser extends SowindTimestamps {
  id: string;
  customer_id: string | null;
  brand: SowindBrandCode;
  openid: string | null;
  unionid: string | null;
  source?: 1 | 2;
  is_deleted?: 0 | 1;
  /** Legacy demo aliases, NOT columns of SQL `user`. Retained for stored-data compatibility. */
  country_code: string | null;
  phone: string | null;
}

/** Brand-scoped `user_profile`; composed with `user` on the member detail page. */
export interface SowindUserProfile extends SowindTimestamps {
  id: string;
  user_id: string;
  tel?: string;
  tel_country_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  has_watch: SowindProfileHasWatch;
  accepts_marketing: SowindProfileAcceptsMarketing;
  region: string | number | null;
  areas_of_interest: string | null;
  favorite_series: number | string | null;
  /** Legacy prototype extension: NOT a column of SQL user_profile. */
  retailer: number | string | null;
}

/** Brand-scoped `user_purchase_intent`; its contact snapshot is independent of profile data. */
export interface SowindPurchaseIntent extends SowindTimestamps {
  id: string;
  user_id: string | null;
  brand: SowindBrandCode;
  first_name?: string | null;
  last_name?: string | null;
  tel?: string | null;
  tel_country_code?: string | null;
  product_sku?: string | null;
  model?: string | null;
  source?: 1 | 2;
  salutation?: number | null;
  language?: string | null;
  preferred_contact?: number | null;
  city?: string | null;
  birthday?: string | null;
  personal_data_consent?: 0 | 1;
  purchase_channel?: 1 | null;
  /** Legacy display aliases below remain untouched when old LocalStorage is loaded. */
  name: string | null;
  country_code: string | null;
  phone: string | null;
  email: string | null;
  has_watch: SowindIntentChoice;
  accepts_marketing: SowindIntentChoice;
  region: string | number | null;
  areas_of_interest: string | null;
  favorite_series: number | string | null;
  retailer: number | string | null;
  hq_ref: SowindJson;
  error: string | null;
  hq_sync_status: SowindHqSyncStatus;
}

/** Admin creation uses SQL fields, not the legacy display aliases. */
export interface SowindPurchaseIntentInput {
  brand: SowindBrandCode;
  first_name: string | null;
  last_name: string | null;
  tel: string | null;
  tel_country_code: string | null;
  email: string | null;
  product_sku: string | null;
  model: string | null;
  has_watch: 0 | 1 | 2;
  accepts_marketing: 0 | 1 | 2;
  personal_data_consent: 0 | 1;
  salutation?: number | null;
  language?: string | null;
  preferred_contact?: number | null;
  region?: string | null;
  city?: string | null;
  birthday?: string | null;
  purchase_channel?: 1 | null;
  retailer?: number | null;
}

export interface MemberOperationsState {
  version: 2;
  brandScope: MemberBrandScope;
  customers: SowindCustomer[];
  brandUsers: SowindBrandUser[];
  userProfiles: SowindUserProfile[];
  purchaseIntents: SowindPurchaseIntent[];
}
