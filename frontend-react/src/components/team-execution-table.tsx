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
  { accessorKey: "openTasks", header: "Open" },
  { accessorKey: "doneTasks", header: "Done" },
  { accessorKey: "overdueTasks", header: "Overdue" },
  { accessorKey: "onTimeCompletionPercent", header: "On-time", cell: ({ getValue }) => `${getValue<number>()}%` },
  { accessorKey: "interactions", header: "互动" },
  { accessorKey: "activeLeads", header: "Active Leads" },
  { accessorKey: "staleLeads", header: "Stale" },
  { accessorKey: "leadsWithNextActionPercent", header: "有下一动作", cell: ({ getValue }) => `${getValue<number>()}%` },
]

export function TeamExecutionTable({ rows }: { rows: TeamRow[] }) {
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

  if (!rows.length) return null

  return (
    <Card className="gap-0 overflow-hidden border-border/90 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="text-base">团队执行</CardTitle>
        <CardDescription>按人员查看任务、互动、活跃与停滞，不含金额排名</CardDescription>
      </CardHeader>
      <div className="max-w-full overflow-x-auto">
        <Table className="min-w-[860px]">
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
