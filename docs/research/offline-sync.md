# Offline sync for Expo (Android + web) over D1

Research for [#4](https://github.com/Fullchee/journal-native/issues/4). Sources checked 2026-11-07.

## Answer

**Hand-build it: `expo-sqlite` on the device, an outgoing command queue, and one Todoist-style `/api/sync` endpoint in `journal`.**

- **The hosted sync engines don't support D1 as a source.** PowerSync, Electric and Zero read from Postgres (PowerSync also MySQL, MongoDB, SQL Server). Using them means moving off D1.
- **Zero and Electric are not offline-first anyway.** Zero says outright it "doesn't support offline writes". Electric syncs reads only.
- **The other client libraries are stale or in beta.** Replicache is archived. Legend-State v3 is still beta. WatermelonDB's last release was April 2025, and its web adapter is LokiJS (last push 2023).
- **Todoist's protocol is small and fits a single-user D1 app.** You need a `sync_token`, commands with a `uuid` for idempotency, and `temp_id` for rows created offline. D1 `batch()` is one transaction, so a command batch applies all-or-nothing.
- **The log box needs commands, not row diffs.** Its text is parsed by Workers AI on the server, so offline it can only queue "log this text" and apply it later. Row-diff engines (WatermelonDB, Legend-State CRUD) don't model that.
- **TinyBase is the runner-up.** It has an `expo-sqlite` persister and a Durable Object sync server. But D1 would become a copy of a CRDT store, not the source of truth.

## Comparison

| Option                                        | Server it needs                                                           | D1 fit                               | Android + web                                                    | Maturity (Nov 2026)                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **expo-sqlite + command queue** (recommended) | Your own `/api/sync` (push commands, pull changes)                        | Native: D1 stays the source of truth | `expo-sqlite` on both; web uses wasm and needs COOP/COEP headers | `expo-sqlite` 57.0.4 for SDK 57; first-party Expo module                                     |
| **PowerSync**                                 | PowerSync Service + Postgres/MySQL/Mongo/SQL Server; your API for uploads | None. D1 isn't a source              | Yes. OP-SQLite on native, `@powersync/web` (OPFS/IDB) on web     | Active: RN 2.4.0, web 2.6.0 (2026-11-02). Free tier, Pro $49/mo, or self-hosted Open Edition |
| **Electric**                                  | Electric server reading Postgres                                          | None                                 | Read-path only; no write sync                                    | Active                                                                                       |
| **Zero**                                      | `zero-cache` + Postgres logical replication                               | None                                 | TypeScript clients; "not local-first"                            | Active, but no offline writes                                                                |
| **Replicache**                                | Your push/pull endpoints (any DB)                                         | Good in theory                       | Web-first, key-value                                             | Archived 2026-06-10, maintenance mode                                                        |
| **TinyBase**                                  | WebSocket synchronizer; Durable Object server available                   | Indirect: data lives in a DO, not D1 | `expo-sqlite` persister; browser persisters                      | 10.0.1 (2026-09-24); active                                                                  |
| **Legend-State `syncedCrud`**                 | Plain REST list/create/update/delete with `updated_at` + soft deletes     | Good                                 | MMKV / expo-sqlite / IndexedDB persist plugins                   | v3 still beta (3.0.0-beta.48, 2026-07); stable 2.1.15 is from 2024                           |
| **WatermelonDB**                              | Pull/push endpoints with `last_modified` + tombstones                     | Good                                 | Native JSI SQLite; web via LokiJS                                | 0.28.0 (2025-04); Expo needs a community config plugin                                       |

## How Todoist sync works

Source: [Todoist API v1, Sync](https://developer.todoist.com/api/v1/).

- **One endpoint.** `POST /api/v1/sync` both reads and writes.
- **Read.** Send `sync_token='*'` for a full sync. Save the returned `sync_token` and send it next time to get only changes. `full_sync` tells you which kind you got.
- **Write.** Send `commands`: each has a `type`, `args`, a `uuid` and, for creates, a `temp_id`. "Each command will be processed in the specified order."
- **Idempotency.** "Todoist will not execute a command that has same UUID as a previously executed command." Retries are safe.
- **Temp ids.** Later commands in the batch can reference a `temp_id`. The response's `temp_id_mapping` maps each one to the real id. Todoist's own apps show `tmp-` ids in the UI until sync returns.
- **Results.** `sync_status` maps each `uuid` to `"ok"` or an error object. Clients "should treat `400` command errors as a terminal signal and should not retry."
- **Conflicts.** The docs describe no merge logic. Commands apply in server arrival order, so the last write wins per field.
- **Limits.** 100 commands per request; 1,000 partial and 100 full syncs per user per 15 minutes; 1 MiB body.

## What the journal schema needs

Checked against `journal/migrations/0001`–`0030`.

- **Ids.** Most tables use `INTEGER PRIMARY KEY` (check-ins, goals, connections, health records, log actions). The device can't mint these offline. Pick one:
  - **`temp_id` + mapping**, as Todoist does. No primary-key migration, but the client rewrites queued commands and local rows after each push.
  - **Client-generated text ids** (UUIDv7). Simpler client, but every integer-keyed table and foreign key (`connection_dates`, `goal_habits`, `taggings`) needs a migration.
- **Natural keys already work.** `habit_checks (date, habit)`, `sleep`, `activity (date)` and text `habits.id` can be upserted offline as-is.
- **Change tracking.** Only some tables have `updated_at` (goals, reflections, connections, health records, health plan). `check_ins`, `habit_checks`, `sleep` and `activity` have none. The pull side needs a server-set change marker on every synced table. A single monotonic `change_seq` across tables makes a clean `sync_token`.
- **Deletes.** Nothing keeps tombstones today. Add a `deletions (table, id, change_seq)` table or soft-delete columns, or pulls never see deletes.
- **Idempotency.** Add an `applied_commands (uuid PRIMARY KEY)` table, written in the same D1 `batch()` as the command's effect.

## What the server provides (recommended path)

1. `POST /api/sync` with `{ sync_token, commands[] }`.
2. Apply each command's SQL plus its `applied_commands` row in one `db.batch()`. "Batched statements are SQL transactions" ([D1 docs](https://developers.cloudflare.com/d1/worker-api/d1-database/)).
3. Return `sync_status`, `temp_id_mapping`, the changed rows and deletions since the token, and a new `sync_token`.
4. Reuse the existing `*-store.ts` functions as command handlers; the commands map to what the REST routes already do.

## Web storage

- **expo-sqlite on web** runs "a prebuilt WebAssembly build of SQLite without full-text search (FTS)". It needs a Metro wasm config and the `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers for `SharedArrayBuffer` ([Expo SQLite docs](https://docs.expo.dev/versions/latest/sdk/sqlite/)).
- **On Cloudflare Pages**, set those headers in `_headers`. COEP `require-corp` blocks cross-origin images and fonts without CORP headers. R2 attachments served through `/api/attachments` are same-origin, so they are fine.
- **`addDatabaseChangeListener`** and the session/changeset API are listed for web too. Use the listener to re-render screens after a pull.
- **PowerSync's web VFS options** (for comparison): IndexedDB, OPFS cooperative sync, OPFS access-handle pool, OPFS WAL (Chromium only). OPFS is not available in Firefox or Safari private tabs ([PowerSync platforms](https://docs.powersync.com/resources/supported-platforms)).

## Per-option notes and sources

- **PowerSync.** Sources: Postgres 11+, MongoDB 6+, MySQL 5.7+, SQL Server (beta), Convex (alpha); no SQLite source ([platforms](https://docs.powersync.com/resources/supported-platforms)). Pricing: Free (2 GB synced, deactivates after inactivity), Pro from $49/mo, self-hosted Open Edition free ([pricing](https://www.powersync.com/pricing)). The Open Edition is a service you host yourself; it would not run inside Pages Functions (inference, not checked).
- **Electric.** "It syncs data out-of Postgres." "Electric does not do write-path sync." ([writes guide](https://electric.ax/docs/guides/writes)).
- **Zero.** Replicates Postgres into a SQLite replica in `zero-cache` via logical replication ([llms.txt](https://zero.rocicorp.dev/llms.txt)). "Zero doesn't support offline writes." "Zero is not local-first." ([when to use](https://zero.rocicorp.dev/docs/when-to-use)).
- **Replicache.** "Replicache is now in maintenance mode." "We have open-sourced the code and no longer charge for its use." ([replicache.dev](https://replicache.dev/)). The GitHub repo was archived 2026-06-10. Its push/pull and rebase model ([how it works](https://doc.replicache.dev/concepts/how-it-works)) is the same shape as the recommended queue.
- **TinyBase.** `MergeableStore` "records additional metadata as the data is changed so that potential conflicts can be reconciled" ([sync guide](https://tinybase.org/guides/synchronization/)). Durable Object sync is WebSocket-based via `WsServerDurableObject` ([DO guide](https://tinybase.org/guides/integrations/cloudflare-durable-objects/)). `ExpoSqlitePersister` exists ([persistence](https://tinybase.org/guides/persistence/database-persistence/)).
- **Legend-State.** `syncedCrud` with `changesSince: 'last-sync'` needs `updated_at` and soft deletes; `retrySync: true` persists pending changes ([CRUD](https://legendapp.com/open-source/state/v3/sync/crud/), [persist and sync](https://legendapp.com/open-source/state/v3/sync/persist-sync/)). Docs are marked "Beta version".
- **WatermelonDB.** Pull returns `changes` + `timestamp` since `lastPulledAt`; push "MUST be fully transactional" and must abort if a record changed after `lastPulledAt`; the server needs `last_modified` on every table and tombstones ([backend sync](https://watermelondb.dev/docs/Sync/Backend)). Expo setup relies on community config plugins.

## Open questions for #11 (sync model)

- **Ids:** `temp_id` mapping, or migrate integer ids to client text ids?
- **Conflicts:** last write wins per field (Todoist), or reject stale pushes (WatermelonDB)? Single user, two devices: last write wins is likely enough.
- **What syncs:** everything, or skip large read-only data (Library, Session brief) and fetch it online?
- **Auth:** how the Android app gets past Cloudflare Access (service token or Access login) is a separate question.
