import { expect, test } from "@playwright/test";

test("upcoming My Work shows move-in and the calendar-day work window", async ({ page }, info) => {
  test.skip(!process.env.COMPOSE_PROJECT_NAME?.startsWith("makereadyos-e2e-"), "Disposable demo environment required");
  const unit = info.project.name === "user-mobile" ? "WINDOW-M" : "WINDOW-D";
  const tab = async (name: string) => {
    if (await page.getByTestId("mobile-views-toggle").isVisible()) await page.getByTestId("mobile-views-toggle").click();
    if (name === "My Work") await page.getByTestId("tab-my-work").click();
    else await page.getByRole("tab", { name, exact: true }).click();
  };
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByTestId("property-filter").selectOption({ label: "DG · Demo Gardens" });
  await tab("Availability & Units");
  await page.getByTestId("availability-import-csv").fill(`unit,vacancyStatus,moveOutDate,moveInDate\n${unit},NTV LEASED,2099-01-05,2099-01-09`);
  page.once("dialog", dialog => dialog.accept());
  await page.getByTestId("availability-import-submit").click();
  await expect(page.getByTestId("availability-import-last-import")).toContainText("1 turns created");
  await tab("Table");
  await page.getByRole("textbox", { name: "Search board items", exact: true }).fill(unit);
  await page.getByTestId(`${info.project.name === "user-mobile" ? "mobile" : "item"}-details-${unit.toLowerCase()}`).click();
  await page.getByTestId("drawer-pane-all").click();
  await page.getByTestId("drawer-field-assignedTech").selectOption("Default Admin");
  await expect(page.getByTestId("drawer-field-assignedTech")).toBeEnabled();
  await page.getByTestId("item-drawer-close").click();
  await tab("My Work");
  const card = page.locator('[data-testid^="my-work-forecast-"]').filter({ hasText: unit });
  await expect(card).toContainText("Move-in: 2099-01-09");
  const start = (await card.innerText()).match(/Expected start: (\d{4}-\d{2}-\d{2})/)![1];
  const days = (Date.parse("2099-01-09") - Date.parse(start)) / 86400000;
  expect(days).toBeGreaterThan(0);
  await expect(card).toContainText(`${days} days between start and move-in`);
  await page.reload();
  await expect(card).toContainText("Move-in: 2099-01-09");
});
