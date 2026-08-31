import type { FastifyInstance, FastifyRequest } from "fastify";
import { assertBrandAccess } from "./auth.js";
import { ApiError } from "./errors.js";

export async function resolveBrand(app: FastifyInstance, request: FastifyRequest, code: string) {
  const brand = await app.prisma.brand.findUnique({ where: { code: code.toUpperCase() } });
  if (!brand || !brand.active) throw new ApiError(400, "VALIDATION_ERROR", "品牌不存在或未启用");
  assertBrandAccess(request, brand.id);
  return brand;
}

export function visibleBrandIds(request: FastifyRequest): string[] | undefined {
  return request.auth?.allBrands ? undefined : request.auth?.brandIds ?? [];
}
