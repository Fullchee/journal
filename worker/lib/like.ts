/** Escapes LIKE wildcards so user text matches literally; pair it with `LIKE ? ESCAPE '\'`. */
// oxlint-disable-next-line unicorn/prefer-string-raw -- String.raw here would nest one template literal inside another
export const like = (q: string) => `%${q.replaceAll(/[\\%_]/g, "\\$&")}%`;
