export const routineNotificationCategories = ["STATUS_CHANGE", "CHECKLIST", "BATCH_CHANGE"] as const;

export function notificationEnabledByDefault(category: string) {
  return !routineNotificationCategories.some(routine => routine === category);
}
