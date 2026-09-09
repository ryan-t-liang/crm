import { IconArrowUpRight as ArrowUpRight } from "@douyinfe/semi-icons"
import { cn } from "@/lib/utils"

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/crm/ui"
import type { MatrixData } from "@/lib/dashboard"

export function FitEngagementMatrix({ matrix }: { matrix: MatrixData }) {
  function openOrganizations(fitLevel: string, engagementLevel: string) {
    sessionStorage.setItem("kivisense.crm.organization.filters", JSON.stringify({ fitLevel, engagementLevel }))
    window.location.hash = "organizations"
  }

  return (
    <Card className="gap-4 border-border/90 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="text-base">客户匹配度 × 互动活跃度</CardTitle>
        <CardDescription>{matrix.total} 个组织，点击矩阵进入对应运营池</CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="mb-2 grid grid-cols-[54px_repeat(3,minmax(0,1fr))] items-center gap-2 text-center text-[11px] font-medium text-muted-foreground">
          <span />
          <span>高匹配</span>
          <span>中匹配</span>
          <span>低匹配</span>
        </div>
        <div className="grid grid-cols-[54px_repeat(3,minmax(0,1fr))] gap-2">
          {["HIGH", "MEDIUM", "LOW"].flatMap((engagement, rowIndex) => {
            const label = ["高活跃", "中活跃", "低活跃"][rowIndex]
            const cells = matrix.cells.filter((cell) => cell.engagementLevel === engagement)
            return [
              <div key={`${engagement}-label`} className="flex items-center text-[11px] font-medium text-muted-foreground">{label}</div>,
              ...cells.map((cell) => {
                const primary = cell.key === "HIGH_HIGH"
                return (
                  <Button
                    key={cell.key}
                    variant="ghost"
                    onClick={() => openOrganizations(cell.fitLevel, cell.engagementLevel)}
                    className={cn(
                      "group min-h-20 rounded-[8px] border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      primary ? "border-primary/30 bg-brand-50 hover:bg-brand-100" : "border-border bg-muted/25 hover:bg-muted/60",
                    )}
                    aria-label={`${cell.label}，${cell.count} 个组织`}
                  >
                    <span className="flex items-start justify-between gap-2 text-[11px] leading-4 text-muted-foreground">
                      {cell.label}
                      <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                    <strong className="mt-2 block text-xl font-semibold tabular-nums text-foreground">{cell.count}</strong>
                  </Button>
                )
              }),
            ]
          })}
        </div>
      </CardContent>
    </Card>
  )
}
