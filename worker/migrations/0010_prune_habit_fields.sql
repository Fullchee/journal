-- Drops the Habit fields the habit research doesn't back (#33). Their text moves into `description` first, one
-- labelled list item per non-empty field, so nothing typed is lost.
UPDATE habits
SET description = CASE WHEN description = '' THEN kept.block ELSE description || char(10) || char(10) || kept.block END
FROM (
  SELECT id, substr(
    iif(why != '', char(10) || '- **Why:** ' || why, '') ||
    iif(cue != '', char(10) || '- **Cue:** ' || cue, '') ||
    iif(routine != '', char(10) || '- **Routine:** ' || routine, '') ||
    iif(reward != '', char(10) || '- **Reward:** ' || reward, '') ||
    iif(obstacles != '[]', char(10) || '- **Obstacles:** ' || (SELECT group_concat(value, '; ') FROM json_each(obstacles)), '') ||
    iif(usual_where != '', char(10) || '- **Usual spot:** ' || usual_where, ''),
    2
  ) AS block
  FROM habits
) AS kept
WHERE habits.id = kept.id AND kept.block != '';

-- SQLite can't drop `replaces` in place (a foreign key), so the table is rebuilt from a copy. Dropping it cascades
-- through goal_habits, so those rows are kept aside too. The other links are checked at commit, after the new
-- table holds every id again.
PRAGMA defer_foreign_keys = on;

CREATE TABLE habits_kept AS SELECT rowid AS row, id, name, description, usual_when, stage, target_days, position, kind, priority, active, stacked_after,
  start_date, cue_type, alarm_time, alarm_kind, record, target_minutes, auto_logged, places, opt_out_from,
  usual_minutes, seasons, season_quiet_until, target_type, target_count, tiny_version
FROM habits;

CREATE TABLE goal_habits_kept AS SELECT * FROM goal_habits;

DROP TABLE habits;

CREATE TABLE habits (
  id TEXT PRIMARY KEY CHECK (id GLOB '[a-z0-9-]*'),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  usual_when TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'seed' CHECK (stage IN ('seed', 'sprout', 'plant', 'tree')),
  target_days TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'good' CHECK (kind IN ('good', 'bad')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  stacked_after TEXT REFERENCES habits (id),
  start_date TEXT NOT NULL DEFAULT '' CHECK (start_date = '' OR start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  cue_type TEXT NOT NULL DEFAULT '' CHECK (cue_type IN ('', 'stacked', 'location', 'time', 'emotion', 'people', 'action')),
  alarm_time TEXT CHECK (alarm_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  alarm_kind TEXT NOT NULL DEFAULT 'alarm' CHECK (alarm_kind IN ('alarm', 'persistent')),
  record TEXT NOT NULL DEFAULT 'check' CHECK (record IN ('check', 'count', 'duration')),
  target_minutes INTEGER CHECK (target_minutes BETWEEN 1 AND 1440),
  auto_logged INTEGER NOT NULL DEFAULT 0,
  places TEXT NOT NULL DEFAULT '[]',
  opt_out_from TEXT,
  usual_minutes INTEGER,
  seasons TEXT NOT NULL DEFAULT '[]',
  season_quiet_until TEXT,
  target_type TEXT NOT NULL DEFAULT 'daily' CHECK (target_type IN ('daily', 'weekly', 'days', 'monthly', 'interval', 'none', 'once')),
  target_count INTEGER NOT NULL DEFAULT 7 CHECK (target_count BETWEEN 1 AND 31),
  tiny_version TEXT NOT NULL DEFAULT ''
);

INSERT INTO habits (
  rowid, id, name, description, usual_when, stage, target_days, position, kind, priority, active, stacked_after,
  start_date, cue_type, alarm_time, alarm_kind, record, target_minutes, auto_logged, places, opt_out_from,
  usual_minutes, seasons, season_quiet_until, target_type, target_count, tiny_version
)
SELECT
  row, id, name, description, usual_when, stage, target_days, position, kind, priority, active, stacked_after,
  start_date, cue_type, alarm_time, alarm_kind, record, target_minutes, auto_logged, places, opt_out_from,
  usual_minutes, seasons, season_quiet_until, target_type, target_count, tiny_version
FROM habits_kept;

DELETE FROM goal_habits;

INSERT INTO goal_habits SELECT * FROM goal_habits_kept;

DROP TABLE goal_habits_kept;

DROP TABLE habits_kept;
