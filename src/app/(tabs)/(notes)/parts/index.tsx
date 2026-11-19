import { partGroups, type PartListRow } from "@/core";
import { Text } from "@/ui";

import { NavRow } from "@/components/nav-row";
import { QueryView } from "@/components/note-body";
import { Screen, Section } from "@/components/screen";
import { useParts } from "@/lib/data/parts";

const recentLabel = ({ recentCheckIns }: PartListRow) =>
  `${recentCheckIns} Check-in${recentCheckIns === 1 ? "" : "s"} in 30 days`;

/** The IFS Parts, grouped by role, with how often each showed up lately. */
export default function PartsScreen() {
  return (
    <Screen>
      <QueryView query={useParts()}>
        {({ parts }) =>
          parts.length === 0 ? (
            <Text variant="muted">No parts yet. Name one on a Check-in.</Text>
          ) : (
            partGroups(parts).map(({ heading, parts: grouped }) => (
              <Section key={heading} title={heading}>
                {grouped.map((part) => (
                  <NavRow
                    key={part.id}
                    href={{ pathname: "/parts/[id]", params: { id: String(part.id) } }}
                    label={part.name}
                    detail={recentLabel(part)}
                  />
                ))}
              </Section>
            ))
          )
        }
      </QueryView>
    </Screen>
  );
}
