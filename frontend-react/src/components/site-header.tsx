import { CircleCheck } from "lucide-react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function SiteHeader({ title = "Dashboard", dashboard = true }: { title?: string; dashboard?: boolean }) {
  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b bg-background px-4 transition-[width,height] ease-linear">
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
      {dashboard && <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
        <CircleCheck className="size-3.5 text-primary" />
        非金额运营视图
      </div>}
    </header>
  )
}
