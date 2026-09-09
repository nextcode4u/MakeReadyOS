export function statusDisplayName(option: { value: string; displayName?: string | null }) {
  return option.displayName ?? option.value.replace(/_/g, " ");
}
