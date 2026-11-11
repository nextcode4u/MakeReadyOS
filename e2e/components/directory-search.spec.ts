import { expect, test } from "@playwright/test";

test("search finds occupied units and opens archived history without changing directory", async ({ page }) => {
  const property = { id: "demo", code: "DEMO", name: "Demo Property" };
  const unit = { id: "unit", propertyId: "demo", number: "170", property, isActive: true, occupancyStatus: "OCCUPIED", currentResidentName: "Demo Resident" };
  const turn = { id: "archived-turn", propertyId: "demo", property, unitNumber: "170", isArchived: true, vacancyStatus: "OCCUPIED", moveInDate: "2026-01-01" };
  // Use Vite's exact optimized URL so the harness and component share one query context.
  const source = await (await page.request.get("/src/components/DirectorySearchResults.tsx")).text();
  const queryModule = source.match(/from "([^"]+@tanstack_react-query[^"]+)"/)?.[1];
  expect(queryModule).toBeTruthy();
  await page.route("**/api/make-ready-items?*", route => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get("includeArchived")).toBe("true");
    expect(query.get("propertyId")).toBe("demo");
    expect(query.get("q")).toBe("170");
    return route.fulfill({ json: [turn], headers: { "x-total-count": "1", "x-has-more": "false" } });
  });
  await page.route("**/api/units/unit/history", route => route.fulfill({ json: { unit, turns: [{ itemId: "archived-turn", current: false, createdAt: "2025-12-01", moveInDate: "2026-01-01" }] } }));
  await page.route("**/__directory-test", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
const { DirectorySearchResults } = await import('/src/components/DirectorySearchResults.tsx');
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
const { createRoot } = ReactDOM;
import { QueryClient, QueryClientProvider } from '${queryModule}';
function Harness() {
 const [search, setSearch] = React.useState('');
 const [selected, setSelected] = React.useState('');
 return React.createElement(React.Fragment, null,
  React.createElement('p', null, 'Current view: Active'),
  React.createElement('input', { 'aria-label': 'Search units', value: search, onChange: e => setSearch(e.target.value) }),
  search ? React.createElement(DirectorySearchResults, { search, propertyId: 'demo', units: ${JSON.stringify([unit])}, language: 'en', onOpenItem: setSelected }) : null,
  React.createElement('output', null, selected));
}
createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, React.createElement(Harness)));
</script></body></html>` }));
  await page.goto("/__directory-test");
  await page.getByRole("textbox", { name: "Search units" }).fill("170");
  await expect(page.getByText("Occupied directory / OCCUPIED")).toBeVisible();
  await expect(page.getByText("Archived turn / OCCUPIED")).toBeVisible();
  await expect(page.getByText("Current view: Active")).toBeVisible();
  await page.getByRole("button", { name: "History & reports", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("2026-01-01");
  await dialog.getByRole("button", { name: "Open turn & report", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("output")).toHaveText("archived-turn");
});
