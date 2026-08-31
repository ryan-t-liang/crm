import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendAudit } from "../common/audit.js";
import { guard } from "../common/auth.js";
import { ApiError } from "../common/errors.js";

export async function roleRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/roles", { preHandler: guard("roles.view") }, async () => ({ data: await app.prisma.role.findMany({ include: { permissions: { include: { permission: true } } }, orderBy: { name: "asc" } }) }));
  app.get<{ Params: { id: string } }>("/api/v1/roles/:id", { preHandler: guard("roles.view") }, async (request) => {
    const role = await app.prisma.role.findUnique({ where: { id: request.params.id }, include: { permissions: { include: { permission: true } } } });
    if (!role) throw new ApiError(404, "RESOURCE_NOT_FOUND", "角色不存在");
    return { data: role };
  });
  app.get("/api/v1/permissions", { preHandler: guard("roles.view") }, async () => ({ data: await app.prisma.permission.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] }) }));
  app.patch<{ Params: { id: string } }>("/api/v1/roles/:id/permissions", { preHandler: guard("roles.configure") }, async (request) => {
    const body = z.object({ permissionKeys: z.array(z.string()).max(100) }).parse(request.body);
    const role = await app.prisma.role.findUnique({ where: { id: request.params.id } });
    if (!role) throw new ApiError(404, "RESOURCE_NOT_FOUND", "角色不存在");
    if (role.system) throw new ApiError(400, "VALIDATION_ERROR", "系统角色权限不可修改");
    const permissions = await app.prisma.permission.findMany({ where: { key: { in: [...new Set(body.permissionKeys)] } } });
    if (permissions.length !== new Set(body.permissionKeys).size) throw new ApiError(400, "VALIDATION_ERROR", "包含未知权限键");
    await app.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
      await appendAudit(tx, request, { action: "UPDATE_ROLE_PERMISSIONS", module: "role", targetType: "role", targetId: role.id, details: { permissionKeys: body.permissionKeys } });
    });
    return { data: { id: role.id, permissionKeys: body.permissionKeys } };
  });
}
