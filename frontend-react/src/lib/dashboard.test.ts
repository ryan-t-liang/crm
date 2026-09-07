import { describe, expect, it } from "vitest"

import { containsFinancialKey, customDateRange, DASHBOARD_KPIS, dateRangeForDays } from "@/lib/dashboard"

describe("dashboard contract", () => {
  it("keeps the six frozen non-financial KPIs", () => {
    expect(DASHBOARD_KPIS.map((item) => item.label)).toEqual([
      "活跃公司",
      "活跃商机",
      "新增商机",
      "待唤醒客户",
      "逾期任务",
      "停滞商机",
    ])
  })

  it("builds the same rolling time range as the legacy dashboard", () => {
    expect(dateRangeForDays(30, new Date("2026-09-06T12:00:00.000Z"))).toEqual({
      from: "2026-08-07T12:00:00.000Z",
      to: "2026-09-06T12:00:00.000Z",
    })
  })

  it("rejects invalid custom ranges", () => {
    expect(customDateRange("2026-09-06", "2026-09-05")).toBeNull()
    expect(customDateRange("", "2026-09-05")).toBeNull()
  })

  it("guards the dashboard response against financial fields", () => {
    expect(containsFinancialKey({ kpis: { activeLeads: 2 } })).toBe(false)
    expect(containsFinancialKey({ data: [{ contractValue: 20 }] })).toBe(true)
  })
})
