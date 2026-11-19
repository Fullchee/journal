import * as z from "zod/mini";

/** How the server explains a failure: a sentence in `error`, or a named calendar failure in `status`. */
export const ApiErrorBody = z.object({
  error: z.optional(z.string()),
  status: z.optional(z.string()),
});

export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

/** The server answered with a non-2xx status; `body` is its JSON when it sent any. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    super(`API returned HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** The request never got an answer: offline, DNS, a dropped connection or a CORS block. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("Network request failed", { cause });
    this.name = "NetworkError";
  }
}

/** Access rejected the refresh token, so only a new sign-in can get a token again. */
export class SignedOutError extends Error {
  constructor() {
    super("Signed out");
    this.name = "SignedOutError";
  }
}

const SERVER_ERROR = 500;

/** A 4xx means the request itself is wrong, so sending it again can't help. */
export const isRetryable = (error: Error) =>
  error instanceof NetworkError || (error instanceof ApiError && error.status >= SERVER_ERROR);
