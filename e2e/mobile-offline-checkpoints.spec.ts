import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "../apps/web/node_modules/typescript/lib/typescript.js";

test("confirmed lease photos survive reload without duplicate creates or uploads", async ({ page }) => {
  const compiled = ts.transpileModule(readFileSync("apps/web/src/lib/offlineSync.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let creates = 0;
  let rejectSecond = true;
  const uploads: string[] = [];
  await page.exposeFunction("testCreateLease", async () => {
    creates++;
    return { issue: { id: "confirmed-lease" } };
  });
  await page.exposeFunction("testUploadLease", async (id: string, filename: string) => {
    expect(id).toBe("confirmed-lease");
    uploads.push(filename);
    if (rejectSecond && filename === "second.jpg") throw new Error("Upload interrupted");
    return {};
  });
  // A same-origin empty fixture isolates the queue from the app's automatic sync.
  await page.route("**/offline-checkpoint-fixture", route => route.fulfill({
    contentType: "text/html", body: "<!doctype html><title>Offline checkpoint fixture</title>",
  }));
  await page.goto("/offline-checkpoint-fixture");
  const install = async () => page.evaluate(source => {
    const exports = {};
    const host = window as any;
    new Function("exports", "require", source)(exports, () => ({
      ApiError: class ApiError extends Error {},
      createLeaseComplianceIssue: () => host.testCreateLease(),
      uploadLeaseComplianceIssuePhoto: (id: string, file: File) => host.testUploadLease(id, file.name),
    }));
    host.testQueue = exports;
  }, compiled);
  await install();
  const id = await page.evaluate(async () => {
    const queue = (window as any).testQueue;
    const job = await queue.enqueueLeaseCreate({ propertyId: "test-property", description: "Fixture" }, [
      { file: new File(["first photo"], "first.jpg", { type: "image/jpeg" }) },
      { file: new File(["second photo"], "second.jpg", { type: "image/jpeg" }) },
    ]);
    try { await queue.retryOfflineSyncJob(job.id); } catch { /* Expected attachment failure. */ }
    return job.id;
  });
  expect(creates).toBe(1);
  expect(uploads).toEqual(["first.jpg", "second.jpg"]);
  await page.reload();
  await install();
  const checkpoint = await page.evaluate(async jobId => {
    const job = await (window as any).testQueue.getOfflineSyncJob(jobId);
    return { serverRecordId: job.serverRecordId, filenames: job.payload.files.map((file: any) => file.name) };
  }, id);
  expect(checkpoint).toEqual({ serverRecordId: "confirmed-lease", filenames: ["second.jpg"] });
  rejectSecond = false;
  await page.evaluate(jobId => (window as any).testQueue.retryOfflineSyncJob(jobId), id);
  expect(creates).toBe(1);
  expect(uploads).toEqual(["first.jpg", "second.jpg", "second.jpg"]);
  expect(await page.evaluate(() => (window as any).testQueue.getOfflineSyncPendingCount())).toBe(0);
});
