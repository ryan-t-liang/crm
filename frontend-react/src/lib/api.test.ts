import { afterEach, describe, expect, it, vi } from "vitest"

import { crmApi, inferAppBasePath } from "@/lib/api"

afterEach(() => vi.unstubAllGlobals())
describe("request content type", () => {
  it("does not send a JSON content-type with an empty DELETE body", async () => {
    vi.stubGlobal("window", { location: { pathname: "/crm_kivisense/" } })
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{id:"record"}}), {status:200,headers:{"content-type":"application/json"}}))
    vi.stubGlobal("fetch", fetchMock)
    await crmApi("/api/v1/crm/contacts/record", {method:"DELETE"})
    expect(fetchMock.mock.calls[0][0]).toBe("/crm_kivisense/api/v1/crm/contacts/record")
    expect(fetchMock.mock.calls[0][1].headers.has("content-type")).toBe(false)
  })
  it("keeps JSON content-type for actual mutation payloads", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } })
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", {status:200,headers:{"content-type":"application/json"}}))
    vi.stubGlobal("fetch", fetchMock)
    await crmApi("/api/v1/crm/tasks", {method:"POST",body:"{}"})
    expect(fetchMock.mock.calls[0][1].headers.get("content-type")).toBe("application/json")
  })
})

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
