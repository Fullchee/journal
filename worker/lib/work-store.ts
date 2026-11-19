import { authorizedBody, authorizeWriter } from "./auth";
import type { D1, D1Statement, PagesContext, SqlValue } from "./env";
import { json } from "./json";
import * as z from "zod/mini";

type WorkTable =
  | "work_days"
  | "plans"
  | "plan_actions"
  | "estimates"
  | "work_weeks"
  | "tickets"
  | "pull_requests"
  | "code_reviews"
  | "work_retros";

/** A parsed body row: its fields are the table's columns, and an omitted field is undefined. */
type WorkRow = Record<string, SqlValue | undefined>;

/** A Jira issue key, such as APP-135. */
export const TicketKey = z.string().check(z.regex(/^[A-Z][A-Z\d]*-\d+$/));

export const IsoWeek = z.string().check(z.regex(/^\d{4}-W\d{2}$/));

/** A field the source may leave null, and an import may omit to keep the stored value. */
export const keptUnlessSent = <Field extends z.ZodMiniType>(field: Field) =>
  z.optional(z.nullable(field));

export const NonNegative = z.number().check(z.gte(0));

export const Count = z.int().check(z.gte(0));

/** A daily or weekly count. */
export const WorkCount = keptUnlessSent(Count);

/** Every work import posts `{ rows }`, one or more of `row`. */
export function workRows<Row extends z.ZodMiniType>(row: Row) {
  const rows = z.array(row).check(z.minLength(1));

  return z.object({ rows });
}

/**
 * Upserts `row` into `table` on `key`. A field the row omits keeps its stored value, so two imports
 * (history-daily.csv and plan-log.jsonl) can each fill their own columns of one Work day.
 * Column names come from a zod-parsed body, which drops unknown keys, so they are safe to splice in.
 */
export function upsertRow(db: D1, table: WorkTable, key: readonly string[], row: WorkRow) {
  const fields = Object.entries(row).filter(
    (field): field is [string, SqlValue] => field[1] !== undefined,
  );

  const columns = fields.map(([column]) => column);

  const updates = columns
    .filter((column) => !key.includes(column))
    .map((column) => `${column} = excluded.${column}`);

  const onConflict = updates.length === 0 ? "NOTHING" : `UPDATE SET ${updates.join(", ")}`;

  return db
    .prepare(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})
        ON CONFLICT (${key.join(", ")}) DO ${onConflict}`,
    )
    .bind(...fields.map(([, value]) => value));
}

/** Plan actions and estimates name Tickets by key; this adds a bare row for each key not yet stored. */
export const addTickets = (db: D1, keys: Iterable<string | null>): D1Statement[] =>
  [...new Set(keys)].flatMap((key) =>
    key === null
      ? []
      : [db.prepare("INSERT INTO tickets (key) VALUES (?) ON CONFLICT DO NOTHING").bind(key)],
  );

/** Upserts each row of a `{ rows }` body into `table` on `key`; the message names the table when the body is invalid. */
export async function postWorkRows(
  { request, env }: PagesContext,
  row: z.ZodMiniType<WorkRow>,
  table: WorkTable,
  key: readonly string[],
) {
  const body = await authorizedBody(
    { request, env },
    workRows(row),
    `invalid ${table.replace("_", " ")}`,
    authorizeWriter,
  );

  if (body instanceof Response) return body;
  await env.DB.batch(body.rows.map((stored) => upsertRow(env.DB, table, key, stored)));

  return json({ upserted: body.rows.length });
}
