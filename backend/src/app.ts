import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import { PrismaClient } from "@prisma/client";
import Fastify, { type FastifyInstance } from "fastify";
import { authRoutes } from "./auth/routes.js";
import { installErrorHandler, ApiError } from "./common/errors.js";
import { loadConfig, type AppConfig } from "./common/config.js";
import "./common/types.js";
import { healthRoutes } from "./health/routes.js";
import { roleRoutes } from "./roles/routes.js";
import { userRoutes } from "./users/routes.js";
import { auditRoutes } from "./audit/routes.js";
import { contactRoutes } from "./contacts/routes.js";
import { crmLeadRoutes } from "./crm-leads/routes.js";
import { crmImportExportRoutes } from "./jobs/crm-routes.js";

export type BuildAppOptions = {
  config?: AppConfig;
  prisma?: PrismaClient;
  frontendRoot?: string;
};

function inferFrontendRoot(): string {
  return process.cwd().endsWith("/backend") ? resolve(process.cwd(), "../frontend") : resolve(process.cwd(), "frontend");
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const prisma = options.prisma ?? new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
  const app = Fastify({
    genReqId: (request) => {
      const incoming = request.headers["x-request-id"];
      return typeof incoming === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(incoming) ? incoming : randomUUID();
    },
    bodyLimit: config.maxBodyBytes,
    trustProxy: config.trustProxy,
    logger: {
      level: config.logLevel ?? (config.nodeEnv === "test" ? "silent" : "info"),
      redact: {
        paths: ["req.headers.cookie", "req.headers.authorization", "req.body.password", "req.body.currentPassword", "req.body.newPassword", "req.body.confirmPassword", "config.sessionSecret", "config.initialPassword"],
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
  await app.register(multipart, { limits: { fileSize: config.maxAttachmentBytes, files: 1 } });
  installErrorHandler(app);

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-trace-id", request.id);
  });
  app.addHook("onResponse", async (request, reply) => {
    request.log.info({ traceId: request.id, method: request.method, route: request.routeOptions.url, statusCode: reply.statusCode, durationMs: Math.round(reply.elapsedTime) }, "request completed");
  });

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
  await app.register(userRoutes);
  await app.register(roleRoutes);
  await app.register(contactRoutes);
  await app.register(crmLeadRoutes);
  await app.register(auditRoutes);
  await app.register(crmImportExportRoutes);

  await app.register(staticPlugin, { root: options.frontendRoot ?? inferFrontendRoot(), prefix: "/" });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) return reply.status(404).send({ error: { code: "RESOURCE_NOT_FOUND", message: "接口不存在" }, traceId: request.id });
    return reply.sendFile("index.html");
  });
  app.addHook("onClose", async () => {
    if (!options.prisma) await prisma.$disconnect();
  });
  return app;
}
