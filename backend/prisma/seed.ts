import { PrismaClient, UserStatus } from "@prisma/client";
import { hashPassword } from "../src/common/password.js";
import { loadConfig } from "../src/common/config.js";
import { createCanonicalLead } from "../src/leads/service.js";
import { formalImportFields } from "../src/jobs/formal-schema.js";
import { customerNumber } from "../src/common/ids.js";

const prisma = new PrismaClient();

const permissionCatalog = [
  ["customer.view", "查看会员", "customer"],
  ["customer.create", "新增会员", "customer"],
  ["customer.edit", "编辑会员", "customer"],
  ["customer.import", "导入会员", "customer"],
  ["customer.export", "导出会员", "customer"],
  ["lead.view", "查看线索", "lead"],
  ["lead.create", "新增线索", "lead"],
  ["lead.edit", "编辑线索", "lead"],
  ["lead.import", "导入线索", "lead"],
  ["lead.export", "导出线索", "lead"],
  ["lead.sync", "同步线索", "lead"],
  ["account.view", "查看账号", "account"],
  ["account.create", "新增账号", "account"],
  ["account.edit", "编辑账号", "account"],
  ["account.disable", "禁用账号", "account"],
  ["account.reset", "重置密码", "account"],
  ["roles.view", "查看角色", "role"],
  ["roles.configure", "配置角色", "role"],
  ["audit.view", "查看审计", "audit"],
] as const;

const roleCatalog = [
  { key: "SUPER_ADMIN", name: "超级管理员", system: true, description: "全部权限与全部品牌" },
  { key: "BRAND_ADMIN", name: "品牌管理员", system: false, description: "管理授权品牌内会员与线索" },
  { key: "OPERATOR", name: "运营人员", system: false, description: "维护授权品牌内会员与线索" },
  { key: "VIEWER", name: "只读用户", system: false, description: "查看授权品牌数据" },
] as const;

const rolePermissionKeys: Record<string, string[]> = {
  SUPER_ADMIN: permissionCatalog.map(([key]) => key),
  BRAND_ADMIN: permissionCatalog.map(([key]) => key).filter((key) => key.startsWith("customer.") || key.startsWith("lead.")),
  OPERATOR: ["customer.view", "customer.create", "customer.edit", "lead.view", "lead.create", "lead.edit", "lead.sync"],
  VIEWER: ["customer.view", "lead.view"],
};

const salutations = ["博士", "先生", "太太", "女士", "不愿透露"];
const memberLanguages = ["中文", "英语"];
const favoriteCollections = {
  GP: ["Laureato", "Bridges", "1966", "Vintage 1945", "Cat's Eye"],
  UN: ["FREAK", "BLAST", "DIVER", "MARINE", "CLASSIC"],
} as const;
const interestCenters = {
  GP: {
    "526": "体育", "525": "其他", "508": "冰球", "522": "冲浪", "495": "国际象棋", "519": "帆船", "527": "房地产", "515": "扑克", "497": "搏击运动", "514": "摄影", "510": "摩托车", "509": "文学", "499": "板球", "492": "棒球", "517": "橄榄球", "494": "汽车", "520": "滑雪/滑雪板", "521": "烈酒", "498": "烹饪/烘焙", "507": "狩猎", "493": "篮球", "513": "绘画", "523": "网球", "491": "美式足球", "501": "舞蹈", "524": "葡萄酒（品尝和收藏）", "511": "赛车运动（F1、Moto GP）", "504": "足球", "518": "跑步/慢跑", "502": "跳水", "506": "远足/户外活动", "496": "雪茄鉴赏", "512": "音乐", "503": "马术运动", "516": "马球", "500": "骑自行车", "505": "高尔夫",
  },
  UN: {
    "1857": "体育", "1854": "其他", "1803": "冰球", "1845": "冲浪", "1764": "国际象棋", "1836": "帆船", "1860": "房地产", "1824": "扑克", "1770": "搏击运动", "1821": "摄影", "1809": "摩托车", "1806": "文学", "1776": "板球", "1755": "棒球", "1830": "橄榄球", "1761": "汽车", "1839": "滑雪/滑雪板", "1842": "烈酒", "1773": "烹饪/烘焙", "1800": "狩猎", "1758": "篮球", "1818": "绘画", "1848": "网球", "1752": "美式足球", "1782": "舞蹈", "1851": "葡萄酒（品尝和收藏）", "1812": "赛车运动（F1、Moto GP）", "1791": "足球", "1833": "跑步/慢跑", "1785": "跳水", "1797": "远足/户外活动", "1767": "雪茄鉴赏", "1815": "音乐", "1788": "马术运动", "1827": "马球", "1779": "骑自行车", "1794": "高尔夫",
  },
} as const;
const memberConsentCopy = {
  GP: {
    processing: "我已阅读并接受芝柏表的隐私声明",
    marketing: "我希望接收有关芝柏表腕表，服务和即将举行的活动信息，并接受我的数据将用于此目的进行处理。",
  },
  UN: {
    processing: "我已阅读并接受雅典表的隐私声明",
    marketing: "我希望接收关于雅典表时计、服务和未来活动的信息，且我同意出于此目的处理我的信息。",
  },
} as const;

function memberFieldsForBrand(brandCode: "GP" | "UN") {
  return [
  { key: "salutation", label: "称谓", type: "select", required: true, options: salutations },
  { key: "last_name", label: "姓氏", type: "text", required: true },
  { key: "first_name", label: "名字", type: "text", required: true },
  { key: "mobile", label: "手机号", type: "tel", required: true },
  { key: "email", label: "Email", type: "email", required: false },
  { key: "birthday", label: "出生日期", type: "date", required: false },
  { key: "country", label: "国家 / 地区", type: "select", required: true, options: ["China", "Hong Kong", "Macau", "Taiwan"] },
  { key: "province", label: "省 / 地区", type: "text", required: false },
  { key: "city", label: "城市", type: "text", required: false },
  { key: "postal_code", label: "邮编", type: "text", required: false },
  { key: "address_line", label: "联系地址", type: "text", required: false },
  { key: "language", label: "通信语言", type: "select", required: true, options: memberLanguages },
  { key: "preferred_contact", label: "首选联系渠道", type: "select", required: true, options: ["WeChat", "Phone", "Email", "SMS"] },
  { key: "owns_brand_watch", label: "是否拥有该品牌腕表", type: "select", required: true, options: ["Yes", "No"] },
  { key: "interest_center", label: "兴趣中心", type: "select", required: false, options: Object.entries(interestCenters[brandCode]).map(([value, label]) => ({ value, label })) },
  { key: "favorite_collection", label: "偏爱的系列", type: "select", required: false, options: favoriteCollections[brandCode] },
  { key: "processing_consent", label: memberConsentCopy[brandCode].processing, type: "checkbox", required: true },
  { key: "marketing_opt_in", label: memberConsentCopy[brandCode].marketing, type: "checkbox", required: false },
  ];
}

const leadBaseFields = [
  { key: "email", label: "Email", type: "email", required: true },
  { key: "salutation", label: "称谓", type: "select", required: true, options: salutations },
  { key: "firstname", label: "名字", type: "text", required: true },
  { key: "lastname", label: "姓氏", type: "text", required: true },
  { key: "phone", label: "电话号码", type: "tel", required: false },
  { key: "preferredContact", label: "首选联系方式", type: "select", required: true, options: ["WeChat", "Phone", "Email", "SMS"] },
  { key: "country", label: "国家 / 地区", type: "select", required: true, options: ["China", "Hong Kong", "Macau", "Taiwan"] },
  { key: "city", label: "城市", type: "text", required: false },
  { key: "sku", label: "产品", type: "text", required: true },
  { key: "birthday", label: "出生日期", type: "date", required: false, localOnly: true },
  { key: "ownsBrandWatch", label: "是否拥有该品牌腕表", type: "select", required: false, options: ["Yes", "No"] },
  { key: "processingConsent", label: "个人数据处理同意", type: "checkbox", required: true },
  { key: "marketingOptIn", label: "营销选择", type: "checkbox", required: false },
];

async function seed(): Promise<void> {
  const initialPassword = process.env.INITIAL_PASSWORD;
  if (!initialPassword || initialPassword.length < 12) throw new Error("INITIAL_PASSWORD (12+ characters) is required for seed");
  const passwordHash = await hashPassword(initialPassword);

  const gp = await prisma.brand.upsert({
    where: { code: "GP" },
    update: { name: "GP 芝柏表", active: true, displayOrder: 20 },
    create: { code: "GP", name: "GP 芝柏表", shortName: "GP", active: true, displayOrder: 20, themeConfig: { accent: "#b4935e", tint: "#f7f1e6" } },
  });
  const un = await prisma.brand.upsert({
    where: { code: "UN" },
    update: { name: "UN 雅典表", active: true, displayOrder: 10 },
    create: { code: "UN", name: "UN 雅典表", shortName: "UN", active: true, displayOrder: 10, themeConfig: { accent: "#607f99", tint: "#eef3f6" } },
  });

  const permissions = new Map<string, string>();
  for (const [key, name, module] of permissionCatalog) {
    const record = await prisma.permission.upsert({ where: { key }, update: { name, module }, create: { key, name, module } });
    permissions.set(key, record.id);
  }

  const roles = new Map<string, string>();
  for (const item of roleCatalog) {
    const role = await prisma.role.upsert({ where: { key: item.key }, update: item, create: item });
    roles.set(item.key, role.id);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: rolePermissionKeys[item.key]!.map((key) => ({ roleId: role.id, permissionId: permissions.get(key)! })),
    });
  }

  const admin = await prisma.user.upsert({
    where: { loginAccount: (process.env.SUPER_ADMIN_ACCOUNT || "admin@sowind.example").toLowerCase() },
    update: { name: process.env.SUPER_ADMIN_NAME || "System Administrator", roleId: roles.get("SUPER_ADMIN")!, status: UserStatus.ACTIVE },
    create: {
      name: process.env.SUPER_ADMIN_NAME || "System Administrator",
      loginAccount: (process.env.SUPER_ADMIN_ACCOUNT || "admin@sowind.example").toLowerCase(),
      passwordHash,
      roleId: roles.get("SUPER_ADMIN")!,
      status: UserStatus.ACTIVE,
      mustChangePassword: true,
    },
  });

  const effectiveAt = new Date("2026-07-15T00:00:00.000Z");
  for (const brand of [gp, un]) {
    const brandCode = brand.code as "GP" | "UN";
    const memberFields = memberFieldsForBrand(brandCode);
    await prisma.formDefinition.upsert({
      where: { brandId_objectType_formKey_version: { brandId: brand.id, objectType: "CUSTOMER", formKey: "REGISTRATION", version: "2026.1" } },
      update: { active: true, schemaJson: { fields: memberFields, importFields: formalImportFields("CUSTOMER", brandCode) } },
      create: { brandId: brand.id, objectType: "CUSTOMER", formKey: "REGISTRATION", version: "2026.1", active: true, schemaJson: { fields: memberFields, importFields: formalImportFields("CUSTOMER", brandCode) }, policyVersion: `${brand.code}-CN-PRIVACY-2026.1`, termsVersion: `${brand.code}-CN-MEMBER-2026.1`, effectiveAt },
    });
    const fields = leadBaseFields.map((field) => {
      if (field.key === "ownsBrandWatch") return { ...field, required: brand.code === "UN", label: `您是否拥有${brand.name.replace(" ", "")}` };
      if (field.key === "processingConsent") return { ...field, label: memberConsentCopy[brandCode].processing };
      if (field.key === "marketingOptIn") return { ...field, label: memberConsentCopy[brandCode].marketing };
      return field;
    });
    if (brand.code === "UN") fields.splice(10, 0,
      { key: "purchaseMethod", label: "希望通过何种渠道购买", type: "text", required: false, localOnly: true },
      { key: "retailer", label: "零售商", type: "text", required: false, localOnly: true },
    );
    await prisma.formDefinition.upsert({
      where: { brandId_objectType_formKey_version: { brandId: brand.id, objectType: "LEAD", formKey: "PURCHASE_INTENT", version: "2.0" } },
      update: { active: true, schemaJson: { leadType: "PURCHASE_INTENT", fields, importFields: formalImportFields("LEAD", brand.code as "GP" | "UN") } },
      create: { brandId: brand.id, objectType: "LEAD", formKey: "PURCHASE_INTENT", version: "2.0", active: true, schemaJson: { leadType: "PURCHASE_INTENT", fields, importFields: formalImportFields("LEAD", brand.code as "GP" | "UN") }, policyVersion: `${brand.code}-GATEWAY-2026.2`, termsVersion: `${brand.code}-LEAD-2026.2`, effectiveAt },
    });
  }

  if (process.env.SEED_DEMO_DATA === "true") {
    const demoUsers = [
      { name: "Vivian Chen", loginAccount: "vivian.chen@sowind.com", roleKey: "OPERATOR", brandIds: [gp.id], status: UserStatus.ACTIVE },
      { name: "Anne Yang", loginAccount: "anne.yang@sowind.com", roleKey: "BRAND_ADMIN", brandIds: [un.id], status: UserStatus.ACTIVE },
      { name: "Claudia Wu", loginAccount: "claudia.wu@sowind.com", roleKey: "VIEWER", brandIds: [gp.id, un.id], status: UserStatus.ACTIVE },
      { name: "Marco Li", loginAccount: "marco.li@sowind.com", roleKey: "OPERATOR", brandIds: [un.id], status: UserStatus.DISABLED },
    ];
    for (const item of demoUsers) {
      const user = await prisma.user.upsert({
        where: { loginAccount: item.loginAccount },
        update: { name: item.name, roleId: roles.get(item.roleKey)!, status: item.status },
        create: { name: item.name, loginAccount: item.loginAccount, passwordHash, roleId: roles.get(item.roleKey)!, status: item.status, mustChangePassword: true },
      });
      await prisma.userBrandAccess.deleteMany({ where: { userId: user.id } });
      await prisma.userBrandAccess.createMany({ data: item.brandIds.map((brandId) => ({ userId: user.id, brandId })) });
    }

    const existingDemoCustomer = await prisma.customer.findUnique({ where: { mobileNormalized: "+8618872720202" } });
    const customer = existingDemoCustomer
      ? await prisma.customer.update({ where: { id: existingDemoCustomer.id }, data: { displayName: "张一二（Ryan Zhang）", mobile: "+86 188 7272 0202" } })
      : await prisma.$transaction(async (tx) => {
        const sequence = await tx.customerNumberSequence.create({ data: {} });
        return tx.customer.create({ data: { customerNo: customerNumber(sequence.id), displayName: "张一二（Ryan Zhang）", mobile: "+86 188 7272 0202", mobileNormalized: "+8618872720202", createdBy: admin.id } });
      });
    const demoProfiles = [
      { brand: un, memberNo: "UN-CN-00128", email: "zhang.un@example.cn", favorite: "FREAK", interest: "创新制表", owns: true, channel: "品牌精品店" },
      { brand: gp, memberNo: "GP-CN-00128", email: "zhang.gp@example.cn", favorite: "Laureato 桂冠", interest: "经典腕表", owns: false, channel: null },
    ];
    for (const item of demoProfiles) {
      const openId = `o${item.brand.code.toLowerCase()}_demo_00128`;
      const unionId = `union_${item.brand.code.toLowerCase()}_demo_00128`;
      const profile = await prisma.customerBrandProfile.upsert({
        where: { customerId_brandId: { customerId: customer.id, brandId: item.brand.id } },
        update: { email: item.email, favoriteCollection: item.favorite, interestCenter: item.interest, openId, unionId },
        create: { customerId: customer.id, brandId: item.brand.id, brandMemberNo: item.memberNo, displayName: "张一二", salutation: "Mr", lastName: "张", firstName: "一二", birthday: new Date("1990-08-18"), email: item.email, mobile: customer.mobile, country: "China", region: "上海市", city: "上海", postalCode: "200040", addressLine: "上海市静安区示例路 1 号", language: "简体中文", preferredContact: "WeChat", ownsBrandWatch: item.owns, purchaseChannel: item.channel, interestCenter: item.interest, favoriteCollection: item.favorite, registrationSource: "WECHAT_MINIPROGRAM", registeredAt: new Date("2026-08-26T06:20:00.000Z"), openId, unionId },
      });
      await prisma.customerIdentity.upsert({
        where: { brandId_identityType_scope_value: { brandId: item.brand.id, identityType: "OPENID", scope: `DEMO_APP:${item.brand.code}`, value: openId } },
        update: { source: "DEMO_SEED" },
        create: { customerId: customer.id, brandId: item.brand.id, identityType: "OPENID", scope: `DEMO_APP:${item.brand.code}`, value: openId, source: "DEMO_SEED" },
      });
      await prisma.customerIdentity.upsert({
        where: { brandId_identityType_scope_value: { brandId: item.brand.id, identityType: "UNIONID", scope: `DEMO_OPEN_PLATFORM:${item.brand.code}`, value: unionId } },
        update: { source: "DEMO_SEED" },
        create: { customerId: customer.id, brandId: item.brand.id, identityType: "UNIONID", scope: `DEMO_OPEN_PLATFORM:${item.brand.code}`, value: unionId, source: "DEMO_SEED" },
      });
      if (await prisma.consentRecord.count({ where: { customerBrandProfileId: profile.id } }) === 0) await prisma.consentRecord.createMany({ data: [
        { customerId: customer.id, customerBrandProfileId: profile.id, brandId: item.brand.id, purpose: "DATA_PROCESSING", channel: "ALL", status: "GRANTED", policyVersion: `${item.brand.code}-CN-PRIVACY-2026.1`, source: "WECHAT_MINIPROGRAM", capturedAt: new Date("2026-08-26T06:20:00.000Z") },
        { customerId: customer.id, customerBrandProfileId: profile.id, brandId: item.brand.id, purpose: "MARKETING_COMMUNICATION", channel: "EMAIL", status: "GRANTED", policyVersion: `${item.brand.code}-CN-PRIVACY-2026.1`, source: "WECHAT_MINIPROGRAM", capturedAt: new Date("2026-08-26T06:20:00.000Z") },
      ] });
    }
    await prisma.customerJourneyEvent.upsert({ where: { id: "demo-journey-registration-00128" }, update: { eventType: "REGISTER" }, create: { id: "demo-journey-registration-00128", customerId: customer.id, brandId: un.id, eventType: "REGISTER", title: "UN 雅典表会员登记", eventAt: new Date("2026-08-26T06:20:00.000Z"), source: "WECHAT_MINIPROGRAM" } });
    await createCanonicalLead(prisma, loadConfig(), { brandCode: "GP", customerId: null, source: "MINI_PROGRAM", submissionMode: "USER_SUBMITTED", formVersion: "2.0", sku: "81010-11-3475-1CM", email: "lead.gp@example.cn", salutation: "Mr", firstname: "一二", lastname: "张", phone: "+8618872720202", preferredContact: "WeChat", country: "China", city: "Shanghai", ownsBrandWatch: "No", processingConsent: true, marketingOptIn: true, idempotencyKey: "DEMO:GP:001", createdByService: "wechat-miniprogram" });
    await createCanonicalLead(prisma, loadConfig(), { brandCode: "UN", customerId: customer.id, source: "ADMIN_MANUAL", submissionMode: "ADMIN_MANUAL", formVersion: "2.0", sku: "2405-500-2A/3C", email: "lead.un@example.cn", salutation: "Ms", firstname: "嘉宁", lastname: "陈", phone: "+8618603087126", preferredContact: "Phone", country: "China", city: "Shanghai", ownsBrandWatch: "Yes", processingConsent: true, marketingOptIn: false, idempotencyKey: "DEMO:UN:001", createdBy: admin.id });
  }

  console.log(`Seed complete. Super admin: ${admin.loginAccount}; brands: GP, UN`);
}

seed().finally(async () => prisma.$disconnect());
