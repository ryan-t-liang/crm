import type { FastifyInstance } from "fastify";

const RELEASE_NAME = "Kivisense_CRM_v1";
const INTERNAL_VERSION = "1.15.0";

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
      const [processing, retryWaiting, deadLetter, oldestPending] = await Promise.all([
        app.prisma.integrationOutbox.count({ where: { status: "PROCESSING" } }),
        app.prisma.integrationOutbox.count({ where: { status: "RETRY_WAITING" } }),
        app.prisma.integrationOutbox.count({ where: { status: "DEAD_LETTER" } }),
        app.prisma.integrationOutbox.findFirst({ where: { status: { in: ["PENDING", "RETRY_WAITING"] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      ]);
      return reply.send({
        status: "ready",
        database: "ok",
        release: RELEASE_NAME,
        version: INTERNAL_VERSION,
        integrations: {
          sowindGateway: app.config.sowindGatewayAccessKey ? "configured" : "unconfigured",
          wechatGp: app.config.wechatGpAppId && app.config.wechatGpAppSecret ? "configured" : "unconfigured",
          wechatUn: app.config.wechatUnAppId && app.config.wechatUnAppSecret ? "configured" : "unconfigured",
        },
        outbox: { processing, retryWaiting, deadLetter, oldestPendingAt: oldestPending?.createdAt ?? null },
      });
    } catch {
      return reply.status(503).send({ status: "not_ready", database: "unavailable", release: RELEASE_NAME, version: INTERNAL_VERSION });
    }
  });
}
