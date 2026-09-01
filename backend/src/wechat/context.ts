import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "../common/errors.js";

export const WECHAT_CONTEXT_HEADER = "x-wechat-context-token";

export function createWechatContextToken(): string {
  return randomBytes(32).toString("base64url");
}

export function wechatContextTokenHash(token: string, secret: string): string {
  return createHash("sha256").update(`${secret}:wechat:${token}`).digest("hex");
}

export function wechatContextTokenFromRequest(request: FastifyRequest): string | null {
  const explicit = request.headers[WECHAT_CONTEXT_HEADER];
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim() || null;
  return null;
}

export async function resolveWechatContext(app: FastifyInstance, token: string, expectedBrandId?: string) {
  const context = await app.prisma.wechatIdentityContext.findUnique({
    where: { tokenHash: wechatContextTokenHash(token, app.config.sessionSecret) },
    include: { brand: true },
  });
  if (!context || context.expiresAt <= new Date()) throw new ApiError(401, "WECHAT_CONTEXT_INVALID", "微信身份上下文无效或已过期");
  if (expectedBrandId && context.brandId !== expectedBrandId) throw new ApiError(403, "WECHAT_BRAND_SCOPE_DENIED", "微信身份上下文不属于当前品牌");
  void app.prisma.wechatIdentityContext.update({ where: { id: context.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  return context;
}

export async function requireWechatContext(request: FastifyRequest) {
  const token = wechatContextTokenFromRequest(request);
  if (!token) throw new ApiError(401, "WECHAT_CONTEXT_REQUIRED", "缺少微信身份上下文");
  return resolveWechatContext(request.server, token);
}
