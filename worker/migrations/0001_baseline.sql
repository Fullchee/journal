-- The schema as of 0069. Earlier migrations were squashed into this one when the repo went public.

CREATE TABLE check_ins (
  id INTEGER PRIMARY KEY,
  checked_in_at TEXT NOT NULL,
  zone TEXT NOT NULL CHECK (zone IN ('Storm', 'Rain', 'Cloud', 'Sun')),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 8),
  note TEXT NOT NULL DEFAULT '', place TEXT NOT NULL DEFAULT '', thought TEXT NOT NULL DEFAULT '', latitude REAL CHECK (latitude BETWEEN -90 AND 90), longitude REAL CHECK (longitude BETWEEN -180 AND 180), doing TEXT NOT NULL DEFAULT '', client_id TEXT, self_in_control INTEGER NOT NULL DEFAULT 0 CHECK (self_in_control IN (0, 1)), tense_0_5 INTEGER CHECK (tense_0_5 BETWEEN 0 AND 5), low_0_5 INTEGER CHECK (low_0_5 BETWEEN 0 AND 5), tense INTEGER CHECK (tense BETWEEN 0 AND 2), low INTEGER CHECK (low BETWEEN 0 AND 2), tired INTEGER CHECK (tired BETWEEN 0 AND 2), pleasantness TEXT CHECK (pleasantness IN ('Pleasant', 'Unpleasant')), feeling_energy TEXT CHECK (feeling_energy IN ('High', 'Low')),
  CHECK (zone = CASE WHEN score <= 2 THEN 'Storm' WHEN score <= 4 THEN 'Rain' WHEN score <= 6 THEN 'Cloud' ELSE 'Sun' END)
);
CREATE TABLE habit_checks (
  date TEXT NOT NULL,
  habit TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (date, habit)
);
CREATE TABLE goals (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  why TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'achieved', 'retired')),
  since TEXT,
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
, card_order INTEGER, card_tag TEXT NOT NULL DEFAULT '', card_title TEXT NOT NULL DEFAULT '', card_summary TEXT NOT NULL DEFAULT '', parent_id INTEGER REFERENCES goals (id) ON DELETE SET NULL, pillar TEXT CHECK (pillar IN ('sleep', 'activity', 'connection', 'substances', 'stress', 'nutrition')));
CREATE TABLE "health_plan" (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE sleep (
  date TEXT PRIMARY KEY,
  sleep_start TEXT NOT NULL,
  sleep_end TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  sleep_score INTEGER
);
CREATE TABLE habits (
  id TEXT PRIMARY KEY CHECK (id GLOB '[a-z0-9-]*'),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  usual_when TEXT NOT NULL DEFAULT '',
  usual_where TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'seed' CHECK (stage IN ('seed', 'sprout', 'plant', 'tree')),
  target_days TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0
, kind TEXT NOT NULL DEFAULT 'good' CHECK (kind IN ('good', 'bad')), priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')), active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)), cue TEXT NOT NULL DEFAULT '', routine TEXT NOT NULL DEFAULT '', reward TEXT NOT NULL DEFAULT '', obstacles TEXT NOT NULL DEFAULT '[]', replaces TEXT REFERENCES habits (id), stacked_after TEXT REFERENCES habits (id), start_date TEXT NOT NULL DEFAULT '' CHECK (start_date = '' OR start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'), why TEXT NOT NULL DEFAULT '', cue_type TEXT NOT NULL DEFAULT '' CHECK (cue_type IN ('', 'stacked', 'location', 'time', 'emotion', 'people', 'action')), alarm_time TEXT CHECK (alarm_time GLOB '[0-2][0-9]:[0-5][0-9]'), alarm_kind TEXT NOT NULL DEFAULT 'alarm' CHECK (alarm_kind IN ('alarm', 'persistent')), record TEXT NOT NULL DEFAULT 'check' CHECK (record IN ('check', 'count', 'duration')), target_minutes INTEGER CHECK (target_minutes BETWEEN 1 AND 1440), auto_logged INTEGER NOT NULL DEFAULT 0, places TEXT NOT NULL DEFAULT '[]', opt_out_from TEXT, usual_minutes INTEGER, seasons TEXT NOT NULL DEFAULT '[]', season_quiet_until TEXT, target_type TEXT NOT NULL DEFAULT 'daily' CHECK (target_type IN ('daily', 'weekly', 'days', 'monthly', 'interval', 'none', 'once')), target_count INTEGER NOT NULL DEFAULT 7 CHECK (target_count BETWEEN 1 AND 31), tiny_version TEXT NOT NULL DEFAULT '');
CREATE TABLE goal_habits (
  goal_id INTEGER NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
  habit_id TEXT NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (goal_id, habit_id)
);
CREATE TABLE "health_records" (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE connections (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  cadence_days INTEGER CHECK (cadence_days IS NULL OR cadence_days > 0),
  follow_ups TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
, meetups TEXT NOT NULL DEFAULT '[]', grow_closer INTEGER NOT NULL DEFAULT 0, plan_checked_at TEXT, how_we_met TEXT NOT NULL DEFAULT '', contact_id TEXT, closeness TEXT NOT NULL DEFAULT '' CHECK (closeness IN ('', 'close', 'friend')), met_through_id INTEGER REFERENCES connections (id) ON DELETE SET NULL);
CREATE TABLE connection_dates (
  id INTEGER PRIMARY KEY,
  connection_id INTEGER NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  date TEXT NOT NULL,
  yearly INTEGER NOT NULL DEFAULT 1 CHECK (yearly IN (0, 1))
);
CREATE TABLE habit_durations (
  id INTEGER PRIMARY KEY,
  habit TEXT NOT NULL REFERENCES habits (id),
  date TEXT NOT NULL,
  start_time TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 1440)
, hevy_workout_id TEXT, calendar_event_id TEXT);
CREATE TABLE log_actions (
  id INTEGER PRIMARY KEY,
  text TEXT NOT NULL,
  applied TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  undone_at TEXT
);
CREATE TABLE activity (
  date TEXT PRIMARY KEY,
  steps INTEGER NOT NULL,
  moderate_min INTEGER,
  vigorous_min INTEGER,
  resting_hr INTEGER,
  avg_stress INTEGER
);
CREATE TABLE applied_requests (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE habit_reschedules (
  id INTEGER PRIMARY KEY,
  habit TEXT NOT NULL REFERENCES habits (id),
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  cause TEXT NOT NULL CHECK (cause IN ('outside', 'avoidance')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE workouts (
  activity_id INTEGER PRIMARY KEY,
  type_key TEXT NOT NULL,
  name TEXT NOT NULL,
  start_local TEXT NOT NULL,
  duration_s INTEGER NOT NULL,
  distance_m REAL,
  avg_hr INTEGER,
  calories INTEGER
);
CREATE TABLE habit_skips (
  habit TEXT NOT NULL REFERENCES habits (id),
  date TEXT NOT NULL,
  cause TEXT NOT NULL CHECK (cause IN ('outside', 'avoidance')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (habit, date)
);
CREATE TABLE "parts" (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (trim(name) <> '' AND lower(name) <> 'self'),
  role TEXT NOT NULL DEFAULT 'unknown' CHECK (role IN ('manager', 'firefighter', 'exile', 'protector', 'unknown')),
  wants TEXT NOT NULL DEFAULT '',
  fears TEXT NOT NULL DEFAULT '',
  felt_in TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  retired INTEGER NOT NULL DEFAULT 0 CHECK (retired IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE check_in_parts (
  check_in_id INTEGER NOT NULL REFERENCES check_ins (id) ON DELETE CASCADE,
  part_id INTEGER NOT NULL REFERENCES parts (id),
  in_control INTEGER NOT NULL DEFAULT 0 CHECK (in_control IN (0, 1)),
  PRIMARY KEY (check_in_id, part_id)
);
CREATE TABLE rest_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL CHECK (end_date >= start_date),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE circles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
, habit_id TEXT, follows_from TEXT);
CREATE TABLE connection_circles (
  connection_id INTEGER NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
  circle_id INTEGER NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
  PRIMARY KEY (connection_id, circle_id)
);
CREATE TABLE connection_links (
  connection_id INTEGER NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
  other_id INTEGER NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  PRIMARY KEY (connection_id, other_id),
  CHECK (connection_id < other_id)
);
CREATE TABLE interactions (
  id INTEGER PRIMARY KEY,
  day TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('in-person', 'call', 'message')),
  minutes INTEGER CHECK (minutes IS NULL OR (minutes > 0 AND kind = 'in-person')),
  note TEXT NOT NULL DEFAULT ''
, circle_id INTEGER REFERENCES circles (id));
CREATE TABLE interaction_connections (
  interaction_id INTEGER NOT NULL REFERENCES interactions (id) ON DELETE CASCADE,
  connection_id INTEGER NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
  PRIMARY KEY (interaction_id, connection_id)
);
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
CREATE TABLE hevy_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  expires_at TEXT
);
CREATE TABLE hevy_scan (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  scan_started_at TEXT,
  next_index INTEGER NOT NULL DEFAULT 0,
  finished_at TEXT
);
CREATE TABLE work_days (
  day TEXT PRIMARY KEY,
  anchor TEXT NOT NULL DEFAULT '',
  meeting_hours REAL CHECK (meeting_hours >= 0),
  felt INTEGER CHECK (felt BETWEEN 1 AND 3),
  prs_merged INTEGER CHECK (prs_merged >= 0),
  prs_opened INTEGER CHECK (prs_opened >= 0),
  reviews INTEGER CHECK (reviews >= 0),
  tickets_resolved INTEGER CHECK (tickets_resolved >= 0),
  points_resolved REAL CHECK (points_resolved >= 0),
  epics_closed INTEGER CHECK (epics_closed >= 0),
  day_off TEXT NOT NULL DEFAULT '',
  vacation_week TEXT NOT NULL DEFAULT '',
  included INTEGER CHECK (included IN (0, 1)));
CREATE TABLE tickets (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT ''
);
CREATE TABLE plans (
  day TEXT PRIMARY KEY,
  plan_date TEXT NOT NULL,
  written_at TEXT NOT NULL,
  planned_size INTEGER NOT NULL CHECK (planned_size >= 0),
  size_rule TEXT NOT NULL,
  scored_on TEXT,
  unplanned_done INTEGER CHECK (unplanned_done >= 0)
);
CREATE TABLE estimates (
  task_id TEXT PRIMARY KEY,
  completion_date TEXT NOT NULL,
  task_name TEXT NOT NULL,
  jira_key TEXT REFERENCES tickets (key),
  estimate TEXT NOT NULL DEFAULT '',
  actual TEXT NOT NULL DEFAULT '',
  blocker_type TEXT NOT NULL DEFAULT '',
  storm_to_sun INTEGER CHECK (storm_to_sun BETWEEN 1 AND 6),
  check_in_id INTEGER REFERENCES check_ins (id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE work_weeks (
  week TEXT PRIMARY KEY,
  tickets INTEGER CHECK (tickets >= 0),
  scenarios INTEGER CHECK (scenarios >= 0),
  median_cycle_hours REAL,
  median_pr_size REAL,
  reverts INTEGER CHECK (reverts >= 0),
  reopened INTEGER CHECK (reopened >= 0),
  reviews INTEGER CHECK (reviews >= 0),
  forecast TEXT NOT NULL DEFAULT '{}',
  raw_md TEXT NOT NULL DEFAULT ''
);
CREATE TABLE "reflections" (
  id INTEGER PRIMARY KEY,
  track TEXT NOT NULL DEFAULT 'growth' CHECK (track IN ('growth', 'work')),
  period_kind TEXT NOT NULL CHECK (period_kind IN ('week', 'month', 'quarter', 'year')),
  period TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (track, period)
);
CREATE TABLE pull_requests (
  ref TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  number INTEGER NOT NULL CHECK (number > 0),
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  ticket TEXT REFERENCES tickets (key),
  state TEXT CHECK (state IN ('merged', 'open', 'draft', 'wip', 'closed'))
);
CREATE TABLE code_reviews (
  day TEXT NOT NULL REFERENCES work_days (day) ON DELETE CASCADE,
  pr TEXT NOT NULL REFERENCES pull_requests (ref),
  position INTEGER NOT NULL CHECK (position >= 0),
  author TEXT NOT NULL,
  title TEXT NOT NULL,
  PRIMARY KEY (day, pr)
);
CREATE TABLE "plan_actions" (
  day TEXT NOT NULL REFERENCES plans (day) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL,
  ticket TEXT REFERENCES tickets (key),
  pr TEXT,
  url TEXT,
  if_time INTEGER NOT NULL CHECK (if_time IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('pending', 'done', 'missed', 'blocked')),
  PRIMARY KEY (day, id)
);
CREATE TABLE work_retros (
  period TEXT PRIMARY KEY,
  shipped TEXT,
  learning TEXT,
  values_in_action TEXT,
  goals TEXT
);
CREATE TABLE "work_entries" (
  id INTEGER PRIMARY KEY,
  week TEXT NOT NULL REFERENCES work_weeks (week) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  parent_id INTEGER REFERENCES "work_entries" (id) ON DELETE CASCADE,
  day TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('task', 'blocker', 'meeting', 'review', 'note', 'personal')),
  text TEXT NOT NULL,
  ticket TEXT REFERENCES tickets (key),
  pr TEXT REFERENCES pull_requests (ref),
  done INTEGER CHECK (done IN (0, 1)),
  UNIQUE (week, position)
);
CREATE TABLE habit_calendar_links (
  calendar_id TEXT NOT NULL,
  series_id TEXT NOT NULL,
  habit TEXT NOT NULL REFERENCES habits (id),
  summary TEXT NOT NULL,
  assume_done INTEGER NOT NULL CHECK (assume_done IN (0, 1)),
  own_calendar INTEGER NOT NULL CHECK (own_calendar IN (0, 1)),
  PRIMARY KEY (calendar_id, series_id)
);
CREATE TABLE evening_reviews (
  date TEXT PRIMARY KEY,
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX check_ins_checked_in_at ON check_ins (checked_in_at);
CREATE INDEX check_ins_latitude ON check_ins (latitude);
CREATE INDEX habit_durations_date ON habit_durations (date, habit);
CREATE UNIQUE INDEX check_ins_client_id ON check_ins (client_id);
CREATE INDEX habit_reschedules_habit ON habit_reschedules (habit, id);
CREATE INDEX goals_parent_id ON goals (parent_id);
CREATE INDEX workouts_start_local ON workouts (start_local);
CREATE UNIQUE INDEX check_in_parts_one_in_control ON check_in_parts (check_in_id) WHERE in_control = 1;
CREATE INDEX check_in_parts_by_part ON check_in_parts (part_id);
CREATE INDEX connection_links_other ON connection_links (other_id);
CREATE INDEX interaction_connections_connection ON interaction_connections (connection_id);
CREATE UNIQUE INDEX interactions_circle_day ON interactions (circle_id, day) WHERE circle_id IS NOT NULL;
CREATE INDEX hevy_workouts_index ON hevy_workouts ("index");
CREATE UNIQUE INDEX habit_durations_hevy_workout ON habit_durations (hevy_workout_id);
CREATE UNIQUE INDEX goals_pillar ON goals (pillar) WHERE pillar IS NOT NULL;
CREATE INDEX habit_calendar_links_habit ON habit_calendar_links (habit);
CREATE UNIQUE INDEX habit_durations_calendar_event ON habit_durations (calendar_event_id);
CREATE INDEX work_entries_parent_id ON work_entries (parent_id);
CREATE TRIGGER log_actions_undo_once BEFORE UPDATE OF undone_at ON log_actions
WHEN OLD.undone_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'log action already undone');
END;

-- The Hevy sync keeps its cursor in this one row.
INSERT INTO hevy_scan (id) VALUES (1);
