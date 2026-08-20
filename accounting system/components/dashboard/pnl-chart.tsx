"use client"

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { useAccounting } from "@/lib/accounting/store"

const config = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  expenses: { label: "Expenses", color: "var(--chart-3)" },
  net: { label: "Net Income", color: "var(--chart-2)" },
} satisfies ChartConfig

const compact = (v: number) => `RM ${Math.round(v / 1000)}k`

export function PnlChart() {
  const { monthly } = useAccounting()

  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Revenue & Expenses Trend</CardTitle>
        <CardDescription>Monthly revenue, expenses, and net income.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ChartContainer config={config} className="h-[240px] w-full">
          <BarChart data={monthly} margin={{ left: 4, right: 4, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={compact} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>

        <ChartContainer config={config} className="h-[140px] w-full">
          <LineChart data={monthly} margin={{ left: 4, right: 4, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={compact} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line dataKey="net" stroke="var(--color-net)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
