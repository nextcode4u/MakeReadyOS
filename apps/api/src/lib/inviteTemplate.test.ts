import assert from "node:assert/strict";
import { test } from "node:test";
import { renderInviteHtml } from "./inviteTemplate.js";

const input = { fullName: "Alex <Admin>", username: "alex", to: "alex@example.com", role: "MANAGER", propertyCodes: ["CS", "AB"], language: "en" as const };

test("invitation includes escaped details, properties and password setup action without a password", () => {
  const html = renderInviteHtml(input, "https://example.com");
  assert.ok(html.includes("Alex &lt;Admin&gt;"));
  assert.ok(html.includes("CS, AB"));
  assert.ok(html.includes('href="https://example.com"'));
  assert.ok(html.includes("Set my password"));
  assert.ok(html.includes("expires in 1 hour"));
  assert.ok(!html.includes("Temporary password"));
  assert.ok(!html.includes("<Admin>"));
  assert.ok(!html.includes("<script"));
});

test("Spanish invitation uses localized action and empty-property fallback", () => {
  const html = renderInviteHtml({ ...input, language: "es", propertyCodes: [] }, "https://example.com");
  assert.ok(html.includes('lang="es"'));
  assert.ok(html.includes("Elegir mi contrasena"));
  assert.ok(html.includes("Propiedades asignadas"));
  assert.ok(!html.includes("Sign in to MakeReadyOS"));
});

test("reset template explains unsolicited requests", () => {
  const html = renderInviteHtml(input, "https://example.com/#password-reset=abc", true);
  assert.ok(html.includes("Your password has not changed"));
  assert.ok(html.includes("ACCOUNT SECURITY"));
});
