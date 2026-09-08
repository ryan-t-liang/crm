import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, RefreshCw } from "lucide-react"

import {
  DashboardAttentionList,
  DashboardDataTable,
  DashboardMatrix,
  DashboardMetricStrip,
  DashboardPanel,
  DashboardSectionHeader,
  DashboardStageFlow,
  type DashboardMetric,
  type DashboardStage,
} from "@/components/dashboard-composition"
import { TeamExecutionTable } from "@/components/team-execution-table"
import { Alert, AlertDescription, AlertTitle, Button, Input } from "@/components/v1/ui"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/v1/ui"
import { Skeleton, Tabs, TabsList, TabsTrigger } from "@/components/v1/ui"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/v1/ui"
import { getData, type CrmUser, type SessionUser } from "@/lib/api"
import {
  marketingActivityLabel,
  marketingSourceLabel,
  marketingSourceLabels,
  opportunityStageLabels,
} from "@/lib/product-language"
import {
  containsFinancialKey,
  customDateRange,
  dateRangeForDays,
  localDateValue,
  type DashboardData,
  type TeamData,
  type TeamRow,
} from "@/lib/dashboard"

type Period = "7" | "30" | "90" | "custom"
type DashboardView = "management" | "marketing" | "opportunity" | "team"
type Rate = { numerator: number; denominator: number; percent: number }
type MarketingFunnel = {
  tracking: { visitorTracking: false; message: string }
  stages: Array<{ key: string; label: string; count: number }>
  kpis: {
    newLeads: number
    mqlCount: number
    mqlRate: Rate
    mqlToSqlRate: Rate
    sqlToOpportunityRate: Rate
    leadToOpportunityRate: Rate
    avgLeadToMqlHours: number | null
    avgMqlToSqlHours: number | null
    avgLeadToOpportunityHours: number | null
    mqlResponseHours: number | null
  }
}
type MarketingScoring = {
  summary: { activeLeads: number; mql: number; hotLeads: number; warmLeads: number; coldLeads: number; highScoreUntouched: number; recycledLeads: number }
  distribution: Array<{ fitLevel: string; engagementLevel: string; count: number }>
  topSignals: Array<{ eventType: string; count: number; engagementDelta: number; fitDelta: number }>
}
type MarketingSources = {
  rows: Array<{
    source: string
    leadCount: number
    mqlCount: number
    mqlRate: number
    sqlCount: number
    sqlRate: number
    opportunityCount: number
    leadToOpportunityRate: number
    avgConversionHours: number | null
  }>
}

const ACTIVE_OPPORTUNITY_STAGES = ["NEW", "QUALIFIED", "SOLUTION", "QUOTATION"]
const OPPORTUNITY_STAGE_ORDER = ["NEW", "QUALIFIED", "SOLUTION", "QUOTATION", "WON"]

function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" aria-label="正在加载数据看板">
      <Skeleton className="h-[106px] rounded-[12px]" />
      <div className="dashboard-workspace-grid">
        <Skeleton className="h-[310px] rounded-[12px]" />
        <Skeleton className="h-[310px] rounded-[12px]" />
      </div>
      <Skeleton className="h-[118px] rounded-[12px]" />
    </div>
  )
}

export function DashboardPage({ me, users }: { me: SessionUser; users: CrmUser[] }) {
  const management = me.permissions.includes("crm.dashboard.management.view")
  const marketingAllowed = me.permissions.includes("crm.marketing.analytics.view")
  const today = useMemo(() => new Date(), [])
  const [period, setPeriod] = useState<Period>("30")
  const [fromDate, setFromDate] = useState(localDateValue(new Date(today.getTime() - 30 * 86_400_000)))
  const [toDate, setToDate] = useState(localDateValue(today))
  const [ownerUserId, setOwnerUserId] = useState(management ? "all" : me.id)
  const [source, setSource] = useState("all")
  const [opportunityStage, setOpportunityStage] = useState("all")
  const [teamMember, setTeamMember] = useState("all")
  const [view, setView] = useState<DashboardView>("management")
  const [data, setData] = useState<DashboardData | null>(null)
  const [team, setTeam] = useState<TeamData>({ period: { from: "", to: "" }, rows: [] })
  const [managementFunnel, setManagementFunnel] = useState<MarketingFunnel | null>(null)
  const [managementScoring, setManagementScoring] = useState<MarketingScoring | null>(null)
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
    const marketingParams = new URLSearchParams(range)
    if (management && ownerUserId !== "all") marketingParams.set("ownerUserId", ownerUserId)
    const managementMarketingParams = new URLSearchParams(marketingParams)
    if (source !== "all") marketingParams.set("source", source)
    try {
      const baseFunnel = marketingAllowed ? getData<MarketingFunnel>(`/api/v1/crm/marketing/analytics/funnel?${managementMarketingParams}`) : Promise.resolve(null)
      const baseScoring = marketingAllowed ? getData<MarketingScoring>(`/api/v1/crm/marketing/analytics/scoring?${managementMarketingParams}`) : Promise.resolve(null)
      const [dashboardData, teamData, managementFunnelData, managementScoringData, funnelData, scoringData, sourcesData] = await Promise.all([
        getData<DashboardData>(`/api/v1/crm/analytics/${management ? "management" : "self"}?${params}`),
        management ? getData<TeamData>(`/api/v1/crm/analytics/team?${params}`) : Promise.resolve({ period: range, rows: [] }),
        baseFunnel,
        baseScoring,
        source === "all" ? baseFunnel : getData<MarketingFunnel>(`/api/v1/crm/marketing/analytics/funnel?${marketingParams}`),
        source === "all" ? baseScoring : getData<MarketingScoring>(`/api/v1/crm/marketing/analytics/scoring?${marketingParams}`),
        marketingAllowed ? getData<MarketingSources>(`/api/v1/crm/marketing/analytics/sources?${marketingParams}`) : Promise.resolve(null),
      ])
      if ([dashboardData, teamData, managementFunnelData, managementScoringData, funnelData, scoringData, sourcesData].some(containsFinancialKey)) {
        throw new Error("数据看板响应包含被禁止的财务字段。")
      }
      setData(dashboardData)
      setTeam(teamData)
      setManagementFunnel(managementFunnelData)
      setManagementScoring(managementScoringData)
      setMarketingFunnel(funnelData)
      setMarketingScoring(scoringData)
      setMarketingSources(sourcesData)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "数据看板暂时无法加载。")
    } finally {
      setLoading(false)
    }
  }, [fromDate, management, marketingAllowed, ownerUserId, period, reloadKey, source, toDate])

  useEffect(() => { void load() }, [load])

  const filteredTeamRows = useMemo(
    () => teamMember === "all" ? team.rows : team.rows.filter((row) => row.user.id === teamMember),
    [team.rows, teamMember],
  )

  return (
    <div className="flex flex-1 flex-col">
      <div className="crm-page dashboard-page @container/main flex flex-1 flex-col gap-4 p-4 md:p-5 lg:p-6">
        <header className="crm-page-header dashboard-page-header flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <h1 className="crm-display-title text-2xl font-semibold tracking-tight">数据看板</h1>
            <p className="mt-1 text-sm text-muted-foreground">用于查看获客转化、商机推进与团队执行情况。</p>
          </div>
          <div className="dashboard-global-filters" aria-label="数据看板全局筛选">
            <label>
              <span>统计周期</span>
              <Select value={period} onValueChange={(value) => setPeriod(value as Period)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <label><span>开始日期</span><Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
                <label><span>结束日期</span><Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
              </>
            ) : null}
            <label>
              <span>负责人</span>
              <Select value={ownerUserId} onValueChange={setOwnerUserId} disabled={!management}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {management ? <SelectItem value="all">全部负责人</SelectItem> : null}
                  {(management ? users : users.filter((user) => user.id === me.id)).map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          </div>
        </header>

        <Tabs value={view} onValueChange={(value) => setView(value as DashboardView)}>
          <div className="crm-dashboard-tabs max-w-full overflow-x-auto">
            <TabsList variant="line" className="h-10">
              <TabsTrigger value="management">管理概览</TabsTrigger>
              <TabsTrigger value="marketing">营销与转化</TabsTrigger>
              <TabsTrigger value="opportunity">商机推进</TabsTrigger>
              <TabsTrigger value="team">团队表现</TabsTrigger>
            </TabsList>
          </div>
        </Tabs>

        {loading && !data ? <DashboardSkeleton /> : null}
        {error ? (
          <Alert variant="destructive" className="grid-cols-[auto_1fr_auto] items-center border-destructive/20 bg-destructive/5">
            <AlertCircle />
            <div className="min-w-0"><AlertTitle>数据看板加载失败</AlertTitle><AlertDescription>{error}</AlertDescription></div>
            <Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw />重试</Button>
          </Alert>
        ) : null}

        {data && !error ? (
          <div className="dashboard-view" aria-busy={loading}>
            {view === "management" ? <ManagementView data={data} funnel={managementFunnel} scoring={managementScoring} /> : null}
            {view === "marketing" ? marketingAllowed && marketingFunnel && marketingScoring ? (
              <MarketingView funnel={marketingFunnel} scoring={marketingScoring} sources={marketingSources} source={source} onSourceChange={setSource} />
            ) : <DashboardUnavailable title="营销与转化" message="当前账户没有营销分析权限。" /> : null}
            {view === "opportunity" ? <OpportunityView data={data} stage={opportunityStage} onStageChange={setOpportunityStage} /> : null}
            {view === "team" ? management ? (
              <TeamView rows={filteredTeamRows} allRows={team.rows} member={teamMember} onMemberChange={setTeamMember} />
            ) : <DashboardUnavailable title="团队表现" message="当前账户仅可查看个人经营数据。" /> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ManagementView({ data, funnel, scoring }: { data: DashboardData; funnel: MarketingFunnel | null; scoring: MarketingScoring | null }) {
  const won = stageCount(data, "WON")
  const opportunityStages = stageFlow(data)
  return (
    <div className="dashboard-composition">
      <DashboardMetricStrip
        label="核心业务指标"
        items={[
          { label: "新增线索", value: funnel?.kpis.newLeads ?? "—", note: "本期新增" },
          { label: "新增商机", value: data.kpis.newLeads, note: "本期新增" },
          { label: "活跃商机", value: data.kpis.activeLeads, note: "当前推进", tone: "positive" },
          { label: "成交商机", value: won, note: "本期成交", tone: "positive" },
          { label: "逾期任务", value: data.kpis.overdueTasks, note: "需处理", tone: data.kpis.overdueTasks ? "risk" : "neutral" },
          { label: "停滞商机", value: data.kpis.staleLeads, note: "需处理", tone: data.kpis.staleLeads ? "attention" : "neutral" },
        ]}
      />
      <div className="dashboard-workspace-grid">
        <DashboardPanel title="业务进展" description="从获客转化到商机推进的当前状态" className="dashboard-progress-panel">
          <div className="dashboard-progress-block">
            <h3>获客转化</h3>
            {funnel ? <DashboardStageFlow stages={marketingStages(funnel)} label="线索转化进展" compact /> : <p className="dashboard-muted-note">当前账户没有营销分析权限。</p>}
          </div>
          <div className="dashboard-progress-block">
            <h3>商机阶段</h3>
            <DashboardStageFlow stages={opportunityStages} label="商机阶段分布" compact footnote={<span>本期丢失 <strong>{stageCount(data, "LOST")}</strong></span>} />
          </div>
        </DashboardPanel>
        <DashboardPanel title="需要关注" description="优先处理影响转化与推进的问题" className="dashboard-attention-panel">
          <DashboardAttentionList items={[
            { label: "逾期任务", value: data.kpis.overdueTasks, note: "独立任务入口暂不展示", tone: data.kpis.overdueTasks ? "risk" : "neutral" },
            { label: "停滞商机", value: data.opportunities.risk.stale, note: "查看商机记录", href: "#leads", tone: data.opportunities.risk.stale ? "attention" : "neutral" },
            { label: "MQL 待处理", value: scoring?.summary.mql ?? "—", note: "查看营销线索", href: scoring ? "#marketing-leads" : undefined, tone: scoring?.summary.mql ? "attention" : "neutral" },
            { label: "缺少下一步", value: data.opportunities.risk.withoutNextAction, note: "查看商机记录", href: "#leads", tone: data.opportunities.risk.withoutNextAction ? "risk" : "neutral" },
          ]} />
        </DashboardPanel>
      </div>
      <section className="dashboard-execution-section">
        <DashboardSectionHeader title="执行健康" description="成交、行动与覆盖质量" />
        <DashboardMetricStrip compact label="执行健康指标" items={[
          ratioMetric("成交率", data.execution.winRate),
          { label: "平均销售周期", value: `${data.execution.averageSalesCycleDays} 天`, note: "已关闭商机" },
          ratioMetric("下一步行动覆盖率", data.execution.nextActionCoverage),
          ratioMetric("任务完成率", data.execution.followupCompletion),
          ratioMetric("客户覆盖率", data.execution.customerCoverage),
          { label: "MQL 平均响应时间", value: hours(funnel?.kpis.mqlResponseHours ?? null), note: "从 MQL 到首次销售响应", tone: "info" },
        ]} />
      </section>
    </div>
  )
}

function MarketingView({ funnel, scoring, sources, source, onSourceChange }: { funnel: MarketingFunnel; scoring: MarketingScoring; sources: MarketingSources | null; source: string; onSourceChange: (value: string) => void }) {
  return (
    <div className="dashboard-composition">
      <DashboardPanel
        title="线索转化路径"
        description="从 CRM 线索进入到形成商机的连续转化"
        className="dashboard-funnel-panel"
        action={<SourceFilter value={source} onChange={onSourceChange} />}
      >
        <DashboardStageFlow stages={marketingStages(funnel)} label="线索到商机转化漏斗" footnote={<span>网站访客追踪尚未接入，本漏斗从 CRM 线索开始。</span>} />
      </DashboardPanel>
      <DashboardMetricStrip compact label="营销转化指标" items={[
        { label: "新增线索", value: funnel.kpis.newLeads, note: "本期创建" },
        ratioMetric("MQL 转化率", funnel.kpis.mqlRate),
        ratioMetric("MQL → SQL", funnel.kpis.mqlToSqlRate),
        ratioMetric("SQL → 商机", funnel.kpis.sqlToOpportunityRate),
        { label: "平均线索 → 商机", value: hours(funnel.kpis.avgLeadToOpportunityHours), note: "转化耗时" },
        { label: "MQL 平均响应", value: hours(funnel.kpis.mqlResponseHours), note: "首次销售响应" },
      ]} />
      {sources ? <SourceQualityTable sources={sources} /> : null}
      <section className="dashboard-quality-section">
        <DashboardSectionHeader title="线索质量分析" description="评分用于辅助营销与销售协作，不替代人工判断" />
        <DashboardMetricStrip compact label="线索质量摘要" items={qualityMetrics(scoring)} />
      </section>
      <div className="dashboard-analysis-grid">
        <DashboardPanel title="评分分布" description="纵轴为互动活跃度，横轴为线索匹配度" className="dashboard-matrix-panel">
          <DashboardMatrix
            rows={[{ key: "HIGH", label: "高活跃" }, { key: "MEDIUM", label: "中活跃" }, { key: "LOW", label: "低活跃" }]}
            columns={[{ key: "HIGH", label: "高匹配" }, { key: "MEDIUM", label: "中匹配" }, { key: "LOW", label: "低匹配" }]}
            cells={scoring.distribution.map((cell) => ({ row: cell.engagementLevel, column: cell.fitLevel, count: cell.count }))}
            rowLabel="互动活跃度"
            columnLabel="线索匹配度"
          />
        </DashboardPanel>
        <ScoringSignalsTable scoring={scoring} />
      </div>
    </div>
  )
}

function OpportunityView({ data, stage, onStageChange }: { data: DashboardData; stage: string; onStageChange: (value: string) => void }) {
  const rows = stage === "all" ? data.opportunities.rows : data.opportunities.rows.filter((row) => row.status === stage)
  const active = data.opportunities.rows.filter((row) => ACTIVE_OPPORTUNITY_STAGES.includes(row.status))
  return (
    <div className="dashboard-composition">
      <DashboardPanel title="商机阶段" description="活跃阶段显示当前分布，成交与丢失显示本期结果" className="dashboard-opportunity-path">
        <DashboardStageFlow stages={stageFlow(data)} label="商机阶段路径" footnote={<span>本期丢失 <strong>{stageCount(data, "LOST")}</strong></span>} />
      </DashboardPanel>
      <DashboardMetricStrip compact label="商机推进摘要" items={[
        { label: "新增商机", value: data.kpis.newLeads, note: "本期创建" },
        { label: "活跃商机", value: data.kpis.activeLeads, note: "当前推进", tone: "positive" },
        { label: "成交商机", value: stageCount(data, "WON"), note: "本期成交", tone: "positive" },
        { label: "丢失商机", value: stageCount(data, "LOST"), note: "本期关闭", tone: stageCount(data, "LOST") ? "risk" : "neutral" },
        { label: "停滞商机", value: data.opportunities.risk.stale, note: "超过停滞阈值", tone: data.opportunities.risk.stale ? "attention" : "neutral" },
        { label: "无下一步行动", value: data.opportunities.risk.withoutNextAction, note: "需补充行动", tone: data.opportunities.risk.withoutNextAction ? "risk" : "neutral" },
      ]} />
      <div className="dashboard-workspace-grid">
        <OpportunityTable rows={rows} stage={stage} onStageChange={onStageChange} />
        <DashboardPanel title="推进风险" description={`${active.length} 个活跃商机的执行提醒`} className="dashboard-risk-panel">
          <DashboardAttentionList items={[
            { label: "停滞超过阈值", value: data.opportunities.risk.stale, tone: data.opportunities.risk.stale ? "attention" : "neutral" },
            { label: "缺少下一步行动", value: data.opportunities.risk.withoutNextAction, tone: data.opportunities.risk.withoutNextAction ? "risk" : "neutral" },
            { label: "未来 7 天待跟进", value: data.opportunities.risk.dueNextSevenDays, tone: "neutral" },
            { label: "已过跟进日期", value: data.opportunities.risk.overdueFollowups, tone: data.opportunities.risk.overdueFollowups ? "risk" : "neutral" },
          ]} />
        </DashboardPanel>
      </div>
    </div>
  )
}

function TeamView({ rows, allRows, member, onMemberChange }: { rows: TeamRow[]; allRows: TeamRow[]; member: string; onMemberChange: (value: string) => void }) {
  const total = (key: keyof Pick<TeamRow, "newMarketingLeads" | "newOpportunities" | "wonOpportunities" | "overdueTasks">) => rows.reduce((sum, row) => sum + row[key], 0)
  const participating = rows.filter((row) => row.newMarketingLeads + row.newOpportunities + row.wonOpportunities + row.interactions > 0).length
  return (
    <div className="dashboard-composition">
      <div className="dashboard-local-toolbar">
        <div><strong>团队执行摘要</strong><span>按负责人归属比较产出与执行质量</span></div>
        <MemberFilter rows={allRows} value={member} onChange={onMemberChange} />
      </div>
      <DashboardMetricStrip compact label="团队表现摘要" items={[
        { label: "参与销售", value: participating, note: member === "all" ? "本期有产出或互动" : "已选择成员" },
        { label: "新增线索", value: total("newMarketingLeads"), note: "本期创建" },
        { label: "新增商机", value: total("newOpportunities"), note: "本期创建" },
        { label: "成交商机", value: total("wonOpportunities"), note: "本期成交", tone: "positive" },
        { label: "逾期任务", value: total("overdueTasks"), note: "需处理", tone: total("overdueTasks") ? "risk" : "neutral" },
      ]} />
      <TeamExecutionTable rows={rows} />
    </div>
  )
}

function SourceFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="dashboard-local-filter">
      <span>线索来源</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">全部来源</SelectItem>{Object.entries(marketingSourceLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  )
}

function MemberFilter({ rows, value, onChange }: { rows: TeamRow[]; value: string; onChange: (value: string) => void }) {
  return (
    <label className="dashboard-local-filter">
      <span>团队成员</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">全部成员</SelectItem>{rows.map((row) => <SelectItem key={row.user.id} value={row.user.id}>{row.user.name}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  )
}

function OpportunityStageFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="dashboard-local-filter">
      <span>商机阶段</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部阶段</SelectItem>
          {[...OPPORTUNITY_STAGE_ORDER, "LOST"].map((key) => <SelectItem key={key} value={key}>{opportunityStageLabels[key]}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  )
}

function OpportunityTable({ rows, stage, onStageChange }: { rows: DashboardData["opportunities"]["rows"]; stage: string; onStageChange: (value: string) => void }) {
  return (
    <DashboardDataTable title="当前商机" description={`${rows.length} 条记录，优先显示正在推进的商机`} action={<OpportunityStageFilter value={stage} onChange={onStageChange} />} className="dashboard-opportunity-table">
      <Table className="min-w-[1040px]">
        <TableHeader><TableRow>{["商机", "公司", "阶段", "负责人", "最新进展", "下一步行动", "下次跟进"].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.length ? rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell><a className="dashboard-record-link" href={`#leads/${row.id}`}>{row.requirementSummary}</a><small>{row.contactName}</small></TableCell>
              <TableCell>{row.company}</TableCell>
              <TableCell><span className={`dashboard-stage-pill is-${row.status.toLowerCase()}`}>{opportunityStageLabels[row.status] ?? "其他阶段"}</span></TableCell>
              <TableCell>{row.owner?.name ?? "未分配"}</TableCell>
              <TableCell className="dashboard-clamp-cell">{row.latestProgress || "—"}</TableCell>
              <TableCell className="dashboard-clamp-cell">{row.nextAction || "—"}</TableCell>
              <TableCell>{dateTime(row.nextFollowupAt)}</TableCell>
            </TableRow>
          )) : <TableRow><TableCell colSpan={7} className="dashboard-empty-row">当前筛选下暂无商机。</TableCell></TableRow>}
        </TableBody>
      </Table>
    </DashboardDataTable>
  )
}

function SourceQualityTable({ sources }: { sources: MarketingSources }) {
  return (
    <DashboardDataTable title="线索来源质量" description="比较不同来源从线索到商机的转化质量">
      <Table className="min-w-[980px]">
        <TableHeader><TableRow>{["来源", "线索数", "MQL", "MQL 转化率", "SQL", "SQL 转化率", "商机", "线索 → 商机", "平均转化时间"].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {sources.rows.length ? sources.rows.map((row) => <TableRow key={row.source}><TableCell className="font-medium">{marketingSourceLabel(row.source)}</TableCell><TableCell>{row.leadCount}</TableCell><TableCell>{row.mqlCount}</TableCell><TableCell>{row.mqlRate}%</TableCell><TableCell>{row.sqlCount}</TableCell><TableCell>{row.sqlRate}%</TableCell><TableCell>{row.opportunityCount}</TableCell><TableCell>{row.leadToOpportunityRate}%</TableCell><TableCell>{hours(row.avgConversionHours)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={9} className="dashboard-empty-row">当前筛选下暂无来源数据。</TableCell></TableRow>}
        </TableBody>
      </Table>
    </DashboardDataTable>
  )
}

function ScoringSignalsTable({ scoring }: { scoring: MarketingScoring }) {
  return (
    <DashboardDataTable title="主要评分信号" description="按触发次数查看互动活跃度变化" className="dashboard-signals-table">
      <Table>
        <TableHeader><TableRow><TableHead>行为信号</TableHead><TableHead>次数</TableHead><TableHead>活跃度变化</TableHead></TableRow></TableHeader>
        <TableBody>
          {scoring.topSignals.length ? scoring.topSignals.map((signal) => <TableRow key={signal.eventType}><TableCell className="font-medium">{marketingActivityLabel(signal.eventType)}</TableCell><TableCell>{signal.count}</TableCell><TableCell>{signal.engagementDelta > 0 ? "+" : ""}{signal.engagementDelta}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="dashboard-empty-row">暂无评分信号。</TableCell></TableRow>}
        </TableBody>
      </Table>
    </DashboardDataTable>
  )
}

function DashboardUnavailable({ title, message }: { title: string; message: string }) {
  return <section className="dashboard-unavailable"><strong>{title}</strong><span>{message}</span></section>
}

function marketingStages(funnel: MarketingFunnel): DashboardStage[] {
  const conversion = [funnel.kpis.mqlRate.percent, funnel.kpis.mqlToSqlRate.percent, funnel.kpis.sqlToOpportunityRate.percent]
  const labels: Record<string, string> = { LEAD: "线索", MQL: "MQL", SQL: "SQL", OPPORTUNITY: "商机" }
  return funnel.stages.map((stage, index) => ({
    key: stage.key,
    label: labels[stage.key] ?? stage.label,
    count: stage.count,
    conversionToNext: index < conversion.length ? `${conversion[index]}%` : undefined,
    tone: index === funnel.stages.length - 1 ? "positive" : index === 0 ? "info" : "neutral",
  }))
}

function stageFlow(data: DashboardData): DashboardStage[] {
  return OPPORTUNITY_STAGE_ORDER.map((status, index) => ({
    key: status,
    label: opportunityStageLabels[status],
    count: stageCount(data, status),
    conversionToNext: index < OPPORTUNITY_STAGE_ORDER.length - 1 ? "推进" : undefined,
    tone: status === "WON" ? "positive" : status === "QUOTATION" ? "attention" : "neutral",
  }))
}

function stageCount(data: DashboardData, status: string) {
  return data.pipeline.find((item) => item.status === status)?.count ?? 0
}

function ratioMetric(label: string, metric: Rate): DashboardMetric {
  return { label, value: `${metric.percent}%`, note: `${metric.numerator}/${metric.denominator}`, tone: metric.denominator && metric.percent < 50 ? "attention" : "neutral" }
}

function qualityMetrics(scoring: MarketingScoring): DashboardMetric[] {
  const summary = scoring.summary
  return [
    { label: "活跃线索", value: summary.activeLeads, note: "当前样本" },
    { label: "待处理 MQL", value: summary.mql, note: "需销售接受", tone: summary.mql ? "attention" : "neutral" },
    { label: "高活跃线索", value: summary.hotLeads, note: "优先触达", tone: "positive" },
    { label: "中活跃线索", value: summary.warmLeads, note: "持续培育" },
    { label: "低活跃线索", value: summary.coldLeads, note: "观察" },
    { label: "高匹配未触达", value: summary.highScoreUntouched, note: "需处理", tone: summary.highScoreUntouched ? "attention" : "neutral" },
    { label: "重新培育", value: summary.recycledLeads, note: "回流线索" },
  ]
}

function hours(value: number | null) {
  return value == null ? "—" : `${value} 小时`
}

function dateTime(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date)
}
