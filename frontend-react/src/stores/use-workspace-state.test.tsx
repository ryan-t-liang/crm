// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceState } from "./use-workspace-state";
type Data = { version: 1; value: string };
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const config = { version: 1, label: "Sales", initial: (): Data => ({ version: 1, value: "demo" }), empty: (): Data => ({ version: 1, value: "" }), valid: (x: unknown): x is Data => Boolean(x && typeof x === "object" && "value" in x && typeof x.value === "string") };
let current: ReturnType<typeof useWorkspaceState<Data>>;
let root: ReturnType<typeof createRoot> | undefined;
function Probe() { current = useWorkspaceState("test-safe-workspace", config); return <span>{current.issue || current.state.value}</span>; }
async function mount() { root = createRoot(document.createElement("div")); await act(async () => root!.render(<StrictMode><Probe /></StrictMode>)); }
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; vi.restoreAllMocks(); localStorage.clear(); });
describe("workspace React lifecycle", () => {
  it("StrictMode does not overwrite damaged JSON across repeated effects", async () => {
    localStorage.setItem("test-safe-workspace", "{damaged"); await mount();
    expect(current.issue).toContain("原始数据已保留"); expect(localStorage.getItem("test-safe-workspace")).toBe("{damaged");
    await act(async () => expect(current.commit({ version: 1, value: "not-allowed" }).ok).toBe(false));
    expect(localStorage.getItem("test-safe-workspace")).toBe("{damaged");
  });
  it("does not rewrite valid legacy raw contents when mounting", async () => {
    const raw = '{ "version": 1, "value": "user edit" }'; localStorage.setItem("test-safe-workspace", raw); await mount();
    expect(current.state.value).toBe("user edit"); expect(localStorage.getItem("test-safe-workspace")).toBe(raw);
  });
  it("publishes stateRef synchronously so two actions see the first commit", async () => {
    await mount(); const retainedCommit = current.commit;
    await act(async () => { expect(retainedCommit({ version: 1, value: "first" }).ok).toBe(true); expect(current.stateRef.current.value).toBe("first"); expect(retainedCommit({ version: 1, value: "second" }).ok).toBe(true); });
    expect(current.state.value).toBe("second"); expect(JSON.parse(localStorage.getItem("test-safe-workspace")!).value).toBe("second");
  });
  it("a quota failure cannot publish a successful in-memory result", async () => {
    await mount(); const before = localStorage.getItem("test-safe-workspace"); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceeded"); });
    await act(async () => expect(current.commit({ version: 1, value: "rejected" }).ok).toBe(false));
    expect(current.stateRef.current.value).toBe("demo"); expect(current.state.value).toBe("demo"); expect(localStorage.getItem("test-safe-workspace")).toBe(before);
  });
  it("unknown versions recover only on explicit reset", async () => {
    localStorage.setItem("test-safe-workspace", '{"version":999,"value":"future"}'); await mount(); expect(current.issue).toContain("版本不兼容");
    await act(async () => expect(current.commit(config.initial(), true).ok).toBe(true)); expect(current.issue).toBe(""); expect(current.state.value).toBe("demo");
  });
  it("malformed action output is rejected before storage or memory changes", async () => {
    await mount(); const raw = localStorage.getItem("test-safe-workspace");
    await act(async () => expect(current.commit({ version: 1, value: undefined } as unknown as Data).ok).toBe(false));
    expect(current.state.value).toBe("demo"); expect(localStorage.getItem("test-safe-workspace")).toBe(raw);
  });
  it("another tab invalidates a workspace without replacing data", async () => {
    await mount(); localStorage.setItem("test-safe-workspace", "other-tab-edit");
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: "test-safe-workspace", storageArea: localStorage, newValue: "other-tab-edit" })));
    expect(current.issue).toContain("另一个页面"); expect(localStorage.getItem("test-safe-workspace")).toBe("other-tab-edit");
  });
});
