import { describe, expect, it } from "vitest";
import { createDemoState } from "@/mock/demo-data";
import { addContactState, addLeadState, addOrganizationState, addTaskState, assertEntityWrite, assertHq, assertWritableDistributor, convertLeadState, CrmBusinessError, getAssignableOwnersForDistributor, ordinaryLeadStatuses, stageProbability, updateDealState, updateLeadState, updateTaskState, validCrmState, type ConvertLeadInput, type MutationContext } from "./crm-model";
import type { CrmState, CrmTask, DealStage, Lead, LeadStatus } from "@/types/crm";

function fixture() {
  const state = createDemoState();
  const lead: Lead = { ...state.leads[0], id: "integrity-lead", status: "QUALIFIED", convertedDealId: undefined };
  state.leads = [lead]; state.deals = []; state.tasks = [];
  let sequence = 0;
  const context: MutationContext = { now: "2026-09-18T02:00:00.000Z", id: (prefix) => `test-${prefix}-${++sequence}` };
  const input: ConvertLeadInput = { name: "Integrity Deal", organizationId: lead.organizationId, primaryContactId: lead.contactId, ownerId: lead.ownerId, productId: state.products[0].id, capabilityIds: [], expectedClose: "2026-10-18T00:00:00.000Z", stage: "DISCOVERY" };
  const task: Omit<CrmTask, "id"> = { title: "Integrity follow-up", relationType: "LEAD", relationId: lead.id, ownerId: lead.ownerId, distributorId: lead.distributorId, dueAt: "2026-09-20T00:00:00.000Z", priority: "MEDIUM", status: "OPEN", description: "Follow-up" };
  return { state, lead, context, input, task };
}
function expectCode(action: () => unknown, code: string) { try { action(); throw new Error("Action unexpectedly succeeded"); } catch (error) { expect(error).toBeInstanceOf(CrmBusinessError); expect((error as CrmBusinessError).code).toBe(code); } }
function converted() { const f = fixture(); return { ...f, ...convertLeadState(f.state, f.lead.id, f.input, f.context) }; }

describe("Sales core integrity: model actions", () => {
  it("converts QUALIFIED with all four invariants and one activity for each side", () => {
    const f = fixture(); const result = convertLeadState(f.state, f.lead.id, f.input, f.context);
    expect(result.state.leads[0]).toMatchObject({ status: "CONVERTED", convertedDealId: result.record.id, distributorId: result.record.distributorId });
    expect(result.record.sourceLeadId).toBe(f.lead.id); expect(result.state.deals).toHaveLength(1);
    expect(result.state.activities.slice(0, 2).map((item) => item.entityType)).toEqual(["LEAD", "DEAL"]);
    expect(f.state.deals).toHaveLength(0); expect(f.state.leads[0].status).toBe("QUALIFIED");
  });
  it.each(["NEW", "CONTACTED", "NURTURING", "UNQUALIFIED"] as LeadStatus[])("rejects Convert for %s", (status) => {
    const f = fixture(); f.lead.status = status;
    expectCode(() => convertLeadState(f.state, f.lead.id, f.input, f.context), "LEAD_NOT_QUALIFIED"); expect(f.state.deals).toHaveLength(0);
  });
  it("rejects a missing Lead", () => { const f = fixture(); expectCode(() => convertLeadState(f.state, "missing", f.input, f.context), "LEAD_MISSING"); });
  it("returns the original Deal on repeat without a state write", () => {
    const f = converted(); const second = convertLeadState(f.state, f.lead.id, f.input, f.context);
    expect(second.record).toBe(f.record); expect(second.state).toBe(f.state); expect(second.alreadyConverted).toBe(true); expect(second.state.deals).toHaveLength(1);
  });
  it("rejects a preexisting convertedDealId on QUALIFIED", () => { const f = fixture(); f.lead.convertedDealId = "existing"; expectCode(() => convertLeadState(f.state, f.lead.id, f.input, f.context), "CONVERT_LINK_CONFLICT"); });
  it("rejects a preexisting reverse sourceLeadId", () => {
    const f = fixture(); f.state.deals = [{ ...f.input, id: "reverse", distributorId: f.lead.distributorId, sourceLeadId: f.lead.id, probability: 20, createdAt: f.context.now, lastActivityAt: f.context.now }];
    expectCode(() => convertLeadState(f.state, f.lead.id, f.input, f.context), "CONVERT_LINK_CONFLICT");
  });
  it.each(["missing", "wrong-source", "wrong-distributor", "duplicate-source", "duplicate-deal-id", "duplicate-lead-id", "shared-target"])("rejects repeat with %s conflict", (scenario) => {
    const f = converted();
    if (scenario === "missing") f.state.deals = [];
    if (scenario === "wrong-source") f.record.sourceLeadId = "other";
    if (scenario === "wrong-distributor") f.record.distributorId = "dist-sg";
    if (scenario === "duplicate-source") f.state.deals.push({ ...f.record, id: "duplicate" });
    if (scenario === "duplicate-deal-id") f.state.deals.push({ ...f.record, sourceLeadId: "other" });
    if (scenario === "duplicate-lead-id") f.state.leads.push({ ...f.state.leads[0] });
    if (scenario === "shared-target") f.state.leads.push({ ...f.state.leads[0], id: "other" });
    expectCode(() => convertLeadState(f.state, f.lead.id, f.input, f.context), "CONVERT_LINK_CONFLICT");
  });
  it("does not expose CONVERTED in the shared ordinary status options", () => { expect(ordinaryLeadStatuses).not.toContain("CONVERTED"); expect(ordinaryLeadStatuses).toHaveLength(5); });
  it("cannot manually enter CONVERTED", () => { const f = fixture(); expectCode(() => updateLeadState(f.state, f.lead.id, { status: "CONVERTED" }, f.context), "CONVERT_ACTION_REQUIRED"); });
  it("cannot create an already-CONVERTED Lead", () => { const f = fixture(); expectCode(() => addLeadState(f.state, { ...f.lead, status: "CONVERTED" }, f.context), "CONVERT_ACTION_REQUIRED"); });
  it("cannot revert a converted Lead to QUALIFIED", () => { const f = converted(); expectCode(() => updateLeadState(f.state, f.lead.id, { status: "QUALIFIED" }, f.context), "CONVERT_ACTION_REQUIRED"); });
  it.each([undefined, null, ""])("cannot clear a converted Lead status with %s", (status) => { const f = converted(); expectCode(() => updateLeadState(f.state, f.lead.id, { status } as Partial<Lead>, f.context), "CONVERT_ACTION_REQUIRED"); });
  it.each([undefined, null, ""])("cannot clear an ordinary Lead status with %s", (status) => { const f = fixture(); expectCode(() => updateLeadState(f.state, f.lead.id, { status } as Partial<Lead>, f.context), "CONVERT_ACTION_REQUIRED"); });
  it("permits ordinary status changes", () => { const f = fixture(); expect(updateLeadState(f.state, f.lead.id, { status: "CONTACTED" }, f.context).leads[0].status).toBe("CONTACTED"); });
  it("protects immutable Lead conversion links", () => { const f = converted(); expectCode(() => updateLeadState(f.state, f.lead.id, { convertedDealId: undefined }, f.context), "IMMUTABLE_LINK"); });
  it.each(["update", "convert", "add", "task", "contact", "organization"])("rejects %s in another Distributor", (operation) => {
    const f = fixture(); f.state.currentUserId = "user-noah";
    const actions: Record<string, () => unknown> = { update: () => updateLeadState(f.state, f.lead.id, { name: "Changed" }, f.context), convert: () => convertLeadState(f.state, f.lead.id, f.input, f.context), add: () => addLeadState(f.state, f.lead, f.context), task: () => addTaskState(f.state, f.task, f.context), contact: () => addContactState(f.state, f.state.contacts[0], f.context), organization: () => addOrganizationState(f.state, f.state.organizations[0], f.context) };
    expectCode(actions[operation], "OUT_OF_SCOPE");
  });
  it("allows Distributor writes inside its own scope", () => { const f = fixture(); f.state.currentUserId = "user-jason"; expect(updateLeadState(f.state, f.lead.id, { status: "CONTACTED" }, f.context).leads[0].status).toBe("CONTACTED"); });
  it.each(["VIEWER", "UNKNOWN"])("fails closed for %s writes", (role) => {
    const f = fixture(); const actor = f.state.users.find((user) => user.id === "user-jason")!; actor.role = role as typeof actor.role; f.state.currentUserId = actor.id;
    expectCode(() => updateLeadState(f.state, f.lead.id, { name: "Changed" }, f.context), "READ_ONLY");
  });
  it("rejects a stale or missing actor id", () => { const f = fixture(); f.state.currentUserId = "missing"; expectCode(() => assertWritableDistributor(f.state, f.lead.distributorId), "ACTOR_MISSING"); });
  it("allows only HQ to reset", () => { const f = fixture(); expect(assertHq(f.state).role).toBe("HQ_ADMIN"); f.state.currentUserId = "user-jason"; expectCode(() => assertHq(f.state), "ADMIN_REQUIRED"); });
  it("assignable Shanghai owners exclude Singapore and Viewer", () => { const f = fixture(); f.state.users.find((item) => item.id === "user-lina")!.role = "VIEWER"; expect(getAssignableOwnersForDistributor(f.state.users, "dist-cn").map((item) => item.id)).toEqual(["user-jason"]); });
  it("HQ cannot assign a Singapore owner to a Shanghai Lead", () => { const f = fixture(); expectCode(() => updateLeadState(f.state, f.lead.id, { ownerId: "user-noah" }, f.context), "OWNER_DISTRIBUTOR"); });
  it("Convert rejects a cross-Distributor owner", () => { const f = fixture(); expectCode(() => convertLeadState(f.state, f.lead.id, { ...f.input, ownerId: "user-noah" }, f.context), "OWNER_DISTRIBUTOR"); });
  it("Lead contact must belong to its Organization", () => { const f = fixture(); expectCode(() => updateLeadState(f.state, f.lead.id, { contactId: "contact-4" }, f.context), "CONTACT_ORGANIZATION"); });
  it("task Distributor follows the relation and cannot change with owner", () => {
    const f = fixture(); const state = addTaskState(f.state, f.task, f.context);
    expect(state.tasks[0].distributorId).toBe(f.lead.distributorId);
    expectCode(() => updateTaskState(state, state.tasks[0].id, { ownerId: "user-noah" }, f.context), "OWNER_DISTRIBUTOR");
    expectCode(() => updateTaskState(state, state.tasks[0].id, { distributorId: "dist-sg" }, f.context), "IMMUTABLE_LINK");
  });
  it("rejects new task cross-Distributor owner", () => { const f = fixture(); expectCode(() => addTaskState(f.state, { ...f.task, ownerId: "user-noah" }, f.context), "OWNER_DISTRIBUTOR"); });
  it("rejects new task cross-Distributor relation", () => { const f = fixture(); expectCode(() => addTaskState(f.state, { ...f.task, relationType: "ORGANIZATION", relationId: "org-3" }, f.context), "TASK_RELATION_DISTRIBUTOR"); });
  it("rejects cross-Distributor task edit", () => { const f = fixture(); const state = addTaskState(f.state, f.task, f.context); state.currentUserId = "user-noah"; expectCode(() => updateTaskState(state, state.tasks[0].id, { status: "DONE" }, f.context), "OUT_OF_SCOPE"); });
  it("supports same-Distributor task reassignment", () => { const f = fixture(); const state = addTaskState(f.state, f.task, f.context); expect(updateTaskState(state, state.tasks[0].id, { ownerId: "user-lina" }, f.context).tasks[0].ownerId).toBe("user-lina"); });
  it.each(Object.keys(stageProbability) as DealStage[])("derives %s probability", (stage) => { const f = converted(); expect(updateDealState(f.state, f.record.id, { stage }, f.context).deals[0].probability).toBe(stageProbability[stage]); });
  it.each(["WON", "LOST"] as DealStage[])("locks %s against reopening or switching outcome", (stage) => { const f = converted(); const state = updateDealState(f.state, f.record.id, { stage }, f.context); expectCode(() => updateDealState(state, f.record.id, { stage: "DISCOVERY" }, f.context), "DEAL_TERMINAL"); expectCode(() => updateDealState(state, f.record.id, { stage: stage === "WON" ? "LOST" : "WON" }, f.context), "DEAL_TERMINAL"); });
  it("rejects manual terminal probability on an open Deal", () => { const f = converted(); expectCode(() => updateDealState(f.state, f.record.id, { probability: 100 }, f.context), "PROBABILITY_DERIVED"); });
  it("rejects inherited-object keys as Stage values", () => { const f = converted(); expectCode(() => updateDealState(f.state, f.record.id, { stage: "constructor" as DealStage }, f.context), "STAGE_INVALID"); });
  it("does not block stage writes when an existing referenced catalog item becomes disabled", () => { const f = converted(); f.state.products[0].status = "DISABLED"; expect(updateDealState(f.state, f.record.id, { stage: "SOLUTION" }, f.context).deals[0].probability).toBe(40); });
  it("still rejects newly selected disabled catalog items", () => { const f = converted(); f.state.products[1].status = "DISABLED"; expectCode(() => updateDealState(f.state, f.record.id, { productId: f.state.products[1].id }, f.context), "PRODUCT_INVALID"); });
  it("protects Deal source link against ordinary editing", () => { const f = converted(); expectCode(() => updateDealState(f.state, f.record.id, { sourceLeadId: "other" }, f.context), "IMMUTABLE_LINK"); });
  it("protects auxiliary writes through their target record", () => { const f = fixture(); f.state.currentUserId = "user-noah"; expectCode(() => assertEntityWrite(f.state, "LEAD", f.lead.id), "OUT_OF_SCOPE"); });
  it("does not update duplicate Lead ids across Distributor boundaries", () => { const f = fixture(); f.state.currentUserId = "user-jason"; f.state.leads.push({ ...f.lead, distributorId: "dist-sg" }); const raw = JSON.stringify(f.state); expectCode(() => updateLeadState(f.state, f.lead.id, { name: "Invalid" }, f.context), "LEAD_ID_CONFLICT"); expectCode(() => assertEntityWrite(f.state, "LEAD", f.lead.id), "RECORD_ID_CONFLICT"); expect(JSON.stringify(f.state)).toBe(raw); });
  it("does not update duplicate Deal ids across Distributor boundaries", () => { const f = converted(); f.state.currentUserId = "user-jason"; f.state.deals.push({ ...f.record, distributorId: "dist-sg" }); const raw = JSON.stringify(f.state); expectCode(() => updateDealState(f.state, f.record.id, { stage: "WON" }, f.context), "DEAL_ID_CONFLICT"); expect(JSON.stringify(f.state)).toBe(raw); });
  it("does not update duplicate Task ids across Distributor boundaries", () => { const f = fixture(); const state = addTaskState(f.state, f.task, f.context); state.currentUserId = "user-jason"; state.tasks.push({ ...state.tasks[0], distributorId: "dist-sg" }); const raw = JSON.stringify(state); expectCode(() => updateTaskState(state, state.tasks[0].id, { status: "DONE" }, f.context), "TASK_ID_CONFLICT"); expect(JSON.stringify(state)).toBe(raw); });
  it("loader rejects duplicate primary ids without deduplicating or mutating", () => { const f = fixture(); f.state.contacts.push({ ...f.state.contacts[0] }); const raw = JSON.stringify(f.state); expect(validCrmState(f.state)).toBe(false); expect(JSON.stringify(f.state)).toBe(raw); });
  it("accepts legacy missing creation dates without mutation", () => { const f = fixture(); delete (f.lead as Partial<Lead>).createdAt; expect(validCrmState(f.state)).toBe(true); expect(f.lead.createdAt).toBeUndefined(); });
  it.each(["missing-array", "null-record", "missing-name"])("rejects render-unsafe %s data while leaving it unchanged", (scenario) => { const f = fixture(); if (scenario === "missing-array") delete (f.state as Partial<CrmState>).contacts; if (scenario === "null-record") (f.state.organizations as unknown[])[0] = null; if (scenario === "missing-name") delete (f.state.organizations[0] as Partial<typeof f.state.organizations[0]>).name; const raw = JSON.stringify(f.state); expect(validCrmState(f.state)).toBe(false); expect(JSON.stringify(f.state)).toBe(raw); });
});
