import { describe, expect, it } from "vitest"

import { inferAppBasePath } from "@/lib/api"

describe("base path", () => {
  it("supports the root development URL", () => {
    expect(inferAppBasePath("/")).toBe("")
  })

  it("preserves the deployed CRM prefix", () => {
    expect(inferAppBasePath("/crm_kivisense/")).toBe("/crm_kivisense")
  })

  it("normalizes the preserved legacy entry", () => {
    expect(inferAppBasePath("/crm_kivisense/legacy/")).toBe("/crm_kivisense")
  })
})
