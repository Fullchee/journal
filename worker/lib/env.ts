export type SqlValue = string | number | null;

export interface D1Run {
  meta: { changes: number; last_row_id: number };
}

export interface D1Statement {
  run: () => Promise<D1Run>;
  /** Mirrors D1's own typing: the caller names the row shape its SELECT returns. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- D1 rows are untyped, so the caller states them
  all: <Row>() => Promise<{ results: Row[] }>;
}

/**
 * The slice of the Cloudflare D1 API the handlers use; test/helpers/d1.ts implements the same slice.
 * `batch` runs its statements in one transaction: one failure rolls them all back.
 */
export interface D1 {
  prepare: (sql: string) => { bind: (...args: SqlValue[]) => D1Statement };
  batch: (statements: D1Statement[]) => Promise<D1Run[]>;
}

/** R2 returns the object without a body when `onlyIf` fails, e.g. the viewer's cached copy is current. */
export interface R2Object {
  body?: ReadableStream;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
}

/** The slice of the Workers AI binding the handlers use. */
export interface Ai {
  run: (
    model: string,
    input: {
      messages: { role: "system" | "user" | "assistant"; content: string }[];
      response_format?: { type: "json_schema"; json_schema: Json };
    },
  ) => Promise<{ response?: string }>;
}

export interface Env {
  DB: D1;
  AI: Ai;
  ATTACHMENTS: {
    get: (key: string, options?: { onlyIf: Headers }) => Promise<R2Object | null>;
    put: (
      key: string,
      value: ArrayBuffer,
      options: { httpMetadata: { contentType: string } },
    ) => Promise<void>;
  };
  OWNER_EMAIL: string;
  /** The Access team host (e.g. "team.cloudflareaccess.com") that signs the JWT, and the comma-separated AUD tags of the Access apps whose tokens it trusts. */
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
  /** Personal API token for the Todoist REST API; a Worker secret. */
  TODOIST_TOKEN: string;
  DEV_EMAIL?: string;
  /** The Duration Habit each synced Hevy workout logs to; unset, the sync logs nothing (lib/hevy-sync.ts). */
  HEVY_HABIT?: string;
  /** Google Calendar secrets (#85); see lib/calendar.ts. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
  /** Google Health secrets, in their own Cloud project (#17); see lib/google-health.ts. */
  GOOGLE_HEALTH_CLIENT_ID?: string;
  GOOGLE_HEALTH_CLIENT_SECRET?: string;
  GOOGLE_HEALTH_REFRESH_TOKEN?: string;
}

/** `Param` names the route's dynamic segments, e.g. "path" for [[path]]. */
export interface PagesContext<Param extends string = never> {
  request: Request;
  env: Env;
  params: Partial<Record<Param, string | string[]>>;
}

export interface Viewer {
  email: string | null;
}

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };
