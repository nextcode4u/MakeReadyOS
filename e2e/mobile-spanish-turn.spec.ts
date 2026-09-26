import { expect, test } from "@playwright/test";

test("Spanish turn work, codes and inspection keep stored values unchanged", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const login = await page.request.post("/api/auth/login", { data: { identifier: process.env.ADMIN_EMAIL || "admin@example.com", password: process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456" } });
  expect(login.ok()).toBeTruthy();
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { "x-csrf-token": session.csrfToken };
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const { property } = await post("/operations/properties", { code: `ES${Date.now()}`, name: "Spanish demo property" });
  const { unit } = await post("/operations/units", { propertyId: property.id, number: "ES-1" });
  const meta = await (await page.request.get("/api/meta")).json();
  const section = meta.boardSections.find((entry: any) => entry.propertyId === property.id && entry.sectionType === "MAKE_READY");
  const item = await post("/make-ready-items", { propertyId: property.id, unitId: unit.id, boardGroup: section.key, itemName: unit.number, unitNumber: unit.number, vacancyStatus: "VACANT NOT LEASED NOT READY", completionStatus: "NO" });
  // Change only this browser's language, not the shared fixture account.
  await page.route("**/api/auth/me", async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, user: { ...body.user, language: "es" } } });
  });
  await page.goto("/");
  await expect(page.getByTestId("property-filter")).toBeVisible();
  const skip = page.getByRole("button", { name: /Skip for now|Omitir por ahora/ });
  if (await skip.isVisible()) await skip.click();
  await page.getByTestId("property-filter").selectOption(property.id);
  await page.getByRole("button", { name: `Abrir detalles para ${unit.number}`, exact: true }).click();
  const notes = page.getByTestId("unit-work-notes");
  await expect(notes.getByRole("heading")).toHaveText("Notas de trabajo de la unidad");
  await notes.getByRole("textbox").fill("Cambiar frentes dañados del gabinete desde el taller.");
  await notes.getByRole("button", { name: "Guardar notas de trabajo", exact: true }).click();
  await expect(notes).toContainText("Notas de trabajo guardadas.");
  const quick = page.getByTestId("quick-materials");
  await quick.getByLabel("Pieza 1", { exact: true }).fill("Filtro especial");
  await quick.getByRole("button", { name: "Guardar lista de piezas", exact: true }).click();
  await expect(quick).toContainText("Lista de piezas guardada para el equipo.");
  const part = page.getByTestId("turn-materials").locator("article").filter({ hasText: "Filtro especial" });
  await part.getByLabel("Recogido Filtro especial", { exact: true }).click();
  await expect(part.getByLabel("Recogido Filtro especial", { exact: true })).toBeChecked();
  await expect(part.getByRole("combobox")).toHaveValue("ON_HAND");
  await expect(part).toContainText("Disponible");
  await expect(page.getByTestId("technician-preparation-checks")).toContainText("8 verificaciones de preparación");
  await expect(page.getByTestId("tech-check-tech-v2-1")).toContainText("Requiere atención");
  await expect(page.getByTestId("technician-preparation-checks")).toContainText("Fotos del estado inicial");
  await page.getByRole("button", { name: "Mostrar códigos", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ocultar códigos", exact: true })).toBeVisible();
  await page.getByTestId("drawer-pane-final").click();
  await page.getByRole("button", { name: "Detalles de inspección / informe", exact: true }).click();
  const report = page.getByTestId("final-report-editor");
  await expect(report).toContainText("Inspección final: frescura y presentación");
  await expect(report).toContainText("Guardar borrador de inspección");
  await expect(report.getByTestId("final-report-result-presentation-v2-1")).toContainText("No aplica");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await report.screenshot({ path: testInfo.outputPath(`spanish-inspection-${width}.png`) });
  }
});
