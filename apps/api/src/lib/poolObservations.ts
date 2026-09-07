type SafetyCheck = { label: string; value: string; notes?: string | null; sortOrder?: number };

export function poolSafetyObservations(expected: string[], submitted: SafetyCheck[] = []) {
  const byLabel = new Map(submitted.map(check => [check.label, check]));
  return [
    ...expected.map((label, sortOrder) => byLabel.get(label) ?? { label, value: "NOT_CHECKED", notes: null, sortOrder }),
    ...submitted.filter(check => !expected.includes(check.label)),
  ];
}

export function poolObservationGaps(readings: Record<string, unknown>, checks: SafetyCheck[]) {
  const fields = [
    ["ph", "pH"], ["freeChlorine", "free chlorine"], ["combinedChlorine", "combined chlorine"],
    ["totalAlkalinity", "total alkalinity"], ["cyanuricAcid", "CYA"], ["calciumHardness", "calcium hardness"],
  ];
  return [
    ...fields.filter(([key]) => typeof readings[key] !== "number" || !Number.isFinite(readings[key])).map(([, label]) => label),
    ...checks.filter(check => check.value === "NOT_CHECKED").map(check => check.label),
  ];
}
