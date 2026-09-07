import { useState } from "react";
import { dateTime, queryString, useResource, type PageResult } from "@/lib/crm";
import { DataTable } from "./data-table";
import { ErrorState } from "./primitives";
import { auditActionLabel } from "@/lib/product-language";

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
export function EntityAudit({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const result = useResource<PageResult<AuditRow>>(
    `/api/v1/audit-logs?${queryString({ targetId: id, page, pageSize: 20 })}`,
  );
  if (result.error)
    return <ErrorState error={result.error} retry={result.reload} />;
  return (
    <DataTable
      label="操作记录"
      rows={result.data?.data || []}
      loading={result.loading}
      page={page}
      total={result.data?.meta.total}
      onPage={setPage}
      columns={[
        {
          id: "action",
          header: "操作",
          cell: ({ row }) => auditActionLabel(row.original.action),
        },
        {
          id: "actor",
          header: "操作者",
          cell: ({ row }) =>
            row.original.actorName || row.original.actorUserId || "系统",
        },
        {
          id: "time",
          header: "时间",
          cell: ({ row }) => dateTime(row.original.createdAt),
        },
      ]}
    />
  );
}
