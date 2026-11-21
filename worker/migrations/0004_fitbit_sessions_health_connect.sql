-- Fitbit sessions now come from Health Connect on the phone (POST /api/fitbit-sessions), keyed on each record's id.
-- 0002's table held only Google Health API rows, whose sync never ran, so it is rebuilt rather than altered.
DROP TABLE fitbit_sessions;
-- `exercise_type` is Health Connect's ExerciseType code, e.g. 8 biking, 56 running, 79 walking.
-- `start_date` is the Toronto Day the session starts on; `distance_m` is null when Fitbit wrote no Distance during it.
CREATE TABLE fitbit_sessions (
  id TEXT PRIMARY KEY,
  exercise_type INTEGER NOT NULL,
  title TEXT,
  start_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_s REAL NOT NULL,
  distance_m REAL
);
CREATE INDEX fitbit_sessions_start_date ON fitbit_sessions (start_date);
