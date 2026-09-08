import { CircleCheck } from "lucide-react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/v1/ui"
import { Separator } from "@/components/v1/ui"
import { SidebarTrigger } from "@/components/v1/ui"

export function SiteHeader({ title = "数据看板", dashboard = true }: { title?: string; dashboard?: boolean }) {
  return (
    <header className="crm-site-header flex shrink-0 items-center justify-between gap-3 border-b transition-[width,height] ease-linear">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1 rounded-[8px]" aria-label="展开或收起侧栏" />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <Breadcrumb>
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem className="hidden sm:block">Kivisense CRM</BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-3">
        {dashboard && <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <CircleCheck className="size-3.5 text-primary" />
          非金额运营视图
        </div>}
        <div id="crm-site-header-context-actions" className="crm-site-header-context-actions" />
      </div>
    </header>
  )
}
