import { expect, test } from "@playwright/test";

test("all-units setup keeps outgoing residents separate from incoming applicants", async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  const { property } = await post("/operations/properties", { code: `RN${Date.now()}`, name: "Resident import demo" });
  await page.reload();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  if (await page.getByTestId("mobile-views-toggle").isVisible()) await page.getByTestId("mobile-views-toggle").click();
  await page.getByTestId("tab-operations").click();
  await page.getByTestId("availability-import-property").selectOption(property.id);
  await page.getByTestId("unit-directory-import").locator("summary").click();
  await page.getByTestId("unit-import-csv").fill("unit,occupancyStatus,Resident Name,Move In Date\nR-101,OCCUPIED,Alex Demo,2024-03-15\nR-102,OCCUPIED,Casey Example,2023-06-01");
  await expect(page.getByTestId("unit-directory-import").locator(".helper-list")).toContainText("Alex Demo");
  const imported = page.waitForResponse(response => response.url().includes("/operations/units/import") && response.request().method() === "POST");
  page.once("dialog", dialog => dialog.accept());
  await page.getByTestId("unit-import-submit").click();
  expect((await imported).status()).toBe(200);

  await page.getByTestId("availability-import-csv").fill("unit,vacancyStatus,Resident Name,Preleased Name,moveOutDate,moveInDate\nR-101,NTV LEASED,Alex Demo,Jordan Sample,2030-10-01,2030-10-07\nR-102,OCCUPIED,Casey Example,,,");
  const availability = page.waitForResponse(response => response.url().includes("/operations/availability/import") && response.request().method() === "POST");
  page.once("dialog", dialog => dialog.accept());
  await page.getByTestId("availability-import-submit").click();
  const result = await (await availability).json();
  expect(result.summary.turnsCreated).toBe(1);
  const itemId = result.createdItemIds[0];
  const getItem = async () => (await page.request.get(`/api/make-ready-items/${itemId}`)).json();
  expect(await getItem()).toMatchObject({ applicant: "Jordan Sample", outgoingResidentName: "Alex Demo" });

  // An older directory report must not undo the newer availability status.
  await page.getByTestId("unit-import-csv").fill("unit,occupancyStatus,Resident Name,Move In Date,building\nR-101,OCCUPIED,Alex Demo,2024-03-15,North");
  await expect(page.getByTestId("unit-import-status-policy")).toContainText("without changing existing units'");
  await expect(page.getByTestId("unit-import-preview")).toContainText("NTV leased");
  const refreshed = page.waitForResponse(response => response.url().includes("/operations/units/import") && response.request().method() === "POST");
  page.once("dialog", dialog => dialog.accept());
  await page.getByTestId("unit-import-submit").click();
  expect((await refreshed).status()).toBe(200);
  expect(await getItem()).toMatchObject({
    vacancyStatus: "NTV LEASED", applicant: "Jordan Sample",
    moveOutDate: "2030-10-01T00:00:00.000Z", moveInDate: "2030-10-07T00:00:00.000Z",
    unit: { occupancyStatus: "NTV LEASED", building: "North", currentResidentName: "Alex Demo" },
  });

  // Blank cells and omitted units in a partial report must not erase names.
  await post("/operations/units/import", { propertyId: property.id, units: [{ number: "R-101", currentResidentName: " ", currentResidentMoveInDate: "" }] });
  await post("/operations/availability/import", { propertyId: property.id, rows: [{ number: "R-101", vacancyStatus: "NTV LEASED", applicant: "", currentResidentName: null }] });
  expect(await getItem()).toMatchObject({ applicant: "Jordan Sample", outgoingResidentName: "Alex Demo" });
  expect((await getItem()).unit.currentResidentMoveInDate).toBe("2024-03-15T00:00:00.000Z");
  await page.reload();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  await page.getByTestId("property-filter").selectOption(property.id);
  if (await page.getByTestId("mobile-views-toggle").isVisible()) await page.getByTestId("mobile-views-toggle").click();
  await page.getByTestId("tab-table").click();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.getByTestId("mobile-board-list")).toContainText("Outgoing resident: Alex Demo");
  await expect(page.getByTestId("mobile-board-list")).toContainText("Incoming applicant: Jordan Sample");
  await page.getByRole("combobox", { name: "Show units", exact: true }).selectOption("occupied");
  await expect(page.getByTestId("mobile-board-list")).toContainText("Occupant: Casey Example");
  await expect(page.getByTestId("mobile-board-list")).toContainText("2024");
  await expect(page.getByTestId("mobile-board-list")).not.toContainText("2030");
  await page.getByTestId("mobile-board-list").screenshot({ path: testInfo.outputPath("occupied-residents-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByTestId("board-column-header-applicant").first()).toContainText("Occupant");
  await expect(page.locator(".board-group").filter({ hasText: "R-102" }).first()).toContainText("2023");
  await expect(page.locator(".board-group").filter({ hasText: "R-102" }).first()).toContainText("Casey Example");
  await page.locator(".board-group").filter({ hasText: "R-102" }).first().screenshot({ path: testInfo.outputPath("occupied-residents-desktop.png") });
});
