# Hevy official API sync

The app does not use Hevy's official public API (`api.hevyapp.com/v1`). A scheduled sync through Hevy's private web API is tracked in #136 instead.

## Why this is out of scope

Hevy's public API needs a paid Pro plan and an API key. The owner uses the free plan and won't pay for Pro.

The private web API that hevy.com calls is free and returns the same set detail; see `docs/research/hevy-data.md`. The daily cron (#136) stores each workout, and #137 logs each one as a Duration entry on the Habit the `HEVY_HABIT` Worker secret names (see `docs/config-identifiers.md`).

The Hevy CSV import is gone (#137). The sync's first run pages from index 0, so it loads the full history the CSV gave, and an entry the CSV already logged is linked to its workout instead of duplicated.

Revisit this if the owner moves to Hevy Pro: the official API has a documented events feed with deletes.

## Prior requests

- #70: "Push Hevy workouts into D1"
