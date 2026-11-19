import {
  CADENCES,
  bySoonest,
  closenessLabel,
  daysUntil,
  inDaysLabel,
  lastContactedLabel,
  torontoDay,
  meetupLabel,
  type ConnectionDate,
  formatDay,
  ageOn,
  hoursTogether,
  hoursTogetherLabel,
  dayOfYearless,
  nextOccurrence,
} from "@/core";
import { Markdown, Text } from "@/ui";
import { View } from "react-native";

import { Section } from "@/components/screen";
import type { ConnectionDetail } from "@/lib/data/connections";

import { Link } from "expo-router";
import { NavRow } from "@/components/nav-row";

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <View className="flex-row gap-4">
      <Text variant="muted" className="w-32 text-base">
        {term}
      </Text>
      <View className="flex-1">{children}</View>
    </View>
  );
}

const dateLabel = ({ date, yearly }: ConnectionDate) =>
  formatDay(
    dayOfYearless(date),
    { month: "long", day: "numeric", ...(!yearly && { year: "numeric" }) },
    "en",
  );

function DateLine({ date, today }: { date: ConnectionDate; today: string }) {
  const inDays = daysUntil(date, today);
  const on = nextOccurrence(date, today);
  const age = on === null ? null : ageOn(date, on);

  return (
    <Text>
      {date.label}: {dateLabel(date)}
      {age === null ? null : ` · turns ${age}`}
      {inDays === null ? null : <Text variant="muted">, {inDaysLabel(inDays)}</Text>}
    </Text>
  );
}

function People({ connection }: { connection: ConnectionDetail }) {
  return (
    <>
      {connection.links.length > 0 ? (
        <Section title="Linked people">
          <View role="list" aria-label="Linked people">
            {connection.links.map((l) => (
              <NavRow key={l.id} href={`/connections/${l.id}`} label={`${l.name} · ${l.label}`} />
            ))}
          </View>
        </Section>
      ) : null}
      {connection.introduced.length > 0 ? (
        <Section title="Introduced me to">
          <View role="list" aria-label="Introduced me to">
            {connection.introduced.map((p) => (
              <NavRow key={p.id} href={`/connections/${p.id}`} label={p.name} />
            ))}
          </View>
        </Section>
      ) : null}
    </>
  );
}

function GrowCloser({ interactions }: Pick<ConnectionDetail, "interactions">) {
  return (
    <>
      <Row term="Grow closer">
        <Text>Weekly prompt to make plans</Text>
      </Row>
      <Row term="Hours together">
        <Text>{hoursTogetherLabel(hoursTogether(interactions))}</Text>
      </Row>
    </>
  );
}

function ImportantDates({ dates, today }: { dates: ConnectionDate[]; today: string }) {
  return dates.length > 0 ? (
    <Section title="Important dates">
      {bySoonest(dates, today).map((d) => (
        <DateLine key={d.label + d.date} date={d} today={today} />
      ))}
    </Section>
  ) : null;
}

/** The fields above a person's notes, read-only. */
export function ConnectionDetails({ connection }: { connection: ConnectionDetail }) {
  // eslint-disable-next-line eslint-react/purity -- labels count from this moment, so each render reads the clock
  const now = new Date();
  const today = torontoDay(now);

  return (
    <>
      <View className="gap-2">
        <Row term="Last reached out">
          <Text>{lastContactedLabel(connection.lastContactedOn, now)}</Text>
        </Row>
        <Row term="Reach out">
          <Text>
            {CADENCES.find((c) => c.days === connection.cadenceDays)?.label ?? "No reminder"}
          </Text>
        </Row>
        {connection.growCloser ? <GrowCloser interactions={connection.interactions} /> : null}
        {connection.closeness === "" ? null : (
          <Row term="Closeness">
            <Text>{closenessLabel(connection.closeness)}</Text>
          </Row>
        )}
        {connection.circles.length > 0 ? (
          <Row term="Circles">
            <Text>{connection.circles.join(", ")}</Text>
          </Row>
        ) : null}
        {connection.howWeMet === "" ? null : (
          <Row term="How we met">
            <Text>{connection.howWeMet}</Text>
          </Row>
        )}
        {connection.metThrough === null ? null : (
          <Row term="Met through">
            <Link href={`/connections/${connection.metThrough.id}`} asChild>
              <Text role="link" className="text-primary underline">
                {connection.metThrough.name}
              </Text>
            </Link>
          </Row>
        )}
        {connection.meetups.length > 0 ? (
          <Row term="Usually see">
            {connection.meetups.map((m) => (
              <Text key={meetupLabel(m)}>{meetupLabel(m)}</Text>
            ))}
          </Row>
        ) : null}
      </View>
      <ImportantDates dates={connection.dates} today={today} />
      <People connection={connection} />
      {connection.followUps.trim() === "" ? null : (
        <Section title="Ask about next time">
          <Markdown markdown={connection.followUps} />
        </Section>
      )}
    </>
  );
}
