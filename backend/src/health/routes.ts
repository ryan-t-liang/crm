import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: "ok", database: "ok", version: "1.15.0" });
    } catch {
      return reply.status(503).send({ status: "error", database: "unavailable", version: "1.15.0" });
    }
  });
}
