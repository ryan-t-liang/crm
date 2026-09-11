import { useCallback, useEffect, useMemo, useState } from "react"
import {
  IconAlertCircle as AlertCircle,
  IconCalendarStroked as CalendarDays,
  IconChevronDown as ChevronDown,
  IconRefresh as RefreshCw,
  IconTick as Check,
} from "@douyinfe/semi-icons"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { DatePicker, Popover as SemiPopover } from "@douyinfe/semi-ui"

import { DashboardFunnel25D, type DashboardStage } from "@/components/dashboard-composition"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarFallback,
  Button,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Skeleton,
  type ChartConfig,
} from "@/components/crm/ui"
import { CRMPageContainer } from "@/components/crm/layout"
import { getData, type CrmUser, type SessionUser } from "@/lib/api"
import { opportunityStageLabels } from "@/lib/product-language"
import { containsFinancialKey, customDateRange, localDateValue, type DashboardData, type TeamData, type TeamRow } from "@/lib/dashboard"

type Rate = { numerator: number; denominator: number; percent: number }
type MarketingFunnel = {
  stages: Array<{ key: string; label: string; count: number }>
  kpis: {
    newLeads: number
    mqlRate: Rate
    mqlToSqlRate: Rate
    sqlToOpportunityRate: Rate
    leadToOpportunityRate: Rate
  }
}
type TrendMetricKey = "newMarketingLeads" | "newOpportunities" | "activeOpportunities" | "wonOpportunities"
type TeamMetric = "leads" | "opportunities"
type DatePreset = "today" | "yesterday" | "week" | "7" | "28" | "30" | "month" | "last-month" | "90" | "quarter" | "year" | "custom"
type AppliedRange = { from: string; to: string; preset: DatePreset }

const DAY = 86_400_000
const OPPORTUNITY_STAGE_ORDER = ["NEW", "QUALIFIED", "SOLUTION", "QUOTATION", "WON"]
const DATE_PRESETS: Array<{ key: Exclude<DatePreset, "custom">; label: string }> = [
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
  { key: "week", label: "本周（周一至今天）" },
  { key: "7", label: "过去 7 天" },
  { key: "28", label: "过去 28 天" },
  { key: "30", label: "过去 30 天" },
  { key: "month", label: "本月" },
  { key: "last-month", label: "上月" },
  { key: "90", label: "过去 90 天" },
  { key: "quarter", label: "季度初至今" },
  { key: "year", label: "今年（1 月至今）" },
]

const TREND_METRICS: Array<{ key: TrendMetricKey; label: string; note: string; color: string }> = [
  { key: "newMarketingLeads", label: "新增线索", note: "本期创建", color: "#1F6B4F" },
  { key: "newOpportunities", label: "新增商机", note: "本期创建", color: "#5E86A8" },
  { key: "activeOpportunities", label: "活跃商机", note: "当前推进", color: "#8073A8" },
  { key: "wonOpportunities", label: "成交商机", note: "本期成交", color: "#2E7D5A" },
]

const chartConfig = Object.fromEntries(TREND_METRICS.map((metric) => [metric.key, { label: metric.label, color: metric.color }])) as ChartConfig

function DashboardSkeleton() {
  return (
    <div className="crm-dashboard-skeleton" aria-label="正在加载管理概览">
      <div className="crm-dashboard-primary-grid">
        <Skeleton className="crm-dashboard-skeleton-trend" />
        <Skeleton className="crm-dashboard-skeleton-team" />
      </div>
      <Skeleton className="crm-dashboard-skeleton-analysis" />
    </div>
  )
}

export function DashboardPage({ me }: { me: SessionUser; users: CrmUser[] }) {
  const management = me.permissions.includes("crm.dashboard.management.view")
  const marketingAllowed = me.permissions.includes("crm.marketing.analytics.view")
  const initialRange = useMemo(() => rangeForPreset("28", new Date()), [])
  const [appliedRange, setAppliedRange] = useState<AppliedRange>({ ...initialRange, preset: "28" })
  const [data, setData] = useState<DashboardData | null>(null)
  const [team, setTeam] = useState<TeamData>({ period: { from: "", to: "" }, rows: [] })
  const [funnel, setFunnel] = useState<MarketingFunnel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    const range = customDateRange(appliedRange.from, appliedRange.to)
    if (!range) {
      setError("请选择有效的开始与结束日期。")
      return
    }
    setLoading(true)
    setError(null)
    const params = new URLSearchParams(range)
    try {
      const [dashboardData, teamData, funnelData] = await Promise.all([
        getData<DashboardData>(`/api/v1/crm/analytics/${management ? "management" : "self"}?${params}`),
        management ? getData<TeamData>(`/api/v1/crm/analytics/team?${params}`) : Promise.resolve({ period: range, rows: [] }),
        marketingAllowed ? getData<MarketingFunnel>(`/api/v1/crm/marketing/analytics/funnel?${params}`) : Promise.resolve(null),
      ])
      if ([dashboardData, teamData, funnelData].some(containsFinancialKey)) throw new Error("数据看板响应包含被禁止的财务字段。")
      setData(dashboardData)
      setTeam(teamData)
      setFunnel(funnelData)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "管理概览暂时无法加载。")
    } finally {
      setLoading(false)
    }
  }, [appliedRange, management, marketingAllowed, reloadKey])

  useEffect(() => { void load() }, [load])

  return (
      <CRMPageContainer mode="standard" breadcrumbs={[{ label: "Kivisense CRM", href: "#dashboard" }, { label: "数据看板" }]} className="crm-page dashboard-page crm-dashboard-page @container/main flex flex-1 flex-col">
        <header className="crm-page-header crm-dashboard-page-header">
          <div>
            <h1 className="crm-display-title text-2xl font-semibold tracking-tight">数据看板</h1>
            <p className="mt-1 text-sm text-muted-foreground">管理概览</p>
          </div>
          <DashboardDateRangePicker value={appliedRange} onApply={setAppliedRange} />
        </header>

        {loading && !data ? <DashboardSkeleton /> : null}
        {error ? (
          <Alert variant="destructive" icon={<AlertCircle />} className="crm-dashboard-error border-destructive/20 bg-destructive/5">
            <AlertTitle>管理概览加载失败</AlertTitle>
            <AlertDescription>
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw />重试</Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {data && !error ? (
          <main className="crm-dashboard-content" aria-busy={loading}>
            <div className="crm-dashboard-primary-grid">
              <DashboardTrendPanel data={data} />
              <TeamPerformancePanel rows={team.rows} management={management} />
            </div>

            <section className="crm-dashboard-analysis" aria-labelledby="dashboard-analysis-title">
              <header className="crm-dashboard-analysis-header">
                <div>
                  <h2 id="dashboard-analysis-title">转化与推进</h2>
                  <p>从营销获客进入销售，再到商机推进</p>
                </div>
              </header>
              <div className="crm-dashboard-analysis-grid">
                <article className="crm-dashboard-funnel-section" aria-labelledby="dashboard-marketing-funnel-title">
                  <header className="crm-dashboard-funnel-header">
                    <h3 id="dashboard-marketing-funnel-title">营销与转化</h3>
                  </header>
                  <div className="crm-dashboard-funnel-body">
                    {funnel ? (
                      <DashboardFunnel25D stages={marketingStages(funnel)} label="营销与转化漏斗" summary={<>线索总数 <strong>{funnel.stages[0]?.count ?? 0}</strong></>} footnote={<>总转化率 {conversionValue(funnel.kpis.leadToOpportunityRate)}；阶段间转化率仅在样本量足够时展示</>} />
                    ) : <p className="crm-dashboard-analysis-unavailable">当前账户没有营销分析权限。</p>}
                  </div>
                </article>

                <div className="crm-dashboard-analysis-divider" aria-hidden="true" />

                <article className="crm-dashboard-funnel-section" aria-labelledby="dashboard-opportunity-funnel-title">
                  <header className="crm-dashboard-funnel-header">
                    <h3 id="dashboard-opportunity-funnel-title">商机推进</h3>
                  </header>
                  <div className="crm-dashboard-funnel-body">
                    <DashboardFunnel25D stages={opportunityStages(data)} label="商机推进漏斗" summary={<>商机总数 <strong>{OPPORTUNITY_STAGE_ORDER.reduce((sum, status) => sum + stageCount(data, status), 0)}</strong></>} footnote={`当前阶段存量；本期丢失 ${stageCount(data, "LOST")} 个`} />
                  </div>
                </article>
              </div>
            </section>
          </main>
        ) : null}
      </CRMPageContainer>
  )
}

function DashboardTrendPanel({ data }: { data: DashboardData }) {
  const [metricKey, setMetricKey] = useState<TrendMetricKey>("newMarketingLeads")
  const metric = TREND_METRICS.find((item) => item.key === metricKey) ?? TREND_METRICS[0]
  const metrics: Record<TrendMetricKey, number> = {
    newMarketingLeads: sumTrend(data, "newMarketingLeads"),
    newOpportunities: sumTrend(data, "newOpportunities"),
    activeOpportunities: data.kpis.activeLeads,
    wonOpportunities: sumTrend(data, "wonOpportunities"),
  }
  const rows = data.trend.map((point) => ({ ...point, label: trendLabel(point.from, point.to) }))
  return (
    <section className="crm-dashboard-trend" aria-labelledby="dashboard-trend-title">
      <header className="crm-dashboard-trend-header">
        <div>
          <h2 id="dashboard-trend-title">业务趋势</h2>
          <p>关键指标随所选周期的变化</p>
        </div>
      </header>
      <div className="crm-dashboard-metric-selector" aria-label="核心业务指标">
        {TREND_METRICS.map((item) => (
          <Button variant="ghost" key={item.key} className={`crm-dashboard-metric-option${item.key === metricKey ? " is-active" : ""}`} aria-pressed={item.key === metricKey} onClick={() => setMetricKey(item.key)}>
            <span>{item.label}</span>
            <strong>{metrics[item.key]}</strong>
            <small>{item.note}</small>
          </Button>
        ))}
      </div>
      <div className="crm-dashboard-trend-chart">
        <ChartContainer config={chartConfig} className="h-full w-full aspect-auto">
          <LineChart accessibilityLayer data={rows} margin={{ top: 18, right: 18, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="#ECEEED" strokeDasharray="0" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={12} minTickGap={24} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={36} />
            <ChartTooltip cursor={{ stroke: "#CDD2CF", strokeDasharray: "4 4" }} content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey={metricKey} name={metric.label} stroke={metric.color} strokeWidth={2.4} dot={{ r: 3, fill: metric.color, strokeWidth: 0 }} activeDot={{ r: 5, fill: metric.color, stroke: "#FFFFFF", strokeWidth: 2 }} />
          </LineChart>
        </ChartContainer>
      </div>
      <footer className="crm-dashboard-trend-caption"><span className="crm-dashboard-trend-key" style={{ background: metric.color }} />当前查看：{metric.label}</footer>
    </section>
  )
}

function TeamPerformancePanel({ rows, management }: { rows: TeamRow[]; management: boolean }) {
  const [metric, setMetric] = useState<TeamMetric>("leads")
  const rankedRows = [...rows].sort((a, b) => teamMetricValue(b, metric) - teamMetricValue(a, metric) || a.user.name.localeCompare(b.user.name, "zh-CN"))
  return (
    <aside className="crm-dashboard-team" aria-labelledby="dashboard-team-title">
      <header className="crm-dashboard-team-header">
        <div><h2 id="dashboard-team-title">团队表现</h2><p>按本期提交数量查看成员产出</p></div>
        <div className="crm-dashboard-team-switch" aria-label="团队表现指标">
          <Button variant="ghost" className={`crm-dashboard-team-switch-option${metric === "leads" ? " is-active" : ""}`} onClick={() => setMetric("leads")}>线索</Button>
          <Button variant="ghost" className={`crm-dashboard-team-switch-option${metric === "opportunities" ? " is-active" : ""}`} onClick={() => setMetric("opportunities")}>商机</Button>
        </div>
      </header>
      <div className="crm-dashboard-team-columns" aria-hidden="true"><span>团队成员</span><span>提交数量</span></div>
      <ol className="crm-dashboard-team-ranking">
        {rankedRows.length ? rankedRows.map((row, index) => (
          <li className="crm-dashboard-team-row" key={row.user.id}>
            <span className="crm-dashboard-team-rank">{String(index + 1).padStart(2, "0")}</span>
            <Avatar className="crm-dashboard-team-avatar"><AvatarFallback>{avatarText(row.user.name)}</AvatarFallback></Avatar>
            <span className="crm-dashboard-team-member"><strong>{row.user.name}</strong><small>{row.user.loginAccount || "销售成员"}</small></span>
            <strong className="crm-dashboard-team-value">{teamMetricValue(row, metric)}</strong>
          </li>
        )) : (
          <li className="crm-dashboard-team-empty">{management ? "当前周期暂无团队提交。" : "当前账户仅可查看个人经营数据。"}</li>
        )}
      </ol>
    </aside>
  )
}

function DashboardDateRangePicker({ value, onApply }: { value: AppliedRange; onApply: (value: AppliedRange) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<AppliedRange>(value)
  const [dateError, setDateError] = useState("")
  const resetDraft = () => { setDraft(value); setDateError("") }
  const selectPreset = (preset: Exclude<DatePreset, "custom">) => setDraft({ ...rangeForPreset(preset, new Date()), preset })
  const apply = () => {
    if (!customDateRange(draft.from, draft.to)) {
      setDateError("结束日期不能早于开始日期。")
      return
    }
    onApply(draft)
    setOpen(false)
    setDateError("")
  }
  const cancel = () => { resetDraft(); setOpen(false) }
  return (
    <SemiPopover
      trigger="click"
      visible={open}
      onVisibleChange={(next) => { setOpen(next); if (next) resetDraft() }}
      position="bottomRight"
      content={(
        <div className="dashboard-date-popover">
          <div className="dashboard-date-layout">
            <nav className="dashboard-date-presets" aria-label="常用统计周期">
              <strong>统计周期</strong>
              {DATE_PRESETS.map((preset) => (
                <Button variant="ghost" key={preset.key} className={draft.preset === preset.key ? "is-active" : ""} onClick={() => selectPreset(preset.key)}>
                  <span>{preset.label}</span>{draft.preset === preset.key ? <Check /> : null}
                </Button>
              ))}
            </nav>
            <section className="dashboard-date-custom">
              <header><strong>自定义日期</strong><span>选择开始与结束日期</span></header>
              <div className="dashboard-date-fields">
                <label><span>开始日期</span><DatePicker type="date" value={draft.from || undefined} format="yyyy-MM-dd" onChange={(_date, dateString) => setDraft({ ...draft, from: String(dateString || ""), preset: "custom" })} /></label>
                <i>—</i>
                <label><span>结束日期</span><DatePicker type="date" value={draft.to || undefined} format="yyyy-MM-dd" onChange={(_date, dateString) => setDraft({ ...draft, to: String(dateString || ""), preset: "custom" })} /></label>
              </div>
              <div className="dashboard-date-preview">
                <CalendarDays />
                <span><small>当前选择</small><strong>{formatDateRange(draft)}</strong></span>
              </div>
              {dateError ? <p className="dashboard-date-error">{dateError}</p> : null}
            </section>
          </div>
          <footer className="dashboard-date-actions"><Button variant="ghost" onClick={cancel}>取消</Button><Button onClick={apply}>应用</Button></footer>
        </div>
      )}
    >
        <Button variant="outline" className="dashboard-date-trigger">
          <CalendarDays />
          <span><small>{presetLabel(value.preset)}</small><strong>{formatDateRange(value)}</strong></span>
          <ChevronDown />
        </Button>
    </SemiPopover>
  )
}

function marketingStages(funnel: MarketingFunnel): DashboardStage[] {
  const conversion = [funnel.kpis.mqlRate, funnel.kpis.mqlToSqlRate, funnel.kpis.sqlToOpportunityRate]
  const labels: Record<string, string> = { LEAD: "线索", MQL: "MQL", SQL: "SQL", OPPORTUNITY: "商机" }
  return funnel.stages.map((stage, index) => ({
    key: stage.key,
    label: labels[stage.key] ?? stage.label,
    count: stage.count,
    conversionToNext: index < conversion.length ? conversionLabel(conversion[index]) : undefined,
    tone: index === funnel.stages.length - 1 ? "positive" : index === 0 ? "info" : index === 1 ? "attention" : "neutral",
  }))
}

function opportunityStages(data: DashboardData): DashboardStage[] {
  return OPPORTUNITY_STAGE_ORDER.map((status, index) => ({
    key: status,
    label: opportunityStageLabels[status],
    count: stageCount(data, status),
    tone: status === "WON" ? "positive" : status === "QUOTATION" ? "attention" : index === 0 ? "info" : "neutral",
  }))
}

function stageCount(data: DashboardData, status: string) {
  return data.pipeline.find((item) => item.status === status)?.count ?? 0
}

function sumTrend(data: DashboardData, key: Exclude<TrendMetricKey, "activeOpportunities">) {
  return data.trend.reduce((sum, point) => sum + point[key], 0)
}

function teamMetricValue(row: TeamRow, metric: TeamMetric) {
  return metric === "leads" ? row.newMarketingLeads : row.newOpportunities
}

function avatarText(name: string) {
  return name.trim().slice(0, 1).toLocaleUpperCase() || "—"
}

function conversionLabel(rate: Rate | undefined) {
  if (!rate || rate.denominator < 3) return "转化 —"
  return `转化 ${rate.percent}%`
}

function conversionValue(rate: Rate | undefined) {
  if (!rate || rate.denominator < 3) return "—"
  return `${rate.percent}%`
}

function trendLabel(from: string, to: string) {
  const start = new Date(from)
  const end = new Date(to)
  const format = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`
  return format(start) === format(end) ? format(start) : `${format(start)}–${format(end)}`
}

function presetLabel(preset: DatePreset) {
  if (preset === "custom") return "自定义"
  return DATE_PRESETS.find((item) => item.key === preset)?.label ?? "统计周期"
}

function formatDateRange(range: Pick<AppliedRange, "from" | "to">) {
  const format = (value: string) => {
    const [year, month, day] = value.split("-")
    return `${year}年${Number(month)}月${Number(day)}日`
  }
  return `${format(range.from)} – ${format(range.to)}`
}

function rangeForPreset(preset: Exclude<DatePreset, "custom">, now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const fromDaysAgo = (days: number) => new Date(today.getTime() - (days - 1) * DAY)
  let from = today
  let to = today
  if (preset === "yesterday") from = to = new Date(today.getTime() - DAY)
  else if (preset === "week") from = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY)
  else if (preset === "7" || preset === "28" || preset === "30" || preset === "90") from = fromDaysAgo(Number(preset))
  else if (preset === "month") from = new Date(today.getFullYear(), today.getMonth(), 1)
  else if (preset === "last-month") {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    to = new Date(today.getFullYear(), today.getMonth(), 0)
  } else if (preset === "quarter") from = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)
  else if (preset === "year") from = new Date(today.getFullYear(), 0, 1)
  return { from: localDateValue(from), to: localDateValue(to) }
}
