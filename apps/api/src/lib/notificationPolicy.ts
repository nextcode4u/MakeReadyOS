export const routineNotificationCategories = ["STATUS_CHANGE", "CHECKLIST", "BATCH_CHANGE"] as const;
export const needToKnowMutedCategories = [...routineNotificationCategories, "POND_MILESTONE"] as const;

export function notificationEnabledByDefault(category: string) {
  return !routineNotificationCategories.some(routine => routine === category);
}
