import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useCrm } from "./crm-store";
import { useMemberOperations } from "./member-operations-store";
import { createMarketingDemoState } from "@/mock/marketing-demo-data";
import { appendMarketingShowcase } from "@/mock/marketing-showcase-data";
import { executeMarketing, marketingPermissions, type MarketingCommand, type MarketingResult } from "@/features/marketing/marketing-model";
import type { MarketingState } from "@/types/marketing";
import { decodeMarketing, MARKETING_STORAGE_KEY, saveMarketing, type DecodedMarketing } from "@/features/marketing/marketing-storage";

const Context = createContext<{ state: MarketingState; issue: string; act: (command: MarketingCommand) => MarketingResult; reset: () => void } | null>(null);
export function MarketingProvider({ children }: { children: ReactNode }) {
  const { getCurrentActor } = useCrm(), { state: members } = useMemberOperations();
  const [initial] = useState<DecodedMarketing & { showcaseAdded?: boolean; originalText?: string | null }>(() => {
    try {
      const value = localStorage.getItem(MARKETING_STORAGE_KEY);
      const decoded = value !== null ? decodeMarketing(value) : { state: createMarketingDemoState(members, Date.now()) };
      const access = marketingPermissions(getCurrentActor());
      if (!decoded.state || decoded.issue || !access.manage || !access.brands.length) return decoded;
      const next = appendMarketingShowcase(decoded.state, access.brands[0], Date.now());
      if (next === decoded.state) return decoded;
      const verified = decodeMarketing(JSON.stringify(next));
      if (!verified.state) return { ...decoded, issue: "新增演示活动校验失败，原数据未改动。" };
      return { ...decoded, state: next, showcaseAdded: true, originalText: value };
    } catch { return { issue: "营销演示无法读取浏览器存储，未清除任何数据。" }; }
  });
  const empty: MarketingState = { version: 2, revision: 0, seededAt: "", activities: [], participations: [], bookings: [], chances: [], draws: [], awards: [], audits: [], redemptions: [] };
  const [state, setState] = useState(initial.state ?? empty), [issue, setIssue] = useState(initial.issue ?? "");
  const stateRef = useRef(state);
  const migrationRef = useRef(initial.originalV1);
  const showcaseRef = useRef(initial.showcaseAdded);
  const membersRef = useRef(members), issueRef = useRef(issue);
  membersRef.current = members; issueRef.current = issue;
  useEffect(() => { try {
    if (!initial.issue && (localStorage.getItem(MARKETING_STORAGE_KEY) === null || migrationRef.current || showcaseRef.current)) {
      if (showcaseRef.current && localStorage.getItem(MARKETING_STORAGE_KEY) !== initial.originalText) throw new Error("另一页面已更新数据，请刷新后重新加载；未覆盖其修改。");
      saveMarketing(localStorage, stateRef.current, migrationRef.current); migrationRef.current = undefined; showcaseRef.current = false;
    }
  } catch (error) { const message = `营销升级 / 保存失败，原数据保留：${error instanceof Error ? error.message : "请检查浏览器存储空间"}`; issueRef.current = message; setIssue(message); } }, [initial]);
  useEffect(() => { const listener = (event: StorageEvent) => {
    if (event.key !== MARKETING_STORAGE_KEY) return;
    if (event.newValue === null) { issueRef.current = "营销存储在另一页面被移除，请刷新核对；不自动重建或覆盖。"; setIssue(issueRef.current); return; }
    const decoded = decodeMarketing(event.newValue);
    if (decoded.state) { stateRef.current = decoded.state; migrationRef.current = decoded.originalV1; setState(decoded.state); }
    issueRef.current = decoded.issue ?? ""; setIssue(issueRef.current);
  }; window.addEventListener("storage", listener); return () => window.removeEventListener("storage", listener); }, []);
  const act = (command: MarketingCommand): MarketingResult => {
    if (issueRef.current) return { state: stateRef.current, ok: false, error: issueRef.current };
    // Synchronous ref + single synchronous persistence prevent duplicate clicks from using stale state.
    const result = executeMarketing(stateRef.current, command, { actor: getCurrentActor(), members: membersRef.current, now: Date.now() });
    if (result.state !== stateRef.current) {
      try { saveMarketing(localStorage, result.state, migrationRef.current); migrationRef.current = undefined; }
      catch { return { state: stateRef.current, ok: false, error: "本地保存失败，未提交抽奖次数或奖品数量变化；请检查浏览器存储空间。" }; }
      stateRef.current = result.state; setState(result.state);
    }
    return result;
  };
  const reset = () => { const access = marketingPermissions(getCurrentActor()); if (!access.manage) return; const seed = createMarketingDemoState(membersRef.current, Date.now()); const next = access.brands.length ? appendMarketingShowcase(seed, access.brands[0], Date.now()) : seed; try { localStorage.setItem(MARKETING_STORAGE_KEY, JSON.stringify(next)); stateRef.current = next; migrationRef.current = undefined; issueRef.current = ""; setState(next); setIssue(""); } catch { setIssue("重置保存失败，旧数据未被删除。"); } };
  return <Context.Provider value={{ state, issue, act, reset }}>{children}</Context.Provider>;
}
export function useMarketing() { const value = useContext(Context); if (!value) throw new Error("MarketingProvider missing"); return value; }
