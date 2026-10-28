import { readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";

export type FcmConfiguration = { projectId: string; credentialsFile: string };
export function fcmConfiguration(): FcmConfiguration | null {
  const projectId = process.env.FCM_PROJECT_ID;
  const credentialsFile = process.env.FCM_SERVICE_ACCOUNT_FILE;
  if (!projectId || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId) || !credentialsFile) return null;
  try {
    const key = JSON.parse(readFileSync(credentialsFile, "utf8"));
    if (key.type !== "service_account" || key.project_id !== projectId || !key.client_email || !key.private_key) return null;
    if (key.token_uri && key.token_uri !== "https://oauth2.googleapis.com/token") return null;
  } catch { return null; }
  return { projectId, credentialsFile };
}

export function fcmPayload(token: string, bindingId: string, notificationId: string, expiresAt: number) {
  return { message: { token, data: { bindingId, notificationId, expiresAt: String(expiresAt) },
    android: { priority: "high", ttl: "300s", restricted_package_name: "com.makereadyos.android" } } };
}

export function fcmFailure(status: number, body: unknown) {
  const details = (body as { error?: { details?: Array<{ "@type"?: string; errorCode?: string }> } })?.error?.details;
  // A missing project is not an expired device. Only the typed FCM error removes tokens.
  const expired = Array.isArray(details) && details.some(d => d["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError" && d.errorCode === "UNREGISTERED");
  return Object.assign(new Error("Android push delivery failed"), { statusCode: expired ? 410 : status === 404 ? 400 : status });
}

let auth: { key: string; client: GoogleAuth } | undefined;
export async function sendFcm(device: { fcmToken: string | null; bindingId: string | null; fcmProjectId: string | null }, notificationId: string, expiresAt: number) {
  const config = fcmConfiguration();
  if (!config || device.fcmProjectId !== config.projectId || !device.fcmToken || !device.bindingId) {
    throw Object.assign(new Error("Android push unavailable"), { statusCode: 400 });
  }
  await sendFcmData(config, fcmPayload(device.fcmToken, device.bindingId, notificationId, expiresAt));
}

export async function sendFcmData(config: FcmConfiguration, payload: unknown) {
  const key = config.projectId + ":" + config.credentialsFile;
  if (auth?.key !== key) auth = { key, client: new GoogleAuth({ keyFilename: config.credentialsFile, scopes: ["https://www.googleapis.com/auth/firebase.messaging"], clientOptions: { transporterOptions: { timeout: 10000, retry: false } } }) };
  const token = await auth.client.getAccessToken();
  if (!token) throw Object.assign(new Error("Android push authorization unavailable"), { statusCode: 401 });
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000), redirect: "error",
  });
  if (!response.ok) throw fcmFailure(response.status, await response.json().catch(() => null));
}
