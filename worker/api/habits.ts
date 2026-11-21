import {
  MISSED,
  RESCHEDULE_CAUSES,
  canFixStartDate,
  torontoDay,
  type Goal,
  type Habit,
} from "@/core";
import { authorize, authorizedBody } from "@worker/lib/auth";
import type { Env, PagesContext } from "@worker/lib/env";
import {
  applyReschedule,
  Note,
  readReschedules,
  RescheduleChange,
  UndoReschedule,
  undoReschedule,
} from "@worker/lib/habit-reschedules";
import {
  addDurations,
  applyWrite,
  clearCheck,
  DATE,
  deleteHabitRecords,
  HabitChange,
  HabitId,
  IsoDate,
  MAX_COUNT,
  insertHabit,
  newHabitId,
  readHabit,
  readHabits,
  readRecords,
  removeDurations,
  updateHabit,
  writeCheck,
  writeSkip,
} from "@worker/lib/habit-records";
import { json } from "@worker/lib/json";
import * as z from "zod/mini";

const Check = z.object({
  type: z.literal("check"),
  date: IsoDate,
  habit: HabitId,
  on: z.boolean(),
  count: z.optional(z.int()),
  // A Skip's cause rides on its Not done check, so one queued command carries both.
  cause: z.optional(z.enum(RESCHEDULE_CAUSES)),
  note: z.optional(Note),
});

const HabitEdit = z.extend(HabitChange, { type: z.literal("habit"), id: z.optional(HabitId) });

const DurationEntry = z.object({
  date: IsoDate,
  startTime: z.string().check(z.regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)),
  minutes: z.int().check(z.gte(1), z.lte(1440)),
});

const AddDuration = z.extend(DurationEntry, { type: z.literal("add-duration"), habit: HabitId });

// Daily workouts for over 13 years.
const MAX_IMPORTED_ENTRIES = 5000;

const ImportDurations = z.object({
  type: z.literal("import-durations"),
  habit: HabitId,
  entries: z.array(DurationEntry).check(z.minLength(1), z.maxLength(MAX_IMPORTED_ENTRIES)),
});

const Change = z.discriminatedUnion("type", [
  Check,
  HabitEdit,
  z.object({ type: z.literal("delete-habit"), id: HabitId }),
  z.object({ type: z.literal("delete-duration"), entry: z.int() }),
  AddDuration,
  ImportDurations,
  RescheduleChange,
  UndoReschedule,
]);

type Change = z.infer<typeof Change>;

// `true` when saved; a created Habit answers with its id instead, an import with how many entries it added.
type Applied = boolean | { id: string } | { added: number };

async function readGoals(env: Env) {
  const { results } = await env.DB.prepare("SELECT id, title, state FROM goals ORDER BY title")
    .bind()
    .all<Goal>();

  return results;
}

// Each page reads only the Habits it shows.
const VIEWS = new Map<string, (env: Env) => Promise<{ habits: Habit[]; goals?: Goal[] }>>([
  // The tracker's pickers and links can name any Habit, Backlog and Reference ones included.
  ["tracker", async (env) => ({ habits: await readHabits(env), goals: await readGoals(env) })],
  // The Android app schedules alarms from this list too.
  ["home", async (env) => ({ habits: await readHabits(env, "WHERE active = 1") })],
  ["library", async (env) => ({ habits: await readHabits(env, "WHERE target_type = 'none'") })],
]);

// `on: false` clears the Day; a MISSED count is a Skip, refused on a `duration` Habit unless it is Opt-out.
async function applyCheck(
  env: Env,
  { date, habit, on, count = 1, cause, note }: z.infer<typeof Check>,
) {
  if (count !== MISSED && (count < 1 || count > MAX_COUNT)) return false;

  if (!on) {
    await env.DB.batch(clearCheck(env.DB, { habit, date }));

    return true;
  }

  const write =
    count === MISSED
      ? writeSkip(env.DB, { habit, date, mode: "set", cause, note })
      : writeCheck(env.DB, { habit, date, count, mode: "set" });

  return (await applyWrite(env.DB, write)) > 0;
}

// Removes one entry of a `duration` Habit; false when no entry has that id.
async function applyDeleteDuration(env: Env, entry: number) {
  return (await applyWrite(env.DB, removeDurations(env.DB, { id: entry }))) > 0;
}

// Adds one entry to a `duration` Habit; false for any other Record style.
async function applyAddDuration(env: Env, { habit, ...entry }: z.infer<typeof AddDuration>) {
  return (await applyWrite(env.DB, addDurations(env.DB, habit, [entry], "owner"))) > 0;
}

// An entry whose date and start time the Habit already has is skipped, so a re-import adds only new workouts.
async function applyImportDurations(env: Env, { habit, entries }: z.infer<typeof ImportDurations>) {
  const { results } = await env.DB.prepare(
    "SELECT 1 FROM habits WHERE id = ? AND record = 'duration'",
  )
    .bind(habit)
    .all();

  if (results.length === 0) return false;

  return { added: await applyWrite(env.DB, addDurations(env.DB, habit, entries, "import")) };
}

// A replaced habit must be a `bad` habit; neither link may point at the habit itself.
async function areValidLinks(
  env: Env,
  { replaces, stackedAfter }: Pick<Habit, "replaces" | "stackedAfter">,
  id: string,
) {
  const links = [replaces, stackedAfter].filter((link) => link !== null);

  if (links.includes(id)) return false;

  if (links.length === 0) return true;

  const { results } = await env.DB.prepare(
    `SELECT id, kind FROM habits WHERE id IN (${links.map(() => "?").join(", ")})`,
  )
    .bind(...links)
    .all<{ id: string; kind: Habit["kind"] }>();

  const kinds = new Map(results.map((row) => [row.id, row.kind]));

  return (
    links.every((link) => kinds.has(link)) && (replaces === null || kinds.get(replaces) === "bad")
  );
}

// Every linked Goal must exist; the change is rejected otherwise.
async function validGoals(env: Env, goals: number[]) {
  if (goals.length === 0) return true;

  const { results } = await env.DB.prepare(
    `SELECT id FROM goals WHERE id IN (${goals.map(() => "?").join(", ")})`,
  )
    .bind(...goals)
    .all<{ id: number }>();

  return results.length === goals.length;
}

// An existing link keeps its note; a dropped one goes.
async function setGoals(env: Env, habit: string, goals: number[]) {
  const { results } = await env.DB.prepare("SELECT goal_id FROM goal_habits WHERE habit_id = ?")
    .bind(habit)
    .all<{ goal_id: number }>();

  const keep = new Set(goals);
  const drop = results.filter(({ goal_id: goalId }) => !keep.has(goalId));

  await Promise.all([
    ...drop.map(({ goal_id: goalId }) =>
      env.DB.prepare("DELETE FROM goal_habits WHERE habit_id = ? AND goal_id = ?")
        .bind(habit, goalId)
        .run(),
    ),
    ...goals.map((goalId) =>
      env.DB.prepare(
        "INSERT INTO goal_habits (goal_id, habit_id) VALUES (?, ?) ON CONFLICT (goal_id, habit_id) DO NOTHING",
      )
        .bind(goalId, habit)
        .run(),
    ),
  ]);
}

// A One-off moves through a Reschedule, which keeps the move for the Session brief; `canFixStartDate` says
// when a plain date fix hides no avoidance.
async function movesOneOff(env: Env, saved: Habit | undefined, habit: Pick<Habit, "startDate">) {
  if (saved?.target.type !== "once" || habit.startDate === saved.startDate) return false;

  const { results } = await env.DB.prepare(
    "SELECT 1 FROM habit_reschedules WHERE habit = ? LIMIT 1",
  )
    .bind(saved.id)
    .all();

  return !canFixStartDate(saved.startDate, results.length > 0, torontoDay(new Date()));
}

// A new Habit answers its generated id, so the client can log to it right away.
async function applyHabit(env: Env, change: z.infer<typeof HabitEdit>): Promise<Applied> {
  const { id: given } = change;
  const isNew = given === undefined;

  // An edit may name only the fields it changes; the rest keep their saved values.
  const [saved] = isNew ? [] : await readHabits(env, "WHERE id = ?", given);
  const habit = readHabit({ ...saved, ...change });

  if (habit === null || (await movesOneOff(env, saved, habit))) return false;
  const id = isNew ? newHabitId(habit.name) : given;

  if (!(await areValidLinks(env, habit, id)) || !(await validGoals(env, habit.goals))) return false;

  const save = isNew ? insertHabit : updateHabit;

  if (!(await save(env, { ...habit, id }))) return false;
  await setGoals(env, id, habit.goals);

  return isNew ? { id } : true;
}

async function applyDelete(env: Env, id: string) {
  await env.DB.prepare("UPDATE habits SET replaces = NULL WHERE replaces = ?").bind(id).run();
  await env.DB.prepare(
    "UPDATE habits SET stacked_after = NULL, cue_type = '' WHERE stacked_after = ?",
  )
    .bind(id)
    .run();
  await env.DB.prepare("DELETE FROM goal_habits WHERE habit_id = ?").bind(id).run();
  // A Circle that followed it keeps its members and Interactions as history.
  await env.DB.prepare("UPDATE circles SET habit_id = NULL, follows_from = NULL WHERE habit_id = ?")
    .bind(id)
    .run();
  await env.DB.batch(deleteHabitRecords(env.DB, id));
  await env.DB.prepare("DELETE FROM habit_reschedules WHERE habit = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM habit_calendar_links WHERE habit = ?").bind(id).run();
  const { meta } = await env.DB.prepare("DELETE FROM habits WHERE id = ?").bind(id).run();

  return meta.changes > 0;
}

// Returns false when the change is invalid; nothing is written then.
function applyChange(env: Env, change: Change): Promise<Applied> {
  switch (change.type) {
    case "check": {
      return applyCheck(env, change);
    }

    case "habit": {
      return applyHabit(env, change);
    }

    case "delete-habit": {
      return applyDelete(env, change.id);
    }

    case "delete-duration": {
      return applyDeleteDuration(env, change.entry);
    }

    case "add-duration": {
      return applyAddDuration(env, change);
    }

    case "import-durations": {
      return applyImportDurations(env, change);
    }

    case "reschedule": {
      return applyReschedule(env, change);
    }

    case "undo-reschedule": {
      return undoReschedule(env, change);
    }
  }
}

/**
 * `view` picks the Habits; `since` adds each count, duration entry and Skip cause from that date on, and every Reschedule.
 * `hevyHabit` names the Habit the phone logs Hevy workouts on; it is left out while the secret is unset.
 */
export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;

  const params = new URL(request.url).searchParams;
  const view = VIEWS.get(params.get("view") ?? "");
  const since = params.get("since");

  if (view === undefined || (since !== null && !DATE.test(since)))
    return json({ error: "bad query" }, 400);

  const body = { ...(await view(env)), hevyHabit: env.HEVY_HABIT };

  if (since === null) return json(body);

  const [{ counts, durations, skips }, reschedules] = await Promise.all([
    readRecords(env, since, new Date()),
    readReschedules(env),
  ]);

  return json({ ...body, counts, durations, reschedules, skips });
}

export async function onRequestPost({ request, env }: PagesContext) {
  const change = await authorizedBody({ request, env }, Change, "invalid change");

  if (change instanceof Response) return change;
  const applied = await applyChange(env, change);

  if (applied === false) return json({ error: "invalid change" }, 400);

  return applied === true ? new Response(null, { status: 204 }) : json(applied, 201);
}
