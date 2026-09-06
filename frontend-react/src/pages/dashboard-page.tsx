import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, RefreshCw } from "lucide-react"

import { ExecutionHealth } from "@/components/execution-health"
import { FitEngagementMatrix } from "@/components/fit-engagement-matrix"
import { PipelineChart } from "@/components/pipeline-chart"
import { SectionCards } from "@/components/section-cards"
import { TeamExecutionTable } from "@/components/team-execution-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { getData, type CrmUser, type SessionUser } from "@/lib/api"
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

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-label="正在加载 Dashboard">
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
  const [data, setData] = useState<DashboardData | null>(null)
  const [matrix, setMatrix] = useState<MatrixData | null>(null)
  const [team, setTeam] = useState<TeamData>({ period: { from: "", to: "" }, rows: [] })
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
    try {
      const [dashboardData, matrixData, teamData] = await Promise.all([
        getData<DashboardData>(`/api/v1/crm/analytics/${management ? "management" : "self"}?${params}`),
        getData<MatrixData>(`/api/v1/crm/analytics/fit-engagement-matrix?${params}`),
        management
          ? getData<TeamData>(`/api/v1/crm/analytics/team?${params}`)
          : Promise.resolve({ period: range, rows: [] }),
      ])
      if (containsFinancialKey(dashboardData) || containsFinancialKey(matrixData) || containsFinancialKey(teamData)) {
        throw new Error("Dashboard 响应包含被禁止的财务字段。")
      }
      setData(dashboardData)
      setMatrix(matrixData)
      setTeam(teamData)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dashboard 暂时无法加载。")
    } finally {
      setLoading(false)
    }
  }, [fromDate, management, organizationRole, ownerUserId, period, reloadKey, toDate])

  useEffect(() => { void load() }, [load])

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-5 lg:p-6">
        <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {management ? "Management Overview" : "Personal Overview"}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">用非金额指标判断客户资产、机会推进与团队执行是否健康。</p>
          </div>
          <div className="flex flex-wrap items-end gap-2" aria-label="Dashboard 筛选">
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
              公司角色
              <Select value={organizationRole} onValueChange={setOrganizationRole}>
                <SelectTrigger className="h-9 w-[142px] rounded-[8px] bg-background text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">潜客 + 客户</SelectItem>
                  <SelectItem value="PROSPECT">潜在客户</SelectItem>
                  <SelectItem value="CUSTOMER">客户</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
        </header>

        {loading && !data ? <DashboardSkeleton /> : null}
        {error ? (
          <Alert variant="destructive" className="grid-cols-[auto_1fr_auto] items-center border-destructive/20 bg-destructive/5">
            <AlertCircle />
            <div className="min-w-0">
              <AlertTitle>Dashboard 加载失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw />重试</Button>
          </Alert>
        ) : null}

        {data && matrix && !error ? (
          <>
            <SectionCards data={data} />
            <PipelineChart pipeline={data.pipeline} />
            <section className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
              <FitEngagementMatrix matrix={matrix} />
              <ExecutionHealth data={data} />
            </section>
            <TeamExecutionTable rows={team.rows} />
          </>
        ) : null}
      </div>
    </div>
  )
}
