import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("evidence ZIP includes all rows and comment files, preserves extensions, and refuses missing files or wrong scope", async t => {
  const directory = await mkdtemp(join(tmpdir(), "mros-evidence-"));
  process.env.UPLOAD_DIR = directory;
  process.env.ADMIN_USERNAME = "evidence-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { prisma } = await import("../lib/prisma.js");
  const { collaborationRoutes } = await import("./collaboration.js");
  const { default: Fastify } = await import("fastify");
  await writeFile(join(directory, "photo.png"), "original bytes");
  const originalItem = prisma.makeReadyItem.findUnique;
  const originalAttachments = prisma.itemAttachment.findMany;
  let missing = false;
  prisma.makeReadyItem.findUnique = (async () => ({ id: "turn", propertyId: "p", unitNumber: "101", property: { code: "TA", name: "Test Property" } })) as any;
  prisma.itemAttachment.findMany = (async (query: any) => {
    assert.equal(query.take, undefined);
    assert.equal(query.where.commentId, undefined);
    return Array.from({ length: 55 }, (_, index) => ({ id: `photo-${index}`, inspectionStage: "INITIAL_WALK", category: "Damage", originalName: `${"x".repeat(170)}.png`, storedName: missing ? "missing.png" : "photo.png", commentId: index === 0 ? "comment" : null, createdAt: new Date("2026-09-08T15:04:05Z"), uploaderName: "Tech", sizeBytes: 14 }));
  }) as any;
  const app = Fastify(); let propertyIds = ["p"]; let role = "LEASING";
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "u", fullName: "Staff", role, propertyAccess: propertyIds.map(propertyId => ({ propertyId })) } as any; });
  await app.register(collaborationRoutes);
  t.after(async () => { await app.close(); prisma.makeReadyItem.findUnique = originalItem; prisma.itemAttachment.findMany = originalAttachments; await rm(directory, { recursive: true, force: true }); });
  for (const value of ["LEASING", "MANAGER"]) {
    role = value;
    const response = await app.inject("/make-ready-items/turn/attachments/archive");
    assert.equal(response.statusCode, 200, response.body.slice(0, 100));
    assert.equal(response.headers["cache-control"], "no-store");
    const zipPath = join(directory, `${role}.zip`);
    await writeFile(zipPath, response.rawPayload);
    const manifest = JSON.parse(execFileSync("unzip", ["-p", zipPath, "manifest.json"], { encoding: "utf8" }));
    assert.equal(manifest.count, 55);
    assert.equal(manifest.attachments[0].commentId, "comment");
    assert.equal(new Set(manifest.attachments.map((entry: any) => entry.zipPath)).size, 55);
    assert.ok(manifest.attachments.every((entry: any) => entry.zipPath.endsWith(".png") && !entry.storedName));
  }
  missing = true;
  assert.equal((await app.inject("/make-ready-items/turn/attachments/archive")).statusCode, 409);
  propertyIds = ["other"];
  assert.equal((await app.inject("/make-ready-items/turn/attachments/archive")).statusCode, 403);
  propertyIds = ["p"]; role = "LEASING";
  assert.equal((await app.inject({ method: "POST", url: "/make-ready-items/turn/attachments?inspectionStage=INITIAL_WALK" })).statusCode, 403);
});
