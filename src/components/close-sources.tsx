import type { CloseSourcesBody } from "@/core";
import { Text } from "@/ui";
import { View } from "react-native";

import { NoteMarkdown } from "@/components/note-body";
import { Section } from "@/components/screen";

type Source = CloseSourcesBody["sources"][number];

const isWritten = (source: Source): source is Source & { body: string } =>
  source.body !== null && source.body.trim() !== "";

/** What the close reads: each source reflection as written, a missing one noted, and the period's signals. */
export function CloseSources({ sources, signals }: Pick<CloseSourcesBody, "sources" | "signals">) {
  const written = sources.filter(isWritten);
  const missing = sources.filter((source) => !isWritten(source)).map(({ period }) => period);

  return (
    <>
      <Section title="Sources">
        {written.map(({ period, body }) => (
          <View key={period} className="gap-1">
            <Text aria-level={3} className="font-sans-bold">
              {period}
            </Text>
            <NoteMarkdown markdown={body} testID={`source-${period}`} />
          </View>
        ))}
        {missing.length > 0 && <Text variant="muted">Not written: {missing.join(", ")}</Text>}
      </Section>
      <Section title="Signals">
        {signals.length === 0 ? (
          <Text variant="muted">No signal data for this period.</Text>
        ) : (
          <View role="list" className="gap-1">
            {signals.map((line) => (
              <Text key={line} role="listitem">
                {line.replace(/^- /, "")}
              </Text>
            ))}
          </View>
        )}
      </Section>
    </>
  );
}
