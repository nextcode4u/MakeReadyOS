import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("production PWA clears private offline data when signing out", async ({ page, context }) => {
  test.skip(process.env.E2E_PRODUCTION !== "1", "Requires the production service worker");
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("board-table-view")).toBeVisible();
  await page.evaluate(async () => {
    const response = await fetch("/api/meta", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("Could not cache authenticated metadata");
  });
  await expect.poll(() => page.evaluate(async () => {
    const cache = await caches.open("makereadyos-api-v2");
    return Boolean(await cache.match("/api/meta"));
  })).toBe(true);
  await page.getByTestId("account-menu").click();
  await page.getByTestId("logout-button").click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const names = (await caches.keys()).filter(name => name.startsWith("makereadyos-api-"));
    const sizes = await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).length));
    return sizes.reduce((sum, size) => sum + size, 0);
  })).toBe(0);
  await context.setOffline(true);
  expect(await page.evaluate(async () => {
    try { return (await fetch("/api/meta")).ok; } catch { return false; }
  })).toBe(false);
});
