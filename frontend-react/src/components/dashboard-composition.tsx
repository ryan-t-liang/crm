import type { CSSProperties, ReactNode } from "react"
import { ArrowRight } from "lucide-react"

type DashboardTone = "neutral" | "positive" | "info" | "attention" | "risk"

export type DashboardMetric = {
  label: string
  value: ReactNode
  note?: string
  tone?: DashboardTone
}

export function DashboardMetricStrip({ items, label, compact = false }: { items: DashboardMetric[]; label: string; compact?: boolean }) {
  return (
    <section className={`dashboard-metric-strip${compact ? " is-compact" : ""}`} aria-label={label}>
      {items.map((item) => (
        <div key={item.label} className={`dashboard-metric-item is-${item.tone ?? "neutral"}`}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.note ? <small>{item.note}</small> : null}
        </div>
      ))}
    </section>
  )
}

export function DashboardSectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="dashboard-section-header">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="dashboard-section-action">{action}</div> : null}
    </header>
  )
}

export function DashboardPanel({ title, description, action, children, className = "" }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`dashboard-panel ${className}`.trim()}>
      <DashboardSectionHeader title={title} description={description} action={action} />
      <div className="dashboard-panel-body">{children}</div>
    </section>
  )
}

export type DashboardStage = {
  key: string
  label: string
  count: number
  conversionToNext?: string
  tone?: DashboardTone
}

export function DashboardStageFlow({ stages, label, compact = false, footnote }: { stages: DashboardStage[]; label: string; compact?: boolean; footnote?: ReactNode }) {
  return (
    <div className={`dashboard-stage-flow${compact ? " is-compact" : ""}`} aria-label={label}>
      <ol>
        {stages.map((stage, index) => (
          <li key={stage.key} className={`is-${stage.tone ?? "neutral"}`}>
            <div className="dashboard-stage-node">
              <span>{stage.label}</span>
              <strong>{stage.count}</strong>
            </div>
            {index < stages.length - 1 ? (
              <div className="dashboard-stage-connector" aria-hidden="true">
                <span>{stage.conversionToNext ?? "推进"}</span>
                <i><ArrowRight /></i>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {footnote ? <div className="dashboard-stage-footnote">{footnote}</div> : null}
    </div>
  )
}

export function DashboardFunnel25D({ stages, label, summary, footnote }: { stages: DashboardStage[]; label: string; summary: ReactNode; footnote?: ReactNode }) {
  return (
    <div className="dashboard-funnel-25d" aria-label={label}>
      <div className="dashboard-funnel-summary">{summary}</div>
      <ol className="dashboard-funnel-steps">
        {stages.map((stage, index) => {
          const decrement = stages.length === 5 ? 14 : 17
          const width = 100 - index * decrement
          const nextWidth = 100 - (index + 1) * decrement
          const inset = ((width - nextWidth) / 2 / width) * 100
          return (
            <li key={stage.key}>
              <span className="dashboard-funnel-stage-label">{stage.label}</span>
              <div className="dashboard-funnel-stage">
                <div className="dashboard-funnel-bar" style={{ "--funnel-width": `${width}%` } as CSSProperties} aria-label={`${stage.label} ${stage.count}`}>
                  <strong>{stage.count}</strong>
                </div>
                {index < stages.length - 1 ? (
                  <div className="dashboard-funnel-connector" style={{ "--funnel-width": `${width}%`, "--funnel-inset": `${inset}%` } as CSSProperties}>
                    <span>{stage.conversionToNext ?? "阶段推进"}</span>
                  </div>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
      {footnote ? <div className="dashboard-funnel-footnote">{footnote}</div> : null}
    </div>
  )
}

export type DashboardAttentionItem = {
  label: string
  value: number | string
  note?: string
  href?: string
  tone?: "attention" | "risk" | "neutral"
}

export function DashboardAttentionList({ items }: { items: DashboardAttentionItem[] }) {
  return (
    <div className="dashboard-attention-list">
      {items.map((item) => {
        const content = (
          <>
            <span className={`dashboard-attention-mark is-${item.tone ?? "neutral"}`} />
            <span className="dashboard-attention-copy">
              <strong>{item.label}</strong>
              {item.note ? <small>{item.note}</small> : null}
            </span>
            <b>{item.value}</b>
            {item.href ? <ArrowRight className="dashboard-attention-arrow" /> : null}
          </>
        )
        return item.href ? <a key={item.label} href={item.href}>{content}</a> : <div key={item.label}>{content}</div>
      })}
    </div>
  )
}

type MatrixCell = { row: string; column: string; count: number }

export function DashboardMatrix({ rows, columns, cells, rowLabel, columnLabel }: { rows: Array<{ key: string; label: string }>; columns: Array<{ key: string; label: string }>; cells: MatrixCell[]; rowLabel: string; columnLabel: string }) {
  const count = (row: string, column: string) => cells.find((cell) => cell.row === row && cell.column === column)?.count ?? 0
  return (
    <div className="dashboard-matrix" style={{ "--dashboard-matrix-columns": columns.length } as CSSProperties}>
      <div className="dashboard-matrix-axis"><span>{rowLabel}</span><strong>{columnLabel}</strong></div>
      {columns.map((column) => <div key={column.key} className="dashboard-matrix-column">{column.label}</div>)}
      {rows.map((row) => (
        <div className="dashboard-matrix-row" key={row.key}>
          <div className="dashboard-matrix-row-label">{row.label}</div>
          {columns.map((column) => {
            const value = count(row.key, column.key)
            return <div key={column.key} className="dashboard-matrix-cell" data-level={value > 3 ? "high" : value > 0 ? "active" : "empty"} title={`${row.label} / ${column.label}：${value}`}><strong>{value}</strong><span>条</span></div>
          })}
        </div>
      ))}
    </div>
  )
}

export function DashboardDataTable({ title, description, action, children, className = "" }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`dashboard-data-table ${className}`.trim()}>
      <DashboardSectionHeader title={title} description={description} action={action} />
      <div className="dashboard-table-scroll">{children}</div>
    </section>
  )
}
