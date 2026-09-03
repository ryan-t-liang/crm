import type { FastifyInstance } from "fastify";

const RELEASE_NAME = "Kivisense CRM 2.0";
const INTERNAL_VERSION = "2.0.0-uat";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: "ok", database: "ok", release: RELEASE_NAME, version: INTERNAL_VERSION });
    } catch {
      return reply.status(503).send({ status: "error", database: "unavailable", release: RELEASE_NAME, version: INTERNAL_VERSION });
    }
  });
  app.get("/api/ready", async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return reply.send({
        status: "ready",
        database: "ok",
        release: RELEASE_NAME,
        version: INTERNAL_VERSION,
      });
    } catch {
      return reply.status(503).send({ status: "not_ready", database: "unavailable", release: RELEASE_NAME, version: INTERNAL_VERSION });
    }
  });
}
