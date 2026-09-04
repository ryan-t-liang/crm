import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuditActorContext } from "../common/audit.js";
import { appendAuditRecord } from "../common/audit.js";
import { assertAssignableCrmUser, crmUserSummarySelect, type CrmDbClient } from "../common/crm-users.js";
import { ApiError } from "../common/errors.js";
import type { TimelineListInput } from "../contacts/service.js";
import type { CrmLeadCreateInput, CrmLeadPatchInput, LeadFollowupCreateInput } from "./schemas.js";

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
  _count: { select: { followups: true, attachments: true } },
} satisfies Prisma.CrmLeadInclude;

export const crmLeadDetailInclude = {
  ...crmLeadListInclude,
  createdBy: { select: crmUserSummarySelect },
  attachments: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      kind: true,
      sizeBytes: true,
      createdAt: true,
      uploadedBy: { select: crmUserSummarySelect },
    },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
  },
} satisfies Prisma.CrmLeadInclude;

async function requireCrmLead(db: CrmDbClient, id: string) {
  const lead = await db.crmLead.findUnique({ where: { id } });
  if (!lead) throw new ApiError(404, "RESOURCE_NOT_FOUND", "线索不存在");
  return lead;
}

async function requireContactForLead(db: CrmDbClient, contactId: string): Promise<void> {
  const contact = await db.contact.findUnique({ where: { id: contactId }, select: { id: true } });
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
    const where: Prisma.CrmLeadWhereInput = { contactId };
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

  async create(input: CrmLeadCreateInput, createdByUserId: string, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      await requireContactForLead(tx, input.contactId);
      await Promise.all([
        assertAssignableCrmUser(tx, input.salesOwnerUserId, "salesOwnerUserId"),
        assertAssignableCrmUser(tx, input.followupOwnerUserId, "followupOwnerUserId"),
      ]);
      validateQuoteCurrency(input.estimatedQuote, input.currency);
      const row = await tx.crmLead.create({
        data: {
          ...input,
          estimatedQuote: input.estimatedQuote == null ? input.estimatedQuote : new Prisma.Decimal(input.estimatedQuote),
          createdByUserId,
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
      return row;
    });
  }

  async detail(id: string) {
    const row = await this.prisma.crmLead.findUnique({ where: { id }, include: crmLeadDetailInclude });
    if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "线索不存在");
    return row;
  }

  async update(id: string, input: CrmLeadPatchInput, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await requireCrmLead(tx, id);
      await Promise.all([
        input.salesOwnerUserId === undefined
          ? Promise.resolve()
          : assertAssignableCrmUser(tx, input.salesOwnerUserId, "salesOwnerUserId"),
        input.followupOwnerUserId === undefined
          ? Promise.resolve()
          : assertAssignableCrmUser(tx, input.followupOwnerUserId, "followupOwnerUserId"),
      ]);
      const finalQuote = input.estimatedQuote === undefined ? existing.estimatedQuote?.toString() ?? null : input.estimatedQuote;
      const finalCurrency = input.currency === undefined ? existing.currency : input.currency;
      validateQuoteCurrency(finalQuote, finalCurrency);
      const row = await tx.crmLead.update({
        where: { id },
        data: {
          ...input,
          estimatedQuote: input.estimatedQuote === undefined
            ? undefined
            : input.estimatedQuote === null
              ? null
              : new Prisma.Decimal(input.estimatedQuote),
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
      return row;
    });
  }

  async remove(id: string, audit: AuditActorContext) {
    const result = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.crmLead.findUnique({
        where: { id },
        select: {
          id: true,
          contactId: true,
          requirementSummary: true,
          attachments: { select: { storagePath: true } },
          _count: { select: { followups: true, attachments: true } },
        },
      });
      if (!lead) throw new ApiError(404, "RESOURCE_NOT_FOUND", "线索不存在");
      await tx.crmLead.delete({ where: { id } });
      await appendAuditRecord(tx, audit, {
        action: "DELETE_CRM_LEAD",
        module: "crm",
        targetType: "crm_lead",
        targetId: id,
        details: {
          contactId: lead.contactId,
          requirementSummary: lead.requirementSummary,
          deletedFollowupCount: lead._count.followups,
          deletedAttachmentCount: lead._count.attachments,
        },
      });
      return { id, storagePaths: lead.attachments.map((attachment) => attachment.storagePath) };
    });
    return result;
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
    return { total, rows };
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
      await tx.crmLead.updateMany({
        where: {
          id: leadId,
          OR: [
            { lastFollowupAt: null },
            { lastFollowupAt: { lt: row.occurredAt } },
          ],
        },
        data: { lastFollowupAt: row.occurredAt },
      });
      await appendAuditRecord(tx, audit, {
        action: "CREATE_LEAD_FOLLOWUP",
        module: "crm",
        targetType: "lead_followup",
        targetId: row.id,
        details: { leadId, type: row.type, important: row.important, occurredAt: row.occurredAt.toISOString(), ownerUserId },
      });
      return row;
    });
  }
}
