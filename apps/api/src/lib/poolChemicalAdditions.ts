type Chemical = {
  id: string;
  name: string;
  unit: string;
  allowedUnits?: readonly string[] | null;
  isActive?: boolean;
};

export function validatePoolChemicalAdditions<T extends { chemicalId?: string | null; chemicalName: string; unit: string }>(additions: T[], propertyChemicals: readonly Chemical[]): T[] {
  return additions.map((addition) => {
    if (!addition.chemicalId) return addition;
    const chemical = propertyChemicals.find((entry) => entry.id === addition.chemicalId && entry.isActive !== false);
    if (!chemical) throw Object.assign(new Error("Selected chemical is not active for this property"), { statusCode: 400 });
    const units = new Set([chemical.unit, ...(chemical.allowedUnits ?? [])]);
    // The mobile pounds/ounces input submits combined weight in ounces.
    const compatibleWeight = (addition.unit === "OUNCES" || addition.unit === "POUNDS") && (units.has("OUNCES") || units.has("POUNDS"));
    if (!units.has(addition.unit) && !compatibleWeight) {
      throw Object.assign(new Error(`Measurement unit is not allowed for ${chemical.name}`), { statusCode: 400 });
    }
    return { ...addition, chemicalName: chemical.name };
  });
}
