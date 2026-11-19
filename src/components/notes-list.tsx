import {
  buildGoalTree,
  flattenGoalTree,
  goalsViewEnd,
  isNoteType,
  libraryHabits,
  NOTE_TYPES,
  torontoDay,
  type NoteType,
} from "@/core";
import { Text } from "@/ui";
import { useGlobalSearchParams, usePathname } from "expo-router";
import { useState } from "react";
import { TextInput } from "react-native";

import { INPUT_CLASS } from "@/components/note-body";
import { NavRow } from "@/components/nav-row";
import { PillarBars } from "@/components/pillar-bars";
import { Screen, Section } from "@/components/screen";
import { useIsOnline } from "@/lib/data/data-provider";
import { useHabitLibrary } from "@/lib/data/habits";
import { useNoteList, type NoteRow } from "@/lib/data/notes";
import { searchSections, type NoteLink, type NoteSection } from "@/lib/notes";

interface PlacedRow {
  row: NoteRow;
  depth: number;
}

const flat = (rows: NoteRow[]): PlacedRow[] => rows.map((row) => ({ row, depth: 0 }));

// Goals list as a tree, each under the Goal it serves; the other types keep the API's order.
const goalTree = (rows: NoteRow[]): PlacedRow[] =>
  flattenGoalTree(buildGoalTree(rows)).map(({ goal, depth }) => ({ row: goal, depth }));

const CLOSE_PERIOD: NoteLink = {
  href: "/close-period",
  label: "Close a quarter or year",
  detail: "Roll up the reflections and move each Goal",
  text: "Close a quarter or year",
};

// `lead` links sit above the section's notes.
const ROWS: Record<
  NoteType,
  { place: (rows: NoteRow[]) => PlacedRow[]; detail: (row: NoteRow) => string; lead: NoteLink[] }
> = {
  goals: { place: goalTree, detail: ({ detail }) => detail, lead: [] },
  reflections: { place: flat, detail: ({ detail }) => detail, lead: [CLOSE_PERIOD] },
  "health-records": {
    place: flat,
    detail: ({ detail }) => `Updated ${torontoDay(detail)}`,
    lead: [],
  },
};

// About three levels is the Goal hierarchy's guide, never a limit, so deeper Goals share the last step.
const DEPTH_PADDING = ["", "pl-6", "pl-12", "pl-18"] as const;

const depthPadding = (depth = 0) => DEPTH_PADDING[Math.min(depth, DEPTH_PADDING.length - 1)];

function useNoteSection(type: NoteType): NoteSection | null {
  const { data } = useNoteList(type);
  const { place, detail, lead } = ROWS[type];

  return data
    ? {
        heading: NOTE_TYPES[type].heading,
        links: [
          ...lead,
          ...place(data.items).map(({ row, depth }): NoteLink => ({
            href: { pathname: "/notes/[type]/[id]", params: { type, id: String(row.id) } },
            label: row.title,
            detail: detail(row),
            text: `${row.title} ${row.detail}`,
            depth,
          })),
        ],
      }
    : null;
}

function useLibrarySection(): NoteSection | null {
  const { data } = useHabitLibrary();

  return data
    ? {
        heading: "Library",
        links: libraryHabits(data.habits).map(({ id, name, description }) => ({
          href: { pathname: "/library/[id]", params: { id } },
          label: name,
          text: `${name} ${description}`,
        })),
      }
    : null;
}

// journal's `/notes?type=<type>` showed one type; here that type's section leads the list.
function useChosenHeading(): string | undefined {
  const pathname = usePathname();
  const { type } = useGlobalSearchParams<{ type?: string }>();

  return pathname === "/notes" && type !== undefined && isNoteType(type)
    ? NOTE_TYPES[type].heading
    : undefined;
}

/**
 * The Health plan is pinned first so it is one tap away in Storm; the Weekly retro, written every week, sits
 * beside it. Search covers the sections below them.
 */
export function NotesList() {
  const [query, setQuery] = useState("");
  const [now] = useState(() => new Date());
  const isOnline = useIsOnline();

  const chosenHeading = useChosenHeading();

  const sections = [
    useLibrarySection(),
    useNoteSection("goals"),
    useNoteSection("reflections"),
    useNoteSection("health-records"),
  ].filter((section) => section !== null);

  const ordered = [
    ...sections.filter(({ heading }) => heading === chosenHeading),
    ...sections.filter(({ heading }) => heading !== chosenHeading),
  ];

  const shown = searchSections(ordered, query);

  return (
    <Screen>
      <NavRow href="/health-plan" label="Health plan" detail="Care team, meds, next action" />
      <NavRow href="/parts" label="Parts" detail="Who shows up in my Check-ins (IFS)" />
      <NavRow
        href="/weekly-review"
        label="Write the Weekly retro"
        detail="From last week's Check-ins, sleep and habits"
      />
      <NavRow href="/work" label="Work week" detail="Tickets, PRs and the Hit rate" />
      <PillarBars end={goalsViewEnd(now)} />
      <TextInput
        aria-label="Search notes"
        placeholder="Search notes"
        className={INPUT_CLASS}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />
      {shown.map(({ heading, links }) => (
        <Section key={heading} title={heading}>
          {links.length > 0 ? (
            links.map((link) => (
              <NavRow
                key={link.label}
                href={link.href}
                label={link.label}
                detail={link.detail}
                className={query === "" ? depthPadding(link.depth) : undefined}
              />
            ))
          ) : (
            <Text variant="muted">Nothing here yet.</Text>
          )}
        </Section>
      ))}
      {sections.length < 4 ? (
        <Text variant="muted">
          {isOnline ? "Loading notes…" : "Some notes are not on this device yet."}
        </Text>
      ) : null}
      {query !== "" && shown.length === 0 ? <Text variant="muted">No notes match.</Text> : null}
    </Screen>
  );
}
