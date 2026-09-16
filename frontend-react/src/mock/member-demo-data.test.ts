import { describe, expect, it } from "vitest";
import { describeSowindPhoneMatch } from "@/features/member-operations/member-model";
import { createDemoState } from "@/mock/demo-data";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";

describe("Sowind-compatible member operations demo dataset", () => {
  it("uses the four requested collections without creating Membership", () => {
    const state = createMemberOperationsDemoState();
    expect(state.customers.length).toBeGreaterThan(0);
    expect(state.brandUsers.length).toBeGreaterThan(0);
    expect(state.userProfiles.length).toBeGreaterThan(0);
    expect(state.purchaseIntents.length).toBeGreaterThan(0);
    expect(Object.keys(state)).not.toContain("memberships");
  });

  it("allows one customer to reference GP and UN brand users", () => {
    const state = createMemberOperationsDemoState();
    const customer = state.customers.find((item) => {
      const brands = new Set(state.brandUsers.filter((user) => user.customer_id === item.id).map((user) => user.brand));
      return brands.has("gp") && brands.has("un");
    });
    expect(customer).toBeDefined();
  });

  it("preserves nullable customer and purchase-intent user links", () => {
    const state = createMemberOperationsDemoState();
    expect(state.brandUsers.some((user) => user.customer_id === null)).toBe(true);
    expect(state.purchaseIntents.some((intent) => intent.user_id === null)).toBe(true);
  });

  it("does not enforce a per-customer per-brand unique user", () => {
    const state = createMemberOperationsDemoState();
    expect(state.brandUsers.filter((user) => user.customer_id === "customer-1002" && user.brand === "gp")).toHaveLength(2);
  });

  it("keeps brand + openid unique for non-null values while allowing multiple null openids", () => {
    const state = createMemberOperationsDemoState();
    const nonNullKeys = state.brandUsers.filter((user) => user.openid !== null).map((user) => `${user.brand}:${user.openid}`);
    expect(new Set(nonNullKeys).size).toBe(nonNullKeys.length);
    expect(state.brandUsers.filter((user) => user.brand === "gp" && user.openid === null).length).toBeGreaterThan(1);
  });

  it("keeps profile and intent enum contracts distinct, including null", () => {
    const state = createMemberOperationsDemoState();
    expect(new Set(state.userProfiles.map((profile) => profile.has_watch))).toEqual(new Set([0, 1, null]));
    expect(new Set(state.purchaseIntents.map((intent) => intent.has_watch))).toEqual(new Set([0, 1, 2, null]));
    expect(new Set(state.userProfiles.map((profile) => profile.accepts_marketing))).toEqual(new Set([0, 1]));
    expect(new Set(state.purchaseIntents.map((intent) => intent.accepts_marketing))).toEqual(new Set([0, 1, 2, null]));
  });

  it("preserves nulls and unresolved raw dictionary codes", () => {
    const state = createMemberOperationsDemoState();
    expect(state.userProfiles.some((profile) => profile.region === null && profile.areas_of_interest === null)).toBe(true);
    expect(state.userProfiles.some((profile) => profile.favorite_series?.includes("UNKNOWN"))).toBe(true);
    expect(state.purchaseIntents.some((intent) => intent.favorite_series?.includes("UNKNOWN"))).toBe(true);
  });

  it("applies brand + country code + phone candidate rules without auto-linking", () => {
    const state = createMemberOperationsDemoState();
    const unique = state.purchaseIntents.find((item) => item.id === "intent-un-unique-unlinked-customer")!;
    const none = state.purchaseIntents.find((item) => item.id === "intent-gp-no-match")!;
    const ambiguous = state.purchaseIntents.find((item) => item.id === "intent-gp-ambiguous")!;
    const incomplete = state.purchaseIntents.find((item) => item.id === "intent-un-admin-null")!;
    expect(describeSowindPhoneMatch(state.brandUsers, unique).code).toBe("UNIQUE");
    expect(describeSowindPhoneMatch(state.brandUsers, none).code).toBe("NONE");
    expect(describeSowindPhoneMatch(state.brandUsers, ambiguous).code).toBe("AMBIGUOUS");
    expect(describeSowindPhoneMatch(state.brandUsers, incomplete).code).toBe("INCOMPLETE");
    expect(ambiguous.user_id).toBeNull();
  });

  it("keeps profile and purchase-intent snapshots independent", () => {
    const state = createMemberOperationsDemoState();
    const profile = state.userProfiles.find((item) => item.user_id === "user-gp-1001-a")!;
    const intent = state.purchaseIntents.find((item) => item.user_id === "user-gp-1001-a")!;
    const originalIntent = structuredClone(intent);
    profile.has_watch = 0;
    profile.accepts_marketing = 0;
    expect(intent).toEqual(originalIntent);
  });

  it("does not add member records to Sales Lead or Deal collections", () => {
    const sales = createDemoState();
    const memberState = createMemberOperationsDemoState();
    expect(Object.keys(memberState)).not.toContain("leads");
    expect(Object.keys(memberState)).not.toContain("deals");
    expect(memberState.purchaseIntents.some((intent) => sales.leads.some((lead) => lead.id === intent.id))).toBe(false);
    expect(memberState.purchaseIntents.some((intent) => sales.deals.some((deal) => deal.id === intent.id))).toBe(false);
  });

  it("returns a fresh member reset state independently", () => {
    const first = createMemberOperationsDemoState();
    const second = createMemberOperationsDemoState();
    first.brandUsers[0].openid = "changed";
    first.brandScope = "gp";
    expect(second.brandUsers[0].openid).not.toBe("changed");
    expect(second.brandScope).toBe("ALL");
  });
});
