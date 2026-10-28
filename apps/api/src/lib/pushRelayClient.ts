import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { fcmConfiguration, sendFcm, type PushSummary } from "./fcm.js";

export function resolveRelayOrigin(explicitUrl = process.env.PUSH_RELAY_URL, appUrl = process.env.APP_URL): string | null {
  try {
    const explicit = explicitUrl?.trim();
    const url = new URL(explicit || appUrl || "");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    if (explicit) return url.origin;
    // Derive only from operator configuration, never a request's Host header.
    const host = url.hostname;
    if (isIP(host) || host.includes(":") || !host.includes(".") || host.endsWith(".localhost")
      || host.length > 248 || !host.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
    return `https://push.${host}`;
  } catch { return null; }
}

export function relayConfiguration() {
  if (process.env.ANDROID_PUSH_TRANSPORT !== "relay") return null;
  try {
    const origin = resolveRelayOrigin();
    const projectId = process.env.FCM_PROJECT_ID!;
    const credential = readFileSync(process.env.PUSH_RELAY_CREDENTIAL_FILE!, "utf8").trim();
    if (!origin || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId) || !/^[a-f0-9]{64}$/.test(credential)) return null;
    return { url: origin, projectId, credential };
  } catch { return null; }
}

export function androidConfiguration() {
  const mode = process.env.ANDROID_PUSH_TRANSPORT;
  return mode === "relay" ? relayConfiguration() : !mode || mode === "direct" ? fcmConfiguration() : null;
}
export const androidTransport = () => process.env.ANDROID_PUSH_TRANSPORT === "relay" ? "ANDROID_RELAY" : "ANDROID";
export function relayScope(config = relayConfiguration()) {
  return config ? createHash("sha256").update(config.url + ":" + config.credential).digest("hex") : "";
}
export function relayEndpoint(token: string) {
  return "android-relay:" + createHash("sha256").update((relayConfiguration()?.url ?? "") + ":" + token).digest("hex");
}

export async function relayRequest<T>(path: string, input: unknown): Promise<T> {
  const config = relayConfiguration();
  if (!config) throw Object.assign(new Error("Push relay is not configured"), { statusCode: 503 });
  const response = await fetch(config.url + path, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${config.credential}`, "Content-Type": "application/json" }, body: JSON.stringify(input) });
  // Never forward relay responses containing private tokens or operational details to clients/logs.
  if (!response.ok) throw Object.assign(new Error("Push relay request failed. Recheck notification setup."), { statusCode: response.status === 404 ? 400 : response.status });
  return await response.json() as T;
}

export async function sendAndroid(device: Parameters<typeof sendFcm>[0] & { transport?: string }, notificationId: string, expiresAt: number, summary?: PushSummary) {
  if (device.transport === "ANDROID_RELAY") {
    await relayRequest("/v1/send", { handle: device.fcmToken, notificationId, expiresAt, ...(summary ? { title: summary.title.slice(0, 100), body: summary.body.slice(0, 240) } : {}) });
  } else await sendFcm(device, notificationId, expiresAt, summary);
}
