import { PrismaClient, UserStatus } from "@prisma/client";
import { hashPassword } from "../src/common/password.js";
import { loadConfig } from "../src/common/config.js";
import { createCanonicalLead } from "../src/leads/service.js";

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

const memberFields = [
  { key: "salutation", label: "称谓", type: "select", required: true, options: ["Mr", "Mrs", "Ms", "Dr", "Prefer not to say"] },
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
  { key: "language", label: "通信语言", type: "select", required: true, options: ["简体中文", "English"] },
  { key: "preferred_contact", label: "首选联系渠道", type: "select", required: true, options: ["WeChat", "Phone", "Email", "SMS"] },
  { key: "owns_brand_watch", label: "是否拥有该品牌腕表", type: "select", required: true, options: ["Yes", "No"] },
  { key: "interest_center", label: "兴趣中心", type: "text", required: false },
  { key: "favorite_collection", label: "偏爱的系列", type: "text", required: false },
  { key: "marketing_opt_in", label: "营销选择", type: "checkbox", required: false },
  { key: "processing_consent", label: "个人数据处理同意", type: "checkbox", required: true },
];

const leadBaseFields = [
  { key: "email", label: "Email", type: "email", required: true },
  { key: "salutation", label: "称谓", type: "select", required: true, options: ["Dr", "Mr", "Mrs", "Ms", "Prefer not to say"] },
  { key: "firstname", label: "名字", type: "text", required: true },
  { key: "lastname", label: "姓氏", type: "text", required: true },
  { key: "phone", label: "电话号码", type: "tel", required: true },
  { key: "preferredContact", label: "首选联系方式", type: "select", required: true, options: ["WhatsApp", "WeChat", "Phone", "Email", "Signal", "Telegram", "SMS", "All of the above"] },
  { key: "country", label: "国家 / 地区", type: "select", required: true, options: ["China", "Hong Kong", "Macau", "Taiwan"] },
  { key: "city", label: "城市", type: "text", required: false },
  { key: "sku", label: "产品", type: "text", required: true },
  { key: "birthday", label: "出生日期", type: "date", required: false, localOnly: true },
  { key: "ownsBrandWatch", label: "是否拥有该品牌腕表", type: "select", required: false, options: ["Yes", "No"] },
  { key: "marketingOptIn", label: "营销选择", type: "checkbox", required: false },
  { key: "processingConsent", label: "个人数据处理同意", type: "checkbox", required: true },
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
    await prisma.formDefinition.upsert({
      where: { brandId_objectType_formKey_version: { brandId: brand.id, objectType: "CUSTOMER", formKey: "REGISTRATION", version: "2026.1" } },
      update: { active: true, schemaJson: { fields: memberFields } },
      create: { brandId: brand.id, objectType: "CUSTOMER", formKey: "REGISTRATION", version: "2026.1", active: true, schemaJson: { fields: memberFields }, policyVersion: `${brand.code}-CN-PRIVACY-2026.1`, termsVersion: `${brand.code}-CN-MEMBER-2026.1`, effectiveAt },
    });
    const fields = leadBaseFields.map((field) => field.key === "ownsBrandWatch" ? { ...field, required: brand.code === "UN", label: `您是否拥有${brand.name}` } : field);
    if (brand.code === "UN") fields.splice(10, 0,
      { key: "purchaseMethod", label: "希望通过何种渠道购买", type: "text", required: false, localOnly: true },
      { key: "retailer", label: "零售商", type: "text", required: false, localOnly: true },
    );
    await prisma.formDefinition.upsert({
      where: { brandId_objectType_formKey_version: { brandId: brand.id, objectType: "LEAD", formKey: "PURCHASE_INTENT", version: "2.0" } },
      update: { active: true, schemaJson: { leadType: "PURCHASE_INTENT", fields } },
      create: { brandId: brand.id, objectType: "LEAD", formKey: "PURCHASE_INTENT", version: "2.0", active: true, schemaJson: { leadType: "PURCHASE_INTENT", fields }, policyVersion: `${brand.code}-GATEWAY-2026.2`, termsVersion: `${brand.code}-LEAD-2026.2`, effectiveAt },
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

    const customer = await prisma.customer.upsert({
      where: { mobileNormalized: "+8618872720202" },
      update: { displayName: "张一二（Ryan Zhang）", mobile: "+86 188 7272 0202" },
      create: { customerNo: "M-2026-00128", displayName: "张一二（Ryan Zhang）", mobile: "+86 188 7272 0202", mobileNormalized: "+8618872720202", createdBy: admin.id },
    });
    const demoProfiles = [
      { brand: un, memberNo: "UN-CN-00128", email: "zhang.un@example.cn", favorite: "FREAK", interest: "创新制表", owns: true, channel: "品牌精品店" },
      { brand: gp, memberNo: "GP-CN-00128", email: "zhang.gp@example.cn", favorite: "Laureato 桂冠", interest: "经典腕表", owns: false, channel: null },
    ];
    for (const item of demoProfiles) {
      const profile = await prisma.customerBrandProfile.upsert({
        where: { customerId_brandId: { customerId: customer.id, brandId: item.brand.id } },
        update: { email: item.email, favoriteCollection: item.favorite, interestCenter: item.interest },
        create: { customerId: customer.id, brandId: item.brand.id, brandMemberNo: item.memberNo, displayName: "张一二", salutation: "Mr", lastName: "张", firstName: "一二", birthday: new Date("1990-08-18"), email: item.email, mobile: customer.mobile, country: "China", region: "上海市", city: "上海", postalCode: "200040", addressLine: "上海市静安区示例路 1 号", language: "简体中文", preferredContact: "WeChat", ownsBrandWatch: item.owns, purchaseChannel: item.channel, interestCenter: item.interest, favoriteCollection: item.favorite, registrationSource: "WECHAT_MINIPROGRAM", registeredAt: new Date("2026-08-26T06:20:00.000Z"), openId: `o${item.brand.code.toLowerCase()}_demo_00128`, unionId: `union_${item.brand.code.toLowerCase()}_demo_00128` },
      });
      if (await prisma.consentRecord.count({ where: { customerBrandProfileId: profile.id } }) === 0) await prisma.consentRecord.createMany({ data: [
        { customerId: customer.id, customerBrandProfileId: profile.id, brandId: item.brand.id, purpose: "DATA_PROCESSING", channel: "ALL", status: "GRANTED", policyVersion: `${item.brand.code}-CN-PRIVACY-2026.1`, source: "WECHAT_MINIPROGRAM", capturedAt: new Date("2026-08-26T06:20:00.000Z") },
        { customerId: customer.id, customerBrandProfileId: profile.id, brandId: item.brand.id, purpose: "MARKETING_COMMUNICATION", channel: "EMAIL", status: "GRANTED", policyVersion: `${item.brand.code}-CN-PRIVACY-2026.1`, source: "WECHAT_MINIPROGRAM", capturedAt: new Date("2026-08-26T06:20:00.000Z") },
      ] });
    }
    await prisma.customerJourneyEvent.upsert({ where: { id: "demo-journey-registration-00128" }, update: {}, create: { id: "demo-journey-registration-00128", customerId: customer.id, brandId: un.id, eventType: "MEMBER_REGISTERED", title: "UN 雅典表会员登记", eventAt: new Date("2026-08-26T06:20:00.000Z"), source: "WECHAT_MINIPROGRAM" } });
    await createCanonicalLead(prisma, loadConfig(), { brandCode: "GP", customerId: null, source: "WECHAT_MINIPROGRAM", submissionMode: "USER_SUBMITTED", formVersion: "2.0", sku: "81010-11-3475-1CM", email: "lead.gp@example.cn", salutation: "Mr", firstname: "一二", lastname: "张", phone: "+8618872720202", preferredContact: "WeChat", country: "China", city: "Shanghai", ownsBrandWatch: "No", processingConsent: true, marketingOptIn: true, idempotencyKey: "DEMO:GP:001", createdByService: "wechat-miniprogram" });
    await createCanonicalLead(prisma, loadConfig(), { brandCode: "UN", customerId: customer.id, source: "ADMIN_MANUAL", submissionMode: "ADMIN_MANUAL", formVersion: "2.0", sku: "2405-500-2A/3C", email: "lead.un@example.cn", salutation: "Ms", firstname: "嘉宁", lastname: "陈", phone: "+8618603087126", preferredContact: "Phone", country: "China", city: "Shanghai", ownsBrandWatch: "Yes", processingConsent: true, marketingOptIn: false, idempotencyKey: "DEMO:UN:001", createdBy: admin.id });
  }

  console.log(`Seed complete. Super admin: ${admin.loginAccount}; brands: GP, UN`);
}

seed().finally(async () => prisma.$disconnect());
