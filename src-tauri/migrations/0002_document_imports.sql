ALTER TABLE resumes ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN resume_change_notes TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_resumes_content_hash
  ON resumes(content_hash)
  WHERE content_hash <> '';
