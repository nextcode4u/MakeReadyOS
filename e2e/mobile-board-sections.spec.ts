import { expect, test } from "@playwright/test";

test("mobile board separates Ready and NTV with compact expandable cards", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { "x-csrf-token": session.csrfToken };
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const { property } = await post("/operations/properties", { code: `MB${Date.now()}`, name: "Mobile board demo" });
  const meta = await (await page.request.get("/api/meta")).json();
  for (const [number, sectionType, vacancyStatus] of [
    ["MB-1", "READY", "VACANT NOT LEASED READY"],
    ["MB-2", "MAKE_READY", "NTV NOT LEASED"],
    ["MB-3", "MAKE_READY", "VACANT NOT LEASED NOT READY"],
  ]) {
    const { unit } = await post("/operations/units", { propertyId: property.id, number });
    const section = meta.boardSections.find((entry: any) => entry.propertyId === property.id && entry.sectionType === sectionType);
    await post("/make-ready-items", { propertyId: property.id, unitId: unit.id, boardGroup: section.key, itemName: number, unitNumber: number, vacancyStatus, moveOutDate: "2030-10-01", makeReadyStatus: "NOT STARTED" });
  }
  await post("/operations/units", { propertyId: property.id, number: "MB-OCCUPIED", occupancyStatus: "OCCUPIED" });
  await page.reload();
  await page.getByTestId("property-filter").selectOption(property.id);
  const scope = page.getByRole("combobox", { name: "Show units", exact: true });
  await expect(scope).toBeVisible();
  await expect(page.getByTestId("mobile-tools-toggle")).toHaveAttribute("aria-expanded", "false");
  await scope.selectOption("occupied");
  await expect(scope).toHaveValue("occupied");
  await expect(page.getByTestId("mobile-board-list")).toContainText("MB-OCCUPIED");
  await expect(page.getByTestId("mobile-details-mb-1")).toBeHidden();
  await page.locator(".mobile-filterbar").screenshot({ path: testInfo.outputPath("occupied-filter-mobile.png") });
  await scope.selectOption("active");
  await page.getByTestId("mobile-tools-toggle").click();
  await expect(page.getByTestId("top-archive-mode")).toHaveCount(1);
  await page.getByTestId("mobile-tools-toggle").click();
  const list = page.getByTestId("mobile-board-list");
  const ready = list.locator('.mobile-board-section[data-tone="READY"]');
  const ntv = list.locator('.mobile-board-section[data-tone="NTV"]');
  await expect(ready.locator("article")).toHaveCount(1);
  await expect(ntv.locator("article")).toHaveCount(1);
  await expect(ntv.locator("summary").first()).toContainText("Notice to vacate");
  await expect(ntv).toContainText("Expected vacate");
  await expect(ntv.getByTestId("mobile-details-mb-2")).toBeVisible();
  await expect(ntv.getByTestId("mobile-pest-status-mb-2")).toBeHidden();
  const compactHeight = (await ntv.locator("article").boundingBox())!.height;
  await ntv.getByText("More status", { exact: true }).click();
  await expect(ntv.getByTestId("mobile-pest-status-mb-2")).toBeVisible();
  expect((await ntv.locator("article").boundingBox())!.height).toBeGreaterThan(compactHeight + 100);
  await ntv.getByText("More status", { exact: true }).click();
  await ntv.getByTestId("mobile-select-mb-2").check();
  await ntv.locator("summary").first().click();
  await expect(ntv.getByTestId("mobile-details-mb-2")).toBeHidden();
  await expect(page.getByTestId("mobile-board-bulk-open")).toContainText("(1)");
  await ntv.locator("summary").first().click();
  await expect(ntv.getByTestId("mobile-select-mb-2")).toBeChecked();
  for (const width of [375, 430]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await list.screenshot({ path: testInfo.outputPath(`mobile-sections-${width}.png`) });
  }
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(list).toBeHidden();
    await expect(page.locator(".board-group").filter({ hasText: "MB-1" }).first()).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route("**/api/auth/me", async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, user: { ...body.user, language: "es" } } });
  });
  await page.reload();
  await page.getByTestId("property-filter").selectOption(property.id);
  await expect(page.getByRole("combobox", { name: "Mostrar unidades", exact: true })).toBeVisible();
  await expect(ntv.locator("summary").first()).toContainText("Aviso de salida");
  await expect(ntv).toContainText("Salida prevista");
  await expect(ntv.getByText("Más estados", { exact: true })).toBeVisible();
});
