import { expect, test } from "@playwright/test";

test("admin technician explicitly overrides Ready from the inspection report", async ({ page }, info) => {
  test.skip(!process.env.COMPOSE_PROJECT_NAME?.startsWith("makereadyos-e2e-"), "Disposable demo environment required");
  test.setTimeout(120000);
  const unit = info.project.name === "user-mobile" ? "DG-106" : "DG-101";
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByRole("button", { name: `Open details for ${unit}`, exact: true }).click();
  await page.getByTestId("drawer-pane-all").click();
  await page.getByTestId("drawer-field-assignedTech").selectOption("Default Admin");
  await expect(page.getByTestId("drawer-field-assignedTech")).toBeEnabled();
  await page.getByRole("button", { name: "Inspection details / report", exact: true }).click();
  const report = page.getByTestId("final-report-editor");
  await report.getByTestId("final-report-mark-ready").click();
  await expect(report.getByTestId("final-report-ready-error")).toContainText("cannot approve their own final walk");
  const override = report.getByTestId("final-report-override");
  await override.getByText("Manager / admin override: mark Ready", { exact: true }).click();
  const submit = override.getByTestId("final-report-override-submit");
  await expect(submit).toBeDisabled();
  await override.getByTestId("final-report-override-reason").fill("Admin reviewed the unit and accepts the completion exception.");
  await expect(submit).toBeDisabled();
  await override.getByTestId("final-report-override-confirm").check();
  await expect(submit).toBeEnabled();
  await page.context().setOffline(true);
  try {
    await submit.click();
    await expect(report.getByTestId("final-report-ready-error")).toBeVisible();
    await expect(submit).toBeEnabled();
  } finally { await page.context().setOffline(false); }
  await submit.click();
  await expect(report.getByTestId("final-report-completion")).toContainText("Unit marked ready");
  await expect(report.getByTestId("final-report-override")).toHaveCount(0);
  await expect(report.locator('[data-testid^="final-report-result-"]').first()).toHaveValue("NOT_CHECKED");
  await page.reload();
  await page.getByTestId("drawer-pane-all").click();
  await expect(page.getByTestId("drawer-field-completionStatus")).toHaveValue("Yes - unit ready");
  await page.getByRole("button", { name: "Inspection details / report", exact: true }).click();
  await expect(report.getByTestId("final-report-completion")).toContainText("Unit marked ready");
  await expect(report.locator('[data-testid^="final-report-result-"]').first()).toHaveValue("NOT_CHECKED");
});
