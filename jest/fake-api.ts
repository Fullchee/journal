// A fake server at the apiFetch seam. jest.mock must be hoisted per file, so each test file still declares
// `jest.mock('@/lib/api/api-fetch', () => ({ apiFetch: jest.fn() }))`; fakeApi then answers through that mock.
import { apiFetch } from "@/lib/api/api-fetch";

type ApiInit = NonNullable<Parameters<typeof apiFetch>[1]>;

export interface ApiRequest {
  /** The path as the app passed it, query included. */
  path: string;
  url: URL;
  method: NonNullable<ApiInit["method"]>;
  body: ApiInit["body"];
}

export type Write = Pick<ApiRequest, "path" | "method" | "body">;

/** A JSON body; JSON.stringify leaves out an undefined field, so one may be undefined. */
export type ResponseBody =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly ResponseBody[]
  | { readonly [key: string]: ResponseBody };

/** What a route answers with; one that throws makes apiFetch reject with that error. */
export type Respond = (request: ApiRequest) => ResponseBody;

const ORIGIN = "https://journal.test";

// `/api/habits?view=library` needs that param value, `/api/check-ins?at` only the key, and `/api/habits` any query.
function matches(route: string, url: URL) {
  const [pathname, query = ""] = route.split("?", 2);

  return (
    url.pathname === pathname &&
    [...new URLSearchParams(query)].every(([key, value]) =>
      value === "" ? url.searchParams.has(key) : url.searchParams.get(key) === value,
    )
  );
}

const specificity = (route: string) =>
  [...new URLSearchParams(route.split("?", 2)[1] ?? "")].length;

/**
 * Answers apiFetch from `routes`, keyed by path for a GET (`'/api/me'`) or by method and path for a write
 * (`'POST /api/habits'`). The route with the most query params wins. A GET with no route throws; a write with no
 * route answers undefined. Every write is recorded in `writes`, including one whose route throws.
 */
export function fakeApi(routes: Record<string, Respond> = {}) {
  const writes: Write[] = [];

  const table = Object.entries(routes)
    .map(([key, respond]) => {
      const [method, route] = key.includes(" ") ? key.split(" ", 2) : ["GET", key];

      return { method, route: route ?? key, respond };
    })
    .toSorted((a, b) => specificity(b.route) - specificity(a.route));

  jest.mocked(apiFetch).mockImplementation((path: string, init: ApiInit = {}) =>
    Promise.try(() => {
      const method = init.method ?? "GET";
      const url = new URL(path, ORIGIN);

      if (method !== "GET") writes.push({ path, method, body: init.body });

      const found = table.find((row) => row.method === method && matches(row.route, url));

      if (!found && method === "GET") throw new Error(`Unexpected GET ${path}`);

      return found?.respond({ path, url, method, body: init.body });
    }),
  );

  return { writes };
}

/** A route that answers `value`, or rejects with it when it is an Error. */
export const reply =
  (value: ResponseBody | Error): Respond =>
  () => {
    if (value instanceof Error) throw value;

    return value;
  };

/** Every call stays pending, as offline TanStack pauses a fetch and it never settles. */
export function pendingApi() {
  jest.mocked(apiFetch).mockImplementation(() => Promise.withResolvers<never>().promise);
}
