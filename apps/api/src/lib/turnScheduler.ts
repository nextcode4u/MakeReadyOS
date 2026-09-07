import { prisma } from "./prisma.js";
import { executeScheduledAutomationRules } from "./scheduledAutomations.js";
import { turnSetupPrefix } from "./turnSetup.js";
import { runEnabledTurnAssignments } from "./turnAssignments.js";

// Only the explicitly enabled guided pack runs here. Legacy rules keep their existing timer behavior.
export function startTurnScheduler() {
  let stopped = false;
  let running: Promise<void> | null = null;
  const tick = () => {
    if (stopped || running) return;
    running = (async () => {
      const rules = await prisma.automationRule.findMany({ where: { templateId: { startsWith: turnSetupPrefix }, enabled: true, isArchived: false, property: { isActive: true } }, select: { id: true }, orderBy: { name: "asc" } });
      for (const rule of rules) {
        if (stopped) break;
        const result = await executeScheduledAutomationRules({ ruleId: rule.id, mode: "SCHEDULED" });
        if (result.results.some((entry) => entry.errors.length)) console.error("Guided turn scheduling reported errors", rule.id);
      }
      if (!stopped) await runEnabledTurnAssignments();
    })().catch((error) => console.error("Guided turn scheduling failed", error instanceof Error ? error.message : "Unknown error")).finally(() => { running = null; });
  };
  const timer = setInterval(tick, 5 * 60 * 1000);
  timer.unref();
  return async () => { stopped = true; clearInterval(timer); await running; };
}
