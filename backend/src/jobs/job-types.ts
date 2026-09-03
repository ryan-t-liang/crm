import { ApiError } from "../common/errors.js";

export type CrmJobObjectType = "CONTACT" | "CRM_LEAD";
export type JobAction = "import" | "export";

const crmObjectTypes = new Set<string>(["CONTACT", "CRM_LEAD"]);

export function isCrmJobObjectType(value: string): value is CrmJobObjectType {
  return crmObjectTypes.has(value);
}

export function assertCrmJobObjectType(value: string): asserts value is CrmJobObjectType {
  if (!isCrmJobObjectType(value)) {
    throw new ApiError(400, "INVALID_JOB_OBJECT_TYPE", "不支持的导入或导出对象类型");
  }
}

export function jobPermission(objectType: string, action: JobAction): string {
  assertCrmJobObjectType(objectType);
  return `${objectType === "CONTACT" ? "crm.contact" : "crm.lead"}.${action}`;
}
