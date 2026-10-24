import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCodeCsv, unitMatchKey, accessCodeValues, syncUnitCodes } from "./unitAccessCodes.js";

test("code imports preserve zeros, punctuation and quoted values without executing formulas", () => {
  assert.deepEqual(parseCodeCsv('unit,doorCode,accessCode,keyCode\n011,0042#,"a,b",=1+1'), [{ number: "011", doorCode: "0042#", accessCode: "a,b", keyCode: "=1+1" }]);
  assert.deepEqual(parseCodeCsv('unit\tdoorCode\taccessCode\tkeyCode\n11\t0012\t\tA1'), [{ number: "11", doorCode: "0012", accessCode: "", keyCode: "A1" }]);
  assert.equal(unitMatchKey("00011"), unitMatchKey("11"));
  assert.notEqual(unitMatchKey("001A"), unitMatchKey("1A"));
  assert.throws(() => parseCodeCsv('unit,doorCode,accessCode,keyCode\n11,"unfinished,,'));
  assert.throws(() => parseCodeCsv('unit,doorCode,accessCode,keyCode\n11,"line\nbreak",,'));
  assert.deepEqual(parseCodeCsv('unit,doorCode\n11,1234'), [{ number: "11", doorCode: "1234", accessCode: "", keyCode: "" }]);
  assert.equal(accessCodeValues.safeParse({ doorCode: "a".repeat(61), accessCode: "", keyCode: "" }).success, false);
});

test("key tag imports accept standalone and reordered columns while preserving identifiers", () => {
  assert.deepEqual(parseCodeCsv('Key Tag,Unit\n001-A,011'), [{ number: "011", doorCode: "", accessCode: "", keyCode: "", keyTag: "001-A" }]);
  assert.deepEqual(parseCodeCsv('unit\tkey_tag\n011\t0002'), [{ number: "011", doorCode: "", accessCode: "", keyCode: "", keyTag: "0002" }]);
  assert.throws(() => parseCodeCsv('unit,keyTag,Key Tag\n011,A,B'));
  assert.throws(() => parseCodeCsv('unit,typo\n011,A'));
  assert.throws(() => parseCodeCsv('unit,keyTag\n011,' + 'A'.repeat(61)));
  assert.throws(() => parseCodeCsv('unit,keyTag\n011,A,extra'));
  assert.equal(accessCodeValues.parse({ doorCode: "", accessCode: "", keyCode: "" }).keyTag, undefined);
});

test("creating a tag-only record does not clear resident report codes", async () => {
  let saved: any;
  await syncUnitCodes({ unitAccessCode: {
    findUnique: async () => null,
    upsert: async (args: any) => { saved = args.create; return { doorCode: "", accessCode: "", ...saved }; },
  } } as any, "unit", { doorCode: "", accessCode: "", keyCode: "", keyTag: "001-A" });
  assert.equal(saved.keyTag, "001-A");
});

test("code lookup and transfer reject excluded roles and cross-property users before reading data", async () => {
  process.env.ADMIN_USERNAME = "code-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { default: Fastify } = await import("fastify");
  const { accessCodeRoutes } = await import("../routes/accessCodes.js");
  const { canUpdateMakeReadyField, assignableStaffRoles } = await import("./auth.js");
  const painter = { role: "PAINTER" } as any;
  assert.equal(canUpdateMakeReadyField(painter, "paintStatus"), true);
  for (const field of ["makeReadyStatus", "completionStatus", "cleaningStatus", "assignedTech"]) assert.equal(canUpdateMakeReadyField(painter, field), false);
  assert.ok(assignableStaffRoles.includes("PAINTER"));
  const app = Fastify(); let role = "VIEWER"; let token = false;
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "u", role, keycodeAccess: true, propertyAccess: [] } as any; request.authType = token ? "apiToken" : "session"; });
  await app.register(accessCodeRoutes);
  try {
    for (const value of ["VIEWER", "CLEANER", "TECH", "LEASING", "PAINTER", "MANAGER", "ADMIN"]) {
      role = value; token = value === "ADMIN";
      for (const [method, suffix] of [["GET", ""], ["GET", "/units/u"], ["PUT", "/units/u"], ["POST", "/import"], ["POST", "/export"]] as const) {
        const response = await app.inject({ method, url: `/access-codes/outside${suffix}` });
        assert.equal(response.statusCode, 403, response.body);
      }
    }
  } finally { await app.close(); }
});
