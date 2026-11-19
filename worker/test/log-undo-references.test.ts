import assert from "node:assert/strict";
import { onRequestPost as postUndo } from "@worker/api/log/undo";
import { onRequestPost as postOneOff } from "@worker/api/log/one-off";
import type { Env } from "@worker/lib/env";
import { makeD1 } from "./helpers/d1";
import { apiRequest, makeEnv, OWNER } from "./helpers/env";
import { readJson } from "./helpers/json";

// Undo deletes a Habit the log box created; a row that references it must keep it, or D1's foreign key fails the whole Undo.
test("Undo's delete of a created Habit checks every foreign key to habits", async () => {
  const DB = makeD1();
  const sqls: string[] = [];

  const env: Env = {
    ...makeEnv(),
    DB: {
      ...DB,
      prepare: (sql) => {
        sqls.push(sql);

        return DB.prepare(sql);
      },
    },
  };

  const saved = await postOneOff({
    env,
    params: {},
    request: apiRequest("POST", "https://x/api/log/one-off", {
      email: OWNER,
      body: {
        text: "go portaging",
        one_off: { name: "Go portaging", date: "2099-06-01", why: "", usual_when: "" },
      },
    }),
  });

  const { action } = await readJson<{ action: number }>(saved);

  await postUndo({
    env,
    params: { id: String(action) },
    request: apiRequest("POST", `https://x/api/log/${action}/undo`, { email: OWNER }),
  });

  const createdHabitDelete = sqls.find((sql) => sql.startsWith("DELETE FROM habits"));

  const { results: references } = await DB.prepare(
    'SELECT m.name AS tbl, f."from" AS col FROM sqlite_master m, pragma_foreign_key_list(m.name) f ' +
      "WHERE m.type = 'table' AND f.\"table\" = 'habits'",
  )
    .bind()
    .all<{ tbl: string; col: string }>();

  assert.ok(references.length > 0);

  const unchecked = references.filter(
    ({ tbl, col }) =>
      !new RegExp(String.raw`SELECT 1 FROM ${tbl} WHERE [^)]*\b${col} = \?1`).test(
        createdHabitDelete ?? "",
      ),
  );

  assert.deepEqual(unchecked, []);
});
