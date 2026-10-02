import assert from "node:assert/strict";
import { test } from "node:test";
import { productLinkSchema } from "./productLink.js";

test("product links accept HTTP(S) without fetching and reject unsafe schemes and credentials", () => {
  for (const link of ["https://www.amazon.com/dp/EXAMPLE?tag=test", "http://vendor.example/product", " https://example.com/item "]) {
    assert.equal(productLinkSchema.parse(link), link.trim());
  }
  for (const link of ["javascript:alert(1)", "data:text/html,test", "file:///etc/passwd", "ftp://example.com", "not a link", "https://user:password@example.com", `https://example.com/${"a".repeat(2000)}`]) {
    assert.equal(productLinkSchema.safeParse(link).success, false, link);
  }
});
