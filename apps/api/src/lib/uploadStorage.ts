import { mkdir, unlink } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

export type UploadRoutedProperty = {
  code: string;
  uploadStorageMode?: string | null;
  uploadSubdir?: string | null;
};

export const uploadDir = resolve(process.env.UPLOAD_DIR || "uploads");

export function sanitizeUploadSegment(value: string) {
  return value
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 80))
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

export function propertyUploadSubdir(property: UploadRoutedProperty) {
  if (property.uploadStorageMode !== "PROPERTY_SUBDIR") return null;
  return sanitizeUploadSegment(property.uploadSubdir || property.code);
}

export function routedStoredName(property: UploadRoutedProperty, filename: string) {
  const subdir = propertyUploadSubdir(property);
  return subdir ? `${subdir}/${filename}` : filename;
}

export function unitTurnStoredName(item: { id: string; unitNumber: string; createdAt: Date; property: UploadRoutedProperty }, filename: string, stage = "GENERAL") {
  const segment = (value: string) => sanitizeUploadSegment(value.replace(/[\\/]/g, "-")) || "unknown";
  const root = propertyUploadSubdir(item.property) || segment(item.property.code);
  // Creation date and turn ID stay stable when scheduling dates change or a unit turns again.
  return `${root}/units/${segment(item.unitNumber)}/turn-${item.createdAt.toISOString().slice(0, 10)}-${segment(item.id)}/${segment(stage.toLowerCase().replaceAll("_", "-"))}/${segment(filename)}`;
}

export function resolveStoredUploadPath(storedName: string) {
  const path = resolve(uploadDir, storedName);
  const root = uploadDir.endsWith(sep) ? uploadDir : `${uploadDir}${sep}`;
  if (path !== uploadDir && !path.startsWith(root)) {
    throw new Error("Stored upload path escapes the configured upload directory");
  }
  return path;
}

export async function ensureStoredUploadParent(storedName: string) {
  await mkdir(dirname(resolveStoredUploadPath(storedName)), { recursive: true });
}

export async function removeStoredUpload(storedName: string | null | undefined) {
  if (!storedName) return;
  try {
    await unlink(resolveStoredUploadPath(storedName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
