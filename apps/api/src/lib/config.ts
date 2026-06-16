import { isIP } from "node:net";
import { z } from "zod";

export const minimumPasswordLength = 8;

const passwordSchema = z
  .string()
  .min(minimumPasswordLength, `must be at least ${minimumPasswordLength} characters`)
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

function normalizeHttpOrigin(value: string) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("origin must use http or https");
  }
  return parsed.origin;
}

function parseOrigins(value?: string) {
  const normalized: string[] = [];
  const invalid: string[] = [];
  for (const origin of (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean)) {
    try {
      normalized.push(normalizeHttpOrigin(origin));
    } catch {
      invalid.push(origin);
    }
  }
  return { normalized, invalid };
}

function isLocalOrPrivateHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return false;
  if (["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(normalized)) return true;
  if (normalized.endsWith(".local")) return true;
  const ipKind = isIP(normalized);
  if (ipKind === 4) {
    const [a, b] = normalized.split(".").map((part) => Number(part));
    return a === 10
      || a === 127
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254)
      || a === 0;
  }
  if (ipKind === 6) {
    return normalized === "::1"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe80");
  }
  return false;
}

function isDevelopmentFriendlyOrigin(origin: string) {
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    return isLocalOrPrivateHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function deriveCookieDomain(origin: string | null) {
  if (!origin) return null;
  try {
    const hostname = new URL(origin).hostname;
    if (!hostname || isLocalOrPrivateHostname(hostname) || isIP(hostname)) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

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
  APP_URL: z.string().optional().or(z.literal("")),
  EXTRA_ALLOWED_ORIGINS: z.string().optional().or(z.literal("")),
  SELF_HOSTED: booleanEnv.default(true),
  TRUST_PROXY: booleanEnv.default(false),
  CORS_ORIGIN: z.string().optional().or(z.literal("")),
  DEMO_TECH_EMAIL: z.string().email().optional().or(z.literal("")),
  DEMO_TECH_PASSWORD: z.string().optional().or(z.literal("")),
  DEMO_LEASING_EMAIL: z.string().email().optional().or(z.literal("")),
  DEMO_LEASING_PASSWORD: z.string().optional().or(z.literal("")),
  DEMO_CLEANER_EMAIL: z.string().email().optional().or(z.literal("")),
  DEMO_CLEANER_PASSWORD: z.string().optional().or(z.literal("")),
  SEED_DEMO_DATA: booleanEnv.default(false),
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

const startupWarnings: string[] = [];
let appUrl: string | null = null;

if (parsed.APP_URL?.trim()) {
  try {
    appUrl = normalizeHttpOrigin(parsed.APP_URL.trim());
    const url = new URL(parsed.APP_URL.trim());
    if (url.pathname && url.pathname !== "/") {
      startupWarnings.push(`APP_URL path ${url.pathname} is ignored; using origin ${url.origin} only.`);
    }
  } catch {
    startupWarnings.push("APP_URL is invalid. Falling back to derived localhost or legacy origin settings.");
  }
}

const extraOrigins = parseOrigins(parsed.EXTRA_ALLOWED_ORIGINS);
const legacyOrigins = parseOrigins(parsed.CORS_ORIGIN);

for (const invalid of extraOrigins.invalid) {
  startupWarnings.push(`Ignoring invalid EXTRA_ALLOWED_ORIGINS entry: ${invalid}`);
}
for (const invalid of legacyOrigins.invalid) {
  startupWarnings.push(`Ignoring invalid deprecated CORS_ORIGIN entry: ${invalid}`);
}

const allowedOriginSet = new Set<string>();
if (appUrl) allowedOriginSet.add(appUrl);
for (const origin of extraOrigins.normalized) allowedOriginSet.add(origin);
for (const origin of legacyOrigins.normalized) allowedOriginSet.add(origin);

if (!appUrl) {
  if (legacyOrigins.normalized.length > 0) {
    startupWarnings.push("APP_URL not configured. Using deprecated CORS_ORIGIN fallback; remote/self-hosted access may be harder to troubleshoot.");
  } else {
    startupWarnings.push("APP_URL not configured. Using localhost fallback. Remote access may not function correctly.");
    allowedOriginSet.add("http://localhost:8080");
    allowedOriginSet.add("http://localhost:5173");
  }
}

const allowedOrigins = Array.from(allowedOriginSet);
const primaryOrigin = appUrl ?? allowedOrigins[0] ?? null;
if (allowedOrigins.length === 0) {
  throw new Error("No valid allowed origins could be derived from APP_URL, EXTRA_ALLOWED_ORIGINS, or CORS_ORIGIN.");
}

for (const warning of startupWarnings) {
  console.warn(`[config] ${warning}`);
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
  seedDemoData: parsed.SEED_DEMO_DATA,
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
  appUrl,
  extraAllowedOrigins: extraOrigins.normalized,
  selfHosted: parsed.SELF_HOSTED,
  trustProxy: parsed.TRUST_PROXY,
  corsOrigins: allowedOrigins,
  secureCookies: primaryOrigin ? new URL(primaryOrigin).protocol === "https:" : false,
  sessionCookieDomain: deriveCookieDomain(primaryOrigin),
  startupWarnings,
} as const;

export function validateTrustedOrigin(origin?: string) {
  if (!origin) {
    return true;
  }

  let normalized: string;
  try {
    normalized = normalizeHttpOrigin(origin);
  } catch {
    return false;
  }

  return authConfig.corsOrigins.includes(normalized)
    || (authConfig.nodeEnv === "development" && isDevelopmentFriendlyOrigin(normalized));
}
