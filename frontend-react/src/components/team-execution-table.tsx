import { Avatar, Empty, Table } from "@douyinfe/semi-ui";
import type { ColumnProps } from "@douyinfe/semi-ui/lib/es/table";

import { DashboardDataTable } from "@/components/dashboard-composition";
import type { TeamRow } from "@/lib/dashboard";

const columns: ColumnProps<TeamRow>[] = [
  {
    dataIndex: "user.name",
    title: "成员",
    fixed: "left",
    width: 160,
    render: (_value, row) => <div className="crm-team-member"><Avatar size="extra-small" color="grey">{row.user.name.slice(0, 1)}</Avatar><span>{row.user.name}</span></div>,
  },
  { dataIndex: "newMarketingLeads", title: "新增线索" },
  { dataIndex: "mql", title: "MQL" },
  { dataIndex: "sql", title: "SQL" },
  { dataIndex: "newOpportunities", title: "新增商机" },
  { dataIndex: "wonOpportunities", title: "成交商机" },
  { dataIndex: "interactions", title: "互动" },
  { dataIndex: "overdueTasks", title: "逾期任务" },
  { dataIndex: "staleLeads", title: "停滞商机" },
  {
    dataIndex: "opportunitiesWithNextAction",
    title: "有下一步行动",
    render: (_value, row) => row.activeOpportunities ? `${row.opportunitiesWithNextAction}/${row.activeOpportunities}` : "—",
  },
];

export function TeamExecutionTable({ rows }: { rows: TeamRow[] }) {
  return (
    <DashboardDataTable title="成员表现" description={`${rows.length} 位成员，按负责人归属统计线索、商机、互动与执行质量`}>
      <Table<TeamRow> className="dashboard-data-table" rowKey="user.id" columns={columns} dataSource={rows} pagination={false} size="small" scroll={{ x: 1040 }} empty={<Empty title="当前筛选下暂无团队数据" />} />
    </DashboardDataTable>
  );
}
