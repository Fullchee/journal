-- Screen time (#32): each device's screen-on minutes per Day. A device resends a Day to replace its row.
CREATE TABLE screen_time (
  device TEXT NOT NULL,
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  minutes INTEGER NOT NULL CHECK (minutes >= 0),
  PRIMARY KEY (device, day)
);

-- A Target may measure screen time. SQLite can't change a CHECK, so goal_targets is rebuilt; nothing references it.
CREATE TABLE goal_targets_new (
  goal_id INTEGER PRIMARY KEY REFERENCES goals (id) ON DELETE CASCADE,
  measure TEXT NOT NULL CHECK (measure IN ('times', 'minutes', 'intensity-minutes', 'sleep', 'screen-time')),
  number INTEGER CHECK (number > 0),
  direction TEXT NOT NULL DEFAULT 'minimum' CHECK (direction IN ('minimum', 'limit')),
  period TEXT NOT NULL CHECK (period IN ('week', 'month', 'deadline')),
  deadline TEXT CHECK (deadline GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  start TEXT NOT NULL CHECK (start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  reviewed_through TEXT,
  CHECK ((period = 'deadline') = (deadline IS NOT NULL))
);

INSERT INTO goal_targets_new SELECT * FROM goal_targets;

DROP TABLE goal_targets;

ALTER TABLE goal_targets_new RENAME TO goal_targets;
