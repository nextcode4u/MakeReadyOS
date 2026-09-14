import { expect, test } from "@playwright/test";

test("availability freshness shows honest receipt coverage and survives failed refresh", async ({ page }) => {
  test.setTimeout(60000);
  await page.clock.install();
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  const meta = await (await page.request.get("/api/meta")).json();
  const [first, second] = meta.properties;
  const real = await page.request.get(`/api/operations/availability/status?propertyId=${first.id}`);
  expect(real.ok(), await real.text()).toBeTruthy();
  expect((await real.json()).properties).toHaveLength(1);
  let unavailable = false;
  let coverage: "PARTIAL" | "FULL" = "PARTIAL";
  let reportDate = "2020-01-01";
  await page.route("**/api/operations/availability/status*", async route => {
    if (unavailable) return route.fulfill({ status: 503, json: { message: "Injected receipt failure" } });
    const id = new URL(route.request().url()).searchParams.get("propertyId");
    const rows = [
      { id: first.id, code: first.code, name: first.name, latestImport: { importedAt: new Date().toISOString(), coverage, reportDate, dateIssue: null } },
      { id: second.id, code: second.code, name: second.name, latestImport: null },
    ];
    await route.fulfill({ json: { properties: rows.filter(row => !id || row.id === id) } });
  });
  await page.getByTestId("property-filter").selectOption(first.id);
  const panel = page.getByTestId("availability-freshness");
  await panel.locator("summary").click();
  await expect(panel).toContainText("Partial import / report date 2020-01-01 (over seven days old)");
  await expect(panel).toContainText("Partial imports do not confirm the remaining units");
  await expect(panel.getByTestId(`availability-freshness-${second.id}`)).toHaveCount(0);
  await page.getByTestId("property-filter").selectOption(second.id);
  await expect(panel).toContainText("No availability import recorded");
  await expect(panel.getByTestId(`availability-freshness-${first.id}`)).toHaveCount(0);
  if (!await panel.evaluate(element => (element as HTMLDetailsElement).open)) await panel.locator("summary").click();
  unavailable = true;
  await page.clock.fastForward(61000);
  await expect(panel.locator("summary")).toContainText("refresh unavailable", { timeout: 20000 });
  await expect(panel.getByRole("alert")).toContainText("Any dates shown may be out of date");
  unavailable = false;
  await panel.getByRole("button", { name: "Retry import history", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  coverage = "FULL";
  reportDate = await page.evaluate(() => {
    const day = new Date();
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  });
  await page.getByTestId("property-filter").selectOption(first.id);
  await expect(panel).toContainText(`Full report / report date ${reportDate}`);
  await expect(panel.locator("summary")).toContainText("0 properties need review");
  await page.getByTestId("mobile-views-toggle").click();
  await page.getByTestId("tab-calendar").click();
  await expect(page.getByTestId("availability-freshness")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId("availability-freshness")).toBeVisible();
});
