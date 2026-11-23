import {
  KINDS,
  PRIORITIES,
  STAGES,
  TRACKED_TARGET_TYPES,
  type Habit,
  type Kind,
  type Priority,
  type RecordStyle,
  type Stage,
  type Target,
} from "./habits-view";

type LinkFilter = "" | "has" | "none";

/** Every filter is a string, so "" means unset. */
export interface HabitFilters {
  kind: Kind | "";
  stage: Stage | "";
  priority: Priority | "";
  active: "" | "yes" | "no";
  record: RecordStyle | "";
  targetType: Target["type"] | "";
  stackedAfter: LinkFilter;
  startFrom: string;
  startTo: string;
}

const blankFilters = (): HabitFilters => ({
  kind: "",
  stage: "",
  priority: "",
  active: "",
  record: "",
  targetType: "",
  stackedAfter: "",
  startFrom: "",
  startTo: "",
});

const matches = <T extends string>(filter: T | "", value: T) => filter === "" || value === filter;

const hasLink = (mode: LinkFilter, link: string | null) =>
  mode === "" || (mode === "has") === (link !== null);

// ISO dates compare as strings; a Habit with no start date never matches a date bound.
const inDateRange = (date: string, from: string, to: string) =>
  (from === "" && to === "") ||
  (date !== "" && (from === "" || date >= from) && (to === "" || date <= to));

export const filterHabits = (habits: Habit[], f: HabitFilters) =>
  habits.filter(
    (h) =>
      matches(f.kind, h.kind) &&
      matches(f.stage, h.stage) &&
      matches(f.priority, h.priority) &&
      (f.active === "" || h.active === (f.active === "yes")) &&
      matches(f.record, h.record) &&
      matches(f.targetType, h.target.type) &&
      hasLink(f.stackedAfter, h.stackedAfter) &&
      inDateRange(h.startDate, f.startFrom, f.startTo),
  );

type PickFilter = Exclude<keyof HabitFilters, "startFrom" | "startTo">;

const LINK_IDS = ["has", "none"] as const;

const PICK_IDS: Record<PickFilter, readonly string[]> = {
  kind: KINDS,
  active: ["yes", "no"],
  stage: STAGES.map((s) => s.id),
  priority: PRIORITIES.map((p) => p.id),
  targetType: TRACKED_TARGET_TYPES,
  record: ["check", "count"],
  stackedAfter: LINK_IDS,
};

const oneOf = <T extends string>(value: string | null, ids: readonly T[]) =>
  ids.find((id) => id === value) ?? "";

const isoParam = (value: string | null) =>
  value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";

/** Unknown or malformed values fall back to unset, so a stale link never hides every habit. */
export const filtersFromParams = (params: URLSearchParams): HabitFilters => ({
  ...blankFilters(),
  // SAFETY: oneOf only returns one of the option ids, so each pick holds its own key's values.
  ...(Object.fromEntries(
    Object.entries(PICK_IDS).map(([key, ids]) => [key, oneOf(params.get(key), ids)]),
  ) as Pick<HabitFilters, PickFilter>),
  startFrom: isoParam(params.get("startFrom")),
  startTo: isoParam(params.get("startTo")),
});
