import { pillarChangeLabel, type PillarBar } from "@/core";
import { Text } from "@/ui";
import { View } from "react-native";

import { Section } from "@/components/screen";
import { useIsOnline } from "@/lib/data/data-provider";
import { usePillarBars } from "@/lib/data/pillars";

// The track's end is "enough": the fill stops there. One neutral fill in every state; a low bar is never red.
function Track({ score }: { score: number }) {
  return (
    <View
      accessible
      role="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: score }}
      className="bg-muted border-border h-3 overflow-hidden rounded-full border"
    >
      {/* oxlint-disable-next-line shadcn/no-inline-styles -- the fill width is the score */}
      <View className="bg-primary h-full" style={{ width: `${score}%` }} />
    </View>
  );
}

function Row({ bar }: { bar: PillarBar }) {
  return (
    <View className="gap-1">
      <Text className="font-sans-bold">{bar.title}</Text>
      {bar.state === "scored" ? (
        <>
          <Track score={bar.score} />
          <Text>{bar.value}</Text>
          <Text variant="muted">
            {[bar.line, pillarChangeLabel(bar.change)].filter((part) => part !== "").join(" · ")}
          </Text>
        </>
      ) : (
        <>
          {/* Too little data gets an empty dashed track, never a bar that reads as zero. */}
          {bar.state === "thin" && (
            <View
              testID="thin-track"
              className="border-border h-3 rounded-full border border-dashed"
            />
          )}
          <Text variant="muted">{bar.message}</Text>
        </>
      )}
    </View>
  );
}

/** One capped "enough" bar per pillar Goal for the 7 Days ending `end`; no total, by design. */
export function PillarBars({ end }: { end: string }) {
  const { data, isError } = usePillarBars(end);
  const online = useIsOnline();

  if (data === undefined) {
    const status =
      isError || !online ? "The pillar bars need a connection." : "Reading the pillars…";

    return (
      <Section title="Pillars">
        <Text variant="muted">{status}</Text>
      </Section>
    );
  }

  if (data.bars.length === 0) return null;

  return (
    <Section title="Pillars">
      <Text variant="muted">Full means enough. You don&apos;t need to be full everywhere.</Text>
      {data.bars.map((bar) => (
        <Row key={bar.pillar} bar={bar} />
      ))}
    </Section>
  );
}
