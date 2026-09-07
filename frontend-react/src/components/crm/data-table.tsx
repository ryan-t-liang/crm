import { useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { EmptyState, LoadingSkeleton } from "./primitives";

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  toolbar,
  page = 1,
  pageSize = 20,
  total,
  onPage,
  loading,
  emptyTitle,
  emptyAction,
  label = "数据目录",
}: {
  columns: ColumnDef<T>[];
  rows: T[];
  toolbar?: ReactNode;
  page?: number;
  pageSize?: number;
  total?: number;
  onPage?: (n: number) => void;
  loading?: boolean;
  emptyTitle?: string;
  emptyAction?: ReactNode;
  label?: string;
}) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  });
  const pages = Math.max(1, Math.ceil((total ?? rows.length) / pageSize));
  return (
    <div className="min-w-0 space-y-3">
      <div
        role="toolbar"
        aria-label={`${label}工具栏`}
        className="flex flex-wrap items-center gap-2"
      >
        {toolbar}
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="shadow-none">
                <Columns3 />列
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(v) => column.toggleVisibility(v)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {typeof column.columnDef.header === "string"
                      ? column.columnDef.header
                      : column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="min-w-0 overflow-hidden rounded-xl border">
        {loading ? (
          <div className="p-4">
            <LoadingSkeleton />
          </div>
        ) : (
          <Table aria-label={label}>
            <TableHeader className="bg-muted/30">
              <TableRow>
                {table.getHeaderGroups()[0].headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={`h-10 whitespace-nowrap px-4 text-xs font-medium text-muted-foreground ${header.column.id === "actions" ? "sticky right-0 z-10 bg-background" : ""}`}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="h-11 hover:bg-muted/30">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={`px-4 py-2 text-sm ${cell.column.id === "actions" ? "sticky right-0 bg-background" : ""}`}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!loading && !rows.length && (
          <EmptyState
            title={emptyTitle}
            description="试试调整筛选条件，或添加一条新记录。"
            action={emptyAction}
          />
        )}
        {onPage && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
            <span>共 {total ?? rows.length} 条</span>
            <div className="flex items-center gap-3">
              <span>
                {page} / {pages} 页
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="上一页"
                disabled={page <= 1 || loading}
                onClick={() => onPage(page - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="下一页"
                disabled={page >= pages || loading}
                onClick={() => onPage(page + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
