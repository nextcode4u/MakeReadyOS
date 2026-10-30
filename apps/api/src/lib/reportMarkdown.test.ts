import assert from "node:assert/strict";
import { test } from "node:test";
import { reportMarkdown } from "./reportMarkdown.js";
import { defaultReportSettings, emptyReportDraft, finalWalkReportHtml } from "./finalWalkReport.js";

test("report Markdown supports formatting, lists, tables and ordinary line breaks", () => {
  const html = reportMarkdown("## Welcome\n\n**Bold** and *italic* and ~~old~~\nNext line\n\n- Parking\n- Pets\n\n1. First\n2. Second\n\n| Day | Hours |\n| --- | --- |\n| Monday | Open |\n\n[Office](https://example.com)\n[Email](mailto:office@example.com)");
  for (const fragment of ["<h2>Welcome</h2>", "<strong>Bold</strong>", "<em>italic</em>", "<s>old</s>", "<br>\nNext line", "<ul>", "<ol>", "<table>", 'href="https://example.com"', 'href="mailto:office@example.com"']) assert.ok(html.includes(fragment), fragment);
});

test("report Markdown cannot run HTML, load images or create unsafe links", () => {
  const html = reportMarkdown('<script>alert(1)</script>\n<img src="https://example.com/image" onerror="alert(1)">\n![remote](https://example.com/image)\n[bad](javascript:alert%281%29)\n[bad](data:text/html,test)\n[bad](file:///etc/passwd)\n[bad](//example.com)\n[bad](https://user:secret@example.com)');
  assert.doesNotMatch(html, /<script|<img|href="(?:javascript:|data:|file:|\/\/|https:\/\/user:)/);
  assert.match(html, /&lt;script&gt;/);
});

test("both report fields render Markdown without interpreting other report text", () => {
  const html = finalWalkReportHtml({ propertyName: "Demo", propertyCode: "DEMO", propertyLogo: null, companyName: null, companyLogo: null, unitNumber: "101", technician: null, reviewer: null },
    { ...defaultReportSettings, title: "**Plain title**", introduction: "**Welcome**", footer: "## Community\n\n- Please use designated parking" }, emptyReportDraft());
  assert.match(html, /<h1>\*\*Plain title\*\*<\/h1>/);
  assert.match(html, /<strong>Welcome<\/strong>/);
  assert.match(html, /<h2>Community<\/h2>/);
  assert.match(html, /<li>Please use designated parking<\/li>/);
});
