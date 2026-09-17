import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useCrm } from "./crm-store";
import { useMemberOperations } from "./member-operations-store";
import { createMarketingDemoState } from "@/mock/marketing-demo-data";
import { executeMarketing, marketingPermissions, type MarketingCommand, type MarketingResult } from "@/features/marketing/marketing-model";
import type { MarketingState } from "@/types/marketing";
import { decodeMarketing, MARKETING_STORAGE_KEY } from "@/features/marketing/marketing-storage";

const Context = createContext<{ state: MarketingState; issue: string; act: (command: MarketingCommand) => MarketingResult; reset: () => void } | null>(null);
export function MarketingProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useCrm(), { state: members } = useMemberOperations();
  const [initial] = useState(() => {
    const value = localStorage.getItem(MARKETING_STORAGE_KEY);
    if (value !== null) return decodeMarketing(value);
    return { state: createMarketingDemoState(members, Date.now()) };
  });
  const empty: MarketingState = { version: 1, revision: 0, seededAt: "", activities: [], prizes: [], participations: [], bookings: [], chances: [], draws: [], awards: [], audits: [] };
  const [state, setState] = useState(initial.state ?? empty), [issue, setIssue] = useState(initial.issue ?? "");
  const stateRef = useRef(state);
  const actorRef = useRef(currentUser), membersRef = useRef(members), issueRef = useRef(issue);
  actorRef.current = currentUser; membersRef.current = members; issueRef.current = issue;
  useEffect(() => { try { if (localStorage.getItem(MARKETING_STORAGE_KEY) === null && !initial.issue) localStorage.setItem(MARKETING_STORAGE_KEY, JSON.stringify(stateRef.current)); } catch { setIssue("营销演示无法保存，请检查浏览器存储权限或空间；不提交业务操作。"); } }, [initial]);
  useEffect(() => { const listener = (event: StorageEvent) => { if (event.key === MARKETING_STORAGE_KEY && event.newValue !== null) { const decoded = decodeMarketing(event.newValue); if (decoded.state) { stateRef.current = decoded.state; setState(decoded.state); } setIssue(decoded.issue ?? ""); } }; window.addEventListener("storage", listener); return () => window.removeEventListener("storage", listener); }, []);
  const act = (command: MarketingCommand): MarketingResult => {
    if (issueRef.current) return { state: stateRef.current, ok: false, error: issueRef.current };
    // Synchronous ref + single synchronous persistence prevent duplicate clicks from using stale state.
    const result = executeMarketing(stateRef.current, command, { actor: actorRef.current, members: membersRef.current, now: Date.now() });
    if (result.state !== stateRef.current) {
      try { localStorage.setItem(MARKETING_STORAGE_KEY, JSON.stringify(result.state)); }
      catch { return { state: stateRef.current, ok: false, error: "本地保存失败，未提交扣次或库存变化；请检查浏览器存储空间。" }; }
      stateRef.current = result.state; setState(result.state);
    }
    return result;
  };
  const reset = () => { if (!marketingPermissions(actorRef.current).manage) return; const next = createMarketingDemoState(membersRef.current, Date.now()); try { localStorage.setItem(MARKETING_STORAGE_KEY, JSON.stringify(next)); stateRef.current = next; setState(next); setIssue(""); } catch { setIssue("重置保存失败，旧数据未被删除。"); } };
  return <Context.Provider value={{ state, issue, act, reset }}>{children}</Context.Provider>;
}
export function useMarketing() { const value = useContext(Context); if (!value) throw new Error("MarketingProvider missing"); return value; }
