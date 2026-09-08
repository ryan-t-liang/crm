import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table"

import { DashboardDataTable } from "@/components/dashboard-composition"
import { Avatar, AvatarFallback } from "@/components/v1/ui"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/v1/ui"
import type { TeamRow } from "@/lib/dashboard"

const columns: ColumnDef<TeamRow>[] = [
  {
    accessorKey: "user.name",
    header: "成员",
    cell: ({ row }) => (
      <div className="flex min-w-36 items-center gap-2.5">
        <Avatar className="size-7 rounded-[8px]">
          <AvatarFallback className="rounded-[8px] bg-muted text-[11px]">{row.original.user.name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <span className="font-medium">{row.original.user.name}</span>
      </div>
    ),
  },
  { accessorKey: "newMarketingLeads", header: "新增线索" },
  { accessorKey: "mql", header: "MQL" },
  { accessorKey: "sql", header: "SQL" },
  { accessorKey: "newOpportunities", header: "新增商机" },
  { accessorKey: "wonOpportunities", header: "成交商机" },
  { accessorKey: "interactions", header: "互动" },
  { accessorKey: "overdueTasks", header: "逾期任务" },
  { accessorKey: "staleLeads", header: "停滞商机" },
  {
    accessorKey: "opportunitiesWithNextAction",
    header: "有下一步行动",
    cell: ({ row }) => row.original.activeOpportunities
      ? `${row.original.opportunitiesWithNextAction}/${row.original.activeOpportunities}`
      : "—",
  },
]

export function TeamExecutionTable({ rows }: { rows: TeamRow[] }) {
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <DashboardDataTable title="成员表现" description={`${rows.length} 位成员，按负责人归属统计线索、商机、互动与执行质量`}>
        <Table className="min-w-[1040px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="whitespace-nowrap tabular-nums">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            )) : <TableRow><TableCell colSpan={columns.length} className="dashboard-empty-row">当前筛选下暂无团队数据。</TableCell></TableRow>}
          </TableBody>
        </Table>
    </DashboardDataTable>
  )
}
