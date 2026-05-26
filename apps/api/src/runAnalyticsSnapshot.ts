import { runAnalyticsSnapshot } from "./lib/analytics.js";
import { prisma } from "./lib/prisma.js";

try {
  const result = await runAnalyticsSnapshot();
  console.log(`Analytics snapshot completed for ${result.count} properties on ${result.date.toISOString().slice(0, 10)}.`);
  for (const snapshot of result.snapshots) {
    console.log(`${snapshot.property.code}: active=${snapshot.activeTurns} vacant=${snapshot.vacant} overdue=${snapshot.overdue} highRisk=${snapshot.highRisk} avgDaysVacant=${snapshot.averageDaysVacant.toFixed(1)}`);
  }
} catch (error) {
  console.error("Analytics snapshot failed", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
