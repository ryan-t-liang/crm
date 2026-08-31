import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./config.js";
import "@fastify/cookie";

export type AuthContext = {
  userId: string;
  name: string;
  loginAccount: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  permissions: Set<string>;
  brandIds: string[];
  allBrands: boolean;
  mustChangePassword: boolean;
  sessionId: string;
};

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    config: AppConfig;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}
