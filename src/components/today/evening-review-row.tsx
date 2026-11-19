import { minuteOfDay } from "@/core";
import { useQuery } from "@tanstack/react-query";

import { NavRow } from "@/components/nav-row";
import { calendarLinksQuery } from "@/lib/data/evening-review";

/** The Evening review opens from 5 PM, when most of the day's events have passed. */
const EVENING_MINUTE = 17 * 60;

/** Today's way into the Evening review: only in the evening, and only once a Habit has a Calendar link. */
// eslint-disable-next-line eslint-react/purity -- whether it is evening yet reads the clock on each render
export function EveningReviewRow({ now = new Date() }: { now?: Date }) {
  const { data } = useQuery(calendarLinksQuery);

  if (data === undefined || minuteOfDay(now) < EVENING_MINUTE || data.links.length === 0)
    return null;

  return (
    <NavRow
      href="/evening-review"
      label="Evening review"
      detail="Confirm today's calendar events"
    />
  );
}
