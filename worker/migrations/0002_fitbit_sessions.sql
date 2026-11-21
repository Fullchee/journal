-- Exercise sessions the Fitbit watch recorded, from the Google Health API (worker/lib/fitbit-sessions.ts).
-- `name` is the data point's resource name, the API's only ID for it.
-- `distance_source` says where `distance_mm` came from: the session's metricsSummary, or the sum of its distance data points.
CREATE TABLE fitbit_sessions (
  name TEXT PRIMARY KEY,
  exercise_type TEXT NOT NULL,
  display_name TEXT,
  start_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  active_duration_s REAL,
  has_gps INTEGER CHECK (has_gps IN (0, 1)),
  distance_mm REAL,
  distance_source TEXT CHECK (distance_source IN ('summary', 'points')),
  synced_at TEXT NOT NULL,
  CHECK ((distance_mm IS NULL) = (distance_source IS NULL))
);
CREATE INDEX fitbit_sessions_start_date ON fitbit_sessions (start_date);
