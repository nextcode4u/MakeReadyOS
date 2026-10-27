import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { chromium } from "../apps/api/node_modules/playwright-core/index.mjs";
import { createServer } from "../apps/web/node_modules/vite/dist/node/index.js";

test("protected resident saves survive reload, stay account-bound, and notify only after delivery", { skip: !process.env.TEST_BROWSER_PATH }, async () => {
  const server = await createServer({ root: resolve("apps/web"), configFile: resolve("apps/web/vite.config.ts"), server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  const browser = await chromium.launch({ executablePath: process.env.TEST_BROWSER_PATH, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.route("**/test.html", route => route.fulfill({ contentType: "text/html", body: "<title>Isolated queue test</title>" }));
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    await page.goto(`${origin}/test.html`);
    const prepare = async owner => page.evaluate(async owner => {
      const session = await import("/src/lib/verifiedSession.ts");
      session.clearVerifiedSession(); session.acceptVerifiedSession(owner, session.getVerifiedSession());
    }, owner);
    await prepare("owner-a");
    await page.evaluate(async () => {
      const queue = await import("/src/lib/offlineSync.ts");
      await queue.enqueueResidentSave("owner-a", "test-turn", { version: 4, value: { residentDoorCode: "synthetic-secret", technicianResults: { prep: { status: "CHECKED", note: "" } } } });
      const [job] = await queue.getOfflineSyncJobs();
      if (JSON.stringify(job).includes("synthetic-secret")) throw Error("Plaintext in queue");
      const { openPendingSave } = await import("/src/lib/protectedPendingSave.ts");
      let rejected = false;
      try { await openPendingSave("owner-a", "wrong-turn", job.payload.protected); } catch { rejected = true; }
      if (!rejected) throw Error("Wrong-turn decryption accepted");
    });
    await page.reload();
    await prepare("owner-b");
    assert.equal(await page.evaluate(async () => (await (await import("/src/lib/offlineSync.ts")).getOfflineSyncJobs()).length), 0);
    await prepare("owner-a");
    let requests = 0;
    await page.route("**/api/make-ready-items/test-turn/resident-codes", async route => {
      requests++;
      assert.equal(route.request().headers()["x-mros-expected-user"], "owner-a");
      assert.equal(route.request().postDataJSON().version, 4);
      assert.equal(route.request().postDataJSON().value.residentDoorCode, "synthetic-secret");
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "Revision conflict" }) });
    });
    assert.equal(await page.evaluate(async () => {
      const q = await import("/src/lib/offlineSync.ts");
      const [job] = await q.getOfflineSyncJobs();
      try { await q.retryOfflineSyncJob(job.id, { serverReachable: true }); } catch { /* expected */ }
      return (await q.getOfflineSyncJobs()).length;
    }), 1, "revision conflicts must retain the encrypted save");
    await page.unroute("**/api/make-ready-items/test-turn/resident-codes");
    await page.route("**/api/make-ready-items/test-turn/resident-codes", route => {
      requests++;
      return route.fulfill({ contentType: "application/json", body: "{}" });
    });
    const result = await page.evaluate(async () => {
      const q = await import("/src/lib/offlineSync.ts");
      const events = [];
      window.addEventListener(q.offlineJobCompletedEvent, event => events.push(event.detail));
      const [job] = await q.getOfflineSyncJobs();
      await q.retryOfflineSyncJob(job.id, { serverReachable: true });
      return { events, remaining: (await q.getOfflineSyncJobs()).length };
    });
    assert.equal(result.remaining, 0);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].itemId, "test-turn");
    assert.equal(result.events[0].kind, "makeReadyResidentSave");
    assert.equal(requests, 2);
  } finally { await browser.close(); await server.close(); }
});
