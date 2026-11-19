import {
  shiftDay,
  answerChecks,
  dueBox,
  dueToday,
  earliestReschedule,
  habitDays,
  torontoDay,
  isOneOff,
  isTimed,
  isTinyDay,
  MISSED,
  type Counts,
  type DueHabit,
  type Durations,
  type Habit,
  type TimedHabit,
  formatMinutes,
  isoAt,
  minuteOfDay,
} from "@/core";
import {
  HabitDueRow,
  Icon,
  RescheduleSheet,
  SkipSheet,
  Text,
  DateField,
  type HabitDueRowProps,
} from "@/ui";
import { router } from "expo-router";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { CelebrationSpot } from "@/components/celebration";
import { HabitDayDetail, type DayDetail } from "@/components/habits/habit-day-detail";
import { NavRow } from "@/components/nav-row";
import { Section } from "@/components/screen";
import { SeasonCircleOffers, WhoYoullSee } from "@/components/today/circle-rows";
import { RepairPrompts } from "@/components/today/repair-prompts";
import { SeasonNudges } from "@/components/today/season-nudges";
import { useCheckIns } from "@/lib/data/check-ins";
import { useIsOnline } from "@/lib/data/data-provider";
import {
  useAddDuration,
  useCheckHabit,
  useHabitTracker,
  useReschedule,
  withChecks,
  type HabitCheck,
  type HabitsBody,
} from "@/lib/data/habits";

// Minutes typed now were just spent, so the entry starts that long ago, but never before midnight.
const startedAgo = (now: Date, minutes: number) =>
  formatMinutes(Math.max(0, minuteOfDay(now) - minutes));

// An overdue One-off's Not done is stored on its past date, so Today no longer lists it; it stays under
// "Done today" for as long as this screen is open.
function missedHere(
  habits: Habit[],
  ids: string[],
  records: { counts: Counts; durations: Durations },
): DueHabit[] {
  return habits.flatMap((habit) => {
    if (!ids.includes(habit.id) || !isOneOff(habit)) return [];
    const day = habitDays(habit, records).on(new Date(isoAt(habit.startDate)));

    return day.status === "missed"
      ? { habit, day, time: null, dueDate: habit.startDate, overdue: false, planned: false }
      : [];
  });
}

/** Same query as the Habits tab, so both read one cache and a check shows on both. */
export function HabitsDueToday() {
  const { data, isError } = useHabitTracker();

  return (
    <Section title="Habits due today">
      {data ? (
        <DueHabits body={data} />
      ) : (
        <>
          <Text variant="muted">{isError ? "Couldn't load Habits." : "Loading Habits…"}</Text>
          <View>
            <NavRow href="/habits" label="All habits" />
          </View>
        </>
      )}
    </Section>
  );
}

/**
 * The cache takes a check at once but tells its readers on TanStack's next tick, so a ticked Habit would linger in the
 * due list. This screen lays each check it sends over the body until a newer body lands, which already holds them.
 */
function useSentChecks(fetched: HabitsBody) {
  const [sent, setSent] = useState<{ base: HabitsBody; checks: HabitCheck[] }>({
    base: fetched,
    checks: [],
  });

  if (sent.base !== fetched) setSent({ base: fetched, checks: [] });

  return {
    body: withChecks(fetched, sent.base === fetched ? sent.checks : []),
    // Functional, since Undo's toast calls this long after the render that made it.
    lay: (checks: HabitCheck[]) =>
      setSent((was) => ({ base: was.base, checks: [...was.checks, ...checks] })),
  };
}

function DueHabits({ body: fetched }: { body: HabitsBody }) {
  const { body, lay } = useSentChecks(fetched);
  const check = useCheckHabit(lay);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [rescheduling, setRescheduling] = useState<Habit | null>(null);
  const [skipping, setSkipping] = useState<Habit | null>(null);
  const [missedIds, setMissedIds] = useState<string[]>([]);
  // eslint-disable-next-line eslint-react/purity -- what is due counts from this moment, so each render reads the clock
  const today = new Date();
  const date = torontoDay(today);
  const records = { counts: body.counts ?? {}, durations: body.durations ?? {} };
  const rows = dueToday(body.habits, records.counts, records.durations, today);
  const tinyDay = isTinyDay(useCheckIns().data?.checkIns ?? [], today);
  const listed = new Set(rows.map((row) => row.habit.id));
  const open = rows.filter((row) => row.day.status === "empty");

  const settled = [
    ...rows.filter((row) => row.day.status !== "empty"),
    ...missedHere(body.habits, missedIds, records).filter((row) => !listed.has(row.habit.id)),
  ];

  const answer = (due: DueHabit, count: number) => {
    const checks = answerChecks(due, count, date);

    check(...checks);

    if (checks.some((next) => next.count === MISSED && next.date !== date))
      setMissedIds((ids) => [...ids, due.habit.id]);
  };

  const row = (due: DueHabit) => (
    <DueRow
      key={due.habit.id}
      due={due}
      today={today}
      tinyDay={tinyDay}
      onAnswer={(count) => answer(due, count)}
      onOpenDay={(habit) => setDetail({ habit, date })}
      onReschedule={() => setRescheduling(due.habit)}
      onSkip={() => {
        answer(due, MISSED);
        setSkipping(due.habit);
      }}
    />
  );

  return (
    <>
      <RepairPrompts body={body} today={today} />
      <SeasonNudges body={body} today={today} />
      <SeasonCircleOffers body={body} today={today} />
      {rows.length === 0 && <Text variant="muted">Nothing due today.</Text>}
      <View>
        {open.map((due) => row(due))}
        <SettledRows
          ids={settled.map((due) => due.habit.id)}
          rows={settled.map((due) => row(due))}
        />
        <NavRow href="/habits" label="All habits" />
      </View>
      {detail && (
        <HabitDayDetail
          detail={detail}
          durations={records.durations}
          onClose={() => setDetail(null)}
        />
      )}
      {rescheduling && (
        <RescheduleDue habit={rescheduling} today={today} onClose={() => setRescheduling(null)} />
      )}
      {skipping && (
        <SkipSheet
          name={skipping.name}
          onSave={(skip) => {
            check({ date, habit: skipping.id, count: MISSED, ...skip });
            setSkipping(null);
          }}
          onClose={() => setSkipping(null)}
        />
      )}
    </>
  );
}

// Stays mounted while empty, so an opened list is still open when the next answer lands in it.
// An answered row leaves the due list at once, so while the list is closed its celebration plays on the toggle.
function SettledRows({ ids, rows }: { ids: string[]; rows: ReactNode[] }) {
  const [shown, setShown] = useState(false);

  if (rows.length === 0) return null;

  const toggle = (
    <Pressable
      role="button"
      aria-expanded={shown}
      className="min-h-11 flex-row items-center gap-2"
      onPress={() => setShown((was) => !was)}
    >
      <Icon as={shown ? ChevronDown : ChevronRight} className="text-muted-foreground" />
      <Text className="text-muted-foreground">{`Done today (${rows.length})`}</Text>
    </Pressable>
  );

  return (
    <>
      <View>
        {toggle}
        {!shown &&
          ids.map((id) => (
            // Beside the toggle, never around it, so opening or ticking keeps the same toggle and its focus.
            <View key={id} pointerEvents="none" className="absolute inset-x-0 top-0">
              <CelebrationSpot target={id}>
                <View className="min-h-11" />
              </CelebrationSpot>
            </View>
          ))}
      </View>
      {shown && rows}
    </>
  );
}

// Doing the Tiny version is an ordinary Done, so the line only names it and the row's taps stay the same.
function TinyVersionLine({ due: { habit, day }, tinyDay }: { due: DueHabit; tinyDay: boolean }) {
  if (!tinyDay || day.status !== "empty" || habit.tinyVersion === "") return null;

  return (
    <Text variant="muted" className="pb-2 text-sm">
      {`Tiny: ${habit.tinyVersion}`}
    </Text>
  );
}

function DueRow({
  due,
  today,
  tinyDay,
  onAnswer,
  onOpenDay,
  onReschedule,
  onSkip,
}: {
  due: DueHabit;
  today: Date;
  /** The day's newest Check-in is Rain or Storm. */
  tinyDay: boolean;
  onAnswer: (count: number) => void;
  onOpenDay: (habit: TimedHabit) => void;
  onReschedule: () => void;
  onSkip: () => void;
}) {
  const { habit, day } = due;
  const { mutate: addDuration } = useAddDuration();
  const isOnline = useIsOnline();

  const props: HabitDueRowProps = {
    habit,
    day,
    time: dueBox(due, today) ?? null,
    overdue: due.overdue,
    planned: due.planned,
    // Duration entries save online only; checks queue offline.
    disabled: isTimed(habit) && !isOnline,
    onChange: onAnswer,
    onAddMinutes: (minutes) =>
      addDuration({
        habit: habit.id,
        date: torontoDay(today),
        startTime: startedAgo(new Date(), minutes),
        minutes,
      }),
    onOpenDay: () => isTimed(habit) && onOpenDay(habit),
    onOpen: () => router.push({ pathname: "/habit/[id]", params: { id: habit.id } }),
    ...(isOneOff(habit) && day.status === "empty" && { onReschedule }),
    // A recurring Habit's Not done is a Skip; a One-off keeps Not done.
    ...(!isOneOff(habit) && { onSkip }),
  };

  return (
    <>
      <CelebrationSpot target={habit.id}>
        <HabitDueRow {...props} />
      </CelebrationSpot>
      <TinyVersionLine due={due} tinyDay={tinyDay} />
      <WhoYoullSee habit={habit} />
    </>
  );
}

// Each sheet mounts with its own mutation, so a failed save never shows on the next one.
function RescheduleDue({
  habit,
  today,
  onClose,
}: {
  habit: Habit;
  today: Date;
  onClose: () => void;
}) {
  const reschedule = useReschedule();
  const isOnline = useIsOnline();

  return (
    <RescheduleSheet
      name={habit.name}
      defaultDate={shiftDay(torontoDay(today), 1)}
      min={earliestReschedule(habit, today)}
      renderDateField={(field) => <DateField {...field} />}
      offline={!isOnline}
      pending={reschedule.isPending}
      failed={reschedule.isError}
      onSave={(change) => reschedule.mutate({ habit: habit.id, ...change }, { onSuccess: onClose })}
      onClose={onClose}
    />
  );
}
