// Disposable local Phase 3 QA identities. Never run this script against UAT or production.
import { createRequire } from "node:module";

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");
const { hash } = require("@node-rs/argon2");

const databaseUrl = new URL(process.env.DATABASE_URL || "");
if (
  !["127.0.0.1", "localhost"].includes(databaseUrl.hostname) ||
  databaseUrl.port !== "3308" ||
  databaseUrl.pathname !== "/kivisense_crm"
) {
  throw new Error("Phase 3 QA identities are restricted to local MySQL port 3308 and database kivisense_crm");
}

const password = process.env.QA_PASSWORD;
if (!password || password.length < 12) throw new Error("QA_PASSWORD (12+ characters) is required");

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
try {
  const passwordHash = await hash(password);
  for (const [roleKey, name, account] of [
    ["SUPER_ADMIN", "Phase 3 测试管理员", "admin"],
    ["SALES", "Phase 3 测试销售", "sales"],
    ["VIEWER", "Phase 3 只读用户", "viewer"],
  ]) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    await prisma.user.upsert({
      where: { loginAccount: `${account}@phase3.example.test` },
      create: {
        name,
        loginAccount: `${account}@phase3.example.test`,
        roleId: role.id,
        passwordHash,
        mustChangePassword: false,
        status: "ACTIVE",
      },
      update: { name, roleId: role.id, passwordHash, mustChangePassword: false, status: "ACTIVE" },
    });
  }
  console.log("Local Phase 3 QA identities prepared.");
} finally {
  await prisma.$disconnect();
}
