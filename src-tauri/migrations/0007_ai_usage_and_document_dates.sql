ALTER TABLE resumes ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE cover_letter_templates ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE cover_letters ADD COLUMN created_at TEXT NOT NULL DEFAULT '';

UPDATE resumes SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE created_at = '';
UPDATE cover_letter_templates SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE created_at = '';
UPDATE cover_letters SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE created_at = '';

CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  operation TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed')),
  error_message TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_operation ON ai_usage(operation);
