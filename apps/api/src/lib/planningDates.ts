// Planned dates are calendar dates stored at UTC midnight, not local instants.
export function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number) {
  const next = startOfDay(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function dateKey(date: Date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

export function defaultPlanningWindow(now = new Date()) {
  const from = startOfDay(now);
  return { from, to: addDays(from, 7) };
}
