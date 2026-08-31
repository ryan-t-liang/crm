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
  TRUST_PROXY: booleanFromEnv.default(false),
  MAX_BODY_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  STORAGE_DIR: z.string().default("../storage"),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  SOWIND_GATEWAY_ACCESS_KEY: z.string().optional().default(""),
  SOWIND_GATEWAY_GP_URL: z.string().url().default("https://b2b.girard-perregaux.com/n8n-webhook/wechat-leads/gp"),
  SOWIND_GATEWAY_UN_URL: z.string().url().default("https://b2b.ulysse-nardin.com/n8n-webhook/wechat-leads/un"),
  SOWIND_GATEWAY_TIMEOUT_MS: z.coerce.number().int().min(10000).default(10000),
  SOWIND_GATEWAY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  SOWIND_GATEWAY_MAX_PER_MINUTE: z.coerce.number().int().min(1).max(60).default(10),
  RUN_SOWIND_LIVE_TESTS: booleanFromEnv.default(false),
  INTEGRATION_CLIENT_ID: z.string().optional().default(""),
  INTEGRATION_CLIENT_SECRET: z.string().optional().default(""),
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
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
  trustProxy: boolean;
  maxBodyBytes: number;
  storageDir: string;
  outboxPollIntervalMs: number;
  sowindGatewayAccessKey: string;
  sowindGatewayGpUrl: string;
  sowindGatewayUnUrl: string;
  sowindGatewayTimeoutMs: number;
  sowindGatewayMaxAttempts: number;
  sowindGatewayMaxPerMinute: number;
  runSowindLiveTests: boolean;
  integrationClientId: string;
  integrationClientSecret: string;
};

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const env = schema.parse(process.env);
  const config: AppConfig = {
    nodeEnv: env.NODE_ENV,
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
    trustProxy: env.TRUST_PROXY,
    maxBodyBytes: env.MAX_BODY_BYTES,
    storageDir: resolve(process.cwd(), env.STORAGE_DIR),
    outboxPollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
    sowindGatewayAccessKey: env.SOWIND_GATEWAY_ACCESS_KEY,
    sowindGatewayGpUrl: env.SOWIND_GATEWAY_GP_URL,
    sowindGatewayUnUrl: env.SOWIND_GATEWAY_UN_URL,
    sowindGatewayTimeoutMs: env.SOWIND_GATEWAY_TIMEOUT_MS,
    sowindGatewayMaxAttempts: env.SOWIND_GATEWAY_MAX_ATTEMPTS,
    sowindGatewayMaxPerMinute: env.SOWIND_GATEWAY_MAX_PER_MINUTE,
    runSowindLiveTests: env.RUN_SOWIND_LIVE_TESTS,
    integrationClientId: env.INTEGRATION_CLIENT_ID,
    integrationClientSecret: env.INTEGRATION_CLIENT_SECRET,
  };
  return { ...config, ...overrides };
}
