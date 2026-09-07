import ExcelJS from "exceljs";
import type { CrmJobObjectType } from "./job-types.js";

export type CrmImportField = {
  key: string;
  label: string;
  type: "text" | "email" | "url" | "datetime" | "enum" | "decimal" | "owner" | "multi-owner" | "multi-text" | "attachment-url";
  required: boolean;
  options?: string[];
  example: string;
};

const contactFields: CrmImportField[] = [
  { key: "contactName", label: "联系人姓名", type: "text", required: true, example: "Naderi" },
  { key: "contactType", label: "联系人类型", type: "enum", required: false, options: ["BUSINESS", "INDIVIDUAL"], example: "BUSINESS" },
  { key: "organizationId", label: "公司编号", type: "text", required: false, example: "cmxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
  { key: "organizationName", label: "公司名称", type: "text", required: false, example: "Dena Technologies Co., Ltd." },
  { key: "companyShortName", label: "公司简称", type: "text", required: false, example: "Dena" },
  { key: "companyName", label: "公司全称", type: "text", required: false, example: "Dena Technologies Co., Ltd." },
  { key: "department", label: "部门", type: "text", required: false, example: "Business Development" },
  { key: "title", label: "职位", type: "text", required: false, example: "Director" },
  { key: "email", label: "邮箱", type: "email", required: false, example: "naderi@example.com" },
  { key: "phone", label: "电话", type: "text", required: false, example: "+98 21 5555 0188" },
  { key: "wechat", label: "微信", type: "text", required: false, example: "naderi_dena" },
  { key: "linkedin", label: "领英", type: "url", required: false, example: "https://linkedin.com/in/naderi" },
  { key: "website", label: "网站", type: "url", required: false, example: "https://dena.example.com" },
  { key: "industry", label: "行业", type: "text", required: false, example: "Consumer Electronics" },
  { key: "source", label: "客户来源", type: "text", required: false, example: "Convention" },
  { key: "country", label: "国家", type: "text", required: false, example: "Iran" },
  { key: "city", label: "城市", type: "text", required: false, example: "Tehran" },
  { key: "region", label: "区域", type: "text", required: false, example: "Middle East" },
  { key: "stage", label: "当前跟进阶段", type: "enum", required: false, options: ["INITIAL", "ONE_TO_ONE", "SOLUTION", "CONVENTION"], example: "SOLUTION" },
  { key: "owner", label: "负责人账号或用户编号", type: "owner", required: false, example: "sales@example.com" },
  { key: "nextFollowupAt", label: "下一次跟进时间", type: "datetime", required: false, example: "2026-09-15 10:00:00" },
  { key: "followupAttention", label: "跟进注意", type: "text", required: false, example: "长期跟进时需注意的事项" },
  { key: "initialContext", label: "初始沟通背景", type: "text", required: false, example: "Met at an industry convention." },
  { key: "meetingMinutesFiles", label: "Meeting Minutes 外部 URL", type: "attachment-url", required: false, example: "https://files.example.com/meeting-minutes.pdf" },
  { key: "remark", label: "备注", type: "text", required: false, example: "Decision maker for digital cooperation." },
];

const organizationFields: CrmImportField[] = [
  { key: "name", label: "公司名称", type: "text", required: true, example: "Dena Technologies Co., Ltd." },
  { key: "shortName", label: "公司简称", type: "text", required: false, example: "Dena" },
  { key: "website", label: "网站", type: "url", required: false, example: "https://dena.example.com" },
  { key: "industry", label: "行业", type: "text", required: false, example: "Consumer Electronics" },
  { key: "country", label: "国家", type: "text", required: false, example: "Iran" },
  { key: "region", label: "区域", type: "text", required: false, example: "Middle East" },
  { key: "city", label: "城市", type: "text", required: false, example: "Tehran" },
  { key: "roles", label: "公司角色（每行一项）", type: "multi-text", required: false, options: ["PROSPECT", "CUSTOMER", "VENDOR", "PARTNER"], example: "PROSPECT" },
  { key: "lifecycle", label: "生命周期", type: "enum", required: false, options: ["TARGET", "CONTACTED", "NURTURING", "OPPORTUNITY", "CUSTOMER", "DISQUALIFIED"], example: "TARGET" },
  { key: "owner", label: "负责人账号或用户编号", type: "owner", required: false, example: "sales@example.com" },
  { key: "fitScore", label: "适配评分", type: "decimal", required: false, example: "80" },
  { key: "fitReason", label: "评分原因", type: "text", required: false, example: "重点品牌，长期合作潜力" },
  { key: "note", label: "备注", type: "text", required: false, example: "客户与供应商统一主档" },
  { key: "logo", label: "Logo 外部 URL", type: "attachment-url", required: false, example: "https://files.example.com/logo.png" },
];

const leadFields: CrmImportField[] = [
  { key: "contactId", label: "关联联系人编号", type: "text", required: true, example: "cmxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
  { key: "requirementSummary", label: "项目需求简述", type: "text", required: true, example: "AR application and service cooperation for our products" },
  { key: "requirementDetail", label: "需求详情", type: "text", required: false, example: "Build an AR product presentation experience." },
  { key: "latestProgress", label: "最近进展", type: "text", required: false, example: "Product samples received." },
  { key: "nextAction", label: "下一步动作", type: "text", required: false, example: "Confirm the revised scope with the customer." },
  { key: "imageRequirementNote", label: "图片需求说明", type: "text", required: false, example: "Use clean front-facing pack shots." },
  { key: "leadSource", label: "客户来源", type: "text", required: false, example: "Kiviman" },
  { key: "priority", label: "商机优先级", type: "enum", required: false, options: ["LOW", "MEDIUM", "HIGH", "URGENT"], example: "HIGH" },
  { key: "estimatedQuote", label: "预计报价", type: "decimal", required: false, example: "120000.00" },
  { key: "currency", label: "币种", type: "text", required: false, example: "CNY" },
  { key: "projectDomain", label: "项目领域", type: "text", required: false, example: "AR commerce" },
  { key: "projectType", label: "项目类型", type: "text", required: false, example: "Application service" },
  { key: "technologyType", label: "技术类型", type: "text", required: false, example: "WebAR" },
  { key: "productType", label: "产品类型", type: "text", required: false, example: "Consumer electronics" },
  { key: "productName", label: "产品名称", type: "text", required: false, example: "Vision Series" },
  { key: "resourceRequirement", label: "资源需求", type: "text", required: false, example: "3D assets and product data API." },
  { key: "collaborationGroups", label: "对接群（每行一项）", type: "multi-text", required: false, example: "客户项目群\n外部供应商群" },
  { key: "followMode", label: "跟单模式", type: "text", required: false, example: "顾问式跟进" },
  { key: "solution", label: "解决方案", type: "text", required: false, example: "Browser-based AR viewer." },
  { key: "quotationNote", label: "报价说明", type: "text", required: false, example: "Quotation includes production and annual support." },
  { key: "remark", label: "备注", type: "text", required: false, example: "Target launch in Q4." },
  { key: "status", label: "商机状态", type: "enum", required: false, options: ["NEW", "QUALIFIED", "SOLUTION", "QUOTATION", "WON", "LOST"], example: "NEW" },
  { key: "salesOwner", label: "销售负责人账号或用户编号", type: "owner", required: true, example: "sales@example.com" },
  { key: "followupOwner", label: "跟进负责人账号或用户编号", type: "owner", required: false, example: "sales@example.com" },
  { key: "participantUsers", label: "参与人员账号或用户编号（每行一项）", type: "multi-owner", required: false, example: "sales@example.com\nproducer@example.com" },
  { key: "nextFollowupAt", label: "下一次跟进时间", type: "datetime", required: false, example: "2026-09-15 10:00:00" },
  { key: "wonAt", label: "成交日期", type: "datetime", required: false, example: "2026-10-01 10:00:00" },
  { key: "deliveryFollowupAt", label: "交付跟进日期", type: "datetime", required: false, example: "2026-10-15 10:00:00" },
  { key: "contractRenewalAt", label: "合同续约日期", type: "datetime", required: false, example: "2027-10-01 10:00:00" },
  { key: "paymentReceivedAt", label: "收款日期", type: "datetime", required: false, example: "2026-10-10 10:00:00" },
  { key: "requirementFiles", label: "需求 / 签署文件外部 URL", type: "attachment-url", required: false, example: "https://files.example.com/requirement.pdf" },
  { key: "requirementImages", label: "图片需求外部 URL", type: "attachment-url", required: false, example: "https://files.example.com/reference.jpg" },
  { key: "proposalFiles", label: "正式方案文件外部 URL", type: "attachment-url", required: false, example: "https://files.example.com/proposal.pptx" },
  { key: "quotationFiles", label: "报价单外部 URL", type: "attachment-url", required: false, example: "https://files.example.com/quotation.xlsx" },
];

const marketingLeadFields: CrmImportField[] = [
  { key: "fullName", label: "姓名", type: "text", required: true, example: "Naderi" },
  { key: "email", label: "Email", type: "email", required: false, example: "naderi@denaholding.com" },
  { key: "phone", label: "Phone", type: "text", required: false, example: "+98 21 5555 0188" },
  { key: "whatsapp", label: "WhatsApp", type: "text", required: false, example: "+98 912 555 0188" },
  { key: "wechat", label: "WeChat", type: "text", required: false, example: "naderi_dena" },
  { key: "companyName", label: "公司", type: "text", required: false, example: "Dena" },
  { key: "title", label: "职位", type: "text", required: false, example: "Manager" },
  { key: "countryCode", label: "国家代码", type: "text", required: false, example: "IR" },
  { key: "source", label: "来源", type: "enum", required: true, options: ["WEBSITE", "FORM", "CAMPAIGN", "EVENT", "EXHIBITION", "REFERRAL", "LINKEDIN", "WECHAT", "OUTBOUND", "PARTNER", "IMPORT", "MANUAL", "OTHER"], example: "WEBSITE" },
  { key: "sourceChannel", label: "来源渠道", type: "text", required: false, example: "ORGANIC_SEARCH" },
  { key: "sourceDetail", label: "来源详情", type: "text", required: false, example: "Google/Bing" },
  { key: "inquiryType", label: "询盘类型", type: "text", required: false, example: "Not sure yet" },
  { key: "inquiryContent", label: "原始询盘", type: "text", required: false, example: "We interest to add AR app and service on our products." },
  { key: "owner", label: "负责人账号或用户编号", type: "owner", required: false, example: "sales@example.com" },
  { key: "fitScore", label: "线索匹配度", type: "decimal", required: false, example: "40" },
  { key: "note", label: "备注", type: "text", required: false, example: "Imported from exhibition follow-up." },
];

export function crmImportFields(objectType: CrmJobObjectType): CrmImportField[] {
  return objectType === "CONTACT" ? contactFields : objectType === "CRM_LEAD" ? leadFields : objectType === "MARKETING_LEAD" ? marketingLeadFields : organizationFields;
}

export function crmTemplateFilename(objectType: CrmJobObjectType): string {
  return objectType === "CONTACT" ? "kivisense_contact_import_template.xlsx" : objectType === "CRM_LEAD" ? "kivisense_opportunity_import_template.xlsx" : objectType === "MARKETING_LEAD" ? "kivisense_marketing_lead_import_template.xlsx" : "kivisense_organization_import_template.xlsx";
}

export async function crmTemplateWorkbook(objectType: CrmJobObjectType): Promise<Buffer> {
  const fields = crmImportFields(objectType);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kivisense CRM";
  workbook.created = new Date("2026-09-03T00:00:00.000Z");
  const sheetName = objectType === "CONTACT" ? "联系人" : objectType === "CRM_LEAD" ? "商机" : objectType === "MARKETING_LEAD" ? "线索" : "公司";
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
    ["负责人", "只接受启用账号的登录账号或用户编号精确匹配；多人员字段每行填写一个账号或用户编号。"],
    ["枚举", "只接受模板下拉中的标准枚举；系统同时接受需求中明确列出的中文别名。"],
    ["时间", "建议使用 YYYY-MM-DD HH:mm:ss 或带时区的 ISO 8601 时间。"],
    ["关联", objectType === "CONTACT" ? "商机、合同和项目关联由系统管理；Meeting Minutes 只接受外部 HTTP/HTTPS URL，或留空后在 CRM 上传。" : objectType === "CRM_LEAD" ? "只通过 contactId 关联现有联系人；附件列只接受外部 HTTP/HTTPS URL，或留空后在 CRM 上传。" : objectType === "MARKETING_LEAD" ? "导入只创建线索主档，不导入评分历史或行为历史。" : "公司关联由系统主档管理。"],
    ["附件", "每行可填写多个外部 URL，以换行分隔。仅填写本地文件名会在预检中提示 ATTACHMENT_FILE_NOT_AVAILABLE，且不会伪造上传记录。"],
    ["跟进", "本模板不创建历史跟进时间线；仅导入当前字段和下一次跟进时间。"],
  ]);
  notes.getRow(1).font = { bold: true, color: { argb: "FF202322" } };
  notes.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0ED" } };
  notes.getRow(1).height = 28;
  notes.getColumn(2).alignment = { vertical: "top", wrapText: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const contactExportFields = [
  ["id", "联系人编号"], ["contactName", "联系人姓名"], ["contactType", "联系人类型"], ["organizationId", "公司编号"], ["organizationName", "公司主档名称"], ["companyShortName", "公司简称"],
  ["companyName", "公司全称"], ["department", "部门"], ["title", "职位"], ["email", "电子邮箱"],
  ["phone", "电话"], ["wechat", "微信"], ["linkedin", "领英"], ["website", "网站"],
  ["industry", "行业"], ["source", "来源"], ["country", "国家"], ["city", "城市"], ["region", "区域"],
  ["stage", "触达阶段"], ["owner", "负责人"], ["nextFollowupAt", "下一次跟进"], ["initialContext", "初始信息"],
  ["followupAttention", "跟进注意"], ["meetingMinutesFiles", "Meeting Minutes 文件"], ["remark", "备注"], ["relatedLeadCount", "关联商机数量"],
  ["createdBy", "创建人"], ["createdAt", "创建时间"], ["updatedAt", "更新时间"],
] as const;

export const crmLeadExportFields = [
  ["id", "商机编号"], ["contactId", "联系人编号"], ["requirementSummary", "项目需求简述"],
  ["requirementDetail", "需求详情"], ["imageRequirementNote", "图片需求说明"], ["leadSource", "客户来源"], ["latestProgress", "最近进展"], ["nextAction", "下一步动作"], ["priority", "商机优先级"],
  ["estimatedQuote", "预计报价"], ["currency", "币种"], ["projectDomain", "项目领域"],
  ["projectType", "项目类型"], ["technologyType", "技术类型"], ["productType", "产品类型"],
  ["productName", "产品名称"], ["resourceRequirement", "资源需求"], ["collaborationGroups", "对接群"], ["followMode", "跟单模式"], ["solution", "方案说明"], ["quotationNote", "报价说明"],
  ["requirementFiles", "需求 / 签署文件"], ["requirementImages", "图片需求"], ["proposalFiles", "正式方案文件"], ["quotationFiles", "报价单"],
  ["remark", "备注"], ["status", "商机阶段"], ["salesOwner", "商机负责人"], ["followupOwner", "跟进负责人"], ["participantUsers", "商机协作成员"],
  ["nextFollowupAt", "下一次跟进"], ["lastFollowupAt", "最近沟通"], ["wonAt", "成交日期"], ["deliveryFollowupAt", "交付跟进日期"],
  ["contractRenewalAt", "合同续约日期"], ["paymentReceivedAt", "收款日期"], ["contactName", "联系人姓名"],
  ["company", "公司"], ["contactEmail", "联系人电子邮箱"], ["contactPhone", "联系人电话"], ["contactWechat", "联系人微信"],
  ["createdBy", "创建人"], ["createdAt", "创建时间"], ["updatedAt", "更新时间"],
] as const;

export const marketingLeadExportFields = [
  ["id", "线索编号"], ["fullName", "姓名"], ["email", "Email"], ["phone", "Phone"],
  ["whatsapp", "WhatsApp"], ["wechat", "WeChat"], ["companyName", "公司"], ["title", "职位"],
  ["countryCode", "国家代码"], ["source", "来源"], ["sourceChannel", "来源渠道"], ["sourceDetail", "来源详情"],
  ["inquiryType", "询盘类型"], ["inquiryContent", "原始询盘"], ["status", "状态"], ["owner", "负责人"],
  ["fitScore", "线索匹配度"], ["engagementScore", "互动活跃度"], ["note", "备注"],
  ["firstTouchAt", "首次触达"], ["lastActivityAt", "最近行为"], ["mqlAt", "MQL 时间"], ["sqlAt", "SQL 时间"],
  ["qualifiedAt", "确认机会时间"], ["convertedAt", "转商机时间"], ["convertedOpportunityId", "商机编号"],
  ["createdBy", "创建人"], ["createdAt", "创建时间"], ["updatedAt", "更新时间"],
] as const;

export const organizationExportFields = [
  ["id", "公司编号"], ["name", "公司名称"], ["shortName", "公司简称"], ["website", "网站"],
  ["industry", "行业"], ["country", "国家"], ["region", "区域"], ["city", "城市"],
  ["roles", "业务关系"], ["lifecycle", "客户阶段"], ["owner", "负责人"], ["fitScore", "客户匹配度"],
  ["fitReason", "评分原因"], ["note", "备注"], ["logo", "Logo"], ["createdAt", "创建时间"], ["updatedAt", "更新时间"],
] as const;
