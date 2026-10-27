import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

// Scope retry tokens to the authenticated uploader and turn, never a client-selected record ID.
export function attachmentRetryId(userId: string, itemId: string, uploadId: string) {
  return `upload_${createHash("sha256").update(JSON.stringify([userId, itemId, uploadId])).digest("hex")}`;
}
export async function fileDigest(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
