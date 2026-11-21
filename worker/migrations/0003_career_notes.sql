-- Career notes from work-log's career/ folder, keyed by their path there so a re-import upserts.
CREATE TABLE career_notes (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
