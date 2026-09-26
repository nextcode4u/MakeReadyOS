import { expect, test } from "@playwright/test";

test("active filters are labeled beside the filters, not in module navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  const property = page.getByTestId("property-filter");
  const search = page.getByTestId("board-search");
  const clear = page.getByTestId("toolbar-clear-filters");
  await expect(property).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (await clear.count()) await clear.click();
    await expect(clear).toHaveCount(0);
    await property.selectOption({ index: 1 });
    await expect(clear).toHaveText("Clear filters (1)");
    await expect(clear).toHaveAttribute("title", /including the selected property/);
    await search.fill("test unit");
    await expect(clear).toHaveText("Clear filters (2)");
    await expect(clear).toBeInViewport();
    await expect(page.locator(".module-rail .toolbar-clear-filters, .rail-filter-count")).toHaveCount(0);
    await expect(page.locator(".filterbar").getByTestId("toolbar-clear-filters")).toBeVisible();
    await clear.click();
    await expect(property).toHaveValue("");
    await expect(search).toHaveValue("");
    await expect(clear).toHaveCount(0);
  }
});
