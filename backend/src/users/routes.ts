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
  brandIds: z.array(z.string().min(1)).default([]),
  status: z.enum(["ACTIVE", "DISABLED"]).default("ACTIVE"),
});
const patchBody = userBody.partial();

async function assertRoleAndBrands(app: FastifyInstance, roleId: string, brandIds: string[]) {
  const [role, brands] = await Promise.all([
    app.prisma.role.findUnique({ where: { id: roleId } }),
    app.prisma.brand.findMany({ where: { id: { in: brandIds }, active: true } }),
  ]);
  if (!role) throw new ApiError(400, "VALIDATION_ERROR", "角色不存在");
  if (role.key === "SALES" && brandIds.length > 0) throw new ApiError(400, "VALIDATION_ERROR", "销售角色不绑定 GP / UN 品牌");
  if (!["SUPER_ADMIN", "SALES"].includes(role.key) && (brandIds.length === 0 || brands.length !== new Set(brandIds).size)) throw new ApiError(400, "VALIDATION_ERROR", "品牌范围无效");
  return role;
}

function userInclude() {
  return { role: true, brandAccess: { include: { brand: true } } } as const;
}

function publicUser<T extends { passwordHash?: string }>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/users", { preHandler: guard("account.view") }, async () => {
    const users = await app.prisma.user.findMany({ include: userInclude(), orderBy: { createdAt: "desc" } });
    return { data: users.map(publicUser) };
  });

  app.get<{ Params: { id: string } }>("/api/v1/users/:id", { preHandler: guard("account.view") }, async (request) => {
    const user = await app.prisma.user.findUnique({ where: { id: request.params.id }, include: userInclude() });
    if (!user) throw new ApiError(404, "RESOURCE_NOT_FOUND", "账号不存在");
    return { data: publicUser(user) };
  });

  app.post("/api/v1/users", { preHandler: guard("account.create") }, async (request, reply) => {
    const body = userBody.parse(request.body);
    const role = await assertRoleAndBrands(app, body.roleId, body.brandIds);
    const passwordHash = await hashPassword(app.config.initialPassword);
    try {
      const user = await app.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { name: body.name, loginAccount: body.loginAccount.toLowerCase(), roleId: body.roleId, passwordHash, status: body.status, mustChangePassword: true } });
        if (!["SUPER_ADMIN", "SALES"].includes(role.key)) await tx.userBrandAccess.createMany({ data: [...new Set(body.brandIds)].map((brandId) => ({ userId: created.id, brandId })) });
        await appendAudit(tx, request, { action: "CREATE_USER", module: "account", targetType: "user", targetId: created.id, details: { roleId: body.roleId, brandIds: body.brandIds, status: body.status } });
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
    const existing = await app.prisma.user.findUnique({ where: { id: request.params.id }, include: { brandAccess: true } });
    if (!existing) throw new ApiError(404, "RESOURCE_NOT_FOUND", "账号不存在");
    const roleId = body.roleId ?? existing.roleId;
    const brandIds = body.brandIds ?? existing.brandAccess.map((item) => item.brandId);
    const role = await assertRoleAndBrands(app, roleId, brandIds);
    if (existing.id === request.auth!.userId && body.status === "DISABLED") throw new ApiError(400, "VALIDATION_ERROR", "不能禁用当前登录账号");
    const user = await app.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: existing.id }, data: { name: body.name, loginAccount: body.loginAccount?.toLowerCase(), roleId, status: body.status } });
      await tx.userBrandAccess.deleteMany({ where: { userId: existing.id } });
      if (!["SUPER_ADMIN", "SALES"].includes(role.key)) await tx.userBrandAccess.createMany({ data: [...new Set(brandIds)].map((brandId) => ({ userId: existing.id, brandId })) });
      if (body.status === "DISABLED") await tx.session.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await appendAudit(tx, request, { action: "UPDATE_USER", module: "account", targetType: "user", targetId: existing.id, details: { roleId, brandIds, status: body.status ?? existing.status } });
      return updated;
    });
    return { data: publicUser(user) };
  });

  async function setStatus(request: FastifyRequest<{ Params: { id: string } }>, status: "ACTIVE" | "DISABLED") {
    const user = await app.prisma.user.findUnique({ where: { id: request.params.id } });
    if (!user) throw new ApiError(404, "RESOURCE_NOT_FOUND", "账号不存在");
    if (status === "DISABLED" && user.id === request.auth!.userId) throw new ApiError(400, "VALIDATION_ERROR", "不能禁用当前登录账号");
    await app.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { status } });
      if (status === "DISABLED") await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await appendAudit(tx, request, { action: status === "ACTIVE" ? "ENABLE_USER" : "DISABLE_USER", module: "account", targetType: "user", targetId: user.id });
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
