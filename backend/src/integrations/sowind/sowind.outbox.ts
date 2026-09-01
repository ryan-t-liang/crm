import type { Prisma, PrismaClient } from "@prisma/client";
import type { AppConfig } from "../../common/config.js";
import { SowindPayloadBuilder } from "./sowind.payload-builder.js";
import type { IntegrationTrigger, SowindLeadInput } from "./sowind.types.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function enqueueLeadForSowind(
  db: DbClient,
  config: AppConfig,
  lead: { id: string; brandId: string; brandCode: "GP" | "UN"; idempotencyKey?: string | null } & SowindLeadInput,
  triggeredBy: Exclude<IntegrationTrigger, "RETRY_JOB"> = "AUTO",
): Promise<void> {
  const payload = new SowindPayloadBuilder(config).build(lead);
  await db.integrationOutbox.upsert({
    where: { idempotencyKey: `SOWIND:${lead.id}:PURCHASE_INTENT:v2` },
    create: {
      aggregateType: "LEAD",
      aggregateId: lead.id,
      brandId: lead.brandId,
      integration: "SOWIND_GATEWAY",
      eventType: "PURCHASE_INTENT_SUBMITTED",
      idempotencyKey: `SOWIND:${lead.id}:PURCHASE_INTENT:v2`,
      payload: payload as unknown as Prisma.InputJsonValue,
      status: "PENDING",
      triggeredBy,
    },
    update: { payload: payload as unknown as Prisma.InputJsonValue, triggeredBy },
  });
}

export async function reactivateLeadOutbox(
  db: DbClient,
  leadId: string,
  triggeredBy: Exclude<IntegrationTrigger, "RETRY_JOB"> = "ADMIN",
): Promise<void> {
  await db.integrationOutbox.updateMany({
    where: { aggregateType: "LEAD", aggregateId: leadId, integration: "SOWIND_GATEWAY", status: { in: ["FAILED", "DEAD_LETTER"] } },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lockedAt: null, lockOwner: null, leaseUntil: null, lastError: null, processedAt: null, triggeredBy },
  });
}
