import type { Activity, Contact, CrmState, CrmTask, Deal, DealStage, DemoUser, Lead, Organization, Product } from "@/types/crm";

export class CrmBusinessError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "CrmBusinessError"; }
}
const fail = (code: string, message: string): never => { throw new CrmBusinessError(code, message); };
function uniqueRecord<T extends { id: string }>(items: T[], recordId: string, label: string): T {
  const matches = items.filter((item) => item.id === recordId);
  if (!matches.length) return fail(`${label}_MISSING`, `${label} 不存在`);
  if (matches.length !== 1) return fail(`${label}_ID_CONFLICT`, `${label} ID 存在冲突，未执行修改`);
  return matches[0];
}
export const ordinaryLeadStatuses: Lead["status"][] = ["NEW", "CONTACTED", "NURTURING", "QUALIFIED", "UNQUALIFIED"];
export const stageProbability: Record<DealStage, number> = { DISCOVERY: 20, SOLUTION: 40, QUOTATION: 60, NEGOTIATION: 75, WON: 100, LOST: 0 };
export const isTerminalDeal = (deal: Pick<Deal, "stage">) => deal.stage === "WON" || deal.stage === "LOST";
export function getAssignableOwnersForDistributor(users: DemoUser[], distributorId: string) {
  return users.filter((user) => user.distributorId === distributorId && users.filter((candidate) => candidate.id === user.id).length === 1 && ["HQ_ADMIN", "DISTRIBUTOR_MANAGER", "DISTRIBUTOR_SALES"].includes(user.role));
}
export function resolveActor(state: CrmState): DemoUser {
  return uniqueRecord(state.users, state.currentUserId, "ACTOR");
}
export function assertWritableDistributor(state: CrmState, distributorId: string) {
  const actor = resolveActor(state);
  if (!state.distributors.some((item) => item.id === distributorId)) fail("DISTRIBUTOR_MISSING", "分销商不存在");
  if (actor.role === "HQ_ADMIN") return actor;
  if (!["DISTRIBUTOR_MANAGER", "DISTRIBUTOR_SALES"].includes(actor.role)) fail("READ_ONLY", "当前角色为只读，禁止写入");
  if (actor.distributorId !== distributorId) fail("OUT_OF_SCOPE", "不能修改其他分销商的数据");
  return actor;
}
export function assertHq(state: CrmState) {
  const actor = resolveActor(state);
  if (actor.role !== "HQ_ADMIN") fail("ADMIN_REQUIRED", "只有 HQ 管理员可以执行此操作");
  return actor;
}
export function assertProductConfiguration(product: Omit<Product, "id">) {
  assertName(product.name);
  if (typeof product.description !== "string" || !["ACTIVE", "DISABLED"].includes(product.status) || !Array.isArray(product.capabilities) || product.capabilities.some((item) => !item || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name.trim() || typeof item.description !== "string" || typeof item.enabled !== "boolean") || new Set(product.capabilities.map((item) => item.id)).size !== product.capabilities.length) fail("PRODUCT_CONFIGURATION", "产品配置无效；名称、状态和 Add-on 字段必须完整");
}
export function assertOwner(state: CrmState, ownerId: string, distributorId: string) {
  if (!getAssignableOwnersForDistributor(state.users, distributorId).some((owner) => owner.id === ownerId)) fail("OWNER_DISTRIBUTOR", "负责人必须属于记录的分销商且具备写入角色");
}
export function entityRecord(state: CrmState, entityType: Activity["entityType"], entityId: string) {
  const pool = entityType === "LEAD" ? state.leads : entityType === "DEAL" ? state.deals : entityType === "CONTACT" ? state.contacts : entityType === "ORGANIZATION" ? state.organizations : [];
  return uniqueRecord<Lead | Deal | Contact | Organization>(pool, entityId, "RECORD");
}
export function assertEntityWrite(state: CrmState, entityType: Activity["entityType"], entityId: string) {
  const record = entityRecord(state, entityType, entityId);
  assertWritableDistributor(state, record.distributorId);
  return record;
}
function assertRelations(state: CrmState, organizationId: string, contactId: string, distributorId: string) {
  const organization = state.organizations.find((item) => item.id === organizationId);
  const contact = state.contacts.find((item) => item.id === contactId);
  if (!organization || organization.distributorId !== distributorId) fail("ORGANIZATION_DISTRIBUTOR", "组织必须属于记录的分销商");
  if (!contact || contact.distributorId !== distributorId || contact.organizationId !== organizationId) fail("CONTACT_ORGANIZATION", "联系人必须属于所选组织和分销商");
}
function assertImmutable<T extends object>(before: T, patch: Partial<T>, keys: (keyof T)[]) {
  for (const key of keys) if (Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== before[key]) fail("IMMUTABLE_LINK", `不能通过普通编辑修改 ${String(key)}`);
}
function assertName(name: string) { if (typeof name !== "string" || !name.trim()) fail("NAME_REQUIRED", "名称不能为空"); }
function assertProduct(state: CrmState, productId: string, capabilityIds: string[], requireActive = true) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return fail("PRODUCT_INVALID", "请选择有效产品");
  if (requireActive && product.status !== "ACTIVE") fail("PRODUCT_INVALID", "请选择有效产品");
  if (!Array.isArray(capabilityIds) || capabilityIds.some((key) => !product.capabilities.some((item) => item.id === key && (!requireActive || item.enabled)))) fail("CAPABILITY_INVALID", "Add-on 必须属于所选产品；新配置必须已启用");
}
export interface MutationContext { now: string; id: (prefix: string) => string }
export function activityFor(state: CrmState, context: MutationContext, entityType: Activity["entityType"], entityId: string, type: Activity["type"], title: string, detail?: string): Activity {
  return { id: context.id("activity"), entityType, entityId, type, title, detail, actorId: resolveActor(state).id, createdAt: context.now };
}
export function addOrganizationState(state: CrmState, input: Omit<Organization, "id" | "lastActivityAt">, context: MutationContext) {
  assertWritableDistributor(state, input.distributorId); assertOwner(state, input.ownerId, input.distributorId); assertName(input.name);
  const organization: Organization = { ...input, id: context.id("org"), lastActivityAt: context.now };
  return { state: { ...state, organizations: [organization, ...state.organizations] }, record: organization };
}
export function addContactState(state: CrmState, input: Omit<Contact, "id" | "lastActivityAt">, context: MutationContext) {
  assertWritableDistributor(state, input.distributorId); assertOwner(state, input.ownerId, input.distributorId); assertName(input.name);
  if (!state.organizations.some((item) => item.id === input.organizationId && item.distributorId === input.distributorId)) fail("ORGANIZATION_DISTRIBUTOR", "联系人组织必须属于相同分销商");
  const contact: Contact = { ...input, id: context.id("contact"), lastActivityAt: context.now };
  return { state: { ...state, contacts: [contact, ...state.contacts] }, record: contact };
}
export function addLeadState(state: CrmState, input: Omit<Lead, "id" | "createdAt" | "lastActivityAt">, context: MutationContext) {
  assertWritableDistributor(state, input.distributorId); assertOwner(state, input.ownerId, input.distributorId); assertName(input.name);
  assertRelations(state, input.organizationId, input.contactId, input.distributorId);
  if (!ordinaryLeadStatuses.includes(input.status) || input.convertedDealId) fail("CONVERT_ACTION_REQUIRED", "CONVERTED 只能通过 Convert to Deal 产生");
  const lead: Lead = { ...input, id: context.id("lead"), createdAt: context.now, lastActivityAt: context.now };
  return { state: { ...state, leads: [lead, ...state.leads], activities: [activityFor(state, context, "LEAD", lead.id, "SYSTEM", "Lead created", `Source: ${lead.source}`), ...state.activities] }, record: lead };
}
export function updateLeadState(state: CrmState, leadId: string, patch: Partial<Lead>, context: MutationContext) {
  const lead = uniqueRecord(state.leads, leadId, "LEAD");
  assertWritableDistributor(state, lead.distributorId);
  assertImmutable(lead, patch, ["id", "distributorId", "convertedDealId", "createdAt"]);
  if (Object.prototype.hasOwnProperty.call(patch, "status") && patch.status !== lead.status && (lead.status === "CONVERTED" || !ordinaryLeadStatuses.includes(patch.status as Lead["status"]))) fail("CONVERT_ACTION_REQUIRED", "已转换 Lead 状态已锁定；CONVERTED 只能通过 Convert to Deal 产生");
  const next = { ...lead, ...patch, lastActivityAt: context.now };
  assertName(next.name); assertOwner(state, next.ownerId, lead.distributorId); assertRelations(state, next.organizationId, next.contactId, lead.distributorId);
  const statusChanged = next.status !== lead.status;
  return { ...state, leads: state.leads.map((item) => item.id === leadId ? next : item), activities: statusChanged ? [activityFor(state, context, "LEAD", leadId, "STATUS_CHANGE", "Lead status changed", `${lead.status} → ${next.status}`), ...state.activities] : state.activities };
}
export type ConvertLeadInput = Pick<Deal, "name" | "organizationId" | "primaryContactId" | "ownerId" | "productId" | "capabilityIds" | "expectedClose" | "stage">;
export function convertLeadState(state: CrmState, leadId: string, input: ConvertLeadInput, context: MutationContext) {
  const lead = state.leads.find((item) => item.id === leadId) || fail("LEAD_MISSING", "Lead 不存在");
  assertWritableDistributor(state, lead.distributorId);
  if (state.leads.filter((item) => item.id === leadId).length !== 1) fail("CONVERT_LINK_CONFLICT", "Lead ID 存在冲突，请核对原始数据");
  const reverse = state.deals.filter((item) => item.sourceLeadId === lead.id);
  if (lead.status === "CONVERTED") {
    const existing = state.deals.find((item) => item.id === lead.convertedDealId);
    if (existing && state.deals.filter((item) => item.id === existing.id).length === 1 && existing.sourceLeadId === lead.id && existing.distributorId === lead.distributorId && reverse.length === 1 && reverse[0].id === existing.id && state.leads.filter((item) => item.convertedDealId === existing.id).length === 1) return { state, record: existing, alreadyConverted: true };
    fail("CONVERT_LINK_CONFLICT", "已转换 Lead 的关联存在冲突，请核对原始数据");
  }
  if (lead.status !== "QUALIFIED") fail("LEAD_NOT_QUALIFIED", "只有 QUALIFIED Lead 可以转换");
  if (lead.convertedDealId || reverse.length) fail("CONVERT_LINK_CONFLICT", "Lead 已存在转换关联，不能创建第二个 Deal");
  assertName(input.name); assertOwner(state, input.ownerId, lead.distributorId); assertRelations(state, input.organizationId, input.primaryContactId, lead.distributorId); assertProduct(state, input.productId, input.capabilityIds);
  if (!["DISCOVERY", "SOLUTION"].includes(input.stage)) fail("INITIAL_STAGE_INVALID", "新 Deal 初始阶段只能是需求确认或方案阶段");
  if (!input.expectedClose || !Number.isFinite(Date.parse(input.expectedClose))) fail("CLOSE_DATE_INVALID", "请选择有效的预计结束日期");
  const deal: Deal = { ...input, id: context.id("deal"), distributorId: lead.distributorId, probability: stageProbability[input.stage], sourceLeadId: lead.id, createdAt: context.now, lastActivityAt: context.now };
  if (state.deals.some((item) => item.id === deal.id)) fail("CONVERT_LINK_CONFLICT", "新 Deal ID 存在冲突，未执行转换");
  return { state: { ...state, leads: state.leads.map((item) => item.id === lead.id ? { ...item, status: "CONVERTED" as const, convertedDealId: deal.id, lastActivityAt: context.now } : item), deals: [deal, ...state.deals], activities: [activityFor(state, context, "LEAD", lead.id, "SYSTEM", "Lead converted to Deal", deal.name), activityFor(state, context, "DEAL", deal.id, "SYSTEM", "Deal created", `Converted from ${lead.name}`), ...state.activities] }, record: deal, alreadyConverted: false };
}
export function updateDealState(state: CrmState, dealId: string, patch: Partial<Deal>, context: MutationContext, activityDetail?: string) {
  const deal = uniqueRecord(state.deals, dealId, "DEAL");
  assertWritableDistributor(state, deal.distributorId); assertImmutable(deal, patch, ["id", "distributorId", "sourceLeadId", "createdAt"]);
  const next = { ...deal, ...patch };
  if (!Object.prototype.hasOwnProperty.call(stageProbability, next.stage)) fail("STAGE_INVALID", "无效 Deal 阶段");
  if (isTerminalDeal(deal) && next.stage !== deal.stage) fail("DEAL_TERMINAL", "已结案 Deal 阶段已锁定；本轮不支持 Reopen");
  if (Object.prototype.hasOwnProperty.call(patch, "probability") && patch.probability !== stageProbability[next.stage]) fail("PROBABILITY_DERIVED", "Probability 由阶段计算，不能单独修改");
  assertName(next.name); assertOwner(state, next.ownerId, deal.distributorId); assertRelations(state, next.organizationId, next.primaryContactId, deal.distributorId); assertProduct(state, next.productId, next.capabilityIds, next.productId !== deal.productId || JSON.stringify(next.capabilityIds) !== JSON.stringify(deal.capabilityIds));
  const changed = next.stage !== deal.stage;
  return { ...state, deals: state.deals.map((item) => item.id === dealId ? { ...next, probability: stageProbability[next.stage], lastActivityAt: context.now } : item), activities: changed ? [activityFor(state, context, "DEAL", dealId, "STAGE_CHANGE", "Stage changed", activityDetail || `${deal.stage} → ${next.stage}`), ...state.activities] : state.activities };
}
function validateTask(state: CrmState, task: Omit<CrmTask, "id">) {
  assertWritableDistributor(state, task.distributorId); assertOwner(state, task.ownerId, task.distributorId); assertName(task.title);
  if (entityRecord(state, task.relationType, task.relationId).distributorId !== task.distributorId) fail("TASK_RELATION_DISTRIBUTOR", "任务关联记录与任务必须属于相同分销商");
  if (!["OPEN", "DONE", "CANCELED"].includes(task.status) || !["LOW", "MEDIUM", "HIGH"].includes(task.priority) || !Number.isFinite(Date.parse(task.dueAt))) fail("TASK_INVALID", "任务状态、优先级或截止时间无效");
}
export function addTaskState(state: CrmState, input: Omit<CrmTask, "id">, context: MutationContext) {
  validateTask(state, input); const task = { ...input, id: context.id("task") };
  return { ...state, tasks: [task, ...state.tasks], activities: [activityFor(state, context, task.relationType, task.relationId, "TASK", "Task created", task.title), ...state.activities] };
}
export function updateTaskState(state: CrmState, taskId: string, patch: Partial<CrmTask>, context: MutationContext) {
  const task = uniqueRecord(state.tasks, taskId, "TASK");
  assertWritableDistributor(state, task.distributorId); assertImmutable(task, patch, ["id", "distributorId"]);
  const next = { ...task, ...patch }; validateTask(state, next);
  return { ...state, tasks: state.tasks.map((item) => item.id === taskId ? next : item), activities: task.status !== next.status ? [activityFor(state, context, task.relationType, task.relationId, "TASK", next.status === "DONE" ? "Task completed" : next.status === "CANCELED" ? "Task canceled" : "Task reopened", task.title), ...state.activities] : state.activities };
}
export function validCrmState(value: unknown): value is CrmState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  const collections = ["distributors", "users", "products", "organizations", "contacts", "leads", "deals", "activities", "emails", "comments", "calls", "tasks", "notes", "attachments"];
  if (state.version !== 1 || typeof state.currentUserId !== "string") return false;
  if (!collections.every((key) => Array.isArray(state[key]) && (state[key] as unknown[]).every((item) => item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string"))) return false;
  if (!collections.every((key) => { const items = state[key] as { id: string }[]; return new Set(items.map((item) => item.id)).size === items.length; })) return false;
  const data = value as CrmState;
  const named = [...data.distributors, ...data.users, ...data.products, ...data.organizations, ...data.contacts, ...data.leads, ...data.deals];
  if (!data.organizations.every((organization) => typeof organization.industry === "string" && typeof organization.country === "string") || !data.contacts.every((contact) => typeof contact.organizationId === "string")) return false;
  if (!data.leads.every((lead) => typeof lead.organizationId === "string" && typeof lead.contactId === "string") || !data.deals.every((deal) => typeof deal.organizationId === "string" && typeof deal.primaryContactId === "string" && typeof deal.productId === "string")) return false;
  return data.users.length > 0 && data.users.some((user) => user.id === data.currentUserId) && named.every((item) => typeof item.name === "string") && data.users.every((user) => typeof user.email === "string" && typeof user.role === "string" && typeof user.distributorId === "string") && data.products.every((product) => Array.isArray(product.capabilities) && product.capabilities.every((capability) => capability && typeof capability.id === "string" && typeof capability.name === "string")) && [...data.organizations, ...data.contacts, ...data.leads, ...data.deals, ...data.tasks].every((item) => typeof item.distributorId === "string" && typeof item.ownerId === "string") && data.leads.every((lead) => typeof lead.status === "string" && Array.isArray(lead.productInterest) && lead.productInterest.every((item) => typeof item === "string")) && data.deals.every((deal) => typeof deal.stage === "string" && Array.isArray(deal.capabilityIds) && deal.capabilityIds.every((item) => typeof item === "string")) && data.tasks.every((task) => typeof task.title === "string" && typeof task.status === "string" && typeof task.dueAt === "string" && typeof task.relationType === "string" && typeof task.relationId === "string") && data.emails.every((email) => typeof email.from === "string" && typeof email.sentAt === "string" && Array.isArray(email.to) && Array.isArray(email.cc) && Array.isArray(email.bcc) && Array.isArray(email.attachmentNames));
}
