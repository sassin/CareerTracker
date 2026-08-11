CREATE TABLE IF NOT EXISTS work_arrangements (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO work_arrangements (id, name, sort_order) VALUES
  ('remote', 'Remote', 10),
  ('on-site', 'On-Site', 20),
  ('off-shore', 'Off-Shore', 30),
  ('hybrid', 'Hybrid', 40);

ALTER TABLE applications ADD COLUMN ai_user_prompt TEXT NOT NULL DEFAULT '';
