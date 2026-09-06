import assert from "node:assert/strict";
import { test } from "node:test";
import { booleanFlag } from "./booleanFlag.js";

test("boolean flags distinguish false query strings from true", () => {
  for (const value of [true, "true", "1"]) assert.equal(booleanFlag.parse(value), true);
  for (const value of [false, "false", "0"]) assert.equal(booleanFlag.parse(value), false);
  assert.equal(booleanFlag.optional().parse(undefined), undefined);
  assert.equal(booleanFlag.default(false).parse(undefined), false);
  for (const value of [null, "", "yes", "anything", [], ["true", "false"], {}, 1, 0]) {
    assert.equal(booleanFlag.safeParse(value).success, false, `Unexpected flag accepted: ${JSON.stringify(value)}`);
  }
});
