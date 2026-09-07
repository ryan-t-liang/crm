import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditActorContext } from "../common/audit.js";
import { appendAuditRecord } from "../common/audit.js";
import { assertAssignableCrmUser, crmUserSummarySelect, type CrmDbClient } from "../common/crm-users.js";
import { ApiError } from "../common/errors.js";
import type { AuthContext } from "../common/types.js";
import type { TaskCreateInput, TaskPatchInput } from "./schemas.js";

export type TaskListInput = {
  ownerUserId?: string;
  status?: "OPEN" | "DONE" | "CANCELED";
  dueFrom?: Date;
  dueTo?: Date;
  priority?: "NORMAL" | "HIGH";
  organizationId?: string;
  contactId?: string;
  leadId?: string;
  page: number;
  pageSize: number;
};

const taskInclude = {
  owner: { select: crmUserSummarySelect },
  createdBy: { select: crmUserSummarySelect },
  completedBy: { select: crmUserSummarySelect },
  organization: { select: { id: true, name: true, shortName: true, fitScore: true } },
  contact: { select: { id: true, contactName: true, organizationId: true } },
  lead: { select: { id: true, requirementSummary: true, status: true, contact: { select: { organizationId: true } } } },
} satisfies Prisma.CrmTaskInclude;

async function requireTask(db: CrmDbClient, id: string) {
  const task = await db.crmTask.findUnique({ where: { id } });
  if (!task) throw new ApiError(404, "RESOURCE_NOT_FOUND", "任务不存在");
  return task;
}

function canViewTeam(auth: AuthContext) {
  return auth.roleKey === "SUPER_ADMIN" || auth.permissions.has("crm.dashboard.management.view");
}

function assertCanManage(auth: AuthContext, ownerUserId: string): void {
  if (auth.roleKey !== "SUPER_ADMIN" && ownerUserId !== auth.userId) throw new ApiError(403, "TASK_SCOPE_DENIED", "只能管理自己负责的任务");
}

async function validateRelations(db: CrmDbClient, input: Pick<TaskCreateInput, "organizationId" | "contactId" | "leadId">) {
  const [organization, contact, lead] = await Promise.all([
    input.organizationId ? db.organization.findFirst({ where: { id: input.organizationId, deletedAt: null }, select: { id: true } }) : null,
    input.contactId ? db.contact.findFirst({ where: { id: input.contactId, deletedAt: null }, select: { id: true, organizationId: true } }) : null,
    input.leadId ? db.crmLead.findFirst({ where: { id: input.leadId, deletedAt: null, contact: { deletedAt: null } }, select: { id: true, contactId: true, contact: { select: { organizationId: true } } } }) : null,
  ]);
  if (input.organizationId && !organization) throw new ApiError(422, "INVALID_TASK_RELATION", "关联公司不存在");
  if (input.contactId && !contact) throw new ApiError(422, "INVALID_TASK_RELATION", "关联联系人不存在");
  if (input.leadId && !lead) throw new ApiError(422, "INVALID_TASK_RELATION", "关联商机不存在");
  if (input.contactId && input.leadId && lead?.contactId !== input.contactId) throw new ApiError(422, "TASK_RELATION_CONFLICT", "任务的联系人与商机不一致");
  const derivedOrganizationId = contact?.organizationId ?? lead?.contact.organizationId ?? null;
  if (input.organizationId && derivedOrganizationId && input.organizationId !== derivedOrganizationId) throw new ApiError(422, "TASK_RELATION_CONFLICT", "任务的公司与联系人/商机不一致");
  return { organizationId: input.organizationId ?? derivedOrganizationId, contactId: input.contactId ?? lead?.contactId ?? null };
}

export class CrmTaskService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: TaskListInput, auth: AuthContext) {
    const where: Prisma.CrmTaskWhereInput = {
      ownerUserId: canViewTeam(auth) ? input.ownerUserId : auth.userId,
      status: input.status,
      priority: input.priority,
      organizationId: input.organizationId,
      contactId: input.contactId,
      leadId: input.leadId,
      dueAt: input.dueFrom || input.dueTo ? { gte: input.dueFrom, lte: input.dueTo } : undefined,
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.crmTask.count({ where }),
      this.prisma.crmTask.findMany({ where, include: taskInclude, orderBy: [{ status: "asc" }, { dueAt: "asc" }, { priority: "desc" }, { id: "asc" }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    ]);
    return { total, rows };
  }

  async create(input: TaskCreateInput, auth: AuthContext, audit: AuditActorContext) {
    if (auth.roleKey !== "SUPER_ADMIN" && !canViewTeam(auth) && input.ownerUserId !== auth.userId) throw new ApiError(403, "TASK_SCOPE_DENIED", "只能为自己创建任务");
    return this.prisma.$transaction(async (tx) => {
      const relation = await validateRelations(tx, input);
      await assertAssignableCrmUser(tx, input.ownerUserId, "ownerUserId");
      const row = await tx.crmTask.create({ data: { ...input, ...relation, createdByUserId: auth.userId }, include: taskInclude });
      await appendAuditRecord(tx, audit, { action: "CREATE_CRM_TASK", module: "crm", targetType: "crm_task", targetId: row.id, details: { ownerUserId: row.ownerUserId, dueAt: row.dueAt.toISOString(), source: row.source } });
      return row;
    });
  }

  async update(id: string, input: TaskPatchInput, auth: AuthContext, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await requireTask(tx, id);
      assertCanManage(auth, existing.ownerUserId);
      if (existing.status !== "OPEN") throw new ApiError(409, "TASK_NOT_EDITABLE", "已完成或已取消的任务不能编辑业务内容");
      if (input.ownerUserId !== undefined) {
        if (auth.roleKey !== "SUPER_ADMIN" && input.ownerUserId !== auth.userId) throw new ApiError(403, "TASK_SCOPE_DENIED", "不能把任务转交给其他负责人");
        await assertAssignableCrmUser(tx, input.ownerUserId, "ownerUserId");
      }
      const row = await tx.crmTask.update({ where: { id }, data: input, include: taskInclude });
      await appendAuditRecord(tx, audit, { action: "UPDATE_CRM_TASK", module: "crm", targetType: "crm_task", targetId: id, details: { changedFields: Object.keys(input) } });
      return row;
    });
  }

  async complete(id: string, auth: AuthContext, audit: AuditActorContext) {
    return this.setStatus(id, "DONE", auth, audit);
  }

  async cancel(id: string, auth: AuthContext, audit: AuditActorContext) {
    return this.setStatus(id, "CANCELED", auth, audit);
  }

  private async setStatus(id: string, status: "DONE" | "CANCELED", auth: AuthContext, audit: AuditActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await requireTask(tx, id);
      assertCanManage(auth, existing.ownerUserId);
      if (existing.status !== "OPEN") throw new ApiError(409, "TASK_ALREADY_CLOSED", "任务已经完成或取消");
      const row = await tx.crmTask.update({ where: { id }, data: { status, completedAt: status === "DONE" ? new Date() : null, completedByUserId: status === "DONE" ? auth.userId : null }, include: taskInclude });
      await appendAuditRecord(tx, audit, { action: status === "DONE" ? "COMPLETE_CRM_TASK" : "CANCEL_CRM_TASK", module: "crm", targetType: "crm_task", targetId: id, details: { dueAt: existing.dueAt.toISOString() } });
      return row;
    });
  }
}
