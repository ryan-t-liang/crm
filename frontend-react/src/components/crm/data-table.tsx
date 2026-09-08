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
import { Checkbox } from "@/components/ui/checkbox";
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
  selectable = false,
  selectedIds = [],
  onSelectedIdsChange,
  selectionActions,
  tableActions,
  primaryAction,
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
  selectable?: boolean;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  selectionActions?: ReactNode;
  tableActions?: ReactNode;
  primaryAction?: ReactNode;
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
  const selected = new Set(selectedIds);
  const pageIds = rows.map((row) => row.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));
  const setSelected = (ids: string[]) => onSelectedIdsChange?.([...new Set(ids)]);
  return (
    <div className="crm-data-table min-w-0 space-y-3">
      <div
        role="toolbar"
        aria-label={`${label}工具栏`}
        className="crm-data-toolbar flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3"
      >
        {toolbar}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {tableActions}
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
          {primaryAction}
        </div>
      </div>
      {selectable && selectedIds.length > 0 && (
        <div role="toolbar" aria-label="批量操作" className="crm-bulk-toolbar flex flex-wrap items-center gap-3 border-y px-3 py-2">
          <span className="text-sm font-medium">已选择 {selectedIds.length} 条</span>
          {selectionActions}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected([])}>取消选择</Button>
        </div>
      )}
      <div className="crm-table-shell min-w-0 overflow-hidden rounded-xl border bg-card">
        {loading ? (
          <div className="p-4">
            <LoadingSkeleton />
          </div>
        ) : (
          <Table aria-label={label}>
            <TableHeader className="crm-table-header">
              <TableRow>
                {selectable && (
                  <TableHead className="w-10 px-3">
                    <Checkbox
                      aria-label="选择本页"
                      checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                      onCheckedChange={(checked) => setSelected(checked === true ? [...selectedIds, ...pageIds] : selectedIds.filter((id) => !pageIds.includes(id)))}
                    />
                  </TableHead>
                )}
                {table.getHeaderGroups()[0].headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={`h-10 whitespace-nowrap px-4 text-xs font-medium text-muted-foreground ${header.column.id === "actions" ? "crm-sticky-actions sticky right-0 z-10" : ""}`}
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
                <TableRow key={row.id}>
                  {selectable && (
                    <TableCell className="w-10 px-3">
                      <Checkbox
                        aria-label={`选择 ${row.id}`}
                        checked={selected.has(row.id)}
                        onCheckedChange={(checked) => setSelected(checked === true ? [...selectedIds, row.id] : selectedIds.filter((id) => id !== row.id))}
                      />
                    </TableCell>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={`px-4 py-2 text-sm ${cell.column.id === "actions" ? "crm-sticky-actions sticky right-0" : ""}`}
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
          <div className="crm-table-footer flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
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
