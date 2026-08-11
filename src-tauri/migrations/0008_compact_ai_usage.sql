CREATE TABLE IF NOT EXISTS ai_usage_totals (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  total_calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO ai_usage_totals (id, total_calls, input_tokens, output_tokens, total_tokens)
SELECT
  1,
  COUNT(*),
  COALESCE(SUM(input_tokens), 0),
  COALESCE(SUM(output_tokens), 0),
  COALESCE(SUM(total_tokens), 0)
FROM ai_usage;

DELETE FROM ai_usage
WHERE id NOT IN (
  SELECT id
  FROM ai_usage
  ORDER BY created_at DESC, rowid DESC
  LIMIT 10
);

CREATE TRIGGER IF NOT EXISTS ai_usage_after_insert
AFTER INSERT ON ai_usage
BEGIN
  INSERT INTO ai_usage_totals (id, total_calls, input_tokens, output_tokens, total_tokens)
  VALUES (1, 1, NEW.input_tokens, NEW.output_tokens, NEW.total_tokens)
  ON CONFLICT(id) DO UPDATE SET
    total_calls = total_calls + 1,
    input_tokens = input_tokens + NEW.input_tokens,
    output_tokens = output_tokens + NEW.output_tokens,
    total_tokens = total_tokens + NEW.total_tokens;

  DELETE FROM ai_usage
  WHERE id NOT IN (
    SELECT id
    FROM ai_usage
    ORDER BY created_at DESC, rowid DESC
    LIMIT 10
  );
END;
