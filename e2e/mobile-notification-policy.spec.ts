import { expect, test } from "@playwright/test";

test("need-to-know preset clears routine overrides but preserves important preferences", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  const headers = { "x-csrf-token": (await (await page.request.get("/api/auth/me")).json()).csrfToken };
  const initial = await (await page.request.get("/api/notifications")).json();
  expect(initial.categoryDefaults.STATUS_CHANGE).toBe(false);
  expect(initial.categoryDefaults.MATERIALS_REQUEST).toBe(true);
  const propertyId = initial.properties[0].id;
  for (const [category, enabled, property] of [["STATUS_CHANGE", true, null], ["STATUS_CHANGE", true, propertyId], ["RISK", false, null]] as const) {
    const response = await page.request.patch(`/api/notifications/preferences/${category}`, { headers, data: { enabled, propertyId: property } });
    expect(response.ok()).toBe(true);
  }
  await page.getByTestId("notifications-button").click();
  const drawer = page.getByTestId("notification-drawer");
  await drawer.getByRole("button", { name: "Need-to-know only", exact: true }).click();
  await expect(drawer.getByRole("status")).toContainText("Routine updates muted");
  const result = await (await page.request.get("/api/notifications")).json();
  for (const category of ["STATUS_CHANGE", "CHECKLIST", "BATCH_CHANGE"]) {
    expect(result.preferences.filter((pref: any) => pref.category === category)).toEqual([
      expect.objectContaining({ category, enabled: false, propertyId: null, scopeKey: "GLOBAL" }),
    ]);
  }
  expect(result.preferences.find((pref: any) => pref.category === "RISK").enabled).toBe(false);
  await drawer.getByTestId("notification-preferences").locator("summary").click();
  await expect(drawer.getByLabel("Status changes", { exact: true }).first()).not.toBeChecked();
  await expect(drawer.getByLabel("Parts need ordering", { exact: true }).first()).toBeChecked();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
