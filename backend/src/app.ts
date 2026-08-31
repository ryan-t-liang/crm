import { resolve } from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import { PrismaClient } from "@prisma/client";
import Fastify, { type FastifyInstance } from "fastify";
import { authRoutes } from "./auth/routes.js";
import { brandRoutes } from "./brands/routes.js";
import { installErrorHandler, ApiError } from "./common/errors.js";
import { loadConfig, type AppConfig } from "./common/config.js";
import "./common/types.js";
import { healthRoutes } from "./health/routes.js";
import { SowindGatewayClient } from "./integrations/sowind/sowind.gateway-client.js";
import { SowindOutboxWorker, startSowindWorker } from "./integrations/sowind/sowind.worker.js";
import { roleRoutes } from "./roles/routes.js";
import { userRoutes } from "./users/routes.js";
import { customerRoutes } from "./customers/routes.js";
import { leadRoutes } from "./leads/routes.js";
import { formRoutes } from "./forms/routes.js";
import { auditRoutes } from "./audit/routes.js";
import { importExportRoutes } from "./jobs/routes.js";
import { integrationRoutes } from "./integrations/routes.js";

export type BuildAppOptions = {
  config?: AppConfig;
  prisma?: PrismaClient;
  startWorker?: boolean;
  frontendRoot?: string;
};

function inferFrontendRoot(): string {
  return process.cwd().endsWith("/backend") ? resolve(process.cwd(), "../frontend") : resolve(process.cwd(), "frontend");
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const prisma = options.prisma ?? new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
  const app = Fastify({
    bodyLimit: config.maxBodyBytes,
    trustProxy: config.trustProxy,
    logger: {
      level: config.nodeEnv === "test" ? "silent" : "info",
      redact: {
        paths: ["req.headers.cookie", "req.headers.authorization", "req.body.password", "req.body.currentPassword", "req.body.newPassword", "req.body.confirmPassword", "req.body.accessKey", "*.accessKey", "config.sessionSecret", "config.initialPassword", "config.sowindGatewayAccessKey"],
        censor: "[REDACTED]",
      },
    },
  });
  app.decorate("prisma", prisma);
  app.decorate("config", config);
  app.decorateRequest("auth", null);

  await app.register(cookie);
  await app.register(cors, { origin: config.corsOrigin === "*" ? true : config.corsOrigin, credentials: true });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  });
  await app.register(rateLimit, { max: 180, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: config.maxBodyBytes, files: 1 } });
  installErrorHandler(app);

  app.addHook("preHandler", async (request) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;
    if (!request.url.startsWith("/api/v1/") || request.url === "/api/v1/auth/login") return;
    const origin = request.headers.origin;
    if (origin && config.corsOrigin !== "*" && origin !== config.corsOrigin) {
      throw new ApiError(403, "ORIGIN_DENIED", "请求来源不受信任");
    }
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(brandRoutes);
  await app.register(userRoutes);
  await app.register(roleRoutes);
  await app.register(customerRoutes);
  await app.register(leadRoutes);
  await app.register(formRoutes);
  await app.register(auditRoutes);
  await app.register(importExportRoutes);
  await app.register(integrationRoutes);

  await app.register(staticPlugin, { root: options.frontendRoot ?? inferFrontendRoot(), prefix: "/" });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) return reply.status(404).send({ error: { code: "RESOURCE_NOT_FOUND", message: "接口不存在", requestId: request.id } });
    return reply.sendFile("index.html");
  });
  let stopWorker: (() => void) | undefined;
  if (options.startWorker !== false && config.nodeEnv !== "test" && config.sowindGatewayAccessKey) {
    const client = new SowindGatewayClient(config);
    const worker = new SowindOutboxWorker(prisma, config, client, app.log);
    stopWorker = startSowindWorker(worker, config.outboxPollIntervalMs);
  }
  app.addHook("onClose", async () => {
    stopWorker?.();
    if (!options.prisma) await prisma.$disconnect();
  });
  return app;
}
