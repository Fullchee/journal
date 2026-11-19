import { isoWeekOf, torontoDay, weekLabel } from "@/core";
import { Text } from "@/ui";
import { useState } from "react";

import { QueryView } from "@/components/note-body";
import { Screen } from "@/components/screen";
import { HitRateTrend, WorkDaySection } from "@/components/work-week";
import { usePlans, useWeeklyNotes, type WeeklyNote } from "@/lib/data/work";
import { hitRateTrend, workWeekDays } from "@/lib/work-week";

function WeekDays({ note }: { note: WeeklyNote | undefined }) {
  const days = note === undefined ? [] : workWeekDays(note);

  return days.length === 0 ? (
    <Text variant="muted">Nothing logged this week yet.</Text>
  ) : (
    days.map((day) => <WorkDaySection key={day.heading} day={day} />)
  );
}

/** Read-only: the vault's skills write the Work track; this shows the current week and the Hit rate. */
export default function WorkWeekScreen() {
  const [week] = useState(() => isoWeekOf(torontoDay(new Date())));

  return (
    <Screen>
      <Text variant="muted">{weekLabel(week)}</Text>
      <QueryView query={usePlans()}>
        {(body) => <HitRateTrend plans={hitRateTrend(body)} />}
      </QueryView>
      <QueryView query={useWeeklyNotes(week)}>
        {({ notes }) => <WeekDays note={notes[0]} />}
      </QueryView>
    </Screen>
  );
}
