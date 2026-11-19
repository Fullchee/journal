import { authorize } from "@worker/lib/auth";
import type { PagesContext, SqlValue } from "@worker/lib/env";
import { PART_NAMES, readCheckIns } from "@worker/lib/check-in-store";
import { readHabits } from "@worker/lib/habit-records";
import { like } from "@worker/lib/like";

const CHECK_IN_TEXT = ["note", "doing", "thought", PART_NAMES, "place"];
const HABIT_TEXT = ["name", "description", "usual_where", "places"];

// An empty query matches every row. LIKE ignores case for ASCII letters only, so "école" misses "École".
function textFilter(columns: string[], q: string) {
  if (q === "") return { clause: "", args: [] };
  const args: SqlValue[] = columns.map(() => like(q));
  const likes = columns.map((c) => String.raw`${c} LIKE ? ESCAPE '\'`).join(" OR ");

  return { clause: `WHERE (${likes})`, args };
}

export async function onRequestGet({ request, env }: PagesContext) {
  const viewer = await authorize(request, env);

  if (viewer instanceof Response) return viewer;
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const c = textFilter(CHECK_IN_TEXT, q);
  const h = textFilter(HABIT_TEXT, q);

  const [habits, checkIns] = await Promise.all([
    readHabits(env, h.clause, ...h.args),
    readCheckIns(env, c.clause, ...c.args),
  ]);

  return Response.json(
    {
      habits,
      checkIns,
    },
    { headers: { "content-type": "application/json" } },
  );
}
