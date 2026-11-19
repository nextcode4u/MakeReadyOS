import { expect, test } from "@playwright/test";

test("queued work can be reviewed and its banner clears after sync", async ({ page }) => {
  await page.route("**/__connection-test", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
const { ConnectionStatus } = await import('/src/components/ConnectionStatus.tsx');
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
function Harness() {
 const [count, setCount] = React.useState(1);
 const [syncing, setSyncing] = React.useState(false);
 const [review, setReview] = React.useState(false);
 return React.createElement(React.Fragment, null,
  React.createElement(ConnectionStatus, { online: true, degraded: false, lastIssueAt: null, pendingSyncCount: count, retryingCount: count, blockedCount: 0, conflictCount: 0, syncing, language: 'en', onReviewQueue: () => setReview(true), onRetry: () => setSyncing(true) }),
  review ? React.createElement('p', null, 'Queued photo details') : null,
  React.createElement('button', { onClick: () => { setCount(0); setSyncing(false); } }, 'Simulate confirmed upload'));
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));
</script></body></html>` }));
  await page.goto("/__connection-test");
  await page.getByTestId("connection-review-queue").click();
  await expect(page.getByText("Queued photo details")).toBeVisible();
  await page.getByTestId("connection-retry").click();
  await expect(page.getByTestId("connection-retry")).toBeDisabled();
  await page.getByRole("button", { name: "Simulate confirmed upload" }).click();
  await expect(page.getByTestId("connection-banner")).toHaveCount(0);
});
