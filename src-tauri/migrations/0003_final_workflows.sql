ALTER TABLE resumes ADD COLUMN latex_text TEXT NOT NULL DEFAULT '';
ALTER TABLE cover_letter_templates ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE cover_letter_templates ADD COLUMN latex_text TEXT NOT NULL DEFAULT '';
ALTER TABLE cover_letters ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE cover_letters ADD COLUMN latex_text TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN ai_assessment TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN suggested_resume_text TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN selected_evidence_json TEXT NOT NULL DEFAULT '[]';

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('career_profile_summary', ''),
  ('ai_model', ''),
  ('tectonic_path', 'tectonic');

CREATE INDEX IF NOT EXISTS idx_cover_letter_templates_content_hash
  ON cover_letter_templates(content_hash)
  WHERE content_hash <> '';
CREATE INDEX IF NOT EXISTS idx_cover_letters_content_hash
  ON cover_letters(content_hash)
  WHERE content_hash <> '';
