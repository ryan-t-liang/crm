import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, RefreshCw } from "lucide-react"

import { ExecutionHealth } from "@/components/execution-health"
import { FitEngagementMatrix } from "@/components/fit-engagement-matrix"
import { PipelineChart } from "@/components/pipeline-chart"
import { TeamExecutionTable } from "@/components/team-execution-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getData, type CrmUser, type SessionUser } from "@/lib/api"
import { marketingActivityLabel, marketingSourceLabel, marketingSourceLabels } from "@/lib/product-language"
import {
  containsFinancialKey,
  customDateRange,
  dateRangeForDays,
  localDateValue,
  type DashboardData,
  type MatrixData,
  type TeamData,
} from "@/lib/dashboard"

type Period = "7" | "30" | "90" | "custom"
type DashboardView = "management" | "marketing" | "opportunity" | "team"
type MarketingFunnel = {
  tracking: { visitorTracking: false; message: string }
  stages: Array<{ key: string; label: string; count: number }>
  kpis: {
    newLeads: number; mqlCount: number;
    mqlRate: Rate; mqlToSqlRate: Rate; sqlToOpportunityRate: Rate; leadToOpportunityRate: Rate;
    avgLeadToMqlHours: number | null; avgMqlToSqlHours: number | null; avgLeadToOpportunityHours: number | null; mqlResponseHours: number | null;
  }
}
type Rate = { numerator: number; denominator: number; percent: number }
type MarketingScoring = {
  summary: { activeLeads: number; mql: number; hotLeads: number; warmLeads: number; coldLeads: number; highScoreUntouched: number; recycledLeads: number }
  distribution: Array<{ fitLevel: string; engagementLevel: string; count: number }>
  topSignals: Array<{ eventType: string; count: number; engagementDelta: number; fitDelta: number }>
}
type MarketingSources = { rows: Array<{ source: string; leadCount: number; mqlCount: number; mqlRate: number; sqlCount: number; sqlRate: number; opportunityCount: number; leadToOpportunityRate: number; avgConversionHours: number | null }> }

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-label="正在加载数据看板">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-[116px] rounded-[10px]" />)}
      </div>
      <Skeleton className="h-[360px] rounded-[10px]" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-[360px] rounded-[10px]" />
        <Skeleton className="h-[360px] rounded-[10px]" />
      </div>
    </div>
  )
}

export function DashboardPage({ me, users }: { me: SessionUser; users: CrmUser[] }) {
  const management = me.permissions.includes("crm.dashboard.management.view")
  const today = useMemo(() => new Date(), [])
  const [period, setPeriod] = useState<Period>("30")
  const [fromDate, setFromDate] = useState(localDateValue(new Date(today.getTime() - 30 * 86_400_000)))
  const [toDate, setToDate] = useState(localDateValue(today))
  const [ownerUserId, setOwnerUserId] = useState("all")
  const [organizationRole, setOrganizationRole] = useState("all")
  const [source, setSource] = useState("all")
  const [view, setView] = useState<DashboardView>("management")
  const [data, setData] = useState<DashboardData | null>(null)
  const [matrix, setMatrix] = useState<MatrixData | null>(null)
  const [team, setTeam] = useState<TeamData>({ period: { from: "", to: "" }, rows: [] })
  const [marketingFunnel, setMarketingFunnel] = useState<MarketingFunnel | null>(null)
  const [marketingScoring, setMarketingScoring] = useState<MarketingScoring | null>(null)
  const [marketingSources, setMarketingSources] = useState<MarketingSources | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    const range = period === "custom" ? customDateRange(fromDate, toDate) : dateRangeForDays(Number(period))
    if (!range) {
      setError("请选择有效的开始与结束日期。")
      return
    }
    setLoading(true)
    setError(null)
    const params = new URLSearchParams(range)
    if (management && ownerUserId !== "all") params.set("ownerUserId", ownerUserId)
    if (organizationRole !== "all") params.set("organizationRole", organizationRole)
    const marketingParams = new URLSearchParams(range)
    if (management && ownerUserId !== "all") marketingParams.set("ownerUserId", ownerUserId)
    if (source !== "all") marketingParams.set("source", source)
    try {
      const marketingAllowed = me.permissions.includes("crm.marketing.analytics.view")
      const [dashboardData, matrixData, teamData, funnelData, scoringData, sourcesData] = await Promise.all([
        getData<DashboardData>(`/api/v1/crm/analytics/${management ? "management" : "self"}?${params}`),
        getData<MatrixData>(`/api/v1/crm/analytics/fit-engagement-matrix?${params}`),
        management
          ? getData<TeamData>(`/api/v1/crm/analytics/team?${params}`)
          : Promise.resolve({ period: range, rows: [] }),
        marketingAllowed ? getData<MarketingFunnel>(`/api/v1/crm/marketing/analytics/funnel?${marketingParams}`) : Promise.resolve(null),
        marketingAllowed ? getData<MarketingScoring>(`/api/v1/crm/marketing/analytics/scoring?${marketingParams}`) : Promise.resolve(null),
        marketingAllowed ? getData<MarketingSources>(`/api/v1/crm/marketing/analytics/sources?${marketingParams}`) : Promise.resolve(null),
      ])
      if (containsFinancialKey(dashboardData) || containsFinancialKey(matrixData) || containsFinancialKey(teamData) || containsFinancialKey(funnelData) || containsFinancialKey(scoringData) || containsFinancialKey(sourcesData)) {
        throw new Error("数据看板响应包含被禁止的财务字段。")
      }
      setData(dashboardData)
      setMatrix(matrixData)
      setTeam(teamData)
      setMarketingFunnel(funnelData)
      setMarketingScoring(scoringData)
      setMarketingSources(sourcesData)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "数据看板暂时无法加载。")
    } finally {
      setLoading(false)
    }
  }, [fromDate, management, me.permissions, organizationRole, ownerUserId, period, reloadKey, source, toDate])

  useEffect(() => { void load() }, [load])

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-5 lg:p-6">
        <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {management ? "管理视图" : "个人视图"}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">数据看板</h1>
            <p className="mt-1 text-sm text-muted-foreground">用非金额指标判断客户资产、机会推进与团队执行是否健康。</p>
          </div>
          <div className="flex flex-wrap items-end gap-2" aria-label="数据看板筛选">
            <label className="grid gap-1 text-[11px] text-muted-foreground">
              统计周期
              <Select value={period} onValueChange={(value) => setPeriod(value as Period)}>
                <SelectTrigger className="h-9 w-[132px] rounded-[8px] bg-background text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">近 7 天</SelectItem>
                  <SelectItem value="30">近 30 天</SelectItem>
                  <SelectItem value="90">近 90 天</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {period === "custom" ? (
              <>
                <label className="grid gap-1 text-[11px] text-muted-foreground">开始日期<Input className="h-9 w-[142px] rounded-[8px] text-[13px]" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
                <label className="grid gap-1 text-[11px] text-muted-foreground">结束日期<Input className="h-9 w-[142px] rounded-[8px] text-[13px]" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
              </>
            ) : null}
            {management ? (
              <label className="grid gap-1 text-[11px] text-muted-foreground">
                负责人
                <Select value={ownerUserId} onValueChange={setOwnerUserId}>
                  <SelectTrigger className="h-9 w-[142px] rounded-[8px] bg-background text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部负责人</SelectItem>
                    {users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
            <label className="grid gap-1 text-[11px] text-muted-foreground">
              客户范围
              <Select value={organizationRole} onValueChange={setOrganizationRole}>
                <SelectTrigger className="h-9 w-[142px] rounded-[8px] bg-background text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部客户阶段</SelectItem>
                  <SelectItem value="PROSPECT">尚未成交</SelectItem>
                  <SelectItem value="CUSTOMER">已成交客户</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {me.permissions.includes("crm.marketing.analytics.view") && view === "marketing" ? (
              <label className="grid gap-1 text-[11px] text-muted-foreground">
                线索来源
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger className="h-9 w-[142px] rounded-[8px] bg-background text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">全部来源</SelectItem>{Object.entries(marketingSourceLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </label>
            ) : null}
          </div>
        </header>

        <Tabs value={view} onValueChange={(value) => setView(value as DashboardView)}>
          <div className="max-w-full overflow-x-auto border-b">
            <TabsList variant="line" className="h-10">
              <TabsTrigger value="management">管理概览</TabsTrigger>
              {me.permissions.includes("crm.marketing.analytics.view") ? <TabsTrigger value="marketing">营销与转化</TabsTrigger> : null}
              <TabsTrigger value="opportunity">商机推进</TabsTrigger>
              {management ? <TabsTrigger value="team">团队表现</TabsTrigger> : null}
            </TabsList>
          </div>
        </Tabs>

        {loading && !data ? <DashboardSkeleton /> : null}
        {error ? (
          <Alert variant="destructive" className="grid-cols-[auto_1fr_auto] items-center border-destructive/20 bg-destructive/5">
            <AlertCircle />
            <div className="min-w-0">
              <AlertTitle>数据看板加载失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw />重试</Button>
          </Alert>
        ) : null}

        {data && matrix && !error ? (
          <>
            {view === "management" ? <><MetricCards items={[{ label: "新增线索", value: marketingFunnel?.kpis.newLeads ?? "—" }, { label: "新增商机", value: data.kpis.newLeads }, { label: "活跃商机", value: data.kpis.activeLeads }, { label: "成交商机", value: data.pipeline.find((stage) => stage.status === "WON")?.count ?? 0 }, { label: "逾期任务", value: data.kpis.overdueTasks }, { label: "停滞商机", value: data.kpis.staleLeads }]} /><ExecutionHealth data={data} /><section className="max-w-3xl"><FitEngagementMatrix matrix={matrix} /></section></> : null}
            {view === "marketing" && marketingFunnel ? <div className="space-y-4"><MarketingFunnelView funnel={marketingFunnel} sources={marketingSources} />{marketingScoring ? <MarketingScoringView scoring={marketingScoring} sources={null} /> : null}</div> : null}
            {view === "opportunity" ? <><PipelineChart pipeline={data.pipeline} /><ExecutionHealth data={data} /></> : null}
            {view === "team" ? <TeamExecutionTable rows={team.rows} /> : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

function MetricCards({ items }: { items: Array<{ label: string; value: string | number; detail?: string }> }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{items.map((item) => <Card key={item.label} className="gap-2 py-5 shadow-none"><CardHeader className="px-5"><CardTitle className="text-xs font-medium text-muted-foreground">{item.label}</CardTitle></CardHeader><CardContent className="px-5"><p className="text-2xl font-semibold tabular-nums">{item.value}</p>{item.detail ? <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p> : null}</CardContent></Card>)}</div>
}

function hours(value: number | null) { return value == null ? "—" : `${value} 小时` }
const scoreLevelLabels: Record<string, string> = { HIGH: "高", MEDIUM: "中", LOW: "低" }

function MarketingFunnelView({ funnel, sources }: { funnel: MarketingFunnel; sources: MarketingSources | null }) {
  const kpi = funnel.kpis
  const labels: Record<string, string> = { LEAD: "线索", MQL: "营销合格", SQL: "销售合格", OPPORTUNITY: "商机" }
  const conversions = [null, kpi.mqlRate.percent, kpi.mqlToSqlRate.percent, kpi.sqlToOpportunityRate.percent]
  return <div className="space-y-4"><Alert className="py-2"><AlertTitle className="text-sm">网站访客追踪尚未接入</AlertTitle><AlertDescription className="text-xs">{funnel.tracking.message}</AlertDescription></Alert><section className="grid gap-3 md:grid-cols-4">{funnel.stages.map((stage, index) => <Card key={stage.key} className="relative gap-2 py-5 shadow-none"><CardHeader className="px-5"><CardTitle className="text-sm text-muted-foreground">{labels[stage.key] || stage.label}</CardTitle></CardHeader><CardContent className="px-5"><p className="text-3xl font-semibold tabular-nums">{stage.count}</p>{conversions[index] != null ? <p className="mt-1 text-xs text-muted-foreground">上一步转化 {conversions[index]}%</p> : null}</CardContent>{index < funnel.stages.length - 1 ? <span className="absolute -right-3 top-1/2 z-10 hidden text-muted-foreground md:block">→</span> : null}</Card>)}</section><MetricCards items={[{ label: "新增线索", value: kpi.newLeads }, { label: "营销合格线索", value: kpi.mqlCount }, { label: "MQL 转化率", value: `${kpi.mqlRate.percent}%`, detail: `${kpi.mqlRate.numerator}/${kpi.mqlRate.denominator}` }, { label: "MQL → SQL", value: `${kpi.mqlToSqlRate.percent}%`, detail: `${kpi.mqlToSqlRate.numerator}/${kpi.mqlToSqlRate.denominator}` }, { label: "SQL → 商机", value: `${kpi.sqlToOpportunityRate.percent}%` }, { label: "线索 → 商机", value: `${kpi.leadToOpportunityRate.percent}%` }, { label: "平均线索 → MQL", value: hours(kpi.avgLeadToMqlHours) }, { label: "平均 MQL → SQL", value: hours(kpi.avgMqlToSqlHours) }, { label: "平均线索 → 商机", value: hours(kpi.avgLeadToOpportunityHours) }, { label: "MQL 响应时间", value: hours(kpi.mqlResponseHours) }]} />{sources ? <SourceQualityTable sources={sources} /> : null}</div>
}

function MarketingScoringView({ scoring, sources }: { scoring: MarketingScoring; sources: MarketingSources | null }) {
  const summary = scoring.summary
  return <div className="space-y-4"><MetricCards items={[{ label: "活跃线索", value: summary.activeLeads }, { label: "待处理 MQL", value: summary.mql }, { label: "高活跃线索", value: summary.hotLeads }, { label: "中活跃线索", value: summary.warmLeads }, { label: "低活跃线索", value: summary.coldLeads }, { label: "高匹配未触达", value: summary.highScoreUntouched }, { label: "重新培育线索", value: summary.recycledLeads }]} /><div className="grid gap-4 xl:grid-cols-2"><Card className="gap-3 py-5 shadow-none"><CardHeader className="px-5"><CardTitle>评分分布</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-2 px-5">{scoring.distribution.map((cell) => <div key={`${cell.fitLevel}-${cell.engagementLevel}`} className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">匹配度 {scoreLevelLabels[cell.fitLevel] || "未知"}<br />活跃度 {scoreLevelLabels[cell.engagementLevel] || "未知"}</p><p className="mt-2 text-xl font-semibold">{cell.count}</p></div>)}</CardContent></Card><Card className="gap-3 py-5 shadow-none"><CardHeader className="px-5"><CardTitle>主要评分信号</CardTitle></CardHeader><CardContent className="px-5"><Table><TableHeader><TableRow><TableHead>行为信号</TableHead><TableHead>次数</TableHead><TableHead>活跃度变化</TableHead></TableRow></TableHeader><TableBody>{scoring.topSignals.map((signal) => <TableRow key={signal.eventType}><TableCell className="font-medium">{marketingActivityLabel(signal.eventType)}</TableCell><TableCell>{signal.count}</TableCell><TableCell>{signal.engagementDelta > 0 ? "+" : ""}{signal.engagementDelta}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></div>{sources ? <SourceQualityTable sources={sources} /> : null}</div>
}

function SourceQualityTable({ sources }: { sources: MarketingSources }) {
  return <Card className="gap-3 py-5 shadow-none"><CardHeader className="px-5"><CardTitle>线索来源质量</CardTitle></CardHeader><CardContent className="overflow-x-auto px-5"><Table><TableHeader><TableRow>{["来源", "线索数", "MQL", "MQL 转化率", "SQL", "SQL 转化率", "商机", "线索 → 商机", "平均转化时间"].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{sources.rows.map((row) => <TableRow key={row.source}><TableCell className="font-medium">{marketingSourceLabel(row.source)}</TableCell><TableCell>{row.leadCount}</TableCell><TableCell>{row.mqlCount}</TableCell><TableCell>{row.mqlRate}%</TableCell><TableCell>{row.sqlCount}</TableCell><TableCell>{row.sqlRate}%</TableCell><TableCell>{row.opportunityCount}</TableCell><TableCell>{row.leadToOpportunityRate}%</TableCell><TableCell>{hours(row.avgConversionHours)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
}
