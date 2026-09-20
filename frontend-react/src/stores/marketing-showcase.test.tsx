// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import { createMarketingDemoState } from "@/mock/marketing-demo-data";
import { MARKETING_SHOWCASE_ID } from "@/mock/marketing-showcase-data";
import { MARKETING_STORAGE_KEY } from "@/features/marketing/marketing-storage";
import { MarketingProvider, useMarketing } from "./marketing-store";

const members = createMemberOperationsDemoState(), actor = createDemoState().users[0];
vi.mock("./crm-store", () => ({ useCrm: () => ({ getCurrentActor: () => actor }) }));
vi.mock("./member-operations-store", () => ({ useMemberOperations: () => ({ state: members }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
function Probe() { const { state, issue } = useMarketing(); return <div>{issue || state.bookings.filter(row => row.activityId === MARKETING_SHOWCASE_ID && row.kind === "ACTIVITY").length}</div>; }
beforeEach(() => { localStorage.clear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
it("persists the separate 200-row activity once in StrictMode and preserves old changes and other namespaces", async () => {
  const old = createMarketingDemoState(members, Date.now()); old.activities[0].name = "原活动用户修改";
  localStorage.setItem(MARKETING_STORAGE_KEY, JSON.stringify(old));
  localStorage.setItem("kivisense-crm-prototype-v1", "sales unchanged"); localStorage.setItem("kivisense-member-operations-v1", "members unchanged");
  await act(async () => root.render(<StrictMode><MarketingProvider><Probe /></MarketingProvider></StrictMode>));
  expect(container.textContent).toBe("200");
  const first = localStorage.getItem(MARKETING_STORAGE_KEY)!;
  const persisted = JSON.parse(first);
  expect(persisted.activities.filter((row: { id: string }) => row.id !== MARKETING_SHOWCASE_ID)).toEqual(old.activities);
  expect(persisted.draws.filter((row: { activityId: string }) => row.activityId === MARKETING_SHOWCASE_ID)).toHaveLength(200);
  await act(async () => root.render(<StrictMode><MarketingProvider key="reload"><Probe /></MarketingProvider></StrictMode>));
  expect(container.textContent).toBe("200"); expect(localStorage.getItem(MARKETING_STORAGE_KEY)).toBe(first);
  expect(localStorage.getItem("kivisense-crm-prototype-v1")).toBe("sales unchanged"); expect(localStorage.getItem("kivisense-member-operations-v1")).toBe("members unchanged");
});
it("does not replace an unreadable old namespace with demo data", async () => {
  localStorage.setItem(MARKETING_STORAGE_KEY, "unreadable original");
  await act(async () => root.render(<MarketingProvider><Probe /></MarketingProvider>));
  expect(localStorage.getItem(MARKETING_STORAGE_KEY)).toBe("unreadable original");
  expect(container.textContent).toContain("原内容已保留");
});
