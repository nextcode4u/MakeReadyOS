import { expect, test } from "@playwright/test";

test("Alerts stays above unit details and preserves the draft on close", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await page.locator('[data-testid^="item-details-"]').first().click();
  const drawer = page.getByTestId("item-drawer");
  await page.getByTestId("drawer-pane-notes").click();
  const draft = page.getByTestId("comment-input");
  await draft.fill("Unposted test draft");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await draft.focus();
    // A push message can open Alerts even when the mobile drawer covers navigation.
    await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "OPEN_NOTIFICATIONS" } })));
    const alerts = page.getByTestId("notification-drawer");
    await expect(alerts).toBeVisible();
    await expect(alerts).toHaveAttribute("aria-modal", "true");
    expect(await alerts.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + 20));
    })).toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await alerts.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(alerts).toHaveCount(0);
    await expect(drawer).toBeVisible();
    await expect(draft).toHaveValue("Unposted test draft");
    await expect(draft).toBeFocused();
  }
});
