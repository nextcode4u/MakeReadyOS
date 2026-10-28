import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByTestId("property-filter").selectOption({ label: "DG · Demo Gardens" });
}

test.beforeEach(() => {
  test.skip(!process.env.COMPOSE_PROJECT_NAME?.startsWith("makereadyos-e2e-"), "Disposable demo environment required");
});

test("pool operator creates a facility and reopens readings with the original note", async ({ page, context }, info) => {
  test.setTimeout(90000);
  const name = `Courtyard pool ${info.project.name}`;
  const note = "Gate latch requires follow-up; supervisor notified.";
  await signIn(page);
  await page.getByRole("button", { name: "Open PoolLogOS", exact: true }).click();
  const panel = page.getByTestId("pool-log-panel");
  await panel.getByTestId("pool-tab-setup").click();
  await panel.getByTestId("pool-facility-name").fill(name);
  await panel.getByTestId("pool-facility-submit").click();
  await expect(panel.getByTestId("pool-facility-name")).toHaveValue("");
  await panel.getByTestId("pool-tab-daily").click();
  const form = panel.getByTestId("pool-daily-form");
  await form.getByRole("combobox", { name: "Pool/spa", exact: true }).selectOption({ label: name });
  await form.getByLabel("Date", { exact: true }).fill("2026-10-20");
  await form.getByTestId("pool-reading-ph").fill("7.4");
  await form.getByTestId("pool-reading-free-chlorine").fill("3");
  await form.getByTestId("pool-safety-0").selectOption("FAIL");
  await form.getByRole("textbox", { name: "Notes", exact: true }).fill(note);
  await form.getByTestId("pool-daily-submit").click();
  await expect(form.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue("");
  await panel.getByTestId("pool-tab-history").click();
  const record = panel.getByTestId("pool-history-row").filter({ hasText: name });
  await expect(record).toContainText("pH 7.4");
  await expect(record).toContainText(note);
  await expect(record).toContainText("Oct 20th");
  await expect(record).toContainText("Failed safety checks");
  await page.reload();
  await panel.getByTestId("pool-tab-history").click();
  await expect(record).toContainText(note);
  await record.scrollIntoViewIfNeeded();
  await info.attach("pool-history", { body: await page.screenshot(), contentType: "image/png" });
  await panel.getByTestId("pool-tab-daily").click();
  await form.getByRole("combobox", { name: "Pool/spa", exact: true }).selectOption({ label: name });
  await form.getByRole("textbox", { name: "Notes", exact: true }).fill("Offline follow-up inspection recorded.");
  await context.setOffline(true);
  try {
    await form.getByTestId("pool-daily-submit").click();
    await expect(panel).toContainText(/pool log item\(s\).*pending sync/i);
  } finally { await context.setOffline(false); }
  await panel.getByTestId("pool-tab-history").click();
  await expect(record.filter({ hasText: "Offline follow-up inspection recorded." })).toHaveCount(1);
});

test("PM required notes explain the blocker and completion appears in history", async ({ page, context }, info) => {
  test.setTimeout(90000);
  const name = `Walkway inspection ${info.project.name}`;
  const note = "Walkway checked; loose debris removed.";
  await signIn(page);
  await page.getByRole("button", { name: "Open Preventive Maintenance", exact: true }).click();
  const panel = page.getByTestId("preventive-maintenance-panel");
  const tabs = panel.locator(".module-tabs");
  await tabs.getByRole("button", { name: "Templates", exact: true }).click();
  const form = panel.getByTestId("pm-template-form");
  await form.getByTestId("pm-template-name").fill(name);
  await form.getByRole("checkbox", { name: "Notes required", exact: true }).check();
  await form.getByTestId("pm-template-submit").click();
  await expect(form.getByTestId("pm-template-name")).toHaveValue("");
  await tabs.getByRole("button", { name: "Tasks", exact: true }).click();
  const card = panel.locator("article.pm-task-card").filter({ hasText: name });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText(/notes/i);
  await card.getByRole("textbox", { name: "Completion notes", exact: true }).fill(note);
  await context.setOffline(true);
  try {
    await card.getByRole("button", { name: "Complete", exact: true }).click();
    await expect(panel).toContainText(/PM task\(s\)\/upload\(s\) pending sync/i);
  } finally { await context.setOffline(false); }
  await tabs.getByRole("button", { name: "History", exact: true }).click();
  const record = panel.locator(".pool-history-row").filter({ hasText: name });
  await expect(record).toContainText(note);
  await page.reload();
  await tabs.getByRole("button", { name: "History", exact: true }).click();
  await expect(record).toContainText(note);
  await record.scrollIntoViewIfNeeded();
  await info.attach("pm-history", { body: await page.screenshot(), contentType: "image/png" });
});
