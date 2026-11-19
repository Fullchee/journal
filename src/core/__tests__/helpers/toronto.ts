import { isoAt } from "@/core/calendar";

/** The instant Toronto's clock reads this wall time, whatever zone the tests run in; `month` is 0-based like Date's. */
export function torontoDate(
  year: number,
  month: number,
  day: number,
  ...[hour = 0, minute = 0]: number[]
) {
  const date = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);

  return new Date(isoAt(date, hour * 60 + minute));
}
