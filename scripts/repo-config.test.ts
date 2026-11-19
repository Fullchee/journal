// Guards config values a routine command rewrites, so the failure names the reason instead of a far-off symptom.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as z from "zod/mini";

const Versions = z.optional(z.record(z.string(), z.string()));

const PackageJson = z.looseObject({
  scripts: Versions,
  dependencies: Versions,
  devDependencies: Versions,
});

const Web = z.object({ output: z.string() });

const AppJson = z.object({ expo: z.object({ web: Web }) });

const readJson = <T>(path: string, schema: z.ZodMiniType<T>): T =>
  schema.parse(JSON.parse(readFileSync(path, "utf8")));

const PACKAGES = ["package.json"];

test("bun run script names namespace with a colon, never a hyphen", () => {
  for (const path of PACKAGES) {
    const names = Object.keys(readJson(path, PackageJson).scripts ?? {});

    for (const name of names) {
      assert.doesNotMatch(
        name,
        /-/,
        `${path}: rename "${name}" to use a colon namespace (e.g. "lint:css")`,
      );
    }
  }
});

test("the typescript package stays the TS 6 alias that typescript-eslint needs", () => {
  for (const path of PACKAGES) {
    const { devDependencies, dependencies } = readJson(path, PackageJson);
    const version = devDependencies?.["typescript"] ?? dependencies?.["typescript"];

    if (version !== undefined) {
      assert.match(
        version,
        /^npm:@typescript\/typescript6@/,
        `${path}: typescript-eslint needs TS 6's API; root @typescript/native supplies TS 7's tsc. Never bun add typescript@7.`,
      );
    }
  }
});

test("web output stays single-page", () => {
  assert.equal(
    readJson("app.json", AppJson).expo.web.output,
    "single",
    "with server output, hydration keeps the server's default theme colours and phone layout",
  );
});
