import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export type FieldError = { field: string; code: string; message: string };

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

function localizedZodMessage(issue: ZodError["issues"][number]): string {
  if (issue.code === "invalid_format" && "format" in issue && issue.format === "email") return "请输入有效的 Email 地址";
  if (issue.code === "invalid_value") return "请选择有效选项";
  if (issue.code === "invalid_type") return "输入类型不正确";
  if (issue.code === "too_small") return "此项为必填项或内容长度不足";
  if (issue.code === "too_big") return "输入内容过长";
  return "输入内容不符合要求";
}

export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const fieldErrors: FieldError[] = error.issues.map((issue) => ({
        field: issue.path.map(String).join(".") || "$",
        code: issue.code,
        message: localizedZodMessage(issue),
      }));
      return reply.status(422).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "请求数据校验失败",
          fieldErrors,
        },
        traceId: request.id,
      });
    }
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, ...(error.statusCode === 422 ? { fieldErrors: error.details } : error.details === undefined ? {} : { details: error.details }) },
        traceId: request.id,
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
      },
      traceId: request.id,
    });
  });
}
