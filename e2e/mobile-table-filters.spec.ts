import { expect, test } from "@playwright/test";

test("expanded table filters stay visible without a sideways control strip", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  const panel = page.getByTestId("advanced-filters");
  await expect(panel).toBeVisible();
  if (!await panel.evaluate(element => (element as HTMLDetailsElement).open)) await panel.locator("summary").click();
  const row = panel.locator(".table-filter-row-selects");
  await expect(row.locator("select")).toHaveCount(9);
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => row.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
    const boxes = await row.locator("select").evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    }));
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
      expect(box.width).toBeGreaterThan(120);
    }
    await panel.screenshot({ path: testInfo.outputPath(`filters-${width}.png`) });
  }
});
