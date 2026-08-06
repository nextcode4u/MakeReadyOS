export const ALL_ACCESSIBLE_PROPERTIES_SCOPE_LABEL = "All accessible properties";
export const FILTERED_PROPERTY_SCOPE_LABEL = "Filtered property";

export function propertyScopeLabel(property: { code: string; name: string } | null | undefined) {
  if (!property) return FILTERED_PROPERTY_SCOPE_LABEL;
  const code = property.code.trim();
  const name = property.name.trim();
  if (!code) return name;
  if (!name || name === code) return code;
  return `${code} / ${name}`;
}
