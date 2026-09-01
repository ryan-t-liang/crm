export type ImportObjectType = "CUSTOMER" | "LEAD";
export type BrandCode = "GP" | "UN";

export type FormalField = {
  key: string;
  label: string;
  type: "text" | "email" | "phone" | "date" | "datetime" | "boolean" | "enum";
  required: boolean;
  options?: string[];
  example: string;
};

const salutations = ["先生", "女士", "太太", "博士", "不愿透露"];
const yesNo = ["是", "否"];
const languages = ["简体中文", "繁體中文", "English"];
const contacts = ["微信", "电话", "Email", "短信", "WhatsApp"];

const memberBase = (brand: BrandCode): FormalField[] => [
  { key: "salutation", label: "称谓", type: "enum", required: true, options: salutations, example: "女士" },
  { key: "lastName", label: "姓氏", type: "text", required: true, example: "张" },
  { key: "firstName", label: "名字", type: "text", required: true, example: "一二" },
  { key: "mobile", label: "手机号", type: "phone", required: true, example: "+8613812345678" },
  { key: "email", label: "Email", type: "email", required: false, example: "member@example.cn" },
  { key: "birthday", label: "生日", type: "date", required: false, example: "1990-08-18" },
  { key: "country", label: "国家", type: "enum", required: true, options: ["中国大陆", "香港", "澳门", "台湾"], example: "中国大陆" },
  { key: "region", label: "省/地区", type: "text", required: false, example: "上海市" },
  { key: "city", label: "城市", type: "text", required: false, example: "上海市" },
  { key: "postalCode", label: "邮编", type: "text", required: false, example: "200040" },
  { key: "addressLine", label: "地址", type: "text", required: false, example: "上海市静安区示例路 1 号" },
  { key: "language", label: "语言", type: "enum", required: true, options: languages, example: "简体中文" },
  { key: "preferredContact", label: "首选联系渠道", type: "enum", required: true, options: contacts, example: "微信" },
  { key: "ownsBrandWatch", label: `是否拥有 ${brand} 腕表`, type: "boolean", required: true, options: yesNo, example: "否" },
  ...(brand === "UN" ? [{ key: "purchaseChannel", label: "希望购买渠道", type: "text", required: false, example: "品牌精品店" } satisfies FormalField] : []),
  { key: "interestCenter", label: "兴趣中心", type: "text", required: false, example: "制表工艺" },
  { key: "favoriteCollection", label: "偏爱系列", type: "text", required: false, example: brand === "GP" ? "Laureato 桂冠" : "FREAK" },
  { key: "marketingOptIn", label: "营销选择", type: "boolean", required: false, options: yesNo, example: "是" },
  { key: "processingConsent", label: "数据处理同意", type: "boolean", required: true, options: yesNo, example: "是" },
  { key: "registeredAt", label: "注册时间", type: "datetime", required: false, example: "2026-08-26 14:20:00" },
  { key: "openId", label: "OpenID", type: "text", required: false, example: "openid_import_example" },
  { key: "unionId", label: "UnionID", type: "text", required: false, example: "unionid_import_example" },
];

const leadBase = (brand: BrandCode): FormalField[] => [
  { key: "brand", label: "品牌", type: "enum", required: true, options: [brand], example: brand },
  { key: "leadType", label: "线索类型", type: "enum", required: true, options: ["PURCHASE_INTENT"], example: "PURCHASE_INTENT" },
  { key: "leadNo", label: "Lead No", type: "text", required: false, example: `${brand}-IMPORT-20260826-001` },
  { key: "status", label: "状态", type: "text", required: false, example: "NEW" },
  { key: "owner", label: "跟进人", type: "text", required: false, example: "" },
  { key: "source", label: "来源", type: "text", required: false, example: "BATCH_IMPORT" },
  { key: "createdAt", label: "创建时间", type: "datetime", required: false, example: "2026-08-26 14:20:00" },
  { key: "salutation", label: "称谓", type: "enum", required: true, options: salutations, example: "先生" },
  { key: "firstname", label: "名字", type: "text", required: true, example: "一二" },
  { key: "lastname", label: "姓氏", type: "text", required: true, example: "张" },
  { key: "email", label: "Email", type: "email", required: true, example: "lead@example.cn" },
  { key: "phone", label: "手机号", type: "phone", required: false, example: "+8613812345678" },
  { key: "country", label: "国家", type: "enum", required: true, options: ["中国大陆", "香港", "澳门", "台湾"], example: "中国大陆" },
  { key: "city", label: "城市", type: "text", required: false, example: "上海市" },
  { key: "language", label: "语言", type: "enum", required: true, options: languages, example: "简体中文" },
  { key: "preferredContact", label: "首选联系方式", type: "enum", required: true, options: contacts, example: "Email" },
  { key: "ownsBrandWatch", label: `是否拥有 ${brand} 腕表`, type: "boolean", required: brand === "UN", options: yesNo, example: "否" },
  ...(brand === "UN" ? [{ key: "purchaseMethod", label: "希望通过何种渠道购买", type: "text", required: true, example: "品牌精品店" } satisfies FormalField] : []),
  { key: "sku", label: "产品/主题", type: "text", required: false, example: brand === "GP" ? "81010-11-3475-1CM" : "2405-500-2A/3C" },
  { key: "marketingOptIn", label: "营销选择", type: "boolean", required: false, options: yesNo, example: "是" },
  { key: "processingConsent", label: "数据处理同意", type: "boolean", required: true, options: yesNo, example: "是" },
];

export function formalImportFields(objectType: ImportObjectType, brand: BrandCode): FormalField[] {
  return objectType === "CUSTOMER" ? memberBase(brand) : leadBase(brand);
}

export function formalTemplateFilename(objectType: ImportObjectType, brand: BrandCode): string {
  return objectType === "CUSTOMER"
    ? `member_${brand}_import_template.xlsx`
    : `lead_${brand}_purchase-intent_template.xlsx`;
}

export function formalSheetName(objectType: ImportObjectType, brand: BrandCode): string {
  return objectType === "CUSTOMER" ? `${brand} 会员导入` : `${brand} 购买意向线索`;
}

export const customerExportFields = {
  customerNo: "会员 ID", displayName: "姓名", mobile: "手机号", brand: "品牌", brandMemberNo: "品牌会员 ID",
  email: "品牌 Email", salutation: "称谓", lastName: "姓氏", firstName: "名字", birthday: "生日", country: "国家",
  region: "省/地区", city: "城市", postalCode: "邮编", addressLine: "地址", language: "语言",
  preferredContact: "首选联系渠道", ownsBrandWatch: "是否拥有品牌腕表", purchaseChannel: "希望购买渠道",
  interestCenter: "兴趣中心", favoriteCollection: "偏爱系列", registeredAt: "注册时间", createdAt: "会员创建时间",
} as const;

export const leadExportFields = {
  leadNo: "Lead No", brand: "品牌", leadType: "线索类型", status: "状态", source: "来源", submissionMode: "提交方式",
  firstname: "名字", lastname: "姓氏", email: "Email", phone: "手机号", country: "国家", city: "城市", language: "语言",
  preferredContact: "首选联系方式", ownsBrandWatch: "是否拥有品牌腕表", purchaseMethod: "希望通过何种渠道购买",
  sku: "产品/主题", marketingOptIn: "营销选择", processingConsent: "数据处理同意", syncStatus: "同步状态", createdAt: "创建时间",
} as const;
