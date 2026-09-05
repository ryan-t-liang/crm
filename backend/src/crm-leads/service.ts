import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuditActorContext } from "../common/audit.js";
import { appendAuditRecord } from "../common/audit.js";
import { assertAssignableCrmUser, crmUserSummarySelect, type CrmDbClient } from "../common/crm-users.js";
import { ApiError } from "../common/errors.js";
import { crmAttachmentSelect } from "./attachments.js";
import type { TimelineListInput } from "../contacts/service.js";
import type { CrmLeadCreateInput, CrmLeadImportInput, CrmLeadPatchInput, LeadFollowupCreateInput } from "./schemas.js";

export type CrmLeadListInput = {
  keyword?: string;
  contactId?: string;
  status?: "NEW" | "QUALIFIED" | "SOLUTION" | "QUOTATION" | "WON" | "LOST";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  salesOwnerUserId?: string;
  followupOwnerUserId?: string;
  nextFollowupFrom?: Date;
  nextFollowupTo?: Date;
  page: number;
  pageSize: number;
  orderBy: "updatedAt_desc" | "updatedAt_asc" | "nextFollowupAt_asc" | "nextFollowupAt_desc" | "lastFollowupAt_asc" | "lastFollowupAt_desc" | "requirementSummary_asc" | "requirementSummary_desc";
};

export const contactSummarySelect = {
  id: true,
  contactName: true,
  companyShortName: true,
  companyName: true,
  department: true,
  title: true,
  email: true,
  phone: true,
  wechat: true,
  linkedin: true,
  website: true,
  industry: true,
  source: true,
  country: true,
  city: true,
  region: true,
  stage: true,
  owner: { select: crmUserSummarySelect },
} satisfies Prisma.ContactSelect;

export const crmLeadListInclude = {
  contact: { select: contactSummarySelect },
  salesOwner: { select: crmUserSummarySelect },
  followupOwner: { select: crmUserSummarySelect },
  _count: { select: { followups: true, participants: true } },
} satisfies Prisma.CrmLeadInclude;

export const crmLeadDetailInclude = {
  ...crmLeadListInclude,
  createdBy: { select: crmUserSummarySelect },
  participants: { select: { user: { select: crmUserSummarySelect } }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.CrmLeadInclude;

async function requireCrmLead(db: CrmDbClient, id: string) {
  const lead = await db.crmLead.findFirst({ where: { id, deletedAt: null } });
  if (!lead) throw new ApiError(404, "RESOURCE_NOT_FOUND", "线索不存在");
  return lead;
}

async function requireContactForLead(db: CrmDbClient, contactId: string): Promise<void> {
  const contact = await db.contact.findFirst({ where: { id: contactId, deletedAt: null }, select: { id: true } });
  if (!contact) {
    throw new ApiError(422, "VALIDATION_ERROR", "请求数据校验失败", [{
      field: "contactId",
      code: "invalid_relation",
      message: "关联的 CRM 联系人不存在",
    }]);
  }
}

function validateQuoteCurrency(estimatedQuote: string | null | undefined, currency: string | null | undefined): void {
  if (estimatedQuote !== null && estimatedQuote !== undefined && !currency) {
    throw new ApiError(422, "VALIDATION_ERROR", "请求数据校验失败", [{
      field: "currency",
      code: "required_with_quote",
      message: "填写预计报价时必须填写币种",
    }]);
  }
}

function leadOrderBy(orderBy: CrmLeadListInput["orderBy"]): Prisma.CrmLeadOrderByWithRelationInput[] {
  const [field, direction] = orderBy.split("_") as ["updatedAt" | "nextFollowupAt" | "lastFollowupAt" | "requirementSummary", "asc" | "desc"];
  return [{ [field]: direction }, { id: direction }];
}

export class CrmLeadService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: CrmLeadListInput) {
    const where: Prisma.CrmLeadWhereInput = {
      deletedAt: null,
      contact: { is: { deletedAt: null } },
      contactId: input.contactId,
      status: input.status,
      priority: input.priority,
      salesOwnerUserId: input.salesOwnerUserId,
      followupOwnerUserId: input.followupOwnerUserId,
      nextFollowupAt: input.nextFollowupFrom || input.nextFollowupTo
        ? { gte: input.nextFollowupFrom, lte: input.nextFollowupTo }
        : undefined,
    };
    if (input.keyword) where.OR = [
      { requirementSummary: { contains: input.keyword } },
      { contact: { is: { contactName: { contains: input.keyword } } } },
      { contact: { is: { companyName: { contains: input.keyword } } } },
      { contact: { is: { companyShortName: { contains: input.keyword } } } },
    ];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.crmLead.count({ where }),
      this.prisma.crmLead.findMany({
        where,
        include: crmLeadListInclude,
        orderBy: leadOrderBy(input.orderBy),
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return { total, rows };
  }

  async listForContact(contactId: string, input: TimelineListInput) {
    const where: Prisma.CrmLeadWhereInput = { contactId, deletedAt: null };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.crmLead.count({ where }),
      this.prisma.crmLead.findMany({
        where,
        include: crmLeadListInclude,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return { total, rows };
  }

  async create(input: CrmLeadCreateInput | CrmLeadImportInput, createdByUserId: string, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const { participantUserIds, ...fields } = input;
      await requireContactForLead(tx, input.contactId);
      await Promise.all([
        assertAssignableCrmUser(tx, input.salesOwnerUserId, "salesOwnerUserId"),
        assertAssignableCrmUser(tx, input.followupOwnerUserId, "followupOwnerUserId"),
        ...participantUserIds.map((userId) => assertAssignableCrmUser(tx, userId, "participantUserIds")),
      ]);
      validateQuoteCurrency(input.estimatedQuote, input.currency);
      const row = await tx.crmLead.create({
        data: {
          ...fields,
          estimatedQuote: input.estimatedQuote == null ? input.estimatedQuote : new Prisma.Decimal(input.estimatedQuote),
          wonAt: input.wonAt ?? (input.status === "WON" ? new Date() : undefined),
          createdByUserId,
          participants: participantUserIds.length ? { create: participantUserIds.map((userId) => ({ userId })) } : undefined,
        },
        include: crmLeadDetailInclude,
      });
      await appendAuditRecord(tx, audit, {
        action: "CREATE_CRM_LEAD",
        module: "crm",
        targetType: "crm_lead",
        targetId: row.id,
        details: { contactId: input.contactId, status: row.status, priority: row.priority, fields: Object.keys(input) },
      });
      return { ...row, attachments: [] };
    });
  }

  async detail(id: string) {
    const [row, attachments] = await Promise.all([
      this.prisma.crmLead.findFirst({ where: { id, deletedAt: null }, include: crmLeadDetailInclude }),
      this.prisma.crmAttachment.findMany({ where: { entityType: "LEAD", entityId: id }, select: crmAttachmentSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    ]);
    if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "线索不存在");
    return { ...row, attachments };
  }

  async update(id: string, input: CrmLeadPatchInput, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await requireCrmLead(tx, id);
      const { participantUserIds, ...fields } = input;
      await Promise.all([
        input.salesOwnerUserId === undefined
          ? Promise.resolve()
          : assertAssignableCrmUser(tx, input.salesOwnerUserId, "salesOwnerUserId"),
        input.followupOwnerUserId === undefined
          ? Promise.resolve()
          : assertAssignableCrmUser(tx, input.followupOwnerUserId, "followupOwnerUserId"),
        ...(participantUserIds ?? []).map((userId) => assertAssignableCrmUser(tx, userId, "participantUserIds")),
      ]);
      const finalQuote = input.estimatedQuote === undefined ? existing.estimatedQuote?.toString() ?? null : input.estimatedQuote;
      const finalCurrency = input.currency === undefined ? existing.currency : input.currency;
      validateQuoteCurrency(finalQuote, finalCurrency);
      const row = await tx.crmLead.update({
        where: { id },
        data: {
          ...fields,
          estimatedQuote: input.estimatedQuote === undefined
            ? undefined
            : input.estimatedQuote === null
              ? null
              : new Prisma.Decimal(input.estimatedQuote),
          wonAt: existing.wonAt
            ? undefined
            : input.wonAt ?? (input.status === "WON" && existing.status !== "WON" ? new Date() : undefined),
          participants: participantUserIds === undefined
            ? undefined
            : { deleteMany: {}, create: participantUserIds.map((userId) => ({ userId })) },
        },
        include: crmLeadDetailInclude,
      });
      await appendAuditRecord(tx, audit, {
        action: "UPDATE_CRM_LEAD",
        module: "crm",
        targetType: "crm_lead",
        targetId: row.id,
        details: {
          changedFields: Object.keys(input),
          ...(input.status === undefined ? {} : { statusChange: { from: existing.status, to: row.status } }),
          ...(input.priority === undefined ? {} : { priorityChange: { from: existing.priority, to: row.priority } }),
        },
      });
      const attachments = await tx.crmAttachment.findMany({ where: { entityType: "LEAD", entityId: id }, select: crmAttachmentSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      return { ...row, attachments };
    });
  }

  async remove(id: string, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.crmLead.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          contactId: true,
          requirementSummary: true,
        },
      });
      if (!lead) throw new ApiError(404, "RESOURCE_NOT_FOUND", "线索不存在");
      const deletedAt = new Date();
      await tx.crmLead.update({ where: { id }, data: { deletedAt, deletedByUserId: audit.actorUserId } });
      await appendAuditRecord(tx, audit, {
        action: "DELETE_LEAD",
        module: "crm",
        targetType: "crm_lead",
        targetId: id,
        details: {
          entityName: lead.requirementSummary,
          entityId: id,
          deletedBy: audit.actorUserId,
          deletedAt: deletedAt.toISOString(),
        },
      });
      return { id };
    });
  }
}

export class LeadFollowupService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(leadId: string, input: TimelineListInput) {
    await requireCrmLead(this.prisma, leadId);
    const where: Prisma.LeadFollowupWhereInput = { leadId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.leadFollowup.count({ where }),
      this.prisma.leadFollowup.findMany({
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
    const attachments = await this.prisma.crmAttachment.findMany({ where: { entityType: "LEAD_FOLLOWUP", entityId: { in: rows.map((row) => row.id) } }, select: crmAttachmentSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return { total, rows: rows.map((row) => ({ ...row, attachments: attachments.filter((item) => item.entityId === row.id) })) };
  }

  async create(leadId: string, input: LeadFollowupCreateInput, createdByUserId: string, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      await requireCrmLead(tx, leadId);
      const ownerUserId = input.ownerUserId ?? createdByUserId;
      await assertAssignableCrmUser(tx, ownerUserId, "ownerUserId");
      const row = await tx.leadFollowup.create({
        data: { ...input, leadId, ownerUserId, createdByUserId },
        include: {
          owner: { select: crmUserSummarySelect },
          createdBy: { select: crmUserSummarySelect },
        },
      });
      const latest = await tx.leadFollowup.findFirst({ where: { leadId }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }], select: { id: true, occurredAt: true } });
      await tx.crmLead.update({
        where: { id: leadId },
        data: {
          lastFollowupAt: latest?.occurredAt ?? null,
          ...(latest?.id === row.id && row.progress ? { latestProgress: row.progress } : {}),
          ...(latest?.id === row.id && row.nextAction ? { nextAction: row.nextAction } : {}),
          ...(latest?.id === row.id && row.nextFollowupAt ? { nextFollowupAt: row.nextFollowupAt } : {}),
        },
      });
      await appendAuditRecord(tx, audit, {
        action: "CREATE_LEAD_FOLLOWUP",
        module: "crm",
        targetType: "lead_followup",
        targetId: row.id,
        details: { leadId, type: row.type, important: row.important, occurredAt: row.occurredAt.toISOString(), ownerUserId },
      });
      return { ...row, attachments: [] };
    });
  }
}
