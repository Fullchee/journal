import {
  CLOSENESSES,
  circleNames,
  closenessLabel,
  lastContactedLabel,
  overdueShare,
  type Closeness,
  type Connection,
  formatDay,
  dayOfYearless,
} from "@/core";
import { Button, Input, Text } from "@/ui";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { ChoiceRow } from "@/components/choice-row";
import { InteractionBox } from "@/components/interaction-box";
import { NavRow } from "@/components/nav-row";
import { Screen, Section } from "@/components/screen";
import { StatusText } from "@/components/status-text";
import { ApiError } from "@/lib/api/errors";
import { pickContact } from "@/lib/contacts/pick-contact";
import { useIsOnline } from "@/lib/data/data-provider";
import {
  useConnectionSearch,
  useConnections,
  useCreateConnection,
  type NewConnection,
} from "@/lib/data/connections";

const CONFLICT = 409;

const GROUPS: { closeness: Closeness; title: string }[] = [
  ...CLOSENESSES.map((closeness) => ({ closeness, title: closenessLabel(closeness) })),
  { closeness: "", title: "Everyone else" },
];

const isOverdue = (c: Connection, now: Date) => overdueShare(c, now) >= 1;

// Overdue people first, most overdue on top; then by name, as the API sends them.
const byOverdue = (people: Connection[], now: Date) =>
  people.toSorted((a, b) => {
    const overdueFirst = Number(isOverdue(b, now)) - Number(isOverdue(a, now));

    if (overdueFirst !== 0) return overdueFirst;

    return isOverdue(a, now) ? overdueShare(b, now) - overdueShare(a, now) : 0;
  });

const rowDetail = (c: Connection, now: Date) =>
  [
    isOverdue(c, now) && "Overdue",
    `Reached out: ${lastContactedLabel(c.lastContactedOn, now).toLowerCase()}`,
  ]
    .filter(Boolean)
    .join(" · ");

const BLANK: NewConnection = { name: "", dates: [], contactId: null };

const monthDay = (date: string) =>
  formatDay(dayOfYearless(date), { month: "short", day: "numeric" }, "en");

/** With nobody saved yet, the button sits under the reason the list is empty. */
function NewPerson({ isOnline, empty }: { isOnline: boolean; empty: boolean }) {
  const [person, setPerson] = useState<NewConnection | null>(null);
  const create = useCreateConnection();

  if (person === null)
    return (
      <View className="gap-2">
        {empty ? (
          <Text variant="muted">
            Nobody here yet. Add the people you want to keep in touch with.
          </Text>
        ) : null}
        <Button
          variant="outline"
          className="h-11 self-start"
          disabled={!isOnline}
          onPress={() => setPerson(BLANK)}
        >
          <Text>New person</Text>
        </Button>
      </View>
    );

  const add = () =>
    create.mutate(
      { ...person, name: person.name.trim() },
      {
        onSuccess: ({ id }) => {
          setPerson(null);
          router.push(`/connections/${id}`);
        },
      },
    );

  const pick = async () => {
    const picked = await pickContact?.();

    if (picked) setPerson(picked);
  };

  // A picked contact's birthday is the only date this form adds.
  const [birthday] = person.dates;

  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        <Input
          aria-label="Name"
          autoFocus
          className="flex-1"
          maxLength={200}
          value={person.name}
          onChangeText={(name) => setPerson({ ...person, name })}
          onSubmitEditing={add}
        />
        {pickContact ? (
          <Button variant="outline" className="h-11" onPress={() => void pick()}>
            <Text>Pick from contacts</Text>
          </Button>
        ) : null}
      </View>
      {birthday ? <Text variant="muted">Adds birthday: {monthDay(birthday.date)}</Text> : null}
      <View className="flex-row gap-2">
        <Button
          className="h-11 flex-1"
          disabled={!isOnline || person.name.trim() === "" || create.isPending}
          onPress={add}
        >
          <Text>Add</Text>
        </Button>
        <Button variant="outline" className="h-11 flex-1" onPress={() => setPerson(null)}>
          <Text>Cancel</Text>
        </Button>
      </View>
      {create.error ? (
        <StatusText tone="error">
          {create.error instanceof ApiError && create.error.status === CONFLICT
            ? "Couldn't save. Check the name isn't already here."
            : "Couldn't save. Try again."}
        </StatusText>
      ) : null}
    </View>
  );
}

function SearchResults({ q }: { q: string }) {
  const { data, isError } = useConnectionSearch(q);

  if (isError) return <Text role="alert">Couldn&apos;t search. Try again.</Text>;

  if (!data) return <Text variant="muted">Searching…</Text>;

  if (data.length === 0) return <Text variant="muted">Nobody matches “{q}”.</Text>;

  return (
    <View>
      {data.map((f) => (
        <NavRow key={f.id} href={`/connections/${f.id}`} label={f.name} detail={f.match} />
      ))}
    </View>
  );
}

/** Everyone, grouped by Closeness, overdue first; filtered to one Circle when picked. */
function ByCloseness({ everyone }: { everyone: Connection[] }) {
  // null shows everyone; a name shows that Circle's members.
  const [circle, setCircle] = useState<string | null>(null);
  // eslint-disable-next-line eslint-react/purity -- overdue and "reached out" labels count from this moment, so each render reads the clock
  const now = new Date();
  const circles = circleNames(everyone);
  const people = circle === null ? everyone : everyone.filter((c) => c.circles.includes(circle));

  return (
    <>
      {circles.length > 0 ? (
        <ChoiceRow
          legend="Circle"
          choices={[
            { value: null, label: "Everyone" },
            ...circles.map((name) => ({ value: name, label: name })),
          ]}
          selected={circle}
          onPick={setCircle}
        />
      ) : null}
      {GROUPS.map(({ closeness, title }) => {
        const group = byOverdue(
          people.filter((c) => c.closeness === closeness),
          now,
        );

        return group.length > 0 ? (
          <Section key={title} title={title}>
            <View>
              {group.map((c) => (
                <NavRow
                  key={c.id}
                  href={`/connections/${c.id}`}
                  label={c.name}
                  detail={rowDetail(c, now)}
                />
              ))}
            </View>
          </Section>
        ) : null;
      })}
    </>
  );
}

export function ConnectionList() {
  const isOnline = useIsOnline();
  const { data, isError, refetch } = useConnections();
  const [query, setQuery] = useState("");
  // Empty shows everyone; a submitted search shows only who matched.
  const [searched, setSearched] = useState("");
  const everyone = data?.connections ?? [];

  return (
    <Screen>
      <InteractionBox everyone={everyone} />
      <NewPerson isOnline={isOnline} empty={data !== undefined && everyone.length === 0} />
      {isOnline ? null : <Text variant="muted">Editing needs a connection.</Text>}
      <View role="group" aria-label="Search" className="flex-row gap-2">
        <Input
          aria-label="Search people"
          className="flex-1"
          placeholder={isOnline ? "Search names, notes and dates" : "Search needs a connection"}
          value={query}
          onChangeText={(text) => {
            setQuery(text);

            if (text.trim() === "") setSearched("");
          }}
          onSubmitEditing={() => setSearched(query.trim())}
          editable={isOnline}
        />
        <Button className="h-11" disabled={!isOnline} onPress={() => setSearched(query.trim())}>
          <Text>Search</Text>
        </Button>
      </View>
      {isError && !data ? (
        <View className="gap-2">
          <StatusText tone="error">Couldn&apos;t load Connections.</StatusText>
          <Button variant="outline" className="h-11 self-start" onPress={() => void refetch()}>
            <Text>Retry</Text>
          </Button>
        </View>
      ) : null}
      {searched === "" ? <ByCloseness everyone={everyone} /> : <SearchResults q={searched} />}
    </Screen>
  );
}
