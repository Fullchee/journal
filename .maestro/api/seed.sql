-- One Habit per gate action: check off Stretch, log minutes to Walk.
INSERT INTO habits (id, name, record, target_type, position) VALUES
  ('stretch', 'Stretch', 'check', 'daily', 0),
  ('walk', 'Walk', 'duration', 'daily', 1);
UPDATE habits SET target_minutes = 30 WHERE id = 'walk';
