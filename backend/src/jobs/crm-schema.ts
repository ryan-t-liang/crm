import ExcelJS from "exceljs";
import type { CrmJobObjectType } from "./job-types.js";

export type CrmImportField = {
  key: string;
  label: string;
  type: "text" | "email" | "url" | "datetime" | "enum" | "decimal" | "owner";
  required: boolean;
  options?: string[];
  example: string;
};

const contactFields: CrmImportField[] = [
  { key: "contactName", label: "联系人姓名", type: "text", required: true, example: "Naderi" },
  { key: "companyShortName", label: "公司简称", type: "text", required: false, example: "Dena" },
  { key: "companyName", label: "公司全称", type: "text", required: false, example: "Dena Technologies Co., Ltd." },
  { key: "department", label: "部门", type: "text", required: false, example: "Business Development" },
  { key: "title", label: "职位", type: "text", required: false, example: "Director" },
  { key: "email", label: "邮箱", type: "email", required: false, example: "naderi@example.com" },
  { key: "phone", label: "电话", type: "text", required: false, example: "+98 21 5555 0188" },
  { key: "wechat", label: "微信", type: "text", required: false, example: "naderi_dena" },
  { key: "linkedin", label: "LinkedIn", type: "url", required: false, example: "https://linkedin.com/in/naderi" },
  { key: "website", label: "网站", type: "url", required: false, example: "https://dena.example.com" },
  { key: "industry", label: "行业", type: "text", required: false, example: "Consumer Electronics" },
  { key: "source", label: "客户来源", type: "text", required: false, example: "Convention" },
  { key: "country", label: "国家", type: "text", required: false, example: "Iran" },
  { key: "city", label: "城市", type: "text", required: false, example: "Tehran" },
  { key: "region", label: "区域", type: "text", required: false, example: "Middle East" },
  { key: "stage", label: "当前跟进阶段", type: "enum", required: false, options: ["INITIAL", "ONE_TO_ONE", "SOLUTION", "CONVENTION"], example: "SOLUTION" },
  { key: "owner", label: "负责人账号或 User ID", type: "owner", required: false, example: "sales@example.com" },
  { key: "nextFollowupAt", label: "下一次跟进时间", type: "datetime", required: false, example: "2026-09-15 10:00:00" },
  { key: "initialContext", label: "初始沟通背景", type: "text", required: false, example: "Met at an industry convention." },
  { key: "remark", label: "备注", type: "text", required: false, example: "Decision maker for digital cooperation." },
];

const leadFields: CrmImportField[] = [
  { key: "contactId", label: "所属 Contact ID", type: "text", required: true, example: "cmxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
  { key: "requirementSummary", label: "项目需求简述", type: "text", required: true, example: "AR application and service cooperation for our products" },
  { key: "requirementDetail", label: "需求详情", type: "text", required: false, example: "Build an AR product presentation experience." },
  { key: "latestProgress", label: "最近进展", type: "text", required: false, example: "Product samples received." },
  { key: "priority", label: "优先级", type: "enum", required: false, options: ["LOW", "MEDIUM", "HIGH", "URGENT"], example: "HIGH" },
  { key: "estimatedQuote", label: "预计报价", type: "decimal", required: false, example: "120000.00" },
  { key: "currency", label: "币种", type: "text", required: false, example: "CNY" },
  { key: "projectDomain", label: "项目领域", type: "text", required: false, example: "AR commerce" },
  { key: "projectType", label: "项目类型", type: "text", required: false, example: "Application service" },
  { key: "technologyType", label: "技术类型", type: "text", required: false, example: "WebAR" },
  { key: "productType", label: "产品类型", type: "text", required: false, example: "Consumer electronics" },
  { key: "productName", label: "产品名称", type: "text", required: false, example: "Vision Series" },
  { key: "resourceRequirement", label: "资源需求", type: "text", required: false, example: "3D assets and product data API." },
  { key: "solution", label: "解决方案", type: "text", required: false, example: "Browser-based AR viewer." },
  { key: "remark", label: "备注", type: "text", required: false, example: "Target launch in Q4." },
  { key: "status", label: "Lead 状态", type: "enum", required: false, options: ["NEW", "QUALIFIED", "SOLUTION", "QUOTATION", "WON", "LOST"], example: "NEW" },
  { key: "salesOwner", label: "销售负责人账号或 User ID", type: "owner", required: false, example: "sales@example.com" },
  { key: "followupOwner", label: "跟进负责人账号或 User ID", type: "owner", required: false, example: "sales@example.com" },
  { key: "nextFollowupAt", label: "下一次跟进时间", type: "datetime", required: false, example: "2026-09-15 10:00:00" },
];

export function crmImportFields(objectType: CrmJobObjectType): CrmImportField[] {
  return objectType === "CONTACT" ? contactFields : leadFields;
}

export function crmTemplateFilename(objectType: CrmJobObjectType): string {
  return objectType === "CONTACT" ? "kivisense_contact_import_template.xlsx" : "kivisense_crm_lead_import_template.xlsx";
}

export async function crmTemplateWorkbook(objectType: CrmJobObjectType): Promise<Buffer> {
  const fields = crmImportFields(objectType);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kivisense CRM";
  workbook.created = new Date("2026-09-03T00:00:00.000Z");
  const sheetName = objectType === "CONTACT" ? "Contacts" : "CRM Leads";
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 2 }] });
  fields.forEach((field, index) => {
    const column = index + 1;
    const header = sheet.getCell(1, column);
    header.value = field.key;
    header.font = { bold: true, color: { argb: "FF202322" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: field.required ? "FFE8F0ED" : "FFF3F1EC" } };
    header.alignment = { vertical: "middle" };
    header.border = { bottom: { style: "thin", color: { argb: "FFB9C5C0" } } };
    const example = sheet.getCell(2, column);
    example.value = `${field.label}${field.required ? "（必填）" : "（选填）"}；示例：${field.example}`;
    example.font = { size: 10, color: { argb: "FF5D6561" } };
    example.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F8F5" } };
    example.alignment = { vertical: "top", wrapText: true };
    sheet.getColumn(column).width = Math.max(15, Math.min(30, Math.max(field.key.length + 4, field.label.length * 2 + 8)));
    if (["phone", "contactId"].includes(field.key)) sheet.getColumn(column).numFmt = "@";
    if (field.options?.length) {
      for (let row = 3; row <= 5002; row += 1) {
        sheet.getCell(row, column).dataValidation = { type: "list", allowBlank: !field.required, formulae: [`"${field.options.join(",")}"`] };
      }
    }
  });
  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 48;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: fields.length } };
  sheet.properties.defaultRowHeight = 22;

  const notes = workbook.addWorksheet("填写说明", { views: [{ state: "frozen", ySplit: 1 }] });
  notes.columns = [{ width: 25 }, { width: 88 }];
  notes.addRows([
    ["项目", "填写规则"],
    ["模板行", "第 1 行是稳定字段 Key；第 2 行是中文说明和示例。导入前必须删除或替换第 2 行。"],
    ["必填字段", fields.filter((field) => field.required).map((field) => field.key).join("、")],
    ["负责人", "只接受 ACTIVE User 的 loginAccount 或 User ID 精确匹配；不按显示名匹配。"],
    ["枚举", "只接受模板下拉中的标准枚举；系统同时接受需求中明确列出的中文别名。"],
    ["时间", "建议使用 YYYY-MM-DD HH:mm:ss 或带时区的 ISO 8601。"],
    ["关联", objectType === "CONTACT" ? "Leads、合同、项目、文件等关联字段由系统自动生成，不可导入。" : "只通过 contactId 关联现有 Contact；不要添加 Contact 姓名、公司、Email 或电话列。"],
    ["Followup", "本模板不创建历史 Followup Timeline；仅导入当前字段和 nextFollowupAt。"],
  ]);
  notes.getRow(1).font = { bold: true, color: { argb: "FF202322" } };
  notes.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0ED" } };
  notes.getRow(1).height = 28;
  notes.getColumn(2).alignment = { vertical: "top", wrapText: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const contactExportFields = [
  ["id", "Contact ID"], ["contactName", "Contact Name"], ["companyShortName", "Company Short Name"],
  ["companyName", "Company Name"], ["department", "Department"], ["title", "Title"], ["email", "Email"],
  ["phone", "Phone"], ["wechat", "WeChat"], ["linkedin", "LinkedIn"], ["website", "Website"],
  ["industry", "Industry"], ["source", "Source"], ["country", "Country"], ["city", "City"], ["region", "Region"],
  ["stage", "Stage"], ["owner", "Owner"], ["nextFollowupAt", "Next Followup"], ["initialContext", "Initial Context"],
  ["remark", "Remark"], ["relatedLeadCount", "Related Lead Count"], ["createdAt", "Created At"], ["updatedAt", "Updated At"],
] as const;

export const crmLeadExportFields = [
  ["id", "CRM Lead ID"], ["contactId", "Contact ID"], ["requirementSummary", "Requirement Summary"],
  ["requirementDetail", "Requirement Detail"], ["latestProgress", "Latest Progress"], ["priority", "Priority"],
  ["estimatedQuote", "Estimated Quote"], ["currency", "Currency"], ["projectDomain", "Project Domain"],
  ["projectType", "Project Type"], ["technologyType", "Technology Type"], ["productType", "Product Type"],
  ["productName", "Product Name"], ["resourceRequirement", "Resource Requirement"], ["solution", "Solution"],
  ["remark", "Remark"], ["status", "Status"], ["salesOwner", "Sales Owner"], ["followupOwner", "Followup Owner"],
  ["nextFollowupAt", "Next Followup"], ["lastFollowupAt", "Last Followup"], ["contactName", "Contact Name"],
  ["company", "Company"], ["contactEmail", "Contact Email"], ["contactPhone", "Contact Phone"],
  ["createdAt", "Created At"], ["updatedAt", "Updated At"],
] as const;
