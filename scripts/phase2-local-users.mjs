// Disposable local QA database only. Never use against UAT or production.
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../backend/package.json", import.meta.url),
);
const { PrismaClient } = require("@prisma/client");
const { hash } = require("@node-rs/argon2");
const url = new URL(process.env.DATABASE_URL || "");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/kivisense_phase2_qa"
)
  throw new Error("Only the isolated local Phase 2 QA database is allowed");
const password = process.env.QA_PASSWORD;
if (!password || password.length < 12)
  throw new Error("QA_PASSWORD is required");
const prisma = new PrismaClient();
try {
  const passwordHash = await hash(password);
  for (const [key, name, account] of [
    ["SUPER_ADMIN", "测试管理员", "admin"],
    ["SALES", "陈销售", "sales"],
    ["VIEWER", "只读用户", "viewer"],
  ]) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key } });
    await prisma.user.upsert({
      where: { loginAccount: `${account}@phase2.example.test` },
      create: {
        name,
        loginAccount: `${account}@phase2.example.test`,
        roleId: role.id,
        passwordHash,
        mustChangePassword: false,
        status: "ACTIVE",
      },
      update: { passwordHash, mustChangePassword: false, status: "ACTIVE" },
    });
  }
  console.log("Local Phase 2 QA users prepared.");
} finally {
  await prisma.$disconnect();
}
