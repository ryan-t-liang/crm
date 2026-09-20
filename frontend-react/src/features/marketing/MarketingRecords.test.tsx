// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import { createMarketingDemoState } from "@/mock/marketing-demo-data";
import { brandLabels } from "@/utils/brand-display";
import { MarketingDetail } from "./MarketingAdmin";
import { ActivityBookingData, DrawData } from "./MarketingRecords";
import { PickupScheduleSection } from "./MarketingPickup";

vi.hoisted(() => Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ fillRect: () => {}, fillStyle: "" }) }));
vi.mock("@/stores/crm-store", () => ({ useCrm: () => ({ state: sales, currentUser: sales.users[0] }) }));
vi.mock("@/stores/member-operations-store", () => ({ useMemberOperations: () => ({ state: members }), brandLabels }));
vi.mock("@/stores/marketing-store", () => ({ useMarketing: () => ({ state, act: write }) }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// jsdom has no layout engine; keep the real Semi components and only provide
// the browser observation API needed to mount typography/tooltips.
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
const sales = createDemoState(), members = createMemberOperationsDemoState(), now = Date.now();
let state = createMarketingDemoState(members, now);
const write = vi.fn();
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
beforeEach(() => { state = createMarketingDemoState(members, now); write.mockClear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("activity record workspace with real Semi components", () => {
  it("has exactly the three requested tabs and core edit information in the right rail", async () => {
    await act(async () => root.render(<MarketingDetail activity={state.activities[0]} />));
    expect([...container.querySelectorAll('[role="tab"]')].map(tab => tab.textContent)).toEqual(["活动预约记录", "奖品设置", "抽奖记录"]);
    expect(container.querySelector(".marketing-overview")).toBeNull();
    const rail = container.querySelector(".detail-sidebar")!;
    for (const text of ["活动名称", "创建人", "创建时间", "活动规则", "参与方式", "启用抽奖", "预约设置", "抽奖设置"]) expect(rail.textContent).toContain(text);
    expect([...rail.querySelectorAll("button[aria-label]")].map(button => button.getAttribute("aria-label"))).toEqual(["编辑活动信息", "编辑活动预约设置", "编辑抽奖设置"]);
    expect(write).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="活动状态操作"]')!.click());
    const menu = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(menu.map(item => item.textContent)).toEqual(["开始", "暂停", "结束"]);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="活动状态操作"]')!.click());
    await act(async () => rail.querySelector<HTMLButtonElement>('button[aria-label="编辑活动信息"]')!.click());
    expect(document.querySelector(".semi-modal")?.textContent).toContain("编辑活动");
    expect(document.querySelector(".semi-sidesheet")).toBeNull(); expect(write).not.toHaveBeenCalled();
  });
  it("retains all three tabs when booking/draw capabilities are disabled", async () => {
    const activity = { ...state.activities[2], bookingEnabled: false, status: "DRAFT" as const, publishedAt: undefined, pool: [] };
    await act(async () => root.render(<MarketingDetail activity={activity} requestedTab="prizes" />));
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(container.textContent).toContain("此活动未启用抽奖");
    const create = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "创建奖品")!;
    expect(create.disabled).toBe(false);
    await act(async () => create.click());
    expect(document.querySelector(".semi-sidesheet")?.textContent).toContain("创建奖品");
    expect(document.querySelector<HTMLInputElement>('input[aria-label="奖品名称"]')).not.toBeNull();
    expect(document.querySelector(".semi-modal")).toBeNull(); expect(write).not.toHaveBeenCalled();
  });
  it("redemption settings separate status and expose batch/single creation in the slot section", async () => {
    const activity = state.activities[0];
    await act(async () => root.render(<PickupScheduleSection activity={activity} openId="pickup-demo-shared" onOpen={() => {}} onClose={() => {}} />));
    expect([...container.querySelectorAll("th")].map(cell => cell.textContent)).toEqual(["兑奖预约", "有效日期", "可预约数量", "关联奖品", "状态", "操作"]);
    const sheet = document.querySelector(".semi-sidesheet")!;
    expect(sheet.textContent).toContain("兑奖预约");
    expect(sheet.textContent).not.toContain("领取安排");
    const batch = [...sheet.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "批量生成时段")!;
    const single = [...sheet.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "新增时段")!;
    expect(batch.closest("section")?.textContent).toContain("兑奖时段");
    expect(single.disabled).toBe(false);
    await act(async () => single.click());
    expect([...document.querySelectorAll(".semi-sidesheet")].some(node => node.textContent?.includes("新增兑奖时段"))).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[aria-label="可预约数量"]')).not.toBeNull();
    expect(write).not.toHaveBeenCalled();
  });
  it("shows the requested activity booking fields, masked list identities and readonly complete detail", async () => {
    await act(async () => root.render(<ActivityBookingData activity={state.activities[0]} now={now} />));
    const headers = [...container.querySelectorAll("th")].map(cell => cell.textContent);
    for (const text of ["OpenID", "姓名", "手机号", "性别", "活动名称", "参与时段", "创建时间", "状态"]) expect(headers).toContain(text);
    expect(container.textContent).toContain("待核销"); expect(container.textContent).toContain("未记录");
    const openid = state.participations.find(row => row.id === state.bookings[0].participationId)!.identities[0].openid!;
    expect(container.textContent).not.toContain(openid);
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "查看")!.click());
    expect(document.querySelector(".semi-sidesheet")?.textContent).toContain(openid);
    expect(write).not.toHaveBeenCalled();
  });
  it("shows identical redeemed labels and isolates the reserved prize's history button", async () => {
    const activity = state.activities[3];
    state.awards[1].fulfilledAt = new Date(now).toISOString();
    await act(async () => root.render(<DrawData activity={activity} now={now} />));
    expect([...container.querySelectorAll(".semi-tag-content")].filter(tag => tag.textContent === "已核销")).toHaveLength(2);
    const row = [...container.querySelectorAll("tbody tr")].find(row => row.textContent?.includes(state.awards[1].prizeName))!;
    expect([...row.querySelectorAll("button")].map(button => button.textContent)).toEqual(["查看", "预约记录"]);
    await act(async () => [...row.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "预约记录")!.click());
    const sheet = document.querySelector(".semi-modal")!;
    expect(sheet.textContent).toContain("奖品预约记录"); expect(sheet.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(sheet.textContent).toContain("领奖预约"); expect(sheet.textContent).not.toContain("活动预约");
    expect(write).not.toHaveBeenCalled();
  });
});
