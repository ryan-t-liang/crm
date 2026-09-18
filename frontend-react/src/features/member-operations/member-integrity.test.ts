import { describe, expect, it } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { createMemberOperationsDemoState } from "@/mock/member-demo-data";
import type { SowindPurchaseIntentInput } from "@/types/member-operations";
import { createSowindPurchaseIntent, describeSowindPhoneMatch, matchPurchaseIntentMember, memberWriteContext, normalizeSowindPhone, updateSowindIntentHasWatch, updateSowindProfileHasWatch } from "./member-model";
import { readBrandPhone, readIntentPhone } from "./sowind-read";

const admin = { role: "HQ_ADMIN", brands: ["gp", "un"] as ("gp" | "un")[] };
const now = "2026-09-18T04:00:00.000Z";
const input = (values: Partial<SowindPurchaseIntentInput> = {}): SowindPurchaseIntentInput => ({ brand: "gp", first_name: "Snapshot", last_name: null, tel: "13800012011", tel_country_code: "86", email: null, product_sku: "GP-SNAPSHOT", model: null, has_watch: 0, accepts_marketing: 0, personal_data_consent: 0, ...values });
const create = (values: Partial<SowindPurchaseIntentInput> = {}, actor = admin) => createSowindPurchaseIntent(createMemberOperationsDemoState(), input(values), actor, "intent-created", now);

describe("Member and Purchase Intent core integrity", () => {
  it("creates an unknown phone with a NULL user_id, not a new user or customer", () => {
    const state = createMemberOperationsDemoState();
    const result = createSowindPurchaseIntent(state, input({ tel: "19900009999" }), admin, "unknown", now);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.intent.user_id).toBeNull();
    expect(result.match.code).toBe("NONE");
    expect(result.state.brandUsers).toBe(state.brandUsers);
    expect(result.state.customers).toBe(state.customers);
    expect(result.state.userProfiles).toBe(state.userProfiles);
  });

  it("automatically links the unique GP member using profile phone", () => {
    const result = create();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.intent.user_id).toBe("user-gp-1001-a");
  });

  it("returns an ambiguity warning and leaves user_id NULL without an HQ error", () => {
    const result = create({ tel: "13900012022" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.intent.user_id).toBeNull();
    expect(result.match.candidates).toHaveLength(2);
    expect(result.warning).toContain("关联待核验");
    expect(result.intent.error).toBeNull();
    expect(result.intent.hq_sync_status).toBe(0);
  });

  it("never associates a GP intent to the only UN phone match", () => {
    const result = create({ tel: "61230077", tel_country_code: "852" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.intent.user_id).toBeNull();
  });

  it("matches the same phone separately for GP and UN", () => {
    const gp = create();
    const un = create({ brand: "un" });
    expect(gp.ok && gp.intent.user_id).toBe("user-gp-1001-a");
    expect(un.ok && un.intent.user_id).toBe("user-un-1001-a");
  });

  it("excludes soft-deleted members", () => {
    const state = createMemberOperationsDemoState();
    state.brandUsers.find((user) => user.id === "user-gp-1001-a")!.is_deleted = 1;
    expect(matchPurchaseIntentMember(state.brandUsers, state.userProfiles, input()).user_id).toBeNull();
  });

  it("does not treat an unknown legacy deletion flag as confirmed active", () => {
    const state = createMemberOperationsDemoState();
    delete state.brandUsers.find((user) => user.id === "user-gp-1001-a")!.is_deleted;
    expect(matchPurchaseIntentMember(state.brandUsers, state.userProfiles, input()).user_id).toBeNull();
  });

  it("uses SQL profile.tel ahead of a contradictory legacy user.phone alias", () => {
    const state = createMemberOperationsDemoState();
    const user = state.brandUsers.find((user) => user.id === "user-gp-1001-a")!;
    user.phone = "18800000000";
    expect(matchPurchaseIntentMember(state.brandUsers, state.userProfiles, input()).user_id).toBe(user.id);
    expect(matchPurchaseIntentMember(state.brandUsers, state.userProfiles, input({ tel: user.phone })).user_id).toBeNull();
  });

  it("does not fall back from an explicit NULL SQL country code", () => {
    const state = createMemberOperationsDemoState();
    const profile = state.userProfiles.find((profile) => profile.user_id === "user-gp-1001-a")!;
    profile.tel_country_code = null;
    expect(matchPurchaseIntentMember(state.brandUsers, state.userProfiles, input()).user_id).toBeNull();
    expect(readBrandPhone(state.brandUsers[0], state.userProfiles).country).toBeNull();
  });

  it("keeps legacy alias fallback confined to the read layer", () => {
    const state = createMemberOperationsDemoState();
    delete state.userProfiles[0].tel;
    delete state.userProfiles[0].tel_country_code;
    expect(readBrandPhone(state.brandUsers[0], state.userProfiles).source).toContain("旧演示别名");
    expect(matchPurchaseIntentMember(state.brandUsers, state.userProfiles, input()).user_id).toBe(state.brandUsers[0].id);
  });

  it("normalizes basic country code and number formatting for comparisons only", () => {
    expect(normalizeSowindPhone(" +86 ", " 138 0001-2011 ")).toBe(normalizeSowindPhone("0086", "13800012011"));
    const result = create({ tel: " 138 0001-2011 ", tel_country_code: " +86 " });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.intent.user_id).toBe("user-gp-1001-a");
    expect(result.intent.tel).toBe(" 138 0001-2011 ");
  });

  it("creates NULL phone snapshots without coercing them to empty strings", () => {
    const result = create({ tel: null, tel_country_code: null, first_name: null, last_name: null });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.intent.tel).toBeNull();
    expect(result.intent.phone).toBeNull();
    expect(result.intent.name).toBeNull();
    expect(result.intent.user_id).toBeNull();
    expect(result.match.code).toBe("INCOMPLETE");
  });

  it("preserves independent snapshots when member profile fields change", () => {
    const result = create();
    if (!result.ok) throw new Error(result.error);
    const snapshot = structuredClone(result.intent);
    const next = updateSowindProfileHasWatch(result.state, "profile-gp-1001-a", 0, admin, now);
    if (!next.ok) throw new Error(next.error);
    next.state.userProfiles[0] = { ...next.state.userProfiles[0], tel: "18800000000", first_name: "Changed profile" };
    expect(next.state.purchaseIntents[0]).toEqual(snapshot);
    expect(readIntentPhone(next.state.purchaseIntents[0]).number).toBe("13800012011");
  });

  it("changing an intent does not modify member profile enums", () => {
    const state = createMemberOperationsDemoState();
    const before = structuredClone(state.userProfiles);
    const result = updateSowindIntentHasWatch(state, "intent-gp-linked", 2, admin, now);
    expect(result.ok && result.state.userProfiles).toEqual(before);
  });

  it("enforces brand write scope inside the creation model", () => {
    expect(create({ brand: "un" }, { role: "HQ_ADMIN", brands: ["gp"] }).ok).toBe(false);
    expect(create({}, { role: "DISTRIBUTOR_SALES", brands: ["gp"] }).ok).toBe(false);
    expect(create({}, { role: "VIEWER", brands: ["gp", "un"] }).ok).toBe(false);
  });

  it("derives current production-demo brand access from the existing actor role", () => {
    const sales = createDemoState();
    expect(memberWriteContext(sales.users.find((user) => user.role === "HQ_ADMIN")!).brands).toEqual(["gp", "un"]);
    expect(memberWriteContext(sales.users.find((user) => user.role === "DISTRIBUTOR_SALES")!).brands).toEqual([]);
  });

  it("protects profile and intent mutations from direct out-of-brand actions", () => {
    const state = createMemberOperationsDemoState();
    const gpOnly = { role: "HQ_ADMIN", brands: ["gp"] as ("gp" | "un")[] };
    expect(updateSowindProfileHasWatch(state, "profile-un-1001-a", 1, gpOnly, now).ok).toBe(false);
    expect(updateSowindIntentHasWatch(state, "intent-un-linked", 1, gpOnly, now).ok).toBe(false);
  });

  it("rejects invalid numeric choices and overlong SQL text", () => {
    expect(create({ has_watch: null as unknown as 0 }).ok).toBe(false);
    expect(create({ accepts_marketing: 3 as 0 }).ok).toBe(false);
    expect(create({ personal_data_consent: 2 as 0 }).ok).toBe(false);
    expect(create({ first_name: "x".repeat(101) }).ok).toBe(false);
    expect(create({ region: "x".repeat(11) }).ok).toBe(false);
  });

  it("adds exactly one list/detail-addressable intent with SQL timestamps and snapshots", () => {
    const state = createMemberOperationsDemoState();
    const result = createSowindPurchaseIntent(state, input(), admin, "new-intent", now);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.purchaseIntents).toHaveLength(state.purchaseIntents.length + 1);
    const detail = result.state.purchaseIntents.find((intent) => intent.id === "new-intent")!;
    expect(detail).toEqual(result.intent);
    expect(detail.created_at).toBe(now);
    expect(detail.updated_at).toBe(now);
    expect(detail.product_sku).toBe("GP-SNAPSHOT");
    expect(detail.source).toBe(2);
    expect(detail.hq_ref).toBeNull();
  });

  it("never adds purchase intents into Sales leads/deals or changes Sales counts", () => {
    const sales = createDemoState();
    const before = JSON.stringify(sales);
    expect(create().ok).toBe(true);
    expect(JSON.stringify(sales)).toBe(before);
  });

  it("rejects duplicate intent IDs and unresolved duplicate member profiles", () => {
    const state = createMemberOperationsDemoState();
    expect(createSowindPurchaseIntent(state, input(), admin, state.purchaseIntents[0].id, now).ok).toBe(false);
    state.userProfiles.push({ ...state.userProfiles[0], id: "duplicate-profile" });
    expect(matchPurchaseIntentMember(state.brandUsers, state.userProfiles, input()).user_id).toBeNull();
  });

  it("uses SQL intent fields instead of contradictory legacy aliases in candidate display", () => {
    const state = createMemberOperationsDemoState();
    const intent = { ...state.purchaseIntents[0], phone: "18800000000", country_code: "852" };
    expect(describeSowindPhoneMatch(state.brandUsers, intent, state.userProfiles).user_id).toBe("user-gp-1001-a");
  });

  it("does not choose a member arbitrarily when duplicate identity IDs are present", () => {
    const state = createMemberOperationsDemoState();
    state.brandUsers.push({ ...state.brandUsers[0], openid: "duplicate-id-openid" });
    const result = matchPurchaseIntentMember(state.brandUsers, state.userProfiles, input());
    expect(result.code).toBe("AMBIGUOUS");
    expect(result.user_id).toBeNull();
  });

  it("rejects duplicate profile IDs rather than applying a GP mutation to UN data", () => {
    const state = createMemberOperationsDemoState();
    state.userProfiles[1].id = state.userProfiles[0].id;
    const before = JSON.stringify(state);
    const result = updateSowindProfileHasWatch(state, state.userProfiles[0].id, 0, { role: "HQ_ADMIN", brands: ["gp"] }, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_TARGET");
    expect(JSON.stringify(state)).toBe(before);
  });

  it("rejects duplicate intent IDs rather than applying a GP mutation to UN data", () => {
    const state = createMemberOperationsDemoState();
    state.purchaseIntents[1].id = state.purchaseIntents[0].id;
    const before = JSON.stringify(state);
    const result = updateSowindIntentHasWatch(state, state.purchaseIntents[0].id, 2, { role: "HQ_ADMIN", brands: ["gp"] }, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_TARGET");
    expect(JSON.stringify(state)).toBe(before);
  });

  it("rejects writing NULL to a newly created SQL-compatible intent", () => {
    const created = create();
    if (!created.ok) throw new Error(created.error);
    const before = JSON.stringify(created.state);
    const result = updateSowindIntentHasWatch(created.state, created.intent.id, null, admin, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_ENUM");
    expect(JSON.stringify(created.state)).toBe(before);
  });

  it("preserves legacy NULL until an explicit valid edit, and never writes NULL back", () => {
    const state = createMemberOperationsDemoState();
    const legacy = state.purchaseIntents.find((intent) => intent.id === "intent-un-admin-null")!;
    expect(legacy.has_watch).toBeNull();
    expect(updateSowindIntentHasWatch(state, legacy.id, null, admin, now).ok).toBe(false);
    expect(legacy.has_watch).toBeNull();
    const valid = updateSowindIntentHasWatch(state, legacy.id, 2, admin, now);
    if (!valid.ok) throw new Error(valid.error);
    expect(valid.state.purchaseIntents.find((intent) => intent.id === legacy.id)!.has_watch).toBe(2);
    expect(updateSowindIntentHasWatch(valid.state, legacy.id, null, admin, now).ok).toBe(false);
  });
});
