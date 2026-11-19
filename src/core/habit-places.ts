import type { Draft, Habit } from "./habits-view";

const placeKey = (place: string) => place.trim().toLowerCase();

/** "Gym" and " gym " name one Check-in place. */
export const samePlace = (a: string, b: string) => placeKey(a) === placeKey(b);

/** Trimmed, without blanks, one entry per place in its first spelling. */
export function normalizePlaces(places: readonly string[]) {
  const kept: string[] = [];

  for (const raw of places) {
    const place = raw.trim();

    if (place !== "" && kept.every((other) => !samePlace(other, place))) kept.push(place);
  }

  return kept;
}

/** A Habit with no Places can be done anywhere; no place chosen means no filter. */
export const fitsPlace = (habit: Pick<Habit, "places">, place: string) =>
  placeKey(place) === "" ||
  habit.places.length === 0 ||
  habit.places.some((own) => samePlace(own, place));

const sharesPlace = (habit: Pick<Habit, "places">, places: readonly string[]) =>
  places.length === 0 || places.some((place) => fitsPlace(habit, place));

/** The bad Habits a good one can replace: ones done where it is, plus its current pick so the form still shows it. */
export const replaceCandidates = (habits: Habit[], draft: Draft) =>
  habits.filter(
    (habit) =>
      habit.kind === "bad" &&
      habit.id !== draft.id &&
      (habit.id === draft.replaces || sharesPlace(habit, draft.places)),
  );
