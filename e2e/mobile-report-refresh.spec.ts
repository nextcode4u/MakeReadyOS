import { expect, test } from "@playwright/test";

test("report editor retains unsaved inspection input during reconnect refresh", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  const items = await (await page.request.get("/api/make-ready-items")).json();
  const item = items.find((entry: any) => entry.unitNumber === "284") ?? items[0];
  await page.getByTestId("property-filter").selectOption(item.propertyId);
  await page.getByRole("button", { name: `Open details for ${item.unitNumber}`, exact: true }).click();
  await page.getByRole("button", { name: "Inspection details / report", exact: true }).click();
  const editor = page.getByTestId("final-report-editor");
  await editor.getByTestId("final-report-date").fill("2026-09-13");
  const followUp = editor.getByRole("textbox", { name: "Internal follow-up for technician", exact: true });
  await followUp.fill("Unsent inspection observation");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let attempts = 0;
  await page.route(`**/api/final-walk-reports/${item.propertyId}?*`, async route => {
    attempts++;
    await held;
    await route.fulfill({ status: 503, json: { message: "Injected report refresh failure" } });
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => attempts).toBeGreaterThan(0);
    await expect(editor.getByTestId("final-report-date")).toHaveValue("2026-09-13");
    await expect(followUp).toHaveValue("Unsent inspection observation");
  } finally { release(); }
  await expect(editor.getByTestId("report-refresh-warning")).toBeVisible({ timeout: 20000 });
  await expect(followUp).toHaveValue("Unsent inspection observation");
  await page.unroute(`**/api/final-walk-reports/${item.propertyId}?*`);
  await editor.getByRole("button", { name: "Retry report refresh", exact: true }).click();
  await expect(editor.getByTestId("report-refresh-warning")).toHaveCount(0);
  await expect(followUp).toHaveValue("Unsent inspection observation");
  const saved = await (await page.request.get(`/api/final-walk-reports/${item.propertyId}?itemId=${item.id}`)).json();
  expect(saved.draft.value.technicianFollowUp).not.toBe("Unsent inspection observation");
  await page.route(`**/api/final-walk-reports/${item.propertyId}?*`, route => route.fulfill({ status: 403, json: { message: "Inspection access revoked" } }));
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(editor.getByTestId("final-report-date")).toHaveCount(0, { timeout: 20000 });
  await expect(editor.getByText("Could not load report settings.", { exact: false })).toBeVisible();
});
