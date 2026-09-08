import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { DashboardData } from "@/lib/dashboard"
import { opportunityStageLabels } from "@/lib/product-language"

const chartConfig = {
  count: {
    label: "商机数量",
    color: "var(--color-primary)",
  },
} satisfies ChartConfig

export function PipelineChart({ pipeline }: { pipeline: DashboardData["pipeline"] }) {
  const rows = pipeline.map((item) => ({ ...item, label: opportunityStageLabels[item.status] || "其他阶段" }))

  return (
    <Card className="gap-4 border-border/90 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="text-base">商机阶段分布</CardTitle>
        <CardDescription>活跃阶段为当前数量，成交与丢失为所选期间关闭数量</CardDescription>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-2 sm:px-5">
        <ChartContainer config={chartConfig} className="h-[270px] w-full aspect-auto">
          <BarChart accessibilityLayer data={rows} margin={{ left: -12, right: 8, top: 16, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 4" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
            <ChartTooltip cursor={{ fill: "var(--color-muted)" }} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[5, 5, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
