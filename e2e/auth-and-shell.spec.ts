import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
const adminPassword = process.env.ADMIN_PASSWORD || "MakeReadyAdmin!23456";
const techEmail = process.env.DEMO_TECH_EMAIL || "tech@example.com";
const techPassword = process.env.DEMO_TECH_PASSWORD || "MakeReadyTech!23456";

function slugify(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
}

function uniqueTag(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function customFieldKey(label: string) {
  const parts = label.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/);
  const first = (parts.shift() ?? "field").toLowerCase();
  return `${first}${parts.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`).join("")}`;
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page.getByRole("heading", { name: "MakeReadyOS" })).toBeVisible();
}

async function dragCardToColumn(page: Page, sourceTestId: string, targetTestId: string) {
  const source = page.getByTestId(sourceTestId).first();
  const target = page.getByTestId(targetTestId).first();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await source.dispatchEvent("dragend", { dataTransfer });
}

async function assertNoPageHorizontalOverflow(page: Page) {
  await expect.poll(() =>
    page.evaluate(() => {
      const overflowWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      return overflowWidth <= window.innerWidth + 4;
    }),
  ).toBe(true);
}

async function setDisplayMode(page: Page, input: { theme: "default" | "dark" | "light"; eyeStrain?: boolean; dyslexia?: boolean }) {
  await page.getByTestId("theme-mode-select").selectOption(input.theme);
  await page.getByTestId("eye-strain-mode-toggle").setChecked(Boolean(input.eyeStrain));
  await page.getByTestId("dyslexia-mode-toggle").setChecked(Boolean(input.dyslexia));
  await expect(page.locator("html")).toHaveAttribute("data-theme", input.theme);
  if (input.eyeStrain) {
    await expect(page.locator("html")).toHaveClass(/eye-strain-mode/);
  } else {
    await expect(page.locator("html")).not.toHaveClass(/eye-strain-mode/);
  }
  if (input.dyslexia) {
    await expect(page.locator("html")).toHaveClass(/dyslexia-mode/);
  } else {
    await expect(page.locator("html")).not.toHaveClass(/dyslexia-mode/);
  }
}

async function openWorkspaceAndAssert(page: Page, tabTestId: string, panelTestId: string) {
  await page.getByTestId(tabTestId).click();
  await expect(page.getByTestId(panelTestId)).toBeVisible();
  await assertNoPageHorizontalOverflow(page);
}

async function openTableFilters(page: Page) {
  const filters = page.getByTestId("advanced-filters").first();
  if (!(await filters.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await filters.locator("summary").click();
  }
  if (!(await filters.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await filters.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
      element.dispatchEvent(new Event("toggle", { bubbles: true }));
    });
  }
  await expect(filters).toHaveJSProperty("open", true);
}

test.describe("MakeReadyOS browser flows", () => {
  test("app loads and unauthenticated users see login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("Use the self-hosted admin account or a provisioned staff user")).toBeVisible();
  });

  test("seeded admin can log in, see board views, and log out via the visible button", async ({ page }) => {
    await login(page, adminEmail, adminPassword);

    await expect(page.getByTestId("tab-table")).toBeVisible();
    await expect(page.getByTestId("tab-dashboard")).toBeVisible();
    await expect(page.getByTestId("tab-kanban")).toBeVisible();
    await expect(page.getByTestId("tab-calendar")).toBeVisible();
    await expect(page.getByTestId("tab-maps")).toBeVisible();
    await expect(page.getByTestId("tab-pond")).toBeVisible();
    await expect(page.getByTestId("tab-vendors")).toBeVisible();
    await expect(page.getByTestId("module-rail-refrigerant")).toBeVisible();
    await expect(page.getByTestId("tab-automations")).toBeVisible();
    await expect(page.getByTestId("tab-activity")).toBeVisible();
    await expect(page.getByTestId("tab-admin")).toBeVisible();
    await expect(page.getByTestId("nav-group-operations")).toContainText("Operations");
    await expect(page.getByTestId("nav-group-visibility")).toContainText("Visibility");
    await expect(page.getByTestId("nav-group-management")).toContainText("Manage");
    await expect(page.getByTestId("nav-group-admin")).toContainText("Admin");
    await page.getByTestId("onboarding-open").click();
    await expect(page.getByTestId("onboarding-panel")).toBeVisible();
    await expect(page.getByTestId("onboarding-panel")).toContainText("Bring a property online");
    await page.getByTestId("onboarding-skip").click();
    await expect(page.getByTestId("onboarding-panel")).toHaveCount(0);
    await page.getByTestId("onboarding-open").click();
    await expect(page.getByTestId("onboarding-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("onboarding-panel")).toHaveCount(0);
    await expect(page.locator(".module-rail")).toBeVisible();
    await expect(page.locator(".module-rail-button.placeholder")).toHaveCount(0);
    await expect(page.getByTestId("board-table-view")).toBeVisible();
    await expect(page.getByTestId("table-add-field-shortcut")).toBeVisible();
    await expect(page.getByTestId("board-window-controls")).toBeVisible();
    const windowedResponse = page.waitForResponse((response) =>
      response.url().includes("/api/make-ready-items") && response.url().includes("limit=250"),
    );
    await page.getByTestId("board-windowed-toggle").check();
    await expect((await windowedResponse).status()).toBe(200);
    await expect(page.getByTestId("board-window-controls")).toContainText("Loaded");
    await page.getByTestId("board-window-disable").click();
    await expect(page.getByTestId("board-windowed-toggle")).not.toBeChecked();
    await page.getByTestId("tab-dashboard").click();
    await expect(page.getByTestId("dashboard-panel")).toBeVisible();
    await expect(page.getByTestId("needs-attention-panel")).toBeVisible();
    await page.getByTestId("notifications-button").click();
    await expect(page.getByTestId("notification-drawer")).toBeVisible();
    await page.getByTestId("notifications-read-all").click();
    await page.getByRole("button", { name: "Close notifications" }).click();
    await page.getByTestId("tab-table").click();

    await page.getByTestId("compact-mode-toggle").check();
    await expect(page.locator(".app-shell")).toHaveClass(/compact-mode/);
    await page.getByTestId("theme-mode-select").selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#000000");
    await page.getByTestId("theme-mode-select").selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text").trim())).toBe("#182432");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--border").trim())).toBe("#b6aa9c");
    await page.getByTestId("tab-calendar").click();
    await expect(page.locator(".calendar-grid").first()).toBeVisible();
    await expect(page.locator(".calendar-dow").first()).toHaveText("Sun");
    if (await page.getByTestId("calendar-today").count()) {
      await expect(page.getByTestId("calendar-today").first()).toBeVisible();
    }
    await expect.poll(() => page.locator(".calendar-grid").first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(169, 155, 137)");
    await expect(page.getByTestId("calendar-past-day").first()).toBeVisible();
    await expect.poll(() => page.getByTestId("calendar-past-day").first().evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    await page.getByTestId("tab-activity").click();
    await expect(page.locator(".activity-table").first()).toBeVisible();
    await expect.poll(() => page.locator(".activity-table th").first().evaluate((el) => getComputedStyle(el).color)).toBe("rgb(248, 251, 255)");
    await page.getByTestId("tab-table").click();
    await page.getByTestId("eye-strain-mode-toggle").check();
    await expect(page.locator("html")).toHaveClass(/eye-strain-mode/);
    await page.getByTestId("dyslexia-mode-toggle").check();
    await expect(page.locator("html")).toHaveClass(/dyslexia-mode/);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontFamily)).toContain("OpenDyslexic");
    await page.reload();
    await expect(page.getByTestId("compact-mode-toggle")).toBeChecked();
    await expect(page.locator(".app-shell")).toHaveClass(/compact-mode/);
    await expect(page.getByTestId("theme-mode-select")).toHaveValue("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByTestId("eye-strain-mode-toggle")).toBeChecked();
    await expect(page.locator("html")).toHaveClass(/eye-strain-mode/);
    await expect(page.getByTestId("dyslexia-mode-toggle")).toBeChecked();
    await expect(page.locator("html")).toHaveClass(/dyslexia-mode/);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const logoutResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/auth/logout") && response.request().method() === "POST",
    );
    await page.getByTestId("logout-button").click();
    await expect((await logoutResponsePromise).status()).toBe(200);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("display modes keep core workspaces readable without page overflow", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("compact-mode-toggle").setChecked(true);

    const modes = [
      { label: "default", theme: "default" as const },
      { label: "amoled", theme: "dark" as const },
      { label: "light", theme: "light" as const },
      { label: "eye strain", theme: "dark" as const, eyeStrain: true },
      { label: "dyslexia", theme: "light" as const, dyslexia: true },
    ];
    const workspaces = [
      ["tab-table", "board-table-view"],
      ["tab-kanban", "kanban-board"],
      ["tab-calendar", "calendar-view"],
      ["tab-dashboard", "dashboard-panel"],
      ["tab-maps", "property-maps-panel"],
      ["tab-pond", "frog-pond-panel"],
      ["tab-automations", "automation-panel"],
      ["tab-admin", "admin-panel"],
    ] as const;

    for (const mode of modes) {
      await test.step(`mode: ${mode.label}`, async () => {
        await setDisplayMode(page, mode);
        await expect(page.locator(".app-shell")).toHaveClass(/compact-mode/);
        const tokens = await page.evaluate(() => {
          const styles = getComputedStyle(document.documentElement);
          return {
            text: styles.getPropertyValue("--text").trim(),
            bg: styles.getPropertyValue("--bg").trim(),
            border: styles.getPropertyValue("--border").trim(),
            panel: styles.getPropertyValue("--panel").trim(),
          };
        });
        expect(tokens.text).toBeTruthy();
        expect(tokens.bg).toBeTruthy();
        expect(tokens.border).toBeTruthy();
        expect(tokens.panel).toBeTruthy();
        expect(tokens.text).not.toBe(tokens.bg);
        for (const [tab, panel] of workspaces) {
          await openWorkspaceAndAssert(page, tab, panel);
        }
      });
    }
  });

  test("admin can create a property map and place a unit marker", async ({ page }) => {
    const mapName = uniqueTag("QA Site Map");
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-maps").click();
    await expect(page.getByTestId("property-maps-panel")).toBeVisible();
    await expect(page.getByTestId("unit-directory-panel")).toBeVisible();
    const taPropertyValue = await page.getByTestId("map-property-select").evaluate((select) => {
      const propertySelect = select as HTMLSelectElement;
      return Array.from(propertySelect.options).find((option) => option.textContent?.startsWith("TA -"))?.value ?? "";
    });
    if (taPropertyValue) await page.getByTestId("map-property-select").selectOption(taPropertyValue);
    await page.getByTestId("map-create-name").fill(mapName);
    const createResponse = page.waitForResponse((response) =>
      response.url().includes("/api/property-maps") && response.request().method() === "POST",
    );
    await page.getByTestId("map-create-submit").click();
    await expect((await createResponse).status()).toBe(201);
    await expect(page.getByTestId("map-active-select")).toContainText(mapName);
    const itemBackedUnitValue = await page.getByTestId("map-unit-select").evaluate((select) => {
      const unitSelect = select as HTMLSelectElement;
      return Array.from(unitSelect.options).find((option) => option.textContent?.includes("TA 284"))?.value ?? unitSelect.options[1]?.value ?? "";
    });
    expect(itemBackedUnitValue).toBeTruthy();
    await page.getByTestId("map-unit-select").selectOption(itemBackedUnitValue);
    await page.getByTestId("map-location-building").fill("B1");
    await page.getByTestId("map-location-area").fill("North");
    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/unit-map-locations") && response.request().method() === "PUT",
    );
    await page.getByTestId("property-map-canvas").click({ position: { x: 180, y: 150 } });
    await expect((await saveResponse).status()).toBe(200);
    await expect(page.locator("[data-testid^='map-marker-']").first()).toBeVisible();
    await expect(page.getByTestId("map-building-summary")).toContainText("B1");
    await expect(page.getByTestId("map-building-filter-b1")).toContainText("1/1 mapped");
    await expect(page.getByTestId("map-building-b1")).toBeVisible();
    await page.getByTestId("map-building-filter-b1").click();
    await expect(page.getByTestId("map-unit-select")).toContainText("Bldg B1");
    await expect(page.getByTestId("map-legend")).toBeVisible();
    const marker = page.locator("[data-testid^='map-marker-']").first();
    const markerBox = await marker.boundingBox();
    expect(markerBox).toBeTruthy();
    const dragResponse = page.waitForResponse((response) =>
      response.url().includes("/api/unit-map-locations") && response.request().method() === "PUT",
    );
    await page.mouse.move(markerBox!.x + markerBox!.width / 2, markerBox!.y + markerBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(markerBox!.x + 80, markerBox!.y + 65, { steps: 4 });
    await page.mouse.up();
    await expect((await dragResponse).status()).toBe(200);
    await marker.click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("Frog Pond renders, updates config, and opens item details", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-pond").click();
    await expect(page.getByTestId("frog-pond-panel")).toBeVisible();
    await expect(page.getByTestId("frog-pond-scene")).toBeVisible();
    await page.getByTestId("frog-group-by").selectOption("riskLevel");
    await page.getByTestId("frog-color-by").selectOption("vacancyStatus");
    await page.getByTestId("frog-animation-toggle").uncheck();
    await page.getByTestId("frog-animation-toggle").check();
    await expect(page.getByTestId("frog-legend")).toContainText("vacancy Status");
    await page.locator('[data-testid^="frog-marker-"]').first().click({ force: true });
    await expect(page.getByTestId("item-drawer")).toBeVisible();
  });

  test("Dashboard opens the Frog Pond preview path", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-dashboard").click();
    await expect(page.getByTestId("dashboard-frog-preview")).toBeVisible();
    await page.getByTestId("dashboard-open-pond").click();
    await expect(page.getByTestId("frog-pond-panel")).toBeVisible();
  });

  test("admin can render Kanban and drag a card between columns", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-kanban").click();
    await expect(page.getByTestId("kanban-board")).toBeVisible();
    await expect(page.getByTestId("kanban-config")).toBeVisible();
    await page.getByTestId("kanban-color-by").selectOption("scopeLevel");
    await expect(page.getByTestId("kanban-guide")).toContainText("scopeLevel");

    const sourceCard = page.getByTestId("kanban-card-ta-284");
    const targetColumn = page.getByTestId("kanban-column-medium");

    await expect(sourceCard).toBeVisible();
    await expect(targetColumn).toBeVisible();
    await dragCardToColumn(page, "kanban-card-ta-284", "kanban-column-body-medium");

    await expect(targetColumn.getByTestId("kanban-card-ta-284")).toBeVisible();
  });

  test("item details drawer opens from table and Kanban and closes with Escape", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("item-details-ta-284").click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
    await expect(page.getByTestId("item-drawer")).toContainText("TA 284");
    await expect(page.getByTestId("drawer-field-assignedTech")).toBeVisible();
    await expect(page.getByTestId("drawer-risk-section")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("item-drawer")).toHaveCount(0);
    await page.getByTestId("tab-kanban").click();
    await page.getByTestId("kanban-details-ta-284").click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
  });

  test("item drawer supports operational updates, local photos, and checklist execution", async ({ page }) => {
    const note = `QA field note ${Date.now()}`;
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("item-details-ta-284").click();
    await page.getByTestId("comment-input").fill(note);
    await page.getByTestId("comment-submit").click();
    await expect(page.getByTestId("comment-list")).toContainText(note);
    await page.getByTestId("attachment-upload").setInputFiles([
      {
        name: "qa-finish-photo.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("QA local attachment"),
      },
      {
        name: "qa-damage-photo.png",
        mimeType: "image/png",
        buffer: Buffer.from("not-a-real-png-but-valid-upload-smoke"),
      },
      {
        name: "qa-large-walk-photo.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(2 * 1024 * 1024, 7),
      },
    ]);
    await expect(page.getByTestId("attachment-stage-filter")).toContainText("All photos/files");
    await expect(page.getByTestId("drawer-attachments")).toContainText("3 files");
    await page.getByTestId("attachment-gallery-open").click();
    await expect(page.getByTestId("attachment-gallery-modal")).toBeVisible();
    await expect(page.getByTestId("attachment-gallery-grid")).toContainText("qa-finish-photo.txt");
    await expect(page.getByTestId("attachment-gallery-grid")).toContainText("qa-damage-photo.png");
    await expect(page.getByTestId("attachment-gallery-grid")).toContainText("qa-large-walk-photo.png");
    await expect(page.getByTestId("attachment-gallery-download-zip")).toBeVisible();
    await expect(page.getByTestId("attachment-gallery-stage-filter")).toContainText("Needs classification");
    await expect(page.getByTestId("inspection-evidence-panel")).toContainText("Evidence package");
    await expect(page.getByTestId("attachment-download-button").first()).toBeVisible();
    await page.getByTestId("attachment-gallery-grid").getByTestId("attachment-preview-trigger").first().click();
    await expect(page.getByTestId("attachment-preview-modal")).toBeVisible();
    await expect(page.getByTestId("attachment-preview-download")).toBeVisible();
    await page.getByTestId("attachment-pin-label").fill("QA wall damage");
    await page.getByTestId("attachment-add-pin-mode").click();
    await expect(page.getByTestId("attachment-add-pin-mode")).toContainText("Click image to place pin");
    const markupBox = await page.getByTestId("attachment-image-markup").boundingBox();
    expect(markupBox).not.toBeNull();
    await page.mouse.click((markupBox?.x ?? 0) + Math.min(120, (markupBox?.width ?? 240) / 2), (markupBox?.y ?? 0) + Math.min(90, (markupBox?.height ?? 180) / 2));
    await expect(page.getByTestId("attachment-pin-list")).toContainText("QA wall damage");
    await page.getByTestId("attachment-preview-modal").getByRole("button", { name: "Close dialog" }).click();
    await expect(page.getByTestId("attachment-preview-modal")).toBeHidden();
    await expect(page.getByTestId("attachment-gallery-modal")).toBeVisible();
    await page.getByTestId("attachment-gallery-grid").getByTestId("attachment-editor-toggle").first().click();
    await page.getByTestId("attachment-stage-select").first().selectOption("INITIAL_WALK");
    await page.getByTestId("attachment-category-input").first().fill("Damage");
    await page.getByTestId("attachment-category-input").first().blur();
    await page.getByTestId("attachment-charge-toggle").first().check();
    await expect(page.getByTestId("attachment-gallery-modal")).toContainText("Charge candidate");
    await expect(page.getByTestId("attachment-gallery-charge-zip")).toBeVisible();
    await expect(page.getByTestId("attachment-category-downloads")).toContainText("Damage");
    await page.keyboard.press("Escape");
    const templateOption = page.getByTestId("checklist-template-select").locator("option").nth(1);
    if (await templateOption.count()) {
      await page.getByTestId("checklist-template-select").selectOption({ index: 1 });
      await page.getByTestId("checklist-attach").click();
      await expect(page.getByTestId("drawer-checklists").locator(".checklist-instance").last()).toBeVisible();
      await page.getByTestId("drawer-checklists").locator(".checklist-instance").last().locator("input[type=checkbox]").first().check();
      await expect(page.getByTestId("drawer-checklists").locator(".checklist-instance").last()).toContainText("1/");
    }
  });

  test("admin can manage vendors and assign contractor work from the item drawer", async ({ page }) => {
    const vendorName = uniqueTag("QA Vendor");
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-vendors").click();
    await expect(page.getByTestId("vendors-panel")).toBeVisible();
    await page.getByTestId("vendor-create-name").fill(vendorName);
    await page.getByTestId("vendor-create-trade").fill("Flooring");
    await page.getByTestId("vendor-create-submit").click();
    await expect(page.getByTestId("vendors-panel")).toContainText(vendorName);

    await page.getByTestId("tab-table").click();
    await page.getByTestId("item-details-ta-284").click();
    await expect(page.getByTestId("drawer-vendor-assignments")).toBeVisible();
    await page.getByTestId("drawer-vendor-select").selectOption({ label: `${vendorName} / Flooring` });
    await page.getByTestId("drawer-vendor-assignment-submit").click();
    await expect(page.getByTestId("drawer-vendor-assignments")).toContainText(vendorName);
  });

  test("My Work, command palette, notification preferences, and dashboard preset controls render", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.getByTestId("command-search").fill("TA 284");
    await expect(page.getByTestId("command-palette")).toContainText("TA 284");
    await page.keyboard.press("Escape");
    await page.getByTestId("tab-my-work").click();
    await expect(page.getByTestId("my-work-panel")).toBeVisible();
    const quickStatus = page.locator("[data-testid^='my-work-status-']").first();
    if (await quickStatus.count()) {
      await expect(quickStatus).toBeVisible();
    }
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByTestId("connection-banner")).toContainText("offline");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByTestId("connection-banner")).toHaveCount(0);
    await page.getByTestId("tab-dashboard").click();
    await page.getByTestId("dashboard-layout").selectOption("focus");
    await expect(page.getByTestId("dashboard-panel")).toHaveClass(/dashboard-layout-focus/);
    await page.getByTestId("notifications-button").click();
    await page.getByTestId("notification-preferences").locator("summary").click();
    await expect(page.getByTestId("notification-preferences")).toContainText("Comments");
  });

  test("admin can use table filters and module rail without the old saved-view sidebar", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await expect(page.getByTestId("saved-views-panel")).toHaveCount(0);
    await expect(page.locator(".module-rail")).toBeVisible();
    await expect(page.locator(".module-rail-button.placeholder")).toHaveCount(0);
    await openTableFilters(page);
    await page.getByTestId("filter-vacancy-status").selectOption("__vacant__");
    await expect(page.getByTestId("active-filter-vacancy")).toContainText("Vacant");
    await page.locator(".filter-chip").filter({ hasText: "Vacancy" }).click();
    await expect(page.getByTestId("active-filter-vacancy")).toHaveCount(0);
  });

  test("admin can rename a built-in display label without changing its board field", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("column-menu-vacatedDate").first().click();
    await expect(page.getByTestId("column-header-menu-vacatedDate").first()).toBeVisible();
    await page.getByTestId("column-header-menu-vacatedDate").first().getByRole("menuitem", { name: "Rename column" }).click();
    await page.getByTestId("column-rename-input").fill("QA Vacated");
    const renameResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/columns/vacatedDate") && response.request().method() === "PATCH",
    );
    await page.getByTestId("column-rename-save").click();
    await expect((await renameResponse).status()).toBe(200);
    await expect(page.getByTestId("board-column-header-vacatedDate").first()).toContainText("QA Vacated");
    await page.getByTestId("column-menu-vacatedDate").first().click();
    await page.getByTestId("column-header-menu-vacatedDate").first().getByRole("menuitem", { name: "Rename column" }).click();
    const resetResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/columns/vacatedDate") && response.request().method() === "PATCH",
    );
    await page.getByTestId("column-label-reset").click();
    await expect((await resetResponse).status()).toBe(200);
    await expect(page.getByTestId("board-column-header-vacatedDate").first()).toContainText("Vacated");
    await expect(page.getByText("Column label updated").last()).toBeVisible();
  });

  test("table header menu hides and moves optional columns", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("column-menu-applicant").first().click();
    await page.getByTestId("column-header-menu-applicant").first().getByRole("menuitem", { name: "Move right" }).click();
    const headers = await page.locator("table.board-table").first().locator("thead th").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")));
    expect(headers.indexOf("board-column-header-applicant")).toBeGreaterThan(headers.indexOf("board-column-header-moveOutDate"));
    await page.getByTestId("column-menu-applicant").first().click();
    await page.getByTestId("column-header-menu-applicant").first().getByRole("menuitem", { name: "Hide column" }).click();
    await expect(page.getByTestId("board-column-header-applicant")).toHaveCount(0);
  });

  test("module rail stays minimal after reload", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await expect(page.getByTestId("saved-views-panel")).toHaveCount(0);
    await expect(page.locator(".module-rail")).toBeVisible();
    await expect(page.locator(".module-rail-button.placeholder")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("saved-views-panel")).toHaveCount(0);
    await expect(page.locator(".module-rail-button.placeholder")).toHaveCount(0);
  });

  test("admin can add property and unit then create a make-ready turn", async ({ page }) => {
    const code = `QAE${Date.now()}`;
    const propertyName = `QA Property ${Date.now()}`;
    const unitNumber = `Q${Date.now()}`;

    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-operations").click();
    await expect(page.getByTestId("operations-panel")).toBeVisible();

    await page.getByTestId("property-create-name").fill(propertyName);
    await page.getByTestId("property-create-code").fill(code);
    const propertyResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/properties") && response.request().method() === "POST",
    );
    await page.getByTestId("property-create-submit").click();
    await expect((await propertyResponse).status()).toBe(201);
    await page.getByTestId(`property-row-${code.toLowerCase()}`).click();

    await expect(page.getByTestId("operating-calendar-management")).toBeVisible();
    await page.getByTestId("operating-calendar-avoid-monday").check();
    await page.getByTestId("operating-calendar-avoid-friday").check();
    await page.getByTestId("operating-calendar-daily-limit").fill("2");
    await page.getByTestId("operating-calendar-scope-day").selectOption("1");
    await page.getByTestId("operating-calendar-work-start-day").selectOption("2");
    const calendarResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/operations/properties/`) && response.url().includes("/operating-calendar") && response.request().method() === "PUT",
    );
    await page.getByTestId("operating-calendar-save").click();
    await expect((await calendarResponse).status()).toBe(200);

    const importedUnit = `IMP${Date.now()}`;
    await page.getByTestId("unit-import-csv").fill(`Unit Number\tBuilding Number\tFloor Plan\tBeds\tBaths\tSq Ft\tAvailability Status\tBudgeted\n${importedUnit}\t26\tQA \"B2\"\t2\t2\t1,246\tNTV Leased\tyes`);
    await expect(page.getByTestId("unit-import-preview")).toContainText("1 rows");
    const importResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/units/import") && response.request().method() === "POST",
    );
    await page.getByTestId("unit-import-submit").click();
    await expect((await importResponse).status()).toBe(200);
    await expect(page.getByTestId(`unit-row-${importedUnit.toLowerCase()}`)).toContainText("NTV leased");

    const sparseUnit = `SP${Date.now()}`;
    await expect(page.getByTestId("unit-import-csv")).toHaveValue("");
    await page.getByTestId("unit-import-csv").fill(`unit\tfloorPlan\tsqft\n${sparseUnit}\tQA Sparse\t900`);
    await expect(page.getByTestId("unit-import-preview")).toContainText("1 rows");
    const sparseImportResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/units/import") && response.request().method() === "POST",
    );
    await page.getByTestId("unit-import-submit").click();
    await expect((await sparseImportResponse).status()).toBe(200);
    await expect(page.getByTestId(`unit-row-${sparseUnit.toLowerCase()}`)).toContainText("QA Sparse");

    await page.getByTestId("unit-create-property").selectOption({ label: code });
    await page.getByTestId("unit-create-number").fill(unitNumber);
    await page.getByTestId("unit-create-floor-plan").fill("QA B1");
    await page.getByTestId("unit-create-square-feet").fill("820");
    const unitResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/units") && response.request().method() === "POST",
    );
    await page.getByTestId("unit-create-submit").click();
    await expect((await unitResponse).status()).toBe(201);

    await page.getByTestId("item-create-property").selectOption({ label: `${code} - ${propertyName}` });
    await page.getByTestId("item-create-unit").selectOption({ label: `${unitNumber} - QA B1` });
    await page.getByTestId("item-create-status").selectOption("LITE");
    const itemResponse = page.waitForResponse((response) =>
      response.url().includes("/api/make-ready-items") && response.request().method() === "POST",
    );
    await page.getByTestId("item-create-submit").click();
    await expect((await itemResponse).status()).toBe(201);
    await page.getByTestId("tab-table").click();
    await page.getByTestId("table-filter-property").selectOption({ label: `${code} / ${propertyName}` });
    await page.getByTestId("board-search").fill(unitNumber);
    await expect(page.getByText(unitNumber).first()).toBeVisible();
  });

  test("admin can fast-add under a group, assign staff, move and archive selected items", async ({ page }) => {
    const unitNumber = `B${Date.now()}`;

    await login(page, adminEmail, adminPassword);
    const utilityWidth = await page.getByTestId("board-group-table-ready-units-ta").locator("th.select-column").evaluate((element) => element.getBoundingClientRect().width);
    expect(utilityWidth).toBeLessThan(44);
    await expect.poll(() => page.getByTestId("board-group-table-ready-units-ta").locator("td.identity-column").first().evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    await page.getByTestId("add-item-row-make-ready-board-ta").click();
    await expect(page.getByTestId("add-item-form-make-ready-board-ta")).toBeVisible();
    await page.getByTestId("add-item-unit-number-make-ready-board-ta").fill(unitNumber);
    await page.getByTestId("add-item-tech-make-ready-board-ta").selectOption({ label: "Default Admin - ADMIN" });
    const addResponse = page.waitForResponse((response) => response.url().includes("/api/make-ready-items") && response.request().method() === "POST");
    await page.getByTestId("add-item-save-make-ready-board-ta").click();
    await expect((await addResponse).status()).toBe(201);

    await page.getByTestId(`select-item-${slugify(unitNumber)}`).check();
    await expect(page.getByTestId("batch-action-bar")).toContainText("1 selected");
    await page.getByTestId("batch-group-select").selectOption("DOWN_AND_MODELS");
    const moveResponse = page.waitForResponse((response) => response.url().includes("/api/make-ready-items/batch") && response.request().method() === "POST");
    await page.getByTestId("batch-move").click();
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect((await moveResponse).status()).toBe(200);
    await expect(page.getByTestId("board-group-table-down-and-models").getByTestId(`select-item-${slugify(unitNumber)}`)).toBeVisible();

    await page.getByTestId(`select-item-${slugify(unitNumber)}`).check();
    const archiveResponse = page.waitForResponse((response) => response.url().includes("/api/make-ready-items/batch") && response.request().method() === "POST");
    await page.getByTestId("batch-archive").click();
    await expect((await archiveResponse).status()).toBe(200);
    await expect(page.getByTestId(`select-item-${slugify(unitNumber)}`)).toHaveCount(0);
    await page.getByTestId("top-archive-mode").selectOption("archived");
    await expect(page.getByTestId("section-title-archive-ta")).toContainText("TA / Archive");
    await expect(page.getByTestId("board-group-table-archive-ta").getByTestId(`select-item-${slugify(unitNumber)}`)).toBeVisible();
    await page.getByTestId("top-archive-mode").selectOption("active");
  });

  test("admin can rename a board section inline and restore its label", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("section-rename-make-ready-board-ta").click();
    await page.getByTestId("section-name-input-make-ready-board-ta").fill("Active Turns QA");
    await page.getByTestId("section-name-input-make-ready-board-ta").press("Enter");
    await expect(page.getByTestId("section-title-make-ready-board-ta")).toContainText("Active Turns QA");
    await page.getByTestId("section-rename-make-ready-board-ta").click();
    await page.getByTestId("section-name-input-make-ready-board-ta").fill("Make Ready");
    await page.getByTestId("section-name-input-make-ready-board-ta").press("Enter");
    await expect(page.getByTestId("section-title-make-ready-board-ta")).toContainText("Make Ready");
  });

  test("admin can create a custom field and edit a board value", async ({ page }) => {
    const fieldLabel = `QA Walk Note ${Date.now()}`;
    const fieldKey = customFieldKey(fieldLabel);
    const displayLabel = `${fieldLabel} Display`;
    const cellId = `custom-field-cell-${fieldKey}-ta-284`;
    const inputId = `custom-field-input-${fieldKey}-ta-284`;

    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-fields").click();
    await expect(page.getByTestId("custom-fields-panel")).toBeVisible();
    await page.getByTestId("custom-field-new").click();
    await page.getByTestId("custom-field-label").fill(fieldLabel);
    await page.getByTestId("custom-field-type").selectOption("TEXT");
    await page.getByTestId("custom-field-save").click();

    await page.getByTestId("tab-table").click();
    await expect(page.getByTestId("board-group-table-ready-units-ta").getByTestId(`custom-field-header-${fieldKey}`)).toBeVisible();
    await page.getByTestId(`column-menu-${fieldKey}`).first().click();
    await page.getByTestId(`column-header-menu-${fieldKey}`).first().getByRole("menuitem", { name: "Rename column" }).click();
    await page.getByTestId("column-rename-input").fill(displayLabel);
    const renameFieldResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/custom-fields\/[^/]+$/) !== null && response.request().method() === "PATCH",
    );
    await page.getByTestId("column-rename-save").click();
    await expect((await renameFieldResponse).status()).toBe(200);
    await expect(page.getByTestId(`custom-field-header-${fieldKey}`).first()).toContainText(displayLabel);
    await page.getByTestId(cellId).click();
    await page.getByTestId(inputId).fill("Needs final key check");
    await expect(page.getByTestId(`cell-status-${fieldKey}-ta-284`)).toContainText("Unsaved");
    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/custom-fields/") && response.request().method() === "PUT",
    );
    await page.getByTestId(inputId).press("Enter");
    await expect((await saveResponse).status()).toBe(200);
    await expect(page.getByTestId(cellId)).toContainText("Needs final key check");
    await expect(page.getByTestId(`cell-status-${fieldKey}-ta-284`)).toContainText("Saved");

    await openTableFilters(page);
    await page.getByTestId("custom-filter-field-add").selectOption({ label: displayLabel });
    await page.getByTestId("custom-filter-add").click();
    await page.getByTestId(`custom-filter-value-${fieldKey}`).fill("final key");
    await expect(page.getByTestId("active-filter-bar")).toContainText(`${displayLabel}: Contains final key`);
    await expect(page.getByTestId(cellId)).toContainText("Needs final key check");

    await page.getByTestId("tab-kanban").click();
    await expect(page.getByTestId("kanban-board")).toBeVisible();
    await expect(page.getByTestId("active-filter-bar")).toContainText(displayLabel);
  });

  test("custom status filters use active options and exclude archived field definitions", async ({ page }) => {
    const fieldLabel = `QA Status Filter ${Date.now()}`;
    const fieldKey = customFieldKey(fieldLabel);

    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-fields").click();
    await page.getByTestId("custom-field-new").click();
    await page.getByTestId("custom-field-label").fill(fieldLabel);
    await page.getByTestId("custom-field-type").selectOption("SINGLE_SELECT");
    await page.getByTestId("custom-field-option-label-0").fill("NEEDS REVIEW");
    await page.getByTestId("custom-field-save").click();

    await page.getByTestId("tab-table").click();
    await page.getByTestId(`custom-field-cell-${fieldKey}-ta-284`).click();
    const writeResponse = page.waitForResponse((response) =>
      response.url().includes("/custom-fields/") && response.request().method() === "PUT",
    );
    await page.getByTestId(`custom-field-input-${fieldKey}-ta-284`).selectOption("NEEDS REVIEW");
    await expect((await writeResponse).status()).toBe(200);

    await openTableFilters(page);
    await page.getByTestId("custom-filter-field-add").selectOption({ label: fieldLabel });
    await page.getByTestId("custom-filter-add").click();
    await expect(page.getByTestId(`custom-filter-value-${fieldKey}`).locator("option", { hasText: "NEEDS REVIEW" })).toHaveCount(1);
    await page.getByTestId(`custom-filter-value-${fieldKey}`).selectOption("NEEDS REVIEW");
    await expect(page.getByTestId("active-filter-bar")).toContainText(`${fieldLabel}: Equals NEEDS REVIEW`);
    await expect(page.getByTestId(`custom-field-cell-${fieldKey}-ta-284`)).toBeVisible();
    await page.getByTestId(`custom-filter-remove-${fieldKey}`).click();

    await page.getByTestId("tab-fields").click();
    await page.getByTestId(`custom-field-item-${fieldKey}`).click();
    await page.getByTestId("custom-field-archive").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await page.getByTestId("tab-table").click();
    await expect(page.getByTestId("custom-filter-field-add").locator("option", { hasText: fieldLabel })).toHaveCount(0);
  });

  test("admin assigns active staff and keyboard-tabs through text editing", async ({ page }) => {
    const assignedCell = "builtin-cell-assignedTech-ta-284";
    const assignedInput = "builtin-input-assignedTech-ta-284";

    await login(page, adminEmail, adminPassword);
    await page.getByTestId(assignedCell).click();
    const saveResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/make-ready-items\/[^/]+$/) !== null && response.request().method() === "PATCH",
    );
    await page.getByTestId(assignedInput).selectOption({ label: "Default Admin - ADMIN" });
    await expect((await saveResponse).status()).toBe(200);
    await expect(page.getByTestId("cell-status-assignedTech-ta-284")).toContainText("Saved");
    await expect(page.getByTestId(assignedCell)).toContainText("Default Admin");

    await page.getByTestId("builtin-cell-applicant-ta-284").click();
    await page.getByTestId("builtin-input-applicant-ta-284").fill("Keyboard QA");
    const textSaveResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/make-ready-items\/[^/]+$/) !== null && response.request().method() === "PATCH",
    );
    await page.getByTestId("builtin-input-applicant-ta-284").press("Tab");
    await expect((await textSaveResponse).status()).toBe(200);
    await expect(page.getByTestId("builtin-input-moveOutDate-ta-284")).toBeVisible();
  });

  test("admin assigns a managed floor plan from the table and sees linked metadata", async ({ page }) => {
    const planName = `QA Managed ${Date.now()}`;
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("builtin-cell-floorPlan-ta-284").click();
    await page.getByTestId("manage-floor-plans-ta-284").click();
    await expect(page.getByTestId("inline-floor-plan-modal")).toBeVisible();
    await page.getByTestId("inline-floor-plan-code").fill(`QA${Date.now()}`);
    await page.getByTestId("inline-floor-plan-name").fill(planName);
    await page.getByTestId("inline-floor-plan-beds").fill("2");
    await page.getByTestId("inline-floor-plan-baths").fill("1.5");
    await page.getByTestId("inline-floor-plan-sqft").fill("940");
    const createPlanResponse = page.waitForResponse((response) => response.url().includes("/api/operations/floor-plans") && response.request().method() === "POST");
    await page.getByTestId("inline-floor-plan-add").click();
    await expect((await createPlanResponse).status()).toBe(201);
    await page.getByTestId("inline-floor-plan-modal").getByRole("button", { name: "Close", exact: true }).click();
    const floorPlanInput = page.getByTestId("builtin-input-floorPlan-ta-284");
    const floorPlanOption = floorPlanInput.locator("option", { hasText: planName });
    await expect(floorPlanOption).toHaveCount(1);
    const floorPlanValue = await floorPlanOption.first().getAttribute("value");
    const unitUpdate = page.waitForResponse((response) => response.url().match(/\/api\/operations\/units\/[^/]+$/) !== null && response.request().method() === "PATCH");
    await floorPlanInput.selectOption(floorPlanValue ?? "");
    await expect((await unitUpdate).status()).toBe(200);
    await expect(page.getByTestId("builtin-cell-floorPlan-ta-284")).toContainText(planName);
    await expect(page.getByTestId("builtin-cell-floorPlan-ta-284")).toContainText("2bd / 1.5ba / 940sf");
  });

  test("admin can add a status option directly from a table dropdown", async ({ page }) => {
    const label = uniqueTag("QA-Paint-Choice");
    const renamed = `${label}-updated`;

    await login(page, adminEmail, adminPassword);
    await page.getByTestId("builtin-cell-paintStatus-ta-284").click();
    await page.getByTestId("manage-options-paintStatus-ta-284").click();
    await expect(page.getByTestId("table-option-modal")).toBeVisible();
    await page.getByTestId("table-option-label").fill(label);
    const createResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/options") && response.request().method() === "POST",
    );
    await page.getByTestId("table-option-save").click();
    await expect((await createResponse).status()).toBe(201);
    await expect(page.getByTestId("table-option-modal")).toHaveCount(0);
    await page.getByTestId("builtin-cell-paintStatus-ta-284").click();
    await page.getByTestId("manage-options-paintStatus-ta-284").click();
    const optionInput = page.getByTestId("table-option-modal").getByLabel(`Rename ${label}`);
    await optionInput.fill(renamed);
    const updateResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/operations\/options\/[^/]+$/) !== null && response.request().method() === "PATCH",
    );
    await page.getByTestId("table-option-save-existing").click();
    await expect((await updateResponse).status()).toBe(200);
  });

  test("dashboard cards and charts apply clearable structured filters across views", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-dashboard").click();
    await expect(page.getByTestId("dashboard-readiness-ratios")).toBeVisible();
    await expect(page.getByTestId("dashboard-donut-vacancy-pipeline")).toBeVisible();
    await expect(page.getByTestId("analytics-panel")).toBeVisible();
    await page.getByTestId("kpi-overdue").click();
    await expect(page.getByTestId("board-table-view")).toBeVisible();
    await expect(page.getByTestId("active-filter-overdue")).toBeVisible();
    await page.getByTestId("clear-structured-filters").click();
    await expect(page.getByTestId("active-filter-bar")).toHaveCount(0);

    await page.getByTestId("tab-dashboard").click();
    await page.locator('[data-testid^="dashboard-vacancy-"]').first().click();
    await expect(page.getByTestId("active-filter-vacancy")).toBeVisible();
    await page.getByTestId("tab-kanban").click();
    await expect(page.getByTestId("active-filter-vacancy")).toBeVisible();
    await expect(page.getByTestId("kanban-board")).toBeVisible();
    await page.getByTestId("tab-calendar").click();
    await expect(page.getByTestId("active-filter-vacancy")).toBeVisible();
    await expect(page.getByTestId("calendar-view")).toBeVisible();
  });

  test("risk dashboard drilldown shows board risk indicators and drawer reasons", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-dashboard").click();
    await expect(page.getByTestId("kpi-riskHigh")).toBeVisible();
    await page.getByTestId("kpi-riskHigh").click();
    await expect(page.getByTestId("active-filter-risk-level")).toContainText("HIGH");
    await expect(page.locator('[data-testid^="risk-pill-"]').first()).toBeVisible();
    await page.locator('[data-testid^="item-details-"]').first().click();
    await expect(page.getByTestId("drawer-risk-section")).toBeVisible();
    await expect(page.getByTestId("drawer-risk-section")).toContainText(/risk|RISK/i);
    await expect(page.getByTestId("unit-history-section")).toBeVisible();
  });

  test("schedule exposes NTV terminology and an active custom date track", async ({ page }) => {
    const fieldLabel = `QA Cleaning Date ${Date.now()}`;
    const fieldKey = customFieldKey(fieldLabel);

    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-fields").click();
    await page.getByTestId("custom-field-new").click();
    await page.getByTestId("custom-field-label").fill(fieldLabel);
    await page.getByTestId("custom-field-type").selectOption("DATE");
    await page.getByTestId("custom-field-save").click();

    await page.getByTestId("tab-table").click();
    await page.getByTestId(`custom-field-cell-${fieldKey}-ta-284`).click();
    const writeResponse = page.waitForResponse((response) =>
      response.url().includes("/custom-fields/") && response.request().method() === "PUT",
    );
    await page.getByTestId(`custom-field-input-${fieldKey}-ta-284`).fill("2026-05-14");
    await page.getByTestId(`custom-field-input-${fieldKey}-ta-284`).press("Enter");
    await expect((await writeResponse).status()).toBe(200);

    await openTableFilters(page);
    await page.getByTestId("custom-filter-field-add").selectOption({ label: fieldLabel });
    await page.getByTestId("custom-filter-add").click();
    await page.getByTestId(`custom-filter-operator-${fieldKey}`).selectOption("before");
    await page.getByTestId(`custom-filter-value-${fieldKey}`).fill("2026-05-15");
    await expect(page.getByTestId("active-filter-bar")).toContainText(`${fieldLabel}: Before 2026-05-15`);
    await expect(page.getByTestId(`custom-field-cell-${fieldKey}-ta-284`)).toBeVisible();

    await page.getByTestId("tab-operations").click();
    await expect(page.getByTestId("schedule-track-management")).toBeVisible();
    await expect(page.getByTestId("schedule-track-presets")).toBeVisible();
    await expect(page.getByTestId("schedule-track-preset-move-in")).toBeVisible();
    await page.getByTestId("schedule-track-create-source").selectOption({ label: fieldLabel });
    await page.getByTestId("schedule-track-create-basis").selectOption("FIXED");
    const createTrackResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/schedule-tracks") && response.request().method() === "POST",
    );
    await page.getByTestId("schedule-track-create-submit").click();
    await expect((await createTrackResponse).status()).toBe(201);

    await page.getByTestId("tab-calendar").click();
    await expect(page.getByTestId("active-filter-bar")).toContainText(`${fieldLabel}: Before 2026-05-15`);
    await expect(page.locator(".calendar-dow").first()).toHaveText(/sun/i);
    if (await page.getByTestId("calendar-today").count()) {
      await expect(page.getByTestId("calendar-today").first()).toBeVisible();
    }
    await expect(page.getByTestId("calendar-panel-track-0")).toContainText("NTV / Notice to Vacate");
    await expect(page.getByTestId("calendar-legend-0")).toBeVisible();
    await expect(page.getByTestId("calendar-track-guidance-0")).toContainText("Risk cues:");
    await expect(page.getByTestId("calendar-track-guidance-0")).toContainText("Compatibility:");
    await page.getByTestId("calendar-panel-track-0").selectOption({ label: "NTV / Notice to Vacate" });
    await expect(page.getByTestId("calendar-color-source-0")).toContainText("status colors");
    await page.getByTestId("calendar-panel-track-0").selectOption({ label: fieldLabel });
    await expect(page.getByTestId("calendar-color-source-0")).toContainText("Fixed track color");
    if (await page.locator(".calendar-day-conflicts").count()) {
      await expect(page.locator(".calendar-day-conflicts").first()).toBeVisible();
    }
    await expect(page.getByText("TA 284").first()).toBeVisible();
    await page.getByText("TA 284").first().click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("calendar-layout-select").selectOption("split");
    await expect(page.getByTestId("calendar-panel-1")).toBeVisible();
    await page.getByTestId("calendar-layout-select").selectOption("grid");
    await expect(page.getByTestId("calendar-panel-3")).toBeVisible();
  });

  test("admin can create a user, update role, deactivate, and reactivate", async ({ page }) => {
    const userName = uniqueTag("qa-user");
    const userEmail = `${userName}@example.com`;
    const userRowId = `admin-user-row-${slugify(userEmail)}`;

    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByTestId("admin-panel")).toBeVisible();

    await page.getByTestId("admin-create-full-name").fill(userName);
    await page.getByTestId("admin-create-email").fill(userEmail);
    await page.getByTestId("admin-create-role").selectOption("VIEWER");
    await page.getByTestId("admin-create-password").fill("TempUser!23456");
    await page.getByTestId("admin-create-user-button").click();

    await page.getByTestId("admin-user-search").fill(userEmail);
    const userRow = page.getByTestId(userRowId);
    await expect(userRow).toBeVisible();
    await userRow.click();

    await page.getByTestId("admin-edit-role").selectOption("MANAGER");
    await page.getByTestId("admin-save-user-button").click();
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByText(`Updated ${userName}`)).toBeVisible();

    const deactivateResponsePromise = page.waitForResponse((response) =>
      response.url().match(/\/api\/admin\/users\/[^/]+$/) !== null && response.request().method() === "DELETE",
    );
    await page.getByTestId("admin-deactivate-user-button").click();
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect((await deactivateResponsePromise).status()).toBe(200);

    await page.reload();
    await page.getByTestId("tab-admin").click();
    await page.getByTestId("admin-user-search").fill(userEmail);
    await page.getByTestId(userRowId).click();
    await expect(page.getByTestId("admin-reactivate-user-button")).toBeVisible();

    const reactivateResponsePromise = page.waitForResponse((response) =>
      response.url().match(/\/api\/admin\/users\/[^/]+$/) !== null && response.request().method() === "PATCH",
    );
    await page.getByTestId("admin-reactivate-user-button").click();
    await expect((await reactivateResponsePromise).status()).toBe(200);

    await page.reload();
    await page.getByTestId("tab-admin").click();
    await page.getByTestId("admin-user-search").fill(userEmail);
    await page.getByTestId(userRowId).click();
    await expect(page.getByTestId("admin-deactivate-user-button")).toBeVisible();
  });

  test("admin sees native backup transfer tools and invalid backup reports an error", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByTestId("backup-transfer-panel")).toBeVisible();
    await expect(page.getByTestId("backup-export-button")).toBeVisible();

    await page.getByTestId("backup-file-input").setInputFiles({
      name: "invalid-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ format: "not-makereadyos", version: 1 })),
    });
    await page.getByTestId("backup-dry-run-button").click();
    await expect(page.getByTestId("backup-error")).toContainText("Invalid MakeReadyOS backup");
  });

  test("admin can inspect upload storage and validate a NAS path", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByTestId("storage-settings-panel")).toBeVisible();
    await expect(page.getByTestId("storage-mode")).toBeVisible();
    await expect(page.getByTestId("storage-upload-limit")).toContainText("No MakeReadyOS per-file limit");
    await page.getByTestId("storage-target-path").fill("/mnt/storage/makereadyos-uploads");
    const validateResponse = page.waitForResponse((response) =>
      response.url().includes("/api/admin/storage/validate") && response.request().method() === "POST",
    );
    await page.getByTestId("storage-validate-button").click();
    await expect((await validateResponse).status()).toBe(200);
    await expect(page.getByTestId("storage-validation-result")).toContainText("Path looks safe");
    await expect(page.getByTestId("storage-validation-result")).toContainText("./move-uploads.sh /mnt/storage/makereadyos-uploads");
    await expect(page.getByTestId("storage-property-routing")).toContainText("Property upload folders");
    const routingRow = page.locator(".storage-routing-row").filter({ hasText: "TA" }).first();
    await routingRow.getByLabel(/Upload routing mode/).selectOption("PROPERTY_SUBDIR");
    await routingRow.getByLabel(/Upload folder/).fill("ta-inspections");
    const routingResponse = page.waitForResponse((response) =>
      response.url().includes("/api/admin/storage/property-routing") && response.request().method() === "PATCH",
    );
    await routingRow.getByRole("button", { name: "Save" }).click();
    await expect((await routingResponse).status()).toBe(200);
    await expect(routingRow).toContainText("New uploads route to /ta-inspections");
  });

  test("admin can create a scoped API token from Integrations", async ({ page }) => {
    const tokenName = uniqueTag("QA API Token");
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByTestId("integrations-panel")).toBeVisible();
    await page.getByTestId("api-token-name").fill(tokenName);
    await page.getByTestId("api-token-scope-read-items").check();
    const createResponse = page.waitForResponse((response) =>
      response.url().includes("/api/admin/integrations/api-tokens") && response.request().method() === "POST",
    );
    await page.getByTestId("api-token-create").click();
    await expect((await createResponse).status()).toBe(201);
    await expect(page.getByTestId("api-token-once")).toHaveValue(/mro_/);
    await expect(page.getByTestId("integrations-panel")).toContainText(tokenName);
  });

  test("admin can register a webhook and inspect delivery health", async ({ page }) => {
    const webhookName = uniqueTag("QA Webhook");
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByTestId("integrations-panel")).toBeVisible();
    await expect(page.getByTestId("webhook-event-lease-issue-created")).toBeVisible();
    await expect(page.getByTestId("webhook-event-lease-issue-updated")).toBeVisible();
    await expect(page.getByTestId("webhook-event-lease-issue-resolved")).toBeVisible();
    await expect(page.getByTestId("webhook-event-lease-issue-archived")).toBeVisible();
    await page.getByTestId("webhook-name").fill(webhookName);
    await page.getByTestId("webhook-url").fill("https://example.com/makereadyos/webhook");
    const createResponse = page.waitForResponse((response) =>
      response.url().includes("/api/admin/integrations/webhooks") && response.request().method() === "POST",
    );
    await page.getByTestId("webhook-create").click();
    await expect((await createResponse).status()).toBe(201);
    await expect(page.getByTestId("webhook-secret-once")).toHaveValue(/wh_/);
    const row = page.getByTestId("webhook-row").filter({ hasText: webhookName });
    await expect(row).toContainText("READY");
    const dryRunResponse = page.waitForResponse((response) =>
      response.url().includes("/test-payload") && response.request().method() === "POST",
    );
    await row.getByRole("button", { name: "Dry-run test" }).click();
    await expect((await dryRunResponse).status()).toBe(201);
    await row.getByTestId("webhook-deliveries-toggle").click();
    await expect(page.getByTestId("webhook-delivery-panel")).toContainText("DRY_RUN");
  });

  test("admin can open and filter the activity log", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-activity").click();
    await expect(page.getByTestId("activity-panel")).toBeVisible();
    await expect(page.getByTestId("activity-table")).toBeVisible();
    await page.getByTestId("activity-filter-action").selectOption("AUTH_LOGIN_SUCCESS");
    await expect(page.getByTestId("activity-row").first()).toContainText("Auth Login Success");
  });

  test("admin can open the structured automation workspace", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-automations").click();
    await expect(page.getByTestId("automation-panel")).toBeVisible();
    await expect(page.getByText("JavaScript is never executed.")).toBeVisible();
    await expect(page.getByTestId("automation-run-history")).toBeVisible();
    const previewResponse = page.waitForResponse((response) =>
      response.url().includes("/api/automations/preview") && response.request().method() === "POST",
    );
    await page.getByTestId("automation-preview-stored").click();
    await expect((await previewResponse).status()).toBe(200);
    await expect(page.getByTestId("automation-preview-panel")).toBeVisible();
    await expect(page.getByTestId("automation-preview-notice")).toContainText("No changes will be made");
  });

  test("admin can preview and install a disabled operational rule template", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-automations").click();
    await expect(page.getByTestId("automation-template-library")).toBeVisible();
    await expect(page.getByTestId("automation-template-requirements-pest-follow-up-needed")).toContainText("Pest Follow-Up Date");
    await page.getByTestId("automation-template-category").selectOption("Scheduling");
    await expect(page.getByTestId("automation-template-no-weekend-make-ready")).toBeVisible();
    await expect(page.getByTestId("automation-template-no-monday-friday-make-ready")).toBeVisible();
    await expect(page.getByTestId("automation-template-turn-date-sequence-review")).toBeVisible();
    await page.getByTestId("automation-template-category").selectOption("Planning");
    await expect(page.getByTestId("automation-template-daily-schedule-load-review")).toBeVisible();
    await expect(page.getByTestId("automation-template-in-house-or-vendor-work-routing")).toBeVisible();
    await page.getByTestId("automation-template-category").selectOption("Priority");
    await expect(page.getByTestId("automation-template-major-scope-priority")).toBeVisible();
    await expect(page.getByTestId("automation-template-overdue-make-ready")).toHaveCount(0);

    const previewResponse = page.waitForResponse((response) =>
      response.url().includes("/api/automations/preview") && response.request().method() === "POST",
    );
    await page.getByTestId("automation-template-preview-major-scope-priority").click();
    await expect((await previewResponse).status()).toBe(200);
    await expect(page.getByTestId("automation-preview-panel")).toBeVisible();

    await expect(page.getByTestId("automation-template-enable")).not.toBeChecked();
    const installButton = page.getByTestId("automation-template-install-major-scope-priority");
    if (await installButton.isEnabled()) {
      const installResponse = page.waitForResponse((response) =>
        response.url().includes("/api/automations/templates/major-scope-priority/install") && response.request().method() === "POST",
      );
      await installButton.click();
      await expect((await installResponse).status()).toBe(201);
    }
    await expect(page.getByTestId("automation-template-major-scope-priority")).toContainText("Installed");
    await expect(page.getByText("Installed template Major Scope Priority Flag")).toBeVisible();
  });

  test("admin can preview and install an operational library pack", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-automations").click();
    await expect(page.getByTestId("operational-library")).toBeVisible();
    await expect(page.getByTestId("library-pack-make-ready-operations-starter")).toContainText("Make Ready Operations Starter");

    const previewResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operational-library/preview") && response.request().method() === "POST",
    );
    await page.getByTestId("library-pack-preview-make-ready-operations-starter").click();
    await expect((await previewResponse).status()).toBe(200);
    await expect(page.getByTestId("library-preview-summary")).toContainText("automationTemplates");

    const installResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operational-library/install") && response.request().method() === "POST",
    );
    await page.getByTestId("library-pack-install-make-ready-operations-starter").click();
    await expect((await installResponse).status()).toBe(200);
    await expect(page.getByText("Installed operational library items")).toBeVisible();
  });

  test("admin can create and dry-run apply a property template", async ({ page }) => {
    const templateName = uniqueTag("QA Property Template");
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-automations").click();
    await expect(page.getByTestId("property-template-library")).toBeVisible();
    await page.getByTestId("property-template-name").fill(templateName);
    await page.getByTestId("property-template-category").fill("Make Ready");

    const previewCreateResponse = page.waitForResponse((response) =>
      response.url().includes("/api/property-templates/from-property/preview") && response.request().method() === "POST",
    );
    await page.getByTestId("property-template-preview-create").click();
    await expect((await previewCreateResponse).status()).toBe(200);
    await expect(page.getByTestId("property-template-preview-summary")).toContainText("Create template preview");

    const createResponse = page.waitForResponse((response) =>
      response.url().includes("/api/property-templates/from-property") && response.request().method() === "POST",
    );
    await page.getByTestId("property-template-create-submit").click();
    await expect((await createResponse).status()).toBe(201);
    await expect(page.getByTestId("property-template-library")).toContainText(templateName);

    await page.getByTestId("property-template-apply-template").selectOption({ label: templateName });
    const applyPreviewResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/property-templates\/[^/]+\/apply$/) !== null && response.request().method() === "POST",
    );
    await page.getByTestId("property-template-apply-preview").click();
    await expect((await applyPreviewResponse).status()).toBe(200);
    await expect(page.getByTestId("property-template-preview-summary")).toContainText("Apply dry run");
  });

  test("admin can build and preview a scheduled condition from a custom date field", async ({ page }) => {
    const fieldLabel = `QA Automation Date ${Date.now()}`;

    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-fields").click();
    await page.getByTestId("custom-field-new").click();
    await page.getByTestId("custom-field-label").fill(fieldLabel);
    await page.getByTestId("custom-field-type").selectOption("DATE");
    await page.getByTestId("custom-field-save").click();

    await page.getByTestId("tab-automations").click();
    await page.getByTestId("automation-new").click();
    await page.getByTestId("automation-name").fill(`QA Custom Date Rule ${Date.now()}`);
    await page.getByTestId("automation-trigger").selectOption("SCHEDULED_CHECK");
    await page.getByTestId("automation-condition-field-0").selectOption({ label: fieldLabel });
    await expect(page.getByTestId("automation-condition-operator-0")).toHaveValue("dateBeforeToday");
    await page.getByTestId("automation-condition-operator-0").selectOption("equals");
    await expect(page.getByTestId("automation-condition-value-0")).toHaveAttribute("type", "date");
    await page.getByTestId("automation-condition-operator-0").selectOption("dateBeforeToday");

    const previewResponse = page.waitForResponse((response) =>
      response.url().includes("/api/automations/preview") && response.request().method() === "POST",
    );
    await page.getByTestId("automation-preview-draft").click();
    await expect((await previewResponse).status()).toBe(200);
    await expect(page.getByTestId("automation-preview-panel")).toBeVisible();
  });

  test("admin can run a scheduled automation check and see manual history", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-automations").click();
    await expect(page.getByTestId("automation-panel")).toBeVisible();

    await page.getByRole("button", { name: /Scheduled move-in soon check/ }).click();
    await expect(page.getByTestId("automation-run-now")).toBeVisible();
    const runResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/automations\/[^/]+\/run$/) !== null && response.request().method() === "POST",
    );
    await page.getByTestId("automation-run-now").click();
    await expect((await runResponse).status()).toBe(200);
    await expect(page.getByTestId("automation-run-history").getByText("MANUAL").first()).toBeVisible();
  });

  test("admin can preview and install least-loaded staff automation starters as review-first rules", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-automations").click();
    await expect(page.getByTestId("automation-panel")).toBeVisible();

    await page.getByTestId("automation-template-category").selectOption("Assignment");
    await expect(page.getByTestId("automation-template-balanced-tech-auto-assignment")).toBeVisible();
    await expect(page.getByTestId("automation-template-auto-assign-cleaner-balanced")).toBeVisible();
    await expect(page.getByTestId("automation-template-enable")).not.toBeChecked();

    const previewResponse = page.waitForResponse((response) =>
      response.url().includes("/api/automations/preview") && response.request().method() === "POST",
    );
    await page.getByTestId("automation-template-preview-balanced-tech-auto-assignment").click();
    await expect((await previewResponse).status()).toBe(200);
    await expect(page.getByTestId("automation-preview-panel")).toBeVisible();
    await expect(page.getByTestId("automation-preview-panel")).toContainText("This rule is disabled. Preview evaluates it as if enabled.");
    await expect(page.getByTestId("automation-preview-panel")).toContainText("No active eligible staff were available for this property.");

    const installResponse = page.waitForResponse((response) =>
      response.url().includes("/api/automations/templates/balanced-tech-auto-assignment/install") && response.request().method() === "POST",
    );
    await page.getByTestId("automation-template-install-balanced-tech-auto-assignment").click();
    await expect((await installResponse).status()).toBe(201);
    await expect(page.getByTestId("automation-template-balanced-tech-auto-assignment")).toContainText("Installed");
    await expect(page.getByTestId("automation-template-enable")).not.toBeChecked();
  });

  test("admin can open planning and create a work block", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-planning").click();
    await expect(page.getByTestId("planning-panel")).toBeVisible();
    const planningBoxes = await page.locator(".planning-create label").evaluateAll((labels) => labels.map((label) => {
      const rect = label.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }));
    for (let index = 1; index < planningBoxes.length; index += 1) {
      expect(planningBoxes[index].left).toBeGreaterThanOrEqual(planningBoxes[index - 1].left);
    }
    await page.getByTestId("planning-assigned-user").selectOption({ index: 1 });
    await page.getByTestId("planning-item").selectOption({ index: 1 });
    await page.getByTestId("planning-date").fill(todayUtc());
    const response = page.waitForResponse((result) => result.url().includes("/api/planning/blocks") && result.request().method() === "POST");
    await page.getByTestId("planning-create-submit").click();
    await expect((await response).status()).toBe(201);
    await expect(page.locator("[data-testid^='planning-block-']").first()).toBeVisible();
  });

  test("admin can open the refrigerant workspace and inspect core tabs", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("module-rail-refrigerant").click();
    await expect(page.getByTestId("refrigerant-panel")).toBeVisible();
    await expect(page.getByTestId("refrigerant-overview-metrics")).toBeVisible();
    await page.getByTestId("refrigerant-tab-virgin").click();
    await expect(page.getByTestId("refrigerant-panel")).toContainText("Virgin Tanks");
    await page.getByTestId("refrigerant-tab-history").click();
    await expect(page.getByTestId("refrigerant-panel")).toContainText("Recent Refrigerant Activity");
    await page.getByTestId("refrigerant-tab-exports").click();
    await expect(page.getByTestId("refrigerant-panel")).toContainText("Usage Report CSV");
  });

  test("admin can create a pool log, open report tools, and upload a pool photo", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("module-rail-pool").click();
    await expect(page.getByTestId("pool-log-panel")).toBeVisible();
    await expect(page.getByTestId("pool-report-printable")).toBeVisible();
    await expect(page.getByTestId("pool-export-csv")).toBeVisible();

    await page.getByTestId("pool-tab-setup").click();
    await page.getByTestId("pool-facility-name").fill(uniqueTag("QA Pool"));
    const facilityResponse = page.waitForResponse((response) =>
      response.url().includes("/api/pool/facilities") && response.request().method() === "POST",
    );
    await page.getByTestId("pool-facility-submit").click();
    await expect((await facilityResponse).status()).toBe(201);

    await page.getByTestId("pool-tab-chemicals").click();
    const chemicalName = uniqueTag("QA Cal-Hypo");
    await page.getByTestId("pool-chemical-name").fill(chemicalName);
    const chemicalResponse = page.waitForResponse((response) =>
      response.url().includes("/api/pool/chemicals") && response.request().method() === "POST",
    );
    await page.getByTestId("pool-chemical-submit").click();
    await expect((await chemicalResponse).status()).toBe(201);

    await page.getByTestId("pool-tab-daily").click();
    await page.getByTestId("pool-reading-ph").fill("8.1");
    await page.getByTestId("pool-reading-free-chlorine").fill("0.4");
    await page.getByTestId("pool-safety-0").selectOption("FAIL");
    await page.locator('select[name="chemicalId"]').selectOption({ label: chemicalName });
    await page.getByTestId("pool-chemical-ounces").fill("70");
    const entryResponse = page.waitForResponse((response) =>
      response.url().includes("/api/pool/entries") && response.request().method() === "POST",
    );
    await page.getByTestId("pool-daily-submit").click();
    await expect((await entryResponse).status()).toBe(201);

    await page.getByTestId("pool-tab-history").click();
    await expect(page.getByTestId("pool-history-row").first()).toBeVisible();
    await expect(page.getByTestId("pool-history-row").first()).toContainText("4 lb 6 oz");
    const uploadResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/pool\/entries\/[^/]+\/attachments$/) !== null && response.request().method() === "POST",
    );
    await page.getByTestId("pool-attachment-upload").first().setInputFiles({
      name: "pool-check-photo.png",
      mimeType: "image/png",
      buffer: Buffer.from("MakeReadyOS pool photo smoke"),
    });
    await expect((await uploadResponse).status()).toBe(201);
    await expect(page.getByTestId("pool-history-row").first()).toContainText("pool-check-photo.png");
  });

  test("admin can launch pest control from board cells and drawer actions with make-ready context", async ({ page }) => {
    await login(page, adminEmail, adminPassword);

    const pestCell = page.locator("[data-testid^='builtin-cell-pestStatus-']").first();
    await expect(pestCell).toBeVisible();
    await pestCell.click();
    await expect(page.locator(".pest-control-panel")).toBeVisible();
    await expect(page.getByText("Showing pest requests linked to the selected make-ready item only.")).toBeVisible();

    await page.getByTestId("tab-table").click();
    await expect(page.getByTestId("board-table-view")).toBeVisible();
    await page.locator("[data-testid^='item-details-']").first().click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
    await expect(page.getByTestId("drawer-pest-context")).toBeVisible();
    await page.getByRole("button", { name: "Create Pest Request" }).click();
    await page.getByTestId("item-drawer-close").click();
    await expect(page.getByTestId("item-drawer")).toHaveCount(0);
    await expect(page.locator(".pest-control-panel")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Quick Add Pest Request" })).toBeVisible();
    await expect(page.getByText("Showing pest requests linked to the selected make-ready item only.")).toBeVisible();
    const quickAddForm = page.locator(".pest-control-panel form").first();
    await expect(quickAddForm.locator("select[name='source']")).toHaveValue("Make Ready");

    const pestTag = uniqueTag("QA Pest Link");
    await quickAddForm.locator("input[name='area']").fill(`${pestTag} Area`);
    await quickAddForm.locator("select[name='pestType']").selectOption("Roaches");
    await quickAddForm.locator("input[name='additionalPestType']").fill(pestTag);
    await quickAddForm.locator("textarea[name='description']").fill(`${pestTag} notes`);
    const createResponse = page.waitForResponse((response) =>
      response.url().includes("/api/pest/issues") && response.request().method() === "POST",
    );
    await quickAddForm.getByRole("button", { name: "Quick Add Pest Request" }).click();
    await expect((await createResponse).status()).toBe(201);

    await page.getByRole("button", { name: "Make Ready" }).click();
    const linkedIssue = page.locator("[data-testid^='pest-issue-']").filter({ hasText: pestTag }).first();
    await expect(linkedIssue).toBeVisible();
    await expect(linkedIssue).toContainText("Make Ready linked");
  });

  test("admin can create and search property wiki content", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("module-rail-property-wiki").click();
    await expect(page.getByTestId("property-wiki-panel")).toBeVisible();

    await page.getByTestId("property-wiki-profile-address").fill("500 QA Property Wiki Lane");
    const profileResponse = page.waitForResponse((response) =>
      response.url().includes("/api/property-wiki/profile") && response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Save Overview" }).click();
    await expect((await profileResponse).status()).toBe(200);

    await page.getByTestId("property-wiki-tab-utilities").click();
    const utilityTitle = uniqueTag("QA Utility Shutoff");
    await page.getByTestId("property-wiki-entry-title").fill(utilityTitle);
    const utilityResponse = page.waitForResponse((response) =>
      response.url().includes("/api/property-wiki/entries") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create Entry" }).click();
    await expect((await utilityResponse).status()).toBe(201);
    await expect(page.getByTestId("property-wiki-entry-row").first()).toContainText(utilityTitle);

    await page.getByTestId("property-wiki-tab-vendors").click();
    const vendorName = uniqueTag("QA Wiki Vendor");
    await page.getByTestId("property-wiki-vendor-company").fill(vendorName);
    const vendorResponse = page.waitForResponse((response) =>
      response.url().includes("/api/property-wiki/vendors") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create Vendor" }).click();
    await expect((await vendorResponse).status()).toBe(201);
    await expect(page.getByTestId("property-wiki-vendor-row").first()).toContainText(vendorName);

    await page.getByTestId("property-wiki-tab-documents").click();
    const assetResponse = page.waitForResponse((response) =>
      response.url().includes("/api/property-wiki/assets/upload") && response.request().method() === "POST",
    );
    await page.getByTestId("property-wiki-asset-title").fill(`${vendorName} Manual`);
    await page.getByTestId("property-wiki-asset-file").setInputFiles({
      name: "property-wiki-note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("MakeReadyOS property wiki smoke"),
    });
    await expect((await assetResponse).status()).toBe(201);
    await expect(page.getByTestId("property-wiki-asset-row").first()).toContainText("property-wiki-note.txt");

    await page.getByTestId("property-wiki-search-input").fill("shutoff");
    await page.getByTestId("property-wiki-open-search").click();
    await expect(page.getByTestId("property-wiki-search-results")).toContainText(utilityTitle);
  });

  test("demo tech does not see admin tab", async ({ page }) => {
    await login(page, techEmail, techPassword);
    await expect(page.getByTestId("tab-admin")).toHaveCount(0);
    await expect(page.getByTestId("tab-activity")).toHaveCount(0);
    await expect(page.getByTestId("tab-automations")).toHaveCount(0);
    await expect(page.getByTestId("onboarding-open")).toHaveCount(0);
    await expect(page.getByTestId("saved-views-panel")).toHaveCount(0);
    await expect(page.locator(".module-rail")).toBeVisible();
    await expect(page.getByTestId("table-add-field-shortcut")).toHaveCount(0);
    await expect(page.getByTestId("tab-my-work")).toBeVisible();
    await page.getByTestId("tab-my-work").click();
    await expect(page.getByTestId("my-work-panel")).toBeVisible();
  });

  test("cleared session returns user to login", async ({ page, context }) => {
    await login(page, adminEmail, adminPassword);
    await context.clearCookies();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});
