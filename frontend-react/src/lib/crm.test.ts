import { describe, expect, it } from "vitest"
import { ApiError, type SessionUser } from "./api"
import { canManageTask, friendlyError, migratedRoutes, queryString, type Task } from "./crm"

const user = (key:string,id="mine",permissions=["crm.task.edit"]):SessionUser => ({id,name:"QA",loginAccount:"qa@example.test",mustChangePassword:false,role:{key,name:key},permissions})
describe("Full CRM migration view contracts",()=>{
  it("all normal navigation families remain in React",()=>{
    for(const route of ["dashboard","organizations","contacts","leads","operations","workbench","suppliers","accounts","roles","audit","login","security"]) expect(migratedRoutes.has(route)).toBe(true)
  })
  it("omits unset filters instead of sending sentinel values",()=>{
    expect(queryString({ownerUserId:"all",organizationId:"org-1",source:"展会",page:2,empty:"",missing:undefined})).toBe("organizationId=org-1&source=%E5%B1%95%E4%BC%9A&page=2")
  })
  it("SALES task mutations require ownership even with team visibility",()=>{
    const task={ownerUserId:"other"} as Task
    expect(canManageTask(user("SALES"),task,"crm.task.edit")).toBe(false)
    expect(canManageTask(user("SALES","other"),task,"crm.task.edit")).toBe(true)
    expect(canManageTask(user("SALES","mine",["crm.task.edit","crm.dashboard.management.view"]),task,"crm.task.edit")).toBe(false)
  })
  it("SUPER_ADMIN still needs the action permission, VIEWER has no mutations",()=>{
    const task={ownerUserId:"other"} as Task
    expect(canManageTask(user("SUPER_ADMIN"),task,"crm.task.edit")).toBe(true)
    expect(canManageTask(user("SUPER_ADMIN","mine",[]),task,"crm.task.edit")).toBe(false)
    expect(canManageTask(user("VIEWER","other",["crm.task.view"]),task,"crm.task.edit")).toBe(false)
  })
  it("hides internal failures and preserves safe validation feedback",()=>{
    expect(friendlyError(new Error("private stack"))).not.toContain("private")
    expect(friendlyError(new ApiError("private SQL",500))).not.toContain("SQL")
    expect(friendlyError(new ApiError("请选择有效联系人",422))).toBe("请选择有效联系人")
  })
})
