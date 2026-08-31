import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "请求数据校验失败",
          details: error.issues,
          requestId: request.id,
        },
      });
    }
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details, requestId: request.id },
      });
    }
    const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : 500;
    if (statusCode >= 500) request.log.error({ err: error }, "request failed");
    return reply.status(statusCode).send({
      error: {
        code: statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
        message: statusCode >= 500 ? "服务暂时不可用" : error instanceof Error ? error.message : "请求处理失败",
        requestId: request.id,
      },
    });
  });
}
