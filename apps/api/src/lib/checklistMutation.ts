export function checklistMutation(
  current: { completed: boolean },
  input: { completed?: boolean; notes?: string | null },
  userId: string,
  now = new Date(),
) {
  const completionChanged = input.completed !== undefined && input.completed !== current.completed;
  return {
    completionChanged,
    data: {
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(completionChanged ? {
        completed: input.completed,
        completedAt: input.completed ? now : null,
        completedById: input.completed ? userId : null,
      } : {}),
    },
  };
}
