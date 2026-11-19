import type { ConnectionRef } from "@/core";
import { Button, Input, Text } from "@/ui";
import { useState } from "react";
import { View } from "react-native";

import type { LinkDraft } from "@/lib/data/connections";

const MAX_MATCHES = 5;

/** A name box that offers up to five matching people to pick. */
function PersonSearch({
  label,
  people,
  onPick,
}: {
  label: string;
  people: ConnectionRef[];
  onPick: (person: ConnectionRef) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const matches =
    q === "" ? [] : people.filter((p) => p.name.toLowerCase().includes(q)).slice(0, MAX_MATCHES);

  return (
    <View className="gap-2">
      <Input aria-label={label} placeholder="Name" value={query} onChangeText={setQuery} />
      {matches.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {matches.map((person) => (
            <Button
              key={person.id}
              variant="outline"
              size="sm"
              className="h-11"
              onPress={() => {
                onPick(person);
                setQuery("");
              }}
            >
              <Text>{person.name}</Text>
            </Button>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const nameOf = (people: ConnectionRef[], id: number) => people.find((p) => p.id === id)?.name;

interface MetThroughFieldProps {
  metThroughId: number | null;
  people: ConnectionRef[];
  onChange: (id: number | null) => void;
}

/** Who introduced us: a search until someone is picked, then their name and Clear. */
export function MetThroughField({ metThroughId, people, onChange }: MetThroughFieldProps) {
  if (metThroughId === null)
    return (
      <PersonSearch
        label="Find who introduced you"
        people={people}
        onPick={(p) => onChange(p.id)}
      />
    );

  return (
    <View className="flex-row items-center gap-2">
      <Text className="flex-1">Met through {nameOf(people, metThroughId)}</Text>
      <Button
        variant="ghost"
        className="h-11"
        aria-label="Clear who introduced you"
        onPress={() => onChange(null)}
      >
        <Text>Clear</Text>
      </Button>
    </View>
  );
}

interface LinksFieldProps {
  links: LinkDraft[];
  people: ConnectionRef[];
  onChange: (links: LinkDraft[]) => void;
}

/** Linked people, each with a label such as "partner", and a search to link one more. */
export function LinksField({ links, people, onChange }: LinksFieldProps) {
  const linked = new Set(links.map((l) => l.id));

  return (
    <View className="gap-2">
      {links.map((link) => {
        const name = nameOf(people, link.id);

        return (
          <View key={link.id} className="flex-row items-center gap-2">
            <Text className="w-28">{name}</Text>
            <Input
              aria-label={`How ${name} is linked`}
              className="flex-1"
              placeholder="Partner"
              maxLength={100}
              value={link.label}
              onChangeText={(label) =>
                onChange(links.map((l) => (l.id === link.id ? { ...l, label } : l)))
              }
            />
            <Button
              variant="ghost"
              className="h-11"
              aria-label={`Unlink ${name}`}
              onPress={() => onChange(links.filter((l) => l.id !== link.id))}
            >
              <Text>Remove</Text>
            </Button>
          </View>
        );
      })}
      <PersonSearch
        label="Find someone to link"
        people={people.filter((p) => !linked.has(p.id))}
        onPick={(p) => onChange([...links, { id: p.id, label: "" }])}
      />
    </View>
  );
}
