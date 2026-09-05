import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditActorContext } from "../common/audit.js";
import { appendAuditRecord } from "../common/audit.js";
import { assertAssignableCrmUser, crmUserSummarySelect, type CrmDbClient } from "../common/crm-users.js";
import { ApiError } from "../common/errors.js";
import { crmAttachmentSelect } from "../crm-leads/attachments.js";
import type { ContactCreateInput, ContactFollowupCreateInput, ContactImportInput, ContactPatchInput } from "./schemas.js";

export type ContactListInput = {
  keyword?: string;
  stage?: "INITIAL" | "ONE_TO_ONE" | "SOLUTION" | "CONVENTION";
  ownerUserId?: string;
  nextFollowupFrom?: Date;
  nextFollowupTo?: Date;
  page: number;
  pageSize: number;
  orderBy: "updatedAt_desc" | "updatedAt_asc" | "contactName_asc" | "contactName_desc" | "nextFollowupAt_asc" | "nextFollowupAt_desc";
};

export type TimelineListInput = { page: number; pageSize: number };

export const contactListInclude = {
  owner: { select: crmUserSummarySelect },
  organization: { include: { roles: true } },
  _count: { select: { leads: { where: { deletedAt: null } } } },
} satisfies Prisma.ContactInclude;

export const contactDetailInclude = {
  ...contactListInclude,
  createdBy: { select: crmUserSummarySelect },
} satisfies Prisma.ContactInclude;

async function requireContact(db: CrmDbClient, id: string) {
  const contact = await db.contact.findFirst({ where: { id, deletedAt: null } });
  if (!contact) throw new ApiError(404, "RESOURCE_NOT_FOUND", "CRM 联系人不存在");
  return contact;
}

async function organizationSnapshot(db: CrmDbClient, organizationId: string | null | undefined) {
  if (!organizationId) return null;
  const organization = await db.organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true, name: true, shortName: true, website: true, industry: true, country: true, region: true, city: true } });
  if (!organization) throw new ApiError(422, "INVALID_ORGANIZATION", "关联公司不存在");
  return {
    organizationId: organization.id,
    companyName: organization.name,
    companyShortName: organization.shortName,
    website: organization.website,
    industry: organization.industry,
    country: organization.country,
    region: organization.region,
    city: organization.city,
  };
}

function contactOrderBy(orderBy: ContactListInput["orderBy"]): Prisma.ContactOrderByWithRelationInput[] {
  const [field, direction] = orderBy.split("_") as ["updatedAt" | "contactName" | "nextFollowupAt", "asc" | "desc"];
  return [{ [field]: direction }, { id: direction }];
}

export class ContactService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: ContactListInput) {
    const where: Prisma.ContactWhereInput = {
      deletedAt: null,
      stage: input.stage,
      ownerUserId: input.ownerUserId,
      nextFollowupAt: input.nextFollowupFrom || input.nextFollowupTo
        ? { gte: input.nextFollowupFrom, lte: input.nextFollowupTo }
        : undefined,
    };
    if (input.keyword) where.OR = [
      { contactName: { contains: input.keyword } },
      { companyName: { contains: input.keyword } },
      { companyShortName: { contains: input.keyword } },
      { organization: { is: { OR: [
        { name: { contains: input.keyword } },
        { shortName: { contains: input.keyword } },
      ] } } },
      { email: { contains: input.keyword } },
      { phone: { contains: input.keyword } },
    ];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contact.count({ where }),
      this.prisma.contact.findMany({
        where,
        include: contactListInclude,
        orderBy: contactOrderBy(input.orderBy),
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return { total, rows };
  }

  async create(input: ContactCreateInput | ContactImportInput, createdByUserId: string, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      await assertAssignableCrmUser(tx, input.ownerUserId, "ownerUserId");
      const organizationFields = await organizationSnapshot(tx, input.organizationId);
      const row = await tx.contact.create({
        data: { ...input, ...(organizationFields || {}), createdByUserId },
        include: contactDetailInclude,
      });
      await appendAuditRecord(tx, audit, {
        action: "CREATE_CONTACT",
        module: "crm",
        targetType: "contact",
        targetId: row.id,
        details: { fields: Object.keys(input) },
      });
      return { ...row, attachments: [] };
    });
  }

  async detail(id: string) {
    const [row, attachments] = await Promise.all([
      this.prisma.contact.findFirst({ where: { id, deletedAt: null }, include: contactDetailInclude }),
      this.prisma.crmAttachment.findMany({ where: { entityType: "CONTACT", entityId: id }, select: crmAttachmentSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    ]);
    if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "CRM 联系人不存在");
    return { ...row, attachments };
  }

  async update(id: string, input: ContactPatchInput, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await requireContact(tx, id);
      if (input.ownerUserId !== undefined) await assertAssignableCrmUser(tx, input.ownerUserId, "ownerUserId");
      const linkedOrganizationId = input.organizationId === undefined ? existing.organizationId : input.organizationId;
      if (linkedOrganizationId && ["companyName", "companyShortName", "website", "industry", "country", "region", "city"].some((field) => field in input)) {
        throw new ApiError(422, "ORGANIZATION_SOURCE_OF_TRUTH", "联系人已关联公司，公司资料请在公司档案中维护");
      }
      const organizationFields = input.organizationId === undefined ? null : await organizationSnapshot(tx, input.organizationId);
      const row = await tx.contact.update({ where: { id }, data: { ...input, ...(organizationFields || {}) }, include: contactDetailInclude });
      await appendAuditRecord(tx, audit, {
        action: "UPDATE_CONTACT",
        module: "crm",
        targetType: "contact",
        targetId: row.id,
        details: { changedFields: Object.keys(input) },
      });
      const attachments = await tx.crmAttachment.findMany({ where: { entityType: "CONTACT", entityId: id }, select: crmAttachmentSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      return { ...row, attachments };
    });
  }

  async remove(id: string, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const contact = await tx.contact.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, contactName: true, _count: { select: { leads: { where: { deletedAt: null } } } } },
      });
      if (!contact) throw new ApiError(404, "RESOURCE_NOT_FOUND", "CRM 联系人不存在");
      if (contact._count.leads > 0) {
        throw new ApiError(409, "CONTACT_HAS_ACTIVE_LEADS", `该联系人仍有 ${contact._count.leads} 条未删除线索，请先删除这些线索后再删除联系人`, {
          relatedLeadCount: contact._count.leads,
        });
      }
      const deletedAt = new Date();
      await tx.contact.update({ where: { id }, data: { deletedAt, deletedByUserId: audit.actorUserId } });
      await appendAuditRecord(tx, audit, {
        action: "DELETE_CONTACT",
        module: "crm",
        targetType: "contact",
        targetId: id,
        details: {
          entityName: contact.contactName,
          entityId: id,
          deletedBy: audit.actorUserId,
          deletedAt: deletedAt.toISOString(),
        },
      });
      return { id };
    });
  }

  async require(id: string): Promise<void> {
    await requireContact(this.prisma, id);
  }

  async journey(id: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, deletedAt: null }, select: { id: true, contactName: true, createdAt: true, createdBy: { select: crmUserSummarySelect }, nextFollowupAt: true } });
    if (!contact) throw new ApiError(404, "RESOURCE_NOT_FOUND", "CRM 联系人不存在");
    const leads = await this.prisma.crmLead.findMany({
      where: { contactId: id },
      select: { id: true, requirementSummary: true, status: true, createdAt: true, updatedAt: true, wonAt: true, nextFollowupAt: true, deletedAt: true, createdBy: { select: crmUserSummarySelect } },
    });
    const leadIds = leads.map((lead) => lead.id);
    const [contactFollowups, leadFollowups, attachments, statusAudits] = await Promise.all([
      this.prisma.contactFollowup.findMany({ where: { contactId: id }, include: { owner: { select: crmUserSummarySelect }, createdBy: { select: crmUserSummarySelect } } }),
      this.prisma.leadFollowup.findMany({ where: { leadId: { in: leadIds } }, include: { owner: { select: crmUserSummarySelect }, createdBy: { select: crmUserSummarySelect } } }),
      this.prisma.crmAttachment.findMany({ where: { OR: [
        { entityType: "CONTACT", entityId: id },
        { entityType: "LEAD", entityId: { in: leadIds } },
      ] }, select: crmAttachmentSelect }),
      this.prisma.auditLog.findMany({ where: { targetType: "crm_lead", targetId: { in: leadIds }, action: "UPDATE_CRM_LEAD" }, orderBy: { createdAt: "asc" } }),
    ]);
    const contactFollowupIds = contactFollowups.map((item) => item.id);
    const leadFollowupIds = leadFollowups.map((item) => item.id);
    const followupAttachments = await this.prisma.crmAttachment.findMany({ where: { OR: [
      { entityType: "CONTACT_FOLLOWUP", entityId: { in: contactFollowupIds } },
      { entityType: "LEAD_FOLLOWUP", entityId: { in: leadFollowupIds } },
    ] }, select: crmAttachmentSelect });
    const allAttachments = [...attachments, ...followupAttachments];
    const filesFor = (entityType: "CONTACT" | "CONTACT_FOLLOWUP" | "LEAD" | "LEAD_FOLLOWUP", entityId: string) => allAttachments.filter((item) => item.entityType === entityType && item.entityId === entityId);
    const leadById = new Map(leads.map((lead) => [lead.id, lead]));
    const events: Array<Record<string, unknown> & { occurredAt: Date; category: "INTERACTION" | "LEAD" | "MILESTONE" }> = [{
      id: `contact-created-${id}`, occurredAt: contact.createdAt, category: "MILESTONE", type: "CONTACT_CREATED", title: "创建联系人", summary: `建立 ${contact.contactName} 的客户档案`, actor: contact.createdBy, relatedLead: null, attachments: [],
    }];
    for (const item of contactFollowups) events.push({
      id: `contact-followup-${item.id}`, occurredAt: item.occurredAt, category: "INTERACTION", type: "CONTACT_FOLLOWUP", title: "客户互动", summary: item.content, actor: item.owner, relatedLead: null, attachments: filesFor("CONTACT_FOLLOWUP", item.id), nextFollowupAt: item.nextFollowupAt,
    });
    for (const lead of leads) events.push({
      id: `lead-created-${lead.id}`, occurredAt: lead.createdAt, category: "LEAD", type: "LEAD_CREATED", title: "创建线索", summary: lead.requirementSummary, actor: lead.createdBy, relatedLead: { id: lead.id, requirementSummary: lead.requirementSummary, deleted: Boolean(lead.deletedAt) }, attachments: filesFor("LEAD", lead.id),
    });
    for (const item of leadFollowups) {
      const lead = leadById.get(item.leadId)!;
      events.push({ id: `lead-followup-${item.id}`, occurredAt: item.occurredAt, category: "INTERACTION", type: "LEAD_FOLLOWUP", title: "线索跟进", summary: item.content, progress: item.progress, nextAction: item.nextAction, actor: item.owner, relatedLead: { id: lead.id, requirementSummary: lead.requirementSummary, deleted: Boolean(lead.deletedAt) }, attachments: filesFor("LEAD_FOLLOWUP", item.id), nextFollowupAt: item.nextFollowupAt });
    }
    for (const audit of statusAudits) {
      const details = audit.details as { statusChange?: { from?: string; to?: string } } | null;
      const change = details?.statusChange;
      const lead = audit.targetId ? leadById.get(audit.targetId) : undefined;
      if (!change?.to || !lead || change.from === change.to) continue;
      const milestone = ["WON", "LOST"].includes(change.to);
      events.push({ id: `lead-status-${audit.id}`, occurredAt: audit.createdAt, category: milestone ? "MILESTONE" : "LEAD", type: milestone ? `LEAD_${change.to}` : "LEAD_STAGE_CHANGED", title: milestone ? (change.to === "WON" ? "线索成交" : "线索丢失") : "线索阶段变更", summary: `${change.from || "-"} → ${change.to}`, actor: { id: audit.actorUserId, name: audit.actorName }, relatedLead: { id: lead.id, requirementSummary: lead.requirementSummary, deleted: Boolean(lead.deletedAt) }, attachments: [] });
    }
    const terminalAuditKeys = new Set(statusAudits.flatMap((audit) => {
      const details = audit.details as { statusChange?: { to?: string } } | null;
      return audit.targetId && details?.statusChange?.to ? [`${audit.targetId}:${details.statusChange.to}`] : [];
    }));
    for (const lead of leads.filter((item) => ["WON", "LOST"].includes(item.status) && !terminalAuditKeys.has(`${item.id}:${item.status}`))) {
      events.push({ id: `lead-terminal-${lead.id}`, occurredAt: lead.wonAt ?? lead.updatedAt, category: "MILESTONE", type: `LEAD_${lead.status}`, title: lead.status === "WON" ? "线索成交" : "线索丢失", summary: lead.requirementSummary, actor: lead.createdBy, relatedLead: { id: lead.id, requirementSummary: lead.requirementSummary, deleted: Boolean(lead.deletedAt) }, attachments: [] });
    }
    const legacyFiles = filesFor("CONTACT", id).filter((item) => item.fieldKey === "meetingMinutesFiles");
    const firstLegacyFile = legacyFiles[0];
    if (firstLegacyFile) events.push({ id: `legacy-meeting-files-${id}`, occurredAt: legacyFiles.reduce((latest, item) => item.createdAt > latest ? item.createdAt : latest, firstLegacyFile.createdAt), category: "INTERACTION", type: "LEGACY_MEETING_FILES", title: "历史会议资料", summary: "历史会议资料，未关联具体互动", actor: firstLegacyFile.uploadedBy, relatedLead: null, attachments: legacyFiles });
    events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || String(b.id).localeCompare(String(a.id)));
    const latestInteraction = events.find((item) => item.category === "INTERACTION") ?? null;
    const activeLeads = leads.filter((item) => !item.deletedAt && !["WON", "LOST"].includes(item.status));
    const activeLeadCount = activeLeads.length;
    const wonLeadCount = leads.filter((item) => !item.deletedAt && item.status === "WON").length;
    const followupDates = [contact.nextFollowupAt, ...activeLeads.map((item) => item.nextFollowupAt)].filter((value): value is Date => Boolean(value));
    const nextFollowupAt = followupDates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return { summary: { activeLeadCount, wonLeadCount, recentInteractionAt: latestInteraction?.occurredAt ?? null, nextFollowupAt }, events };
  }
}

export class ContactFollowupService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(contactId: string, input: TimelineListInput) {
    await requireContact(this.prisma, contactId);
    const where: Prisma.ContactFollowupWhereInput = { contactId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contactFollowup.count({ where }),
      this.prisma.contactFollowup.findMany({
        where,
        include: {
          owner: { select: crmUserSummarySelect },
          createdBy: { select: crmUserSummarySelect },
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    const attachments = await this.prisma.crmAttachment.findMany({ where: { entityType: "CONTACT_FOLLOWUP", entityId: { in: rows.map((row) => row.id) } }, select: crmAttachmentSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return { total, rows: rows.map((row) => ({ ...row, attachments: attachments.filter((item) => item.entityId === row.id) })) };
  }

  async create(contactId: string, input: ContactFollowupCreateInput, createdByUserId: string, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const contact = await requireContact(tx, contactId);
      const ownerUserId = input.ownerUserId ?? createdByUserId;
      await assertAssignableCrmUser(tx, ownerUserId, "ownerUserId");
      const { currentTaskId, ...followupInput } = input;
      if (currentTaskId) {
        const currentTask = await tx.crmTask.findFirst({ where: { id: currentTaskId, status: "OPEN", ownerUserId: createdByUserId } });
        if (!currentTask) throw new ApiError(422, "INVALID_CURRENT_TASK", "当前任务不存在、已关闭或不属于当前用户");
        await tx.crmTask.update({ where: { id: currentTaskId }, data: { status: "DONE", completedAt: new Date(), completedByUserId: createdByUserId } });
      }
      const row = await tx.contactFollowup.create({
        data: { ...followupInput, contactId, ownerUserId, createdByUserId },
        include: {
          owner: { select: crmUserSummarySelect },
          createdBy: { select: crmUserSummarySelect },
        },
      });
      const latest = await tx.contactFollowup.findFirst({ where: { contactId }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }], select: { id: true } });
      if (latest?.id === row.id && row.nextFollowupAt) {
        await tx.contact.update({ where: { id: contactId }, data: { nextFollowupAt: row.nextFollowupAt } });
      }
      if (row.nextAction && row.nextFollowupAt) {
        await tx.crmTask.create({ data: { organizationId: contact.organizationId, contactId, title: row.nextAction.slice(0, 300), description: row.content, ownerUserId, dueAt: row.nextFollowupAt, source: "FOLLOWUP", createdByUserId } });
      }
      await appendAuditRecord(tx, audit, {
        action: "CREATE_CONTACT_FOLLOWUP",
        module: "crm",
        targetType: "contact_followup",
        targetId: row.id,
        details: { contactId, type: row.type, occurredAt: row.occurredAt.toISOString(), ownerUserId, currentTaskId, nextTaskCreated: Boolean(row.nextAction && row.nextFollowupAt) },
      });
      return { ...row, attachments: [] };
    });
  }
}
