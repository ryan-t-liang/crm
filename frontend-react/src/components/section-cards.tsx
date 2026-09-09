import {
  IconAlarmStroked as ClockAlert,
  IconApartment as Building2,
  IconFlagStroked as Goal,
  IconPause as PauseCircle,
  IconPlusCircleStroked as CirclePlus,
  IconRefresh as RefreshCcw,
} from "@douyinfe/semi-icons"

import { Card, CardContent, CardHeader } from "@/components/crm/ui"
import { DASHBOARD_KPIS, type DashboardData } from "@/lib/dashboard"

const icons = {
  activeOrganizations: Building2,
  activeLeads: Goal,
  newLeads: CirclePlus,
  reactivationCandidates: RefreshCcw,
  overdueTasks: ClockAlert,
  staleLeads: PauseCircle,
}

export function SectionCards({ data }: { data: DashboardData }) {
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="关键运营指标">
      {DASHBOARD_KPIS.map((item) => {
        const Icon = icons[item.key]
        const attention = item.key === "overdueTasks" || item.key === "staleLeads"
        return (
          <Card key={item.key} className="gap-3 overflow-hidden border-border/90 py-4 shadow-none">
            <CardHeader className="flex grid-cols-none flex-row items-center justify-between gap-3 px-4">
              <span className="text-[13px] font-medium text-muted-foreground">{item.label}</span>
              <Icon className={attention ? "crm-metric-icon is-warning size-4" : "crm-metric-icon size-4"} aria-hidden="true" />
            </CardHeader>
            <CardContent className="px-4">
              <div className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">{data.kpis[item.key]}</div>
              <p className="mt-2 truncate text-xs text-muted-foreground">{item.description}</p>
            </CardContent>
          </Card>
        )
      })}
    </section>
  )
}
