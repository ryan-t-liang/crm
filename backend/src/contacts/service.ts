import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditActorContext } from "../common/audit.js";
import { appendAuditRecord } from "../common/audit.js";
import { assertAssignableCrmUser, crmUserSummarySelect, type CrmDbClient } from "../common/crm-users.js";
import { ApiError } from "../common/errors.js";
import type { ContactCreateInput, ContactFollowupCreateInput, ContactPatchInput } from "./schemas.js";

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
  _count: { select: { leads: true } },
} satisfies Prisma.ContactInclude;

export const contactDetailInclude = {
  ...contactListInclude,
  createdBy: { select: crmUserSummarySelect },
} satisfies Prisma.ContactInclude;

async function requireContact(db: CrmDbClient, id: string) {
  const contact = await db.contact.findUnique({ where: { id } });
  if (!contact) throw new ApiError(404, "RESOURCE_NOT_FOUND", "CRM 联系人不存在");
  return contact;
}

function contactOrderBy(orderBy: ContactListInput["orderBy"]): Prisma.ContactOrderByWithRelationInput[] {
  const [field, direction] = orderBy.split("_") as ["updatedAt" | "contactName" | "nextFollowupAt", "asc" | "desc"];
  return [{ [field]: direction }, { id: direction }];
}

export class ContactService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: ContactListInput) {
    const where: Prisma.ContactWhereInput = {
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

  async create(input: ContactCreateInput, createdByUserId: string, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      await assertAssignableCrmUser(tx, input.ownerUserId, "ownerUserId");
      const row = await tx.contact.create({
        data: { ...input, createdByUserId },
        include: contactDetailInclude,
      });
      await appendAuditRecord(tx, audit, {
        action: "CREATE_CONTACT",
        module: "crm",
        targetType: "contact",
        targetId: row.id,
        details: { fields: Object.keys(input) },
      });
      return row;
    });
  }

  async detail(id: string) {
    const row = await this.prisma.contact.findUnique({ where: { id }, include: contactDetailInclude });
    if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "CRM 联系人不存在");
    return row;
  }

  async update(id: string, input: ContactPatchInput, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      await requireContact(tx, id);
      if (input.ownerUserId !== undefined) await assertAssignableCrmUser(tx, input.ownerUserId, "ownerUserId");
      const row = await tx.contact.update({ where: { id }, data: input, include: contactDetailInclude });
      await appendAuditRecord(tx, audit, {
        action: "UPDATE_CONTACT",
        module: "crm",
        targetType: "contact",
        targetId: row.id,
        details: { changedFields: Object.keys(input) },
      });
      return row;
    });
  }

  async remove(id: string, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const contact = await tx.contact.findUnique({
        where: { id },
        select: { id: true, contactName: true, companyName: true, companyShortName: true, _count: { select: { leads: true, followups: true } } },
      });
      if (!contact) throw new ApiError(404, "RESOURCE_NOT_FOUND", "CRM 联系人不存在");
      if (contact._count.leads > 0) {
        throw new ApiError(409, "CONTACT_HAS_LEADS", "该联系人仍有关联线索，请先删除关联线索", {
          relatedLeadCount: contact._count.leads,
        });
      }
      await tx.contact.delete({ where: { id } });
      await appendAuditRecord(tx, audit, {
        action: "DELETE_CONTACT",
        module: "crm",
        targetType: "contact",
        targetId: id,
        details: {
          contactName: contact.contactName,
          company: contact.companyShortName ?? contact.companyName,
          deletedFollowupCount: contact._count.followups,
        },
      });
      return { id };
    });
  }

  async require(id: string): Promise<void> {
    await requireContact(this.prisma, id);
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
    return { total, rows };
  }

  async create(contactId: string, input: ContactFollowupCreateInput, createdByUserId: string, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      await requireContact(tx, contactId);
      const ownerUserId = input.ownerUserId ?? createdByUserId;
      await assertAssignableCrmUser(tx, ownerUserId, "ownerUserId");
      const row = await tx.contactFollowup.create({
        data: { ...input, contactId, ownerUserId, createdByUserId },
        include: {
          owner: { select: crmUserSummarySelect },
          createdBy: { select: crmUserSummarySelect },
        },
      });
      await appendAuditRecord(tx, audit, {
        action: "CREATE_CONTACT_FOLLOWUP",
        module: "crm",
        targetType: "contact_followup",
        targetId: row.id,
        details: { contactId, type: row.type, occurredAt: row.occurredAt.toISOString(), ownerUserId },
      });
      return row;
    });
  }
}
