import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { chromium } from "../apps/api/node_modules/playwright-core/index.mjs";

const executablePath = process.env.TEST_BROWSER_PATH;
for (const viewport of [{ width: 360, height: 640 }, { width: 640, height: 360 }, { width: 1280, height: 800 }]) {
  test(`inspection gallery remains reachable at ${viewport.width}x${viewport.height}`, { skip: !executablePath }, async () => {
    const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage({ viewport });
      await page.setContent(`<div class="modal-backdrop"><section class="modal-panel" data-testid="attachment-gallery-modal">
        <header class="modal-header"><h3>Inspection Gallery</h3><button>Close</button></header>
        <div class="modal-body"><div style="height:700px">Filters and inspection tools</div>
          <div class="attachment-gallery inspection-gallery-grid">${Array.from({ length: 12 }, (_, i) => `<button style="height:180px" data-photo="${i}">Photo ${i}</button>`).join("")}</div>
        </div></section></div>`);
      await page.addStyleTag({ content: readFileSync("apps/web/src/styles/app.css", "utf8") });
      const body = page.locator(".modal-body");
      assert.equal(await body.evaluate(e => getComputedStyle(e).overflowY), "auto");
      await page.locator('[data-photo="11"]').click();
      assert.ok(await body.evaluate(e => e.scrollTop > 0), "the whole gallery must scroll, not just a clipped grid");
      const bounds = await page.locator('[data-photo="11"]').boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height);
      assert.ok(await body.evaluate(e => e.scrollWidth <= e.clientWidth + 1), "cards must fit narrow phones");
      await page.getByRole("button", { name: "Close", exact: true }).click();
    } finally {
      await browser.close();
    }
  });
}
