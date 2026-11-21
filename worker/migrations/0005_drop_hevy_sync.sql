-- Hevy workouts now reach their Habit through Health Connect on the phone; the private-API sync and its tables are gone.
DROP INDEX habit_durations_hevy_workout;
ALTER TABLE habit_durations DROP COLUMN hevy_workout_id;
DROP TABLE hevy_sets;
DROP TABLE hevy_workouts;
DROP TABLE hevy_auth;
DROP TABLE hevy_scan;
