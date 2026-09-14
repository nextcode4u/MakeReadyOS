import { expect, test } from "@playwright/test";

test("resident codes keep an unsaved draft on transient refresh but hide it after access denial", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  await page.getByRole("button", { name: /^Open details for / }).first().click();
  const panel = page.getByTestId("resident-codes-panel");
  const input = panel.getByLabel("New resident door code", { exact: true });
  await input.fill("FICTIONAL-UNSAVED-CODE");
  await panel.getByRole("button", { name: "Show codes", exact: true }).click();
  let status = 503;
  let requests = 0;
  await page.route("**/api/make-ready-items/*/resident-codes", async route => {
    expect(route.request().method()).toBe("GET");
    requests++;
    await route.fulfill({ status, json: { message: "Injected access/refresh failure" } });
  });
  const reconnect = async () => page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await reconnect();
  await expect.poll(() => requests).toBeGreaterThan(0);
  await expect(panel.getByRole("alert")).toContainText("Could not load resident codes");
  await expect(input).toHaveValue("FICTIONAL-UNSAVED-CODE");
  status = 403;
  await panel.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(input).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Show codes", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Hide codes", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Save resident codes", exact: true })).toHaveCount(0);
});
