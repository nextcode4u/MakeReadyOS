import { z } from "zod";

const passwordSchema = z
  .string()
  .min(12, "must be at least 12 characters")
  .regex(/[a-z]/, "must include a lowercase letter")
  .regex(/[A-Z]/, "must include an uppercase letter")
  .regex(/[0-9]/, "must include a number")
  .regex(/[^A-Za-z0-9]/, "must include a symbol");

export function assertStrongPassword(password: string, label: string) {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.message).join(", ");
    throw new Error(`${label} ${detail}`);
  }
}

function parseOrigins(value: string) {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseList(value?: string) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const booleanEnv = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ADMIN_EMAIL: z.string().email("ADMIN_EMAIL must be a valid email address"),
  ADMIN_PASSWORD: z.string().min(1, "ADMIN_PASSWORD is required"),
  SESSION_COOKIE_SECRET: z.string().min(32, "SESSION_COOKIE_SECRET must be at least 32 characters"),
  WEBHOOK_SECRET_ENCRYPTION_KEY: z.string().min(32, "WEBHOOK_SECRET_ENCRYPTION_KEY must be at least 32 characters").optional().or(z.literal("")),
  WEBHOOK_DELIVERY_BATCH_SIZE: z.coerce.number().int().min(1).max(250).default(25),
  WEBHOOK_DELIVERY_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(5000),
  WEBHOOK_DELIVERY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  WEBHOOK_AUTO_DISABLE_FAILURES: z.coerce.number().int().min(0).max(1000).default(0),
  WEBHOOK_ALLOW_PRIVATE_URLS: booleanEnv.default(true),
  WEBHOOK_ALLOWED_HOSTS: z.string().optional().or(z.literal("")),
  SESSION_COOKIE_NAME: z
    .string()
    .min(1, "SESSION_COOKIE_NAME is required")
    .regex(/^[A-Za-z0-9_-]+$/, "SESSION_COOKIE_NAME may only contain letters, numbers, underscores, and dashes")
    .default("makereadyos_session"),
  SESSION_COOKIE_SAME_SITE: z.enum(["lax", "strict"]).default("lax"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(50).default(5),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN must list at least one allowed origin"),
  DEMO_TECH_EMAIL: z.string().email().optional().or(z.literal("")),
  DEMO_TECH_PASSWORD: z.string().optional().or(z.literal("")),
  DEMO_LEASING_EMAIL: z.string().email().optional().or(z.literal("")),
  DEMO_LEASING_PASSWORD: z.string().optional().or(z.literal("")),
  DEMO_CLEANER_EMAIL: z.string().email().optional().or(z.literal("")),
  DEMO_CLEANER_PASSWORD: z.string().optional().or(z.literal("")),
});

const parsed = envSchema.parse(process.env);

if (parsed.SESSION_COOKIE_SECRET.toLowerCase().includes("change-this")) {
  throw new Error("SESSION_COOKIE_SECRET must not use the insecure example value");
}

assertStrongPassword(parsed.ADMIN_PASSWORD, "ADMIN_PASSWORD");

if ((parsed.DEMO_TECH_EMAIL && !parsed.DEMO_TECH_PASSWORD) || (!parsed.DEMO_TECH_EMAIL && parsed.DEMO_TECH_PASSWORD)) {
  throw new Error("DEMO_TECH_EMAIL and DEMO_TECH_PASSWORD must both be set or both be empty");
}

if (parsed.DEMO_TECH_PASSWORD) {
  assertStrongPassword(parsed.DEMO_TECH_PASSWORD, "DEMO_TECH_PASSWORD");
}

for (const [emailKey, passwordKey] of [
  ["DEMO_LEASING_EMAIL", "DEMO_LEASING_PASSWORD"],
  ["DEMO_CLEANER_EMAIL", "DEMO_CLEANER_PASSWORD"],
] as const) {
  if ((parsed[emailKey] && !parsed[passwordKey]) || (!parsed[emailKey] && parsed[passwordKey])) {
    throw new Error(`${emailKey} and ${passwordKey} must both be set or both be empty`);
  }
  if (parsed[passwordKey]) {
    assertStrongPassword(parsed[passwordKey], passwordKey);
  }
}

const corsOrigins = parseOrigins(parsed.CORS_ORIGIN);
if (corsOrigins.length === 0) {
  throw new Error("CORS_ORIGIN must contain at least one allowed origin");
}

export const authConfig = {
  nodeEnv: parsed.NODE_ENV,
  adminEmail: parsed.ADMIN_EMAIL.trim().toLowerCase(),
  adminPassword: parsed.ADMIN_PASSWORD,
  demoTechEmail: parsed.DEMO_TECH_EMAIL?.trim().toLowerCase() || null,
  demoTechPassword: parsed.DEMO_TECH_PASSWORD || null,
  demoLeasingEmail: parsed.DEMO_LEASING_EMAIL?.trim().toLowerCase() || null,
  demoLeasingPassword: parsed.DEMO_LEASING_PASSWORD || null,
  demoCleanerEmail: parsed.DEMO_CLEANER_EMAIL?.trim().toLowerCase() || null,
  demoCleanerPassword: parsed.DEMO_CLEANER_PASSWORD || null,
  sessionCookieSecret: parsed.SESSION_COOKIE_SECRET,
  webhookSecretEncryptionKey: parsed.WEBHOOK_SECRET_ENCRYPTION_KEY || parsed.SESSION_COOKIE_SECRET,
  webhookDeliveryBatchSize: parsed.WEBHOOK_DELIVERY_BATCH_SIZE,
  webhookDeliveryTimeoutMs: parsed.WEBHOOK_DELIVERY_TIMEOUT_MS,
  webhookDeliveryMaxAttempts: parsed.WEBHOOK_DELIVERY_MAX_ATTEMPTS,
  webhookAutoDisableFailures: parsed.WEBHOOK_AUTO_DISABLE_FAILURES,
  webhookAllowPrivateUrls: parsed.WEBHOOK_ALLOW_PRIVATE_URLS,
  webhookAllowedHosts: parseList(parsed.WEBHOOK_ALLOWED_HOSTS),
  sessionCookieName: parsed.SESSION_COOKIE_NAME,
  sessionCookieSameSite: parsed.SESSION_COOKIE_SAME_SITE,
  sessionTtlDays: parsed.SESSION_TTL_DAYS,
  loginRateLimitMax: parsed.LOGIN_RATE_LIMIT_MAX,
  loginRateLimitWindowMinutes: parsed.LOGIN_RATE_LIMIT_WINDOW_MINUTES,
  corsOrigins,
  secureCookies: parsed.NODE_ENV === "production",
} as const;

export function validateTrustedOrigin(origin?: string) {
  if (!origin) {
    return true;
  }

  return authConfig.corsOrigins.includes(origin);
}
