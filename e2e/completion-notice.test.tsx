import assert from "node:assert/strict";
import React from "../apps/web/node_modules/react/index.js";
import { test } from "node:test";
import { renderToStaticMarkup } from "../apps/web/node_modules/react-dom/server.js";
import { CompletionNotice } from "../apps/web/src/components/CompletionNotice";

test("completion errors have a visible heading and separate blocker lines", () => {
  const html = renderToStaticMarkup(<CompletionNotice language="en" error message="Finish inspection; Confirm key counts" />);
  assert.match(html, /class="completion-blockers"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Action required/);
  assert.match(html, /<li>Finish inspection<\/li><li>Confirm key counts<\/li>/);
});

test("disabled download explanations are localized and linked without treating them as errors", () => {
  const html = renderToStaticMarkup(<CompletionNotice language="es" id="resident-download-help" message="Guarda los cambios <primero>." />);
  assert.match(html, /Acción requerida/);
  assert.match(html, /role="status"/);
  assert.match(html, /id="resident-download-help"/);
  assert.match(html, /&lt;primero&gt;/);
});
