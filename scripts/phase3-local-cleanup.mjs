// Remove only disposable Phase 3 browser-QA data from the isolated local database.
import { createRequire } from "node:module";

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");

const databaseUrl = new URL(process.env.DATABASE_URL || "");
if (
  !["127.0.0.1", "localhost"].includes(databaseUrl.hostname) ||
  databaseUrl.port !== "3308" ||
  databaseUrl.pathname !== "/kivisense_crm"
) {
  throw new Error("Phase 3 cleanup is restricted to local MySQL port 3308 and database kivisense_crm");
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });

try {
  const qaUsers = await prisma.user.findMany({
    where: { loginAccount: { in: ["admin@phase3.example.test", "sales@phase3.example.test", "viewer@phase3.example.test"] } },
    select: { id: true },
  });
  const userIds = qaUsers.map((user) => user.id);
  if (userIds.length !== 3) throw new Error("Expected exactly three local Phase 3 QA identities before cleanup");

  const marketingLeads = await prisma.marketingLead.findMany({
    where: { OR: [{ createdByUserId: { in: userIds } }, { fullName: { startsWith: "V4-UI-" } }] },
    select: { id: true, convertedOpportunityId: true },
  });
  const marketingLeadIds = marketingLeads.map((row) => row.id);
  const convertedOpportunityIds = marketingLeads.flatMap((row) => row.convertedOpportunityId ? [row.convertedOpportunityId] : []);
  const opportunities = await prisma.crmLead.findMany({
    where: {
      OR: [
        { createdByUserId: { in: userIds } },
        { requirementSummary: { startsWith: "V4-UI-" } },
        ...(marketingLeadIds.length ? [{ sourceMarketingLeadId: { in: marketingLeadIds } }] : []),
        ...(convertedOpportunityIds.length ? [{ id: { in: convertedOpportunityIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const opportunityIds = opportunities.map((row) => row.id);
  const contacts = await prisma.contact.findMany({
    where: { OR: [{ createdByUserId: { in: userIds } }, { contactName: { startsWith: "V4-UI-" } }] },
    select: { id: true },
  });
  const contactIds = contacts.map((row) => row.id);
  const organizations = await prisma.organization.findMany({
    where: { OR: [{ createdByUserId: { in: userIds } }, { name: { startsWith: "V4-UI-" } }] },
    select: { id: true },
  });
  const organizationIds = organizations.map((row) => row.id);
  const entityIds = [...marketingLeadIds, ...opportunityIds, ...contactIds, ...organizationIds];

  const removed = await prisma.$transaction(async (tx) => {
    const result = {};
    result.sessions = (await tx.session.deleteMany({ where: { userId: { in: userIds } } })).count;
    result.notifications = (await tx.assignmentNotification.deleteMany({
      where: { OR: [{ assignedByUserId: { in: userIds } }, { entityId: { in: entityIds } }] },
    })).count;
    result.attachments = (await tx.crmAttachment.deleteMany({
      where: { OR: [{ uploadedByUserId: { in: userIds } }, { entityId: { in: entityIds } }] },
    })).count;
    result.auditLogs = (await tx.auditLog.deleteMany({
      where: { OR: [{ actorUserId: { in: userIds } }, { targetId: { in: entityIds } }] },
    })).count;
    result.importJobs = (await tx.importJob.deleteMany({ where: { createdBy: { in: userIds } } })).count;
    result.exportJobs = (await tx.exportJob.deleteMany({ where: { createdBy: { in: userIds } } })).count;
    result.tasks = (await tx.crmTask.deleteMany({
      where: {
        OR: [
          { createdByUserId: { in: userIds } },
          { leadId: { in: opportunityIds } },
          { contactId: { in: contactIds } },
          { organizationId: { in: organizationIds } },
        ],
      },
    })).count;

    if (marketingLeadIds.length) {
      await tx.crmLead.updateMany({ where: { sourceMarketingLeadId: { in: marketingLeadIds } }, data: { sourceMarketingLeadId: null } });
      await tx.marketingLead.updateMany({
        where: { id: { in: marketingLeadIds } },
        data: { convertedOpportunityId: null, convertedOrganizationId: null, convertedContactId: null, convertedByUserId: null },
      });
      result.scoreHistory = (await tx.leadScoreHistory.deleteMany({ where: { marketingLeadId: { in: marketingLeadIds } } })).count;
      result.statusHistory = (await tx.leadStatusHistory.deleteMany({ where: { marketingLeadId: { in: marketingLeadIds } } })).count;
      result.activityEvents = (await tx.leadActivityEvent.deleteMany({ where: { marketingLeadId: { in: marketingLeadIds } } })).count;
      result.marketingLeads = (await tx.marketingLead.deleteMany({ where: { id: { in: marketingLeadIds } } })).count;
    }

    if (opportunityIds.length) {
      result.stageHistory = (await tx.leadStageHistory.deleteMany({ where: { leadId: { in: opportunityIds } } })).count;
      result.participants = (await tx.crmLeadParticipant.deleteMany({ where: { leadId: { in: opportunityIds } } })).count;
      result.leadFollowups = (await tx.leadFollowup.deleteMany({ where: { leadId: { in: opportunityIds } } })).count;
      result.opportunities = (await tx.crmLead.deleteMany({ where: { id: { in: opportunityIds } } })).count;
    }

    if (contactIds.length) {
      result.contactFollowups = (await tx.contactFollowup.deleteMany({ where: { contactId: { in: contactIds } } })).count;
      result.contacts = (await tx.contact.deleteMany({ where: { id: { in: contactIds } } })).count;
    }

    if (organizationIds.length) {
      result.nurtures = (await tx.organizationNurture.deleteMany({ where: { organizationId: { in: organizationIds } } })).count;
      result.lifecycleHistory = (await tx.organizationLifecycleHistory.deleteMany({ where: { organizationId: { in: organizationIds } } })).count;
      result.organizationRoles = (await tx.organizationRole.deleteMany({ where: { organizationId: { in: organizationIds } } })).count;
      result.organizations = (await tx.organization.deleteMany({ where: { id: { in: organizationIds } } })).count;
    }
    return result;
  });

  console.log(JSON.stringify({ scope: { userIds, marketingLeadIds, opportunityIds, contactIds, organizationIds }, removed }, null, 2));
} finally {
  await prisma.$disconnect();
}
