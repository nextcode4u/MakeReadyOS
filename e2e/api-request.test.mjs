import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "../apps/api/node_modules/typescript/lib/typescript.js";

function client() {
  const exports = {};
  const calls = [];
  const source = readFileSync("apps/web/src/lib/api.ts", "utf8").replace("import.meta.env.VITE_API_BASE_URL", '"/api"');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText + "\nexports.testRequest = request;", {
    exports, require: () => ({}), Headers, FormData, File, Response,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return Response.json(url.endsWith("/auth/login") ? { csrfToken: "session-csrf" } : {});
    },
  });
  return { api: exports, calls };
}

test("custom request headers preserve JSON, CSRF and fetch options", async () => {
  const { api, calls } = client();
  await api.login("test", "test");
  for (const headers of [{ "X-Test": "value" }, [["X-Test", "value"]], new Headers({ "X-Test": "value" })]) {
    const controller = new AbortController();
    await api.testRequest("/test", { method: "PATCH", body: "{}", headers, signal: controller.signal });
    const { init } = calls.at(-1);
    assert.equal(init.headers.get("content-type"), "application/json");
    assert.equal(init.headers.get("x-csrf-token"), "session-csrf");
    assert.equal(init.headers.get("x-test"), "value");
    assert.equal(init.headers.has("x-mros-expected-user"), false);
    assert.equal(init.credentials, "include");
    assert.equal(init.signal, controller.signal);
  }
});

test("every queued delivery API helper carries its explicit account without changing payloads", async () => {
  const { api, calls } = client();
  await api.login("test", "test");
  const account = { expectedUserId: "owner-a" };
  const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
  const deliveries = [
    ["patchMakeReadyItem", ["turn", { notes: "draft" }]],
    ["createItemComment", ["turn", "comment"]],
    ["updateItemComment", ["turn", "comment-id", "updated"]],
    ["deleteItemComment", ["turn", "comment-id"]],
    ["uploadItemAttachment", ["turn", file, "INITIAL_WALK"]],
    ["attachChecklist", ["turn", "template"]],
    ["updateChecklistItem", ["check", { completed: true }]],
    ["createProjectRecord", [{ title: "Project" }]],
    ["uploadProjectAttachment", ["project", file, "PHOTO", "caption"]],
    ["createLeaseComplianceIssue", [{ issueTypeName: "Other" }]],
    ["uploadLeaseComplianceIssuePhoto", ["lease", file, { caption: "caption" }]],
    ["createPestIssue", [{ pestType: "OTHER" }]],
    ["uploadPestIssueAttachment", ["pest", file, { caption: "caption" }]],
    ["createPoolLogEntry", [{ facilityId: "pool" }]],
    ["uploadPoolLogAttachment", ["entry", file]],
    ["completePreventiveMaintenanceTask", ["task", { outcome: "PASS" }]],
    ["skipPreventiveMaintenanceTask", ["task", { notes: "reason" }]],
    ["uploadPreventiveMaintenanceAttachment", ["task", file]],
  ];
  for (const [name, args] of deliveries) {
    await api[name](...args, account);
    const { url, init } = calls.at(-1);
    assert.equal(init.headers.get("x-mros-expected-user"), "owner-a", name);
    assert.equal(init.headers.get("x-csrf-token"), "session-csrf", name);
    assert.equal("expectedUserId" in init, false, "constraint is not passed as an unknown fetch option");
    if (init.body instanceof FormData) {
      assert.equal(init.headers.has("content-type"), false, "browser supplies multipart boundary");
      assert.equal(init.body.get("file").name, "photo.jpg");
    } else if (init.body) {
      assert.equal(init.headers.get("content-type"), "application/json");
      assert.equal("expectedUserId" in JSON.parse(init.body), false);
    }
    if (name === "uploadItemAttachment") assert.ok(url.endsWith("?inspectionStage=INITIAL_WALK"));
  }
});
