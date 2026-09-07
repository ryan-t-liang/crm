import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../.env")] });

const booleanFromEnv = z.preprocess(
  (value) => typeof value === "string" ? ["1", "true", "yes"].includes(value.toLowerCase()) : value,
  z.boolean(),
);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  INITIAL_PASSWORD: z.string().min(12),
  SUPER_ADMIN_ACCOUNT: z.string().email().default("admin@kivisense.com"),
  SUPER_ADMIN_NAME: z.string().min(1).default("Kivisense 管理员"),
  COOKIE_SECURE: booleanFromEnv.default(true),
  CORS_ORIGIN: z.string().default("https://crm.example.com"),
  APP_BASE_PATH: z.string().default("").transform((value, ctx) => {
    const normalized = value.trim().replace(/\/$/, "");
    if (normalized && (!normalized.startsWith("/") || normalized.includes("//"))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "APP_BASE_PATH must be empty or a single URL path beginning with /" });
      return z.NEVER;
    }
    return normalized;
  }),
  TRUST_PROXY: booleanFromEnv.default(false),
  MAX_BODY_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  CRM_ATTACHMENT_MAX_BYTES: z.coerce.number().int().positive().max(1024 * 1024 * 1024).default(50 * 1024 * 1024),
  CRM_ACTIVE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CRM_DORMANT_DAYS: z.coerce.number().int().min(2).max(730).default(60),
  CRM_STALE_LEAD_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CRM_HIGH_FIT_UNTOUCHED_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CRM_MQL_MIN_FIT_SCORE: z.coerce.number().int().min(0).max(100).default(40),
  CRM_MQL_MIN_ENGAGEMENT_SCORE: z.coerce.number().int().min(0).max(100).default(70),
  STORAGE_DIR: z.string().default("../storage"),
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  logLevel?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  sessionTtlHours: number;
  initialPassword: string;
  superAdminAccount: string;
  superAdminName: string;
  cookieSecure: boolean;
  corsOrigin: string;
  appBasePath: string;
  trustProxy: boolean;
  maxBodyBytes: number;
  maxAttachmentBytes: number;
  storageDir: string;
  crmActiveDays: number;
  crmDormantDays: number;
  crmStaleLeadDays: number;
  crmHighFitUntouchedDays: number;
  crmMqlMinFitScore: number;
  crmMqlMinEngagementScore: number;
};

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const env = schema.parse(process.env);
  const config: AppConfig = {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === "test" ? "silent" : "info"),
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    sessionSecret: env.SESSION_SECRET,
    sessionTtlHours: env.SESSION_TTL_HOURS,
    initialPassword: env.INITIAL_PASSWORD,
    superAdminAccount: env.SUPER_ADMIN_ACCOUNT,
    superAdminName: env.SUPER_ADMIN_NAME,
    cookieSecure: env.COOKIE_SECURE,
    corsOrigin: env.CORS_ORIGIN,
    appBasePath: env.APP_BASE_PATH,
    trustProxy: env.TRUST_PROXY,
    maxBodyBytes: env.MAX_BODY_BYTES,
    maxAttachmentBytes: env.CRM_ATTACHMENT_MAX_BYTES,
    storageDir: resolve(process.cwd(), env.STORAGE_DIR),
    crmActiveDays: env.CRM_ACTIVE_DAYS,
    crmDormantDays: env.CRM_DORMANT_DAYS,
    crmStaleLeadDays: env.CRM_STALE_LEAD_DAYS,
    crmHighFitUntouchedDays: env.CRM_HIGH_FIT_UNTOUCHED_DAYS,
    crmMqlMinFitScore: env.CRM_MQL_MIN_FIT_SCORE,
    crmMqlMinEngagementScore: env.CRM_MQL_MIN_ENGAGEMENT_SCORE,
  };
  return { ...config, ...overrides };
}
