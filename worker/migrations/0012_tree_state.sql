-- A Habit's Stage is read from its Strength now (ADR 0016, #34), so only the tree answers are stored: each span
-- as a tree and the Day the tree question may next show. A Habit stored as a tree stays one from today, a Toronto
-- day; every other Stage is dropped.
ALTER TABLE habits ADD COLUMN trees TEXT NOT NULL DEFAULT '[]';

ALTER TABLE habits ADD COLUMN tree_ask_from TEXT;

UPDATE habits SET trees = json_array(json_object('start', date('now', '-5 hours'), 'end', NULL)) WHERE stage = 'tree';

ALTER TABLE habits DROP COLUMN stage;
