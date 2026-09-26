import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import ts from "../apps/web/node_modules/typescript/lib/typescript.js";
import { turnBlocker, turnSpanish, turnText } from "../apps/web/src/lib/turnLocale.js";
import { reportChecks, reportSections, technicianChecks } from "../apps/api/src/lib/finalWalkReport.js";
import { pondMilestones } from "../apps/api/src/lib/pondMilestones.js";

test("English and Spanish main catalogs have matching keys and interpolation variables", () => {
  const source = readFileSync(new URL("../apps/web/src/lib/i18n.ts", import.meta.url), "utf8");
  const file = ts.createSourceFile("i18n.ts", source, ts.ScriptTarget.Latest, true);
  const catalogs: Record<string, Record<string, string>> = {};
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && ["en", "es"].includes(node.name.getText(file)) && ts.isObjectLiteralExpression(node.initializer)) {
      catalogs[node.name.getText(file)] = Object.fromEntries(node.initializer.properties.filter(ts.isPropertyAssignment).map(entry => [(entry.name as ts.StringLiteral).text, (entry.initializer as ts.StringLiteral).text]));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(Object.keys(catalogs.en).length > 1000);
  assert.deepEqual(Object.keys(catalogs.es).sort(), Object.keys(catalogs.en).sort());
  for (const [key, english] of Object.entries(catalogs.en)) {
    assert.ok(catalogs.es[key].trim(), key);
    assert.deepEqual(catalogs.es[key].match(/\{\w+\}/g)?.sort() ?? [], english.match(/\{\w+\}/g)?.sort() ?? [], key);
  }
});

test("turn copy has no duplicate source keys or missing literal translations", () => {
  const path = new URL("../apps/web/src/lib/turnLocale.ts", import.meta.url);
  const file = ts.createSourceFile("turnLocale.ts", readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const keys = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) {
      assert.ok(!keys.has(node.name.text), `Duplicate: ${node.name.text}`);
      keys.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  for (const name of readdirSync(new URL("../apps/web/src/components/", import.meta.url)).filter(name => name.endsWith(".tsx"))) {
    const component = ts.createSourceFile(name, readFileSync(new URL(`../apps/web/src/components/${name}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const check = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.getText(component) === "turnText" && node.arguments[1] && ts.isStringLiteral(node.arguments[1])) {
        assert.ok(turnSpanish[node.arguments[1].text], `${name}: ${node.arguments[1].text}`);
      }
      ts.forEachChild(node, check);
    };
    check(component);
  }
});

test("all current API inspection labels and team milestone names have Spanish copy", () => {
  for (const source of [...technicianChecks.map(check => check.label), ...reportChecks.map(check => check.label), ...reportSections.map(section => section.title), ...pondMilestones.map(milestone => milestone.name)]) {
    assert.ok(turnSpanish[source], source);
    assert.notEqual(turnText("es", source), source);
    assert.equal(turnText("en", source), source);
  }
  assert.equal(turnText("es", "Custom supplier note"), "Custom supplier note");
});

test("readiness translations retain counts and user-authored task and part names", () => {
  assert.equal(turnBlocker("es", "Required checklist: Inspect custom cabinet"), "Verificación obligatoria: Inspect custom cabinet");
  assert.match(turnBlocker("es", "Parts on order: Special filter (2 each). Record receipt/use or cancel the order if no longer needed."), /Special filter \(2 each\)/);
  assert.match(turnBlocker("es", "8 technician preparation checks need completion by the technician in Work, not the final-walk inspector."), /pendientes: 8/);
  assert.match(turnBlocker("es", "3 final-walk checks are not recorded. Inspect each item or record why it is not applicable."), /sin registrar: 3/);
  assert.match(turnBlocker("es", "1 final-walk findings need attention. Resolve and recheck them before marking ready."), /atención: 1/);
  assert.equal(turnBlocker("en", "Required checklist: Custom"), "Required checklist: Custom");
  assert.equal(turnBlocker("es", "New server warning"), "New server warning");
});
