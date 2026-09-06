import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("refrigerant exports include every transaction and heterogeneous section column", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "report-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { refrigerantRoutes, refrigerantTransactionSchema, refrigerantCylinderSchema } = await import("./refrigerant.js");
  for (const invalid of [null, undefined, "", "   ", true, false, "bad", Infinity, -1]) {
    assert.equal(refrigerantTransactionSchema.safeParse({ refrigerantTypeId: "type", startWeight: invalid, endWeight: 0 }).success, false, `Invalid reading must not become zero: ${String(invalid)}`);
    assert.equal(refrigerantCylinderSchema.safeParse({ identifier: "test", refrigerantTypeId: "type", category: "VIRGIN", tankSize: 25, currentWeight: invalid }).success, false);
  }
  assert.equal(refrigerantTransactionSchema.parse({ refrigerantTypeId: "type", startWeight: " 25.5 ", endWeight: 0 }).startWeight, 25.5);
  assert.equal(refrigerantCylinderSchema.parse({ identifier: "test", refrigerantTypeId: "type", category: "VIRGIN", tankSize: 25, currentWeight: 0, tareWeight: null }).tareWeight, null);
  const { default: Fastify } = await import("fastify");
  const type = { id: "type", name: "R410A" };
  const tanks = ["VIRGIN", "CLEAN_RECOVERY", "DIRTY_RECOVERY"].map((category, index) => ({
    id: `tank-${index}`, identifier: `Tank-${category}`, refrigerantTypeId: type.id, category, status: index === 2 ? "ARCHIVED" : "ACTIVE",
    tankSize: 25, currentWeight: 10, tareWeight: 5, waterCapacity: 30, finalRecoveryCompleted: false,
    notes: "=test\twith\nnewlines", dispositionNotes: "Sent to reclaim vendor", archivedAt: index === 2 ? new Date("2026-08-01") : null, refrigerantType: type,
  }));
  tanks.push({ ...tanks[0], id: "full", identifier: "Full-virgin", currentWeight: 28, tareWeight: 3 });
  tanks.push({ ...tanks[0], id: "low", identifier: "Low-virgin", currentWeight: 7, tareWeight: 3 });
  const transactions = Array.from({ length: 1005 }, (_, index) => ({
    id: `tx-${index}`, propertyId: index % 2 ? "ta" : "vab", unitNumber: `UNIT-${index}`,
    occurredAt: new Date("2026-09-01T12:00:00Z"),
    transactionType: ["VIRGIN_CHARGE", "CLEAN_RECOVERY", "DIRTY_RECOVERY", "FINAL_RECOVERY"][index % 4],
    refrigerantType: type, sourceCylinder: tanks[0], recoveryCylinder: tanks[2],
    startWeight: 20, endWeight: 19, amount: index === 1004 ? -1 : 1, createdByName: "Tech", notes: "Report fixture",
  }));
  const properties = [{ id: "ta", code: "TA", name: "Test A" }, { id: "vab", code: "VAB", name: "Test B" }];
  const stub = (delegate: any, method: string, implementation: (...args: any[]) => unknown) => {
    const original = delegate[method];
    delegate[method] = implementation;
    t.after(() => { delegate[method] = original; });
  };
  stub(prisma.refrigerantCylinder, "findMany", async (args: any) => tanks.filter(tank => !args?.where?.category || args.where.category.in.includes(tank.category)));
  stub(prisma.refrigerantCylinder, "findUnique", async (args: any) => tanks.find(tank => tank.id === args.where.id));
  stub(prisma.refrigerantTransaction, "findMany", async (args: any) => {
    const rows = transactions.filter(row => !args?.where?.propertyId || args.where.propertyId.in.includes(row.propertyId));
    return args.take ? rows.slice(0, args.take) : rows;
  });
  const flags = [{ id: "dismissed", propertyId: "ta", unitNumber: "OLD-FLAG-UNIT", status: "DISMISSED", level: "POTENTIAL_REFRIGERANT_LEAK", reason: "Old concern", refrigerantType: type, lastDetectedAt: new Date("2026-08-01"), dismissedAt: new Date("2026-08-02"), dismissalNotes: "Inspected and resolved" }];
  stub(prisma.refrigerantLeakFlag, "findMany", async (args: any) => flags.filter(flag => (!args.where.status || flag.status === args.where.status) && (!args.where.propertyId || args.where.propertyId.in.includes(flag.propertyId))));
  const legacyLogs = [{ propertyId: "ta", systemUnit: "LEGACY-UNIT", refrigerantType: "R22", cylinderSerialNumber: "OLD-SERIAL", startingWeight: null, amountAdded: 2, amountRecovered: null, currentBalance: null, tech: "Legacy tech", loggedAt: new Date("2025-01-01"), notes: "Imported old log" }];
  stub(prisma.refrigerantLog, "findMany", async (args: any) => legacyLogs.filter(entry => !args.where.propertyId || args.where.propertyId.in.includes(entry.propertyId)));
  stub(prisma.refrigerantType, "findMany", async () => [type]);
  stub(prisma.property, "findMany", async () => properties);
  stub(prisma.property, "findUnique", async (args: any) => properties.find(property => property.id === args.where.id));
  stub(prisma.unit, "findUnique", async (args: any) => args.where.id === "unit-ta" ? { propertyId: "ta", number: "101" } : args.where.id === "unit-vab" ? { propertyId: "vab", number: "201" } : null);
  const recorded: Array<Record<string, unknown>> = [];
  stub(prisma, "$transaction", async (callback: any) => callback({
    refrigerantCylinder: { update: async () => ({}) },
    refrigerantTransaction: { create: async ({ data }: any) => {
      recorded.push(data);
      return { ...data, id: "created", refrigerantType: type };
    } },
  }));
  stub(prisma.auditLog, "create", async () => ({}));
  let currentUser: any = { id: "admin", fullName: "Test admin", role: "ADMIN", propertyAccess: [] };
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async (request) => { request.currentUser = currentUser; });
  await app.register(refrigerantRoutes);
  try {
    const reading = { refrigerantTypeId: type.id, startWeight: 10, endWeight: 11 };
    const unitRecovery = { ...reading, recoveryCylinderId: "tank-1" };
    for (const [fields, status] of [
      [{ unitId: "missing" }, 404],
      [{ propertyId: "missing" }, 404],
      [{ propertyId: "vab", unitId: "unit-ta" }, 400],
    ] as const) {
      const rejected = await app.inject({ method: "POST", url: "/refrigerant/transactions/recovery", payload: { ...unitRecovery, ...fields } });
      assert.equal(rejected.statusCode, status, rejected.body);
      assert.equal(recorded.length, 0);
    }
    currentUser = { ...currentUser, role: "TECH", propertyAccess: [{ propertyId: "ta" }] };
    const deniedUnit = await app.inject({ method: "POST", url: "/refrigerant/transactions/recovery", payload: { ...unitRecovery, unitId: "unit-vab" } });
    assert.equal(deniedUnit.statusCode, 403, deniedUnit.body);
    assert.equal(recorded.length, 0);
    const canonicalUnit = await app.inject({ method: "POST", url: "/refrigerant/transactions/recovery", payload: { ...unitRecovery, unitId: "unit-ta", unitNumber: "wrong number" } });
    assert.equal(canonicalUnit.statusCode, 201, canonicalUnit.body);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].propertyId, "ta");
    assert.equal(recorded[0].unitNumber, "101");
    currentUser = { ...currentUser, role: "ADMIN" };
    for (const [url, payload] of [
      ["recovery", { ...reading, recoveryCylinderId: "tank-0" }],
      ["recovery", { ...reading, recoveryCylinderId: "tank-2", recoveryType: "DIRTY" }],
      ["recovery", { ...reading, recoveryCylinderId: "tank-1", recoveryType: "DIRTY" }],
      ["recovery", { ...reading, recoveryCylinderId: "tank-1", refrigerantTypeId: "other-type" }],
      ["recovery", { ...reading, recoveryCylinderId: "tank-1", sourceCylinderId: "tank-0" }],
      ["charge", { ...reading, endWeight: 9, sourceCylinderId: "tank-0", recoveryCylinderId: "tank-1" }],
      ["final-recovery", { ...reading, endWeight: 9, sourceCylinderId: "tank-0", recoveryCylinderId: "tank-0" }],
    ] as const) {
      const rejected = await app.inject({ method: "POST", url: `/refrigerant/transactions/${url}`, payload });
      assert.equal(rejected.statusCode, 400, `${url}: ${rejected.body}`);
    }
    for (const format of ["export.csv", "export.xls", "report.html"]) {
      const response = await app.inject(`/refrigerant/${format}?report=fullAudit`);
      assert.equal(response.statusCode, 200, response.body);
      assert.ok(response.body.includes("UNIT-1004"), "oldest transaction must not be truncated");
      assert.ok(response.body.includes("1005"), "summary must include all transactions");
      assert.ok(response.body.includes("Tank-DIRTY_RECOVERY"), "archived dirty inventory must be included");
      assert.ok(response.body.includes("Sent to reclaim vendor"), "disposition must be included");
      assert.ok(response.body.includes("LEGACY-UNIT") && response.body.includes("OLD-SERIAL"), "legacy logs must be included separately");
      assert.ok(response.body.includes("Inspected and resolved"), "dismissed flags must retain their resolution notes");
      assert.ok(response.body.includes("WEIGHT_ERROR"), "compliance must inspect transactions past 1000");
      assert.ok(response.body.includes("Test A") && response.body.includes("Test B"), "property labels must resolve");
      if (format === "export.csv") {
        const header = response.body.split("\n")[0];
        for (const key of ["totalTransactions", "identifier", "unitNumber", "amount", "property", "message"]) assert.ok(header.includes(key), `Missing column ${key}`);
        assert.ok(response.body.includes("'=test"), "spreadsheet formulas must be escaped");
      }
      if (format === "export.xls") assert.ok(response.body.includes('"\'=test\twith\nnewlines"'), "tabs and newlines must be quoted");
    }
    const scoped = await app.inject("/refrigerant/export.csv?report=fullAudit&propertyId=ta");
    if (process.env.PDF_TEST_CHROMIUM_PATH) {
      const previousChromium = process.env.CHROMIUM_PATH;
      process.env.CHROMIUM_PATH = process.env.PDF_TEST_CHROMIUM_PATH;
      const directory = await mkdtemp(join(tmpdir(), "mros-full-audit-"));
      try {
        const pdf = await app.inject("/refrigerant/report.pdf?report=fullAudit");
        assert.equal(pdf.statusCode, 200, pdf.statusMessage);
        assert.equal(pdf.rawPayload.subarray(0, 5).toString(), "%PDF-");
        const path = join(directory, "full-audit.pdf");
        await writeFile(path, pdf.rawPayload);
        if (process.env.PDF_TEST_OUTPUT) await writeFile(process.env.PDF_TEST_OUTPUT, pdf.rawPayload);
        const text = execFileSync("pdftotext", ["-raw", path, "-"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).replace(/\s+/g, "");
        for (const value of ["UNIT-1004", "1005", "Tank-DIRTY_RECOVERY", "LEGACY-UNIT", "WEIGHT_ERROR"]) {
          assert.ok(text.includes(value), `Full PDF missing ${value}`);
        }
        const info = execFileSync("pdfinfo", [path], { encoding: "utf8" });
        assert.match(info, /Page size:\s+792 x 612 pts/, "Full audit must use landscape Letter paper");
      } finally {
        if (previousChromium === undefined) delete process.env.CHROMIUM_PATH;
        else process.env.CHROMIUM_PATH = previousChromium;
        await rm(directory, { recursive: true, force: true });
      }
    }
    assert.equal(scoped.statusCode, 200, scoped.body);
    assert.ok(scoped.body.includes("UNIT-1003"));
    assert.ok(!scoped.body.includes("UNIT-1004"), "other-property transactions must be excluded");
    const compliance = await app.inject("/refrigerant/export.csv?report=compliance");
    assert.equal(compliance.statusCode, 200);
    assert.ok(compliance.body.includes("WEIGHT_ERROR"));
    assert.ok(!compliance.body.includes("Old concern"), "dismissed flags must not become current compliance issues");
    const overview = await app.inject("/refrigerant/overview");
    assert.equal(overview.statusCode, 200, overview.body);
    const lowWarnings = overview.json().complianceIssues.filter((issue: any) => issue.type === "VIRGIN_TANK_LOW");
    assert.ok(lowWarnings.some((issue: any) => issue.cylinderId === "low" && issue.message.includes("4.00 lb")));
    assert.ok(!lowWarnings.some((issue: any) => issue.cylinderId === "full"), "a full virgin tank must not be flagged low");
    const inventory = await app.inject("/refrigerant/cylinders?includeArchived=true");
    assert.equal(inventory.statusCode, 200, inventory.body);
    const reportedTanks = inventory.json().cylinders;
    assert.equal(reportedTanks.find((tank: any) => tank.id === "full").remainingCapacity, 25);
    assert.equal(reportedTanks.find((tank: any) => tank.id === "low").remainingCapacity, 4);
    assert.equal(reportedTanks.find((tank: any) => tank.id === "tank-1").remainingCapacity, 19, "recovery capacity still means available space");
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
});
