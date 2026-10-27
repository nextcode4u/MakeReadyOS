import assert from "node:assert/strict";
import test from "node:test";
import { fcmFailure, fcmPayload, fcmConfiguration } from "./fcm.js";
import { retryPush } from "./push.js";

test("FCM sends only opaque routing metadata with short TTL", () => {
  const payload = fcmPayload("test-token", "binding", "notice", 1234);
  assert.deepEqual(payload.message.data, { bindingId: "binding", notificationId: "notice", expiresAt: "1234" });
  assert.equal(payload.message.android.ttl, "300s");
  assert.equal(payload.message.android.restricted_package_name, "com.makereadyos.android");
  assert.equal("notification" in payload.message, false);
});
test("only typed UNREGISTERED removes FCM subscriptions", () => {
  assert.equal(fcmFailure(404, { error: { message: "missing project" } }).statusCode, 400);
  assert.equal(fcmFailure(404, { error: { details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" }] } }).statusCode, 410);
  for (const code of [429, 500, 503]) assert.equal(retryPush(fcmFailure(code, null).statusCode, 1), true);
  assert.equal(retryPush(fcmFailure(403, null).statusCode, 1), false);
  assert.equal(retryPush(fcmFailure(503, null).statusCode, 5), false);
});
test("missing sender credentials disable FCM without affecting browsers", () => {
  const before = process.env.FCM_SERVICE_ACCOUNT_FILE;
  try { process.env.FCM_SERVICE_ACCOUNT_FILE = "/nonexistent/test-credential.json"; assert.equal(fcmConfiguration(), null); }
  finally { if (before === undefined) delete process.env.FCM_SERVICE_ACCOUNT_FILE; else process.env.FCM_SERVICE_ACCOUNT_FILE = before; }
});
