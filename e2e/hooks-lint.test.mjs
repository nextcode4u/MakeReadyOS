import assert from "node:assert/strict";
import { test } from "node:test";
import { ESLint } from "eslint";

test("CI hook-order lint catches hooks after an early return", async () => {
  const eslint = new ESLint();
  const [result] = await eslint.lintText('import { useState } from "react"; function Broken({ empty }) { if (empty) return null; const [value] = useState(0); return value; }', {
    filePath: "apps/web/src/HookOrderRegression.tsx",
  });
  assert.ok(result.messages.some(message => message.ruleId === "react-hooks/rules-of-hooks" && message.severity === 2));
});
