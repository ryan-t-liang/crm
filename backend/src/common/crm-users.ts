import type { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "./errors.js";

export type CrmDbClient = PrismaClient | Prisma.TransactionClient;

export const crmUserSummarySelect = {
  id: true,
  name: true,
  loginAccount: true,
  status: true,
} satisfies Prisma.UserSelect;

export async function assertAssignableCrmUser(
  db: CrmDbClient,
  userId: string | null | undefined,
  field: string,
): Promise<void> {
  if (!userId) return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user || user.status !== "ACTIVE") {
    throw new ApiError(422, "VALIDATION_ERROR", "请求数据校验失败", [{
      field,
      code: "invalid_user",
      message: "负责人不存在或账号已禁用",
    }]);
  }
}
