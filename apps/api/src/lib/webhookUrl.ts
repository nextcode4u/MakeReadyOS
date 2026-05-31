import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { authConfig } from "./config.js";

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "").toLowerCase();
}

function ipv4ToNumber(address: string) {
  return address.split(".").reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0) >>> 0;
}

function ipv4InCidr(address: string, base: string, maskBits: number) {
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(base) & mask);
}

function isPrivateIpv4(address: string) {
  return [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.168.0.0", 16],
    ["224.0.0.0", 4],
  ].some(([base, maskBits]) => ipv4InCidr(address, String(base), Number(maskBits)));
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) === 4 && isPrivateIpv4(mapped);
  }
  const firstHextet = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return (firstHextet & 0xfe00) === 0xfc00 || (firstHextet & 0xffc0) === 0xfe80;
}

function isPrivateAddress(address: string) {
  const type = isIP(address);
  if (type === 4) return isPrivateIpv4(address);
  if (type === 6) return isPrivateIpv6(address);
  return false;
}

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "host.docker.internal"
  );
}

function isAllowlisted(hostname: string) {
  return authConfig.webhookAllowedHosts.some((entry) => {
    const allowed = normalizeHostname(entry);
    if (allowed === hostname) return true;
    if (allowed.startsWith("*.")) return hostname.endsWith(allowed.slice(1));
    return false;
  });
}

function parseHttpWebhookUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: "Webhook URL is not a valid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Webhook URL must use http or https" };
  }
  return { parsed };
}

function localTargetError(hostname: string) {
  return `Webhook URL targets a private/local host (${hostname}). Set WEBHOOK_ALLOW_PRIVATE_URLS=true for trusted self-hosted networks or add the host to WEBHOOK_ALLOWED_HOSTS.`;
}

export function validateWebhookUrlForRegistration(value: string) {
  const result = parseHttpWebhookUrl(value);
  if (result.error) return result.error;
  const hostname = normalizeHostname(result.parsed!.hostname);
  if (authConfig.webhookAllowPrivateUrls || isAllowlisted(hostname)) return null;
  if (isLocalHostname(hostname) || isPrivateAddress(hostname)) return localTargetError(hostname);
  return null;
}

export async function validateWebhookUrlForDelivery(value: string) {
  const registrationError = validateWebhookUrlForRegistration(value);
  if (registrationError) return registrationError;
  if (authConfig.webhookAllowPrivateUrls) return null;

  const result = parseHttpWebhookUrl(value);
  if (result.error) return result.error;
  const hostname = normalizeHostname(result.parsed!.hostname);
  if (isAllowlisted(hostname) || isIP(hostname)) return null;

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    const privateAddress = addresses.find((address) => isPrivateAddress(address.address));
    if (privateAddress) return localTargetError(`${hostname} -> ${privateAddress.address}`);
  } catch (error) {
    return `Webhook URL host could not be resolved (${hostname}): ${error instanceof Error ? error.message : String(error)}`;
  }
  return null;
}
