import { describe, expect, it } from "vitest";
import { createDemoState } from "@/mock/demo-data";

describe("Kivisense CRM prototype dataset", () => {
  it("provides presentation-scale demo coverage", () => {
    const state = createDemoState();
    expect(state.leads.length).toBeGreaterThanOrEqual(30);
    expect(state.deals.length).toBeGreaterThanOrEqual(20);
    expect(state.contacts.length).toBeGreaterThanOrEqual(20);
    expect(state.organizations.length).toBeGreaterThanOrEqual(10);
    expect(state.distributors.length).toBeGreaterThanOrEqual(4);
    expect(state.users.length).toBeGreaterThanOrEqual(8);
  });

  it("keeps every scoped record attached to a valid distributor", () => {
    const state = createDemoState();
    const ids = new Set(state.distributors.map((item) => item.id));
    for (const record of [...state.leads, ...state.deals, ...state.contacts, ...state.organizations, ...state.tasks]) expect(ids.has(record.distributorId)).toBe(true);
  });

  it("keeps Lead and Deal relationships referentially intact", () => {
    const state = createDemoState();
    for (const lead of state.leads) {
      expect(state.organizations.some((item) => item.id === lead.organizationId)).toBe(true);
      expect(state.contacts.some((item) => item.id === lead.contactId)).toBe(true);
    }
    for (const deal of state.deals) {
      expect(state.products.some((item) => item.id === deal.productId)).toBe(true);
      expect(state.contacts.some((item) => item.id === deal.primaryContactId)).toBe(true);
    }
  });

  it("uses the requested lifecycle without an Opportunity model", () => {
    const state = createDemoState();
    expect(new Set(state.leads.map((item) => item.status))).toEqual(new Set(["NEW", "CONTACTED", "NURTURING", "QUALIFIED", "CONVERTED", "UNQUALIFIED"]));
    expect(new Set(state.deals.map((item) => item.stage))).toEqual(new Set(["DISCOVERY", "SOLUTION", "QUOTATION", "NEGOTIATION", "WON", "LOST"]));
  });

  it("does not contain monetary fields", () => {
    const json = JSON.stringify(createDemoState()).toLowerCase();
    for (const forbidden of ["revenue", "discount", "dealvalue", "quotationamount", "price"]) expect(json).not.toContain(forbidden);
  });

  it("returns a fresh reset state", () => {
    const first = createDemoState(); const second = createDemoState();
    first.leads[0].name = "Changed";
    expect(second.leads[0].name).not.toBe("Changed");
  });
});
