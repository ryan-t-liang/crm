import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { addHours } from "../common/date.js";
import { appendAudit } from "../common/audit.js";
import { clearSessionCookie, guard, resolveAuth, sessionToken, sessionTokenHash, setSessionCookie } from "../common/auth.js";
import { ApiError } from "../common/errors.js";
import { assertStrongPassword, hashPassword, verifyPassword } from "../common/password.js";

const loginSchema = z.object({ loginAccount: z.string().trim().email(), password: z.string().min(1).max(500) });
const changeSchema = z.object({ currentPassword: z.string().min(1).max(500), newPassword: z.string().min(12).max(500), confirmPassword: z.string().min(12).max(500) });

function publicUser(auth: NonNullable<Awaited<ReturnType<typeof resolveAuth>>>) {
  return {
    id: auth.userId,
    name: auth.name,
    loginAccount: auth.loginAccount,
    role: { id: auth.roleId, key: auth.roleKey, name: auth.roleName },
    permissions: [...auth.permissions].sort(),
    brandIds: auth.brandIds,
    allBrands: auth.allBrands,
    mustChangePassword: auth.mustChangePassword,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/auth/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const account = await app.prisma.user.findUnique({ where: { loginAccount: body.loginAccount.toLowerCase() } });
    const valid = account ? await verifyPassword(account.passwordHash, body.password) : false;
    if (!account || !valid) {
      if (account) await app.prisma.user.update({ where: { id: account.id }, data: { failedLoginCount: { increment: 1 } } });
      throw new ApiError(401, "UNAUTHORIZED", "登录账号或密码不正确");
    }
    if (account.status !== "ACTIVE") throw new ApiError(403, "ACCOUNT_DISABLED", "该账号已被禁用，请联系系统管理员");
    if (account.lockedUntil && account.lockedUntil > new Date()) throw new ApiError(429, "ACCOUNT_LOCKED", "登录失败次数过多，请稍后重试");
    const token = sessionToken();
    const expiresAt = addHours(new Date(), app.config.sessionTtlHours);
    await app.prisma.$transaction(async (tx) => {
      await tx.session.create({ data: { userId: account.id, tokenHash: sessionTokenHash(token, app.config.sessionSecret), expiresAt, ipAddress: request.ip, userAgent: request.headers["user-agent"]?.slice(0, 500) } });
      await tx.user.update({ where: { id: account.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
      request.auth = null;
      await appendAudit(tx, request, { action: "LOGIN", module: "auth", targetType: "user", targetId: account.id, actorUserId: account.id, actorName: account.name, details: { mustChangePassword: account.mustChangePassword } });
    });
    setSessionCookie(reply, token, expiresAt);
    request.cookies.sowind_sid = token;
    const auth = await resolveAuth(request);
    return reply.send({ data: publicUser(auth!) });
  });

  app.get("/api/v1/auth/me", { preHandler: guard() }, async (request) => ({ data: publicUser(request.auth!) }));

  app.post("/api/v1/auth/logout", { preHandler: guard() }, async (request, reply) => {
    await app.prisma.$transaction(async (tx) => {
      await tx.session.update({ where: { id: request.auth!.sessionId }, data: { revokedAt: new Date() } });
      await appendAudit(tx, request, { action: "LOGOUT", module: "auth", targetType: "user", targetId: request.auth!.userId });
    });
    clearSessionCookie(reply);
    return reply.send({ data: { loggedOut: true } });
  });

  app.post("/api/v1/auth/change-password", { preHandler: guard() }, async (request, reply) => {
    const body = changeSchema.parse(request.body);
    if (body.newPassword !== body.confirmPassword) throw new ApiError(400, "VALIDATION_ERROR", "两次输入的新密码不一致");
    assertStrongPassword(body.newPassword, app.config.initialPassword);
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: request.auth!.userId } });
    if (!await verifyPassword(user.passwordHash, body.currentPassword)) throw new ApiError(400, "CURRENT_PASSWORD_INVALID", "当前密码不正确");
    const passwordHash = await hashPassword(body.newPassword);
    await app.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() } });
      await tx.session.updateMany({ where: { userId: user.id, id: { not: request.auth!.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
      await appendAudit(tx, request, { action: "CHANGE_PASSWORD", module: "auth", targetType: "user", targetId: user.id, details: { otherSessionsRevoked: true } });
    });
    return reply.send({ data: { changed: true } });
  });
}
