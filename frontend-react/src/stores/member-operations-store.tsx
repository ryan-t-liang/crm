import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import type { MemberBrandScope, MemberOperationsState, SowindIntentChoice, SowindProfileHasWatch } from "@/types/member-operations";

export const MEMBER_OPERATIONS_STORAGE_KEY = "kivisense-member-operations-v1";

interface MemberOperationsStore {
  state: MemberOperationsState;
  setBrandScope: (scope: MemberBrandScope) => void;
  updateUserProfileHasWatch: (profileId: string, value: SowindProfileHasWatch) => void;
  updatePurchaseIntentHasWatch: (intentId: string, value: SowindIntentChoice) => void;
  resetMemberData: () => void;
}

const Context = createContext<MemberOperationsStore | null>(null);

function loadInitial(): MemberOperationsState {
  try {
    const value = localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY);
    if (value) {
      const parsed = JSON.parse(value) as MemberOperationsState;
      if (parsed.version === 2 && Array.isArray(parsed.customers) && Array.isArray(parsed.brandUsers) && Array.isArray(parsed.userProfiles) && Array.isArray(parsed.purchaseIntents)) return parsed;
    }
  } catch {
    localStorage.removeItem(MEMBER_OPERATIONS_STORAGE_KEY);
  }
  return createMemberOperationsDemoState();
}

export function MemberOperationsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MemberOperationsState>(loadInitial);
  useEffect(() => localStorage.setItem(MEMBER_OPERATIONS_STORAGE_KEY, JSON.stringify(state)), [state]);

  const value = useMemo<MemberOperationsStore>(() => ({
    state,
    setBrandScope: (brandScope) => setState((current) => ({ ...current, brandScope })),
    updateUserProfileHasWatch: (profileId, has_watch) => setState((current) => ({ ...current, userProfiles: current.userProfiles.map((profile) => profile.id === profileId ? { ...profile, has_watch } : profile) })),
    updatePurchaseIntentHasWatch: (intentId, has_watch) => setState((current) => ({ ...current, purchaseIntents: current.purchaseIntents.map((intent) => intent.id === intentId ? { ...intent, has_watch } : intent) })),
    resetMemberData: () => {
      localStorage.removeItem(MEMBER_OPERATIONS_STORAGE_KEY);
      setState(createMemberOperationsDemoState());
    },
  }), [state]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useMemberOperations() {
  const value = useContext(Context);
  if (!value) throw new Error("useMemberOperations must be used inside MemberOperationsProvider");
  return value;
}

export const brandLabels = { gp: "Girard-Perregaux", un: "Ulysse Nardin" } as const;
