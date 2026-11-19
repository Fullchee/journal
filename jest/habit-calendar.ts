// Drives History's month calendar in route tests.
import { formatDay, monthOf, shiftMonth, torontoDay } from "@/core";
import { screen } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";

import { apiFetch } from "@/lib/api/api-fetch";

/** A calendar Day's accessible name, as the cell reads it. */
export const calendarCell = (day: string, state: string) =>
  `${formatDay(day, { weekday: "long", day: "numeric", month: "long" })}: ${state}`;

/** The calendar Day that takes a tap. */
export const dayButton = (day: string, state: string) =>
  screen.getByRole("button", { name: calendarCell(day, state) });

/** The calendar Day that takes a tap, once the screen shows it. */
export const findDayButton = (day: string, state: string) =>
  screen.findByRole("button", { name: calendarCell(day, state) });

/** Every POST stays pending, so the screen shows only what the app laid over its cache; GETs still answer. */
export function holdWrites() {
  const answer = jest.mocked(apiFetch).getMockImplementation();

  jest
    .mocked(apiFetch)
    .mockImplementation((path, init, schema) =>
      init.method === "POST"
        ? Promise.withResolvers<never>().promise
        : (answer?.(path, init, schema) ?? Promise.resolve(undefined)),
    );
}

/** Steps back from today's month to the month holding `day`. */
export async function showMonthOf(day: string) {
  await screen.findByRole("button", { name: "Next month" });

  for (
    let month = monthOf(torontoDay(new Date()));
    month > monthOf(day);
    month = shiftMonth(month, -1)
  )
    await userEvent.press(screen.getByRole("button", { name: "Previous month" }));
}
