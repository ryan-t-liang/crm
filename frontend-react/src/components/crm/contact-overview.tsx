import {
  IconActivity,
  IconApartment,
  IconArrowRight,
  IconBriefcaseStroked,
  IconCalendarClockStroked,
  IconUserCircleStroked,
} from "@douyinfe/semi-icons";
import { List } from "@douyinfe/semi-ui";

import type { CrmUser } from "@/lib/api";
import type { JourneyEvent } from "@/lib/crm";
import { productEventText } from "@/lib/product-language";
import { Button } from "./ui";
import { NextActionCell, OwnerCell, RelativeDateCell } from "./cells";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Section,
  StatusBadge,
} from "./primitives";

type ContactOverviewJourney = {
  events: JourneyEvent[];
  summary: {
    activeLeadCount?: number;
    wonLeadCount?: number;
    recentInteractionAt?: string;
    nextFollowupAt?: string;
  };
};

type ContactOverviewRecord = {
  id: string;
  contactType?: string;
  title?: string;
  department?: string;
  organizationId?: string;
  organization?: { id: string; name: string; shortName?: string };
  companyName?: string;
  relatedLeadCount?: number;
  owner?: CrmUser;
};

export function ContactOverview({
  contact,
  journey,
  journeyLoading,
  journeyError,
  retryJourney,
  canViewOpportunities,
  onOpenJourney,
  onOpenOpportunities,
}: {
  contact: ContactOverviewRecord;
  journey?: ContactOverviewJourney;
  journeyLoading: boolean;
  journeyError?: unknown;
  retryJourney: () => void;
  canViewOpportunities: boolean;
  onOpenJourney: () => void;
  onOpenOpportunities: () => void;
}) {
  const events = journey?.events || [];
  const nextActionEvent = events.find(
    (event) => event.nextAction || event.nextFollowupAt,
  );
  const latestOpportunityEvent = events.find(
    (event) => event.relatedLead && !event.relatedLead.deleted,
  );
  const opportunityCount = contact.relatedLeadCount ?? 0;
  const activeOpportunityCount = journey?.summary.activeLeadCount;
  const wonOpportunityCount = journey?.summary.wonLeadCount;
  const organizationName =
    contact.organization?.shortName ||
    contact.organization?.name ||
    contact.companyName ||
    "未关联组织";
  const nextFollowupAt =
    nextActionEvent?.nextFollowupAt || journey?.summary.nextFollowupAt;

  return (
    <div className="crm-contact-overview">
      <section className="crm-contact-brief" aria-labelledby="contact-relationship-brief">
        <header className="crm-contact-brief-header">
          <div>
            <span className="crm-overview-eyebrow">关系简报</span>
            <h2 id="contact-relationship-brief">联系人关系与下一步</h2>
          </div>
          <StatusBadge>
            {contact.contactType === "INDIVIDUAL" ? "个人联系人" : "企业联系人"}
          </StatusBadge>
        </header>
        <div className="crm-contact-brief-grid">
          <div className="crm-contact-brief-item">
            <div className="crm-contact-brief-label">
              <IconApartment />
              归属组织
            </div>
            {contact.organizationId ? (
              <a className="crm-contact-brief-primary" href={`#organizations/${contact.organizationId}`}>
                {organizationName}
              </a>
            ) : (
              <span className="crm-contact-brief-primary is-empty">{organizationName}</span>
            )}
            <span className="crm-contact-brief-secondary">
              {[contact.title, contact.department].filter(Boolean).join(" · ") || "职位信息待补充"}
            </span>
          </div>
          <div className="crm-contact-brief-item">
            <div className="crm-contact-brief-label">
              <IconUserCircleStroked />
              关系负责人
            </div>
            <OwnerCell name={contact.owner?.name} />
          </div>
          <div className="crm-contact-brief-item is-next-action">
            <div className="crm-contact-brief-label">
              <IconCalendarClockStroked />
              下一步行动
            </div>
            <NextActionCell
              title={nextActionEvent?.nextAction || "待安排后续行动"}
              date={nextFollowupAt}
              overdue={Boolean(
                nextFollowupAt && Date.parse(nextFollowupAt) < Date.now(),
              )}
            />
          </div>
        </div>
      </section>

      <div className="crm-contact-overview-grid">
        <Section
          title="最近活动"
          action={
            <Button variant="ghost" size="sm" onClick={onOpenJourney}>
              完整旅程
              <IconArrowRight />
            </Button>
          }
        >
          {journeyError ? (
            <ErrorState error={journeyError} retry={retryJourney} />
          ) : journeyLoading ? (
            <LoadingSkeleton />
          ) : (
            <List<JourneyEvent>
              className="crm-overview-activity-list"
              dataSource={events.slice(0, 3)}
              emptyContent={
                <EmptyState
                  title="暂无客户活动"
                  description="尚无可显示的互动记录。"
                />
              }
              renderItem={(event) => (
                <List.Item
                  className="crm-overview-activity-item"
                  header={
                    <span className="crm-overview-activity-icon" aria-hidden="true">
                      <IconActivity />
                    </span>
                  }
                  main={
                    <div className="crm-overview-activity-copy">
                      <div className="crm-overview-activity-title">
                        <strong>{productEventText(event.title)}</strong>
                        <RelativeDateCell value={event.occurredAt} />
                      </div>
                      <p>{productEventText(event.summary)}</p>
                      <div className="crm-overview-activity-meta">
                        {event.actor?.name && <span>{event.actor.name}</span>}
                        {event.relatedLead && !event.relatedLead.deleted && (
                          <a href={`#leads/${event.relatedLead.id}`}>
                            {event.relatedLead.requirementSummary}
                          </a>
                        )}
                      </div>
                    </div>
                  }
                />
              )}
            />
          )}
        </Section>

        <Section
          title="商机概览"
          action={
            canViewOpportunities ? (
              <Button variant="ghost" size="sm" onClick={onOpenOpportunities}>
                查看全部
                <IconArrowRight />
              </Button>
            ) : undefined
          }
        >
          <div className="crm-opportunity-pulse">
            <div className="crm-opportunity-pulse-total">
              <span className="crm-opportunity-pulse-icon" aria-hidden="true">
                <IconBriefcaseStroked />
              </span>
              <div>
                <strong>{opportunityCount}</strong>
                <span>关联商机</span>
              </div>
            </div>
            <dl className="crm-opportunity-pulse-stats">
              <div>
                <dt>进行中</dt>
                <dd>{activeOpportunityCount ?? "—"}</dd>
              </div>
              <div>
                <dt>已成交</dt>
                <dd>{wonOpportunityCount ?? "—"}</dd>
              </div>
            </dl>
            <div className="crm-opportunity-pulse-latest">
              <span>最近关联</span>
              {canViewOpportunities && latestOpportunityEvent?.relatedLead ? (
                <a href={`#leads/${latestOpportunityEvent.relatedLead.id}`}>
                  {latestOpportunityEvent.relatedLead.requirementSummary}
                </a>
              ) : (
                <strong>
                  {canViewOpportunities ? "暂无关联商机" : "当前账号无查看权限"}
                </strong>
              )}
              {latestOpportunityEvent && (
                <RelativeDateCell value={latestOpportunityEvent.occurredAt} />
              )}
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
