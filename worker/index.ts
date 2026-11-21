import * as activity from "@worker/api/activity";
import * as attachments from "@worker/api/attachments";
import * as calendarLinks from "@worker/api/calendar-links";
import * as checkIns from "@worker/api/check-ins";
import * as close from "@worker/api/close";
import * as circles from "@worker/api/circles";
import * as closeDraft from "@worker/api/close/draft";
import * as connections from "@worker/api/connections";
import * as eveningReview from "@worker/api/evening-review";
import * as fitbitSessions from "@worker/api/fitbit-sessions";
import * as habits from "@worker/api/habits";
import * as habitsDraft from "@worker/api/habits/draft";
import * as interactions from "@worker/api/interactions";
import * as interactionsDraft from "@worker/api/interactions/draft";
import * as logDraft from "@worker/api/log/draft";
import * as logEntries from "@worker/api/log/entries";
import * as logOneOff from "@worker/api/log/one-off";
import * as logUndo from "@worker/api/log/undo";
import * as me from "@worker/api/me";
import * as notes from "@worker/api/notes";
import * as parts from "@worker/api/parts";
import * as pillars from "@worker/api/pillars";
import * as planBlocks from "@worker/api/plan/blocks";
import * as planBusy from "@worker/api/plan/busy";
import * as planTasks from "@worker/api/plan/tasks";
import * as planTriage from "@worker/api/plan/triage";
import * as search from "@worker/api/search";
import * as sessionBrief from "@worker/api/session-brief";
import * as sessionBriefWindow from "@worker/api/session-brief-window";
import * as sleep from "@worker/api/sleep";
import * as streaks from "@worker/api/streaks";
import * as healthPlan from "@worker/api/health-plan";
import * as weeklyReview from "@worker/api/weekly-review";
import * as workDays from "@worker/api/work/days";
import * as workEstimates from "@worker/api/work/estimates";
import * as workPlans from "@worker/api/work/plans";
import * as workRetros from "@worker/api/work/retros";
import * as workTickets from "@worker/api/work/tickets";
import * as workWeeklyNotes from "@worker/api/work/weekly-notes";
import * as workWeeks from "@worker/api/work/weeks";
import * as workouts from "@worker/api/workouts";
import type { Env, PagesContext } from "@worker/lib/env";
import { confirmYesterday } from "@worker/lib/evening-review";
import { json } from "@worker/lib/json";

type Handler = (context: PagesContext<string>) => Promise<Response>;

type Params = PagesContext<string>["params"];

interface Route {
  pattern: RegExp;
  module: Partial<Record<string, Handler>>;
  /** Mirrors Pages Functions: `[name]` gives one segment, `[[name]]` the rest of the path as an array. */
  params?: (match: RegExpMatchArray) => Params;
}

const rest = (tail: string | undefined) => (tail === undefined ? [] : tail.split("/"));

// Every named group in these patterns is required, so each one matched.
const named = ({ groups }: RegExpMatchArray): Params => ({ ...groups });

// Pages Functions matched a static path before a dynamic one, so log/draft, log/entries and log/one-off come before log/:id/undo, and interactions/draft before interactions/:id.
const ROUTES: Route[] = [
  { pattern: /^\/api\/activity$/, module: activity },
  {
    pattern: /^\/api\/attachments(?:\/(.+))?$/,
    module: attachments,
    params: ([, tail]) => ({ path: rest(tail) }),
  },
  { pattern: /^\/api\/calendar-links$/, module: calendarLinks },
  { pattern: /^\/api\/check-ins$/, module: checkIns },
  {
    pattern: /^\/api\/close\/(?<kind>[^/]+)\/(?<period>[^/]+)$/,
    module: close,
    params: named,
  },
  {
    pattern: /^\/api\/close\/(?<kind>[^/]+)\/(?<period>[^/]+)\/draft$/,
    module: closeDraft,
    params: named,
  },
  {
    pattern: /^\/api\/circles(?:\/(.+))?$/,
    module: circles,
    params: ([, tail]) => ({ id: rest(tail) }),
  },
  {
    pattern: /^\/api\/connections(?:\/(.+))?$/,
    module: connections,
    params: ([, tail]) => ({ id: rest(tail) }),
  },
  { pattern: /^\/api\/evening-review$/, module: eveningReview },
  { pattern: /^\/api\/fitbit-sessions$/, module: fitbitSessions },
  { pattern: /^\/api\/interactions\/draft$/, module: interactionsDraft },
  {
    pattern: /^\/api\/interactions(?:\/(.+))?$/,
    module: interactions,
    params: ([, tail]) => ({ id: rest(tail) }),
  },
  { pattern: /^\/api\/habits$/, module: habits },
  { pattern: /^\/api\/habits\/draft$/, module: habitsDraft },
  { pattern: /^\/api\/log\/draft$/, module: logDraft },
  { pattern: /^\/api\/log\/entries$/, module: logEntries },
  { pattern: /^\/api\/log\/one-off$/, module: logOneOff },
  {
    pattern: /^\/api\/log\/(?<id>[^/]+)\/undo$/,
    module: logUndo,
    params: named,
  },
  { pattern: /^\/api\/me$/, module: me },
  {
    pattern: /^\/api\/notes\/(?<type>[^/]+)(?:\/(.+))?$/,
    module: notes,
    params: (match) => ({ ...named(match), id: rest(match[2]) }),
  },
  {
    pattern: /^\/api\/parts(?:\/(.+))?$/,
    module: parts,
    params: ([, tail]) => ({ id: rest(tail) }),
  },
  { pattern: /^\/api\/pillars$/, module: pillars },
  { pattern: /^\/api\/plan\/blocks$/, module: planBlocks },
  { pattern: /^\/api\/plan\/busy$/, module: planBusy },
  { pattern: /^\/api\/plan\/tasks$/, module: planTasks },
  { pattern: /^\/api\/plan\/triage$/, module: planTriage },
  { pattern: /^\/api\/search$/, module: search },
  { pattern: /^\/api\/session-brief$/, module: sessionBrief },
  { pattern: /^\/api\/session-brief-window$/, module: sessionBriefWindow },
  { pattern: /^\/api\/sleep$/, module: sleep },
  { pattern: /^\/api\/streaks$/, module: streaks },
  { pattern: /^\/api\/health-plan$/, module: healthPlan },
  { pattern: /^\/api\/weekly-review$/, module: weeklyReview },
  { pattern: /^\/api\/work\/days$/, module: workDays },
  { pattern: /^\/api\/work\/estimates$/, module: workEstimates },
  { pattern: /^\/api\/work\/plans$/, module: workPlans },
  { pattern: /^\/api\/work\/retros$/, module: workRetros },
  { pattern: /^\/api\/work\/tickets$/, module: workTickets },
  { pattern: /^\/api\/work\/weekly-notes$/, module: workWeeklyNotes },
  { pattern: /^\/api\/work\/weeks$/, module: workWeeks },
  { pattern: /^\/api\/workouts$/, module: workouts },
];

const handlerName = (method: string) =>
  `onRequest${method.charAt(0)}${method.slice(1).toLowerCase()}`;

// wrangler.jsonc runs this Worker only for /api/*; static assets serve every other path.
async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);

  for (const { pattern, module, params } of ROUTES) {
    const match = pattern.exec(pathname);

    if (match === null) continue;
    const handler = module[handlerName(request.method)];

    return handler === undefined
      ? json({ error: "method not allowed" }, 405)
      : handler({ request, env, params: params?.(match) ?? {} });
  }

  return json({ error: "not found" }, 404);
}

/** The slices of Cloudflare's ScheduledController and ExecutionContext the crons use. */
interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

interface ExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void;
}

/** wrangler.jsonc's only cron: the Evening review's next-morning pass. */
export const EVENING_REVIEW_CRON = "47 8 * * *";

function scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
  ctx.waitUntil(confirmYesterday(env, new Date(controller.scheduledTime)));
}

export default { fetch: route, scheduled };
