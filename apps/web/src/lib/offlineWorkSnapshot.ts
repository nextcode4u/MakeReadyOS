import type { MyWorkResponse } from "./api";
import { getVerifiedSession, isCurrentSession } from "./verifiedSession";

export const snapshotKey = "mros.offline-work.v1";
export const snapshotLifetime = 8 * 60 * 60 * 1000;
const limit = 512 * 1024;
const iterations = 210000;
type Row = { id: string; unit: string; property: string; status: string; preparation: string; paint: string; cleaning: string; moveIn: string };
export type WorkSnapshot = { owner: string; origin: string; savedAt: number; expiresAt: number; rows: Row[] };
type Envelope = { version: 1; owner: string; origin: string; savedAt: number; expiresAt: number; salt: string; iv: string; ciphertext: string };
let unlocked: { owner: string; salt: string; key: CryptoKey } | null = null;
let revision = 0;
let sequence = 0;
const encoder = new TextEncoder();
const bytes = (value: string) => Uint8Array.from(atob(value), ch => ch.charCodeAt(0));
const base64 = (value: Uint8Array) => {
  let result = "";
  for (const byte of value) result += String.fromCharCode(byte);
  return btoa(result);
};

export function clearWorkSnapshot() {
  revision++;
  unlocked = null;
  try { localStorage.removeItem(snapshotKey); } catch { /* Reads also fail closed when storage is unavailable. */ }
}
export function checkSnapshotOwner(owner: string) {
  const current = snapshotMetadata();
  if (current && current.owner !== owner) clearWorkSnapshot();
  if (unlocked && unlocked.owner !== owner) { unlocked = null; revision++; }
}
export function snapshotMetadata(now = Date.now()): Envelope | null {
  try {
    const raw = localStorage.getItem(snapshotKey);
    if (!raw) return null;
    if (raw.length > limit) throw new Error("size");
    const value: Envelope = JSON.parse(raw);
    if (value.version !== 1 || value.origin !== location.origin || typeof value.owner !== "string" || !value.owner
      || !Number.isFinite(value.savedAt) || !Number.isFinite(value.expiresAt)
      || value.savedAt > now || value.expiresAt <= now || value.expiresAt - value.savedAt !== snapshotLifetime
      || bytes(value.salt).length !== 16 || bytes(value.iv).length !== 12 || !value.ciphertext) throw new Error("invalid");
    return value;
  } catch { clearWorkSnapshot(); return null; }
}
function aad(value: Pick<Envelope, "owner" | "origin" | "savedAt" | "expiresAt">) {
  return encoder.encode(JSON.stringify([1, value.owner, value.origin, value.savedAt, value.expiresAt]));
}
async function derive(phrase: string, salt: string) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(phrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: bytes(salt), iterations, hash: "SHA-256" }, material,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const safeText = (value: unknown) => typeof value === "string" ? value.slice(0, 160) : "";
export function projectWork(data: MyWorkResponse, owner: string, now: number): WorkSnapshot {
  if (data.target.id !== owner || data.items.length > 500) throw new Error("scope");
  return { owner, origin: location.origin, savedAt: now, expiresAt: now + snapshotLifetime,
    rows: data.items.map(item => ({ id: item.id, unit: safeText(item.unitNumber), property: safeText(item.property.name),
      status: safeText(item.status), preparation: safeText(item.makeReadyStatus), paint: safeText(item.paintStatus),
      cleaning: safeText(item.cleaningStatus), moveIn: safeText(item.moveInDate) })) };
}
export async function enableWorkSnapshot(data: MyWorkResponse, phrase: string) {
  if (phrase.length < 12 || phrase.length > 256) throw new Error("phrase");
  const session = getVerifiedSession();
  if (!session.userId || data.target.id !== session.userId) throw new Error("scope");
  const ticket = ++revision;
  const salt = base64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await derive(phrase, salt);
  if (ticket !== revision || !isCurrentSession(session)) throw new Error("changed");
  unlocked = { owner: session.userId, salt, key };
  try { if (!await updateWorkSnapshot(data)) throw new Error("changed"); }
  catch (error) { unlocked = null; throw error; }
}
export async function updateWorkSnapshot(data: MyWorkResponse) {
  const session = getVerifiedSession();
  const key = unlocked;
  if (!key || session.userId !== key.owner || data.target.id !== key.owner) return false;
  const ticket = revision;
  const order = ++sequence;
  const snapshot = projectWork(data, key.owner, Date.now());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(snapshot) }, key.key,
    encoder.encode(JSON.stringify(snapshot)));
  if (ticket !== revision || order !== sequence || !isCurrentSession(session)) return false;
  const envelope: Envelope = { version: 1, owner: snapshot.owner, origin: snapshot.origin, savedAt: snapshot.savedAt,
    expiresAt: snapshot.expiresAt, salt: key.salt, iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) };
  const serialized = JSON.stringify(envelope);
  if (serialized.length > limit) throw new Error("size");
  localStorage.setItem(snapshotKey, serialized);
  return true;
}
export async function openWorkSnapshot(phrase: string): Promise<WorkSnapshot> {
  const envelope = snapshotMetadata();
  if (!envelope || phrase.length > 256) throw new Error("unavailable");
  const ticket = revision;
  const key = await derive(phrase, envelope.salt);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(envelope.iv), additionalData: aad(envelope) }, key,
    bytes(envelope.ciphertext));
  if (ticket !== revision || !snapshotMetadata() || localStorage.getItem(snapshotKey) !== JSON.stringify(envelope)) throw new Error("changed");
  const data: WorkSnapshot = JSON.parse(new TextDecoder().decode(plaintext));
  if (data.owner !== envelope.owner || data.origin !== envelope.origin || data.savedAt !== envelope.savedAt
      || data.expiresAt !== envelope.expiresAt || !Array.isArray(data.rows) || data.rows.length > 500) throw new Error("invalid");
  // Deliberately do not acceptVerifiedSession: an unlocked snapshot is not authenticated API access.
  return data;
}
