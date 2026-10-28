import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByTestId("property-filter").selectOption({ label: "DG · Demo Gardens" });
}

test("pest request preserves a failed note, schedules follow-up and leaves the active list when closed", async ({ page, context }, info) => {
  test.skip(!process.env.COMPOSE_PROJECT_NAME?.startsWith("makereadyos-e2e-"), "Disposable demo environment required");
  test.setTimeout(90000);
  const area = `Courtyard ${info.project.name}`;
  const note = "Technician found activity near the planter; revisit after treatment.";
  await signIn(page);
  await page.getByRole("button", { name: "Open Pest Control", exact: true }).click();
  const panel = page.getByTestId("pest-control-panel");
  await panel.getByRole("button", { name: "New request", exact: true }).click();
  const form = panel.getByTestId("pest-quick-add-form");
  await form.getByLabel("Area", { exact: true }).fill(area);
  await form.getByLabel("Notes", { exact: true }).fill("Ant activity near the courtyard planter.");
  await form.getByRole("button", { name: "Quick Add Pest Request", exact: true }).click();
  const card = panel.locator('[data-testid^="pest-issue-"]').filter({ hasText: area });
  await expect(card).toBeVisible();
  await card.locator("button[aria-expanded]").click();
  const input = card.getByRole("textbox", { name: "Quick note", exact: true });
  await input.fill(note);
  await context.setOffline(true);
  try {
    await card.getByRole("button", { name: "Add Note", exact: true }).click();
    await expect(input).toHaveValue(note);
    await expect(card.getByRole("alert")).toContainText("You're offline");
    await info.attach("pest-offline-note", { body: await page.screenshot(), contentType: "image/png" });
  } finally { await context.setOffline(false); }
  await card.getByRole("button", { name: "Add Note", exact: true }).click();
  await expect(card.locator(".activity-feed")).toContainText(note);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  await card.getByLabel("Follow up date", { exact: true }).fill(tomorrow.toISOString().slice(0, 10));
  await card.getByRole("button", { name: "Set Follow Up", exact: true }).click();
  await expect(card.locator(".status-pill")).toHaveText("Needs Follow Up");
  await panel.getByRole("button", { name: "Copy active list", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "List for pest control", exact: true })).toHaveValue(new RegExp(area));
  await card.getByLabel("Closing notes", { exact: true }).fill("Treatment complete; no further activity found.");
  await context.setOffline(true);
  try {
    await card.getByRole("button", { name: "Close Without Follow Up", exact: true }).click();
    await expect(card.getByRole("textbox", { name: "Closing notes", exact: true })).toHaveValue("Treatment complete; no further activity found.");
    await expect(card.getByRole("alert")).toContainText("You're offline");
  } finally { await context.setOffline(false); }
  await card.getByRole("button", { name: "Close Without Follow Up", exact: true }).click();
  await expect(card).toHaveCount(0);
  await panel.locator(".module-tabs").getByRole("button", { name: "Archive", exact: true }).click();
  await expect(card).toContainText("Closed");
  await page.reload();
  await panel.locator(".module-tabs").getByRole("button", { name: "Archive", exact: true }).click();
  await expect(card).toBeVisible();
  if (await card.locator("button[aria-expanded]").getAttribute("aria-expanded") === "false") await card.locator("button[aria-expanded]").click();
  await expect(card).toContainText(note);
  await expect(card).toContainText("Treatment complete; no further activity found.");
});

test("lease issue preserves a failed note and separates resolved work from archive", async ({ page, context }, info) => {
  test.skip(!process.env.COMPOSE_PROJECT_NAME?.startsWith("makereadyos-e2e-"), "Disposable demo environment required");
  test.setTimeout(90000);
  const area = `Walkway ${info.project.name}`;
  const note = "Follow-up walkthrough: items remain in the walkway.";
  await signIn(page);
  await page.getByRole("button", { name: "Open Lease Compliance", exact: true }).click();
  const panel = page.getByTestId("lease-compliance-panel");
  await panel.getByLabel("Issue view", { exact: true }).selectOption("active");
  await panel.locator("summary").filter({ hasText: /^Quick Capture$/ }).click();
  const form = panel.getByTestId("lease-quick-capture-form");
  await form.getByTestId("lease-quick-capture-area").fill(area);
  await form.getByTestId("lease-quick-capture-issue-type").selectOption({ label: "Trash On Patio / Porch" });
  await form.getByLabel("Short description", { exact: true }).fill("Discarded boxes obstruct the common walkway.");
  await form.getByRole("button", { name: "Create Issue", exact: true }).click();
  const card = panel.locator('[data-testid^="lease-issue-"]').filter({ hasText: area });
  await expect(card).toBeVisible();
  await card.locator("button[aria-expanded]").click();
  const input = card.getByRole("textbox", { name: "Quick note", exact: true });
  await input.fill(note);
  await context.setOffline(true);
  try {
    await card.getByRole("button", { name: "Add Note", exact: true }).click();
    await expect(input).toHaveValue(note);
    await expect(card.getByRole("alert")).toContainText("You're offline");
    await info.attach("lease-offline-note", { body: await page.screenshot(), contentType: "image/png" });
  } finally { await context.setOffline(false); }
  await card.getByRole("button", { name: "Add Note", exact: true }).click();
  await expect(card.locator(".activity-feed")).toContainText(note);
  await card.getByLabel("Resolution notes", { exact: true }).fill("Boxes removed and walkway confirmed clear.");
  await context.setOffline(true);
  try {
    await card.getByRole("button", { name: "Mark Resolved", exact: true }).last().click();
    await expect(card.getByRole("textbox", { name: "Resolution notes", exact: true })).toHaveValue("Boxes removed and walkway confirmed clear.");
    await expect(card.getByRole("alert")).toContainText("You're offline");
  } finally { await context.setOffline(false); }
  await card.getByRole("button", { name: "Mark Resolved", exact: true }).last().click();
  await expect(card).toHaveCount(0);
  await panel.getByLabel("Issue view", { exact: true }).selectOption("resolved");
  await expect(card).toBeVisible();
  await card.locator("button[aria-expanded]").click();
  await expect(card).toContainText("Boxes removed and walkway confirmed clear.");
  await card.getByRole("button", { name: "Archive", exact: true }).click();
  await panel.getByLabel("Issue view", { exact: true }).selectOption("archive");
  await expect(card).toBeVisible();
  await page.reload();
  await panel.getByLabel("Issue view", { exact: true }).selectOption("archive");
  await expect(card).toContainText("Archived");
  await card.locator("button[aria-expanded]").click();
  await expect(card).toContainText("Boxes removed and walkway confirmed clear.");
});
