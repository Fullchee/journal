/** The button every Habit notification carries beside Done and Skip; it logs nothing. */
export const POSTPONE_ACTION = { title: "Postpone", pressAction: { id: "postpone" } } as const;

export const POSTPONE_MS = 10 * 60_000;

/** One postponed reminder per Habit: postponing again replaces it. */
export const postponedId = (habit: string) => `postponed-${habit}`;
