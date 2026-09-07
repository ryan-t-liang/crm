import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditActorContext } from "../common/audit.js";
import { guard } from "../common/auth.js";
import { paginationMeta, paginationSchema } from "../common/pagination.js";
import { timezoneAwareDateTimeSchema } from "../contacts/schemas.js";
import { taskCreateSchema, taskPatchSchema } from "./schemas.js";
import { CrmTaskService } from "./service.js";

const taskListSchema = paginationSchema.extend({
  ownerUserId: z.string().trim().max(32).optional(),
  status: z.enum(["OPEN", "DONE", "CANCELED"]).optional(),
  priority: z.enum(["NORMAL", "HIGH"]).optional(),
  organizationId: z.string().trim().max(32).optional(),
  contactId: z.string().trim().max(32).optional(),
  leadId: z.string().trim().max(32).optional(),
  dueFrom: timezoneAwareDateTimeSchema.optional(),
  dueTo: timezoneAwareDateTimeSchema.optional(),
}).refine((value) => !value.dueFrom || !value.dueTo || value.dueFrom <= value.dueTo, { path: ["dueTo"], message: "结束时间不能早于开始时间" });

export async function crmTaskRoutes(app: FastifyInstance): Promise<void> {
  const tasks = new CrmTaskService(app.prisma, app.config);

  app.get("/api/v1/crm/workbench", { preHandler: guard("crm.task.view") }, async (request) => {
    const query = z.object({ ownerUserId: z.string().trim().max(32).optional() }).parse(request.query);
    return { data: await tasks.workbench(query.ownerUserId, request.auth!) };
  });

  app.get("/api/v1/crm/tasks", { preHandler: guard("crm.task.view") }, async (request) => {
    const query = taskListSchema.parse(request.query);
    const result = await tasks.list(query, request.auth!);
    return { data: result.rows, meta: paginationMeta(query.page, query.pageSize, result.total) };
  });

  app.post("/api/v1/crm/tasks", { preHandler: guard("crm.task.create") }, async (request, reply) => {
    const body = taskCreateSchema.parse(request.body);
    return reply.status(201).send({ data: await tasks.create(body, request.auth!, auditActorContext(request)) });
  });

  app.patch<{ Params: { id: string } }>("/api/v1/crm/tasks/:id", { preHandler: guard("crm.task.edit") }, async (request) => ({
    data: await tasks.update(request.params.id, taskPatchSchema.parse(request.body), request.auth!, auditActorContext(request)),
  }));

  app.post<{ Params: { id: string } }>("/api/v1/crm/tasks/:id/complete", { preHandler: guard("crm.task.complete") }, async (request) => ({
    data: await tasks.complete(request.params.id, request.auth!, auditActorContext(request)),
  }));

  app.post<{ Params: { id: string } }>("/api/v1/crm/tasks/:id/cancel", { preHandler: guard("crm.task.cancel") }, async (request) => ({
    data: await tasks.cancel(request.params.id, request.auth!, auditActorContext(request)),
  }));
}
