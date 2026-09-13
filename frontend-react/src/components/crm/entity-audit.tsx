import { useState } from "react";
import { Pagination } from "@douyinfe/semi-ui";

import { dateTime, queryString, useResource, type PageResult } from "@/lib/crm";
import { auditActionLabel } from "@/lib/product-language";
import { CRMActivityTimeline } from "./interaction-patterns";
import { ErrorState, LoadingSkeleton, Section } from "./primitives";

export type AuditRow = {
  id: string;
  action: string;
  actorName?: string;
  actorUserId?: string;
  module: string;
  targetType?: string;
  targetId?: string;
  createdAt: string;
  details?: unknown;
};

export function CRMAuditTrail({
  rows,
  loading = false,
  page,
  total,
  pageSize,
  onPage,
  description = "系统操作与业务旅程分开记录，便于追溯每次资料变更。",
  emptyTitle = "暂无操作记录",
}: {
  rows: AuditRow[];
  loading?: boolean;
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  description?: string;
  emptyTitle?: string;
}) {
  return (
    <Section title="操作记录">
      <p className="mb-4 text-xs text-muted-foreground">{description}</p>
      {loading ? (
        <LoadingSkeleton />
      ) : (
        <CRMActivityTimeline
          ariaLabel="系统操作记录时间线"
          emptyTitle={emptyTitle}
          emptyDescription="该记录当前没有可展示的系统操作历史。"
          items={rows.map((row) => ({
            id: row.id,
            actorName: row.actorName || row.actorUserId || "系统",
            actorVerb: "执行了系统操作",
            time: <time dateTime={row.createdAt}>{dateTime(row.createdAt)}</time>,
            title: auditActionLabel(row.action),
          }))}
        />
      )}
      {total > pageSize ? (
        <div className="crm-audit-trail-pagination">
          <Pagination
            currentPage={page}
            total={total}
            pageSize={pageSize}
            size="small"
            showSizeChanger={false}
            disabled={loading}
            onPageChange={onPage}
          />
        </div>
      ) : null}
    </Section>
  );
}

export function EntityAudit({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const result = useResource<PageResult<AuditRow>>(
    `/api/v1/audit-logs?${queryString({ targetId: id, page, pageSize })}`,
  );

  if (result.error) {
    return <ErrorState error={result.error} retry={result.reload} />;
  }

  return (
    <CRMAuditTrail
      rows={result.data?.data || []}
      loading={result.loading}
      page={page}
      total={result.data?.meta.total || 0}
      pageSize={pageSize}
      onPage={setPage}
    />
  );
}
