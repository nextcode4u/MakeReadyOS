import { expect, test } from "@playwright/test";
import { allUnitsXlsFixture } from "./all-units-xls-fixture";

test("direct All Units XLS upload previews and saves resident lease dates, preserving blanks", async ({ page }, info) => {
  test.skip(!process.env.COMPOSE_PROJECT_NAME?.startsWith("makereadyos-e2e-"), "Disposable demo environment required");
  test.setTimeout(120000);
  const unit = info.project.name === "user-mobile" ? "XLSDEMOM" : "XLSDEMOD";
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByTestId("property-filter").selectOption({ label: "DG · Demo Gardens" });
  const directory = async () => {
    if (await page.getByTestId("mobile-views-toggle").isVisible()) await page.getByTestId("mobile-views-toggle").click();
    await page.getByRole("tab", { name: "Availability & Units", exact: true }).click();
    await page.getByTestId("inventory-tab-directory").click();
    await page.getByTestId("unit-import-property").selectOption({ label: "DG - Demo Gardens" });
  };
  await directory();
  const upload = async (dates: boolean) => page.getByTestId("unit-import-file").setInputFiles({
    name: "All Units Demo.xls", mimeType: "application/vnd.ms-excel",
    buffer: allUnitsXlsFixture([{ unit, resident: "Demo XLS Resident", plan: "A1", sqft: 720,
      ...(dates ? { moveIn: "01/15/2024", start: "02/01/2026", end: "01/31/2027" } : {}),
    }]),
  });
  const preview = page.getByTestId("unit-import-resident-preview");
  await upload(true);
  await expect(preview).toContainText("Demo XLS Resident");
  for (const date of ["2024-01-15", "2026-02-01", "2027-01-31"]) await expect(preview).toContainText(date);
  await expect(preview).not.toContainText("preserved");
  page.on("dialog", dialog => dialog.accept());
  await page.getByTestId("unit-import-submit").click();
  await expect(page.getByTestId("unit-import-csv")).toHaveValue("");
  await expect(page.getByTestId("unit-import-last-import")).toBeVisible();
  await page.reload();
  await directory();
  await upload(false);
  for (const date of ["2024-01-15", "2026-02-01", "2027-01-31"]) await expect(preview).toContainText(`${date} (preserved)`);
  await page.getByTestId("unit-import-submit").click();
  await expect(page.getByTestId("unit-import-csv")).toHaveValue("");
  await page.reload();
  await directory();
  await upload(false);
  for (const date of ["2024-01-15", "2026-02-01", "2027-01-31"]) await expect(preview).toContainText(`${date} (preserved)`);
});
