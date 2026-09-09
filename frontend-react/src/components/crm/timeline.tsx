import { can, dateTime, type JourneyEvent } from "@/lib/crm";
import type { SessionUser } from "@/lib/api";
import { AttachmentList } from "./attachment-list";
import { productEventText } from "@/lib/product-language";
import { CRMActivityTimeline } from "./interaction-patterns";

export function Timeline({
  events,
  contactId,
  me,
}: {
  events: JourneyEvent[];
  contactId?: string;
  me?: SessionUser;
}) {
  return (
    <CRMActivityTimeline
      items={events.map((event) => ({
        id: event.id,
        time: <time dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time>,
        title: productEventText(event.title),
        meta: (
          <>
            {event.actor?.name ? <span>{event.actor.name}</span> : null}
            {event.relatedContactId ? <a href={`#contacts/${event.relatedContactId}`}>关联联系人</a> : null}
            {event.relatedLeadId ? <a href={`#leads/${event.relatedLeadId}`}>关联商机</a> : null}
          </>
        ),
        content: <p>{productEventText(event.summary)}</p>,
        detail: (
          <>
            {(event.progress || event.nextAction || event.nextFollowupAt) ? (
              <dl className="crm-pattern-timeline-fields">
                {event.progress ? <div><dt>进展</dt><dd>{event.progress}</dd></div> : null}
                {event.nextAction ? <div><dt>下一步</dt><dd>{event.nextAction}</dd></div> : null}
                {event.nextFollowupAt ? <div><dt>下次跟进</dt><dd>{dateTime(event.nextFollowupAt)}</dd></div> : null}
              </dl>
            ) : null}
            {event.relatedLead && !event.relatedLead.deleted ? <a href={`#leads/${event.relatedLead.id}`}>{event.relatedLead.requirementSummary}</a> : null}
            {!!event.attachments?.length && contactId && me && can(
              me,
              event.attachments[0].entityType === "LEAD"
                ? "crm.lead.view"
                : event.attachments[0].entityType === "CONTACT"
                  ? "crm.contact.view"
                  : event.relatedLead
                    ? "crm.lead_followup.view"
                    : "crm.contact_followup.view",
            ) ? (
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
            ) : null}
          </>
        ),
      }))}
    />
  );
}
