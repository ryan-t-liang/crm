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
  SUPER_ADMIN_ACCOUNT: z.string().email().default("admin@sowind.example"),
  SUPER_ADMIN_NAME: z.string().min(1).default("System Administrator"),
  SEED_DEMO_DATA: booleanFromEnv.default(false),
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
  STORAGE_DIR: z.string().default("../storage"),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  OUTBOX_LEASE_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
  WORKER_INSTANCE_ID: z.string().trim().max(64).optional().default(""),
  SOWIND_GATEWAY_ACCESS_KEY: z.string().optional().default(""),
  SOWIND_GATEWAY_GP_URL: z.string().url().default("https://b2b.girard-perregaux.com/n8n-webhook/wechat-leads/gp"),
  SOWIND_GATEWAY_UN_URL: z.string().url().default("https://b2b.ulysse-nardin.com/n8n-webhook/wechat-leads/un"),
  SOWIND_GATEWAY_TIMEOUT_MS: z.coerce.number().int().min(10000).default(10000),
  SOWIND_GATEWAY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  SOWIND_GATEWAY_MAX_PER_MINUTE: z.coerce.number().int().min(1).max(60).default(10),
  RUN_SOWIND_LIVE_TESTS: booleanFromEnv.default(false),
  INTEGRATION_CLIENT_ID: z.string().optional().default(""),
  INTEGRATION_CLIENT_SECRET: z.string().optional().default(""),
  WECHAT_GP_APP_ID: z.string().optional().default(""),
  WECHAT_GP_APP_SECRET: z.string().optional().default(""),
  WECHAT_GP_OPEN_PLATFORM_SCOPE: z.string().optional().default(""),
  WECHAT_UN_APP_ID: z.string().optional().default(""),
  WECHAT_UN_APP_SECRET: z.string().optional().default(""),
  WECHAT_UN_OPEN_PLATFORM_SCOPE: z.string().optional().default(""),
  WECHAT_CONTEXT_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
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
  seedDemoData: boolean;
  cookieSecure: boolean;
  corsOrigin: string;
  appBasePath: string;
  trustProxy: boolean;
  maxBodyBytes: number;
  storageDir: string;
  outboxPollIntervalMs: number;
  outboxLeaseSeconds?: number;
  workerInstanceId?: string;
  sowindGatewayAccessKey: string;
  sowindGatewayGpUrl: string;
  sowindGatewayUnUrl: string;
  sowindGatewayTimeoutMs: number;
  sowindGatewayMaxAttempts: number;
  sowindGatewayMaxPerMinute: number;
  runSowindLiveTests: boolean;
  integrationClientId: string;
  integrationClientSecret: string;
  wechatGpAppId?: string;
  wechatGpAppSecret?: string;
  wechatGpOpenPlatformScope?: string;
  wechatUnAppId?: string;
  wechatUnAppSecret?: string;
  wechatUnOpenPlatformScope?: string;
  wechatContextTtlMinutes?: number;
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
    seedDemoData: env.SEED_DEMO_DATA,
    cookieSecure: env.COOKIE_SECURE,
    corsOrigin: env.CORS_ORIGIN,
    appBasePath: env.APP_BASE_PATH,
    trustProxy: env.TRUST_PROXY,
    maxBodyBytes: env.MAX_BODY_BYTES,
    storageDir: resolve(process.cwd(), env.STORAGE_DIR),
    outboxPollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
    outboxLeaseSeconds: env.OUTBOX_LEASE_SECONDS,
    workerInstanceId: env.WORKER_INSTANCE_ID,
    sowindGatewayAccessKey: env.SOWIND_GATEWAY_ACCESS_KEY,
    sowindGatewayGpUrl: env.SOWIND_GATEWAY_GP_URL,
    sowindGatewayUnUrl: env.SOWIND_GATEWAY_UN_URL,
    sowindGatewayTimeoutMs: env.SOWIND_GATEWAY_TIMEOUT_MS,
    sowindGatewayMaxAttempts: env.SOWIND_GATEWAY_MAX_ATTEMPTS,
    sowindGatewayMaxPerMinute: env.SOWIND_GATEWAY_MAX_PER_MINUTE,
    runSowindLiveTests: env.RUN_SOWIND_LIVE_TESTS,
    integrationClientId: env.INTEGRATION_CLIENT_ID,
    integrationClientSecret: env.INTEGRATION_CLIENT_SECRET,
    wechatGpAppId: env.WECHAT_GP_APP_ID,
    wechatGpAppSecret: env.WECHAT_GP_APP_SECRET,
    wechatGpOpenPlatformScope: env.WECHAT_GP_OPEN_PLATFORM_SCOPE,
    wechatUnAppId: env.WECHAT_UN_APP_ID,
    wechatUnAppSecret: env.WECHAT_UN_APP_SECRET,
    wechatUnOpenPlatformScope: env.WECHAT_UN_OPEN_PLATFORM_SCOPE,
    wechatContextTtlMinutes: env.WECHAT_CONTEXT_TTL_MINUTES,
  };
  return { ...config, ...overrides };
}
