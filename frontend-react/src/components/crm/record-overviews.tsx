import type { ReactNode } from "react";
import {
  IconActivity,
  IconApartment,
  IconArrowRight,
  IconBriefcaseStroked,
  IconCalendarClockStroked,
  IconFlagStroked,
  IconUserCircleStroked,
} from "@douyinfe/semi-icons";
import { List } from "@douyinfe/semi-ui";

import type { CrmUser, SessionUser } from "@/lib/api";
import {
  businessRelationText,
  can,
  type JourneyEvent,
  type MarketingLead,
  type Organization,
  type PageResult,
  useResource,
} from "@/lib/crm";
import { productEventText } from "@/lib/product-language";
import { NextActionCell, OwnerCell, RelativeDateCell } from "./cells";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Section,
  StatusBadge,
} from "./primitives";
import { Button } from "./ui";

type OverviewEvent = {
  id: string;
  at?: string | null;
  title: string;
  detail?: string | null;
  meta?: ReactNode;
  href?: string;
  hrefLabel?: string;
};

function OverviewActivityList({
  events,
  loading = false,
  error,
  retry,
  emptyTitle,
}: {
  events: OverviewEvent[];
  loading?: boolean;
  error?: unknown;
  retry?: () => void;
  emptyTitle: string;
}) {
  if (error) return <ErrorState error={error} retry={retry} />;
  if (loading) return <LoadingSkeleton />;

  return (
    <List<OverviewEvent>
      className="crm-overview-activity-list"
      dataSource={events.slice(0, 3)}
      emptyContent={
        <EmptyState
          title={emptyTitle}
          description="后续业务动作会在这里形成连续记录。"
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
                <strong>{event.title}</strong>
                <RelativeDateCell value={event.at} />
              </div>
              {event.detail && <p>{event.detail}</p>}
              {(event.meta || event.href) && (
                <div className="crm-overview-activity-meta">
                  {event.meta}
                  {event.href && (
                    <a href={event.href}>{event.hrefLabel || "查看关联记录"}</a>
                  )}
                </div>
              )}
            </div>
          }
        />
      )}
    />
  );
}

function OverviewAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      {children}
      <IconArrowRight />
    </Button>
  );
}

export function OrganizationOverview({
  organization,
  events,
  journeyLoading,
  journeyError,
  retryJourney,
  onOpenJourney,
  onOpenOpportunities,
}: {
  organization: Organization;
  events: JourneyEvent[];
  journeyLoading: boolean;
  journeyError?: unknown;
  retryJourney: () => void;
  onOpenJourney: () => void;
  onOpenOpportunities: () => void;
}) {
  const recentEvents = events.map((event) => ({
    id: event.id,
    at: event.occurredAt,
    title: productEventText(event.title),
    detail: productEventText(event.summary),
    meta: event.actor?.name,
    href: event.relatedLead && !event.relatedLead.deleted
      ? `#leads/${event.relatedLead.id}`
      : undefined,
    hrefLabel: event.relatedLead?.requirementSummary,
  }));
  const latestOpportunity = organization.leads.find(
    (lead) => !["WON", "LOST"].includes(lead.status),
  ) || organization.leads[0];

  return (
    <div className="crm-record-overview">
      <section className="crm-contact-brief" aria-labelledby="organization-overview-brief">
        <header className="crm-contact-brief-header">
          <div>
            <span className="crm-overview-eyebrow">组织简报</span>
            <h2 id="organization-overview-brief">关系、负责人和下一步</h2>
          </div>
          <StatusBadge>{businessRelationText(organization.roleKeys)}</StatusBadge>
        </header>
        <div className="crm-contact-brief-grid">
          <div className="crm-contact-brief-item">
            <div className="crm-contact-brief-label">
              <IconUserCircleStroked />
              组织负责人
            </div>
            <OwnerCell name={organization.owner?.name} />
            <span className="crm-contact-brief-secondary">
              {organization.industryCustom || organization.industry || "行业信息待补充"}
            </span>
          </div>
          <div className="crm-contact-brief-item">
            <div className="crm-contact-brief-label">
              <IconActivity />
              最近互动
            </div>
            <span className="crm-contact-brief-primary">
              <RelativeDateCell value={organization.lastInteractionAt} emptyLabel="暂无互动" />
            </span>
            <span className="crm-contact-brief-secondary">
              {organization.activeLeadCount} 个活跃商机
            </span>
          </div>
          <div className="crm-contact-brief-item is-next-action">
            <div className="crm-contact-brief-label">
              <IconCalendarClockStroked />
              下一步行动
            </div>
            <NextActionCell
              title={organization.nextTask?.title}
              date={organization.nextActionAt}
              overdue={Boolean(
                organization.nextActionAt && Date.parse(organization.nextActionAt) < Date.now(),
              )}
            />
          </div>
        </div>
      </section>

      <div className="crm-record-overview-grid">
        <Section
          title="最近活动"
          action={<OverviewAction onClick={onOpenJourney}>完整旅程</OverviewAction>}
        >
          <OverviewActivityList
            events={recentEvents}
            loading={journeyLoading}
            error={journeyError}
            retry={retryJourney}
            emptyTitle="暂无组织活动"
          />
        </Section>
        <Section
          title="业务关系"
          action={<OverviewAction onClick={onOpenOpportunities}>查看商机</OverviewAction>}
        >
          <div className="crm-opportunity-pulse">
            <div className="crm-opportunity-pulse-total">
              <span className="crm-opportunity-pulse-icon" aria-hidden="true">
                <IconApartment />
              </span>
              <div>
                <strong>{organization.contactCount}</strong>
                <span>关联联系人</span>
              </div>
            </div>
            <dl className="crm-opportunity-pulse-stats">
              <div>
                <dt>线索</dt>
                <dd>{organization.marketingLeadCount || 0}</dd>
              </div>
              <div>
                <dt>成交商机</dt>
                <dd>{organization.wonLeadCount}</dd>
              </div>
            </dl>
            <div className="crm-opportunity-pulse-latest">
              <span>当前重点商机</span>
              {latestOpportunity ? (
                <a href={`#leads/${latestOpportunity.id}`}>
                  {latestOpportunity.requirementSummary}
                </a>
              ) : (
                <strong>暂无关联商机</strong>
              )}
              {latestOpportunity && (
                <StatusBadge>{latestOpportunity.status}</StatusBadge>
              )}
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

export type MarketingLeadOverviewEvent = OverviewEvent;

export function MarketingLeadOverview({
  lead,
  events,
  statusLabel,
  sourceLabel,
  fitLevelLabel,
  engagementLevelLabel,
  leadLevelLabel,
  onOpenJourney,
  onOpenDetails,
}: {
  lead: MarketingLead;
  events: MarketingLeadOverviewEvent[];
  statusLabel: string;
  sourceLabel: string;
  fitLevelLabel: string;
  engagementLevelLabel: string;
  leadLevelLabel: string;
  onOpenJourney: () => void;
  onOpenDetails: () => void;
}) {
  return (
    <div className="crm-record-overview">
      <section className="crm-contact-brief" aria-labelledby="marketing-lead-overview-brief">
        <header className="crm-contact-brief-header">
          <div>
            <span className="crm-overview-eyebrow">资格简报</span>
            <h2 id="marketing-lead-overview-brief">来源、归属与当前状态</h2>
          </div>
          <StatusBadge>{statusLabel}</StatusBadge>
        </header>
        <div className="crm-contact-brief-grid">
          <div className="crm-contact-brief-item">
            <div className="crm-contact-brief-label">
              <IconFlagStroked />
              获客来源
            </div>
            <span className="crm-contact-brief-primary">{sourceLabel}</span>
            <span className="crm-contact-brief-secondary">
              {lead.sourceDetail || lead.companyName || "来源详情待补充"}
            </span>
          </div>
          <div className="crm-contact-brief-item">
            <div className="crm-contact-brief-label">
              <IconUserCircleStroked />
              线索负责人
            </div>
            <OwnerCell name={lead.owner?.name} />
            <span className="crm-contact-brief-secondary">
              {lead.assignedAt ? "已完成分配" : "等待负责人认领"}
            </span>
          </div>
          <div className="crm-contact-brief-item is-next-action">
            <div className="crm-contact-brief-label">
              <IconActivity />
              最近行为
            </div>
            <span className="crm-contact-brief-primary">
              <RelativeDateCell value={lead.lastActivityAt} emptyLabel="暂无行为" />
            </span>
            <span className="crm-contact-brief-secondary">
              当前生命周期：{statusLabel}
            </span>
          </div>
        </div>
      </section>

      <div className="crm-record-overview-grid">
        <Section
          title="最近活动"
          action={<OverviewAction onClick={onOpenJourney}>完整旅程</OverviewAction>}
        >
          <OverviewActivityList events={events} emptyTitle="暂无线索活动" />
        </Section>
        <Section
          title="资格与需求"
          action={<OverviewAction onClick={onOpenDetails}>需求信息</OverviewAction>}
        >
          <div className="crm-opportunity-pulse">
            <div className="crm-opportunity-pulse-total">
              <span className="crm-opportunity-pulse-icon" aria-hidden="true">
                <IconFlagStroked />
              </span>
              <div>
                <strong>{lead.fitScore}</strong>
                <span>线索匹配度 · {fitLevelLabel}</span>
              </div>
            </div>
            <dl className="crm-opportunity-pulse-stats">
              <div>
                <dt>互动活跃度</dt>
                <dd>{lead.engagementScoreCached}</dd>
              </div>
              <div>
                <dt>线索热度</dt>
                <dd className="is-text">{leadLevelLabel}</dd>
              </div>
            </dl>
            <div className="crm-opportunity-pulse-latest">
              <span>询盘摘要 · {engagementLevelLabel}</span>
              <strong title={lead.inquiryContent || undefined}>
                {lead.inquiryContent || lead.productInterest || "尚未填写询盘内容"}
              </strong>
              <small>
                {lead.requirementTags?.length
                  ? lead.requirementTags.slice(0, 3).join(" · ")
                  : lead.productInterest || "需求标签待补充"}
              </small>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

type OpportunityOverviewRecord = {
  id: string;
  status?: string;
  priority?: string;
  latestProgress?: string;
  nextAction?: string;
  nextFollowupAt?: string;
  lastFollowupAt?: string;
  salesOwner?: CrmUser;
  contactId: string;
  contact?: {
    contactName: string;
    organizationId?: string;
    organization?: { id: string; name: string; shortName?: string };
    companyName?: string;
  };
  sourceMarketingLead?: {
    id: string;
    fullName: string;
    companyName?: string;
  };
};

type OpportunityFollowup = {
  id: string;
  occurredAt: string;
  content: string;
  progress?: string;
  nextAction?: string;
  owner?: CrmUser;
};

export function OpportunityOverview({
  opportunity,
  me,
  stageLabel,
  priorityLabel,
  onOpenFollowups,
  onOpenRequirement,
}: {
  opportunity: OpportunityOverviewRecord;
  me: SessionUser;
  stageLabel: string;
  priorityLabel: string;
  onOpenFollowups: () => void;
  onOpenRequirement: () => void;
}) {
  const canViewFollowups = can(me, "crm.lead_followup.view");
  const followups = useResource<PageResult<OpportunityFollowup>>(
    canViewFollowups
      ? `/api/v1/crm/leads/${opportunity.id}/followups?page=1&pageSize=3`
      : null,
  );
  const organizationName = opportunity.contact?.organization?.shortName
    || opportunity.contact?.organization?.name
    || opportunity.contact?.companyName
    || "未关联组织";
  const organizationId = opportunity.contact?.organizationId
    || opportunity.contact?.organization?.id;
  const recentFollowups = (followups.data?.data || []).map((followup) => ({
    id: followup.id,
    at: followup.occurredAt,
    title: followup.progress || "商机跟进",
    detail: followup.content,
    meta: followup.owner?.name,
  }));

  return (
    <div className="crm-record-overview">
      <section className="crm-contact-brief" aria-labelledby="opportunity-overview-brief">
        <header className="crm-contact-brief-header">
          <div>
            <span className="crm-overview-eyebrow">推进简报</span>
            <h2 id="opportunity-overview-brief">业务关系、负责人和下一步</h2>
          </div>
          <StatusBadge>{stageLabel}</StatusBadge>
        </header>
        <div className="crm-contact-brief-grid">
          <div className="crm-contact-brief-item">
            <div className="crm-contact-brief-label">
              <IconApartment />
              联系人与组织
            </div>
            <a className="crm-contact-brief-primary" href={`#contacts/${opportunity.contactId}`}>
              {opportunity.contact?.contactName || "查看联系人"}
            </a>
            {organizationId ? (
              <a className="crm-contact-brief-secondary" href={`#organizations/${organizationId}`}>
                {organizationName}
              </a>
            ) : (
              <span className="crm-contact-brief-secondary">{organizationName}</span>
            )}
          </div>
          <div className="crm-contact-brief-item">
            <div className="crm-contact-brief-label">
              <IconUserCircleStroked />
              商机负责人
            </div>
            <OwnerCell name={opportunity.salesOwner?.name} />
            <span className="crm-contact-brief-secondary">优先级：{priorityLabel}</span>
          </div>
          <div className="crm-contact-brief-item is-next-action">
            <div className="crm-contact-brief-label">
              <IconCalendarClockStroked />
              下一步行动
            </div>
            <NextActionCell
              title={opportunity.nextAction}
              date={opportunity.nextFollowupAt}
              overdue={Boolean(
                opportunity.nextFollowupAt
                && Date.parse(opportunity.nextFollowupAt) < Date.now(),
              )}
            />
          </div>
        </div>
      </section>

      <div className="crm-record-overview-grid">
        <Section
          title="最近跟进"
          action={canViewFollowups
            ? <OverviewAction onClick={onOpenFollowups}>完整记录</OverviewAction>
            : undefined}
        >
          {canViewFollowups ? (
            <OverviewActivityList
              events={recentFollowups}
              loading={followups.loading}
              error={followups.error}
              retry={followups.reload}
              emptyTitle="暂无商机跟进"
            />
          ) : (
            <EmptyState
              title="无法查看跟进记录"
              description="当前账号没有商机跟进查看权限。"
            />
          )}
        </Section>
        <Section
          title="推进概览"
          action={<OverviewAction onClick={onOpenRequirement}>需求与方案</OverviewAction>}
        >
          <div className="crm-opportunity-pulse">
            <div className="crm-opportunity-pulse-total">
              <span className="crm-opportunity-pulse-icon" aria-hidden="true">
                <IconBriefcaseStroked />
              </span>
              <div>
                <strong className="is-text">{stageLabel}</strong>
                <span>当前商机阶段</span>
              </div>
            </div>
            <dl className="crm-opportunity-pulse-stats">
              <div>
                <dt>优先级</dt>
                <dd className="is-text">{priorityLabel}</dd>
              </div>
              <div>
                <dt>最近沟通</dt>
                <dd className="is-date"><RelativeDateCell value={opportunity.lastFollowupAt} /></dd>
              </div>
            </dl>
            <div className="crm-opportunity-pulse-latest">
              <span>最新进展</span>
              <strong>{opportunity.latestProgress || "暂无进展记录"}</strong>
              {opportunity.sourceMarketingLead && (
                <a href={`#marketing-leads/${opportunity.sourceMarketingLead.id}`}>
                  来源线索：{opportunity.sourceMarketingLead.fullName}
                </a>
              )}
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
