import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { ApiError } from "./errors.js";
import type { AuthContext } from "./types.js";

export const SESSION_COOKIE = "sowind_sid";

export function sessionToken(): string { return randomBytes(32).toString("base64url"); }
export function sessionTokenHash(token: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

export async function resolveAuth(request: FastifyRequest): Promise<AuthContext | null> {
  if (request.auth) return request.auth;
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = sessionTokenHash(token, request.server.config.sessionSecret);
  const session = await request.server.prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          brandAccess: true,
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") return null;
  const allBrands = session.user.role.key === "SUPER_ADMIN";
  const brandIds = allBrands
    ? (await request.server.prisma.brand.findMany({ where: { active: true }, select: { id: true } })).map((item) => item.id)
    : session.user.brandAccess.map((item) => item.brandId);
  request.auth = {
    userId: session.user.id,
    name: session.user.name,
    loginAccount: session.user.loginAccount,
    roleId: session.user.roleId,
    roleKey: session.user.role.key,
    roleName: session.user.role.name,
    permissions: new Set(session.user.role.permissions.map((item) => item.permission.key)),
    brandIds,
    allBrands,
    mustChangePassword: session.user.mustChangePassword,
    sessionId: session.id,
  };
  void request.server.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  return request.auth;
}

export function guard(permission?: string): preHandlerHookHandler {
  return async function guardRequest(request) {
    const auth = await resolveAuth(request);
    if (!auth) throw new ApiError(401, "UNAUTHENTICATED", "请先登录");
    const allowedWhenChanging = ["/api/v1/auth/me", "/api/v1/auth/change-password", "/api/v1/auth/logout"];
    if (auth.mustChangePassword && !allowedWhenChanging.some((path) => request.url.startsWith(path))) {
      throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "首次登录必须先修改密码");
    }
    if (permission && !auth.permissions.has(permission)) {
      throw new ApiError(403, "PERMISSION_DENIED", "当前账户没有此操作权限");
    }
  };
}

export function assertBrandAccess(request: FastifyRequest, brandId: string): void {
  if (!request.auth || (!request.auth.allBrands && !request.auth.brandIds.includes(brandId))) {
    throw new ApiError(403, "BRAND_SCOPE_DENIED", "当前账户无权访问该品牌数据");
  }
}

export function brandWhere(request: FastifyRequest): { in: string[] } | undefined {
  if (!request.auth || request.auth.allBrands) return undefined;
  return { in: request.auth.brandIds };
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: reply.server.config.cookieSecure,
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, secure: reply.server.config.cookieSecure, sameSite: "strict" });
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
