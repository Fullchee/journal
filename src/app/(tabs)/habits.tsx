import {
  descriptionBody,
  dueDateLabel,
  MAX_REST_DAYS,
  filterHabits,
  filtersFromParams,
  habitStrength,
  inTracker,
  isAnswered,
  isOneOff,
  isTimed,
  torontoDay,
  type Counts,
  type Habit,
  type HabitFilters,
} from "@/core";
import { Button, HabitCard, Icon, Text, type HabitCardProps } from "@/ui";
import { router, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, ChevronRight, Minus, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { HabitDayDetail, type DayDetail } from "@/components/habits/habit-day-detail";
import { HabitFilterBar } from "@/components/habits/habit-filter-bar";
import { useQuickManage } from "@/components/habits/use-quick-manage";
import { NoteMarkdown } from "@/components/note-body";
import { Section } from "@/components/screen";
import { useIsWide } from "@/hooks/use-is-wide";
import { useIsOnline } from "@/lib/data/data-provider";
import { useCheckHabit, useHabitTracker, type HabitsBody } from "@/lib/data/habits";
import { useHabitRecords, useHabitStreaks, useRestMode } from "@/lib/data/streaks";

// Filters live in the URL, so `?kind=bad` opens Problems and a reload keeps the list.
function useFilters() {
  const params = useLocalSearchParams();

  const filters = filtersFromParams(
    new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) =>
        value === undefined || Array.isArray(value) ? [] : [[key, value]],
      ),
    ),
  );

  const setFilters = (next: Partial<HabitFilters>) =>
    router.setParams(
      Object.fromEntries(
        Object.entries(next).map(([key, value]) => [key, value === "" ? undefined : value]),
      ),
    );

  return [filters, setFilters] as const;
}

// Alarms and widgets link to `?edit=<id>`; the editor opens over the tracker.
// The hook's router works during a deep link's first render; the imperative one isn't bound yet.
function useEditParam() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { setParams, push } = useRouter();

  useEffect(() => {
    if (edit === undefined || edit === "") return;

    setParams({ edit: undefined });
    push({ pathname: "/habit/[id]", params: { id: edit } });
  }, [edit, setParams, push]);
}

const openEditor = (id: string) => router.push({ pathname: "/habit/[id]", params: { id } });

const openHistory = (id: string) =>
  router.push({ pathname: "/habit/[id]/history", params: { id } });

const HEADINGS = { good: "Good habits", bad: "Problems", "": "All habits" } as const;

function HabitDescription({ habit }: { habit: Habit }) {
  const body = descriptionBody(habit);

  return body === "" ? null : <NoteMarkdown markdown={body} />;
}

// A done or missed check on or after its date answers a One-off; until then it is upcoming or overdue.
function OneOffRow({ habit, overdue }: { habit: Habit; overdue: boolean }) {
  const date = dueDateLabel(habit.startDate);

  return (
    <Pressable
      role="button"
      aria-label={overdue ? `${habit.name}, overdue since ${date}` : `${habit.name}, ${date}`}
      className="border-border min-h-11 flex-row items-center gap-3 rounded-md border px-3 py-2"
      onPress={() => openEditor(habit.id)}
    >
      <Text className="flex-1">{habit.name}</Text>
      {overdue && (
        <Text variant="muted" className="text-sm">
          Overdue
        </Text>
      )}
      <Text variant="muted">{date}</Text>
    </Pressable>
  );
}

/** Unanswered One-offs, oldest date first, so the overdue ones lead. */
function OneOffs({ oneOffs, counts, today }: { oneOffs: Habit[]; counts: Counts; today: string }) {
  const open = oneOffs
    .filter((habit) => habit.active && !isAnswered(habit, counts))
    .toSorted((a, b) => a.startDate.localeCompare(b.startDate));

  if (open.length === 0) return null;

  return (
    <View className="gap-2">
      <Text aria-level={2} variant="headline">
        One-offs
      </Text>
      <View role="list" aria-label="One-offs" className="gap-2">
        {open.map((habit) => (
          <OneOffRow key={habit.id} habit={habit} overdue={habit.startDate < today} />
        ))}
      </View>
    </View>
  );
}

// Each card keeps its own save, so a pending or failed save shows on the card that made it.
function ManagedHabitCard(props: HabitCardProps) {
  const { habit } = props;
  const { setStage, toggleBacklog, isPending, isError } = useQuickManage();

  return (
    <HabitCard
      {...props}
      onStage={(stage) => setStage(habit, stage)}
      onBacklog={() => toggleBacklog(habit)}
      onPastDays={() => openHistory(habit.id)}
      saving={isPending}
      saveFailed={isError}
    />
  );
}

function HabitList({ body, filters }: { body: HabitsBody; filters: HabitFilters }) {
  const isOnline = useIsOnline();
  const check = useCheckHabit();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [showBacklog, setShowBacklog] = useState(false);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  // eslint-disable-next-line eslint-react/purity -- streaks and due days count from this moment, so each render reads the clock
  const today = new Date();
  const counts = body.counts ?? {};
  const durations = body.durations ?? {};
  const streakOf = useHabitStreaks(body, today);
  const records = useHabitRecords(body);
  const shown = filterHabits(body.habits.filter(inTracker), filters);
  const tracked = shown.filter((habit) => habit.active);
  const backlog = shown.filter((habit) => !habit.active);
  const nameOf = (id: string) => body.habits.find((habit) => habit.id === id)?.name ?? id;
  const goalName = (id: number) => body.goals?.find((goal) => goal.id === id)?.title ?? String(id);

  const toggle = (id: string) =>
    setExpanded((open) => {
      const next = new Set(open);

      if (!next.delete(id)) next.add(id);

      return next;
    });

  const card = (habit: Habit) => (
    <ManagedHabitCard
      key={habit.id}
      habit={habit}
      counts={counts}
      durations={durations}
      skips={body.skips ?? {}}
      today={today}
      expanded={expanded.has(habit.id)}
      streak={streakOf(habit)}
      strength={
        records !== null && expanded.has(habit.id) ? habitStrength(habit, records, today) : null
      }
      offline={!isOnline}
      description={<HabitDescription habit={habit} />}
      nameOf={nameOf}
      goalName={goalName}
      onToggle={() => toggle(habit.id)}
      onOpen={() => openHistory(habit.id)}
      onCount={(date, count) => check({ date, habit: habit.id, count })}
      onOpenDay={(date) => isTimed(habit) && setDetail({ habit, date })}
      onEdit={() => openEditor(habit.id)}
    />
  );

  return (
    <View className="gap-3">
      <OneOffs
        oneOffs={filterHabits(body.habits.filter(isOneOff), filters)}
        counts={counts}
        today={torontoDay(today)}
      />
      <Text aria-level={2} variant="headline">
        {HEADINGS[filters.kind]}
      </Text>
      {shown.length === 0 && (
        <View className="items-start gap-2">
          <Text variant="muted">No habits match these filters.</Text>
          <Button
            variant="outline"
            size="sm"
            onPress={() => router.setParams({ kind: undefined, stage: undefined })}
          >
            <Text>Clear filters</Text>
          </Button>
        </View>
      )}
      {tracked.map((habit) => card(habit))}
      {backlog.length > 0 && (
        <Pressable
          role="button"
          aria-expanded={showBacklog}
          className="min-h-11 flex-row items-center gap-2"
          onPress={() => setShowBacklog((open) => !open)}
        >
          <Icon as={showBacklog ? ChevronDown : ChevronRight} className="text-muted-foreground" />
          <Text className="text-muted-foreground">{`Backlog (${backlog.length})`}</Text>
        </Pressable>
      )}
      {showBacklog && backlog.map((habit) => card(habit))}
      {detail && (
        <HabitDayDetail detail={detail} durations={durations} onClose={() => setDetail(null)} />
      )}
    </View>
  );
}

function NewHabit({ kind }: { kind: HabitFilters["kind"] }) {
  const isOnline = useIsOnline();

  return (
    <View className="flex-row flex-wrap items-center gap-3">
      <Button
        disabled={!isOnline}
        onPress={() =>
          // Under Problems, a new Habit starts as a bad one.
          router.push({
            pathname: "/habit/[id]",
            params: { id: "new", ...(kind !== "" && { kind }) },
          })
        }
      >
        <Icon as={Plus} className="text-primary-foreground" />
        <Text>New habit</Text>
      </Button>
      {!isOnline && <Text variant="muted">Editing needs a connection.</Text>}
    </View>
  );
}

const DEFAULT_REST_DAYS = 3;

const daysLabel = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;

function RestDays({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  return (
    <View className="flex-row items-center gap-3">
      <Button
        variant="outline"
        size="icon"
        aria-label="One day fewer"
        disabled={days <= 1}
        onPress={() => onChange(days - 1)}
      >
        <Icon as={Minus} />
      </Button>
      <Text aria-live="polite" className="min-w-16 text-center">
        {daysLabel(days)}
      </Text>
      <Button
        variant="outline"
        size="icon"
        aria-label="One day more"
        disabled={days >= MAX_REST_DAYS}
        onPress={() => onChange(days + 1)}
      >
        <Icon as={Plus} />
      </Button>
    </View>
  );
}

function RestMode() {
  const isOnline = useIsOnline();
  // eslint-disable-next-line eslint-react/purity -- Rest mode runs on today's Toronto day, so each render reads the clock
  const rest = useRestMode(new Date());
  const [days, setDays] = useState(DEFAULT_REST_DAYS);
  const disabled = !isOnline || rest.isPending || !rest.loaded;

  return (
    <Section title="Rest mode">
      <Text variant="muted">
        For 1 to 30 days, Streaks neither grow nor break, Freezes aren't earned and Habit alarms
        stay quiet. A Habit you still do adds to its Streak.
      </Text>
      {rest.isError && <Text variant="muted">Couldn't load Rest mode.</Text>}
      {rest.running ? (
        <View className="items-start gap-3">
          <Text>{`Resting through ${dueDateLabel(rest.running.end)}.`}</Text>
          <Button variant="outline" disabled={disabled} onPress={rest.end}>
            <Text>End Rest mode</Text>
          </Button>
        </View>
      ) : (
        <View className="items-start gap-3">
          <RestDays days={days} onChange={setDays} />
          <Button disabled={disabled} onPress={() => rest.start(days)}>
            <Text>Start Rest mode</Text>
          </Button>
        </View>
      )}
      {!isOnline && <Text variant="muted">Rest mode needs a connection.</Text>}
      {rest.failed && <Text variant="muted">Couldn't change Rest mode. Try again.</Text>}
    </Section>
  );
}

export default function HabitsScreen() {
  useEditParam();
  const isWide = useIsWide();
  const [filters, setFilters] = useFilters();
  const { data, isError } = useHabitTracker();

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="w-full max-w-5xl gap-4 self-center p-4"
    >
      <NewHabit kind={filters.kind} />
      <View className={isWide ? "flex-row items-start gap-8" : "gap-4"}>
        <HabitFilterBar filters={filters} onChange={setFilters} isWide={isWide} />
        <View className="flex-1">
          {data ? (
            <HabitList body={data} filters={filters} />
          ) : (
            <Text variant="muted">{isError ? "Couldn't load Habits." : "Loading Habits…"}</Text>
          )}
        </View>
      </View>
      <View className="border-border border-t pt-4">
        <RestMode />
      </View>
    </ScrollView>
  );
}
