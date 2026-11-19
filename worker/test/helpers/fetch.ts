/** The URL a stubbed `fetch` was called with. */
export const urlOf = (input: RequestInfo | URL) =>
  input instanceof Request ? input.url : input.toString();

/** The body a stubbed `fetch` was sent, as text. */
export const sentText = (init: RequestInit | undefined) =>
  // SAFETY: the code under test sends JSON.stringify output or URLSearchParams, never a stream or blob.
  String(init?.body as string | URLSearchParams | null | undefined);
