-- A Goal's optional Target (ADR 0015): one row per Goal at most. No number makes an open Target, shown as a trend.
CREATE TABLE goal_targets (
  goal_id INTEGER PRIMARY KEY REFERENCES goals (id) ON DELETE CASCADE,
  measure TEXT NOT NULL CHECK (measure IN ('times', 'minutes', 'intensity-minutes', 'sleep')),
  number INTEGER CHECK (number > 0),
  direction TEXT NOT NULL DEFAULT 'minimum' CHECK (direction IN ('minimum', 'limit')),
  period TEXT NOT NULL CHECK (period IN ('week', 'month', 'deadline')),
  deadline TEXT CHECK (deadline GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  start TEXT NOT NULL CHECK (start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  reviewed_through TEXT,
  CHECK ((period = 'deadline') = (deadline IS NOT NULL))
);

-- The Signal guidelines the Pillar bars held in code move into their Pillar Goals' Targets.
INSERT INTO goal_targets (goal_id, measure, number, period, start)
SELECT id, 'sleep', 420, 'week', date('now') FROM goals WHERE pillar = 'sleep';

INSERT INTO goal_targets (goal_id, measure, number, period, start)
SELECT id, 'intensity-minutes', 150, 'week', date('now') FROM goals WHERE pillar = 'activity';
