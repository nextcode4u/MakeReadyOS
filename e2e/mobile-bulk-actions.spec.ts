import { expect, test } from "@playwright/test";

for (const action of ["tech", "status"] as const) {
  test(`mobile bulk ${action} failures stay inline and block duplicate requests`, async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
    await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
    await page.getByTestId("login-submit").click();
    const selected = page.getByTestId("mobile-select-ta-284");
    await selected.check();
    await page.getByTestId("mobile-board-bulk-open").click();
    const modal = page.getByTestId("mobile-batch-actions-modal");
    await page.getByTestId(`mobile-batch-${action}-select`).selectOption({ index: 1 });
    let requests = 0;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/make-ready-items/batch", async route => {
      requests++;
      await held;
      await route.fulfill({ status: 503, json: { message: "Test bulk update unavailable" } });
    });
    const submit = modal.getByRole("button", { name: action === "tech" ? "Apply tech" : "Apply status", exact: true });
    await submit.click();
    await expect(submit).toBeDisabled();
    await submit.evaluate(element => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await expect.poll(() => requests).toBe(1);
    release();
    await expect(page.getByTestId("mobile-batch-error")).toHaveText("Test bulk update unavailable");
    await expect(submit).toBeEnabled();
    await expect(selected).toBeChecked();
    await submit.click();
    await expect.poll(() => requests).toBe(2);
    await expect(page.getByTestId("mobile-batch-error")).toHaveText("Test bulk update unavailable");
    await expect(page.getByRole("heading", { name: "Startup error" })).toHaveCount(0);
  });
}
