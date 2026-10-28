import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByTestId("property-filter").selectOption({ label: "DG · Demo Gardens" });
}
async function openTab(page: Page, name: string) {
  const toggle = page.getByTestId("mobile-views-toggle");
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("tab", { name, exact: true }).click();
}
test.beforeEach(() => {
  test.skip(!process.env.COMPOSE_PROJECT_NAME?.startsWith("makereadyos-e2e-"), "Disposable demo environment required");
});

test("assigned turn can be rescheduled from the calendar and exported as a picture", async ({ page }, info) => {
  test.setTimeout(90000);
  await signIn(page);
  await page.getByRole("button", { name: "Open details for DG-101", exact: true }).click();
  await page.getByRole("button", { name: "All details", exact: true }).click();
  await page.getByTestId("drawer-field-assignedTech").selectOption("Demo Tech");
  const date = new Date();
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const finish = page.getByLabel("Expected Finish", { exact: true });
  await finish.fill(`${month}-20`);
  await finish.press("Tab");
  await expect(finish).toBeEnabled();
  await page.getByTestId("item-drawer-close").click();
  await openTab(page, "Assigned Work");
  const assigned = page.getByTestId("assigned-work-panel");
  await assigned.getByTestId("assigned-work-staff").selectOption({ label: "Demo Tech / TECH" });
  await expect(assigned).toContainText("DG-101");
  await openTab(page, "Schedule");
  const calendar = page.getByTestId("calendar-view");
  await calendar.getByTestId("calendar-layout-select").selectOption("single");
  await calendar.getByTestId("calendar-panel-track-0").selectOption({ label: "Expected Finish" });
  await calendar.getByRole("button", { name: "Open details for DG DG-101", exact: true }).click();
  await page.getByRole("button", { name: "All details", exact: true }).click();
  await expect(finish).toHaveValue(`${month}-20`);
  await finish.fill(`${month}-21`);
  await finish.press("Tab");
  await expect(finish).toBeEnabled();
  await page.getByTestId("item-drawer-close").click();
  const downloadPromise = page.waitForEvent("download");
  await calendar.getByTestId("calendar-export-picture").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await page.reload();
  await calendar.getByTestId("calendar-layout-select").selectOption("single");
  await calendar.getByTestId("calendar-panel-track-0").selectOption({ label: "Expected Finish" });
  await calendar.getByRole("button", { name: "Open details for DG DG-101", exact: true }).click();
  await page.getByRole("button", { name: "All details", exact: true }).click();
  await expect(finish).toHaveValue(`${month}-21`);
  await info.attach("calendar-export", { body: bytes, contentType: "image/png" });
});

test("on-call person removal requires confirmation and can be undone before saving", async ({ page, context }, info) => {
  test.setTimeout(90000);
  const name = `Demo relief ${info.project.name}`;
  await signIn(page);
  await page.getByRole("button", { name: "On-call", exact: true }).click();
  const panel = page.getByTestId("on-call-panel");
  await panel.getByRole("button", { name: "Manage on-call", exact: true }).click();
  await panel.getByRole("button", { name: "Add person", exact: true }).click();
  const people = panel.locator('[data-testid^="on-call-person-"]');
  await people.last().getByRole("textbox", { name: "Name", exact: true }).fill(name);
  const person = people.filter({ has: page.getByRole("button", { name: `Remove ${name}`, exact: true }) });
  await context.setOffline(true);
  try {
    await panel.getByRole("button", { name: "Save on-call", exact: true }).click();
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(person.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
  } finally { await context.setOffline(false); }
  await panel.getByRole("button", { name: "Save on-call", exact: true }).click();
  await expect(panel).toContainText("On-call saved.");
  page.once("dialog", dialog => dialog.dismiss());
  await person.getByRole("button", { name: `Remove ${name}`, exact: true }).click();
  await expect(person).toBeVisible();
  page.once("dialog", dialog => dialog.accept(name));
  await person.getByRole("button", { name: `Remove ${name}`, exact: true }).click();
  await expect(person).toHaveCount(0);
  await panel.getByRole("button", { name: `Undo removal of ${name}`, exact: true }).click();
  await expect(person).toBeVisible();
  await panel.getByRole("button", { name: "Save on-call", exact: true }).click();
  await expect(panel).toContainText("On-call saved.");
  await page.reload();
  await panel.getByRole("button", { name: "Manage on-call", exact: true }).click();
  await expect(person.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
});
