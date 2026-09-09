import { useMemo, useState, type ReactNode } from "react";
import { Button as SemiButton, Checkbox, Dropdown, Pagination, Table, Tabs } from "@douyinfe/semi-ui";
import { IconColumnsStroked } from "@douyinfe/semi-icons";
import type { ColumnProps } from "@douyinfe/semi-ui/lib/es/table";

import { Button } from "@/components/crm/ui";
import { EmptyState } from "./primitives";

export type CrmColumnDef<T> = {
  id?: string;
  accessorKey?: string;
  header?: ReactNode;
  cell?: (context: { row: { original: T }; getValue: () => unknown }) => ReactNode;
  enableHiding?: boolean;
};

export type CrmTableView = {
  key: string;
  label: ReactNode;
  disabled?: boolean;
};

function readPath(record: unknown, path?: string) {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, record);
}

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
  showColumnControl = true,
  views,
  activeView,
  onViewChange,
}: {
  columns: CrmColumnDef<T>[];
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
  showColumnControl?: boolean;
  views?: CrmTableView[];
  activeView?: string;
  onViewChange?: (view: string) => void;
}) {
  const normalized = columns;
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const columnKeys = normalized.map((column, index) => column.id || column.accessorKey || `column-${index}`);
  const setColumnVisible = (key: string, visible: boolean) => {
    setHiddenColumns((current) => {
      const next = new Set(current);
      if (visible) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const semiColumns = useMemo<ColumnProps<T>[]>(() => normalized.flatMap((column, index) => {
    const key = columnKeys[index];
    if (hiddenColumns.has(key)) return [];
    const isActions = key === "actions";
    return [{
      key,
      dataIndex: column.accessorKey,
      title: column.header as ReactNode,
      fixed: isActions ? "right" : undefined,
      width: isActions ? 92 : undefined,
      className: isActions ? "crm-sticky-actions" : undefined,
      render: (_value: unknown, record: T) => column.cell
        ? column.cell({ row: { original: record }, getValue: () => readPath(record, column.accessorKey) } as never)
        : (readPath(record, column.accessorKey) as ReactNode),
    }];
  }), [columns, hiddenColumns]);

  const pages = Math.max(1, Math.ceil((total ?? rows.length) / pageSize));
  const selection = selectable ? {
    selectedRowKeys: selectedIds,
    onChange: (keys?: Array<string | number>) => onSelectedIdsChange?.((keys || []).map(String)),
    fixed: true as const,
    width: 44,
  } : undefined;

  return (
    <div className="crm-data-table">
      <div className="crm-data-workspace">
        {views?.length ? (
          <section className="crm-data-views" aria-label={`${label}视图`}>
            <Tabs
              type="button"
              size="small"
              collapsible="auto"
              activeKey={activeView || views[0].key}
              onChange={onViewChange}
              tabList={views.map((view) => ({
                itemKey: view.key,
                tab: view.label,
                disabled: view.disabled,
              }))}
            />
          </section>
        ) : null}
        {toolbar && <section className="crm-filter-panel" aria-label={`${label}查询`}><div role="toolbar" aria-label={`${label}查询条件`} className="crm-data-toolbar"><div className="crm-data-filter-fields">{toolbar}</div></div></section>}
        {selectable && selectedIds.length > 0 && (
          <div role="toolbar" aria-label="批量操作" className="crm-bulk-toolbar">
            <strong>已选择 {selectedIds.length} 条</strong>
            {selectionActions}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onSelectedIdsChange?.([])}>取消选择</Button>
          </div>
        )}
        <section className="crm-table-shell" aria-label={label}>
        <div className="crm-table-toolbar">
          <div className="crm-table-title"><strong>{label}</strong><span>{total ?? rows.length} 条结果</span></div>
          <div className="crm-table-toolbar-actions">
            {tableActions}
            {showColumnControl && (
              <Dropdown
                trigger="click"
                position="bottomRight"
                render={
                  <Dropdown.Menu className="crm-column-menu">
                    <Dropdown.Title>显示字段</Dropdown.Title>
                    {normalized.map((column, index) => {
                      const key = columnKeys[index];
                      const locked = column.enableHiding === false;
                      return <Dropdown.Item key={key} disabled={locked} onClick={(event) => event.stopPropagation()}><Checkbox checked={!hiddenColumns.has(key)} disabled={locked} onChange={(event) => setColumnVisible(key, Boolean(event.target.checked))}>{typeof column.header === "string" ? column.header : key}</Checkbox></Dropdown.Item>;
                    })}
                  </Dropdown.Menu>
                }
              >
                <SemiButton theme="outline" type="tertiary" size="small" icon={<IconColumnsStroked />}>列</SemiButton>
              </Dropdown>
            )}
            {primaryAction}
          </div>
        </div>
        <Table<T>
          className="crm-semi-table"
          rowKey="id"
          columns={semiColumns}
          dataSource={rows}
          loading={Boolean(loading)}
          pagination={false}
          rowSelection={selection}
          size="small"
          bordered={false}
          scroll={{ x: "max-content" }}
          empty={<EmptyState title={emptyTitle} description="试试调整筛选条件，或添加一条新记录。" action={emptyAction} />}
        />
        {onPage && (
          <div className="crm-table-footer">
            <span>共 {total ?? rows.length} 条</span>
            <Pagination currentPage={page} total={total ?? rows.length} pageSize={pageSize} showSizeChanger={false} onPageChange={onPage} disabled={loading} />
            <span>{page} / {pages} 页</span>
          </div>
        )}
        </section>
      </div>
    </div>
  );
}
