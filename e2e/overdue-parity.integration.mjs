import assert from "node:assert/strict";

if (process.env.MROS_INTEGRATION_TEST !== "1") throw new Error("Run only through the isolated test.sh Docker stack.");
const { prisma } = await import("/app/dist/lib/prisma.js");
const { computePropertySnapshot } = await import("/app/dist/lib/analytics.js");
const failures = [];
const check = (label, actual, expected) => {
  try { assert.deepEqual(actual, expected); } catch { failures.push(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`); }
};
const base = "http://127.0.0.1:4000/api";
const headers = { Origin: process.env.APP_URL, "Content-Type": "application/json" };
let property;
try {
  const login = await fetch(`${base}/auth/login`, { method: "POST", headers, body: JSON.stringify({ identifier: process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
  assert.equal(login.status, 200, "isolated test login");
  headers.Cookie = login.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
  headers["x-csrf-token"] = (await login.json()).csrfToken;
  const get = async path => {
    const response = await fetch(`${base}${path}`, { headers });
    assert.equal(response.status, 200, path);
    return response;
  };
  property = await prisma.property.create({ data: { code: `OVERDUE-QA-${Date.now()}`, name: "Live overdue parity" } });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = offset => new Date(today.getTime() + offset * 86400000);
  const create = (unitNumber, extra) => prisma.makeReadyItem.create({ data: {
    propertyId: property.id, unitNumber, itemName: unitNumber, boardGroup: "QA", makeReadyDate: day(-2),
    vacatedDate: day(-5), daysVacant: 999, overdue: false, vacancyStatus: "VACANT", ...extra,
  } });
  await create("LATE", { completionStatus: "NO" });
  await create("UNSET", {});
  await create("INSPECTION", { completionStatus: "YES", vacancyStatus: "VACANT LEASED READY", makeReadyStatus: "FINAL WALK" });
  await create("READY", { vacancyStatus: "VACANT_READY", overdue: true });
  await create("DONE", { completionStatus: "done", overdue: true });
  await create("FUTURE", { makeReadyDate: day(2), overdue: true });
  await create("TODAY", { makeReadyDate: today, overdue: true });
  await create("NO-DATE", { makeReadyDate: null, overdue: true });
  await create("ARCHIVED", { isArchived: true, overdue: true });
  const scope = `propertyId=${property.id}`;
  const expected = ["INSPECTION", "LATE", "UNSET"];
  const names = rows => rows.map(row => row.unitNumber).sort();
  const all = await (await get(`/make-ready-items?${scope}`)).json();
  check("live list flags", names(all.filter(row => row.overdue)), expected);
  check("live vacancy age", [...new Set(all.map(row => row.daysVacant))], [5]);
  const filtered = await get(`/make-ready-items?${scope}&overdueOnly=true`);
  check("filtered list", names(await filtered.json()), expected);
  check("filtered count", filtered.headers.get("x-total-count"), "3");
  for (let offset = 0; offset < 3; offset++) {
    const page = await get(`/make-ready-items?${scope}&overdueOnly=true&sortBy=unitNumber&sortDirection=asc&limit=1&offset=${offset}`);
    check(`page ${offset}`, names(await page.json()), [expected[offset]]);
    check(`page ${offset} count`, page.headers.get("x-total-count"), "3");
    check(`page ${offset} more`, page.headers.get("x-has-more"), String(offset < 2));
  }
  const csv = await (await get(`/export/make-ready.csv?${scope}&overdueOnly=true`)).text();
  const rows = csv.trim().split(/\r?\n/).slice(1).map(line => ({ unitNumber: line.split(",")[2] }));
  check("filtered CSV", names(rows), expected);
  for (const filter of ["", "&overdueOnly=true"]) {
    const html = await (await get(`/export/make-ready.html?${scope}${filter}`)).text();
    check(`HTML overdue${filter}`, html.match(/<strong>(\d+)<\/strong><span>Overdue<\/span>/)?.[1], "3");
  }
  const dashboard = await (await get(`/dashboard?${scope}`)).json();
  check("dashboard overdue", dashboard.kpis.overdue, 3);
  check("dashboard vacancy age", dashboard.kpis.averageDaysVacant, 5);
  const calendar = await (await get(`/calendar?${scope}&field=makeReadyDate`)).json();
  check("calendar flags", names(calendar.filter(row => row.overdue)), expected);
  const analytics = await (await get(`/analytics/summary?${scope}`)).json();
  check("analytics live overdue", analytics.metrics.overdue, 3);
  const snapshot = await computePropertySnapshot(property.id, today);
  check("new snapshot overdue", snapshot.overdue, 3);
  check("new snapshot vacancy age", snapshot.averageDaysVacant, 5);
  assert.deepEqual(failures, [], failures.join("\n"));
  console.log("Live overdue list, pagination, CSV/HTML, dashboard, calendar and analytics parity passed");
} finally {
  if (property) await prisma.property.delete({ where: { id: property.id } });
  if (headers.Cookie) await fetch(`${base}/auth/logout`, { method: "POST", headers });
  await prisma.$disconnect();
}
