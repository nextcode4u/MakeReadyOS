import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { renderPdfFromHtml } from "./pdf.js";

test("PDF rendering preserves multipage content and header/footer options", { skip: !process.env.PDF_TEST_CHROMIUM_PATH }, async () => {
  const previous = process.env.CHROMIUM_PATH;
  process.env.CHROMIUM_PATH = process.env.PDF_TEST_CHROMIUM_PATH;
  const directory = await mkdtemp(join(tmpdir(), "mros-pdf-test-"));
  try {
    const pdf = await renderPdfFromHtml('<html><head><style>@page { size:letter landscape; } .next { break-before:page; }</style></head><body><h1>First audit page</h1><section class="next"><h1>Final audit page</h1><p>Tank DIRTY-001: 4.25 lb</p></section></body></html>', {
      headerTemplate: '<div style="font-size:9px">Report header</div>',
      footerTemplate: '<div style="font-size:9px">Page <span class="pageNumber"></span></div>',
    });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    const path = join(directory, "report.pdf");
    await writeFile(path, pdf);
    const text = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" });
    for (const content of ["First audit page", "Final audit page", "DIRTY-001", "4.25 lb", "Report header", "Page 2"]) assert.ok(text.includes(content), `Missing PDF content: ${content}`);
  } finally {
    if (previous === undefined) delete process.env.CHROMIUM_PATH;
    else process.env.CHROMIUM_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
