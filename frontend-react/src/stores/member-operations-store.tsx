import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Toast } from "@douyinfe/semi-ui";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import { createSowindPurchaseIntent, memberWriteContext, updateSowindIntentHasWatch, updateSowindProfileHasWatch } from "@/features/member-operations/member-model";
import { useCrm } from "./crm-store";
import { useWorkspaceState } from "./use-workspace-state";
import type { MemberBrandScope, MemberOperationsState, SowindIntentChoice, SowindProfileHasWatch, SowindPurchaseIntentInput } from "@/types/member-operations";

export const MEMBER_OPERATIONS_STORAGE_KEY = "kivisense-member-operations-v1";

interface MemberOperationsStore {
  state: MemberOperationsState;
  recoveryIssue: string;
  setBrandScope: (scope: MemberBrandScope) => void;
  updateUserProfileHasWatch: (profileId: string, value: SowindProfileHasWatch) => void;
  updatePurchaseIntentHasWatch: (intentId: string, value: SowindIntentChoice) => void;
  createPurchaseIntent: (input: SowindPurchaseIntentInput) => ReturnType<typeof createSowindPurchaseIntent>;
  resetMemberData: () => boolean;
}

const Context = createContext<MemberOperationsStore | null>(null);

function row(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function textOrNull(value: unknown) { return typeof value === "string" || value === null; }
function optionalText(value: unknown) { return value === undefined || textOrNull(value); }
function codeOrNull(value: unknown) { return value === undefined || textOrNull(value) || (typeof value === "number" && Number.isFinite(value)); }
function brand(value: unknown) { return value === "gp" || value === "un"; }
export function validMemberOperationsState(value: unknown): value is MemberOperationsState {
  if (!row(value) || value.version !== 2 || !(value.brandScope === "ALL" || brand(value.brandScope))) return false;
  const rows = (key: string, check: (entry: Record<string, unknown>) => boolean) => {
    const collection = value[key];
    if (!Array.isArray(collection)) return false;
    const ids = new Set<string>();
    return collection.every((entry) => {
      if (!row(entry) || typeof entry.id !== "string" || !entry.id || ids.has(entry.id) || !check(entry)) return false;
      ids.add(entry.id); return true;
    });
  };
  return rows("customers", () => true)
    && rows("brandUsers", (entry) => brand(entry.brand) && textOrNull(entry.customer_id) && textOrNull(entry.openid) && textOrNull(entry.unionid)
      && (entry.is_deleted === undefined || entry.is_deleted === 0 || entry.is_deleted === 1)
      && (entry.phone === undefined || textOrNull(entry.phone)) && (entry.country_code === undefined || textOrNull(entry.country_code)))
    && rows("userProfiles", (entry) => typeof entry.user_id === "string" && [0, 1, null].includes(entry.has_watch as 0 | 1 | null) && [0, 1].includes(entry.accepts_marketing as number)
      && (entry.tel === undefined || typeof entry.tel === "string") && optionalText(entry.tel_country_code) && optionalText(entry.areas_of_interest)
      && codeOrNull(entry.region) && codeOrNull(entry.favorite_series) && codeOrNull(entry.retailer))
    && rows("purchaseIntents", (entry) => brand(entry.brand) && textOrNull(entry.user_id) && [0, 1, 2, null].includes(entry.has_watch as number | null)
      && [0, 1, 2, null].includes(entry.accepts_marketing as number | null) && [0, 1].includes(entry.hq_sync_status as number) && textOrNull(entry.error)
      && optionalText(entry.tel) && optionalText(entry.tel_country_code) && optionalText(entry.name) && optionalText(entry.email)
      && optionalText(entry.areas_of_interest) && codeOrNull(entry.region) && codeOrNull(entry.favorite_series) && codeOrNull(entry.retailer));
}

export function MemberOperationsProvider({ children }: { children: ReactNode }) {
  const { getCurrentActor } = useCrm();
  const { state, stateRef, issue, commit } = useWorkspaceState(MEMBER_OPERATIONS_STORAGE_KEY, {
    version: 2, label: "Member", initial: createMemberOperationsDemoState,
    empty: (): MemberOperationsState => ({ version: 2, brandScope: "ALL", customers: [], brandUsers: [], userProfiles: [], purchaseIntents: [] }),
    valid: validMemberOperationsState,
  });
  const apply = (result: { ok: true; state: MemberOperationsState } | { ok: false; error: string }) => {
    if (!result.ok) { Toast.error(result.error); return false; }
    const stored = commit(result.state);
    if (!stored.ok) { Toast.error(stored.error); return false; }
    return true;
  };

  const value = useMemo<MemberOperationsStore>(() => ({
    state,
    recoveryIssue: issue,
    setBrandScope: (brandScope) => {
      if (getCurrentActor().role !== "HQ_ADMIN" || !["ALL", "gp", "un"].includes(brandScope)) { Toast.error("当前角色无权设置会员品牌范围。"); return; }
      apply({ ok: true, state: { ...stateRef.current, brandScope } });
    },
    updateUserProfileHasWatch: (profileId, has_watch) => { apply(updateSowindProfileHasWatch(stateRef.current, profileId, has_watch, memberWriteContext(getCurrentActor()), new Date().toISOString())); },
    updatePurchaseIntentHasWatch: (intentId, has_watch) => { apply(updateSowindIntentHasWatch(stateRef.current, intentId, has_watch, memberWriteContext(getCurrentActor()), new Date().toISOString())); },
    createPurchaseIntent: (input) => {
      const result = createSowindPurchaseIntent(stateRef.current, input, memberWriteContext(getCurrentActor()), `intent-${crypto.randomUUID()}`, new Date().toISOString());
      if (!result.ok) return result;
      const stored = commit(result.state);
      return stored.ok ? result : { ok: false as const, code: "STORAGE", error: stored.error };
    },
    resetMemberData: () => {
      if (getCurrentActor().role !== "HQ_ADMIN") { Toast.error("仅 HQ 管理员可以重置会员数据。"); return false; }
      const result = commit(createMemberOperationsDemoState(), true);
      if (!result.ok) { Toast.error(result.error); return false; }
      Toast.success("Member Demo 数据已重置");
      return true;
    },
  }), [state, issue, commit, getCurrentActor]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useMemberOperations() {
  const value = useContext(Context);
  if (!value) throw new Error("useMemberOperations must be used inside MemberOperationsProvider");
  return value;
}

export { brandLabels } from "@/utils/brand-display";
