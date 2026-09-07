export type SessionUser = {
  id: string
  name: string
  loginAccount: string
  mustChangePassword: boolean
  role: { id?: string; key: string; name: string }
  permissions: string[]
}

export type CrmUser = {
  id: string
  name: string
  loginAccount?: string
  status?: string
}

export class ApiError extends Error {
  status: number
  code?: string
  traceId?: string
  details?: unknown

  constructor(message: string, status: number, code?: string, traceId?: string, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.traceId = traceId
    this.details = details
  }
}

export function inferAppBasePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "")
  if (!normalized) return ""
  if (normalized.endsWith("/legacy")) return normalized.slice(0, -"/legacy".length)
  return normalized
}

export function appBasePath(): string {
  return inferAppBasePath(window.location.pathname)
}

export function appUrl(path: string): string {
  return `${appBasePath()}${path.startsWith("/") ? path : `/${path}`}`
}

export function legacyUrl(route: string): string {
  return `${appBasePath()}/legacy/#${route.replace(/^#?\/?/, "")}`
}

export function assetUrl(path: string): string {
  return appUrl(path)
}

export async function crmApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set("accept", "application/json")
  if (options.body != null && !(options.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json")
  const response = await fetch(appUrl(path), { ...options, headers, credentials: "same-origin" })
  const contentType = response.headers.get("content-type") || ""
  const payload = contentType.includes("application/json") ? await response.json() : null
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/api/v1/auth/")) window.dispatchEvent(new Event("crm:session-expired"))
    throw new ApiError(
      payload?.error?.message || `请求失败（${response.status}）`,
      response.status,
      payload?.error?.code,
      payload?.traceId || response.headers.get("x-trace-id") || undefined,
      payload?.error?.fieldErrors ?? payload?.error?.details,
    )
  }
  return payload as T
}

export async function getData<T>(path: string): Promise<T> {
  const response = await crmApi<{ data: T }>(path)
  return response.data
}
