export const DASHBOARD_KPIS = [
  { key: "activeOrganizations", label: "活跃公司", description: "当前处于活跃状态" },
  { key: "activeLeads", label: "活跃线索", description: "正在推进的机会" },
  { key: "newLeads", label: "新增线索", description: "所选期间内创建" },
  { key: "reactivationCandidates", label: "待唤醒客户", description: "高 Fit 且已沉睡" },
  { key: "overdueTasks", label: "逾期任务", description: "已超过到期时间" },
  { key: "staleLeads", label: "停滞线索", description: "长期没有新进展" },
] as const

export type DashboardKpiKey = typeof DASHBOARD_KPIS[number]["key"]

export type RatioMetric = {
  numerator: number
  denominator: number
  percent: number
}

export type DashboardData = {
  period: { from: string; to: string; ownerUserId: string | null; organizationRole: string | null }
  kpis: Record<DashboardKpiKey, number>
  pipeline: Array<{ status: string; count: number }>
  lifecycle: Array<{ stage: string; count: number }>
  execution: {
    winRate: RatioMetric
    averageSalesCycleDays: number
    nextActionCoverage: RatioMetric
    followupCompletion: RatioMetric & { onTime: number }
    customerCoverage: RatioMetric
    nurtureConversion: RatioMetric
    reactivation: RatioMetric & { count: number }
    activeNurtures: number
    highFitUntouched: number
  }
}

export type MatrixData = {
  total: number
  cells: Array<{
    key: string
    fitLevel: "HIGH" | "MEDIUM" | "LOW"
    engagementLevel: "HIGH" | "MEDIUM" | "LOW"
    label: string
    count: number
  }>
}

export type TeamRow = {
  user: { id: string; name: string; loginAccount?: string }
  openTasks: number
  doneTasks: number
  overdueTasks: number
  onTimeCompletionPercent: number
  interactions: number
  activeLeads: number
  staleLeads: number
  leadsWithNextActionPercent: number
}

export type TeamData = {
  period: { from: string; to: string }
  rows: TeamRow[]
}

const DAY = 86_400_000

export function dateRangeForDays(days: number, now = new Date()): { from: string; to: string } {
  return {
    from: new Date(now.getTime() - days * DAY).toISOString(),
    to: now.toISOString(),
  }
}

export function customDateRange(from: string, to: string): { from: string; to: string } | null {
  if (!from || !to) return null
  const fromDate = new Date(`${from}T00:00:00`)
  const toDate = new Date(`${to}T23:59:59.999`)
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) return null
  return { from: fromDate.toISOString(), to: toDate.toISOString() }
}

export function localDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

const FINANCIAL_KEY = /(amount|revenue|cost|invoice|payment|procurement|estimatedquote|quotationvalue|contractvalue)/i

export function containsFinancialKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  if (Array.isArray(value)) return value.some(containsFinancialKey)
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => FINANCIAL_KEY.test(key) || containsFinancialKey(nested))
}

export const lifecycleLabels: Record<string, string> = {
  TARGET: "目标",
  CONTACTED: "已触达",
  NURTURING: "孵化中",
  OPPORTUNITY: "机会中",
  CUSTOMER: "客户",
}
