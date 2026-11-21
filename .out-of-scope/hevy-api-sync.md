# Hevy API sync

The app reads no Hevy API: neither the official public API (`api.hevyapp.com/v1`) nor the private web API hevy.com calls. Hevy workouts reach their Habit through Health Connect on the phone; see `docs/research/hevy-data.md`.

## Why this is out of scope

- **Official API**: needs a paid Pro plan and an API key. The owner uses the free plan and won't pay for Pro.
- **Private web API**: a daily Worker sync used it (#136, #137) until 2026-11-20. It needed a refresh token copied by hand from hevy.com's cookies, could break without notice, and risked suspension for "unauthorized use". Health Connect gives what a Duration entry needs, start and end, with no token.

Health Connect gives no exercises, sets, reps or weight. Revisit this if the owner wants that detail or moves to Hevy Pro: the official API has a documented events feed with deletes.

## Prior requests

- #70: "Push Hevy workouts into D1"
