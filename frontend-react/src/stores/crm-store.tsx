import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Toast } from "@douyinfe/semi-ui";
import { createDemoState } from "@/mock/demo-data";
import type { Activity, Attachment, CallLog, Contact, CrmState, CrmTask, Deal, DealStage, EmailMessage, InternalComment, Lead, Note, Organization, Product } from "@/types/crm";

const STORAGE_KEY = "kivisense-crm-prototype-v1";
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();

type Scoped = { distributorId: string };

interface CrmStore {
  state: CrmState;
  currentUser: CrmState["users"][number];
  isHq: boolean;
  loading: boolean;
  setCurrentUser: (userId: string) => void;
  scoped: <T extends Scoped>(items: T[], distributorId?: string) => T[];
  addOrganization: (organization: Omit<Organization, "id" | "lastActivityAt">) => Organization;
  addContact: (contact: Omit<Contact, "id" | "lastActivityAt">) => Contact;
  addLead: (lead: Omit<Lead, "id" | "createdAt" | "lastActivityAt">) => Lead;
  updateLead: (leadId: string, patch: Partial<Lead>) => void;
  convertLead: (leadId: string, input: Pick<Deal, "name" | "organizationId" | "primaryContactId" | "ownerId" | "productId" | "capabilityIds" | "expectedClose" | "stage">) => Deal;
  updateDeal: (dealId: string, patch: Partial<Deal>, activityDetail?: string) => void;
  sendEmail: (message: Omit<EmailMessage, "id" | "sentAt" | "from">) => void;
  addComment: (comment: Omit<InternalComment, "id" | "createdAt" | "authorId">) => void;
  updateComment: (commentId: string, body: string) => void;
  deleteComment: (commentId: string) => void;
  addCall: (call: Omit<CallLog, "id" | "actorId">) => void;
  addTask: (task: Omit<CrmTask, "id">) => void;
  updateTask: (taskId: string, patch: Partial<CrmTask>) => void;
  addNote: (note: Omit<Note, "id" | "createdAt" | "authorId">) => void;
  updateNote: (noteId: string, patch: Pick<Note, "title" | "body">) => void;
  deleteNote: (noteId: string) => void;
  addAttachment: (attachment: Omit<Attachment, "id" | "createdAt" | "uploadedBy">) => void;
  deleteAttachment: (attachmentId: string) => void;
  addProduct: (product: Omit<Product, "id">) => void;
  updateProduct: (productId: string, patch: Partial<Product>) => void;
  reset: () => void;
}

const Context = createContext<CrmStore | null>(null);

function loadInitial(): CrmState {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value) {
      const parsed = JSON.parse(value) as CrmState;
      if (parsed.version === 1) return parsed;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return createDemoState();
}

export function CrmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CrmState>(loadInitial);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 320);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state]);

  const currentUser = state.users.find((user) => user.id === state.currentUserId) || state.users[0];
  const isHq = currentUser.role === "HQ_ADMIN";
  const actorActivity = (entityType: Activity["entityType"], entityId: string, type: Activity["type"], title: string, detail?: string): Activity => ({ id: id("activity"), entityType, entityId, type, actorId: currentUser.id, title, detail, createdAt: now() });
  const scoped = <T extends Scoped>(items: T[], distributorId?: string) => isHq ? (distributorId && distributorId !== "all" ? items.filter((item) => item.distributorId === distributorId) : items) : items.filter((item) => item.distributorId === currentUser.distributorId);

  const value = useMemo<CrmStore>(() => ({
    state, currentUser, isHq, loading,
    setCurrentUser: (userId) => setState((current) => ({ ...current, currentUserId: userId })),
    scoped,
    addOrganization: (input) => {
      const organization: Organization = { ...input, id: id("org"), lastActivityAt: now() };
      setState((current) => ({ ...current, organizations: [organization, ...current.organizations] })); Toast.success("组织已创建"); return organization;
    },
    addContact: (input) => {
      const contact: Contact = { ...input, id: id("contact"), lastActivityAt: now() };
      setState((current) => ({ ...current, contacts: [contact, ...current.contacts] })); Toast.success("联系人已创建"); return contact;
    },
    addLead: (input) => {
      const lead: Lead = { ...input, id: id("lead"), createdAt: now(), lastActivityAt: now() };
      setState((current) => ({ ...current, leads: [lead, ...current.leads], activities: [actorActivity("LEAD", lead.id, "SYSTEM", "Lead created", `Source: ${lead.source}`), ...current.activities] }));
      Toast.success("Lead 已创建");
      return lead;
    },
    updateLead: (leadId, patch) => setState((current) => {
      const before = current.leads.find((lead) => lead.id === leadId);
      const statusChanged = patch.status && patch.status !== before?.status;
      return { ...current, leads: current.leads.map((lead) => lead.id === leadId ? { ...lead, ...patch, lastActivityAt: now() } : lead), activities: statusChanged ? [actorActivity("LEAD", leadId, "STATUS_CHANGE", "Lead status changed", `${before?.status} → ${patch.status}`), ...current.activities] : current.activities };
    }),
    convertLead: (leadId, input) => {
      const lead = state.leads.find((item) => item.id === leadId)!;
      const deal: Deal = { ...input, id: id("deal"), distributorId: lead.distributorId, probability: input.stage === "DISCOVERY" ? 20 : 40, sourceLeadId: leadId, createdAt: now(), lastActivityAt: now() };
      setState((current) => ({ ...current, leads: current.leads.map((item) => item.id === leadId ? { ...item, status: "CONVERTED", convertedDealId: deal.id, lastActivityAt: now() } : item), deals: [deal, ...current.deals], activities: [actorActivity("LEAD", leadId, "SYSTEM", "Lead converted to Deal", deal.name), actorActivity("DEAL", deal.id, "SYSTEM", "Deal created", `Converted from ${lead.name}`), ...current.activities] }));
      Toast.success("Lead 已转为 Deal");
      return deal;
    },
    updateDeal: (dealId, patch, activityDetail) => setState((current) => {
      const before = current.deals.find((deal) => deal.id === dealId);
      const changed = patch.stage && patch.stage !== before?.stage;
      return { ...current, deals: current.deals.map((deal) => deal.id === dealId ? { ...deal, ...patch, probability: patch.stage === "WON" ? 100 : patch.stage === "LOST" ? 0 : deal.probability, lastActivityAt: now() } : deal), activities: changed ? [actorActivity("DEAL", dealId, "STAGE_CHANGE", "Stage changed", activityDetail || `${before?.stage} → ${patch.stage}`), ...current.activities] : current.activities };
    }),
    sendEmail: (message) => setState((current) => ({ ...current, emails: [{ ...message, id: id("email"), sentAt: now(), from: currentUser.email }, ...current.emails], activities: [actorActivity(message.entityType, message.entityId, "EMAIL", `${currentUser.name} sent an email`, message.subject), ...current.activities] })),
    addComment: (comment) => setState((current) => ({ ...current, comments: [{ ...comment, id: id("comment"), createdAt: now(), authorId: currentUser.id }, ...current.comments], activities: [actorActivity(comment.entityType, comment.entityId, "COMMENT", `${currentUser.name} added a comment`, comment.body), ...current.activities] })),
    updateComment: (commentId, body) => setState((current) => ({ ...current, comments: current.comments.map((comment) => comment.id === commentId ? { ...comment, body } : comment) })),
    deleteComment: (commentId) => setState((current) => ({ ...current, comments: current.comments.filter((comment) => comment.id !== commentId) })),
    addCall: (call) => setState((current) => ({ ...current, calls: [{ ...call, id: id("call"), actorId: currentUser.id }, ...current.calls], activities: [actorActivity(call.entityType, call.entityId, "CALL", "Call logged", `${call.direction} · ${call.durationMinutes} min · ${call.summary}`), ...current.activities] })),
    addTask: (task) => setState((current) => ({ ...current, tasks: [{ ...task, id: id("task") }, ...current.tasks], activities: task.relationType === "LEAD" || task.relationType === "DEAL" ? [actorActivity(task.relationType, task.relationId, "TASK", "Task created", task.title), ...current.activities] : current.activities })),
    updateTask: (taskId, patch) => setState((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      const statusChanged = task && patch.status && patch.status !== task.status;
      const activity = statusChanged
        ? actorActivity(task.relationType, task.relationId, "TASK", patch.status === "DONE" ? "Task completed" : patch.status === "CANCELED" ? "Task canceled" : "Task reopened", task.title)
        : null;
      return { ...current, tasks: current.tasks.map((item) => item.id === taskId ? { ...item, ...patch } : item), activities: activity ? [activity, ...current.activities] : current.activities };
    }),
    addNote: (note) => setState((current) => ({ ...current, notes: [{ ...note, id: id("note"), createdAt: now(), authorId: currentUser.id }, ...current.notes], activities: [actorActivity(note.entityType, note.entityId, "NOTE", "Note added", note.title), ...current.activities] })),
    updateNote: (noteId, patch) => setState((current) => {
      const note = current.notes.find((item) => item.id === noteId);
      return { ...current, notes: current.notes.map((item) => item.id === noteId ? { ...item, ...patch } : item), activities: note ? [actorActivity(note.entityType, note.entityId, "NOTE", "Note updated", patch.title), ...current.activities] : current.activities };
    }),
    deleteNote: (noteId) => setState((current) => ({ ...current, notes: current.notes.filter((note) => note.id !== noteId) })),
    addAttachment: (attachment) => setState((current) => ({ ...current, attachments: [{ ...attachment, id: id("attachment"), createdAt: now(), uploadedBy: currentUser.id }, ...current.attachments], activities: [actorActivity(attachment.entityType, attachment.entityId, "ATTACHMENT", "Attachment uploaded", attachment.name), ...current.activities] })),
    deleteAttachment: (attachmentId) => setState((current) => ({ ...current, attachments: current.attachments.filter((attachment) => attachment.id !== attachmentId) })),
    addProduct: (product) => setState((current) => ({ ...current, products: [{ ...product, id: id("product") }, ...current.products] })),
    updateProduct: (productId, patch) => setState((current) => ({ ...current, products: current.products.map((product) => product.id === productId ? { ...product, ...patch } : product) })),
    reset: () => { localStorage.removeItem(STORAGE_KEY); setState(createDemoState()); Toast.success("Demo 数据已重置"); },
  // scoped and actorActivity intentionally use the active role and user.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state, currentUser, isHq, loading]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCrm() {
  const value = useContext(Context);
  if (!value) throw new Error("useCrm must be used inside CrmProvider");
  return value;
}

export const leadStatusLabels: Record<Lead["status"], string> = { NEW: "新线索", CONTACTED: "已联系", NURTURING: "培育中", QUALIFIED: "已确认", CONVERTED: "已转换", UNQUALIFIED: "不合格" };
export const dealStageLabels: Record<DealStage, string> = { DISCOVERY: "需求确认", SOLUTION: "方案阶段", QUOTATION: "报价阶段", NEGOTIATION: "商务推进", WON: "成交", LOST: "丢单" };
