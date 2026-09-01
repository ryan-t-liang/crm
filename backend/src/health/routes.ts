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
        version: "1.15.0",
        integrations: {
          sowindGateway: app.config.sowindGatewayAccessKey ? "configured" : "unconfigured",
          wechatGp: app.config.wechatGpAppId && app.config.wechatGpAppSecret ? "configured" : "unconfigured",
          wechatUn: app.config.wechatUnAppId && app.config.wechatUnAppSecret ? "configured" : "unconfigured",
        },
        outbox: { processing, retryWaiting, deadLetter, oldestPendingAt: oldestPending?.createdAt ?? null },
      });
    } catch {
      return reply.status(503).send({ status: "not_ready", database: "unavailable", version: "1.15.0" });
    }
  });
}
