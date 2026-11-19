import {
  followingCircle,
  isOneOff,
  newSeasonCircle,
  torontoDay,
  type Circle,
  type Draft,
  type Habit,
} from "@/core";
import { Button, Text } from "@/ui";
import { View } from "react-native";

import { useCircles, useCreateCircle, useFollowHabit } from "@/lib/data/circles";
import { useIsOnline } from "@/lib/data/data-provider";

const peopleLabel = (count: number) => (count === 1 ? "1 person" : `${count} people`);

/**
 * The one optional tap after a Season starts: this year's Circle with last year's members, edited afterwards on
 * each person's page. `withinDays` keeps it to the Season's first days.
 */
export function NewSeasonCircleOffer({
  habit,
  today,
  withinDays,
}: {
  habit: Habit;
  today: Date;
  withinDays?: number;
}) {
  const { data } = useCircles();
  const create = useCreateCircle();
  const isOnline = useIsOnline();

  if (create.isSuccess)
    return (
      <Text variant="muted">
        Made this year&apos;s Circle. Change who&apos;s in it on each person&apos;s page.
      </Text>
    );
  const offer = data ? newSeasonCircle(habit, data.circles, torontoDay(today), withinDays) : null;

  if (offer === null) return null;
  const { from, name } = offer;

  return (
    <View className="gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={!isOnline || create.isPending}
        onPress={() =>
          create.mutate({ name, habitId: habit.id, memberIds: from.members.map(({ id }) => id) })
        }
      >
        <Text>{`Start ${name} with ${from.name}'s ${peopleLabel(from.members.length)}`}</Text>
      </Button>
      {create.isError && (
        <Text className="text-destructive">{"Couldn't make the Circle. Try again."}</Text>
      )}
    </View>
  );
}

function CirclePicker({ habit, circles }: { habit: Habit; circles: Circle[] }) {
  const follow = useFollowHabit();
  const isOnline = useIsOnline();
  const free = circles.filter((circle) => circle.habitId === null);

  if (free.length === 0)
    return <Text variant="muted">No free Circle. Add one on a person&apos;s page.</Text>;

  return (
    <View role="radiogroup" aria-label={`Circle that comes to ${habit.name}`} className="gap-1.5">
      <Text variant="muted">
        Pick who comes; Today then lists them and each counted day logs time together.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {free.map((circle) => (
          <Button
            key={circle.id}
            role="radio"
            aria-checked={false}
            variant="outline"
            size="sm"
            disabled={!isOnline || follow.isPending}
            onPress={() => follow.mutate({ circleId: circle.id, habitId: habit.id })}
          >
            <Text>{circle.name}</Text>
          </Button>
        ))}
      </View>
      {follow.isError && <Text className="text-destructive">{"Couldn't save. Try again."}</Text>}
    </View>
  );
}

function Following({ habit, circle }: { habit: Habit; circle: Circle }) {
  const follow = useFollowHabit();
  const isOnline = useIsOnline();
  // eslint-disable-next-line eslint-react/purity -- the offer depends on today's Season, so each render reads the clock
  const today = new Date();

  return (
    <>
      <Text>{`${circle.name} · ${peopleLabel(circle.members.length)}`}</Text>
      <NewSeasonCircleOffer habit={habit} today={today} />
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={!isOnline || follow.isPending}
        onPress={() => follow.mutate({ circleId: circle.id, habitId: null })}
      >
        <Text>Stop following</Text>
      </Button>
      {follow.isError && <Text className="text-destructive">{"Couldn't save. Try again."}</Text>}
    </>
  );
}

/**
 * The Circle a saved recurring Habit follows, on its page: saved at once, apart from the form. The offer reads the
 * draft's Seasons, so it shows as soon as Start season is tapped.
 */
export function HabitCircle({ draft }: { draft: Draft }) {
  const { data } = useCircles();
  const { id } = draft;

  if (data === undefined || id === undefined || isOneOff(draft) || draft.target.type === "none")
    return null;
  const habit = { ...draft, id };
  const circle = followingCircle(data.circles, habit.id);

  return (
    <View className="border-border gap-2 border-t pt-4">
      <Text aria-level={2} variant="headline">
        Circle
      </Text>
      {circle === null ? (
        <CirclePicker habit={habit} circles={data.circles} />
      ) : (
        <Following habit={habit} circle={circle} />
      )}
    </View>
  );
}
