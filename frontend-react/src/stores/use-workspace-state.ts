import { useCallback, useEffect, useRef, useState } from "react";
import { readWorkspace, saveWorkspace, type WorkspaceConfig, type WorkspaceResult } from "./workspace-storage";

// Accessing window.localStorage itself can throw when browser policy disables it.
const browserStorage = { getItem: (key: string) => window.localStorage.getItem(key), setItem: (key: string, value: string) => window.localStorage.setItem(key, value) };

// Persist first, then publish: rejected actions cannot alter the in-memory workspace.
export function useWorkspaceState<T>(key: string, config: WorkspaceConfig<T>) {
  const [loaded] = useState(() => readWorkspace(browserStorage, key, config));
  const [state, setState] = useState(loaded.state);
  const [issue, setIssue] = useState(loaded.issue);
  const stateRef = useRef(state);
  const rawRef = useRef(loaded.raw);
  const issueRef = useRef(issue);
  const configRef = useRef(config);
  configRef.current = config;
  const markIssue = useCallback((message: string) => { issueRef.current = message; setIssue(message); }, []);
  const commit = useCallback((next: T, reset = false): WorkspaceResult => {
    if (issueRef.current && !reset) return { ok: false, error: issueRef.current };
    if (!configRef.current.valid(next)) return { ok: false, error: "待保存的数据结构无效，原有数据未被修改。" };
    const result = saveWorkspace(browserStorage, key, next, rawRef.current, reset);
    if (!result.ok) { markIssue(result.error); return result; }
    rawRef.current = result.raw!;
    stateRef.current = next;
    setState(next);
    markIssue("");
    return { ok: true };
  }, [key, markIssue]);
  useEffect(() => {
    // Only a genuinely absent namespace is initialized. Valid older data is not reserialized.
    if (rawRef.current === null && !issueRef.current) commit(stateRef.current);
    const changed = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      try { if (event.storageArea === window.localStorage) markIssue("本地数据已被另一个页面修改；未覆盖，请刷新后重试。"); }
      catch { markIssue("本地存储无法访问，未写入或删除数据。"); }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [key, commit, markIssue]);
  return { state, stateRef, issue, commit };
}
