import { executeScheduledAutomationRules } from "./lib/scheduledAutomations.js";
import { prisma } from "./lib/prisma.js";

try {
  const result = await executeScheduledAutomationRules({ mode: "SCHEDULED" });
  console.log(`Scheduled automation evaluation completed: ${result.rulesEvaluated} rules, ${result.checkedCount} checked, ${result.matchedCount} matched, ${result.actionCount} actions.`);
  for (const rule of result.results) {
    console.log(`${rule.name}: checked=${rule.checkedCount} matched=${rule.matchedCount} actions=${rule.actionCount} warnings=${rule.warnings.length} errors=${rule.errors.length}`);
  }
  if (result.results.some((rule) => rule.errors.length > 0)) process.exitCode = 1;
} catch (error) {
  console.error("Scheduled automation evaluation failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
