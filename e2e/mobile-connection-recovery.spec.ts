import { expect, test } from "@playwright/test";

test("mobile recovers from a stale offline hint and from a real network loss", async ({ page, context }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  const banner = page.getByTestId("connection-banner");
  const healthRoute = "**/api/auth/me?connection-check=*";
  await page.route(healthRoute, route => route.abort());
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    window.dispatchEvent(new Event("offline"));
  });
  await expect(banner).toContainText("You are offline");
  await page.unroute(healthRoute);
  const healthy = page.waitForResponse(response => response.url().includes("connection-check=") && response.ok());
  await page.getByTestId("connection-retry").click();
  await healthy;
  await expect(banner).toBeHidden();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(banner).toContainText("You are offline");
  // Simulate a phone returning without delivering its browser online event.
  await page.evaluate(() => window.addEventListener("online", event => event.stopImmediatePropagation(), { capture: true }));
  await context.setOffline(false);
  const recovered = page.waitForResponse(response => response.url().includes("connection-check=") && response.ok());
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await recovered;
  await expect(banner).toBeHidden();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
});
