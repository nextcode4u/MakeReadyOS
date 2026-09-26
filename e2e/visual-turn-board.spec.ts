import { expect, test } from "@playwright/test";

test("turn board has readable module navigation and desktop help", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  const filters = page.getByTestId("advanced-filters");
  await expect(filters).toHaveJSProperty("open", false);
  await filters.locator("summary").click();
  await expect(page.getByTestId("table-filter-property")).toBeVisible();
  await filters.locator("summary").click();
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const boardButton = page.getByRole("button", { name: "MakeReadyOS board", exact: true });
    await expect(boardButton).toBeInViewport();
    expect(await boardButton.evaluate(el => getComputedStyle(el, "::after").content)).toContain("Turn board");
    await page.getByRole("button", { name: "Help finding work on the board", exact: true }).hover();
    await expect(page.getByRole("tooltip")).toContainText("Basic board reduces columns without deleting data");
    await expect(page.getByRole("tooltip")).toBeInViewport();
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`turn-board-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const toggle = page.getByTestId("module-rail-toggle");
  const rail = page.getByRole("complementary", { name: "MakeReadyOS modules" });
  const board = page.getByRole("button", { name: "MakeReadyOS board", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const expandedWidth = (await rail.boundingBox())!.width;
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAccessibleName("Expand navigation labels");
  expect((await rail.boundingBox())!.width).toBeLessThan(expandedWidth);
  expect(await board.evaluate(el => getComputedStyle(el, "::after").display)).toBe("none");
  await expect(board).toHaveAttribute("title", "Turn board");
  await page.screenshot({ path: testInfo.outputPath("turn-board-collapsed.png") });
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.getByTestId("module-rail-property-wiki").click();
  await expect(page.getByTestId("module-rail-property-wiki")).toHaveClass(/active/);
  await board.click();
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(toggle).toBeInViewport();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await board.evaluate(el => getComputedStyle(el, "::after").display)).not.toBe("none");
    await toggle.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
  await toggle.click();
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});
