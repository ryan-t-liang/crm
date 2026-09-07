import nodemailer from "nodemailer";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AppConfig } from "./config.js";
import type { CrmDbClient } from "./crm-users.js";

export type AssignmentTarget = {
  entityType: "MARKETING_LEAD" | "OPPORTUNITY" | "TASK" | "ORGANIZATION" | "CONTACT";
  entityId: string;
  entityLabel: string;
  fieldKey: "ownerUserId" | "salesOwnerUserId" | "followupOwnerUserId";
  fromUserId?: string | null;
  toUserId?: string | null;
  assignedByUserId: string;
  path: string;
};

export type AssignmentMailTransport = {
  sendMail(message: Record<string, unknown>): Promise<unknown>;
};

/** Enqueue inside the same transaction as the owner change. Delivery is intentionally separate. */
export async function enqueueAssignmentNotification(db: CrmDbClient, target: AssignmentTarget) {
  if (!target.toUserId || target.fromUserId === target.toUserId) return null;
  const recipient = await db.user.findFirst({
    where: { id: target.toUserId, status: "ACTIVE" },
    select: { id: true, name: true, loginAccount: true },
  });
  if (!recipient) return null;
  return db.assignmentNotification.create({
    data: {
      entityType: target.entityType,
      entityId: target.entityId,
      entityLabel: target.entityLabel.slice(0, 300),
      fieldKey: target.fieldKey,
      fromUserId: target.fromUserId,
      toUserId: recipient.id,
      assignedByUserId: target.assignedByUserId,
      recipientEmail: recipient.loginAccount,
      payload: {
        recipientName: recipient.name,
        path: target.path,
        fieldKey: target.fieldKey,
      },
    },
  });
}

export async function dispatchAssignmentNotifications(prisma: PrismaClient, config: AppConfig, limit = 25, transportOverride?: AssignmentMailTransport) {
  if (!config.assignmentNotificationEnabled || !config.smtpHost) return { attempted: 0, sent: 0, failed: 0 };
  const transport = transportOverride ?? nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort ?? 1025,
    secure: config.smtpSecure ?? false,
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword ?? "" } : undefined,
  });
  const rows = await prisma.assignmentNotification.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: 5 },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
    include: { assignedBy: { select: { name: true } } },
  });
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const payload = row.payload as Prisma.JsonObject;
    const path = typeof payload.path === "string" ? payload.path : "";
    const recipientName = typeof payload.recipientName === "string" ? payload.recipientName : "同事";
    const objectLabel = ({
      MARKETING_LEAD: "线索",
      OPPORTUNITY: "商机",
      TASK: "任务",
      ORGANIZATION: "公司",
      CONTACT: "联系人",
    } as Record<string, string>)[row.entityType] ?? "业务记录";
    try {
      await transport.sendMail({
        from: {
          name: config.mailFromName ?? "Kivisense CRM",
          address: config.mailFromAddress ?? "crm@kivisense.local",
        },
        to: row.recipientEmail,
        subject: `您被分配了新的${objectLabel}`,
        text: `${recipientName}，您好：\n\n您被分配了新的${objectLabel}。\n\n${objectLabel}：${row.entityLabel.replace(/^[^：]+：/, "")}\n分配人：${row.assignedBy.name}\n分配时间：${row.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}\n\n${path ? `打开 CRM：${path}` : "请登录 CRM 查看详情。"}`,
      });
      await prisma.assignmentNotification.update({
        where: { id: row.id },
        data: { status: "SENT", attempts: { increment: 1 }, lastError: null, nextAttemptAt: null, sentAt: new Date() },
      });
      sent += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      const delayMinutes = Math.min(60, 2 ** attempts);
      await prisma.assignmentNotification.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          attempts,
          lastError: (error instanceof Error ? error.message : "SMTP delivery failed").slice(0, 1000),
          nextAttemptAt: attempts >= 5 ? null : new Date(Date.now() + delayMinutes * 60_000),
        },
      });
      failed += 1;
    }
  }
  return { attempted: rows.length, sent, failed };
}
