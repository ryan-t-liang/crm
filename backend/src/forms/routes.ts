import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { guard } from "../common/auth.js";
import { resolveBrand } from "../common/brand.js";

export async function formRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/forms", { preHandler: guard() }, async (request) => {
    const query = z.object({ brandCode: z.string(), objectType: z.enum(["CUSTOMER", "LEAD"]), formKey: z.string().optional(), version: z.string().optional() }).parse(request.query);
    const brand = await resolveBrand(app, request, query.brandCode);
    const forms = await app.prisma.formDefinition.findMany({
      where: { brandId: brand.id, objectType: query.objectType, formKey: query.formKey, version: query.version, active: true },
      include: { brand: true }, orderBy: { effectiveAt: "desc" },
    });
    return { data: forms };
  });
}
