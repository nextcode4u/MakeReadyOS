import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page, options: { fail?: boolean; readOnly?: boolean } = {}) {
  let saved = { version: 0, value: { technicianResults: {}, technicianResolution: "", residentDoorCode: "", residentAccessCode: "", includeResidentCodes: false, mailbox: "", mailboxSource: "DIRECTORY", mailboxKeys: "", homeKeys: "", fobs: "", remotes: "" }, technicianChecks: [{ id: "tech-v2-1", label: "Initial condition photos and repair scope recorded; trash-out complete" }], technicianFollowUp: "", correctionPending: false, updatedAt: null as string | null, readOnly: Boolean(options.readOnly), preparationReadOnly: false };
  const writes: any[] = [];
  await page.route("**/api/make-ready-items/demo/resident-codes", async route => {
    if (route.request().method() === "PUT") {
      const input = route.request().postDataJSON();
      writes.push(input);
      if (options.fail) return route.fulfill({ status: 409, json: { message: "Report changed in another session" } });
      expect(input.version).toBe(saved.version);
      saved = { ...saved, version: saved.version + 1, value: { ...saved.value, ...input.value }, updatedAt: new Date().toISOString() };
    }
    return route.fulfill({ json: saved });
  });
  const source = await (await page.request.get("/src/components/ResidentCodesPanel.tsx")).text();
  const queryModule = source.match(/from "([^"]+@tanstack_react-query[^"]+)"/)?.[1];
  expect(queryModule).toBeTruthy();
  await page.route("**/__preparation-test", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
const { ResidentCodesPanel } = await import('/src/components/ResidentCodesPanel.tsx');
const { acceptVerifiedSession, getVerifiedSession } = await import('/src/lib/verifiedSession.ts');
acceptVerifiedSession('demo-tech', getVerifiedSession());
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import { QueryClient, QueryClientProvider } from '${queryModule}';
function Harness() {
 const [open, setOpen] = React.useState(true);
 return React.createElement(React.Fragment, null,
  React.createElement('button', { onClick: () => setOpen(v => !v) }, 'Toggle unit'),
  open ? React.createElement(ResidentCodesPanel, { itemId: 'demo', status: 'IN_PROGRESS', language: 'en' }) : null);
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, React.createElement(Harness)));
</script></body></html>` }));
  await page.goto("/__preparation-test");
  await expect(page.getByTestId("tech-check-tech-v2-1")).toBeVisible();
  return { writes, saved: () => saved };
}

test("checks and resident details autosave and survive reopening without pressing Save", async ({ page }) => {
  const fixture = await setup(page);
  await page.getByTestId("tech-check-tech-v2-1").selectOption("CHECKED");
  await expect.poll(() => fixture.saved().version).toBe(1);
  await expect(page.getByLabel("New resident door code", { exact: true })).toBeEnabled();
  await page.getByLabel("New resident door code", { exact: true }).fill("1234");
  await expect.poll(() => fixture.saved().value.residentDoorCode).toBe("1234");
  await expect(page.getByTestId("preparation-save-status")).toHaveText("No unsaved changes.");
  await expect(page.getByLabel("New resident door code", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Toggle unit" }).click();
  await page.getByRole("button", { name: "Toggle unit" }).click();
  await expect(page.getByTestId("tech-check-tech-v2-1")).toHaveValue("CHECKED");
  await expect(page.getByLabel("New resident door code", { exact: true })).toHaveValue("1234");
  expect(fixture.writes).toHaveLength(2);
});

test("closing the panel flushes a change before the debounce fires", async ({ page }) => {
  const fixture = await setup(page);
  await page.getByTestId("tech-check-tech-v2-1").selectOption("CHECKED");
  await page.getByRole("button", { name: "Toggle unit" }).click();
  await expect.poll(() => fixture.saved().version).toBe(1);
});

test("exceptions wait for their required detail before autosaving", async ({ page }) => {
  const fixture = await setup(page);
  await page.getByTestId("tech-check-tech-v2-1").selectOption("ATTENTION");
  await expect(page.getByRole("alert")).toContainText("Add a detail");
  expect(fixture.writes).toHaveLength(0);
  await page.getByLabel("Exception / detail").fill("Replace damaged face");
  await expect.poll(() => fixture.saved().version).toBe(1);
});

test("server conflicts stay visible without an automatic retry loop", async ({ page }) => {
  const fixture = await setup(page, { fail: true });
  await page.getByTestId("tech-check-tech-v2-1").selectOption("CHECKED");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.waitForTimeout(1800);
  expect(fixture.writes).toHaveLength(1);
  await expect(page.getByTestId("tech-check-tech-v2-1")).toHaveValue("CHECKED");
});

test("after handoff autosave sends only preparation checks", async ({ page }) => {
  const fixture = await setup(page, { readOnly: true });
  await expect(page.getByLabel("New resident door code", { exact: true })).toBeDisabled();
  await page.getByTestId("tech-check-tech-v2-1").selectOption("CHECKED");
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(Object.keys(fixture.writes[0].value)).toEqual(["technicianResults"]);
});

test("switching accounts does not flush the previous user's entries", async ({ page }) => {
  const fixture = await setup(page);
  await page.getByTestId("tech-check-tech-v2-1").selectOption("CHECKED");
  await page.evaluate(async () => {
    const session = await import(/* @vite-ignore */ "/src/lib/verifiedSession.ts");
    session.clearVerifiedSession();
    session.acceptVerifiedSession("different-user", session.getVerifiedSession());
  });
  await page.getByRole("button", { name: "Toggle unit" }).click();
  await page.waitForTimeout(1000);
  expect(fixture.writes).toHaveLength(0);
});

test("Android autosave keeps an encrypted pending save when delivery fails", async ({ page }) => {
  test.skip(process.env.VITE_ANDROID_SHELL !== "true", "Packaged Android queue path");
  await setup(page);
  await page.route("**/api/make-ready-items/demo/resident-codes", route => route.request().method() === "PUT" ? route.abort() : route.fallback());
  await page.getByLabel("New resident door code", { exact: true }).fill("4321");
  await expect(page.getByTestId("preparation-save-status")).toHaveText("Pending sync.");
  await page.getByRole("button", { name: "Toggle unit" }).click();
  await page.getByRole("button", { name: "Toggle unit" }).click();
  await expect(page.getByLabel("New resident door code", { exact: true })).toHaveValue("4321");
  await expect(page.getByLabel("New resident door code", { exact: true })).toBeDisabled();
  const queued = await page.evaluate(async () => {
    const queue = await import(/* @vite-ignore */ "/src/lib/offlineSync.ts");
    const jobs = await queue.getOfflineSyncJobs();
    return { count: jobs.length, plain: JSON.stringify(jobs) };
  });
  expect(queued.count).toBe(1);
  expect(queued.plain).not.toContain("4321");
});
