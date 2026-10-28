import assert from "node:assert/strict";
import test from "node:test";
import { resolveRelayOrigin } from "./pushRelayClient.js";

test("relay defaults to push plus the configured application hostname", () => {
  assert.equal(resolveRelayOrigin("", "https://example.com"), "https://push.example.com");
  assert.equal(resolveRelayOrigin("  ", "https://Example.COM/"), "https://push.example.com");
  assert.equal(resolveRelayOrigin("", "https://app.example.co.uk"), "https://push.app.example.co.uk");
  assert.equal(resolveRelayOrigin("", "https://example.com:8443"), "https://push.example.com");
  assert.equal(resolveRelayOrigin("https://shared.example.net:8443/", "https://example.com"), "https://shared.example.net:8443");
  assert.equal(resolveRelayOrigin("https://shared.example.net", ""), "https://shared.example.net");
});

test("relay inference rejects missing, local and malformed origins and never masks a bad override", () => {
  for (const app of ["", "example.com", "http://example.com", "https://localhost", "https://app.localhost", "https://127.0.0.1", "https://[::1]", "https://example.com/path", "https://example.com/?q=1", "https://example.com/#x", "https://user:secret@example.com", "https://bad_host.example.com", "https://example.com."]) {
    assert.equal(resolveRelayOrigin("", app), null, app);
  }
  for (const override of ["invalid", "http://push.example.com", "https://push.example.com/path", "https://user:secret@push.example.com", "https://push.example.com/?q=1", "https://push.example.com/#x"]) {
    assert.equal(resolveRelayOrigin(override, "https://example.com"), null, override);
  }
});
