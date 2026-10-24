import { expect, test } from "@playwright/test";

test("returning to a healthy app stays quiet even with a slow session check", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  let probes = 0;
  await page.route("**/api/auth/me?connection-check=*", async route => {
    probes++;
    await new Promise(resolve => setTimeout(resolve, 7000));
    await route.continue();
  });
  await page.evaluate(() => {
    (window as any).__connectionBannerSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="connection-banner"]')) (window as any).__connectionBannerSeen = true;
    }).observe(document.body, { childList: true, subtree: true });
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => probes).toBe(1);
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) window.dispatchEvent(new Event("focus"));
  });
  await page.waitForResponse(response => response.url().includes("connection-check=") && response.ok());
  expect(probes).toBe(1);
  expect(await page.evaluate(() => (window as any).__connectionBannerSeen)).toBe(false);
  await expect(page.getByTestId("connection-banner")).toHaveCount(0);
});

test("an expired recovery session asks for sign-in rather than looping offline", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  await page.route("**/api/auth/me?connection-check=*", route => route.fulfill({ status: 401, json: { message: "Sign in required" } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("login-submit")).toBeVisible();
  await expect(page.getByTestId("connection-banner")).toHaveCount(0);
});

test("a failed workspace download stays isolated and never forces a reload", async ({ page }) => {
  test.setTimeout(60000);
  await page.route("**/assets/ProjectsPanel-*.js", route => route.abort());
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  await page.evaluate(() => { (window as any).__workspaceSentinel = "retained"; });
  await page.getByTestId("module-rail-projects").click();
  const error = page.getByTestId("workspace-load-error");
  await expect(error).toBeVisible();
  await expect(page.locator("#app-error-notice")).toHaveCount(0);
  await expect(page.getByTestId("property-filter")).toBeVisible();
  page.once("dialog", dialog => dialog.dismiss());
  await error.getByRole("button", { name: "Reload app", exact: true }).click();
  await expect(error).toBeVisible();
  await page.getByRole("button", { name: "MakeReadyOS board", exact: true }).click();
  await expect(error).toHaveCount(0);
  await expect(page.getByTestId("property-filter")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__workspaceSentinel)).toBe("retained");
});

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
