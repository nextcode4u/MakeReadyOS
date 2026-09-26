import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("fresh demo units and people use explicitly fictional labels", () => {
  const seed = readFileSync(new URL("../apps/api/src/seed.ts", import.meta.url), "utf8");
  const units = [...seed.matchAll(/number: "([^"]+)"/g)].map(match => match[1]);
  const applicants = [...seed.matchAll(/applicant: "([^"]+)"/g)].map(match => match[1]);
  const technicians = [...seed.matchAll(/assignedTech: "([^"]+)"/g)].map(match => match[1]);
  assert.equal(units.length, 21);
  assert.ok(units.every(value => /^(DG|DS)-\d{3}$/.test(value)));
  assert.ok(applicants.length > 0 && applicants.every(value => /^DEMO APPLICANT \d+$/.test(value)));
  assert.ok(technicians.length > 0 && technicians.every(value => /^Demo (Tech [A-D]|Model)$/.test(value)));
  assert.match(seed, /name: "Demo Gardens"/);
  assert.match(seed, /name: "Demo Springs"/);
});
