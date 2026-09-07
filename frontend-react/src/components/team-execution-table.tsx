import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
  { accessorKey: "leadsWithNextActionPercent", header: "有下一步行动", cell: ({ getValue }) => `${getValue<number>()}%` },
  { accessorKey: "mqlToSqlPercent", header: "MQL → SQL", cell: ({ getValue }) => `${getValue<number>()}%` },
  { accessorKey: "sqlToOpportunityPercent", header: "SQL → 商机", cell: ({ getValue }) => `${getValue<number>()}%` },
]

export function TeamExecutionTable({ rows }: { rows: TeamRow[] }) {
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

  if (!rows.length) return null

  return (
    <Card className="gap-0 overflow-hidden border-border/90 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="text-base">团队表现</CardTitle>
        <CardDescription>按负责人归属统计线索、商机、互动与执行质量，不含金额排名</CardDescription>
      </CardHeader>
      <div className="max-w-full overflow-x-auto">
        <Table className="min-w-[1180px]">
          <TableHeader className="bg-muted/35">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="h-10 hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-10 whitespace-nowrap px-4 text-xs font-medium">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="h-11">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="whitespace-nowrap px-4 py-2 text-[13px] tabular-nums">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}
