-- A one-line note on what a Duration entry or a Habit check was spent on, so a broad Habit keeps the detail.
ALTER TABLE habit_durations ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE habit_checks ADD COLUMN note TEXT NOT NULL DEFAULT '';
