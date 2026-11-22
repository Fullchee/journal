-- The Worker's daily Hevy sync (worker/lib/hevy-sync.ts) keeps sets for the team challenge; Health Connect still logs "Lift weights".
CREATE TABLE hevy_workouts (
  id TEXT PRIMARY KEY,
  "index" INTEGER NOT NULL,
  title TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  description TEXT,
  updated_at TEXT,
  seen_at TEXT NOT NULL
);
CREATE INDEX hevy_workouts_index ON hevy_workouts ("index");
CREATE INDEX hevy_workouts_start_time ON hevy_workouts (start_time);
CREATE TABLE hevy_sets (
  workout_id TEXT NOT NULL REFERENCES hevy_workouts (id),
  exercise_index INTEGER NOT NULL,
  set_index INTEGER NOT NULL,
  exercise_title TEXT NOT NULL,
  exercise_template_id TEXT,
  exercise_notes TEXT,
  superset_id INTEGER,
  set_type TEXT NOT NULL,
  weight_kg REAL,
  reps INTEGER,
  rpe REAL,
  distance_m REAL,
  duration_s INTEGER,
  PRIMARY KEY (workout_id, exercise_index, set_index)
);
-- The owner seeds the one row with a refresh token; each refresh saves the rotated tokens here.
CREATE TABLE hevy_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  expires_at TEXT
);
-- The weekly full scan's cursor, resumed across runs.
CREATE TABLE hevy_scan (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  scan_started_at TEXT,
  next_index INTEGER NOT NULL DEFAULT 0,
  finished_at TEXT
);
INSERT INTO hevy_scan (id) VALUES (1);
