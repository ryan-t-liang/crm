import {
  IconActivity,
  IconArrowRight,
  IconCalendarClockStroked,
} from "@douyinfe/semi-icons";
import { List } from "@douyinfe/semi-ui";

import type { CrmUser } from "@/lib/api";
import type { JourneyEvent } from "@/lib/crm";
import { productEventText } from "@/lib/product-language";
import { Button } from "./ui";
import { OwnerCell, RelativeDateCell } from "./cells";
import { CRMEmptyState, CRMRecordListItem } from "./interaction-patterns";
import {
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
  onScheduleTask,
}: {
  contact: ContactOverviewRecord;
  journey?: ContactOverviewJourney;
  journeyLoading: boolean;
  journeyError?: unknown;
  retryJourney: () => void;
  canViewOpportunities: boolean;
  onOpenJourney: () => void;
  onOpenOpportunities: () => void;
  onScheduleTask?: () => void;
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
  const nextFollowupAt =
    nextActionEvent?.nextFollowupAt || journey?.summary.nextFollowupAt;

  return (
    <div className="crm-contact-overview">
      <section className="crm-contact-next-action" aria-labelledby="contact-next-action-title">
        <header className="crm-contact-overview-section-header">
          <h2 id="contact-next-action-title">下一步</h2>
          {onScheduleTask ? (
            <Button variant="ghost" size="sm" onClick={onScheduleTask}>
              {nextActionEvent ? "调整任务" : "安排任务"}
            </Button>
          ) : null}
        </header>
        {nextActionEvent ? (
          <div className="crm-contact-next-action-content">
            <span className="crm-contact-next-action-icon" aria-hidden="true"><IconCalendarClockStroked /></span>
            <div>
              <RelativeDateCell value={nextFollowupAt} emptyLabel="时间待确认" />
              <strong>{nextActionEvent.nextAction || "后续行动待补充"}</strong>
              <OwnerCell name={nextActionEvent.actor?.name || contact.owner?.name} />
            </div>
          </div>
        ) : (
          <CRMEmptyState
            compact
            title="暂无下一步行动"
            action={onScheduleTask ? <Button variant="link" size="sm" onClick={onScheduleTask}>安排任务</Button> : undefined}
          />
        )}
      </section>

      <Section
        title="最近活动"
        action={
          <Button variant="ghost" size="sm" onClick={onOpenJourney}>
            查看完整旅程
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
                <CRMEmptyState
                  compact
                  title="暂无客户活动"
                  description="记录一次跟进后，活动会显示在这里。"
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
        title="关联商机"
        action={canViewOpportunities ? (
          <Button variant="ghost" size="sm" onClick={onOpenOpportunities}>
            查看全部
            <IconArrowRight />
          </Button>
        ) : undefined}
      >
        {canViewOpportunities && latestOpportunityEvent?.relatedLead ? (
          <div className="crm-pattern-record-list">
            <CRMRecordListItem
              title={latestOpportunityEvent.relatedLead.requirementSummary}
              href={`#leads/${latestOpportunityEvent.relatedLead.id}`}
              meta={<><StatusBadge>{opportunityCount} 个关联商机</StatusBadge><span>{activeOpportunityCount ?? "—"} 个进行中 · {wonOpportunityCount ?? "—"} 个已成交</span></>}
              detail="最近关联商机"
              aside={<RelativeDateCell value={latestOpportunityEvent.occurredAt} />}
            />
          </div>
        ) : (
          <CRMEmptyState
            compact
            title={canViewOpportunities ? "暂无关联商机" : "当前账号无查看权限"}
            description={canViewOpportunities ? "该联系人尚未进入正式商机阶段。" : undefined}
            action={canViewOpportunities ? <Button variant="link" size="sm" onClick={onOpenOpportunities}>查看商机</Button> : undefined}
          />
        )}
      </Section>
    </div>
  );
}
