import { expect, test } from "@playwright/test";

test("make-ready status captures scope once and keeps it after repairs", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  const headers = { "x-csrf-token": (await (await page.request.get("/api/auth/me")).json()).csrfToken };
  const send = async (method: string, path: string, data?: unknown) => {
    const response = await page.request.fetch(`/api${path}`, { method, headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { property } = await send("POST", "/operations/properties", { code: `SCP${Date.now()}`, name: "Single scope entry" });
  const { unit } = await send("POST", "/operations/units", { propertyId: property.id, number: "SCOPE-101" });
  const meta = await send("GET", "/meta");
  const boardGroup = meta.boardSections.find((section: any) => section.propertyId === property.id && section.sectionType === "MAKE_READY").key;
  const item = await send("POST", "/make-ready-items", { propertyId: property.id, unitId: unit.id, unitNumber: unit.number, itemName: unit.number, boardGroup, vacancyStatus: "VACANT NOT LEASED NOT READY", makeReadyStatus: "LITE" });
  expect(item.scopeLevel).toBe("LITE");
  await page.reload();
  await page.getByTestId("property-filter").selectOption(property.id);
  await page.getByRole("button", { name: "Open details for SCOPE-101", exact: true }).click();
  await expect(page.getByTestId("drawer-field-scopeLevel")).toHaveCount(0);
  const status = page.getByTestId("drawer-field-makeReadyStatus");
  await status.selectOption("MAJOR");
  await expect.poll(async () => (await send("GET", `/make-ready-items/${item.id}`)).scopeLevel).toBe("MAJOR");
  await expect(status).toBeEnabled();
  await status.selectOption("DONE");
  await expect.poll(async () => (await send("GET", `/make-ready-items/${item.id}`)).makeReadyStatus).toBe("DONE");
  const done = await send("GET", `/make-ready-items/${item.id}`);
  expect(done.scopeLevel).toBe("MAJOR");
  expect(done.completionStatus).not.toBe("YES");
  await send("POST", "/make-ready-items/batch", { action: "SET_FIELD", ids: [item.id], field: "makeReadyStatus", value: "MEDIUM" });
  expect((await send("GET", `/make-ready-items/${item.id}`)).scopeLevel).toBe("MEDIUM");
});
