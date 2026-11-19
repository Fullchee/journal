import type * as z from "zod/mini";

import { API_BASE_URL } from "@/lib/api/config";
import { ApiError, ApiErrorBody, NetworkError } from "@/lib/api/errors";
import { authorize, recoverFromUnauthorized } from "@/lib/auth/auth";

interface ApiInit {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as raw bytes instead of `body`; the server reads the image type from content-type. */
  file?: { blob: Blob; type: string };
  signal?: AbortSignal;
}

const UNAUTHORIZED = 401;

const payloadOf = ({ body, file }: ApiInit): Pick<RequestInit, "headers" | "body"> => {
  if (file) return { headers: { "content-type": file.type }, body: file.blob };

  return body === undefined
    ? { headers: {} }
    : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
};

async function send(path: string, init: ApiInit) {
  const { method = "GET", signal } = init;

  const request = await authorize({
    method,
    ...(signal !== undefined && { signal }),
    ...payloadOf(init),
  });

  try {
    return await fetch(`${API_BASE_URL}${path}`, request);
  } catch (error) {
    throw new NetworkError(error);
  }
}

// A failed response's body isn't always JSON, or may be a proxy's JSON instead of journal's.
async function errorBody(res: Response): Promise<ApiErrorBody | null> {
  try {
    return ApiErrorBody.safeParse(await res.json()).data ?? null;
  } catch {
    return null;
  }
}

// Access answers a lapsed session with a 401 (bearer) or a redirect to its login page (cookie).
const isUnauthorized = (res: Response) =>
  res.status === UNAUTHORIZED || res.type === "opaqueredirect";

/**
 * Every API call goes through here: it adds the base URL and auth, and throws ApiError or NetworkError.
 * With a schema it returns the parsed body and throws a ZodError when the body doesn't match; without one it ignores the body.
 */
export async function apiFetch(path: string, init?: ApiInit): Promise<void>;
export async function apiFetch<S extends z.ZodMiniType>(
  path: string,
  init: ApiInit,
  schema: S,
): Promise<z.infer<S>>;
export async function apiFetch<S extends z.ZodMiniType>(
  path: string,
  init: ApiInit = {},
  schema?: S,
) {
  let res = await send(path, init);

  if (isUnauthorized(res) && (await recoverFromUnauthorized())) res = await send(path, init);

  if (!res.ok) throw new ApiError(res.status, await errorBody(res));

  return schema?.parse(await res.json());
}
