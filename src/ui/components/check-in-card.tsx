import {
  LEVELS,
  ZONES,
  doingSpan,
  draftOf,
  patchForFields,
  blankCheckIn,
  instantOfWhen,
  whenOf,
  zoneOf,
  type CheckIn,
  type CheckInDraft,
  type CheckInPatch,
  type EditField,
  type LogEntry,
  type PartRef,
  type Zone,
} from "@/core";
import * as React from "react";
import { Platform, Pressable, View, useWindowDimensions } from "react-native";
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Pattern, Rect } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Button } from "./button";
import { CheckInFields, TimeInput, type NewPartSlot } from "./check-in-fields";
import { Text } from "./text";
import { cn } from "@/ui/lib/utils";

// Plates run Storm to Sun, left to right; within a plate the upper half sits on top.
const PLATES = ZONES.map((zone) => ({ zone, halves: LEVELS.filter((l) => l.zone === zone) }));

// Plates go in pairs, so a wrapped row is two by two, never three and one.
const PLATE_PAIRS = [PLATES.slice(0, 2), PLATES.slice(2)];

// The zone is picked on the plates, so the details hold the rest; Tense, Low and Tired are hardest to gauge, so last.
const DETAILS: EditField[] = ["place", "doing", "feelings", "note", "tense", "low", "tired"];

// From 150% text, four plates side by side leave each half too narrow for its label, so they stack two by two.
const GRID_FONT_SCALE = 1.5;

// Web text size scales rem, not fontScale, so there a pair wraps once two plates of 4rem (a half label's width) no longer fit.
function pairClass(isGrid: boolean) {
  if (Platform.OS === "web") return "grow basis-[8.75rem]";

  return isGrid ? "basis-full" : "flex-1";
}

const levelName = (score: number) =>
  `${zoneOf(score)} (${LEVELS.find((l) => l.score === score)?.half})`;

const CLOUD = "M15 34h30a8 8 0 0 0 0-16 11 11 0 0 0-21-3 9 9 0 0 0-9 19z";

const SUN_RAYS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6;
  const end = i % 2 === 0 ? 21 : 17;

  return {
    x1: 30 + Math.cos(a) * 13,
    y1: 24 + Math.sin(a) * 13,
    x2: 30 + Math.cos(a) * end,
    y2: 24 + Math.sin(a) * end,
  };
});

// Line engravings of the four zones, ported from the web app; hatching stands in for the plate's tone.
function ZoneEngraving({ zone, color }: { zone: Zone; color: string }) {
  const id = React.useId();
  const hatch = `hatch${id}`;
  const cross = `cross${id}`;
  const clip = `clip${id}`;

  return (
    <Svg
      viewBox="0 0 60 48"
      width={80}
      height={64}
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      testID={`${zone} engraving`}
    >
      <Defs>
        <Pattern
          id={hatch}
          width={3}
          height={3}
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${zone === "Sun" ? 0 : 45})`}
        >
          <Line x1={0} y1={0} x2={0} y2={3} stroke={color} strokeWidth={0.7} />
        </Pattern>
        <Pattern
          id={cross}
          width={3}
          height={3}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <Line x1={0} y1={0} x2={0} y2={3} stroke={color} strokeWidth={0.7} />
        </Pattern>
        <ClipPath id={clip}>
          {zone === "Sun" ? <Rect x={0} y={25} width={60} height={23} /> : <Path d={CLOUD} />}
        </ClipPath>
      </Defs>
      {zone === "Sun" ? (
        <>
          <Circle cx={30} cy={24} r={9} fill={`url(#${hatch})`} strokeWidth={1.2} />
          <Circle
            cx={30}
            cy={24}
            r={9}
            fill={`url(#${cross})`}
            stroke="none"
            clipPath={`url(#${clip})`}
          />
          {SUN_RAYS.map((ray) => (
            <Line key={`${ray.x2},${ray.y2}`} {...ray} strokeWidth={1.1} />
          ))}
        </>
      ) : (
        <>
          {/* Tone deepens from Cloud to Storm: Cloud hatches its lower body, Rain adds a cross-hatched base, Storm cross-hatches it all. */}
          <G clipPath={`url(#${clip})`}>
            <Rect x={0} y={22} width={60} height={14} fill={`url(#${hatch})`} stroke="none" />
            {zone !== "Cloud" && (
              <Rect x={0} y={29} width={60} height={7} fill={`url(#${cross})`} stroke="none" />
            )}
            {zone === "Storm" && (
              <Rect x={0} y={0} width={60} height={36} fill={`url(#${cross})`} stroke="none" />
            )}
          </G>
          <Path d={CLOUD} strokeWidth={1.2} />
          {zone === "Rain" &&
            [18, 25, 32, 39].map((x) => (
              <Line key={x} x1={x} y1={38} x2={x - 3} y2={45} strokeWidth={1.1} />
            ))}
          {zone === "Storm" && <Path d="M31 35l-5 7h5l-3 6" strokeWidth={1.4} />}
        </>
      )}
    </Svg>
  );
}

interface ZonePlatesProps {
  /** The open Check-in's score, lit until the details close. */
  picked: number | undefined;
  /** The zone the Android widget asked for. */
  marked: Zone | undefined;
  onPick: (score: number) => void;
}

function ZonePlates({ picked, marked, onPick }: ZonePlatesProps) {
  // react-native-svg needs real colour strings, not `var(...)`, so tokens are read in JS.
  const [ink, onPrimary] = useCSSVariable(["--color-foreground", "--color-primary-foreground"]);
  const isGrid = useWindowDimensions().fontScale >= GRID_FONT_SCALE;

  return (
    <View testID="zone-plates" className="flex-row flex-wrap gap-2.5">
      {PLATE_PAIRS.map((pair) => (
        <View
          key={pair.map((plate) => plate.zone).join("-")}
          className={cn("flex-row gap-2.5", pairClass(isGrid))}
        >
          {pair.map((plate) => (
            <View key={plate.zone} className="flex-1 items-center gap-2">
              <View
                className={cn(
                  "border-border w-full overflow-hidden rounded-t-full border",
                  marked === plate.zone && "border-primary border-2",
                )}
              >
                {plate.halves.map((l) => {
                  const on = picked === l.score;

                  return (
                    <Pressable
                      key={l.score}
                      role="button"
                      aria-label={`${l.zone}, ${l.half} half`}
                      aria-pressed={on}
                      onPress={() => onPick(l.score)}
                      className={cn(
                        "items-center justify-end gap-0.5 px-1 py-2",
                        l.half === "upper" ? "min-h-28 pt-4" : "border-border min-h-12 border-t",
                        on ? "bg-primary" : "bg-card active:bg-accent",
                      )}
                    >
                      {l.half === "upper" && (
                        <ZoneEngraving zone={l.zone} color={String(on ? onPrimary : ink)} />
                      )}
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        maxFontSizeMultiplier={GRID_FONT_SCALE}
                        className={cn(
                          "font-label text-zone",
                          on ? "text-primary-foreground" : "text-muted-foreground",
                        )}
                      >
                        {l.half}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="font-label-bold">{plate.zone}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// The just-saved Check-in as the card knows it: the id its details save against, and its fields so far.
interface Open {
  id: string;
  saved: CheckIn;
  draft: CheckInDraft;
}

const opened = (id: string, score: number, checkedInAt: string): Open => {
  const saved = blankCheckIn(score, checkedInAt);

  return { id, saved, draft: draftOf(saved) };
};

// `when` is null for "Now".
const checkedInAtOf = (when: string | null) =>
  when === null ? new Date().toISOString() : instantOfWhen(when);

interface CheckInCardProps {
  /** Place options for the details, the defaults plus past places. */
  places: string[];
  /** Habit names offered for "What were you doing?" at a place. */
  habitNames: (place: string) => string[];
  /** IFS Parts offered for "What does it feel like?", by name. */
  partNames: PartRef[];
  /** "New part…" under "Who else is present?"; left out offline. */
  newPart?: NewPartSlot | undefined;
  /** Saves (or queues) a new Check-in at `checkedInAt` and returns the id its details save against. */
  onCheckIn: (score: number, checkedInAt: string) => string;
  onUpdate: (checkIn: string, patch: CheckInPatch) => void;
  /** "What were you doing?" also goes to the log box, with the times it started and ended. */
  onDoingSent?: (text: string, span: LogEntry) => void;
  /** The Place guess for a Check-in at `at`; left out offline. */
  guessPlace?: (at: string) => Promise<string | null>;
  /** The zone the Android widget asked for (`?zone=`); its plate stays marked until a half is picked. */
  zone?: Zone;
  offline?: boolean;
  /** Opens on a Check-in's details as though `score` had just been tapped. */
  defaultOpen?: { id: string; score: number };
  /** The owner's Check-in Streak, e.g. "Check-in Streak: 12 days · 2 Freezes". */
  streak?: string | undefined;
}

// The Storm to Sun capture: four zone plates of two halves each, then optional details.
function CheckInCard({
  places,
  habitNames,
  partNames,
  newPart,
  onCheckIn,
  onUpdate,
  onDoingSent,
  guessPlace,
  zone,
  offline = false,
  defaultOpen,
  streak,
}: CheckInCardProps) {
  const [open, setOpen] = React.useState<Open | null>(() =>
    defaultOpen ? opened(defaultOpen.id, defaultOpen.score, new Date().toISOString()) : null,
  );

  // The Check-in's time as picked, or null for now; it applies to the next tap and to the open Check-in's details.
  const [when, setWhen] = React.useState<string | null>(null);
  const [marked, setMarked] = React.useState(zone);
  const [status, setStatus] = React.useState("");

  // The Check-ins whose place the owner touched in the details; a guess never replaces that.
  const placePickedRef = React.useRef(new Set<string>());

  // Saved as soon as it lands, so "Not now" or leaving keeps it.
  const guess = async (id: string, at: string) => {
    const place = await guessPlace?.(at);

    if (place === undefined || place === null || place === "" || placePickedRef.current.has(id))
      return;
    onUpdate(id, { place });
    setOpen((o) =>
      o?.id === id ? { ...o, saved: { ...o.saved, place }, draft: { ...o.draft, place } } : o,
    );
  };

  // A second tap corrects the open Check-in rather than logging another.
  const pick = (score: number) => {
    setMarked(undefined);

    if (open) {
      if (open.saved.score === score) return;
      onUpdate(open.id, { score });
      setOpen({ ...open, saved: { ...open.saved, score }, draft: { ...open.draft, score } });
      setStatus(`Changed to ${levelName(score)}.`);

      return;
    }

    const checkedInAt = checkedInAtOf(when);
    const next = opened(onCheckIn(score, checkedInAt), score, checkedInAt);

    setOpen(next);
    setStatus(`Saved ${levelName(score)}.`);
    void guess(next.id, next.saved.checkedInAt);
  };

  const close = (message: string) => {
    setOpen(null);
    setWhen(null);
    setStatus(message);
  };

  // A time changed after the tap moves the open Check-in when its details are saved.
  const saveDetails = (o: Open) => {
    const patch = patchForFields(["time", ...DETAILS], o.saved, {
      ...o.draft,
      when: when ?? o.draft.when,
    });

    if (Object.keys(patch).length > 0) onUpdate(o.id, patch);

    if (patch.doing !== undefined && patch.doing !== "")
      onDoingSent?.(patch.doing, doingSpan({ ...o.draft, when: when ?? o.draft.when }));
    close("Saved.");
  };

  return (
    <View className="border-border bg-card gap-4 rounded-md border p-4">
      <Text aria-level={2} variant="headline">
        How&apos;s the weather?
      </Text>
      {streak !== undefined && <Text variant="muted">{streak}</Text>}
      <View role="group" aria-label="When?" className="gap-2">
        {when === null ? (
          <View className="flex-row items-center gap-2">
            <Text variant="muted">When?</Text>
            <Button
              size="sm"
              variant="outline"
              className="min-h-12"
              accessibilityLabel="Now, change the time"
              onPress={() => setWhen(whenOf(new Date()))}
            >
              <Text>Now</Text>
            </Button>
          </View>
        ) : (
          <>
            <Text variant="muted">When?</Text>
            <TimeInput when={when} onChange={setWhen} />
          </>
        )}
      </View>
      <ZonePlates picked={open?.saved.score} marked={marked} onPick={pick} />
      {offline && (
        <Text variant="muted">Offline: Check-ins save when you&apos;re back online.</Text>
      )}
      {status === "" ? null : <Text aria-live="polite">{status}</Text>}
      {open && (
        <View className="gap-4">
          <Text aria-level={3} variant="title">
            Add details <Text variant="muted">(all optional)</Text>
          </Text>
          <CheckInFields
            fields={DETAILS}
            draft={open.draft}
            places={places}
            habitNames={habitNames}
            partNames={partNames}
            newPart={newPart}
            logsDoing={onDoingSent !== undefined}
            onChange={(draft) => {
              if (draft.place !== open.draft.place) placePickedRef.current.add(open.id);
              setOpen({ ...open, draft });
            }}
          />
          <View className="flex-row flex-wrap gap-2">
            <Button className="min-h-12" onPress={() => saveDetails(open)}>
              <Text>Save details</Text>
            </Button>
            {/* "Skip" belongs to Habits; the Check-in is already saved, so this only leaves the details empty. */}
            <Button variant="outline" className="min-h-12" onPress={() => close("")}>
              <Text>Not now</Text>
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}

export { CheckInCard };

export type { CheckInCardProps };
