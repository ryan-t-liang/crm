import { ApiError } from "../common/errors.js";

export type LegacyJobObjectType = "CUSTOMER" | "LEAD";
export type CrmJobObjectType = "CONTACT" | "CRM_LEAD";
export type JobObjectType = LegacyJobObjectType | CrmJobObjectType;
export type JobAction = "import" | "export";

const legacyObjectTypes = new Set<string>(["CUSTOMER", "LEAD"]);
const crmObjectTypes = new Set<string>(["CONTACT", "CRM_LEAD"]);

export function isLegacyJobObjectType(value: string): value is LegacyJobObjectType {
  return legacyObjectTypes.has(value);
}

export function isCrmJobObjectType(value: string): value is CrmJobObjectType {
  return crmObjectTypes.has(value);
}

export function assertJobBrandInvariant(objectType: string, brandId: string | null | undefined): void {
  if (isLegacyJobObjectType(objectType) && !brandId) {
    throw new ApiError(409, "JOB_BRAND_INVARIANT_VIOLATION", "Legacy Import/Export 任务必须关联品牌");
  }
  if (isCrmJobObjectType(objectType) && brandId) {
    throw new ApiError(409, "JOB_BRAND_INVARIANT_VIOLATION", "CRM Import/Export 任务不能关联 GP/UN 品牌");
  }
  if (!isLegacyJobObjectType(objectType) && !isCrmJobObjectType(objectType)) {
    throw new ApiError(400, "INVALID_JOB_OBJECT_TYPE", "不支持的 Import/Export 对象类型");
  }
}

export function jobPermission(objectType: string, action: JobAction): string {
  const module = objectType === "CUSTOMER"
    ? "customer"
    : objectType === "LEAD"
      ? "lead"
      : objectType === "CONTACT"
        ? "crm.contact"
        : objectType === "CRM_LEAD"
          ? "crm.lead"
          : null;
  if (!module) throw new ApiError(400, "INVALID_JOB_OBJECT_TYPE", "不支持的 Import/Export 对象类型");
  return `${module}.${action}`;
}
