import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Toast } from "@douyinfe/semi-ui";
import { createDemoState } from "@/mock/demo-data";
import { useWorkspaceState } from "@/stores/use-workspace-state";
import { activityFor, addContactState, addLeadState, addOrganizationState, addTaskState, assertEntityWrite, assertHq, assertProductConfiguration, convertLeadState, CrmBusinessError, resolveActor, updateDealState, updateLeadState, updateTaskState, validCrmState, type MutationContext } from "@/stores/crm-model";
import type { Activity, Attachment, CallLog, Contact, CrmState, CrmTask, Deal, DealStage, DemoUser, EmailMessage, InternalComment, Lead, Note, Organization, Product } from "@/types/crm";

export const SALES_STORAGE_KEY = "kivisense-crm-prototype-v1";
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
type Scoped = { distributorId: string };
export interface CrmStore {
  state: CrmState;
  currentUser: DemoUser;
  getCurrentActor: () => DemoUser;
  isHq: boolean;
  canWrite: boolean;
  loading: boolean;
  recoveryIssue: string;
  setCurrentUser: (userId: string) => void;
  scoped: <T extends Scoped>(items: T[], distributorId?: string) => T[];
  addOrganization: (organization: Omit<Organization, "id" | "lastActivityAt">) => Organization;
  addContact: (contact: Omit<Contact, "id" | "lastActivityAt">) => Contact;
  addLead: (lead: Omit<Lead, "id" | "createdAt" | "lastActivityAt">) => Lead;
  updateLead: (leadId: string, patch: Partial<Lead>) => boolean;
  convertLead: (leadId: string, input: Pick<Deal, "name" | "organizationId" | "primaryContactId" | "ownerId" | "productId" | "capabilityIds" | "expectedClose" | "stage">) => Deal;
  updateDeal: (dealId: string, patch: Partial<Deal>, activityDetail?: string) => boolean;
  sendEmail: (message: Omit<EmailMessage, "id" | "sentAt" | "from">) => boolean;
  addComment: (comment: Omit<InternalComment, "id" | "createdAt" | "authorId">) => boolean;
  updateComment: (commentId: string, body: string) => boolean;
  deleteComment: (commentId: string) => boolean;
  addCall: (call: Omit<CallLog, "id" | "actorId">) => boolean;
  addTask: (task: Omit<CrmTask, "id">) => boolean;
  updateTask: (taskId: string, patch: Partial<CrmTask>) => boolean;
  addNote: (note: Omit<Note, "id" | "createdAt" | "authorId">) => boolean;
  updateNote: (noteId: string, patch: Pick<Note, "title" | "body">) => boolean;
  deleteNote: (noteId: string) => boolean;
  addAttachment: (attachment: Omit<Attachment, "id" | "createdAt" | "uploadedBy">) => boolean;
  deleteAttachment: (attachmentId: string) => boolean;
  addProduct: (product: Omit<Product, "id">) => boolean;
  updateProduct: (productId: string, patch: Partial<Product>) => boolean;
  reset: () => boolean;
}
const Context = createContext<CrmStore | null>(null);
function emptyState(): CrmState {
  const demo = createDemoState();
  return { ...demo, organizations: [], contacts: [], leads: [], deals: [], activities: [], emails: [], comments: [], calls: [], tasks: [], notes: [], attachments: [] };
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Sales 操作失败，数据未修改";

export function CrmProvider({ children }: { children: ReactNode }) {
  const { state, stateRef, issue, commit } = useWorkspaceState<CrmState>(SALES_STORAGE_KEY, { version: 1, label: "Sales", initial: createDemoState, empty: emptyState, valid: validCrmState });
  const [loading, setLoading] = useState(true);
  useEffect(() => { const timer = window.setTimeout(() => setLoading(false), 320); return () => window.clearTimeout(timer); }, []);
  const currentUser = state.users.find((user) => user.id === state.currentUserId) || state.users[0];
  const isHq = currentUser.role === "HQ_ADMIN";
  const canWrite = !issue && ["HQ_ADMIN", "DISTRIBUTOR_MANAGER", "DISTRIBUTOR_SALES"].includes(currentUser.role);
  // Persist first and read the live ref on every action: stale UI callbacks cannot
  // bypass an actor change or duplicate the first Convert before a React render.
  const apply = <T,>(mutation: (current: CrmState, context: MutationContext) => { state: CrmState; record: T }, reset = false): T => {
    const current = stateRef.current;
    const result = mutation(current, { now: new Date().toISOString(), id });
    if (result.state !== current || reset) { const saved = commit(result.state, reset); if (!saved.ok) throw new CrmBusinessError("STORAGE_BLOCKED", saved.error); }
    return result.record;
  };
  const write = (mutation: (current: CrmState, context: MutationContext) => CrmState, reset = false) => {
    try { apply((current, context) => ({ state: mutation(current, context), record: true }), reset); return true; }
    catch (error) { Toast.error(errorMessage(error)); return false; }
  };
  const create = <T,>(mutation: (current: CrmState, context: MutationContext) => { state: CrmState; record: T }, message: string): T => {
    try { const record = apply(mutation); Toast.success(message); return record; }
    catch (error) { Toast.error(errorMessage(error)); throw error; }
  };
  const scoped = <T extends Scoped>(items: T[], distributorId?: string) => {
    const actor = stateRef.current.users.find((user) => user.id === stateRef.current.currentUserId);
    if (!actor || !["HQ_ADMIN", "DISTRIBUTOR_MANAGER", "DISTRIBUTOR_SALES", "VIEWER"].includes(actor.role)) return [];
    return actor.role === "HQ_ADMIN" ? (distributorId && distributorId !== "all" ? items.filter((item) => item.distributorId === distributorId) : items) : items.filter((item) => item.distributorId === actor.distributorId);
  };
  const value = useMemo<CrmStore>(() => ({
    state, currentUser, getCurrentActor: () => resolveActor(stateRef.current), isHq, canWrite, loading, recoveryIssue: issue, scoped,
    setCurrentUser: (userId) => { write((current) => { if (!current.users.some((user) => user.id === userId)) throw new CrmBusinessError("ACTOR_MISSING", "演示用户不存在"); return { ...current, currentUserId: userId }; }); },
    addOrganization: (input) => create((current, context) => addOrganizationState(current, input, context), "组织已创建"),
    addContact: (input) => create((current, context) => addContactState(current, input, context), "联系人已创建"),
    addLead: (input) => create((current, context) => addLeadState(current, input, context), "Lead 已创建"),
    updateLead: (leadId, patch) => write((current, context) => updateLeadState(current, leadId, patch, context)),
    convertLead: (leadId, input) => create((current, context) => convertLeadState(current, leadId, input, context), "Lead 已关联 Deal"),
    updateDeal: (dealId, patch, detail) => write((current, context) => updateDealState(current, dealId, patch, context, detail)),
    sendEmail: (input) => write((current, context) => { assertEntityWrite(current, input.entityType, input.entityId); const actor = resolveActor(current); return { ...current, emails: [{ ...input, id: id("email"), sentAt: context.now, from: actor.email }, ...current.emails], activities: [activityFor(current, context, input.entityType, input.entityId, "EMAIL", `${actor.name} sent an email`, input.subject), ...current.activities] }; }),
    addComment: (input) => write((current, context) => { assertEntityWrite(current, input.entityType, input.entityId); return { ...current, comments: [{ ...input, id: id("comment"), createdAt: context.now, authorId: resolveActor(current).id }, ...current.comments], activities: [activityFor(current, context, input.entityType, input.entityId, "COMMENT", "Comment added", input.body), ...current.activities] }; }),
    updateComment: (commentId, body) => write((current) => { const record = current.comments.find((item) => item.id === commentId); if (!record) throw new CrmBusinessError("COMMENT_MISSING", "评论不存在"); assertEntityWrite(current, record.entityType, record.entityId); return { ...current, comments: current.comments.map((item) => item.id === commentId ? { ...item, body } : item) }; }),
    deleteComment: (commentId) => write((current) => { const record = current.comments.find((item) => item.id === commentId); if (!record) throw new CrmBusinessError("COMMENT_MISSING", "评论不存在"); assertEntityWrite(current, record.entityType, record.entityId); return { ...current, comments: current.comments.filter((item) => item.id !== commentId) }; }),
    addCall: (input) => write((current, context) => { const record = assertEntityWrite(current, input.entityType, input.entityId); if (!current.contacts.some((contact) => contact.id === input.contactId && contact.distributorId === record.distributorId)) throw new CrmBusinessError("CONTACT_ORGANIZATION", "通话联系人必须属于记录的分销商"); return { ...current, calls: [{ ...input, id: id("call"), actorId: resolveActor(current).id }, ...current.calls], activities: [activityFor(current, context, input.entityType, input.entityId, "CALL", "Call logged", `${input.direction} · ${input.durationMinutes} min · ${input.summary}`), ...current.activities] }; }),
    addTask: (input) => write((current, context) => addTaskState(current, input, context)),
    updateTask: (taskId, patch) => write((current, context) => updateTaskState(current, taskId, patch, context)),
    addNote: (input) => write((current, context) => { assertEntityWrite(current, input.entityType, input.entityId); return { ...current, notes: [{ ...input, id: id("note"), createdAt: context.now, authorId: resolveActor(current).id }, ...current.notes], activities: [activityFor(current, context, input.entityType, input.entityId, "NOTE", "Note added", input.title), ...current.activities] }; }),
    updateNote: (noteId, patch) => write((current, context) => { const record = current.notes.find((item) => item.id === noteId); if (!record) throw new CrmBusinessError("NOTE_MISSING", "笔记不存在"); assertEntityWrite(current, record.entityType, record.entityId); return { ...current, notes: current.notes.map((item) => item.id === noteId ? { ...item, title: patch.title, body: patch.body } : item), activities: [activityFor(current, context, record.entityType, record.entityId, "NOTE", "Note updated", patch.title), ...current.activities] }; }),
    deleteNote: (noteId) => write((current) => { const record = current.notes.find((item) => item.id === noteId); if (!record) throw new CrmBusinessError("NOTE_MISSING", "笔记不存在"); assertEntityWrite(current, record.entityType, record.entityId); return { ...current, notes: current.notes.filter((item) => item.id !== noteId) }; }),
    addAttachment: (input) => write((current, context) => { assertEntityWrite(current, input.entityType, input.entityId); return { ...current, attachments: [{ ...input, id: id("attachment"), createdAt: context.now, uploadedBy: resolveActor(current).id }, ...current.attachments], activities: [activityFor(current, context, input.entityType, input.entityId, "ATTACHMENT", "Attachment uploaded", input.name), ...current.activities] }; }),
    deleteAttachment: (attachmentId) => write((current) => { const record = current.attachments.find((item) => item.id === attachmentId); if (!record) throw new CrmBusinessError("ATTACHMENT_MISSING", "附件不存在"); assertEntityWrite(current, record.entityType, record.entityId); return { ...current, attachments: current.attachments.filter((item) => item.id !== attachmentId) }; }),
    addProduct: (input) => write((current) => { assertHq(current); assertProductConfiguration(input); return { ...current, products: [{ ...input, id: id("product") }, ...current.products] }; }),
    updateProduct: (productId, patch) => write((current) => { assertHq(current); const record = current.products.find((item) => item.id === productId); if (!record) throw new CrmBusinessError("PRODUCT_MISSING", "产品不存在"); if (Object.prototype.hasOwnProperty.call(patch, "id") && patch.id !== record.id) throw new CrmBusinessError("IMMUTABLE_LINK", "不能修改产品 ID"); const next = { ...record, ...patch }; assertProductConfiguration(next); return { ...current, products: current.products.map((item) => item.id === productId ? next : item) }; }),
    reset: () => { const ok = write((current) => { assertHq(current); return createDemoState(); }, true); if (ok) Toast.success("Sales Demo 数据已重置"); return ok; },
  // Actions intentionally use stateRef; the rendered role only controls presentation.
  }), [state, currentUser, isHq, canWrite, loading, issue]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCrm() { const value = useContext(Context); if (!value) throw new Error("useCrm must be used inside CrmProvider"); return value; }
export const leadStatusLabels: Record<Lead["status"], string> = { NEW: "新线索", CONTACTED: "已联系", NURTURING: "培育中", QUALIFIED: "已确认", CONVERTED: "已转换", UNQUALIFIED: "不合格" };
export const dealStageLabels: Record<DealStage, string> = { DISCOVERY: "需求确认", SOLUTION: "方案阶段", QUOTATION: "报价阶段", NEGOTIATION: "商务推进", WON: "成交", LOST: "丢单" };
