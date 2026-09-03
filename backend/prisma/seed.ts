import { PrismaClient, UserStatus } from "@prisma/client";
import { hashPassword } from "../src/common/password.js";

const prisma = new PrismaClient();

const permissionCatalog = [
  ["account.view", "查看账号", "account"],
  ["account.create", "创建账号", "account"],
  ["account.edit", "编辑账号", "account"],
  ["account.disable", "启用或禁用账号", "account"],
  ["account.reset", "重置账号密码", "account"],
  ["roles.view", "查看角色与权限", "role"],
  ["roles.configure", "配置角色权限", "role"],
  ["audit.view", "查看审计日志", "audit"],
  ["crm.contact.view", "查看客户联系人", "crm"],
  ["crm.contact.create", "创建客户联系人", "crm"],
  ["crm.contact.edit", "编辑客户联系人", "crm"],
  ["crm.contact.import", "导入客户联系人", "crm"],
  ["crm.contact.export", "导出客户联系人", "crm"],
  ["crm.contact_followup.view", "查看联系人跟进", "crm"],
  ["crm.contact_followup.create", "新增联系人跟进", "crm"],
  ["crm.lead.view", "查看线索", "crm"],
  ["crm.lead.create", "创建线索", "crm"],
  ["crm.lead.edit", "编辑线索", "crm"],
  ["crm.lead.import", "导入线索", "crm"],
  ["crm.lead.export", "导出线索", "crm"],
  ["crm.lead_followup.view", "查看线索跟进", "crm"],
  ["crm.lead_followup.create", "新增线索跟进", "crm"],
] as const;

const crmReadPermissions = [
  "crm.contact.view",
  "crm.contact_followup.view",
  "crm.lead.view",
  "crm.lead_followup.view",
];

const salesPermissions = [
  ...crmReadPermissions,
  "crm.contact.create",
  "crm.contact.edit",
  "crm.contact_followup.create",
  "crm.lead.create",
  "crm.lead.edit",
  "crm.lead_followup.create",
];

const roles = [
  { key: "SUPER_ADMIN", name: "超级管理员", description: "管理 Kivisense CRM 全部数据、账号、权限和审计", system: true },
  { key: "SALES", name: "销售人员", description: "创建并维护客户联系人、线索和跟进记录", system: false },
  { key: "VIEWER", name: "只读用户", description: "只读查看客户联系人、线索和跟进记录", system: false },
] as const;

const rolePermissionKeys: Record<string, string[]> = {
  SUPER_ADMIN: permissionCatalog.map(([key]) => key),
  SALES: salesPermissions,
  VIEWER: crmReadPermissions,
};

async function seed(): Promise<void> {
  const initialPassword = process.env.INITIAL_PASSWORD;
  if (!initialPassword || initialPassword.length < 12) {
    throw new Error("INITIAL_PASSWORD (12+ characters) is required for seed");
  }

  const permissionIds = new Map<string, string>();
  for (const [key, name, module] of permissionCatalog) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: { name, module },
      create: { key, name, module },
    });
    permissionIds.set(key, permission.id);
  }

  const roleIds = new Map<string, string>();
  for (const roleDefinition of roles) {
    const role = await prisma.role.upsert({
      where: { key: roleDefinition.key },
      update: roleDefinition,
      create: roleDefinition,
    });
    roleIds.set(role.key, role.id);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: rolePermissionKeys[role.key]!.map((key) => ({ roleId: role.id, permissionId: permissionIds.get(key)! })),
    });
  }

  const loginAccount = (process.env.SUPER_ADMIN_ACCOUNT || "admin@kivisense.com").toLowerCase();
  const passwordHash = await hashPassword(initialPassword);
  const admin = await prisma.user.upsert({
    where: { loginAccount },
    update: {
      name: process.env.SUPER_ADMIN_NAME || "Kivisense 管理员",
      roleId: roleIds.get("SUPER_ADMIN")!,
      status: UserStatus.ACTIVE,
    },
    create: {
      name: process.env.SUPER_ADMIN_NAME || "Kivisense 管理员",
      loginAccount,
      passwordHash,
      roleId: roleIds.get("SUPER_ADMIN")!,
      status: UserStatus.ACTIVE,
      mustChangePassword: true,
    },
  });

  console.log(`Kivisense CRM 2.0 seed complete. Super admin: ${admin.loginAccount}`);
}

seed().finally(async () => prisma.$disconnect());
