import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "../apps/api/node_modules/typescript/lib/typescript.js";

function client() {
  const exports = {};
  const session = {};
  const calls = [];
  let respond = null;
  vm.runInNewContext(ts.transpileModule(readFileSync("apps/web/src/lib/verifiedSession.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: session });
  const source = readFileSync("apps/web/src/lib/api.ts", "utf8").replace("import.meta.env.VITE_API_BASE_URL", '"/api"');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText + "\nexports.testRequest = request;", {
    exports, require: name => name === "./verifiedSession" ? session : {}, Headers, FormData, File, Response,
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (respond) {
        const response = respond(url, init);
        if (response) return response;
      }
      const id = url.endsWith("/auth/login") ? JSON.parse(init.body).identifier : "";
      return Response.json(id ? { user: { id }, csrfToken: `csrf-${id}` } : {});
    },
  });
  return { api: exports, calls, session, respondWith: handler => { respond = handler; } };
}

test("custom request headers preserve JSON, CSRF and fetch options", async () => {
  const { api, calls } = client();
  await api.login("test", "test");
  for (const headers of [{ "X-Test": "value" }, [["X-Test", "value"]], new Headers({ "X-Test": "value" })]) {
    const controller = new AbortController();
    await api.testRequest("/test", { method: "PATCH", body: "{}", headers, signal: controller.signal });
    const { init } = calls.at(-1);
    assert.equal(init.headers.get("content-type"), "application/json");
    assert.equal(init.headers.get("x-csrf-token"), "csrf-test");
    assert.equal(init.headers.get("x-test"), "value");
    assert.equal(init.headers.has("x-mros-expected-user"), false);
    assert.equal(init.credentials, "include");
    assert.equal(init.signal, controller.signal);
  }
});

test("every queued delivery API helper carries its explicit account without changing payloads", async () => {
  const { api, calls } = client();
  await api.login("owner-a", "test");
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
    assert.equal(init.headers.get("x-csrf-token"), "csrf-owner-a", name);
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

test("late identity and authorization responses cannot restore or clear another account", async () => {
  const { api, calls, session, respondWith } = client();
  await api.login("owner-a", "test");
  let releaseMe;
  let releaseWrite;
  const heldMe = new Promise(resolve => { releaseMe = resolve; });
  const heldWrite = new Promise(resolve => { releaseWrite = resolve; });
  respondWith(url => url.endsWith("/auth/me") ? heldMe : url.endsWith("/make-ready-items/held") ? heldWrite : null);
  const staleMe = api.getCurrentUser().catch(error => error);
  const staleWrite = api.patchMakeReadyItem("held", {}).catch(error => error);
  await api.logout();
  assert.equal(session.getVerifiedSession().userId, null);
  assert.equal(calls.find(call => call.url.endsWith("/auth/logout")).init.headers.get("x-csrf-token"), "csrf-owner-a");
  await api.login("owner-b", "test");
  releaseMe(Response.json({ user: { id: "owner-a" }, csrfToken: "old-csrf" }));
  releaseWrite(Response.json({ message: "Expired" }, { status: 401 }));
  assert.equal((await staleMe).status, 409);
  assert.equal((await staleWrite).status, 401);
  assert.equal(session.getVerifiedSession().userId, "owner-b");
  await api.patchMakeReadyItem("current", {}, { expectedUserId: "owner-b" });
  assert.equal(calls.at(-1).init.headers.get("x-csrf-token"), "csrf-owner-b");
});

test("account-bound writes require a verified account and stop after a server mismatch", async () => {
  const { api, calls, session, respondWith } = client();
  const bound = () => api.patchMakeReadyItem("turn", {}, { expectedUserId: "owner-a" });
  await assert.rejects(bound, error => error.status === 409);
  assert.equal(calls.length, 0);
  await api.login("owner-b", "test");
  await assert.rejects(bound, error => error.status === 409);
  assert.equal(calls.length, 1);
  await api.login("owner-a", "test");
  respondWith(url => url.endsWith("/make-ready-items/turn") ? Response.json({ code: "SESSION_ACCOUNT_CHANGED" }, { status: 409 }) : null);
  await assert.rejects(bound, error => error.status === 409);
  assert.equal(session.getVerifiedSession().userId, null);
  const sent = calls.length;
  await assert.rejects(bound, error => error.status === 409);
  assert.equal(calls.length, sent);
});

test("only verified auth responses establish an account, not admin-created users", async () => {
  const { api, calls, session, respondWith } = client();
  respondWith(url => Response.json({ user: { id: url.endsWith("/auth/me") ? "owner-a" : "created-user" }, csrfToken: url.endsWith("/auth/me") ? "verified-csrf" : "unrelated-csrf" }));
  await api.getCurrentUser();
  const verified = session.getVerifiedSession();
  await api.testRequest("/admin/users", { method: "POST", body: "{}" });
  assert.equal(session.getVerifiedSession(), verified);
  await api.patchMakeReadyItem("turn", {}, { expectedUserId: "owner-a" });
  assert.equal(calls.at(-1).init.headers.get("x-csrf-token"), "verified-csrf");
  await api.logoutAllSessions();
  assert.equal(session.getVerifiedSession().userId, null);
});

test("a pending login cannot restore identity after logout starts", async () => {
  const { api, session, respondWith } = client();
  let release;
  const held = new Promise(resolve => { release = resolve; });
  respondWith(url => url.endsWith("/auth/login") ? held : null);
  const pending = api.login("owner-a", "test").catch(error => error);
  await api.logout();
  release(Response.json({ user: { id: "owner-a" }, csrfToken: "late-csrf" }));
  assert.equal((await pending).status, 409);
  assert.equal(session.getVerifiedSession().userId, null);
});
