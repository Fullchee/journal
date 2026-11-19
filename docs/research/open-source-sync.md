# Open-source sync engines on Cloudflare

Research for [#15](https://github.com/Fullchee/journal-native/issues/15). Builds on [#4](https://github.com/Fullchee/journal-native/issues/4) ([offline-sync.md](https://github.com/Fullchee/journal-native/blob/research/offline-sync/docs/research/offline-sync.md)). Sources checked 2026-11-07.

> **Update 2026-11-17**: the Garmin push is gone ([#135](https://github.com/Fullchee/journal-native/issues/135)). Fitbit data now reaches the app through Health Connect, filtered by `FITBIT_PACKAGE` in `src/core/fitbit-auto-complete.ts`. To switch back to Garmin, set that filter to Garmin Connect's package, `com.garmin.android.apps.connectmobile`. The Garmin parts below describe the removed push.

## Answer

**No open-source engine beats the hand-built `expo-sqlite` + command queue + `/api/sync`. Keep the #4 plan.**

- **None keeps D1 as the source of truth.** Every engine owns its own store: a Durable Object (TinyBase, LiveStore), a Node relay (Evolu), Postgres (InstantDB) or Turso Cloud. D1 becomes a copy, or goes away.
- **Server-side writes get harder.** The log box (Workers AI), Garmin push and Todoist import write rows on the server today. With an engine, each must write through the engine's store instead of D1.
- **TinyBase is the only full fit on paper.** MIT, free, Expo SQLite persister, browser persisters, and a Durable Object sync server. Cost: rewrite every `*-store.ts` against a `MergeableStore` and move the D1 data into a Durable Object.
- **LiveStore is the best design, but not usable yet.** Event sourcing matches the log box's "log this text" commands. But it is beta and its docs say "Expo Web is not currently supported."
- **The rest fail a hard requirement.** Paid storage (RxDB on Android), paid server (Dexie Cloud), no Expo storage (Jazz 2 alpha), no offline writes (Convex), stale (Triplit, cr-sqlite, SQLSync, PouchDB), or a non-Cloudflare server (Evolu, InstantDB, Turso).
- **Hand-building teaches more for work.** Queue, idempotent commands, `temp_id` mapping and change feeds carry over to any backend. An engine teaches that engine.

## Comparison

| Option                                               | Licence, fully free self-hosted?                                   | Offline writes                              | Expo Android / Expo web                                                         | Runs on Cloudflare?                                        | D1 data                                                                       | Maturity (Nov 2026)                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Hand-built** (#4, recommended)                     | Ours                                                               | Yes, command queue                          | `expo-sqlite` both (web: wasm + COOP/COEP)                                      | Yes: one Pages Function                                    | Stays source of truth                                                         | `expo-sqlite` is first-party                                       |
| **TinyBase**                                         | MIT, yes                                                           | Yes, CRDT merge (HLC, last write wins)      | Yes / yes (IndexedDB or sqlite-wasm persister)                                  | Yes: `WsServerDurableObject` in a separate Worker          | Moves into DO SQLite; D1 becomes a copy or is dropped                         | 10.0.1 (2026-09-24), 10.1 beta; one main maintainer; ~21k npm/week |
| **LiveStore**                                        | Apache-2.0, yes                                                    | Yes, local eventlog                         | Yes / **no**                                                                    | Yes: `@livestore/sync-cf`, eventlog in DO SQLite or D1     | D1 holds the eventlog, not your tables; existing data is replayed into events | 0.5.0 (2026-10-15), "beta"; ~2.9k/week for the Expo adapter        |
| **RxDB**                                             | Apache-2.0 core; SQLite and Expo storage are Premium (from $99/mo) | Yes                                         | Android needs Premium storage (free trial: 500 docs) / yes (free Dexie storage) | Partly: HTTP replication endpoints can be a Worker over D1 | Can stay in D1 (`updatedAt` checkpoints)                                      | 17.6.0 (2026-10-05); ~122k/week; one main maintainer               |
| **Evolu**                                            | MIT, yes                                                           | Yes                                         | Yes / yes                                                                       | No: Node relay (Docker); end-to-end encrypted              | Server can't read the data, so D1, Workers AI and readers lose access         | `@evolu/react-native` 16.2.3 (2026-11-04); one main maintainer     |
| **Jazz 2**                                           | MIT; sync cloud or self-hosted TS server                           | Yes                                         | "persistent … runtimes are not available in this alpha" / yes                   | No                                                         | Moves to Jazz                                                                 | 2.0.0-alpha (rc daily)                                             |
| **InstantDB**                                        | Apache-2.0; self-host means Clojure + Postgres                     | Partly: cached queries, queued transactions | Yes / yes                                                                       | No                                                         | Moves to Postgres                                                             | `@instantdb/react-native` 1.0.67 (2026-08-31)                      |
| **Turso sync**                                       | MIT client; sync targets Turso Cloud                               | Yes, "last push wins"                       | Yes / not documented                                                            | No                                                         | Moves to Turso                                                                | `@tursodatabase/sync-react-native` 0.8.3 (2026-10-12)              |
| **Yjs / Automerge** (+ `y-durableobjects`, PartyKit) | MIT, yes                                                           | Yes                                         | Yes / yes                                                                       | Yes: Durable Object per document                           | Document CRDTs, not tables; D1 becomes a copy                                 | yjs 13.6.33, automerge 3.5.0; `y-durableobjects` 1.0.5 (2025-08)   |
| **Dexie Cloud**                                      | Server is a paid licence                                           | Yes                                         | Not documented / yes                                                            | No                                                         | Moves to Dexie Cloud                                                          | addon 4.4.16                                                       |
| **Convex self-hosted**                               | FSL server                                                         | No: in-memory retry only                    | Yes / yes                                                                       | No                                                         | Moves to Convex                                                               | convex 1.49.0                                                      |
| **Triplit, cr-sqlite, SQLSync, PouchDB**             | Open source                                                        | Yes                                         | Mixed                                                                           | No (except SQLSync demo on Pages)                          | Moves                                                                         | Stale: last releases 2025-07, 2024-01, none, 2024-06               |

Already ruled out in #4 and unchanged: PowerSync, Electric, Zero, Replicache, Legend-State v3, WatermelonDB.

## The two serious candidates

### TinyBase

- **Sync server.** Extend `WsServerDurableObject`; persist with `DurableObjectSqlStoragePersister` ("Cloudflare recommends using SQLite storage"). Clients connect with `createWsSynchronizer` over WebSocket ([DO guide](https://tinybase.org/guides/integrations/cloudflare-durable-objects/)).
- **Pages fit.** Pages Functions can't define a Durable Object. The DO lives in its own Worker, bound from the Pages project (inference from Cloudflare's Pages bindings model, not tested).
- **Conflicts.** Each change gets "a timestamp, based on a hybrid logical clock (HLC), and a hash"; merge is "last write wins" ([MergeableStore guide](https://tinybase.org/guides/synchronization/using-a-mergeablestore/)).
- **Client storage.** `persister-expo-sqlite`, `persister-indexed-db`, `persister-sqlite-wasm` and MMKV exist in [src/persisters](https://github.com/tinyplex/tinybase/tree/main/src/persisters). No D1 persister.
- **Custom transport.** `createCustomSynchronizer` lets you build your own, so HTTP through Cloudflare Access is possible but hand-written ([using a synchronizer](https://tinybase.org/guides/synchronization/using-a-synchronizer/)).
- **Auth.** "Channel Ids are not an authorization boundary"; isolate clients by base path ([v9.3 notes](https://tinybase.org/guides/releases/)).
- **Limits.** JSON mode can hit the 2 MB DO row limit; use `{mode: 'fragmented'}`. v9.0 changed the fragmented layout with no rollback.
- **Log box.** No command concept. The device can't parse text offline, so it writes a "pending text" row and the server fills in the result later. Workable, but it is a command queue built on top.
- **Rewrite.** All 32 files in `journal/functions` (~3,900 lines) read and write D1 through `*-store.ts`. Each read moves to the DO store, or D1 is kept as a one-way copy that the DO writes after each merge.

### LiveStore

- **Model.** "LiveStore treats the local eventlog as the source of truth: state is derived from it" ([when to use](https://github.com/livestorejs/livestore/blob/main/docs/src/content/docs/overview/when-livestore.md)).
- **Cloudflare.** `@livestore/sync-cf`: a Worker routes by `storeId` to a Durable Object; events persist "in the Durable Object's own SQLite. You can optionally use Cloudflare D1 instead." WebSocket or HTTP transport ([Cloudflare provider](https://github.com/livestorejs/livestore/blob/main/docs/src/content/docs/sync-providers/cloudflare.mdx)).
- **Auth.** `syncPayload` or `forwardHeaders` (cookies) checked in `validatePayload` and again in `onPush`/`onPull` ([auth](https://github.com/livestorejs/livestore/blob/main/docs/src/content/docs/patterns/auth.mdx)).
- **Blockers.**
  - "Expo Web is not currently supported" ([Expo adapter](https://github.com/livestorejs/livestore/blob/main/docs/src/content/docs/platform-adapters/expo-adapter.mdx)).
  - "LiveStore is currently in **beta**"; minor releases can reset local data or change the sync backend's storage format ([state of the project](https://github.com/livestorejs/livestore/blob/main/docs/src/content/docs/misc/state-of-the-project.md)).
  - Not a fit when "You have an existing database which is the source of truth of your data" (same page as "when to use").
- **Worth stealing.** Named events (`checkInLogged`, `habitChecked`) are the same idea as Todoist commands. Use that naming in the hand-built queue.

## Why the others drop out

- **RxDB.** "This plugin is part of RxDB Premium" for the Expo Filesystem storage; the free SQLite trial "is limited to store 500 non-deleted documents" and "is not made for production" ([SQLite storage](https://rxdb.info/rx-storage-sqlite.html), [Premium](https://rxdb.info/premium/)). Its HTTP replication protocol (pull by `updatedAt` + `id` checkpoint, push with `assumedMasterState`, conflicts returned) is a good reference for the hand-built `/api/sync` ([HTTP replication](https://rxdb.info/replication-http.html)).
- **Evolu.** The relay "is the reference relay built on Node.js", run via npm or Docker ([relay README](https://github.com/evoluhq/evolu/tree/main/apps/relay)). Data is "End-to-end encrypted by default" ([docs](https://www.evolu.dev/docs)), so the server can't run Workers AI on it or serve the reader.
- **Jazz.** "this is the Jazz 2.0 alpha with an entirely new API"; Expo is a "binding scaffold (persistent and device-supported memory runtimes are not available in this alpha)" ([README](https://github.com/garden-co/jazz)).
- **InstantDB.** "A sync server written in Clojure talks to Postgres"; the client persists "a cache of recent queries to IndexedDB on web, and AsyncStorage in React Native" ([README](https://github.com/instantdb/instant)).
- **Turso.** "This particular usage uses the Turso Cloud to sync the local Turso databases" ([sync docs](https://docs.turso.tech/sync)). Not D1.
- **Dexie Cloud.** "on-premise licensed software with source included"; self-hosting needs a purchased licence ([own servers](https://dexie.org/cloud/docs/premium-software)).
- **Convex.** No offline write store; staff describe queued mutations as not "full offline support" (Convex Discord, secondary).
- **Stale.** Triplit's last npm release is 1.0.50 (2025-07-31). cr-sqlite's last release is v0.16.3 (2024-01-17), and TinyBase v10 removed its CR-SQLite persister. SQLSync has no releases; last push 2025-11. PouchDB 9.0.0 is from 2024-06 and needs CouchDB.
- **Yjs / Automerge.** Built for collaborative documents. Relational rows (check-ins, habits, connections) would live in maps inside one document, with no SQL queries.

## Repo and package facts

| Repo                                                              | Licence    | Last push  | Latest release                | Top contributor share       |
| ----------------------------------------------------------------- | ---------- | ---------- | ----------------------------- | --------------------------- |
| [tinyplex/tinybase](https://github.com/tinyplex/tinybase)         | MIT        | 2026-10-22 | v10.1.0-beta.1 (2026-10-22)   | jamesgpearce, ~99%          |
| [livestorejs/livestore](https://github.com/livestorejs/livestore) | Apache-2.0 | 2026-11-07 | v0.5.0 (2026-10-15)           | schickling, then 4 regulars |
| [pubkey/rxdb](https://github.com/pubkey/rxdb)                     | Apache-2.0 | 2026-11-07 | 17.6.0 (2026-10-05)           | pubkey, plus bots           |
| [evoluhq/evolu](https://github.com/evoluhq/evolu)                 | MIT        | 2026-11-05 | @evolu/web 3.7.1 (2026-11-04) | steida, ~90%                |
| [garden-co/jazz](https://github.com/garden-co/jazz)               | MIT        | 2026-11-07 | v2.0.0-alpha.60-rc.7          | team                        |

Source: GitHub REST API (`repos`, `releases`, `contributors`) and the npm registry, 2026-11-07.

## What this means for #11 (sync model)

- **Keep the #4 design.** D1 stays the source of truth; `journal/functions` gains one `/api/sync` and reuses `*-store.ts` as command handlers.
- **Borrow from RxDB.** Use an `(updated_at, id)` or `change_seq` checkpoint, and return conflicts as the server's current row.
- **Borrow from LiveStore.** Name queued commands as past-tense events in the domain's words.
- **Revisit when** LiveStore supports Expo web and reaches 1.0, or if D1 stops being a requirement (then TinyBase on a Durable Object is the cheapest switch).
