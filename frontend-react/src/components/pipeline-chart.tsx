import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { DashboardData } from "@/lib/dashboard"

const pipelineLabels: Record<string, string> = {
  NEW: "新建",
  QUALIFIED: "已验证",
  SOLUTION: "方案",
  QUOTATION: "报价",
  WON: "成交",
  LOST: "丢失",
}

const chartConfig = {
  count: {
    label: "线索数量",
    color: "var(--color-primary)",
  },
} satisfies ChartConfig

export function PipelineChart({ pipeline }: { pipeline: DashboardData["pipeline"] }) {
  const rows = pipeline.map((item) => ({ ...item, label: pipelineLabels[item.status] || item.status }))

  return (
    <Card className="gap-4 border-border/90 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="text-base">销售机会 Pipeline</CardTitle>
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
