import { expect, test } from "@playwright/test";

test("capture public documentation with isolated fictional records", async ({ page, baseURL }) => {
  test.skip(process.env.PUBLIC_SCREENSHOTS !== "1", "Explicit opt-in required to replace documentation images");
  test.setTimeout(120000);
  page.setDefaultTimeout(10000);
  const host = new URL(baseURL!).hostname;
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(host);
  expect(process.env.COMPOSE_PROJECT_NAME).toMatch(/^makereadyos-e2e-/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  await page.getByTestId("onboarding-skip").click();
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { "x-csrf-token": session.csrfToken };
  const initialMeta = await (await page.request.get("/api/meta")).json();
  expect(initialMeta.properties).toHaveLength(0);
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const { property } = await post("/operations/properties", { code: "DEMO", name: "Demo Gardens (fictional)" });
  const meta = await (await page.request.get("/api/meta")).json();
  const { user: inspector } = await post("/admin/users", { username: "demo.inspector", fullName: "Demo Inspector", role: "LEASING", propertyIds: [property.id], password: "Fictional-Demo-Only!12345" });
  const policy = await page.request.put(`/api/automations/final-walk/${property.id}`, { headers, data: { enabled: true, inspectors: [inspector.id] } });
  expect(policy.ok()).toBeTruthy();
  const section = meta.boardSections.find((row: any) => row.propertyId === property.id && row.sectionType === "MAKE_READY");
  const date = (days: number) => { const value = new Date(); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
  const items = [];
  for (let index = 0; index < 5; index++) {
    const number = `DEMO-${101 + index}`;
    const { unit } = await post("/operations/units", { propertyId: property.id, number });
    items.push(await post("/make-ready-items", {
      propertyId: property.id, unitId: unit.id, boardGroup: section.key, itemName: number, unitNumber: number,
      vacancyStatus: "VACANT NOT LEASED NOT READY", completionStatus: "NO", scopeLevel: index % 2 ? "LITE" : "MEDIUM",
      makeReadyStatus: index === 1 ? "DONE" : "IN PROGRESS", paintStatus: index === 1 ? "DONE" : "NOT STARTED", cleaningStatus: index === 1 ? "DONE" : "NOT STARTED",
      vacatedDate: date(-5 - index), makeReadyDate: date(1 + index), moveInDate: date(3 + index),
      assignedTech: session.user.fullName, applicant: `Demo applicant ${index + 1}`, floorPlan: "Demo two-bedroom",
    }));
  }
  const finished = await page.request.patch(`/api/make-ready-items/${items[1].id}`, { headers, data: { makeReadyStatus: "DONE", paintStatus: "DONE", cleaningStatus: "DONE" } });
  expect(finished.ok()).toBeTruthy();
  await page.reload();
  await page.keyboard.press("Escape");
  await page.getByTestId("property-filter").selectOption(property.id);
  await page.getByTestId("display-menu").click();
  await page.getByTestId("theme-mode-select").selectOption("light");
  await page.getByTestId("display-menu").click();
  await page.getByTestId("board-tools-menu").click();
  await page.getByTestId("basic-board-mode").click();
  await page.keyboard.press("Escape");
  const capture = async (name: string) => {
    await page.waitForTimeout(700);
    await expect(page.getByTestId("property-filter").locator("option")).toHaveCount(2);
    await expect(page.getByTestId("property-filter")).toHaveValue(property.id);
    await page.screenshot({ path: `docs/screenshots/${name}.png`, animations: "disabled" });
  };
  await page.waitForTimeout(4500);
  await capture("table-view");
  await page.getByTestId("tab-my-work").click();
  await expect(page.getByTestId("my-work-panel")).toBeVisible();
  await capture("my-work");
  await page.getByTestId("tab-table").click();
  await page.getByRole("button", { name: "Open details for DEMO-101", exact: true }).click();
  await page.getByRole("button", { name: "Parts & work notes", exact: true }).click();
  await page.getByTestId("unit-work-notes").getByRole("textbox").fill("Replace damaged cabinet faces from shop stock. Inspect visually and swap matching faces; no measurements needed.");
  await page.getByTestId("unit-work-notes").getByRole("button", { name: "Save work notes", exact: true }).click();
  await page.getByTestId("quick-materials").getByLabel("Part 1", { exact: true }).fill("HVAC filter");
  await page.getByTestId("quick-materials").getByRole("button", { name: "Save parts list", exact: true }).click();
  await capture("work-and-parts");
  await page.getByTestId("item-drawer-close").click();
  await page.getByRole("button", { name: "Open details for DEMO-102", exact: true }).click();
  await page.getByTestId("drawer-pane-final").click();
  await capture("final-walk");
  await page.getByTestId("item-drawer-close").click();
  for (const [tab, ready, file] of [
    ["tab-kanban", "kanban-board", "kanban"],
    ["tab-dashboard", "dashboard-panel", "dashboard"],
    ["tab-pond", "frog-pond-panel", "frog-pond"],
  ]) {
    await page.getByTestId(tab).click();
    // Lazy-loaded workspaces must settle before capture.
    await expect(page.getByTestId(ready)).toBeVisible();
    if (file === "kanban") await page.getByTestId("kanban-hide-empty").check();
    if (file === "frog-pond") await page.getByRole("button", { name: "Pond-only view", exact: true }).click();
    await capture(file);
  }
});
