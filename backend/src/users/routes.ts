import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendAudit } from "../common/audit.js";
import { guard } from "../common/auth.js";
import { ApiError } from "../common/errors.js";
import { hashPassword } from "../common/password.js";

const userBody = z.object({
  name: z.string().trim().min(1).max(120),
  loginAccount: z.string().trim().email(),
  roleId: z.string().min(1),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
}).strict();
const patchBody = userBody.partial().refine((value) => Object.keys(value).length > 0, {
  message: "至少提供一个需要修改的字段",
});

async function assertRole(app: FastifyInstance, roleId: string) {
  const role = await app.prisma.role.findUnique({ where: { id: roleId } });
  if (!role || !["SUPER_ADMIN", "SALES", "VIEWER"].includes(role.key)) {
    throw new ApiError(400, "VALIDATION_ERROR", "角色不存在");
  }
  return role;
}

const userInclude = { role: true } as const;

function publicUser<T extends { passwordHash?: string }>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/users", { preHandler: guard("account.view") }, async () => ({
    data: (await app.prisma.user.findMany({ include: userInclude, orderBy: { createdAt: "desc" } })).map(publicUser),
  }));

  app.get<{ Params: { id: string } }>("/api/v1/users/:id", { preHandler: guard("account.view") }, async (request) => {
    const user = await app.prisma.user.findUnique({ where: { id: request.params.id }, include: userInclude });
    if (!user) throw new ApiError(404, "RESOURCE_NOT_FOUND", "账号不存在");
    return { data: publicUser(user) };
  });

  app.post("/api/v1/users", { preHandler: guard("account.create") }, async (request, reply) => {
    const body = userBody.parse(request.body);
    await assertRole(app, body.roleId);
    const passwordHash = await hashPassword(app.config.initialPassword);
    try {
      const user = await app.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: body.name,
            loginAccount: body.loginAccount.toLowerCase(),
            roleId: body.roleId,
            passwordHash,
            status: body.status,
            mustChangePassword: true,
          },
          include: userInclude,
        });
        await appendAudit(tx, request, {
          action: "CREATE_USER",
          module: "account",
          targetType: "user",
          targetId: created.id,
          details: { roleId: body.roleId, status: body.status },
        });
        return created;
      });
      return reply.status(201).send({ data: publicUser(user) });
    } catch (error) {
      if (String(error).includes("Unique constraint")) throw new ApiError(409, "CONFLICT", "登录账号已存在");
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>("/api/v1/users/:id", { preHandler: guard("account.edit") }, async (request) => {
    const body = patchBody.parse(request.body);
    const existing = await app.prisma.user.findUnique({ where: { id: request.params.id } });
    if (!existing) throw new ApiError(404, "RESOURCE_NOT_FOUND", "账号不存在");
    const roleId = body.roleId ?? existing.roleId;
    await assertRole(app, roleId);
    if (existing.id === request.auth!.userId && body.status === "DISABLED") {
      throw new ApiError(400, "VALIDATION_ERROR", "不能禁用当前登录账号");
    }
    const user = await app.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: existing.id },
        data: { name: body.name, loginAccount: body.loginAccount?.toLowerCase(), roleId, status: body.status },
        include: userInclude,
      });
      if (body.status === "DISABLED") {
        await tx.session.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await appendAudit(tx, request, {
        action: "UPDATE_USER",
        module: "account",
        targetType: "user",
        targetId: existing.id,
        details: { roleId, status: body.status ?? existing.status },
      });
      return updated;
    });
    return { data: publicUser(user) };
  });

  async function setStatus(request: FastifyRequest<{ Params: { id: string } }>, status: "ACTIVE" | "DISABLED") {
    const user = await app.prisma.user.findUnique({ where: { id: request.params.id } });
    if (!user) throw new ApiError(404, "RESOURCE_NOT_FOUND", "账号不存在");
    if (status === "DISABLED" && user.id === request.auth!.userId) {
      throw new ApiError(400, "VALIDATION_ERROR", "不能禁用当前登录账号");
    }
    await app.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { status } });
      if (status === "DISABLED") {
        await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await appendAudit(tx, request, {
        action: status === "ACTIVE" ? "ENABLE_USER" : "DISABLE_USER",
        module: "account",
        targetType: "user",
        targetId: user.id,
      });
    });
    return { data: { id: user.id, status } };
  }

  app.post<{ Params: { id: string } }>("/api/v1/users/:id/disable", { preHandler: guard("account.disable") }, (request) => setStatus(request, "DISABLED"));
  app.post<{ Params: { id: string } }>("/api/v1/users/:id/enable", { preHandler: guard("account.disable") }, (request) => setStatus(request, "ACTIVE"));

  app.post<{ Params: { id: string } }>("/api/v1/users/:id/reset-password", { preHandler: guard("account.reset") }, async (request) => {
    const user = await app.prisma.user.findUnique({ where: { id: request.params.id } });
    if (!user) throw new ApiError(404, "RESOURCE_NOT_FOUND", "账号不存在");
    const passwordHash = await hashPassword(app.config.initialPassword);
    await app.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: true, passwordChangedAt: null } });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await appendAudit(tx, request, { action: "RESET_PASSWORD", module: "account", targetType: "user", targetId: user.id });
    });
    return { data: { reset: true, mustChangePassword: true } };
  });
}
