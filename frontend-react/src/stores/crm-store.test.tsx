// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { CrmProvider, SALES_STORAGE_KEY, useCrm, type CrmStore } from "./crm-store";
import type { CrmState, Lead } from "@/types/crm";
vi.mock("@douyinfe/semi-ui", () => ({ Toast: { error: vi.fn(), success: vi.fn() } }));

let mounted: Root; let host: HTMLDivElement; let store: CrmStore;
const fixture = () => {
  const state = createDemoState();
  state.leads = [{ ...state.leads[0], id: "provider-qualified", status: "QUALIFIED", convertedDealId: undefined }];
  state.deals = []; state.tasks = [];
  return state;
};
function Probe() { store = useCrm(); return null; }
async function mount(state: CrmState) {
  localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(state));
  await act(async () => { mounted.render(<CrmProvider><Probe /></CrmProvider>); });
}
const input = (state: CrmState) => ({ name: "Provider Deal", organizationId: state.leads[0].organizationId, primaryContactId: state.leads[0].contactId, ownerId: state.leads[0].ownerId, productId: state.products[0].id, capabilityIds: [], expectedClose: "2026-10-18T00:00:00.000Z", stage: "DISCOVERY" as const });
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); vi.clearAllMocks(); host = document.createElement("div"); document.body.appendChild(host); mounted = createRoot(host);
});
afterEach(async () => { await act(async () => mounted.unmount()); host.remove(); });

describe("Sales Store action guards use the real live provider", () => {
  it("repeated stale Convert callback produces exactly one persisted Deal", async () => {
    const state = fixture(); await mount(state); const staleConvert = store.convertLead;
    await act(async () => {
      const first = staleConvert(state.leads[0].id, input(state));
      const second = staleConvert(state.leads[0].id, input(state));
      expect(second.id).toBe(first.id);
      const persisted = JSON.parse(localStorage.getItem(SALES_STORAGE_KEY)!) as CrmState;
      expect(persisted.deals).toHaveLength(1); expect(persisted.leads[0]).toMatchObject({ status: "CONVERTED", convertedDealId: first.id });
    });
    expect(store.state.deals).toHaveLength(1);
  });
  it("actor switching immediately blocks a callback captured as HQ", async () => {
    const state = fixture(); await mount(state); const staleUpdate = store.updateLead; const staleConvert = store.convertLead; const staleActor = store.getCurrentActor;
    await act(async () => {
      store.setCurrentUser("user-noah");
      expect(staleActor().id).toBe("user-noah");
      expect(staleUpdate(state.leads[0].id, { name: "Forbidden edit" })).toBe(false);
      expect(() => staleConvert(state.leads[0].id, input(state))).toThrow("不能修改其他分销商的数据");
    });
    expect(store.state.leads[0].name).toBe(state.leads[0].name); expect(store.state.deals).toHaveLength(0);
  });
  it("the direct Viewer action cannot edit or reset even without hidden UI", async () => {
    const state = fixture(); state.currentUserId = "user-jason"; state.users.find((user) => user.id === state.currentUserId)!.role = "VIEWER";
    await mount(state); const raw = localStorage.getItem(SALES_STORAGE_KEY);
    await act(async () => {
      expect(store.canWrite).toBe(false); expect(store.updateLead(state.leads[0].id, { status: "NEW" })).toBe(false); expect(store.reset()).toBe(false);
      expect(() => store.addLead({ ...state.leads[0], name: "Viewer creation" })).toThrow("当前角色为只读");
    });
    expect(localStorage.getItem(SALES_STORAGE_KEY)).toBe(raw);
  });
  it("Distributor reset is denied but an explicit HQ reset changes only Sales", async () => {
    const state = fixture(); await mount(state); localStorage.setItem("kivisense-member-operations-v1", "member-original"); localStorage.setItem("kivisense-marketing-prototype-v1", "marketing-original");
    await act(async () => {
      store.setCurrentUser("user-jason"); const afterRoleChange = localStorage.getItem(SALES_STORAGE_KEY); expect(store.reset()).toBe(false); expect(localStorage.getItem(SALES_STORAGE_KEY)).toBe(afterRoleChange);
      store.setCurrentUser("user-ryan"); expect(store.reset()).toBe(true);
    });
    expect(store.state.leads).toHaveLength(36); expect(localStorage.getItem("kivisense-member-operations-v1")).toBe("member-original"); expect(localStorage.getItem("kivisense-marketing-prototype-v1")).toBe("marketing-original");
  });
  it("rejects direct cross-Distributor task owners without changing either state", async () => {
    const state = fixture(); await mount(state); const lead = state.leads[0]; const raw = localStorage.getItem(SALES_STORAGE_KEY);
    await act(async () => { expect(store.addTask({ title: "Invalid task", relationType: "LEAD", relationId: lead.id, ownerId: "user-noah", distributorId: lead.distributorId, dueAt: "2026-10-18T00:00:00.000Z", status: "OPEN", priority: "MEDIUM", description: "" })).toBe(false); });
    expect(store.state.tasks).toHaveLength(0); expect(localStorage.getItem(SALES_STORAGE_KEY)).toBe(raw);
  });
  it("a quota failure creates no in-memory or persisted Deal", async () => {
    const state = fixture(); await mount(state); const raw = localStorage.getItem(SALES_STORAGE_KEY);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota exceeded", "QuotaExceededError"); });
    try {
      await act(async () => { expect(() => store.convertLead(state.leads[0].id, input(state))).toThrow(); });
      expect(store.state.deals).toHaveLength(0); expect(store.state.leads[0].status).toBe("QUALIFIED"); expect(localStorage.getItem(SALES_STORAGE_KEY)).toBe(raw); expect(store.recoveryIssue).not.toBe("");
    } finally { spy.mockRestore(); }
  });
  it("valid legacy data is read without backfilling its missing date or rewriting raw bytes", async () => {
    const state = fixture(); delete (state.leads[0] as Partial<Lead>).createdAt;
    const raw = JSON.stringify(state, null, 2); localStorage.setItem(SALES_STORAGE_KEY, raw);
    await act(async () => { mounted.render(<CrmProvider><Probe /></CrmProvider>); });
    expect(store.state.leads[0].createdAt).toBeUndefined(); expect(localStorage.getItem(SALES_STORAGE_KEY)).toBe(raw); expect(store.recoveryIssue).toBe("");
  });
  it.each([undefined, null, ""])("ordinary Product update cannot clear its primary id with %s", async (id) => {
    const state = fixture(); await mount(state); const raw = localStorage.getItem(SALES_STORAGE_KEY);
    await act(async () => { expect(store.updateProduct(state.products[0].id, { id } as Partial<typeof state.products[0]>)).toBe(false); });
    expect(localStorage.getItem(SALES_STORAGE_KEY)).toBe(raw); expect(store.state.products[0].id).toBe(state.products[0].id);
  });
  it("Product actions reject malformed render-critical fields atomically", async () => {
    const state = fixture(); await mount(state); const raw = localStorage.getItem(SALES_STORAGE_KEY);
    await act(async () => {
      expect(store.updateProduct(state.products[0].id, { capabilities: null } as unknown as Partial<typeof state.products[0]>)).toBe(false);
      expect(store.addProduct({ name: undefined, description: "", status: "ACTIVE", capabilities: [] } as unknown as typeof state.products[0])).toBe(false);
    });
    expect(localStorage.getItem(SALES_STORAGE_KEY)).toBe(raw); expect(store.state.products).toHaveLength(state.products.length);
  });
  it("Note updates whitelist title/body and ignore runtime attempts to change identity or scope", async () => {
    const state = fixture(); state.currentUserId = "user-jason";
    const original = { id: "provider-note", entityType: "LEAD" as const, entityId: state.leads[0].id, authorId: "user-jason", title: "Original title", body: "Original body", createdAt: "2026-09-18T00:00:00.000Z", distributorId: "dist-cn", ownerId: "user-jason" };
    state.notes = [original]; await mount(state);
    const untrustedPatch = { title: "Edited title", body: "Edited body", id: "changed-id", entityType: "ORGANIZATION", entityId: "org-3", distributorId: "dist-sg", ownerId: "user-noah", authorId: "user-noah", createdAt: "2099-01-01T00:00:00.000Z", sourceLeadId: "injected-link" };
    await act(async () => { expect(store.updateNote(original.id, untrustedPatch)).toBe(true); });
    const expected = { ...original, title: untrustedPatch.title, body: untrustedPatch.body };
    expect(store.state.notes).toEqual([expected]);
    const persisted = JSON.parse(localStorage.getItem(SALES_STORAGE_KEY)!) as CrmState;
    expect(persisted.notes).toEqual([expected]);
    expect(store.state.activities[0]).toMatchObject({ entityType: original.entityType, entityId: original.entityId, actorId: state.currentUserId, type: "NOTE" });
  });
});
