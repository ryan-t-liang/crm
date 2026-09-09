import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/crm/ui"
import { lifecycleLabels, type DashboardData } from "@/lib/dashboard"

export function ExecutionHealth({ data }: { data: DashboardData }) {
  const metrics = [
    ["成交率", `${data.execution.winRate.percent}%`, `${data.execution.winRate.numerator}/${data.execution.winRate.denominator}`],
    ["平均销售周期", `${data.execution.averageSalesCycleDays} 天`, "已关闭机会"],
    ["下一步行动覆盖率", `${data.execution.nextActionCoverage.percent}%`, `${data.execution.nextActionCoverage.numerator}/${data.execution.nextActionCoverage.denominator}`],
    ["任务完成率", `${data.execution.followupCompletion.percent}%`, `${data.execution.followupCompletion.numerator}/${data.execution.followupCompletion.denominator}`],
    ["客户覆盖率", `${data.execution.customerCoverage.percent}%`, `${data.execution.customerCoverage.numerator}/${data.execution.customerCoverage.denominator}`],
    ["经营计划转商机", `${data.execution.nurtureConversion.percent}%`, `${data.execution.nurtureConversion.numerator}/${data.execution.nurtureConversion.denominator}`],
    ["唤醒组织", String(data.execution.reactivation.count), "所选期间"],
    ["高匹配未触达", String(data.execution.highFitUntouched), "需要优先行动"],
  ]
  const maxLifecycle = Math.max(1, ...data.lifecycle.map((item) => item.count))

  return (
    <Card className="gap-4 border-border/90 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="text-base">执行健康</CardTitle>
        <CardDescription>销售执行与客户覆盖的非金额指标</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-5 pb-5">
        <div className="grid grid-cols-2 border-l border-t sm:grid-cols-4">
          {metrics.map(([label, value, note]) => (
            <div key={label} className="min-w-0 border-b border-r p-3">
              <span className="block truncate text-xs text-muted-foreground">{label}</span>
              <strong className="mt-1.5 block text-lg font-semibold tabular-nums">{value}</strong>
              <small className="mt-0.5 block truncate text-[11px] text-muted-foreground">{note}</small>
            </div>
          ))}
        </div>
        <div>
          <h3 className="mb-3 text-sm font-medium">客户生命周期</h3>
          <div className="space-y-2.5">
            {data.lifecycle.map((item) => (
              <div key={item.stage} className="grid grid-cols-[56px_1fr_30px] items-center gap-3 text-xs">
                <span className="text-muted-foreground">{lifecycleLabels[item.stage] || "其他阶段"}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-neutral-700" style={{ width: `${(item.count / maxLifecycle) * 100}%` }} />
                </span>
                <strong className="text-right tabular-nums">{item.count}</strong>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
