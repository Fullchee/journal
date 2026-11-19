import {
  endSeason,
  openSeason,
  shiftDay,
  startSeason,
  torontoDay,
  type Draft,
  type Season,
} from "@/core";
import { Button, DateField, Icon, Text } from "@/ui";
import { X } from "lucide-react-native";
import { View } from "react-native";

interface SeasonFieldsProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
}

// A Season can't end before it starts, so a new end is today at the earliest of its start.
const endOn = ({ start }: Season, today: string) => (start > today ? start : today);

function SeasonRow({
  season,
  number,
  today,
  onChange,
  onRemove,
}: {
  season: Season;
  number: number;
  today: string;
  onChange: (season: Season) => void;
  onRemove: () => void;
}) {
  const { start, end } = season;

  return (
    <View role="listitem" className="flex-row flex-wrap items-center gap-2">
      <DateField
        label={`Start of season ${number}`}
        value={start}
        {...(end !== null && { max: end })}
        onChange={(day) => onChange({ ...season, start: day })}
      />
      <Text variant="muted">to</Text>
      {end === null ? (
        <Button
          variant="outline"
          size="sm"
          aria-label={`Set end of season ${number}`}
          onPress={() => onChange({ ...season, end: endOn(season, today) })}
        >
          <Text>No end</Text>
        </Button>
      ) : (
        <>
          <DateField
            label={`End of season ${number}`}
            value={end}
            min={start}
            onChange={(day) => onChange({ ...season, end: day })}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Clear end of season ${number}`}
            onPress={() => onChange({ ...season, end: null })}
          >
            <Text>Clear</Text>
          </Button>
        </>
      )}
      <Button variant="ghost" size="icon" aria-label={`Remove season ${number}`} onPress={onRemove}>
        <Icon as={X} />
      </Button>
    </View>
  );
}

/** A recurring Habit's Seasons: Start or End season today, edit either date, or plan one ahead. */
export function SeasonFields({ draft, update }: SeasonFieldsProps) {
  const { seasons, target } = draft;

  if (target.type === "none" || target.type === "once") return null;
  // eslint-disable-next-line eslint-react/purity -- Start and End season act on today, so each render reads the clock
  const today = torontoDay(new Date());
  const isOpen = openSeason(seasons, today) !== null;
  const setSeasons = (next: Season[]) => update({ seasons: next });

  return (
    <>
      <Text aria-level={2} variant="title" className="mt-2">
        Seasons
      </Text>
      {seasons.length === 0 ? (
        <Text variant="muted">Due all year.</Text>
      ) : (
        <View role="list" aria-label="Seasons" className="gap-2">
          {seasons.map((season, index) => (
            <SeasonRow
              key={`${season.start}-${String(index)}`}
              season={season}
              number={index + 1}
              today={today}
              onChange={(changed) =>
                setSeasons(seasons.map((own, at) => (at === index ? changed : own)))
              }
              onRemove={() => setSeasons(seasons.filter((_, at) => at !== index))}
            />
          ))}
        </View>
      )}
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onPress={() =>
            setSeasons(isOpen ? endSeason(seasons, today) : startSeason(seasons, today))
          }
        >
          <Text>{isOpen ? "End season" : "Start season"}</Text>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => setSeasons([...seasons, { start: shiftDay(today, 1), end: null }])}
        >
          <Text>Plan a season</Text>
        </Button>
      </View>
      {seasons.length > 0 && (
        <Text variant="muted">Due only inside a Season; its Streak pauses between them.</Text>
      )}
    </>
  );
}
