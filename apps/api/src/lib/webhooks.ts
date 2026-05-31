import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from "node:crypto";
import { authConfig } from "./config.js";

const algorithm = "aes-256-gcm";

function encryptionKey() {
  return createHash("sha256").update(authConfig.webhookSecretEncryptionKey).digest();
}

export function encryptWebhookSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptWebhookSecret(value: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(":");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error("Unsupported webhook secret format");
  }
  const decipher = createDecipheriv(algorithm, encryptionKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export function signWebhookPayload(secret: string, timestamp: string, payload: unknown) {
  const serialized = JSON.stringify(payload);
  return createHmac("sha256", secret).update(`${timestamp}.${serialized}`).digest("hex");
}

export function buildWebhookHeaders(input: {
  deliveryId: string;
  eventType: string;
  payload: unknown;
  secret: string;
  timestamp?: Date;
}) {
  const timestamp = Math.floor((input.timestamp ?? new Date()).getTime() / 1000).toString();
  return {
    "content-type": "application/json",
    "user-agent": "MakeReadyOS-Webhooks/0.1",
    "x-makereadyos-delivery": input.deliveryId,
    "x-makereadyos-event": input.eventType,
    "x-makereadyos-timestamp": timestamp,
    "x-makereadyos-signature": `sha256=${signWebhookPayload(input.secret, timestamp, input.payload)}`,
  };
}
