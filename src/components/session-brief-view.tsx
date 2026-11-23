import {
  NO_PATTERNS,
  PROSE_MISSING,
  SUMMARY_MISSING,
  briefRowLine,
  habitLine,
  moodLines,
  noteLine,
  skipLine,
  sleepLine,
  type BriefBody,
  type BriefRow,
} from "@/core";
import { Text } from "@/ui";
import { View } from "react-native";

import { Section } from "@/components/screen";
import { useIsWide } from "@/hooks/use-is-wide";

/** The written brief, in the same sections as journal's and as the shared Markdown. */
export function SessionBriefView({ brief: { facts, prose } }: { brief: BriefBody }) {
  return (
    <View className="gap-6">
      <Text aria-level={2} variant="headline">
        {facts.start} to {facts.end}
      </Text>
      {facts.rows.length === 0 ? (
        <Text>No Check-ins in this window.</Text>
      ) : (
        <>
          <Text>
            <Text className="font-sans-bold">The week in one line: </Text>
            {prose?.summary ?? SUMMARY_MISSING}
          </Text>
          <Section title="Day by day">
            <DayByDay rows={facts.rows} />
          </Section>
          {facts.sleep.length > 0 && (
            <Text>
              <Text className="font-sans-bold">Sleep: </Text>
              {sleepLine(facts.sleep)}
            </Text>
          )}
          {moodLines(facts.rows).length > 0 && (
            <Section title="Tense, Low and Tired">
              <Bullets items={moodLines(facts.rows)} empty="" />
            </Section>
          )}
          <Section title="Lows">
            <Bullets
              items={facts.lows.map((row) => briefRowLine(row, facts.sleep))}
              empty="None."
            />
          </Section>
          <Section title="Highs">
            <Bullets
              items={facts.highs.map((row) => briefRowLine(row, facts.sleep))}
              empty="None."
            />
          </Section>
          <Section title="Patterns I noticed">
            {prose ? (
              <Bullets items={prose.patterns} empty={NO_PATTERNS} />
            ) : (
              <Text>{PROSE_MISSING}</Text>
            )}
          </Section>
          <Section title="What helped">
            <Bullets
              items={facts.habits.map((habit) => habitLine(habit))}
              empty="No habit checks."
            />
          </Section>
          {facts.skips.length > 0 && (
            <Section title="Skips">
              <Bullets items={facts.skips.map((skip) => skipLine(skip))} empty="" />
            </Section>
          )}
          {facts.notes.length > 0 && (
            <Section title="Habit notes">
              <Bullets items={facts.notes.map((note) => noteLine(note))} empty="" />
            </Section>
          )}
          <Section title="To raise in session">
            <Text>{prose?.toRaise ?? PROSE_MISSING}</Text>
          </Section>
        </>
      )}
    </View>
  );
}

function Bullets({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <Text variant="muted">{empty}</Text>;

  return (
    <View role="list" className="gap-1">
      {items.map((item, i) => (
        // eslint-disable-next-line eslint-react/no-array-index-key -- read-only lines that never reorder, and the same line can repeat
        <Text key={i} role="listitem">
          • {item}
        </Text>
      ))}
    </View>
  );
}

const COLUMNS = ["Day", "Weather", "Where", "Doing", "On my mind"];

const onMyMind = (row: BriefRow) => (row.onMyMind === "" ? row.note : row.onMyMind);

const cellsOf = (row: BriefRow) => [
  { column: "Day", text: `${row.day} ${row.time}` },
  { column: "Weather", text: `${row.zone} (${row.score})` },
  { column: "Where", text: row.where },
  { column: "Doing", text: row.doing },
  { column: "On my mind", text: onMyMind(row) },
];

// Five columns don't fit a phone, so there each Check-in is a card.
function DayByDay({ rows }: { rows: BriefRow[] }) {
  const isWide = useIsWide();

  if (isWide) {
    return (
      <View role="table">
        <View role="row" className="border-border flex-row border-b pb-1">
          {COLUMNS.map((name) => (
            <Text key={name} role="columnheader" variant="label" className="mr-2 flex-1">
              {name}
            </Text>
          ))}
        </View>
        {rows.map((row, i) => (
          // eslint-disable-next-line eslint-react/no-array-index-key -- the brief is a read-only snapshot that never reorders, and rows have no id
          <View key={i} role="row" className="border-border flex-row border-b py-1">
            {cellsOf(row).map(({ column, text }) => (
              <Text key={column} role="cell" className="mr-2 flex-1 text-sm">
                {text}
              </Text>
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View className="gap-2">
      {rows.map((row, i) => (
        // eslint-disable-next-line eslint-react/no-array-index-key -- the brief is a read-only snapshot that never reorders, and rows have no id
        <View key={i} className="border-border bg-card gap-1 rounded-md border p-3">
          <Text className="font-sans-bold">
            {row.day} {row.time} · {row.zone} ({row.score})
          </Text>
          {row.where !== "" && <Text variant="muted">Where: {row.where}</Text>}
          {row.doing !== "" && <Text variant="muted">Doing: {row.doing}</Text>}
          {onMyMind(row) !== "" && <Text>{onMyMind(row)}</Text>}
        </View>
      ))}
    </View>
  );
}
