// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import type { SowindPurchaseIntentInput } from "@/types/member-operations";
import { CrmProvider, SALES_STORAGE_KEY, useCrm } from "./crm-store";
import { MemberOperationsProvider, MEMBER_OPERATIONS_STORAGE_KEY, useMemberOperations } from "./member-operations-store";

vi.mock("@douyinfe/semi-ui", () => ({ Toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
let crm: ReturnType<typeof useCrm>;
let member: ReturnType<typeof useMemberOperations>;
let root: Root;
let host: HTMLDivElement;
const MARKETING_KEY = "kivisense-marketing-prototype-v1";
const intent: SowindPurchaseIntentInput = { brand: "gp", first_name: "Created", last_name: null, tel: "13800012011", tel_country_code: "86", email: null, product_sku: null, model: null, has_watch: 0, accepts_marketing: 0, personal_data_consent: 0 };
function Probe() { crm = useCrm(); member = useMemberOperations(); return <div>{member.recoveryIssue}</div>; }
async function mount() {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(<StrictMode><CrmProvider><MemberOperationsProvider><Probe /></MemberOperationsProvider></CrmProvider></StrictMode>); });
}
function distributorId() { return crm.state.users.find((user) => user.role === "DISTRIBUTOR_SALES")!.id; }
function seedSales() {
  const sales = createDemoState();
  sales.users.push({ ...sales.users[1], id: "test-viewer", role: "VIEWER" });
  localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(sales));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear(); seedSales();
  localStorage.setItem(MEMBER_OPERATIONS_STORAGE_KEY, JSON.stringify(createMemberOperationsDemoState()));
  localStorage.setItem(MARKETING_KEY, "marketing-isolation-sentinel");
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (root) await act(async () => { root.unmount(); });
  host?.remove();
});

describe("Member provider action and persistence boundaries", () => {
  it("preserves valid legacy V2 data byte-for-byte without assigning missing dates", async () => {
    const state = createMemberOperationsDemoState();
    delete state.customers[0].created_at;
    delete state.brandUsers[0].created_at;
    const raw = JSON.stringify(state, null, 2);
    localStorage.setItem(MEMBER_OPERATIONS_STORAGE_KEY, raw);
    await mount();
    expect(member.recoveryIssue).toBe("");
    expect(member.state.brandUsers[0].created_at).toBeUndefined();
    expect(localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY)).toBe(raw);
  });

  it("rejects direct Member reset for Distributor and Viewer actors", async () => {
    await mount();
    const raw = localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY);
    await act(async () => {
      crm.setCurrentUser(distributorId());
      expect(member.resetMemberData()).toBe(false);
      crm.setCurrentUser("test-viewer");
      expect(member.resetMemberData()).toBe(false);
    });
    expect(localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY)).toBe(raw);
  });

  it("retained HQ callbacks use the live actor after synchronous actor changes", async () => {
    await mount();
    const hqCallbacks = member;
    const raw = localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY);
    await act(async () => {
      crm.setCurrentUser(distributorId());
      expect(hqCallbacks.createPurchaseIntent(intent).ok).toBe(false);
      hqCallbacks.updateUserProfileHasWatch("profile-gp-1001-a", 0);
      hqCallbacks.updatePurchaseIntentHasWatch("intent-gp-linked", 2);
      expect(hqCallbacks.resetMemberData()).toBe(false);
      hqCallbacks.setBrandScope("gp");
    });
    expect(localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY)).toBe(raw);
  });

  it("Admin reset touches only the Member primary key, not Sales or Marketing", async () => {
    await mount();
    const salesRaw = localStorage.getItem(SALES_STORAGE_KEY);
    const marketingRaw = localStorage.getItem(MARKETING_KEY);
    await act(async () => { expect(member.createPurchaseIntent(intent).ok).toBe(true); });
    const editedCount = member.state.purchaseIntents.length;
    await act(async () => { expect(member.resetMemberData()).toBe(true); });
    expect(member.state.purchaseIntents).toHaveLength(editedCount - 1);
    expect(localStorage.getItem(SALES_STORAGE_KEY)).toBe(salesRaw);
    expect(localStorage.getItem(MARKETING_KEY)).toBe(marketingRaw);
  });

  it("quota failure commits neither a new intent nor an in-memory association", async () => {
    await mount();
    const raw = localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY);
    const state = member.state;
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === MEMBER_OPERATIONS_STORAGE_KEY) throw new DOMException("full", "QuotaExceededError");
      original.call(this, key, value);
    });
    await act(async () => {
      const result = member.createPurchaseIntent(intent);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("STORAGE");
    });
    expect(member.state).toBe(state);
    expect(localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY)).toBe(raw);
    expect(member.recoveryIssue).toContain("本地保存失败");
  });

  it("StrictMode preserves corrupted Member JSON until explicit Admin reset", async () => {
    const raw = '{"version":2,"userProfiles":broken';
    localStorage.setItem(MEMBER_OPERATIONS_STORAGE_KEY, raw);
    const salesRaw = localStorage.getItem(SALES_STORAGE_KEY);
    await mount();
    expect(member.recoveryIssue).toContain("原始数据已保留");
    expect(member.state.purchaseIntents).toEqual([]);
    expect(localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY)).toBe(raw);
    await act(async () => { expect(member.createPurchaseIntent(intent).ok).toBe(false); });
    expect(localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY)).toBe(raw);
    await act(async () => { expect(member.resetMemberData()).toBe(true); });
    expect(member.recoveryIssue).toBe("");
    expect(member.state.purchaseIntents.length).toBeGreaterThan(0);
    expect(localStorage.getItem(SALES_STORAGE_KEY)).toBe(salesRaw);
  });

  it("preserves unknown versions without initializing the seed over them", async () => {
    const raw = '{"version":99,"futureField":"keep-exact"}';
    localStorage.setItem(MEMBER_OPERATIONS_STORAGE_KEY, raw);
    await mount();
    expect(member.recoveryIssue).toContain("版本不兼容");
    expect(localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY)).toBe(raw);
    await act(async () => { member.setBrandScope("gp"); });
    expect(localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY)).toBe(raw);
  });

  it("does not crash or overwrite malformed NULL collection entries", async () => {
    const state = createMemberOperationsDemoState();
    const raw = JSON.stringify({ ...state, brandUsers: [null] });
    localStorage.setItem(MEMBER_OPERATIONS_STORAGE_KEY, raw);
    await mount();
    expect(member.recoveryIssue).toContain("结构无法读取");
    expect(member.state.brandUsers).toEqual([]);
    expect(localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY)).toBe(raw);
  });

  it("creates a persisted intent with the SQL profile phone and unique live association", async () => {
    await mount();
    await act(async () => {
      const result = member.createPurchaseIntent(intent);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.intent.user_id).toBe("user-gp-1001-a");
    });
    const persisted = JSON.parse(localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY)!);
    expect(persisted.purchaseIntents[0]).toEqual(member.state.purchaseIntents[0]);
    expect(persisted.purchaseIntents[0].tel).toBe(intent.tel);
    expect(persisted.purchaseIntents[0].user_id).toBe("user-gp-1001-a");
  });

  it.each(["customers", "brandUsers", "userProfiles", "purchaseIntents"] as const)("preserves raw Member data with duplicate %s primary IDs instead of silently repairing it", async (collection) => {
    const state = createMemberOperationsDemoState();
    state[collection][1].id = state[collection][0].id;
    const raw = JSON.stringify(state);
    localStorage.setItem(MEMBER_OPERATIONS_STORAGE_KEY, raw);
    await mount();
    expect(member.recoveryIssue).toContain("结构无法读取");
    expect(localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY)).toBe(raw);
    await act(async () => { expect(member.createPurchaseIntent(intent).ok).toBe(false); });
    expect(localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY)).toBe(raw);
  });

  it("blocks direct NULL intent writes without altering memory or raw data, while allowing an explicit legacy correction", async () => {
    await mount();
    let createdId = "";
    await act(async () => {
      const result = member.createPurchaseIntent(intent);
      if (!result.ok) throw new Error(result.error);
      createdId = result.intent.id;
    });
    const raw = localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY);
    const before = member.state;
    await act(async () => {
      member.updatePurchaseIntentHasWatch(createdId, null);
      member.updatePurchaseIntentHasWatch("intent-un-admin-null", null);
    });
    expect(member.state).toBe(before);
    expect(localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY)).toBe(raw);
    expect(member.state.purchaseIntents.find((intent) => intent.id === "intent-un-admin-null")!.has_watch).toBeNull();
    await act(async () => { member.updatePurchaseIntentHasWatch("intent-un-admin-null", 1); });
    expect(member.state.purchaseIntents.find((intent) => intent.id === "intent-un-admin-null")!.has_watch).toBe(1);
    const correctedRaw = localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY);
    await act(async () => { member.updatePurchaseIntentHasWatch("intent-un-admin-null", null); });
    expect(localStorage.getItem(MEMBER_OPERATIONS_STORAGE_KEY)).toBe(correctedRaw);
  });
});
