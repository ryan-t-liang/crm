import type { FastifyInstance } from "fastify";
import { guard } from "../common/auth.js";

export async function brandRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/brands", { preHandler: guard() }, async (request) => {
    const brands = await app.prisma.brand.findMany({
      where: { active: true, ...(request.auth!.allBrands ? {} : { id: { in: request.auth!.brandIds } }) },
      orderBy: { displayOrder: "asc" },
    });
    return { data: brands };
  });
}
