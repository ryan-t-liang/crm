import { Activity } from "lucide-react";
import { can, dateTime, type JourneyEvent } from "@/lib/crm";
import type { SessionUser } from "@/lib/api";
import { AttachmentList } from "./attachment-list";
import { EmptyState } from "./primitives";

export function Timeline({
  events,
  contactId,
  me,
}: {
  events: JourneyEvent[];
  contactId?: string;
  me?: SessionUser;
}) {
  if (!events.length) return <EmptyState title="暂无客户旅程" />;
  return (
    <ol className="divide-y">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3 py-4">
          <Activity className="mt-1 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{event.title}</span>
              <time className="text-xs text-muted-foreground">
                {dateTime(event.occurredAt)}
              </time>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
              {event.summary}
            </p>
            {(event.progress || event.nextAction || event.nextFollowupAt) && (
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {event.progress && (
                  <p className="whitespace-pre-wrap break-words">
                    进展：{event.progress}
                  </p>
                )}
                {event.nextAction && (
                  <p className="whitespace-pre-wrap break-words">
                    下一步：{event.nextAction}
                  </p>
                )}
                {event.nextFollowupAt && (
                  <p>下次跟进：{dateTime(event.nextFollowupAt)}</p>
                )}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {event.actor?.name && <span>{event.actor.name}</span>}
              {event.relatedContactId && (
                <a
                  className="hover:underline"
                  href={`#contacts/${event.relatedContactId}`}
                >
                  关联联系人
                </a>
              )}
              {event.relatedLeadId && (
                <a
                  className="hover:underline"
                  href={`#leads/${event.relatedLeadId}`}
                >
                  关联商机
                </a>
              )}
            </div>
            {event.relatedLead && !event.relatedLead.deleted && (
              <a
                href={`#leads/${event.relatedLead.id}`}
                className="mt-2 block text-xs text-muted-foreground hover:underline"
              >
                {event.relatedLead.requirementSummary}
              </a>
            )}
            {!!event.attachments?.length &&
              contactId &&
              me &&
              can(
                me,
                event.attachments[0].entityType === "LEAD"
                  ? "crm.lead.view"
                  : event.attachments[0].entityType === "CONTACT"
                    ? "crm.contact.view"
                    : event.relatedLead
                      ? "crm.lead_followup.view"
                      : "crm.contact_followup.view",
              ) && (
                <div className="mt-4">
                  <AttachmentList
                    files={event.attachments}
                    endpoint={
                      event.attachments[0].entityType === "LEAD"
                        ? `/api/v1/crm/leads/${event.attachments[0].entityId}`
                        : event.attachments[0].entityType === "CONTACT"
                          ? `/api/v1/crm/contacts/${contactId}`
                          : event.relatedLead
                            ? `/api/v1/crm/leads/${event.relatedLead.id}/followups/${event.attachments[0].entityId}`
                            : `/api/v1/crm/contacts/${contactId}/followups/${event.attachments[0].entityId}`
                    }
                    title="本次互动附件"
                  />
                </div>
              )}
          </div>
        </li>
      ))}
    </ol>
  );
}
